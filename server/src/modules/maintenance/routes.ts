import { Router } from 'express';
import { z } from 'zod';
import { MaintenanceRequest, CATEGORIES } from './model';
import { Tenancy } from '../tenancies/model';
import { Property } from '../properties/model';
import { Membership } from '../companies/model';
import { Expense } from '../expenses/model';
import { allowedPropertyIds, scopeFilter } from '../companies/scope';
import { requirePerm } from '../../middleware/auth';
import { audit } from '../audit/service';
import { notifyStaff, notifyUsers } from '../notifications/service';
import { ah, idParam, objectId, oid, pageMeta, pageQuery, validate } from '../../utils/http';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { assertTransition, MAINTENANCE_TRANSITIONS } from '../../domain/transitions';
import { hasPermission } from '../../domain/permissions';
import { minorSchema } from '../../utils/money';
import { checkUpload, uploadOne } from '../files/upload';
import { saveFile, signedUrl } from '../files/storage';

export const EMERGENCY_DISCLAIMER = 'This app does not replace emergency services and does not guarantee an immediate human response. If anyone is in danger, call your local emergency number now.';
const urls = (r: any, forTenant: boolean) => ({
  ...r,
  attachments: (r.attachments ?? []).map((a: any) => ({ name: a.name, mime: a.mime, size: a.size, at: a.at, url: signedUrl(a.key, 600) })),
  comments: (r.comments ?? []).filter((c: any) => !forTenant || !c.internal),
  ...(forTenant ? { estimateMinor: undefined, actualMinor: undefined, history: (r.history ?? []).map((h: any) => ({ status: h.status, at: h.at })) } : {}),
  ...(r.priority === 'emergency' ? { emergencyDisclaimer: EMERGENCY_DISCLAIMER } : {}),
});
async function move(r: any, to: string, by: string, set: any = {}, note?: string) {
  assertTransition(MAINTENANCE_TRANSITIONS, r.status, to, 'maintenance status');
  const u = await MaintenanceRequest.findOneAndUpdate({ _id: r._id, status: r.status }, { $set: { ...set, status: to }, $push: { history: { status: to, at: new Date(), by: oid(by), note } } }, { new: true }).lean();
  if (!u) throw conflict('This request was just changed. Refresh and retry.', 'STALE_STATE');
  return u as any;
}

/* ================= TENANT ================= */
export const myMaintenanceRoutes = Router();
myMaintenanceRoutes.post('/', validate({ body: z.object({
  tenancyId: objectId, category: z.enum(CATEGORIES), title: z.string().trim().min(3).max(140), description: z.string().trim().min(5).max(3000),
  priority: z.enum(['low', 'normal', 'high', 'emergency']).default('normal'),
}).strict() }), ah(async (req, res) => {
  // property is DERIVED from the caller's own active tenancy; a client-supplied property id is never accepted.
  const t: any = await Tenancy.findOne({ _id: req.body.tenancyId, tenantId: oid(req.user.id), status: 'active' }).lean();
  if (!t) throw notFound('Active lease');
  const p: any = await Property.findById(t.propertyId).select('title branchId assignedStaffIds').lean();
  const r: any = await MaintenanceRequest.create({ ...req.body, companyId: t.companyId, propertyId: t.propertyId, tenantId: req.user.id, history: [{ status: 'submitted', at: new Date(), by: oid(req.user.id) }] });
  const emergency = r.priority === 'emergency';
  await notifyStaff(t.companyId, 'maintenance.manage', p, { type: emergency ? 'maintenance.emergency' : 'maintenance.submitted', priority: emergency ? 'emergency' : 'normal', title: emergency ? `EMERGENCY report: ${r.title}` : `New maintenance request: ${r.title}`, body: p?.title, link: `/dashboard/maintenance/${r._id}` });
  res.status(201).json({ data: urls(r.toObject(), true), ...(emergency ? { emergencyDisclaimer: EMERGENCY_DISCLAIMER } : {}) });
}));
myMaintenanceRoutes.get('/', validate({ query: pageQuery }), ah(async (req, res) => {
  const { page, limit } = req.query; const f = { tenantId: oid(req.user.id) };
  const [data, total] = await Promise.all([MaintenanceRequest.find(f).select('-comments -history -attachments -estimateMinor -actualMinor').populate('propertyId', 'title reference').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), MaintenanceRequest.countDocuments(f)]);
  res.json({ data, meta: pageMeta(page, limit, total) });
}));
const mine = async (req: any) => {
  const r: any = await MaintenanceRequest.findOne({ _id: req.params.id, tenantId: oid(req.user.id) }).lean();
  if (!r) throw notFound('Request');
  return r;
};
myMaintenanceRoutes.get('/:id', validate({ params: idParam }), ah(async (req, res) => res.json({ data: urls(await mine(req), true) })));
myMaintenanceRoutes.post('/:id/comments', validate({ params: idParam, body: z.object({ message: z.string().trim().min(1).max(2000) }).strict() }), ah(async (req, res) => {
  const r = await mine(req);
  await MaintenanceRequest.updateOne({ _id: r._id }, { $push: { comments: { authorId: oid(req.user.id), authorType: 'tenant', message: req.body.message, internal: false, at: new Date() } } });
  if (r.assignedStaffId) await notifyUsers([r.assignedStaffId], { type: 'maintenance.comment', title: 'Tenant added a comment', body: r.title, link: `/dashboard/maintenance/${r._id}`, companyId: r.companyId });
  res.status(201).json({ data: { ok: true } });
}));
myMaintenanceRoutes.post('/:id/attachments', validate({ params: idParam }), uploadOne, ah(async (req, res) => {
  const r = await mine(req);
  if ((r.attachments?.length ?? 0) >= 8) throw conflict('Maximum 8 attachments', 'ATTACHMENT_LIMIT');
  const { buf, type, originalName } = checkUpload(req.file, ['image', 'pdf']);
  const saved = await saveFile(buf, type, 'private');
  await MaintenanceRequest.updateOne({ _id: r._id }, { $push: { attachments: { key: saved.key, name: originalName, mime: type.mime, size: buf.length, by: oid(req.user.id), at: new Date() } } });
  res.status(201).json({ data: { name: originalName, mime: type.mime, size: buf.length } });
}));
myMaintenanceRoutes.post('/:id/reopen', validate({ params: idParam, body: z.object({ message: z.string().trim().min(3).max(1000) }).strict() }), ah(async (req, res) => {
  const r = await mine(req);
  const u = await move(r, 'reopened', req.user.id, { resolvedAt: undefined }, req.body.message);
  await MaintenanceRequest.updateOne({ _id: r._id }, { $push: { comments: { authorId: oid(req.user.id), authorType: 'tenant', message: req.body.message, internal: false, at: new Date() } } });
  const p: any = await Property.findById(r.propertyId).select('title branchId assignedStaffIds').lean();
  await notifyStaff(r.companyId, 'maintenance.manage', p, { type: 'maintenance.reopened', title: `Request reopened: ${r.title}`, link: `/dashboard/maintenance/${r._id}` });
  res.json({ data: urls(u, true) });
}));

/* ================= STAFF ================= */
export const maintenanceRoutes = Router({ mergeParams: true });
const getM = async (req: any, id: string) => {
  const r: any = await MaintenanceRequest.findOne({ ...(await scopeFilter(req)), _id: id }).lean();
  if (!r) throw notFound('Request');
  return r;
};
maintenanceRoutes.get('/', requirePerm('maintenance.read'), validate({ query: pageQuery.extend({
  status: z.enum(['submitted', 'acknowledged', 'assigned', 'in_progress', 'waiting_for_parts', 'resolved', 'closed', 'reopened']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'emergency']).optional(), propertyId: objectId.optional(), assignedTo: objectId.optional(), open: z.enum(['true']).optional(),
}) }), ah(async (req, res) => {
  const { page, limit, status, priority, propertyId, assignedTo, open } = req.query;
  const f: any = await scopeFilter(req);
  if (status) f.status = status; else if (open) f.status = { $nin: ['closed', 'resolved'] };
  if (priority) f.priority = priority; if (propertyId) f.propertyId = oid(propertyId); if (assignedTo) f.assignedStaffId = oid(assignedTo);
  const sortPrio = { emergency: 0, high: 1, normal: 2, low: 3 } as any;
  const [rows, total] = await Promise.all([MaintenanceRequest.find(f).select('-comments -history -attachments').populate('propertyId', 'title reference').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), MaintenanceRequest.countDocuments(f)]);
  rows.sort((a: any, b: any) => sortPrio[a.priority] - sortPrio[b.priority]); // emergencies are visually and positionally prioritised within the page
  res.json({ data: rows, meta: pageMeta(page, limit, total) });
}));
maintenanceRoutes.get('/:id', requirePerm('maintenance.read'), validate({ params: idParam }), ah(async (req, res) => res.json({ data: urls(await getM(req, req.params.id), false) })));
maintenanceRoutes.post('/:id/assign', requirePerm('maintenance.assign'), validate({ params: idParam, body: z.object({ staffUserId: objectId }).strict() }), ah(async (req, res) => {
  const r = await getM(req, req.params.id);
  const m: any = await Membership.findOne({ companyId: req.company._id, userId: oid(req.body.staffUserId), status: 'active' }).lean();
  if (!m || !hasPermission(m, 'maintenance.manage')) throw badRequest('Assignee must be active staff who can manage maintenance', 'INVALID_STAFF');
  const ids = await allowedPropertyIds(m, req.company._id);
  if (ids && !ids.some((x) => String(x) === String(r.propertyId))) throw badRequest('Assignee has no access to this property', 'INVALID_STAFF');
  const to = ['submitted', 'acknowledged', 'reopened'].includes(r.status) ? 'assigned' : r.status;
  const u = to === r.status ? await MaintenanceRequest.findOneAndUpdate({ _id: r._id }, { assignedStaffId: oid(req.body.staffUserId) }, { new: true }).lean() : await move(r, 'assigned', req.user.id, { assignedStaffId: oid(req.body.staffUserId) });
  await audit(req, { action: 'maintenance.assign', entityType: 'MaintenanceRequest', entityId: r._id, meta: { staffUserId: req.body.staffUserId } });
  await notifyUsers([req.body.staffUserId], { type: 'maintenance.assigned', title: 'Maintenance request assigned to you', body: r.title, link: `/dashboard/maintenance/${r._id}`, companyId: req.company._id, priority: r.priority === 'emergency' ? 'emergency' : 'normal' });
  await notifyUsers([r.tenantId], { type: 'maintenance.assigned', title: 'A staff member was assigned to your request', body: r.title, link: `/tenant/maintenance/${r._id}`, companyId: req.company._id });
  res.json({ data: u });
}));
maintenanceRoutes.post('/:id/status', requirePerm('maintenance.manage'), validate({ params: idParam, body: z.object({ status: z.enum(['acknowledged', 'in_progress', 'waiting_for_parts', 'resolved', 'closed']), note: z.string().trim().max(1000).optional(), resolution: z.string().trim().max(2000).optional() }).strict()
  .refine((b) => b.status !== 'resolved' || !!b.resolution, { message: 'resolution is required when resolving', path: ['resolution'] }) }), ah(async (req, res) => {
  const r = await getM(req, req.params.id);
  const set: any = {};
  if (req.body.status === 'resolved') { set.resolution = req.body.resolution; set.resolvedAt = new Date(); }
  const u = await move(r, req.body.status, req.user.id, set, req.body.note);
  await audit(req, { action: `maintenance.${req.body.status}`, entityType: 'MaintenanceRequest', entityId: r._id });
  await notifyUsers([r.tenantId], { type: 'maintenance.status', title: `Request ${req.body.status.replace(/_/g, ' ')}`, body: r.title, link: `/tenant/maintenance/${r._id}`, companyId: req.company._id });
  res.json({ data: urls(u, false) });
}));
maintenanceRoutes.post('/:id/comments', requirePerm('maintenance.manage'), validate({ params: idParam, body: z.object({ message: z.string().trim().min(1).max(2000), internal: z.boolean().default(false) }).strict() }), ah(async (req, res) => {
  const r = await getM(req, req.params.id);
  await MaintenanceRequest.updateOne({ _id: r._id }, { $push: { comments: { authorId: oid(req.user.id), authorType: 'staff', message: req.body.message, internal: req.body.internal, at: new Date() } } });
  if (!req.body.internal) await notifyUsers([r.tenantId], { type: 'maintenance.comment', title: 'New comment on your request', body: r.title, link: `/tenant/maintenance/${r._id}`, companyId: req.company._id });
  res.status(201).json({ data: { ok: true } });
}));
// Cost tracking (kept apart from rent). Recording an ACTUAL cost mirrors it into expenses (category=maintenance), exactly once per request.
maintenanceRoutes.patch('/:id/costs', requirePerm('maintenance.manage', 'expense.manage'), validate({ params: idParam, body: z.object({ estimateMinor: minorSchema.optional(), actualMinor: minorSchema.optional(), vendor: z.string().trim().max(120).optional() }).strict() }), ah(async (req, res) => {
  const r = await getM(req, req.params.id);
  const p: any = await Property.findById(r.propertyId).select('currency branchId').lean();
  const set: any = { currency: p.currency };
  if (req.body.estimateMinor !== undefined) set.estimateMinor = req.body.estimateMinor;
  if (req.body.actualMinor !== undefined) set.actualMinor = req.body.actualMinor;
  const u = await MaintenanceRequest.findOneAndUpdate({ _id: r._id }, { $set: set }, { new: true }).lean();
  if (req.body.actualMinor) {
    const threshold = req.company.settings?.expenseApprovalThresholdMinor ?? 0;
    const auto = req.body.actualMinor <= threshold || req.permissions.includes('expense.approve');
    await Expense.findOneAndUpdate({ maintenanceRequestId: r._id }, { $set: { amountMinor: req.body.actualMinor, vendor: req.body.vendor }, $setOnInsert: {
      companyId: req.company._id, propertyId: r.propertyId, branchId: p.branchId, category: 'maintenance', currency: p.currency, date: new Date(), description: `Maintenance: ${r.title}`, createdBy: oid(req.user.id),
      status: auto ? 'approved' : 'pending', ...(auto && { decidedBy: oid(req.user.id), decidedAt: new Date() }),
    } }, { upsert: true });
  }
  await audit(req, { action: 'maintenance.costs', entityType: 'MaintenanceRequest', entityId: r._id, meta: req.body });
  res.json({ data: urls(u, false) });
}));
maintenanceRoutes.post('/:id/attachments', requirePerm('maintenance.manage'), validate({ params: idParam }), uploadOne, ah(async (req, res) => {
  const r = await getM(req, req.params.id);
  if ((r.attachments?.length ?? 0) >= 8) throw conflict('Maximum 8 attachments', 'ATTACHMENT_LIMIT');
  const { buf, type, originalName } = checkUpload(req.file, ['image', 'pdf']);
  const saved = await saveFile(buf, type, 'private');
  await MaintenanceRequest.updateOne({ _id: r._id }, { $push: { attachments: { key: saved.key, name: originalName, mime: type.mime, size: buf.length, by: oid(req.user.id), at: new Date() } } });
  res.status(201).json({ data: { name: originalName, mime: type.mime, size: buf.length } });
}));
