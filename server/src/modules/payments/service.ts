import { Invoice, PaymentAttempt, PaymentTransaction } from './model';
import { conflict, badRequest, notFound } from '../../utils/errors';
import { withTx } from '../../config/db';
import { mockProvider, MockScenario } from '../../domain/mockPayments';
import { effectiveInvoiceStatus, outstandingMinor } from '../../domain/schedule';
import { randomCode } from '../../utils/ids';
import { notifyStaff, notifyUsers } from '../notifications/service';
import { Property } from '../properties/model';

// To go live later: implement PaymentProvider (domain/mockPayments.ts) and replace this binding.
export const paymentProvider = mockProvider;
export const invoiceNumber = () => `INV-${new Date().getUTCFullYear()}-${randomCode(7)}`;
export const invoiceView = (i: any) => ({ ...i, effectiveStatus: effectiveInvoiceStatus(i), outstandingMinor: outstandingMinor(i) });

export async function initiatePayment(o: { invoice: any; actorId: string; role: 'tenant' | 'staff'; amountMinor?: number; scenario: MockScenario; idempotencyKey: string }) {
  const { invoice } = o;
  if (!['issued', 'partially_paid'].includes(invoice.status)) throw conflict('This invoice cannot be paid', 'INVOICE_NOT_PAYABLE');
  const due = outstandingMinor(invoice);
  const amount = o.amountMinor ?? due;
  if (amount <= 0 || amount > due) throw badRequest(`Amount must be between 1 and the outstanding balance (${due})`, 'INVALID_AMOUNT');
  const doc = {
    companyId: invoice.companyId, propertyId: invoice.propertyId, invoiceId: invoice._id, tenantId: invoice.tenantId, amountMinor: amount,
    currency: invoice.currency, scenario: o.scenario, reference: `${paymentProvider.newReference()}`, idempotencyKey: o.idempotencyKey,
    initiatedBy: o.actorId, initiatedByRole: o.role,
  };
  try {
    return { attempt: (await PaymentAttempt.create(doc)).toObject(), replayed: false };
  } catch (e: any) {
    if (e?.code !== 11000) throw e;
    const existing = await PaymentAttempt.findOne({ invoiceId: invoice._id, idempotencyKey: o.idempotencyKey }).lean();
    if (!existing) throw e;
    return { attempt: existing, replayed: true }; // same Idempotency-Key => same attempt, never a second one
  }
}

/** Applies an amount to an invoice atomically and only if it would not overpay. */
export function applyToInvoice(invoiceId: any, amountMinor: number) {
  return Invoice.findOneAndUpdate(
    { _id: invoiceId, status: { $in: ['issued', 'partially_paid'] }, $expr: { $lte: [{ $add: ['$paidMinor', amountMinor] }, '$totalMinor'] } },
    [
      { $set: { paidMinor: { $add: ['$paidMinor', amountMinor] } } },
      { $set: { status: { $cond: [{ $gte: ['$paidMinor', '$totalMinor'] }, 'paid', 'partially_paid'] } } },
    ],
    { new: true }
  ).lean();
}

/**
 * Backend-decided completion. The client never sends a status. Idempotent: repeated/concurrent calls yield ONE transaction
 * (unique attemptId index + `applied` flag claimed atomically).
 */
export async function completeAttempt(attempt: any) {
  const loadTx = () => PaymentTransaction.findOne({ attemptId: attempt._id, type: 'payment' }).lean();
  if (['succeeded', 'failed'].includes(attempt.status)) return { attempt, transaction: await loadTx(), replayed: true };

  const outcome = paymentProvider.resolve(attempt);
  if (outcome === 'pending') {
    const a = await PaymentAttempt.findOneAndUpdate({ _id: attempt._id, status: 'initiated' }, { status: 'pending' }, { new: true }).lean();
    return { attempt: a ?? (await PaymentAttempt.findById(attempt._id).lean()), transaction: null, replayed: false };
  }
  if (outcome === 'failed') {
    const a = await PaymentAttempt.findOneAndUpdate({ _id: attempt._id, status: { $in: ['initiated', 'pending'] } }, { status: 'failed', failureReason: 'MOCK_DECLINED' }, { new: true }).lean();
    await notifyUsers([attempt.tenantId], { type: 'payment.failed', title: 'Demo payment failed', body: 'Simulated payment — no money moved.', companyId: attempt.companyId, link: `/tenant/invoices/${attempt.invoiceId}` });
    return { attempt: a ?? (await PaymentAttempt.findById(attempt._id).lean()), transaction: null, replayed: !a };
  }

  const inv: any = await Invoice.findById(attempt.invoiceId).lean();
  if (!inv || outstandingMinor(inv) < attempt.amountMinor || !['issued', 'partially_paid'].includes(inv.status)) {
    const a = await PaymentAttempt.findOneAndUpdate({ _id: attempt._id, status: { $in: ['initiated', 'pending'] } }, { status: 'failed', failureReason: 'INVOICE_BALANCE_CHANGED' }, { new: true }).lean();
    throw conflict('The invoice balance changed; the simulated payment was not recorded', 'INVOICE_BALANCE_CHANGED');
  }
  const result = await withTx(async (session) => {
    let tx: any;
    try {
      [tx] = await PaymentTransaction.create([{
        companyId: attempt.companyId, propertyId: attempt.propertyId, tenancyId: inv.tenancyId, invoiceId: inv._id, invoiceType: inv.type, tenantId: attempt.tenantId,
        type: 'payment', attemptId: attempt._id, amountMinor: attempt.amountMinor, currency: attempt.currency, reference: attempt.reference.replace('MOCK-', 'MOCK-TX-'),
        recordedBy: attempt.initiatedBy,
      }], { session });
    } catch (e: any) {
      if (e?.code !== 11000) throw e;
      tx = await PaymentTransaction.findOne({ attemptId: attempt._id }).session(session ?? null);
    }
    const claimed = await PaymentTransaction.findOneAndUpdate({ _id: tx._id, applied: false }, { applied: true }, { new: true, session });
    if (claimed) {
      const updated = await applyToInvoice(inv._id, attempt.amountMinor);
      if (!updated) {
        await PaymentTransaction.updateOne({ _id: tx._id }, { voided: true, reason: 'INVOICE_BALANCE_CHANGED' }, { session });
        await PaymentAttempt.updateOne({ _id: attempt._id }, { status: 'failed', failureReason: 'INVOICE_BALANCE_CHANGED' }, { session });
        return { failed: true as const };
      }
    }
    const a = await PaymentAttempt.findOneAndUpdate({ _id: attempt._id }, { status: 'succeeded' }, { new: true, session }).lean();
    return { failed: false as const, attempt: a, transaction: tx.toObject ? tx.toObject() : tx, firstTime: !!claimed };
  });
  if (result.failed) throw conflict('The invoice balance changed; the simulated payment was not recorded', 'INVOICE_BALANCE_CHANGED');
  if (result.firstTime) {
    const prop: any = await Property.findById(attempt.propertyId).select('title branchId assignedStaffIds').lean();
    await notifyUsers([attempt.tenantId], { type: 'payment.succeeded', title: 'Demo payment recorded', body: 'Simulated payment — no real money transferred.', companyId: attempt.companyId, link: `/tenant/invoices/${attempt.invoiceId}` });
    await notifyStaff(attempt.companyId, 'invoice.read', prop, { type: 'payment.recorded', title: 'Simulated payment recorded', body: prop?.title, link: `/dashboard/invoices/${attempt.invoiceId}` });
  }
  return { attempt: result.attempt, transaction: result.transaction, replayed: !result.firstTime };
}

export async function reverseTransaction(companyId: any, txId: string, actorId: string, reason: string) {
  const tx: any = await PaymentTransaction.findOne({ _id: txId, companyId, type: 'payment', applied: true, voided: false }).lean();
  if (!tx) throw notFound('Transaction');
  let rev: any;
  try {
    rev = await PaymentTransaction.create({
      companyId, propertyId: tx.propertyId, tenancyId: tx.tenancyId, invoiceId: tx.invoiceId, invoiceType: tx.invoiceType, tenantId: tx.tenantId, type: 'reversal',
      reversesTransactionId: tx._id, amountMinor: tx.amountMinor, currency: tx.currency, reference: tx.reference.replace('MOCK-TX-', 'MOCK-REV-'), applied: true, recordedBy: actorId, reason,
    });
  } catch (e: any) {
    if (e?.code === 11000) throw conflict('This transaction was already reversed', 'ALREADY_REVERSED');
    throw e;
  }
  await Invoice.findOneAndUpdate({ _id: tx.invoiceId, status: { $ne: 'void' } }, [
    { $set: { paidMinor: { $max: [0, { $subtract: ['$paidMinor', tx.amountMinor] }] } } },
    { $set: { status: { $cond: [{ $gte: ['$paidMinor', '$totalMinor'] }, 'paid', { $cond: [{ $gt: ['$paidMinor', 0] }, 'partially_paid', 'issued'] }] } } },
  ]);
  await notifyUsers([tx.tenantId], { type: 'payment.reversed', title: 'Demo payment reversed', body: 'Simulated reversal — no real money moved.', companyId, link: `/tenant/invoices/${tx.invoiceId}` });
  return rev.toObject();
}
