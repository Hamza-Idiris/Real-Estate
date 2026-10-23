import { Router } from 'express';
import { z } from 'zod';
import { Tenancy } from './model';
import { RentalApplication } from '../applications/model';
import { Property } from '../properties/model';
import { Invoice, PaymentTransaction } from '../payments/model';
import { MaintenanceRequest } from '../maintenance/model';
import { Notification } from '../notifications/model';
import { User } from '../auth/model';
import { invoiceNumber, invoiceView } from '../payments/service';
import { getScopedProperty, scopeFilter } from '../companies/scope';
import { requirePerm } from '../../middleware/auth';
import { audit } from '../audit/service';
import { notifyUsers } from '../notifications/service';
import { withTx } from '../../config/db';
import { ah, idParam, isoDate, objectId, oid, pageMeta, pageQuery, validate } from '../../utils/http';
import { conflict, notFound, badRequest } from '../../utils/errors';
import { assertTransition, TENANCY_TRANSITIONS } from '../../domain/transitions';
import { generateSchedule, startOfUtcDay, addDaysUTC, outstandingMinor, effectiveInvoiceStatus } from '../../domain/schedule';
import { minorSchema, positiveMinorSchema } from '../../utils/money';
import { randomCode } from '../../utils/ids';

const termsSchema = z.object({
  startDate: isoDate, endDate: isoDate, rentMinor: positiveMinorSchema, frequency: z.enum(['monthly', 'quarterly', 'yearly']),
  dueDay: z.number().int().min(1).max(28).default(1), depositMinor: minorSchema.default(0),
  fees: z.array(z.object({ name: z.string().trim().min(1).max(80), amountMinor: positiveMinorSchema }).strict()).max(10).default([]),
  renewalTerms: z.string().trim().max(1000).optional(), noticeDays: z.number().int().min(0).max(180).default(30),
}).strict();

function normaliseTerms(t: any, currency: string) {
  const terms = { ...t, startDate: startOfUtcDay(t.startDate), endDate: startOfUtcDay(t.endDate), currency };
  generateSchedule(terms); // throws INVALID_TERM unless the term is a whole number of billing periods
  return terms;
}
async function createDepositInvoice(t: any) {
  if (!t.terms.depositMinor) return null;
  try {
    return await Invoice.create({
      companyId: t.companyId, propertyId: t.propertyId, tenancyId: t._id, tenantId: t.tenantId, type: 'deposit', key: 'deposit', number: invoiceNumber(),
      lineItems: [{ description: 'Security deposit (refundable; held as a liability, not income)', amountMinor: t.terms.depositMinor }], totalMinor: t.terms.depositMinor,
      currency: t.terms.currency, issueDate: new Date(), dueDate: t.terms.startDate,
    });
  } catch (e: any) { if (e?.code === 11000) return Invoice.findOne({ tenancyId: t._id, key: 'deposit' }).lean(); throw e; }
}
const view = (t: any) => ({ ...t });

/* ================= STAFF ================= */
export const tenancyRoutes = Router({ mergeParams: true });
const getT = async (req: any, id: string) => {
  const t: any = await Tenancy.findOne({ ...(await scopeFilter(req)), _id: id }).lean();
  if (!t) throw notFound('Tenancy');
  return t;
};
tenancyRoutes.get('/', requirePerm('tenant.read'), validate({ query: pageQuery.extend({ status: z.enum(['pending', 'active', 'expired', 'terminated', 'renewed']).optional(), propertyId: objectId.optional() }) }), ah(async (req, res) => {
  const { page, limit, status, propertyId } = req.query;
  const f: any = await scopeFilter(req); if (status) f.status = status; if (propertyId) f.propertyId = oid(propertyId);
  const [data, total] = await Promise.all([Tenancy.find(f).populate('propertyId', 'title reference').populate('tenantId', 'name email phone').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Tenancy.countDocuments(f)]);
  res.json({ data, meta: pageMeta(page, limit, total) });
}));
tenancyRoutes.get('/:id', requirePerm('tenant.read'), validate({ params: idParam }), ah(async (req, res) => {
  const t = await getT(req, req.params.id);
  const [tenant, invoices] = await Promise.all([User.findById(t.tenantId).select('name email phone').lean(), Invoice.find({ tenancyId: t._id }).sort({ dueDate: 1 }).lean()]);
  res.json({ data: { ...view(t), tenant, invoices: invoices.map(invoiceView) } });
}));

tenancyRoutes.post('/', requirePerm('lease.manage'), validate({ body: z.object({ applicationId: objectId, terms: termsSchema }).strict() }), ah(async (req, res) => {
  const app: any = await RentalApplication.findOne({ ...(await scopeFilter(req)), _id: req.body.applicationId }).lean();
  if (!app) throw notFound('Application');
  if (app.status !== 'approved') throw conflict('Only approved applications can become leases', 'APPLICATION_NOT_APPROVED');
  const p = await getScopedProperty(req, String(app.propertyId));
  if (p.listingStatus === 'archived') throw conflict('Property is archived', 'ARCHIVED');
  const terms = normaliseTerms(req.body.terms, p.currency);
  try {
    const t: any = await Tenancy.create({
      companyId: req.company._id, propertyId: p._id, tenantId: app.applicantId, applicationId: app._id, terms,
      contract: { reference: `LC-${randomCode(8)}`, version: 1, generatedAt: new Date() },
    });
    await audit(req, { action: 'lease.create', entityType: 'Tenancy', entityId: t._id });
    await notifyUsers([app.applicantId], { type: 'lease.proposed', title: 'Lease proposed', body: `${p.title}: please review and accept the lease terms.`, link: `/tenant/leases/${t._id}`, companyId: req.company._id });
    res.status(201).json({ data: t });
  } catch (e: any) {
    if (e?.code === 11000) throw conflict('A lease already exists for this application', 'LEASE_EXISTS');
    throw e;
  }
}));

tenancyRoutes.patch('/:id/terms', requirePerm('lease.manage'), validate({ params: idParam, body: termsSchema }), ah(async (req, res) => {
  const t = await getT(req, req.params.id);
  if (t.status !== 'pending') throw conflict('Terms can only be edited while the lease is pending', 'NOT_PENDING');
  if (t.acceptance?.tenantAt || t.acceptance?.companyAt) throw conflict('Terms cannot change after any party accepted. Terminate and re-issue instead.', 'ALREADY_ACCEPTED');
  const u = await Tenancy.findOneAndUpdate({ _id: t._id, status: 'pending' }, { terms: normaliseTerms(req.body, t.terms.currency), $inc: { 'contract.version': 1 } }, { new: true }).lean();
  await audit(req, { action: 'lease.terms_update', entityType: 'Tenancy', entityId: t._id });
  res.json({ data: u });
}));

tenancyRoutes.post('/:id/company-accept', requirePerm('lease.manage'), validate({ params: idParam }), ah(async (req, res) => {
  const t = await getT(req, req.params.id);
  if (t.status !== 'pending') throw conflict('Lease is not pending', 'NOT_PENDING');
  const u: any = await Tenancy.findOneAndUpdate({ _id: t._id, status: 'pending' }, { 'acceptance.companyAt': t.acceptance?.companyAt ?? new Date(), 'acceptance.companyBy': oid(req.user.id) }, { new: true }).lean();
  await createDepositInvoice(u); // deposit becomes payable (mock) as soon as the company has offered the lease
  await audit(req, { action: 'lease.company_accept', entityType: 'Tenancy', entityId: t._id });
  await notifyUsers([t.tenantId], { type: 'lease.company_accepted', title: 'Lease signed by the company', body: 'Review and accept to continue.', link: `/tenant/leases/${t._id}`, companyId: req.company._id });
  res.json({ data: u });
}));

tenancyRoutes.post('/:id/activate', requirePerm('lease.manage'), validate({ params: idParam, body: z.object({ acknowledgeDepositPending: z.boolean().default(false) }).strict() }), ah(async (req, res) => {
  const t = await getT(req, req.params.id);
  assertTransition(TENANCY_TRANSITIONS, t.status, 'active', 'lease status');
  if (!t.acceptance?.tenantAt || !t.acceptance?.companyAt) throw conflict('Both the tenant and the company must accept the lease before activation', 'NOT_ACCEPTED');
  let depositPending = false;
  if (t.terms.depositMinor > 0) {
    const dep: any = await Invoice.findOne({ tenancyId: t._id, key: 'deposit' }).lean();
    if (!dep || dep.status !== 'paid') {
      if (!req.body.acknowledgeDepositPending) throw conflict('Deposit is unpaid. Pay it, or explicitly record it as pending (acknowledgeDepositPending=true).', 'DEPOSIT_REQUIRED');
      depositPending = true;
    }
  }
  const sched = generateSchedule(t.terms);
  const out = await withTx(async (session) => {
    const prop: any = await Property.findOneAndUpdate({ _id: t.propertyId, companyId: req.company._id }, { $inc: { lockCounter: 1 } }, { new: true, session }).lean(); // serialises activations per property
    if (!prop || prop.listingStatus === 'archived') throw conflict('Property is archived', 'ARCHIVED');
    if (prop.occupancyStatus === 'maintenance') throw conflict('Property is under maintenance', 'UNDER_MAINTENANCE');
    const endEx = addDaysUTC(t.terms.endDate, 1);
    const overlapping = await Tenancy.exists({ propertyId: t.propertyId, status: 'active', _id: { $nin: [t._id, ...(t.renewedFromId ? [t.renewedFromId] : [])] }, 'terms.startDate': { $lt: endEx }, 'terms.endDate': { $gte: t.terms.startDate } }).session(session ?? null);
    if (overlapping) throw conflict('Another active tenancy overlaps this period for the property', 'TENANCY_OVERLAP');
    if (t.renewedFromId) await Tenancy.updateOne({ _id: t.renewedFromId, status: 'active' }, { status: 'renewed' }, { session });
    let claimed: any;
    try {
      claimed = await Tenancy.findOneAndUpdate({ _id: t._id, status: 'pending' }, { status: 'active', activatedAt: new Date(), activatedBy: oid(req.user.id), ...(depositPending && { depositPendingAcknowledgedAt: new Date() }) }, { new: true, session }).lean();
    } catch (e: any) {
      if (t.renewedFromId) await Tenancy.updateOne({ _id: t.renewedFromId, status: 'renewed' }, { status: 'active' });
      if (e?.code === 11000) throw conflict('This property already has an active tenancy', 'TENANCY_OVERLAP');
      throw e;
    }
    if (!claimed) { if (t.renewedFromId) await Tenancy.updateOne({ _id: t.renewedFromId, status: 'renewed' }, { status: 'active' }); throw conflict('Lease was just changed. Refresh and retry.', 'STALE_STATE'); }
    const base = { companyId: t.companyId, propertyId: t.propertyId, tenancyId: t._id, tenantId: t.tenantId, currency: t.terms.currency, issueDate: new Date() };
    const docs: any[] = sched.map((s) => ({ ...base, type: 'rent', key: `rent:${s.periodStart.toISOString().slice(0, 10)}`, number: invoiceNumber(), lineItems: [{ description: `Rent ${s.periodStart.toISOString().slice(0, 10)} to ${addDaysUTC(s.periodEnd, -1).toISOString().slice(0, 10)}`, amountMinor: s.amountMinor }], totalMinor: s.amountMinor, dueDate: s.dueDate, periodStart: s.periodStart, periodEnd: s.periodEnd }));
    (t.terms.fees ?? []).forEach((f: any, i: number) => docs.push({ ...base, type: 'fee', key: `fee:${i}`, number: invoiceNumber(), lineItems: [{ description: f.name, amountMinor: f.amountMinor }], totalMinor: f.amountMinor, dueDate: t.terms.startDate }));
    try { await Invoice.insertMany(docs, { session, ordered: false }); } catch (e: any) { if (e?.code !== 11000 && !e?.writeErrors) throw e; } // idempotent on retry
    await Property.updateOne({ _id: t.propertyId }, { occupancyStatus: 'occupied' }, { session });
    return claimed;
  });
  await audit(req, { action: 'lease.activate', entityType: 'Tenancy', entityId: t._id, meta: { depositPending } });
  await notifyUsers([t.tenantId], { type: 'lease.activated', title: 'Your tenancy is active', body: 'Your tenant portal is now available.', link: '/tenant', companyId: req.company._id });
  res.json({ data: out });
}));

tenancyRoutes.post('/:id/terminate', requirePerm('lease.manage'), validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(1000), effectiveDate: isoDate.optional() }).strict() }), ah(async (req, res) => {
  const t = await getT(req, req.params.id);
  assertTransition(TENANCY_TRANSITIONS, t.status, 'terminated', 'lease status');
  const eff = startOfUtcDay(req.body.effectiveDate ?? new Date());
  const u: any = await Tenancy.findOneAndUpdate({ _id: t._id, status: t.status }, { status: 'terminated', termination: { at: new Date(), effectiveDate: eff, reason: req.body.reason, by: oid(req.user.id) } }, { new: true }).lean();
  if (!u) throw conflict('Lease was just changed. Refresh and retry.', 'STALE_STATE');
  // Void FUTURE, completely unpaid rent/fee invoices only. Paid / partially paid / past records are preserved.
  await Invoice.updateMany({ tenancyId: t._id, type: { $ne: 'deposit' }, status: 'issued', paidMinor: 0, dueDate: { $gt: eff } }, { status: 'void' });
  if (t.status === 'active') await Property.updateOne({ _id: t.propertyId }, { occupancyStatus: 'available' });
  await audit(req, { action: 'lease.terminate', entityType: 'Tenancy', entityId: t._id, meta: { reason: req.body.reason } });
  await notifyUsers([t.tenantId], { type: 'lease.terminated', title: 'Lease terminated', body: req.body.reason, companyId: req.company._id });
  res.json({ data: u });
}));

tenancyRoutes.post('/:id/renew', requirePerm('lease.manage'), validate({ params: idParam, body: z.object({ terms: termsSchema }).strict() }), ah(async (req, res) => {
  const old = await getT(req, req.params.id);
  if (old.status !== 'active') throw conflict('Only active leases can be renewed', 'NOT_ACTIVE');
  const n = await Tenancy.create({ companyId: old.companyId, propertyId: old.propertyId, tenantId: old.tenantId, renewedFromId: old._id, terms: normaliseTerms(req.body.terms, old.terms.currency), contract: { reference: `LC-${randomCode(8)}`, version: 1, generatedAt: new Date() } });
  await audit(req, { action: 'lease.renew_proposed', entityType: 'Tenancy', entityId: n._id, meta: { from: old._id } });
  await notifyUsers([old.tenantId], { type: 'lease.proposed', title: 'Lease renewal proposed', link: `/tenant/leases/${n._id}`, companyId: req.company._id });
  res.status(201).json({ data: n });
}));

/* ================= TENANT PORTAL ================= */
export const myTenancyRoutes = Router();
const mineT = async (req: any, id: string) => {
  const t: any = await Tenancy.findOne({ _id: id, tenantId: oid(req.user.id) }).lean(); // ownership comes from the token, never from a client-supplied id
  if (!t) throw notFound('Lease');
  return t;
};
myTenancyRoutes.get('/', ah(async (req, res) => {
  res.json({ data: await Tenancy.find({ tenantId: oid(req.user.id) }).populate('propertyId', 'title reference location.city location.district media').sort({ createdAt: -1 }).lean() });
}));
myTenancyRoutes.get('/home', ah(async (req, res) => {
  const uid = oid(req.user.id);
  const t: any = await Tenancy.findOne({ tenantId: uid, status: 'active' }).populate('propertyId', 'title reference location.city location.district').lean();
  const [open, recentTx, unread, invoices] = await Promise.all([
    t ? MaintenanceRequest.countDocuments({ tenantId: uid, tenancyId: t._id, status: { $nin: ['closed', 'resolved'] } }) : 0,
    PaymentTransaction.find({ tenantId: uid, type: 'payment', voided: false }).sort({ createdAt: -1 }).limit(5).lean(),
    Notification.countDocuments({ userId: uid, readAt: { $exists: false } }),
    t ? Invoice.find({ tenancyId: t._id, tenantId: uid, status: { $in: ['issued', 'partially_paid'] } }).sort({ dueDate: 1 }).lean() : [],
  ]);
  const byCurrency = invoices.reduce((m: any, i: any) => ({ ...m, [i.currency]: (m[i.currency] ?? 0) + outstandingMinor(i) }), {});
  const next: any = invoices[0];
  res.json({ data: {
    activeTenancy: t, nextDue: next ? { invoiceId: next._id, dueDate: next.dueDate, outstandingMinor: outstandingMinor(next), currency: next.currency } : null,
    outstanding: byCurrency, overdueCount: invoices.filter((i: any) => effectiveInvoiceStatus(i) === 'overdue').length,
    recentPayments: recentTx, openMaintenanceRequests: open, unreadNotifications: unread, paymentEnvironment: 'MOCK',
  } });
}));
myTenancyRoutes.get('/:id', validate({ params: idParam }), ah(async (req, res) => {
  const t = await mineT(req, req.params.id);
  res.json({ data: await Tenancy.findById(t._id).populate('propertyId', 'title reference location.city location.district').lean() });
}));
myTenancyRoutes.post('/:id/accept', validate({ params: idParam }), ah(async (req, res) => {
  const t = await mineT(req, req.params.id);
  if (t.status !== 'pending') throw conflict('This lease is not awaiting acceptance', 'NOT_PENDING');
  if (!t.acceptance?.companyAt) throw conflict('The company has not yet issued this lease', 'NOT_OFFERED');
  const u = await Tenancy.findOneAndUpdate({ _id: t._id, status: 'pending' }, { 'acceptance.tenantAt': t.acceptance?.tenantAt ?? new Date() }, { new: true }).lean();
  await audit(req, { action: 'lease.tenant_accept', entityType: 'Tenancy', entityId: t._id, companyId: t.companyId });
  const p: any = await Property.findById(t.propertyId).lean();
  const { notifyStaff } = await import('../notifications/service');
  await notifyStaff(t.companyId, 'lease.manage', p, { type: 'lease.tenant_accepted', title: 'Tenant accepted the lease', body: p?.title, link: `/dashboard/tenancies/${t._id}` });
  res.json({ data: u });
}));
