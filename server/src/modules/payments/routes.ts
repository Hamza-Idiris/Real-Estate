import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Invoice, PaymentAttempt, PaymentTransaction } from './model';
import { Tenancy } from '../tenancies/model';
import { completeAttempt, initiatePayment, invoiceNumber, invoiceView, reverseTransaction } from './service';
import { MOCK_NOTICE } from '../../domain/mockPayments';
import { scopeFilter } from '../companies/scope';
import { requirePerm } from '../../middleware/auth';
import { audit } from '../audit/service';
import { ah, idParam, isoDate, objectId, oid, pageMeta, pageQuery, validate } from '../../utils/http';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { positiveMinorSchema } from '../../utils/money';
import { randomCode } from '../../utils/ids';

const payLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many payment requests' } } });
const idemHeader = (req: any) => {
  const k = String(req.get('idempotency-key') ?? '');
  if (!/^[A-Za-z0-9_\-:.]{8,100}$/.test(k)) throw badRequest('Idempotency-Key header (8-100 chars) is required', 'IDEMPOTENCY_KEY_REQUIRED');
  return k;
};
const payBody = z.object({ amountMinor: positiveMinorSchema.optional(), scenario: z.enum(['success', 'failure', 'pending']).default('success') }).strict();
const withNotice = (o: any) => ({ ...o, environment: 'MOCK', notice: MOCK_NOTICE });

/* ================= TENANT ================= */
export const myInvoiceRoutes = Router();
myInvoiceRoutes.get('/', validate({ query: pageQuery.extend({ tenancyId: objectId.optional(), status: z.enum(['issued', 'partially_paid', 'paid', 'void']).optional() }) }), ah(async (req, res) => {
  const { page, limit, tenancyId, status } = req.query;
  const f: any = { tenantId: oid(req.user.id) }; if (tenancyId) f.tenancyId = oid(tenancyId); if (status) f.status = status;
  const [data, total] = await Promise.all([Invoice.find(f).sort({ dueDate: -1 }).skip((page - 1) * limit).limit(limit).lean(), Invoice.countDocuments(f)]);
  res.json({ data: data.map(invoiceView), meta: pageMeta(page, limit, total) });
}));
myInvoiceRoutes.get('/:id', validate({ params: idParam }), ah(async (req, res) => {
  const inv: any = await Invoice.findOne({ _id: req.params.id, tenantId: oid(req.user.id) }).lean();
  if (!inv) throw notFound('Invoice');
  const transactions = await PaymentTransaction.find({ invoiceId: inv._id }).select('-companyId').sort({ createdAt: 1 }).lean();
  res.json({ data: { ...invoiceView(inv), transactions: transactions.map(withNotice) } });
}));
myInvoiceRoutes.post('/:id/payments', payLimiter, validate({ params: idParam, body: payBody }), ah(async (req, res) => {
  const key = idemHeader(req);
  const inv: any = await Invoice.findOne({ _id: req.params.id, tenantId: oid(req.user.id) }).lean();
  if (!inv) throw notFound('Invoice');
  const t: any = await Tenancy.findById(inv.tenancyId).select('status').lean();
  if (!t || !['pending', 'active'].includes(t.status)) throw conflict('This lease is not payable', 'INVOICE_NOT_PAYABLE');
  const { attempt, replayed } = await initiatePayment({ invoice: inv, actorId: req.user.id, role: 'tenant', amountMinor: req.body.amountMinor, scenario: req.body.scenario, idempotencyKey: key });
  res.status(replayed ? 200 : 201).json({ data: withNotice(attempt), replayed });
}));

export const myPaymentRoutes = Router();
myPaymentRoutes.get('/', validate({ query: pageQuery }), ah(async (req, res) => {
  const { page, limit } = req.query; const f = { tenantId: oid(req.user.id), voided: false };
  const [data, total] = await Promise.all([PaymentTransaction.find(f).select('-companyId').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), PaymentTransaction.countDocuments(f)]);
  res.json({ data: data.map(withNotice), meta: pageMeta(page, limit, total) });
}));
myPaymentRoutes.get('/transactions/:id/receipt', validate({ params: idParam }), ah(async (req, res) => {
  const tx: any = await PaymentTransaction.findOne({ _id: req.params.id, tenantId: oid(req.user.id), type: 'payment', voided: false }).lean();
  if (!tx) throw notFound('Transaction');
  const inv: any = await Invoice.findById(tx.invoiceId).select('number type lineItems currency').lean();
  res.json({ data: { receiptFor: tx.reference, invoiceNumber: inv?.number, type: tx.invoiceType, amountMinor: tx.amountMinor, currency: tx.currency, paidAt: tx.createdAt, environment: 'MOCK', watermark: 'SIMULATED RECEIPT', notice: MOCK_NOTICE } });
}));
myPaymentRoutes.get('/attempts/:id', validate({ params: idParam }), ah(async (req, res) => {
  const a = await PaymentAttempt.findOne({ _id: req.params.id, tenantId: oid(req.user.id) }).lean();
  if (!a) throw notFound('Payment');
  res.json({ data: withNotice(a) });
}));
// Completion: the request carries NO status. The backend provider decides; repeated calls are idempotent.
myPaymentRoutes.post('/attempts/:id/complete', payLimiter, validate({ params: idParam }), ah(async (req, res) => {
  const a: any = await PaymentAttempt.findOne({ _id: req.params.id, tenantId: oid(req.user.id) }).lean();
  if (!a) throw notFound('Payment');
  const r = await completeAttempt(a);
  res.json({ data: { attempt: withNotice(r.attempt), transaction: r.transaction ? withNotice(r.transaction) : null, replayed: r.replayed } });
}));

/* ================= STAFF ================= */
export const invoiceRoutes = Router({ mergeParams: true });
invoiceRoutes.get('/', requirePerm('invoice.read'), validate({ query: pageQuery.extend({
  status: z.enum(['issued', 'partially_paid', 'paid', 'void', 'overdue']).optional(), type: z.enum(['rent', 'deposit', 'fee']).optional(),
  tenancyId: objectId.optional(), propertyId: objectId.optional(), from: isoDate.optional(), to: isoDate.optional(),
}) }), ah(async (req, res) => {
  const { page, limit, status, type, tenancyId, propertyId, from, to } = req.query;
  const f: any = await scopeFilter(req);
  if (status === 'overdue') { f.status = { $in: ['issued', 'partially_paid'] }; f.dueDate = { $lt: new Date() }; } else if (status) f.status = status;
  if (type) f.type = type; if (tenancyId) f.tenancyId = oid(tenancyId); if (propertyId) f.propertyId = oid(propertyId);
  if (from || to) f.dueDate = { ...(f.dueDate ?? {}), ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const [data, total] = await Promise.all([Invoice.find(f).populate('propertyId', 'title reference').sort({ dueDate: -1 }).skip((page - 1) * limit).limit(limit).lean(), Invoice.countDocuments(f)]);
  res.json({ data: data.map(invoiceView), meta: pageMeta(page, limit, total) });
}));
invoiceRoutes.get('/transactions', requirePerm('invoice.read'), validate({ query: pageQuery }), ah(async (req, res) => {
  const { page, limit } = req.query; const f = await scopeFilter(req);
  const [data, total] = await Promise.all([PaymentTransaction.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), PaymentTransaction.countDocuments(f)]);
  res.json({ data: data.map(withNotice), meta: pageMeta(page, limit, total) });
}));
invoiceRoutes.get('/:id', requirePerm('invoice.read'), validate({ params: idParam }), ah(async (req, res) => {
  const inv: any = await Invoice.findOne({ ...(await scopeFilter(req)), _id: req.params.id }).lean();
  if (!inv) throw notFound('Invoice');
  const [transactions, attempts] = await Promise.all([PaymentTransaction.find({ invoiceId: inv._id }).sort({ createdAt: 1 }).lean(), PaymentAttempt.find({ invoiceId: inv._id }).sort({ createdAt: 1 }).lean()]);
  res.json({ data: { ...invoiceView(inv), transactions: transactions.map(withNotice), attempts: attempts.map(withNotice) } });
}));
invoiceRoutes.post('/', requirePerm('invoice.manage'), validate({ body: z.object({ tenancyId: objectId, description: z.string().trim().min(2).max(200), amountMinor: positiveMinorSchema, dueDate: isoDate }).strict() }), ah(async (req, res) => {
  const t: any = await Tenancy.findOne({ ...(await scopeFilter(req)), _id: req.body.tenancyId, status: { $in: ['pending', 'active'] } }).lean();
  if (!t) throw notFound('Tenancy');
  const inv = await Invoice.create({ companyId: t.companyId, propertyId: t.propertyId, tenancyId: t._id, tenantId: t.tenantId, type: 'fee', key: `fee:custom:${randomCode(6)}`, number: invoiceNumber(), lineItems: [{ description: req.body.description, amountMinor: req.body.amountMinor }], totalMinor: req.body.amountMinor, currency: t.terms.currency, issueDate: new Date(), dueDate: req.body.dueDate });
  await audit(req, { action: 'invoice.create', entityType: 'Invoice', entityId: inv._id, meta: { amountMinor: req.body.amountMinor } });
  res.status(201).json({ data: invoiceView(inv.toObject()) });
}));
invoiceRoutes.post('/:id/void', requirePerm('invoice.manage'), validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(500) }).strict() }), ah(async (req, res) => {
  const inv: any = await Invoice.findOneAndUpdate({ ...(await scopeFilter(req)), _id: req.params.id, status: 'issued', paidMinor: 0 }, { status: 'void' }, { new: true }).lean();
  if (!inv) throw conflict('Only unpaid issued invoices can be voided', 'INVOICE_NOT_VOIDABLE');
  await audit(req, { action: 'invoice.void', entityType: 'Invoice', entityId: inv._id, meta: { reason: req.body.reason } });
  res.json({ data: invoiceView(inv) });
}));
// Staff may SIMULATE recording a payment (permission payment.record_mock). Still goes through the same backend completion logic.
invoiceRoutes.post('/:id/mock-payments', payLimiter, requirePerm('payment.record_mock'), validate({ params: idParam, body: payBody }), ah(async (req, res) => {
  const key = idemHeader(req);
  const inv: any = await Invoice.findOne({ ...(await scopeFilter(req)), _id: req.params.id }).lean();
  if (!inv) throw notFound('Invoice');
  const { attempt } = await initiatePayment({ invoice: inv, actorId: req.user.id, role: 'staff', amountMinor: req.body.amountMinor, scenario: req.body.scenario, idempotencyKey: key });
  const r = await completeAttempt(attempt);
  await audit(req, { action: 'payment.record_mock', entityType: 'Invoice', entityId: inv._id, meta: { amountMinor: attempt.amountMinor, status: r.attempt?.status } });
  res.status(201).json({ data: { attempt: withNotice(r.attempt), transaction: r.transaction ? withNotice(r.transaction) : null, replayed: r.replayed } });
}));
invoiceRoutes.post('/transactions/:id/reverse', requirePerm('payment.reverse'), validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(500) }).strict() }), ah(async (req, res) => {
  const rev = await reverseTransaction(req.company._id, req.params.id, req.user.id, req.body.reason);
  await audit(req, { action: 'payment.reverse', entityType: 'PaymentTransaction', entityId: rev._id, meta: { reason: req.body.reason, original: req.params.id } });
  res.status(201).json({ data: withNotice(rev) });
}));
