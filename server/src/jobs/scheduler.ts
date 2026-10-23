import { Tenancy } from '../modules/tenancies/model';
import { Property } from '../modules/properties/model';
import { Invoice } from '../modules/payments/model';
import { notifyStaff, notifyUsers } from '../modules/notifications/service';
import { startOfUtcDay } from '../domain/schedule';
import { logger } from '../config/logger';

/** Idempotent housekeeping. Safe to run repeatedly / from several instances (flags are claimed atomically). */
export async function runJobs(now = new Date()) {
  const today = startOfUtcDay(now);
  // 1) expire finished leases and free the property
  const finished: any[] = await Tenancy.find({ status: 'active', 'terms.endDate': { $lt: today } }).limit(200).lean();
  for (const t of finished) {
    const u = await Tenancy.findOneAndUpdate({ _id: t._id, status: 'active' }, { status: 'expired' });
    if (!u) continue;
    await Property.updateOne({ _id: t.propertyId, occupancyStatus: 'occupied' }, { occupancyStatus: 'available' });
    await notifyUsers([t.tenantId], { type: 'lease.expired', title: 'Your lease has ended', companyId: t.companyId });
  }
  // 2) lease expiry reminders (30 days)
  const soon: any[] = await Tenancy.find({ status: 'active', expiryReminderSentAt: { $exists: false }, 'terms.endDate': { $lte: new Date(today.getTime() + 30 * 86_400_000) } }).limit(200).lean();
  for (const t of soon) {
    if (!(await Tenancy.findOneAndUpdate({ _id: t._id, expiryReminderSentAt: { $exists: false } }, { expiryReminderSentAt: now }))) continue;
    const p: any = await Property.findById(t.propertyId).select('title branchId assignedStaffIds').lean();
    await notifyUsers([t.tenantId], { type: 'lease.expiring', title: 'Your lease ends within 30 days', body: p?.title, link: `/tenant/leases/${t._id}`, companyId: t.companyId });
    await notifyStaff(t.companyId, 'lease.manage', p, { type: 'lease.expiring', title: 'Lease expiring within 30 days', body: p?.title, link: `/dashboard/tenancies/${t._id}` });
  }
  // 3) rent due-soon (3 days) and overdue notices
  const dueSoon: any[] = await Invoice.find({ status: { $in: ['issued', 'partially_paid'] }, dueSoonNotifiedAt: { $exists: false }, dueDate: { $gte: now, $lte: new Date(now.getTime() + 3 * 86_400_000) } }).limit(500).lean();
  for (const i of dueSoon) {
    if (!(await Invoice.findOneAndUpdate({ _id: i._id, dueSoonNotifiedAt: { $exists: false } }, { dueSoonNotifiedAt: now }))) continue;
    await notifyUsers([i.tenantId], { type: 'invoice.due_soon', title: 'Rent due soon', body: `Invoice ${i.number}`, link: `/tenant/invoices/${i._id}`, companyId: i.companyId });
  }
  const overdue: any[] = await Invoice.find({ status: { $in: ['issued', 'partially_paid'] }, overdueNotifiedAt: { $exists: false }, dueDate: { $lt: now } }).limit(500).lean();
  for (const i of overdue) {
    if (!(await Invoice.findOneAndUpdate({ _id: i._id, overdueNotifiedAt: { $exists: false } }, { overdueNotifiedAt: now }))) continue;
    const p: any = await Property.findById(i.propertyId).select('title branchId assignedStaffIds').lean();
    await notifyUsers([i.tenantId], { type: 'invoice.overdue', title: 'Invoice overdue', body: `Invoice ${i.number}`, link: `/tenant/invoices/${i._id}`, companyId: i.companyId, priority: 'high' });
    await notifyStaff(i.companyId, 'invoice.read', p, { type: 'invoice.overdue', title: 'Invoice overdue', body: `${p?.title} — ${i.number}`, link: `/dashboard/invoices/${i._id}` });
  }
  logger.info({ expired: finished.length, expiring: soon.length, dueSoon: dueSoon.length, overdue: overdue.length }, 'jobs finished');
}
