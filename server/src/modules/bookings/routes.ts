import { Router } from 'express';
import { z } from 'zod';
import { ViewingBooking } from './model';
import { validateSlotStart, slotEnd } from './slots';
import { Property, isAvailable } from '../properties/model';
import { Membership } from '../companies/model';
import { getScopedProperty, scopeFilter, allowedPropertyIds } from '../companies/scope';
import { requirePerm } from '../../middleware/auth';
import { audit } from '../audit/service';
import { notifyStaff, notifyUsers } from '../notifications/service';
import { ah, idParam, isoDate, objectId, oid, pageMeta, pageQuery, validate } from '../../utils/http';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { assertTransition, BOOKING_TRANSITIONS } from '../../domain/transitions';
import { hasPermission } from '../../domain/permissions';
import { env } from '../../config/env';

const SLOT = env.VIEWING_SLOT_MINUTES;
const populateView = [{ path: 'propertyId', select: 'title reference location.city location.district' }];

async function transition(b: any, to: string, set: any, by: string, note?: string) {
  assertTransition(BOOKING_TRANSITIONS, b.status, to, 'viewing status');
  try {
    const u = await ViewingBooking.findOneAndUpdate(
      { _id: b._id, status: b.status },
      { $set: { ...set, status: to, isActive: ['pending', 'confirmed', 'alternative_proposed'].includes(to) }, $push: { history: { status: to, at: new Date(), by: oid(by), note } } },
      { new: true }
    ).lean();
    if (!u) throw conflict('This viewing was just changed by someone else. Refresh and retry.', 'STALE_STATE');
    return u as any;
  } catch (e: any) {
    if (e?.code === 11000) throw conflict('That time slot is already taken for this staff member or property', 'SLOT_CONFLICT');
    throw e;
  }
}
/** Application-level pre-check; the partial unique indexes remain the source of truth under concurrency. */
async function assertSlotFree(b: any, staffId: string, start: Date) {
  const clash = await ViewingBooking.exists({ _id: { $ne: b._id }, status: 'confirmed', confirmedStart: start, $or: [{ assignedStaffId: oid(staffId) }, { propertyId: b.propertyId }] });
  if (clash) throw conflict('That time slot is already taken for this staff member or property', 'SLOT_CONFLICT');
}

/* ================= CUSTOMER ================= */
export const myBookingRoutes = Router();
myBookingRoutes.post('/', validate({ body: z.object({
  propertyId: objectId, slots: z.array(isoDate).min(1).max(3),
  contact: z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().min(5).max(30), email: z.string().email().max(254).optional() }).strict(),
  message: z.string().trim().max(1000).optional(),
}).strict() }), ah(async (req, res) => {
  const p: any = await Property.findById(req.body.propertyId).lean();
  if (!p || !isAvailable(p)) throw conflict('This property is not currently available for viewing', 'NOT_AVAILABLE'); // authoritative server check
  req.body.slots.forEach((s: Date) => validateSlotStart(s, SLOT));
  const starts = new Set(req.body.slots.map((s: Date) => s.getTime()));
  if (starts.size !== req.body.slots.length) throw badRequest('Duplicate slots', 'INVALID_SLOT');
  try {
    const b: any = await ViewingBooking.create({
      companyId: p.companyId, propertyId: p._id, customerId: req.user.id, contact: req.body.contact, message: req.body.message,
      requestedSlots: req.body.slots.map((s: Date) => ({ start: s, end: slotEnd(s, SLOT) })), history: [{ status: 'pending', at: new Date(), by: oid(req.user.id) }],
    });
    await notifyStaff(p.companyId, 'booking.manage', p, { type: 'booking.requested', title: 'New viewing request', body: `${p.title} (${p.reference})`, link: `/dashboard/bookings/${b._id}` });
    res.status(201).json({ data: b });
  } catch (e: any) {
    if (e?.code === 11000) throw conflict('You already have an active viewing request for this property', 'DUPLICATE_BOOKING');
    throw e;
  }
}));
myBookingRoutes.get('/', validate({ query: pageQuery }), ah(async (req, res) => {
  const { page, limit } = req.query; const f = { customerId: oid(req.user.id) };
  const [data, total] = await Promise.all([ViewingBooking.find(f).select('-history').populate(populateView).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), ViewingBooking.countDocuments(f)]);
  res.json({ data, meta: pageMeta(page, limit, total) });
}));
myBookingRoutes.get('/:id', validate({ params: idParam }), ah(async (req, res) => {
  const b = await ViewingBooking.findOne({ _id: req.params.id, customerId: oid(req.user.id) }).populate(populateView).lean();
  if (!b) throw notFound('Viewing');
  res.json({ data: b });
}));
myBookingRoutes.post('/:id/respond', validate({ params: idParam, body: z.object({ action: z.enum(['accept_alternative', 'cancel']) }).strict() }), ah(async (req, res) => {
  const b: any = await ViewingBooking.findOne({ _id: req.params.id, customerId: oid(req.user.id) }).lean();
  if (!b) throw notFound('Viewing');
  let u: any;
  if (req.body.action === 'cancel') u = await transition(b, 'cancelled', {}, req.user.id, 'Cancelled by customer');
  else {
    if (b.status !== 'alternative_proposed' || !b.proposedStart) throw conflict('There is no proposed alternative to accept', 'INVALID_TRANSITION');
    validateSlotStart(b.proposedStart, SLOT);
    await assertSlotFree(b, String(b.assignedStaffId), b.proposedStart);
    u = await transition(b, 'confirmed', { confirmedStart: b.proposedStart, confirmedEnd: slotEnd(b.proposedStart, SLOT), proposedStart: undefined, proposedEnd: undefined }, req.user.id);
  }
  const p: any = await Property.findById(b.propertyId).select('title reference branchId assignedStaffIds').lean();
  await notifyUsers(b.assignedStaffId ? [b.assignedStaffId] : [], { type: `booking.${u.status}`, title: `Viewing ${u.status.replace('_', ' ')} by customer`, body: p?.title, link: `/dashboard/bookings/${b._id}`, companyId: b.companyId });
  res.json({ data: u });
}));

/* ================= STAFF ================= */
export const bookingRoutes = Router({ mergeParams: true });
bookingRoutes.get('/', requirePerm('booking.manage'), validate({ query: pageQuery.extend({
  status: z.enum(['pending', 'confirmed', 'alternative_proposed', 'completed', 'cancelled', 'rejected', 'no_show']).optional(),
  propertyId: objectId.optional(), staffId: objectId.optional(), from: isoDate.optional(), to: isoDate.optional(), view: z.enum(['list', 'calendar']).default('list'),
}) }), ah(async (req, res) => {
  const { page, limit, status, propertyId, staffId, from, to, view } = req.query;
  const f: any = await scopeFilter(req);
  if (status) f.status = status; if (propertyId) f.propertyId = oid(propertyId); if (staffId) f.assignedStaffId = oid(staffId);
  if (from || to) f.confirmedStart = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (view === 'calendar') { // calendar view: confirmed viewings in the range, no paging
    f.status = status ?? 'confirmed';
    const data = await ViewingBooking.find(f).select('propertyId confirmedStart confirmedEnd assignedStaffId status contact.name').populate(populateView).sort({ confirmedStart: 1 }).limit(500).lean();
    return res.json({ data, timezone: req.company.timezone });
  }
  const [data, total] = await Promise.all([ViewingBooking.find(f).populate(populateView).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), ViewingBooking.countDocuments(f)]);
  res.json({ data, meta: pageMeta(page, limit, total), timezone: req.company.timezone });
}));

bookingRoutes.get('/:id', requirePerm('booking.manage'), validate({ params: idParam }), ah(async (req, res) => {
  const b = await ViewingBooking.findOne({ ...(await scopeFilter(req)), _id: req.params.id }).populate(populateView).lean();
  if (!b) throw notFound('Viewing');
  res.json({ data: b });
}));

const decision = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm'), start: isoDate.optional(), assignedStaffId: objectId.optional() }).strict(),
  z.object({ action: z.literal('propose'), start: isoDate, note: z.string().max(500).optional() }).strict(),
  z.object({ action: z.enum(['reject', 'cancel', 'complete', 'no_show']), note: z.string().max(1000).optional() }).strict(),
]);
bookingRoutes.post('/:id/decision', requirePerm('booking.manage'), validate({ params: idParam, body: decision }), ah(async (req, res) => {
  const b: any = await ViewingBooking.findOne({ ...(await scopeFilter(req)), _id: req.params.id }).lean();
  if (!b) throw notFound('Viewing');
  const body = req.body; let u: any;
  const staffIdFor = async (): Promise<string> => {
    const id = body.assignedStaffId ?? req.user.id;
    if (id !== req.user.id) {
      const m: any = await Membership.findOne({ companyId: req.company._id, userId: oid(id), status: 'active' }).lean();
      if (!m || !hasPermission(m, 'booking.manage')) throw badRequest('Assignee must be active staff with booking permission', 'INVALID_STAFF');
      const ids = await allowedPropertyIds(m, req.company._id);
      if (ids && !ids.some((x) => String(x) === String(b.propertyId))) throw badRequest('Assignee has no access to this property', 'INVALID_STAFF');
    }
    return id;
  };
  if (body.action === 'confirm') {
    const start: Date = body.start ?? b.requestedSlots?.[0]?.start;
    validateSlotStart(start, SLOT);
    const staff = await staffIdFor();
    await assertSlotFree(b, staff, start);
    u = await transition(b, 'confirmed', { confirmedStart: start, confirmedEnd: slotEnd(start, SLOT), assignedStaffId: oid(staff) }, req.user.id);
  } else if (body.action === 'propose') {
    validateSlotStart(body.start, SLOT);
    const staff = String(b.assignedStaffId ?? req.user.id);
    await assertSlotFree(b, staff, body.start);
    u = await transition(b, 'alternative_proposed', { proposedStart: body.start, proposedEnd: slotEnd(body.start, SLOT), assignedStaffId: oid(staff) }, req.user.id, body.note);
  } else if (body.action === 'complete' || body.action === 'no_show') {
    if (!b.confirmedStart || b.confirmedStart > new Date()) throw conflict('Outcome can only be recorded after the viewing time', 'TOO_EARLY');
    u = await transition(b, body.action === 'complete' ? 'completed' : 'no_show', { outcomeNote: body.note }, req.user.id, body.note);
  } else {
    u = await transition(b, body.action === 'reject' ? 'rejected' : 'cancelled', {}, req.user.id, body.note);
  }
  await audit(req, { action: `booking.${body.action}`, entityType: 'ViewingBooking', entityId: b._id });
  const p: any = await Property.findById(b.propertyId).select('title').lean();
  await notifyUsers([b.customerId], { type: `booking.${u.status}`, title: `Viewing ${u.status.replace(/_/g, ' ')}`, body: p?.title, link: `/account/bookings/${b._id}`, companyId: b.companyId });
  res.json({ data: u });
}));
