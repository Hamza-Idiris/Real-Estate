import { Router } from 'express';
import { z } from 'zod';
import { Branch, Company, Membership } from './model';
import { User } from '../auth/model';
import { Property } from '../properties/model';
import { AuditLog } from '../audit/model';
import { audit } from '../audit/service';
import { notifyUsers } from '../notifications/service';
import { ah, idParam, objectId, oid, pageMeta, pageQuery, validate } from '../../utils/http';
import { requirePerm } from '../../middleware/auth';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { clampGrant, effectivePermissions, ROLE_DEFAULTS, ROLES } from '../../domain/permissions';
import { currencySchema } from '../../utils/money';
import { randomToken, sha256, slugify, randomCode } from '../../utils/ids';

/* ---------- user-level (not company-scoped) ---------- */
export const myCompaniesRoutes = Router();
myCompaniesRoutes.get('/', ah(async (req, res) => {
  const ms: any[] = await Membership.find({ userId: oid(req.user.id), status: 'active' }).populate('companyId', 'name slug status currency timezone').lean();
  res.json({ data: ms.filter((m) => m.companyId).map((m) => ({
    companyId: String(m.companyId._id), company: m.companyId, role: m.role, scope: m.scope, permissions: effectivePermissions(m),
  })) });
}));

export const companyCreateRoutes = Router();
companyCreateRoutes.post('/', validate({ body: z.object({
  name: z.string().trim().min(2).max(120), country: z.string().trim().min(2).max(80),
  currency: currencySchema.default('USD'), timezone: z.string().trim().max(60).default('Africa/Mogadishu'),
}).strict() }), ah(async (req, res) => {
  const slug = `${slugify(req.body.name)}-${randomCode(4).toLowerCase()}`;
  const company: any = await Company.create({ ...req.body, slug, ownerId: req.user.id, contact: { email: req.user.email } });
  await Membership.create({ companyId: company._id, userId: req.user.id, email: req.user.email, role: 'owner', scope: 'all', status: 'active', permissions: [...ROLE_DEFAULTS.owner] });
  await Branch.create({ companyId: company._id, name: 'Main branch', country: req.body.country });
  await audit(req, { action: 'company.create', entityType: 'Company', entityId: company._id, companyId: company._id });
  res.status(201).json({ data: company });
}));

export const invitationRoutes = Router();
invitationRoutes.post('/accept', validate({ body: z.object({ token: z.string().min(20).max(200) }).strict() }), ah(async (req, res) => {
  const m: any = await Membership.findOne({ inviteTokenHash: sha256(req.body.token), status: 'invited', inviteExpiresAt: { $gt: new Date() } }).select('+inviteTokenHash');
  if (!m) throw badRequest('Invitation is invalid or expired', 'INVALID_INVITE');
  if (m.email !== req.user.email) throw forbidden('This invitation was issued to a different email address');
  m.userId = req.user.id; m.status = 'active'; m.inviteTokenHash = undefined; m.inviteExpiresAt = undefined;
  await m.save();
  await audit(req, { action: 'staff.invite_accepted', entityType: 'Membership', entityId: m._id, companyId: m.companyId });
  res.json({ data: { companyId: String(m.companyId), role: m.role } });
}));

/* ---------- company-scoped (mounted after companyCtx) ---------- */
export const companyRoutes = Router({ mergeParams: true });

companyRoutes.get('/', ah(async (req, res) => {
  res.json({ data: { company: req.company, membership: { role: req.member.role, scope: req.member.scope }, permissions: req.permissions } });
}));
companyRoutes.patch('/', requirePerm('company.update'), validate({ body: z.object({
  name: z.string().trim().min(2).max(120).optional(), timezone: z.string().trim().max(60).optional(),
  contact: z.object({ email: z.string().email().optional(), phone: z.string().max(30).optional() }).strict().optional(),
  settings: z.object({ requireCompletedViewing: z.boolean().optional(), expenseApprovalThresholdMinor: z.number().int().min(0).optional() }).strict().optional(),
}).strict() }), ah(async (req, res) => {
  const set: any = {};
  const b = req.body;
  for (const k of ['name', 'timezone']) if (b[k] !== undefined) set[k] = b[k];
  for (const [k, v] of Object.entries(b.contact ?? {})) set[`contact.${k}`] = v;
  for (const [k, v] of Object.entries(b.settings ?? {})) set[`settings.${k}`] = v;
  const c: any = await Company.findByIdAndUpdate(req.company._id, { $set: set }, { new: true }).lean();
  await audit(req, { action: 'company.update', entityType: 'Company', entityId: req.company._id, meta: b });
  res.json({ data: c });
}));

/* branches */
companyRoutes.get('/branches', ah(async (req, res) => res.json({ data: await Branch.find({ companyId: req.company._id }).sort({ name: 1 }).lean() })));
const branchBody = z.object({ name: z.string().trim().min(2).max(100), city: z.string().trim().max(80).optional(), country: z.string().trim().max(80).optional() }).strict();
companyRoutes.post('/branches', requirePerm('branch.manage'), validate({ body: branchBody }), ah(async (req, res) => {
  const b = await Branch.create({ ...req.body, companyId: req.company._id });
  await audit(req, { action: 'branch.create', entityType: 'Branch', entityId: b._id });
  res.status(201).json({ data: b });
}));
companyRoutes.patch('/branches/:id', requirePerm('branch.manage'), validate({ params: idParam, body: branchBody.partial().extend({ status: z.enum(['active', 'archived']).optional() }) }), ah(async (req, res) => {
  const b: any = await Branch.findOneAndUpdate({ _id: req.params.id, companyId: req.company._id }, { $set: req.body }, { new: true }).lean();
  if (!b) throw notFound('Branch');
  await audit(req, { action: 'branch.update', entityType: 'Branch', entityId: b._id, meta: req.body });
  res.json({ data: b });
}));

/* staff */
const staffBody = z.object({
  role: z.enum(ROLES).refine((r) => r !== 'owner', 'Owner role cannot be assigned'),
  permissions: z.array(z.string().max(60)).max(50).optional(),
  scope: z.enum(['all', 'assigned']).default('assigned'),
  branchIds: z.array(objectId).max(100).default([]),
  propertyIds: z.array(objectId).max(500).default([]),
});
async function assertOwnedRefs(companyId: any, branchIds: string[], propertyIds: string[]) {
  if (branchIds.length && (await Branch.countDocuments({ companyId, _id: { $in: branchIds } })) !== new Set(branchIds).size) throw badRequest('Unknown branch', 'INVALID_BRANCH');
  if (propertyIds.length && (await Property.countDocuments({ companyId, _id: { $in: propertyIds } })) !== new Set(propertyIds).size) throw badRequest('Unknown property', 'INVALID_PROPERTY');
}
const staffView = (m: any) => ({ id: m._id, userId: m.userId, email: m.email, role: m.role, scope: m.scope, status: m.status, permissions: m.permissions, branchIds: m.branchIds, propertyIds: m.propertyIds, inviteExpiresAt: m.inviteExpiresAt });

// Minimal directory (id, name, role) so authorised staff can pick an assignee without holding staff.manage.
companyRoutes.get('/staff/assignable', ah(async (req, res) => {
  if (!['maintenance.assign', 'booking.manage', 'property.update', 'staff.manage'].some((p) => req.permissions.includes(p))) throw forbidden();
  const ms: any[] = await Membership.find({ companyId: req.company._id, status: 'active', userId: { $type: 'objectId' } }).lean();
  const users: any[] = await User.find({ _id: { $in: ms.map((m) => m.userId) } }).select('name').lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  res.json({ data: ms.map((m) => ({ userId: m.userId, name: names.get(String(m.userId)), role: m.role })) });
}));

companyRoutes.get('/staff', requirePerm('staff.manage'), ah(async (req, res) => {
  const ms = await Membership.find({ companyId: req.company._id }).sort({ createdAt: 1 }).lean();
  const users: any[] = await User.find({ _id: { $in: ms.map((m: any) => m.userId).filter(Boolean) } }).select('name').lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  res.json({ data: ms.map((m: any) => ({ ...staffView(m), name: names.get(String(m.userId)) })) });
}));

companyRoutes.post('/staff/invite', requirePerm('staff.manage'), validate({ body: staffBody.extend({ email: z.string().trim().toLowerCase().email() }).strict() }), ah(async (req, res) => {
  const b = req.body;
  await assertOwnedRefs(req.company._id, b.branchIds, b.propertyIds);
  if (await Membership.exists({ companyId: req.company._id, email: b.email })) throw conflict('This email already has a membership or pending invitation', 'ALREADY_MEMBER');
  const token = randomToken(32);
  const existing: any = await User.findOne({ email: b.email }).select('_id').lean();
  const m: any = await Membership.create({
    companyId: req.company._id, email: b.email, role: b.role, scope: b.scope, branchIds: b.branchIds, propertyIds: b.propertyIds,
    permissions: clampGrant(b.role, b.permissions ?? ROLE_DEFAULTS[b.role as keyof typeof ROLE_DEFAULTS]),
    status: 'invited', inviteTokenHash: sha256(token), inviteExpiresAt: new Date(Date.now() + 7 * 86_400_000), invitedBy: req.user.id,
  });
  if (existing) await notifyUsers([existing._id], { type: 'staff.invited', title: `Invitation to join ${req.company.name}`, body: 'Open the app to accept the invitation.', companyId: req.company._id });
  await audit(req, { action: 'staff.invite', entityType: 'Membership', entityId: m._id, meta: { email: b.email, role: b.role } });
  // No email provider is configured: the invite token is returned ONCE to the inviter to share securely.
  res.status(201).json({ data: { ...staffView(m), inviteToken: token, note: 'Email delivery is not configured. Share this token securely; it is shown only once.' } });
}));

companyRoutes.patch('/staff/:id', requirePerm('staff.manage'), validate({ params: idParam, body: staffBody.partial().extend({ status: z.enum(['active', 'deactivated']).optional() }).strict() }), ah(async (req, res) => {
  const m: any = await Membership.findOne({ _id: req.params.id, companyId: req.company._id });
  if (!m) throw notFound('Staff member');
  if (m.role === 'owner') throw forbidden('The owner membership cannot be modified');
  if (String(m.userId) === req.user.id) throw forbidden('You cannot change your own access');
  const b = req.body;
  await assertOwnedRefs(req.company._id, b.branchIds ?? [], b.propertyIds ?? []);
  const role = b.role ?? m.role;
  if (b.role) m.role = b.role;
  if (b.permissions || b.role) m.permissions = clampGrant(role, b.permissions ?? m.permissions);
  if (b.scope) m.scope = b.scope;
  if (b.branchIds) m.branchIds = b.branchIds;
  if (b.propertyIds) m.propertyIds = b.propertyIds;
  if (b.status) {
    if (b.status === 'active' && !m.userId) throw conflict('Invitation has not been accepted yet');
    m.status = b.status;
  }
  await m.save();
  await audit(req, { action: 'staff.update', entityType: 'Membership', entityId: m._id, meta: b });
  res.json({ data: staffView(m) });
}));

/* audit history (restricted) */
companyRoutes.get('/audit', requirePerm('audit.read'), validate({ query: pageQuery.extend({ action: z.string().max(80).optional(), entityType: z.string().max(40).optional(), entityId: objectId.optional(), actorId: objectId.optional() }) }), ah(async (req, res) => {
  const { page, limit, action, entityType, entityId, actorId } = req.query;
  const f: any = { companyId: req.company._id };
  if (action) f.action = action; if (entityType) f.entityType = entityType; if (entityId) f.entityId = entityId; if (actorId) f.actorId = oid(actorId);
  const [data, total] = await Promise.all([AuditLog.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), AuditLog.countDocuments(f)]);
  res.json({ data, meta: pageMeta(page, limit, total) });
}));
