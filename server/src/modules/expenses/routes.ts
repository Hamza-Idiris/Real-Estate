import { Router } from 'express';
import { z } from 'zod';
import { Expense, EXPENSE_CATEGORIES } from './model';
import { Branch } from '../companies/model';
import { allowedPropertyIds, getScopedProperty } from '../companies/scope';
import { requirePerm } from '../../middleware/auth';
import { audit } from '../audit/service';
import { ah, idParam, isoDate, objectId, oid, pageMeta, pageQuery, validate } from '../../utils/http';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { currencySchema, positiveMinorSchema } from '../../utils/money';
import { checkUpload, uploadOne } from '../files/upload';
import { saveFile, signedUrl } from '../files/storage';

export const expenseRoutes = Router({ mergeParams: true });
/** Scoped members only see expenses of properties they may access; company-level (no property) expenses need scope "all". */
async function expScope(req: any) {
  const ids = await allowedPropertyIds(req.member, req.company._id);
  return ids ? { companyId: req.company._id, propertyId: { $in: ids } } : { companyId: req.company._id };
}
const withUrl = (e: any) => ({ ...e, receiptUrl: e.receiptKey ? signedUrl(e.receiptKey, 600) : undefined, receiptKey: undefined });

const body = z.object({
  category: z.enum(EXPENSE_CATEGORIES), amountMinor: positiveMinorSchema, currency: currencySchema, date: isoDate,
  propertyId: objectId.optional(), vendor: z.string().trim().max(120).optional(), description: z.string().trim().max(1000).optional(),
}).strict();

expenseRoutes.get('/', requirePerm('expense.read'), validate({ query: pageQuery.extend({
  category: z.enum(EXPENSE_CATEGORIES).optional(), status: z.enum(['pending', 'approved', 'rejected']).optional(), propertyId: objectId.optional(), branchId: objectId.optional(), from: isoDate.optional(), to: isoDate.optional(),
}) }), ah(async (req, res) => {
  const { page, limit, category, status, propertyId, branchId, from, to } = req.query;
  const f: any = await expScope(req);
  if (category) f.category = category; if (status) f.status = status; if (propertyId) f.propertyId = oid(propertyId); if (branchId) f.branchId = oid(branchId);
  if (from || to) f.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const [data, total] = await Promise.all([Expense.find(f).populate('propertyId', 'title reference').sort({ date: -1 }).skip((page - 1) * limit).limit(limit).lean(), Expense.countDocuments(f)]);
  res.json({ data: data.map(withUrl), meta: pageMeta(page, limit, total) });
}));
expenseRoutes.post('/', requirePerm('expense.manage'), validate({ body }), ah(async (req, res) => {
  let branchId: any;
  if (req.body.propertyId) branchId = (await getScopedProperty(req, req.body.propertyId, 'branchId')).branchId;
  else if (req.member.role !== 'owner' && req.member.scope !== 'all') throw forbidden('Company-level expenses require company-wide scope');
  const threshold = req.company.settings?.expenseApprovalThresholdMinor ?? 0;
  const auto = req.body.amountMinor <= threshold || req.permissions.includes('expense.approve');
  const e: any = await Expense.create({ ...req.body, companyId: req.company._id, branchId, createdBy: req.user.id, status: auto ? 'approved' : 'pending', ...(auto && { decidedBy: req.user.id, decidedAt: new Date() }) });
  await audit(req, { action: 'expense.create', entityType: 'Expense', entityId: e._id, meta: { amountMinor: e.amountMinor, status: e.status } });
  res.status(201).json({ data: withUrl(e.toObject()) });
}));
expenseRoutes.patch('/:id', requirePerm('expense.manage'), validate({ params: idParam, body: body.partial().omit({ currency: true, propertyId: true }) }), ah(async (req, res) => {
  const e: any = await Expense.findOne({ ...(await expScope(req)), _id: req.params.id }).lean();
  if (!e) throw notFound('Expense');
  if (e.status !== 'pending') throw conflict('Only pending expenses can be edited', 'NOT_PENDING');
  if (e.maintenanceRequestId) throw conflict('Maintenance-linked expenses are edited through the maintenance request', 'LINKED');
  if (String(e.createdBy) !== req.user.id && req.member.role !== 'owner') throw forbidden('Only the creator or the owner can edit this expense');
  const u = await Expense.findOneAndUpdate({ _id: e._id, status: 'pending' }, { $set: req.body }, { new: true }).lean();
  await audit(req, { action: 'expense.update', entityType: 'Expense', entityId: e._id });
  res.json({ data: withUrl(u) });
}));
expenseRoutes.post('/:id/decision', requirePerm('expense.approve'), validate({ params: idParam, body: z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() }).strict() }), ah(async (req, res) => {
  const u: any = await Expense.findOneAndUpdate({ ...(await expScope(req)), _id: req.params.id, status: 'pending' }, { status: req.body.decision, decidedBy: oid(req.user.id), decidedAt: new Date(), decisionNote: req.body.note }, { new: true }).lean();
  if (!u) throw conflict('Expense not found or already decided', 'NOT_PENDING');
  await audit(req, { action: `expense.${req.body.decision}`, entityType: 'Expense', entityId: u._id });
  res.json({ data: withUrl(u) });
}));
expenseRoutes.post('/:id/receipt', requirePerm('expense.manage'), validate({ params: idParam }), uploadOne, ah(async (req, res) => {
  const e: any = await Expense.findOne({ ...(await expScope(req)), _id: req.params.id }).lean();
  if (!e) throw notFound('Expense');
  const { buf, type } = checkUpload(req.file, ['image', 'pdf']);
  const saved = await saveFile(buf, type, 'private');
  await Expense.updateOne({ _id: e._id }, { receiptKey: saved.key });
  res.status(201).json({ data: { ok: true } });
}));
