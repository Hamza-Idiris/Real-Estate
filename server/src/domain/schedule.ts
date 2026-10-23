import { badRequest } from '../utils/errors';

export type Frequency = 'monthly' | 'quarterly' | 'yearly';
export const FREQ_MONTHS: Record<Frequency, number> = { monthly: 1, quarterly: 3, yearly: 12 };

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
export const startOfUtcDay = (d: Date) => utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Adds months in UTC, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonthsUTC(d: Date, months: number): Date {
  const total = d.getUTCMonth() + months;
  const y = d.getUTCFullYear() + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return utc(y, m, Math.min(d.getUTCDate(), daysInMonth(y, m)));
}
export const addDaysUTC = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export type Period = { index: number; periodStart: Date; periodEnd: Date; dueDate: Date; amountMinor: number };
export type ScheduleTerms = { startDate: Date; endDate: Date; frequency: Frequency; dueDay: number; rentMinor: number };

/**
 * Lease terms: endDate is INCLUSIVE. The term must be a whole number of billing periods
 * (no pro-rating is performed). rentMinor is the rent per billing period.
 */
export function generateSchedule(t: ScheduleTerms): Period[] {
  const start = startOfUtcDay(t.startDate);
  const endExclusive = addDaysUTC(startOfUtcDay(t.endDate), 1);
  if (endExclusive <= start) throw badRequest('Lease end date must be after the start date', 'INVALID_TERM');
  const step = FREQ_MONTHS[t.frequency];
  const out: Period[] = [];
  for (let i = 0; ; i++) {
    const ps = addMonthsUTC(start, i * step);
    if (ps >= endExclusive) break;
    const pe = addMonthsUTC(start, (i + 1) * step);
    if (pe > endExclusive) throw badRequest('Lease term must be a whole number of billing periods', 'INVALID_TERM');
    let due: Date;
    if (i === 0) due = ps;
    else {
      const y = ps.getUTCFullYear(), m = ps.getUTCMonth();
      due = utc(y, m, Math.min(t.dueDay, daysInMonth(y, m)));
      if (due < ps) due = utc(y, m + 1, Math.min(t.dueDay, daysInMonth(y, m + 1)));
    }
    out.push({ index: i, periodStart: ps, periodEnd: pe, dueDate: due, amountMinor: t.rentMinor });
    if (i > 600) throw badRequest('Lease term too long', 'INVALID_TERM');
  }
  return out;
}

export type InvoiceLike = { status: string; totalMinor: number; paidMinor: number; dueDate: Date };
/** Overdue is derived at read-time; stored status never claims "overdue". */
export function effectiveInvoiceStatus(inv: InvoiceLike, now = new Date()): string {
  if ((inv.status === 'issued' || inv.status === 'partially_paid') && inv.dueDate < now) return 'overdue';
  return inv.status;
}
export const outstandingMinor = (inv: { totalMinor: number; paidMinor: number; status?: string }) =>
  inv.status === 'void' ? 0 : Math.max(0, inv.totalMinor - inv.paidMinor);
