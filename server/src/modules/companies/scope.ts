import { Types } from 'mongoose';
import { Property } from '../properties/model';
import { notFound } from '../../utils/errors';

/** Property ids a member may touch; null = unrestricted within the company. */
export async function allowedPropertyIds(member: any, companyId: any): Promise<Types.ObjectId[] | null> {
  if (member.role === 'owner' || member.scope === 'all') return null;
  return Property.find({
    companyId,
    $or: [{ _id: { $in: member.propertyIds ?? [] } }, { branchId: { $in: member.branchIds ?? [] } }, { assignedStaffIds: member.userId }],
  }).distinct('_id');
}

/** Mongo filter for company-owned records that carry a propertyId. Always includes companyId from the *membership*, never the client. */
export async function scopeFilter(req: any, field = 'propertyId') {
  const ids = await allowedPropertyIds(req.member, req.company._id);
  return ids ? { companyId: req.company._id, [field]: { $in: ids } } : { companyId: req.company._id };
}

/** Loads a property only if it belongs to the caller's company AND inside their scope; otherwise 404 (no IDOR leak). */
export async function getScopedProperty(req: any, propertyId: string, select?: string) {
  const ids = await allowedPropertyIds(req.member, req.company._id);
  if (ids && !ids.some((i) => String(i) === String(propertyId))) throw notFound('Property');
  const p = await Property.findOne({ _id: propertyId, companyId: req.company._id }).select(select ?? '').lean();
  if (!p) throw notFound('Property');
  return p as any;
}
