import { Router } from 'express';
import { z } from 'zod';
import { RentalApplication } from './model';
import { Property, isAvailable } from '../properties/model';
import { Company } from '../companies/model';
import { ViewingBooking } from '../bookings/model';
import { scopeFilter } from '../companies/scope';
import { requirePerm } from '../../middleware/auth';
import { audit } from '../audit/service';
import { notifyStaff, notifyUsers } from '../notifications/service';
import { ah, idParam, isoDate, objectId, oid, pageMeta, pageQuery, validate } from '../../utils/http';
import { conflict, notFound } from '../../utils/errors';
import { APPLICATION_TRANSITIONS, assertTransition } from '../../domain/transitions';
import { checkUpload, uploadOne } from '../files/upload';
import { saveFile, signedUrl } from '../files/storage';

const formSchema = z.object({
  fullName: z.string().trim().min(2).max(120), phone: z.string().trim().min(5).max(30), email: z.string().email().max(254),
  occupants: z.number().int().min(1).max(20), employmentStatus: z.enum(['employed', 'self_employed', 'student', 'other']),
  desiredMoveIn: isoDate, desiredTermMonths: z.number().int().min(1).max(60), notes: z.string().trim().max(1000).optional(),
}).strict();
const OPEN = ['draft', 'submitted', 'under_review', 'information_required'];

async function move(a: any, to: string, by: string, set: any = {}, note?: string) {
  assertTransition(APPLICATION_TRANSITIONS, a.status, to, 'application status');
  const u = await RentalApplication.findOneAndUpdate(
    { _id: a._id, status: a.status },
    { $set: { ...set, status: to, isOpen: OPEN.includes(to) }, $push: { history: { status: to, at: new Date(), by: oid(by), note } } }, { new: true }
  ).lean();
  if (!u) throw conflict('This application was just changed. Refresh and retry.', 'STALE_STATE');
  return u as any;
}
async function assertApplicable(propertyId: any, userId: string) {
  const p: any = await Property.findById(propertyId).lean();
  if (!p || !isAvailable(p) || p.transaction !== 'rent') throw conflict('This property is not available for rental applications', 'NOT_AVAILABLE');
  const c: any = await Company.findById(p.companyId).select('settings status').lean();
  if (!c || c.status !== 'active') throw conflict('This property is not available for rental applications', 'NOT_AVAILABLE');
  if (c.settings?.requireCompletedViewing && !(await ViewingBooking.exists({ propertyId: p._id, customerId: oid(userId), status: 'completed' })))
    throw conflict('A completed viewing is required before applying for this property', 'VIEWING_REQUIRED');
  return p;
}
const withDocUrls = (a: any) => ({ ...a, documents: (a.documents ?? []).map((d: any) => ({ name: d.name, mime: d.mime, size: d.size, uploadedAt: d.uploadedAt, url: signedUrl(d.key, 600) })) });

/* ================= CUSTOMER ================= */
export const myApplicationRoutes = Router();
myApplicationRoutes.post('/', validate({ body: z.object({ propertyId: objectId, form: formSchema, submit: z.boolean().default(false) }).strict() }), ah(async (req, res) => {
  const p = await assertApplicable(req.body.propertyId, req.user.id);
  try {
    const a: any = await RentalApplication.create({
      companyId: p.companyId, propertyId: p._id, applicantId: req.user.id, form: req.body.form,
      status: req.body.submit ? 'submitted' : 'draft', history: [{ status: req.body.submit ? 'submitted' : 'draft', at: new Date(), by: oid(req.user.id) }],
    });
    if (req.body.submit) await notifyStaff(p.companyId, 'application.review', p, { type: 'application.submitted', title: 'New rental application', body: p.title, link: `/dashboard/applications/${a._id}` });
    res.status(201).json({ data: a });
  } catch (e: any) {
    if (e?.code === 11000) throw conflict('You already have an open application for this property', 'DUPLICATE_APPLICATION');
    throw e;
  }
}));
myApplicationRoutes.get('/', validate({ query: pageQuery }), ah(async (req, res) => {
  const { page, limit } = req.query; const f = { applicantId: oid(req.user.id) };
  const [data, total] = await Promise.all([RentalApplication.find(f).select('-history').populate('propertyId', 'title reference').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), RentalApplication.countDocuments(f)]);
  res.json({ data, meta: pageMeta(page, limit, total) });
}));
const mine = async (req: any) => {
  const a: any = await RentalApplication.findOne({ _id: req.params.id, applicantId: oid(req.user.id) }).lean();
  if (!a) throw notFound('Application');
  return a;
};
myApplicationRoutes.get('/:id', validate({ params: idParam }), ah(async (req, res) => res.json({ data: withDocUrls(await mine(req)) })));
myApplicationRoutes.patch('/:id', validate({ params: idParam, body: z.object({ form: formSchema }).strict() }), ah(async (req, res) => {
  const a = await mine(req);
  if (a.status !== 'draft') throw conflict('Only drafts can be edited', 'NOT_DRAFT');
  res.json({ data: await RentalApplication.findOneAndUpdate({ _id: a._id, status: 'draft' }, { form: req.body.form }, { new: true }).lean() });
}));
myApplicationRoutes.post('/:id/submit', validate({ params: idParam }), ah(async (req, res) => {
  const a = await mine(req);
  const p = await assertApplicable(a.propertyId, req.user.id);
  const u = await move(a, 'submitted', req.user.id);
  await notifyStaff(p.companyId, 'application.review', p, { type: 'application.submitted', title: 'New rental application', body: p.title, link: `/dashboard/applications/${a._id}` });
  res.json({ data: u });
}));
myApplicationRoutes.post('/:id/withdraw', validate({ params: idParam }), ah(async (req, res) => res.json({ data: await move(await mine(req), 'withdrawn', req.user.id) })));
myApplicationRoutes.post('/:id/respond', validate({ params: idParam, body: z.object({ message: z.string().trim().min(1).max(1000) }).strict() }), ah(async (req, res) => {
  const a = await mine(req);
  if (a.status !== 'information_required') throw conflict('No information has been requested', 'INVALID_TRANSITION');
  const idx = (a.infoRequests ?? []).length - 1;
  await RentalApplication.updateOne({ _id: a._id }, { $set: { [`infoRequests.${idx}.response`]: req.body.message, [`infoRequests.${idx}.respondedAt`]: new Date() } });
  const u = await move(a, 'under_review', req.user.id, {}, 'Applicant responded');
  const p: any = await Property.findById(a.propertyId).lean();
  await notifyStaff(a.companyId, 'application.review', p, { type: 'application.responded', title: 'Applicant provided requested information', body: p?.title, link: `/dashboard/applications/${a._id}` });
  res.json({ data: u });
}));
myApplicationRoutes.post('/:id/documents', validate({ params: idParam }), uploadOne, ah(async (req, res) => {
  const a = await mine(req);
  if (!OPEN.includes(a.status)) throw conflict('Application is closed', 'CLOSED');
  if ((a.documents?.length ?? 0) >= 5) throw conflict('Maximum 5 documents', 'DOC_LIMIT');
  const { buf, type, originalName } = checkUpload(req.file, ['pdf', 'image']);
  const saved = await saveFile(buf, type, 'private');
  await RentalApplication.updateOne({ _id: a._id }, { $push: { documents: { key: saved.key, name: originalName, mime: type.mime, size: buf.length, uploadedAt: new Date() } } });
  res.status(201).json({ data: { name: originalName, mime: type.mime, size: buf.length } });
}));

/* ================= STAFF ================= */
export const applicationRoutes = Router({ mergeParams: true });
applicationRoutes.get('/', requirePerm('application.review'), validate({ query: pageQuery.extend({ status: z.enum(['submitted', 'under_review', 'information_required', 'approved', 'rejected', 'withdrawn', 'expired']).optional(), propertyId: objectId.optional() }) }), ah(async (req, res) => {
  const { page, limit, status, propertyId } = req.query;
  const f: any = { ...(await scopeFilter(req)), status: status ?? { $ne: 'draft' } }; // staff never see unsubmitted drafts
  if (propertyId) f.propertyId = oid(propertyId);
  const [data, total] = await Promise.all([RentalApplication.find(f).select('-documents.key').populate('propertyId', 'title reference').populate('applicantId', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), RentalApplication.countDocuments(f)]);
  res.json({ data, meta: pageMeta(page, limit, total) });
}));
applicationRoutes.get('/:id', requirePerm('application.review'), validate({ params: idParam }), ah(async (req, res) => {
  const a: any = await RentalApplication.findOne({ ...(await scopeFilter(req)), _id: req.params.id, status: { $ne: 'draft' } }).populate('propertyId', 'title reference').lean();
  if (!a) throw notFound('Application');
  await audit(req, { action: 'application.view', entityType: 'RentalApplication', entityId: a._id }); // sensitive data access is logged
  res.json({ data: withDocUrls(a) });
}));
applicationRoutes.post('/:id/status', requirePerm('application.review'), validate({ params: idParam, body: z.object({
  status: z.enum(['under_review', 'information_required', 'approved', 'rejected']), message: z.string().trim().max(1000).optional(),
}).strict().refine((b) => b.status !== 'information_required' || !!b.message, { message: 'A message is required when requesting information', path: ['message'] }) }), ah(async (req, res) => {
  const a: any = await RentalApplication.findOne({ ...(await scopeFilter(req)), _id: req.params.id, status: { $ne: 'draft' } }).lean();
  if (!a) throw notFound('Application');
  const { status, message } = req.body;
  const set: any = {};
  if (status === 'approved' || status === 'rejected') { set.decidedBy = oid(req.user.id); set.decisionNote = message; }
  if (status === 'approved') {
    const p: any = await Property.findById(a.propertyId).select('listingStatus').lean();
    if (!p || p.listingStatus === 'archived') throw conflict('Property is archived', 'ARCHIVED');
  }
  const u = await move(a, status, req.user.id, set, message);
  if (status === 'information_required') await RentalApplication.updateOne({ _id: a._id }, { $push: { infoRequests: { message, requestedBy: oid(req.user.id), requestedAt: new Date() } } });
  await audit(req, { action: `application.${status}`, entityType: 'RentalApplication', entityId: a._id });
  // NOTE: approval does NOT create or activate a tenancy; that is a separate lease workflow.
  await notifyUsers([a.applicantId], { type: `application.${status}`, title: `Application ${status.replace(/_/g, ' ')}`, body: message, link: `/account/applications/${a._id}`, companyId: a.companyId });
  res.json({ data: u });
}));
