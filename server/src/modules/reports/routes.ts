import { Router } from 'express';
import { z } from 'zod';
import { Property } from '../properties/model';
import { Tenancy } from '../tenancies/model';
import { Invoice, PaymentTransaction } from '../payments/model';
import { Expense } from '../expenses/model';
import { ViewingBooking } from '../bookings/model';
import { RentalApplication } from '../applications/model';
import { MaintenanceRequest } from '../maintenance/model';
import { AuditLog } from '../audit/model';
import { scopeFilter } from '../companies/scope';
import { requirePerm } from '../../middleware/auth';
import { audit } from '../audit/service';
import { ah, isoDate, objectId, oid, validate } from '../../utils/http';
import { toCsv } from '../../utils/csv';
import { addMonthsUTC, startOfUtcDay } from '../../domain/schedule';

export const reportRoutes = Router({ mergeParams: true });

export const REPORTING_BASIS = {
  expectedRent: 'Accrual: rent invoices (non-void) whose due date falls in the period.',
  collectedRent: 'Cash basis: simulated rent payments recorded in the period, minus simulated reversals recorded in the period. MOCK payments only — not real money.',
  overdue: 'Unpaid balance of rent invoices past their due date as of now (all periods).',
  expenses: 'Approved expenses dated within the period. Pending/rejected excluded.',
  depositLiability: 'Net deposits held (payments minus reversals, all time). Deposits are liabilities and are NEVER counted as income or collected rent.',
  currency: 'Amounts are grouped per currency; no conversion is performed.',
  trends: 'Occupancy trend is an approximation derived from lease activation/termination dates.',
};
const range = z.object({ from: isoDate.optional(), to: isoDate.optional(), branchId: objectId.optional() });
function period(q: any) {
  const now = new Date();
  const from = q.from ? startOfUtcDay(q.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = q.to ? q.to : addMonthsUTC(from, 1);
  return { from, to };
}
const byCur = (rows: any[], field = 'total') => Object.fromEntries(rows.map((r) => [r._id, r[field]]));
const sum = (field: any) => ({ $sum: field });

async function netCollected(match: any, extra: any = {}) {
  const rows = await PaymentTransaction.aggregate([
    { $match: { ...match, voided: false, ...extra } },
    { $group: { _id: { c: '$currency', t: '$type' }, total: sum('$amountMinor') } },
  ]);
  const out: Record<string, number> = {};
  for (const r of rows) out[r._id.c] = (out[r._id.c] ?? 0) + (r._id.t === 'payment' ? r.total : -r.total);
  return out;
}

reportRoutes.get('/overview', requirePerm('report.read'), validate({ query: range }), ah(async (req, res) => {
  const { from, to } = period(req.query);
  const sf: any = await scopeFilter(req);
  const propMatch: any = await scopeFilter(req, '_id');
  if (req.query.branchId) propMatch.branchId = oid(req.query.branchId);
  const now = new Date();
  const [props, activeTenancies, upcomingBookings, pendingApps, maintOpen, emergencies, expected, collected, overdue, outstanding, expenses, deposits, expiring, outstandingInv, recentMaint] = await Promise.all([
    Property.aggregate([{ $match: { ...propMatch, listingStatus: { $ne: 'archived' } } }, { $group: { _id: '$occupancyStatus', n: { $sum: 1 } } }]),
    Tenancy.countDocuments({ ...sf, status: 'active' }),
    ViewingBooking.countDocuments({ ...sf, status: 'confirmed', confirmedStart: { $gte: now, $lte: new Date(now.getTime() + 14 * 86_400_000) } }),
    RentalApplication.countDocuments({ ...sf, status: { $in: ['submitted', 'under_review', 'information_required'] } }),
    MaintenanceRequest.countDocuments({ ...sf, status: { $in: ['submitted', 'acknowledged', 'reopened'] } }),
    MaintenanceRequest.countDocuments({ ...sf, priority: 'emergency', status: { $nin: ['resolved', 'closed'] } }),
    Invoice.aggregate([{ $match: { ...sf, type: 'rent', status: { $ne: 'void' }, dueDate: { $gte: from, $lt: to } } }, { $group: { _id: '$currency', total: sum('$totalMinor') } }]),
    netCollected(sf, { invoiceType: 'rent', createdAt: { $gte: from, $lt: to } }),
    Invoice.aggregate([{ $match: { ...sf, type: 'rent', status: { $in: ['issued', 'partially_paid'] }, dueDate: { $lt: now } } }, { $group: { _id: '$currency', total: sum({ $subtract: ['$totalMinor', '$paidMinor'] }), count: { $sum: 1 } } }]),
    Invoice.aggregate([{ $match: { ...sf, status: { $in: ['issued', 'partially_paid'] } } }, { $group: { _id: '$currency', total: sum({ $subtract: ['$totalMinor', '$paidMinor'] }) } }]),
    Expense.aggregate([{ $match: { ...sf, status: 'approved', date: { $gte: from, $lt: to } } }, { $group: { _id: { c: '$currency', cat: '$category' }, total: sum('$amountMinor') } }]),
    netCollected(sf, { invoiceType: 'deposit' }),
    Tenancy.find({ ...sf, status: 'active', 'terms.endDate': { $lte: new Date(now.getTime() + 60 * 86_400_000) } }).select('propertyId terms.endDate').populate('propertyId', 'title reference').sort({ 'terms.endDate': 1 }).limit(10).lean(),
    Invoice.find({ ...sf, status: { $in: ['issued', 'partially_paid'] } }).select('number dueDate totalMinor paidMinor currency propertyId').populate('propertyId', 'title').sort({ dueDate: 1 }).limit(10).lean(),
    MaintenanceRequest.find(sf).select('title priority status createdAt propertyId').populate('propertyId', 'title').sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  const occ = Object.fromEntries(props.map((p: any) => [p._id, p.n]));
  const totalProps = props.reduce((n: number, p: any) => n + p.n, 0);
  const expByCur: any = {}; const expByCat: any = {};
  for (const e of expenses) { expByCur[e._id.c] = (expByCur[e._id.c] ?? 0) + e.total; (expByCat[e._id.c] ??= {})[e._id.cat] = e.total; }
  let recentActivity: any[] | undefined;
  if (req.permissions.includes('audit.read')) recentActivity = await AuditLog.find({ companyId: req.company._id, outcome: 'success' }).sort({ createdAt: -1 }).limit(10).select('action entityType entityId createdAt').lean();
  res.json({ data: {
    period: { from, to }, basis: REPORTING_BASIS, paymentEnvironment: 'MOCK',
    properties: { total: totalProps, available: occ.available ?? 0, occupied: occ.occupied ?? 0, maintenance: occ.maintenance ?? 0 },
    activeTenancies, upcomingViewings14d: upcomingBookings, pendingApplications: pendingApps, maintenanceAwaitingAction: maintOpen, openEmergencies: emergencies,
    rentExpected: byCur(expected), rentCollected: collected, overdueRent: byCur(overdue), overdueInvoiceCount: overdue.reduce((n: number, o: any) => n + o.count, 0),
    outstandingAllInvoices: byCur(outstanding), operatingExpenses: expByCur, expensesByCategory: expByCat, depositLiabilities: deposits,
    upcomingLeaseExpirations: expiring, outstandingInvoices: outstandingInv, recentMaintenance: recentMaint, recentActivity,
    isEmpty: totalProps === 0,
  } });
}));

reportRoutes.get('/financial', requirePerm('report.read'), validate({ query: z.object({ year: z.coerce.number().int().min(2000).max(2100).default(new Date().getUTCFullYear()) }) }), ah(async (req, res) => {
  const { year } = req.query;
  const sf: any = await scopeFilter(req);
  const from = new Date(Date.UTC(year, 0, 1)), to = new Date(Date.UTC(year + 1, 0, 1));
  const [expected, tx, exp, byProp] = await Promise.all([
    Invoice.aggregate([{ $match: { ...sf, type: 'rent', status: { $ne: 'void' }, dueDate: { $gte: from, $lt: to } } }, { $group: { _id: { c: '$currency', m: { $month: '$dueDate' } }, total: sum('$totalMinor') } }]),
    PaymentTransaction.aggregate([{ $match: { ...sf, invoiceType: 'rent', voided: false, createdAt: { $gte: from, $lt: to } } }, { $group: { _id: { c: '$currency', m: { $month: '$createdAt' }, t: '$type' }, total: sum('$amountMinor') } }]),
    Expense.aggregate([{ $match: { ...sf, status: 'approved', date: { $gte: from, $lt: to } } }, { $group: { _id: { c: '$currency', m: { $month: '$date' } }, total: sum('$amountMinor') } }]),
    PaymentTransaction.aggregate([{ $match: { ...sf, invoiceType: 'rent', voided: false, createdAt: { $gte: from, $lt: to } } }, { $group: { _id: { p: '$propertyId', c: '$currency', t: '$type' }, total: sum('$amountMinor') } }]),
  ]);
  const months: any = {};
  const slot = (c: string, m: number) => ((months[c] ??= Array.from({ length: 12 }, (_, i) => ({ month: i + 1, expected: 0, collected: 0, expenses: 0 })))[m - 1]);
  expected.forEach((r: any) => (slot(r._id.c, r._id.m).expected += r.total));
  tx.forEach((r: any) => (slot(r._id.c, r._id.m).collected += r._id.t === 'payment' ? r.total : -r.total));
  exp.forEach((r: any) => (slot(r._id.c, r._id.m).expenses += r.total));
  const propIncome: any = {};
  byProp.forEach((r: any) => { const k = `${r._id.p}|${r._id.c}`; propIncome[k] = (propIncome[k] ?? 0) + (r._id.t === 'payment' ? r.total : -r.total); });
  const pids = [...new Set(Object.keys(propIncome).map((k) => k.split('|')[0]))];
  const props: any[] = await Property.find({ _id: { $in: pids } }).select('title reference').lean();
  const pm = new Map(props.map((p) => [String(p._id), p]));
  res.json({ data: { year, basis: REPORTING_BASIS, paymentEnvironment: 'MOCK', monthly: months,
    propertyIncome: Object.entries(propIncome).map(([k, v]) => { const [p, c] = k.split('|'); return { propertyId: p, title: pm.get(p)?.title, reference: pm.get(p)?.reference, currency: c, collectedMinor: v }; }) } });
}));

const CSV_LIMIT = 10_000;
reportRoutes.get('/export/invoices.csv', requirePerm('report.read', 'invoice.read'), validate({ query: range }), ah(async (req, res) => {
  const { from, to } = period(req.query);
  const sf: any = await scopeFilter(req);
  const rows: any[] = await Invoice.find({ ...sf, dueDate: { $gte: from, $lt: to } }).populate('propertyId', 'reference title').sort({ dueDate: 1 }).limit(CSV_LIMIT).lean();
  await audit(req, { action: 'report.export_invoices', meta: { from, to, rows: rows.length } });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="invoices.csv"', 'Cache-Control': 'no-store' });
  res.send(toCsv(['number', 'property_ref', 'type', 'status', 'currency', 'total_minor', 'paid_minor', 'due_date', 'environment'], rows.map((i) => [i.number, i.propertyId?.reference, i.type, i.status, i.currency, i.totalMinor, i.paidMinor, i.dueDate, 'MOCK'])));
}));
reportRoutes.get('/export/expenses.csv', requirePerm('report.read', 'expense.read'), validate({ query: range }), ah(async (req, res) => {
  const { from, to } = period(req.query);
  const sf: any = await scopeFilter(req);
  const rows: any[] = await Expense.find({ ...sf, date: { $gte: from, $lt: to } }).populate('propertyId', 'reference').sort({ date: 1 }).limit(CSV_LIMIT).lean();
  await audit(req, { action: 'report.export_expenses', meta: { from, to, rows: rows.length } });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="expenses.csv"', 'Cache-Control': 'no-store' });
  res.send(toCsv(['date', 'category', 'status', 'currency', 'amount_minor', 'property_ref', 'vendor', 'description'], rows.map((e) => [e.date, e.category, e.status, e.currency, e.amountMinor, e.propertyId?.reference, e.vendor, e.description])));
}));
// PDF export: intentionally NOT implemented yet (documented in README) rather than shipping an insecure/unsafe renderer.
