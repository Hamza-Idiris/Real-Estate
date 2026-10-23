import { Types } from 'mongoose';
import { Notification } from './model';
import { Membership } from '../companies/model';
import { hasPermission, Permission } from '../../domain/permissions';
import { logger } from '../../config/logger';

/**
 * IN-APP ONLY. No email/push provider is configured; nothing here claims external delivery.
 * (Future: add a delivery adapter that is called after the in-app record is created.)
 */
export type NotifyInput = {
  type: string; title: string; body?: string; link?: string; companyId?: any;
  priority?: 'normal' | 'high' | 'emergency';
};
export async function notifyUsers(userIds: any[], n: NotifyInput) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  if (!ids.length) return;
  try {
    await Notification.insertMany(ids.map((id) => ({ ...n, userId: new Types.ObjectId(id) })));
  } catch (e) {
    logger.error({ err: e }, 'notification insert failed');
  }
}

/** Notify active staff of a company holding `perm` whose scope covers the property (owners always included). */
export async function notifyStaff(companyId: any, perm: Permission, property: any | null, n: NotifyInput) {
  const members = await Membership.find({ companyId, status: 'active', userId: { $type: 'objectId' } }).lean();
  const targets = members.filter((m: any) => {
    if (!hasPermission(m, perm)) return false;
    if (!property || m.role === 'owner' || m.scope === 'all') return true;
    const pid = String(property._id);
    return (
      (m.propertyIds ?? []).some((x: any) => String(x) === pid) ||
      (m.branchIds ?? []).some((x: any) => String(x) === String(property.branchId)) ||
      (property.assignedStaffIds ?? []).some((x: any) => String(x) === String(m.userId))
    );
  });
  await notifyUsers(targets.map((m: any) => m.userId), { ...n, companyId });
}
