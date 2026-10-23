import { Router } from 'express';
import { z } from 'zod';
import { Property, PROPERTY_TYPES, publicProperty, isAvailable } from './model';
import { Branch, Company, Membership } from '../companies/model';
import { Tenancy } from '../tenancies/model';
import { getScopedProperty, scopeFilter } from '../companies/scope';
import { requirePerm } from '../../middleware/auth';
import { audit } from '../audit/service';
import { ah, escapeRegex, idParam, objectId, oid, pageMeta, pageQuery, validate } from '../../utils/http';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { currencySchema, minorSchema } from '../../utils/money';
import { randomCode } from '../../utils/ids';
import { checkUpload, uploadOne } from '../files/upload';
import { publicUrl, removeFile, saveFile } from '../files/storage';
import { hasPermission } from '../../domain/permissions';

/* ================= PUBLIC MARKETPLACE ================= */
export const publicPropertyRoutes = Router();
const cacheHdr = (res: any) => res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
const csv = z.string().max(300).transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20));

const searchQuery = pageQuery.extend({
  q: z.string().trim().max(100).optional(),
  country: z.string().trim().max(80).optional(), city: z.string().trim().max(80).optional(), district: z.string().trim().max(80).optional(),
  type: z.enum(PROPERTY_TYPES).optional(), transaction: z.enum(['rent', 'sale']).optional(),
  minPrice: z.coerce.number().int().min(0).optional(), maxPrice: z.coerce.number().int().min(0).optional(), // MINOR units
  currency: currencySchema.optional(),
  bedrooms: z.coerce.number().int().min(0).max(50).optional(), bathrooms: z.coerce.number().int().min(0).max(50).optional(), // minimum
  furnished: z.enum(['true', 'false']).optional(),
  availability: z.enum(['available', 'any']).default('available'),
  amenities: csv.optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'size_desc', 'relevance']).default('newest'),
}).strict();

publicPropertyRoutes.get('/', validate({ query: searchQuery }), ah(async (req, res) => {
  const f = req.query;
  const filter: any = { listingStatus: 'published' };
  if (f.availability === 'available') filter.occupancyStatus = 'available';
  if (f.q) filter.$text = { $search: f.q };
  const ci = (v: string) => new RegExp(`^${escapeRegex(v)}$`, 'i');
  if (f.country) filter['location.country'] = ci(f.country);
  if (f.city) filter['location.city'] = ci(f.city);
  if (f.district) filter['location.district'] = ci(f.district);
  if (f.type) filter.type = f.type;
  if (f.transaction) filter.transaction = f.transaction;
  if (f.currency) filter.currency = f.currency;
  if (f.minPrice !== undefined || f.maxPrice !== undefined) filter.priceMinor = { ...(f.minPrice !== undefined && { $gte: f.minPrice }), ...(f.maxPrice !== undefined && { $lte: f.maxPrice }) };
  if (f.bedrooms !== undefined) filter.bedrooms = { $gte: f.bedrooms };
  if (f.bathrooms !== undefined) filter.bathrooms = { $gte: f.bathrooms };
  if (f.furnished) filter.furnished = f.furnished === 'true';
  if (f.amenities?.length) filter.amenities = { $all: f.amenities };
  const sort: any = f.sort === 'price_asc' ? { priceMinor: 1 } : f.sort === 'price_desc' ? { priceMinor: -1 } : f.sort === 'size_desc' ? { sizeSqm: -1 } : f.sort === 'relevance' && f.q ? { score: { $meta: 'textScore' } } : { publishedAt: -1, _id: -1 };
  const proj: any = f.q ? { score: { $meta: 'textScore' } } : {};
  const [items, total] = await Promise.all([
    Property.find(filter, proj).sort(sort).skip((f.page - 1) * f.limit).limit(f.limit).lean(),
    Property.countDocuments(filter),
  ]);
  const companies: any[] = await Company.find({ _id: { $in: items.map((p: any) => p.companyId) } }).select('name').lean();
  const cmap = new Map(companies.map((c) => [String(c._id), c]));
  cacheHdr(res);
  res.json({ data: items.map((p: any) => publicProperty(p, cmap.get(String(p.companyId)))), meta: pageMeta(f.page, f.limit, total) });
}));

// facets for homepage (categories & locations) — real data only
publicPropertyRoutes.get('/facets', ah(async (_req, res) => {
  const match = { listingStatus: 'published', occupancyStatus: 'available' };
  const [types, cities] = await Promise.all([
    Property.aggregate([{ $match: match }, { $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Property.aggregate([{ $match: match }, { $group: { _id: { country: '$location.country', city: '$location.city' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
  ]);
  cacheHdr(res);
  res.json({ data: { types: types.map((t) => ({ type: t._id, count: t.count })), locations: cities.map((c) => ({ ...c._id, count: c.count })) } });
}));

async function findPublic(idOrRef: string) {
  const byId = /^[a-f\d]{24}$/i.test(idOrRef);
  const p: any = await Property.findOne({ ...(byId ? { _id: idOrRef } : { reference: idOrRef.toUpperCase() }), listingStatus: { $in: ['published'] } }).lean();
  if (!p) throw notFound('Property');
  return p;
}
publicPropertyRoutes.get('/:idOrRef', validate({ params: z.object({ idOrRef: z.string().min(4).max(40) }) }), ah(async (req, res) => {
  const p = await findPublic(req.params.idOrRef);
  const c: any = await Company.findById(p.companyId).select('name').lean();
  cacheHdr(res);
  res.json({ data: publicProperty(p, c) });
}));
publicPropertyRoutes.get('/:idOrRef/similar', validate({ params: z.object({ idOrRef: z.string().min(4).max(40) }) }), ah(async (req, res) => {
  const p = await findPublic(req.params.idOrRef);
  const sim: any[] = await Property.find({ _id: { $ne: p._id }, listingStatus: 'published', occupancyStatus: 'available', transaction: p.transaction, 'location.city': p.location.city, type: p.type })
    .sort({ publishedAt: -1 }).limit(6).lean();
  cacheHdr(res);
  res.json({ data: sim.map((x) => publicProperty(x)) });
}));

/* ================= COMPANY MANAGEMENT ================= */
export const propertyRoutes = Router({ mergeParams: true });

const feeSchema = z.object({ name: z.string().trim().min(1).max(80), amountMinor: minorSchema }).strict();
const baseProp = z.object({
  branchId: objectId,
  title: z.string().trim().min(3).max(140), description: z.string().trim().max(5000).default(''),
  type: z.enum(PROPERTY_TYPES), transaction: z.enum(['rent', 'sale']),
  priceMinor: minorSchema, currency: currencySchema,
  rentFrequency: z.enum(['monthly', 'quarterly', 'yearly']).optional(), depositMinor: minorSchema.default(0), fees: z.array(feeSchema).max(10).default([]),
  location: z.object({
    country: z.string().trim().min(2).max(80), city: z.string().trim().min(1).max(80), district: z.string().trim().max(80).optional(),
    address: z.string().trim().max(200).optional(), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
  }).strict(),
  bedrooms: z.number().int().min(0).max(50).default(0), bathrooms: z.number().int().min(0).max(50).default(0),
  sizeSqm: z.number().min(0).max(1_000_000).optional(), furnished: z.boolean().default(false),
  amenities: z.array(z.string().trim().min(1).max(40)).max(40).default([]),
}).strict();
const createProp = baseProp.refine((v) => v.transaction !== 'rent' || !!v.rentFrequency, { message: 'rentFrequency is required for rentals', path: ['rentFrequency'] });
const updateProp = baseProp.partial().strict();

async function assertBranch(companyId: any, branchId: string) {
  if (!(await Branch.exists({ _id: branchId, companyId, status: 'active' }))) throw badRequest('Unknown or inactive branch', 'INVALID_BRANCH');
}
const newRef = () => `EF-${randomCode(7)}`;

propertyRoutes.get('/', requirePerm('property.read'), validate({ query: pageQuery.extend({
  status: z.enum(['draft', 'published', 'unpublished', 'archived']).optional(), occupancy: z.enum(['available', 'occupied', 'maintenance']).optional(),
  branchId: objectId.optional(), q: z.string().trim().max(80).optional(), sort: z.enum(['newest', 'title', 'price']).default('newest'),
}) }), ah(async (req, res) => {
  const { page, limit, status, occupancy, branchId, q, sort } = req.query;
  const filter: any = await scopeFilter(req, '_id');
  if (status) filter.listingStatus = status; else filter.listingStatus = { $ne: 'archived' };
  if (occupancy) filter.occupancyStatus = occupancy;
  if (branchId) filter.branchId = oid(branchId);
  if (q) filter.$or = [{ title: new RegExp(escapeRegex(q), 'i') }, { reference: new RegExp(`^${escapeRegex(q)}`, 'i') }];
  const s: any = sort === 'title' ? { title: 1 } : sort === 'price' ? { priceMinor: -1 } : { createdAt: -1 };
  const [data, total] = await Promise.all([Property.find(filter).select('-lockCounter').sort(s).skip((page - 1) * limit).limit(limit).lean(), Property.countDocuments(filter)]);
  res.json({ data, meta: pageMeta(page, limit, total) });
}));

propertyRoutes.post('/', requirePerm('property.create'), validate({ body: createProp }), ah(async (req, res) => {
  await assertBranch(req.company._id, req.body.branchId);
  const p: any = await Property.create({ ...req.body, companyId: req.company._id, reference: newRef(), createdBy: req.user.id, assignedStaffIds: [] });
  await audit(req, { action: 'property.create', entityType: 'Property', entityId: p._id });
  res.status(201).json({ data: p });
}));

propertyRoutes.get('/:id', requirePerm('property.read'), validate({ params: idParam }), ah(async (req, res) => {
  const p = await getScopedProperty(req, req.params.id, '-lockCounter');
  const activeTenancy = await Tenancy.findOne({ propertyId: p._id, status: 'active' }).select('tenantId terms status').lean();
  res.json({ data: { ...p, activeTenancy: hasPermission(req.member, 'tenant.read') ? activeTenancy : undefined } });
}));

propertyRoutes.patch('/:id', requirePerm('property.update'), validate({ params: idParam, body: updateProp }), ah(async (req, res) => {
  const cur = await getScopedProperty(req, req.params.id);
  if (cur.listingStatus === 'archived') throw conflict('Archived properties cannot be edited', 'ARCHIVED');
  if (req.body.branchId) await assertBranch(req.company._id, req.body.branchId);
  const merged = { ...cur, ...req.body };
  if (merged.transaction === 'rent' && !merged.rentFrequency) throw badRequest('rentFrequency is required for rentals', 'VALIDATION_ERROR');
  if (req.body.location) req.body.location = { ...cur.location, ...req.body.location };
  const hasLease = await Tenancy.exists({ propertyId: cur._id, status: { $in: ['active', 'pending'] } });
  if (hasLease && (req.body.transaction && req.body.transaction !== cur.transaction)) throw conflict('Cannot change transaction type while a lease exists', 'HAS_LEASE');
  const p = await Property.findOneAndUpdate({ _id: cur._id, companyId: req.company._id }, { $set: req.body }, { new: true }).select('-lockCounter').lean();
  await audit(req, { action: 'property.update', entityType: 'Property', entityId: cur._id, meta: { fields: Object.keys(req.body) } });
  res.json({ data: p });
}));

propertyRoutes.post('/:id/publish', requirePerm('property.update'), validate({ params: idParam }), ah(async (req, res) => {
  const p = await getScopedProperty(req, req.params.id);
  if (p.listingStatus === 'archived') throw conflict('Archived properties cannot be published', 'ARCHIVED');
  const problems: string[] = [];
  if (!p.media?.length) problems.push('Add at least one image');
  if (!p.priceMinor) problems.push('Set a price');
  if (!p.location?.city) problems.push('Set the city');
  if (problems.length) throw badRequest('Listing is not ready to publish', 'NOT_PUBLISHABLE', problems);
  const u = await Property.findByIdAndUpdate(p._id, { listingStatus: 'published', publishedAt: p.publishedAt ?? new Date() }, { new: true }).select('-lockCounter').lean();
  await audit(req, { action: 'property.publish', entityType: 'Property', entityId: p._id });
  res.json({ data: u });
}));
propertyRoutes.post('/:id/unpublish', requirePerm('property.update'), validate({ params: idParam }), ah(async (req, res) => {
  const p = await getScopedProperty(req, req.params.id);
  if (p.listingStatus !== 'published') throw conflict('Listing is not published', 'INVALID_TRANSITION');
  const u = await Property.findByIdAndUpdate(p._id, { listingStatus: 'unpublished' }, { new: true }).select('-lockCounter').lean();
  await audit(req, { action: 'property.unpublish', entityType: 'Property', entityId: p._id });
  res.json({ data: u });
}));
propertyRoutes.post('/:id/archive', requirePerm('property.archive'), validate({ params: idParam }), ah(async (req, res) => {
  const p = await getScopedProperty(req, req.params.id);
  if (await Tenancy.exists({ propertyId: p._id, status: { $in: ['active', 'pending'] } })) throw conflict('This property has an active or pending lease and cannot be archived', 'HAS_LEASE');
  const u = await Property.findByIdAndUpdate(p._id, { listingStatus: 'archived', archivedAt: new Date() }, { new: true }).select('-lockCounter').lean();
  await audit(req, { action: 'property.archive', entityType: 'Property', entityId: p._id });
  res.json({ data: u });
}));
propertyRoutes.post('/:id/occupancy', requirePerm('property.update'), validate({ params: idParam, body: z.object({ occupancyStatus: z.enum(['available', 'maintenance']) }).strict() }), ah(async (req, res) => {
  const p = await getScopedProperty(req, req.params.id);
  if (await Tenancy.exists({ propertyId: p._id, status: 'active' })) throw conflict('Occupancy is controlled by the active lease', 'HAS_LEASE');
  const u = await Property.findByIdAndUpdate(p._id, { occupancyStatus: req.body.occupancyStatus }, { new: true }).select('-lockCounter').lean();
  await audit(req, { action: 'property.occupancy', entityType: 'Property', entityId: p._id, meta: req.body });
  res.json({ data: u });
}));

propertyRoutes.put('/:id/staff', requirePerm('property.update', 'staff.manage'), validate({ params: idParam, body: z.object({ staffUserIds: z.array(objectId).max(50) }).strict() }), ah(async (req, res) => {
  const p = await getScopedProperty(req, req.params.id);
  const ids = [...new Set(req.body.staffUserIds)] as string[];
  if (ids.length && (await Membership.countDocuments({ companyId: req.company._id, userId: { $in: ids }, status: 'active' })) !== ids.length) throw badRequest('All assigned users must be active staff of this company', 'INVALID_STAFF');
  const u = await Property.findByIdAndUpdate(p._id, { assignedStaffIds: ids }, { new: true }).select('assignedStaffIds').lean();
  await audit(req, { action: 'property.assign_staff', entityType: 'Property', entityId: p._id, meta: { ids } });
  res.json({ data: u });
}));

/* media */
propertyRoutes.post('/:id/media', requirePerm('property.update'), validate({ params: idParam }), uploadOne, ah(async (req, res) => {
  const p = await getScopedProperty(req, req.params.id);
  if ((p.media?.length ?? 0) >= 20) throw conflict('Maximum 20 images per property', 'MEDIA_LIMIT');
  const { buf, type } = checkUpload(req.file, ['image']);
  const alt = String(req.body?.alt ?? '').slice(0, 160);
  const saved = await saveFile(buf, type, 'public');
  const item = { key: saved.key, url: publicUrl(saved.key), alt, order: (p.media?.length ?? 0) };
  await Property.updateOne({ _id: p._id }, { $push: { media: item } });
  await audit(req, { action: 'property.media_add', entityType: 'Property', entityId: p._id });
  res.status(201).json({ data: item });
}));
propertyRoutes.put('/:id/media/order', requirePerm('property.update'), validate({ params: idParam, body: z.object({ keys: z.array(z.string().max(80)).max(20) }).strict() }), ah(async (req, res) => {
  const p = await getScopedProperty(req, req.params.id);
  const have = new Set((p.media ?? []).map((m: any) => m.key));
  if (req.body.keys.length !== have.size || !req.body.keys.every((k: string) => have.has(k))) throw badRequest('keys must list every existing image exactly once', 'INVALID_ORDER');
  const byKey = new Map(p.media.map((m: any) => [m.key, m]));
  const media = req.body.keys.map((k: string, i: number) => ({ ...(byKey.get(k) as any), order: i }));
  await Property.updateOne({ _id: p._id }, { media });
  res.json({ data: media });
}));
propertyRoutes.delete('/:id/media', requirePerm('property.update'), validate({ params: idParam, body: z.object({ key: z.string().max(80) }).strict() }), ah(async (req, res) => {
  const p = await getScopedProperty(req, req.params.id);
  const m = (p.media ?? []).find((x: any) => x.key === req.body.key);
  if (!m) throw notFound('Image');
  if (p.listingStatus === 'published' && p.media.length === 1) throw conflict('Unpublish the listing before removing its last image', 'LAST_IMAGE');
  await Property.updateOne({ _id: p._id }, { $pull: { media: { key: m.key } } });
  await removeFile(m.key);
  await audit(req, { action: 'property.media_remove', entityType: 'Property', entityId: p._id });
  res.status(204).end();
}));
