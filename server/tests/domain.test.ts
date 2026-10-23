import { describe, it, expect } from 'vitest';
import { effectivePermissions, clampGrant, ROLE_CEILING, PERMISSIONS, hasPermission } from '../src/domain/permissions';
import { assertTransition, BOOKING_TRANSITIONS, APPLICATION_TRANSITIONS, MAINTENANCE_TRANSITIONS, TENANCY_TRANSITIONS } from '../src/domain/transitions';
import { generateSchedule, addMonthsUTC, effectiveInvoiceStatus, outstandingMinor } from '../src/domain/schedule';
import { mockProvider } from '../src/domain/mockPayments';
import { validateSlotStart } from '../src/modules/bookings/slots';
import { toCsv, csvCell } from '../src/utils/csv';
import { signFile, verifyFile } from '../src/utils/signedUrl';
import { sniffFile } from '../src/utils/sniff';
import { scrub } from '../src/modules/audit/service';

const d = (s: string) => new Date(s + 'T00:00:00Z');

describe('permissions', () => {
  it('owner has everything; inactive members nothing', () => {
    expect(effectivePermissions({ role: 'owner', status: 'active' })).toHaveLength(PERMISSIONS.length);
    expect(effectivePermissions({ role: 'owner', status: 'deactivated' })).toEqual([]);
    expect(effectivePermissions({ role: 'agent', status: 'invited', permissions: ['property.read'] })).toEqual([]);
  });
  it('effective = role ceiling ∩ explicit grants (no escalation via stored grants)', () => {
    const m = { role: 'agent' as const, status: 'active', permissions: ['property.read', 'payment.reverse', 'staff.manage', 'booking.manage'] };
    expect(effectivePermissions(m).sort()).toEqual(['booking.manage', 'property.read']);
  });
  it('clampGrant drops unknown and above-ceiling permissions', () => {
    expect(clampGrant('accountant', ['report.read', 'staff.manage', 'nonsense'])).toEqual(['report.read']);
  });
  it('only owner can manage staff / reverse payments', () => {
    for (const r of ['manager', 'agent', 'accountant'] as const) {
      expect(ROLE_CEILING[r]).not.toContain('staff.manage');
      expect(ROLE_CEILING[r]).not.toContain('payment.reverse');
    }
    expect(hasPermission({ role: 'accountant', status: 'active', permissions: ['expense.manage'] }, 'expense.manage')).toBe(true);
  });
});

describe('state machines', () => {
  it('booking: only legal moves', () => {
    expect(() => assertTransition(BOOKING_TRANSITIONS, 'pending', 'confirmed', 'x')).not.toThrow();
    expect(() => assertTransition(BOOKING_TRANSITIONS, 'pending', 'completed', 'x')).toThrow(/Cannot change/);
    expect(() => assertTransition(BOOKING_TRANSITIONS, 'completed', 'cancelled', 'x')).toThrow();
    expect(() => assertTransition(BOOKING_TRANSITIONS, 'confirmed', 'no_show', 'x')).not.toThrow();
  });
  it('application: approval needs review; terminal states are final', () => {
    expect(() => assertTransition(APPLICATION_TRANSITIONS, 'submitted', 'approved', 'x')).toThrow();
    expect(() => assertTransition(APPLICATION_TRANSITIONS, 'under_review', 'approved', 'x')).not.toThrow();
    expect(() => assertTransition(APPLICATION_TRANSITIONS, 'approved', 'rejected', 'x')).toThrow();
  });
  it('maintenance: reopen only from resolved/closed', () => {
    expect(() => assertTransition(MAINTENANCE_TRANSITIONS, 'resolved', 'reopened', 'x')).not.toThrow();
    expect(() => assertTransition(MAINTENANCE_TRANSITIONS, 'in_progress', 'reopened', 'x')).toThrow();
  });
  it('tenancy: ended leases cannot be reactivated', () => {
    expect(() => assertTransition(TENANCY_TRANSITIONS, 'terminated', 'active', 'x')).toThrow();
    expect(() => assertTransition(TENANCY_TRANSITIONS, 'expired', 'active', 'x')).toThrow();
    expect(() => assertTransition(TENANCY_TRANSITIONS, 'pending', 'active', 'x')).not.toThrow();
  });
});

describe('rent schedule & invoices', () => {
  it('12 monthly periods, first due at start, last day clamped', () => {
    const s = generateSchedule({ startDate: d('2026-01-31'), endDate: d('2027-01-30'), frequency: 'monthly', dueDay: 5, rentMinor: 50_000 });
    expect(s).toHaveLength(12);
    expect(s[0].dueDate.toISOString().slice(0, 10)).toBe('2026-01-31');
    expect(s[1].periodStart.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(s.reduce((n, p) => n + p.amountMinor, 0)).toBe(600_000);
  });
  it('quarterly and yearly', () => {
    expect(generateSchedule({ startDate: d('2026-01-01'), endDate: d('2026-12-31'), frequency: 'quarterly', dueDay: 1, rentMinor: 1 })).toHaveLength(4);
    expect(generateSchedule({ startDate: d('2026-01-01'), endDate: d('2027-12-31'), frequency: 'yearly', dueDay: 1, rentMinor: 1 })).toHaveLength(2);
  });
  it('rejects terms that are not whole billing periods / inverted dates', () => {
    expect(() => generateSchedule({ startDate: d('2026-01-01'), endDate: d('2026-02-15'), frequency: 'monthly', dueDay: 1, rentMinor: 1 })).toThrow(/whole number/);
    expect(() => generateSchedule({ startDate: d('2026-05-01'), endDate: d('2026-04-01'), frequency: 'monthly', dueDay: 1, rentMinor: 1 })).toThrow();
  });
  it('addMonthsUTC clamps', () => expect(addMonthsUTC(d('2024-01-31'), 1).toISOString().slice(0, 10)).toBe('2024-02-29'));
  it('overdue is derived, void is never overdue, outstanding is exact integers', () => {
    const past = new Date(Date.now() - 86_400_000);
    expect(effectiveInvoiceStatus({ status: 'issued', totalMinor: 100, paidMinor: 0, dueDate: past })).toBe('overdue');
    expect(effectiveInvoiceStatus({ status: 'partially_paid', totalMinor: 100, paidMinor: 10, dueDate: past })).toBe('overdue');
    expect(effectiveInvoiceStatus({ status: 'paid', totalMinor: 100, paidMinor: 100, dueDate: past })).toBe('paid');
    expect(effectiveInvoiceStatus({ status: 'void', totalMinor: 100, paidMinor: 0, dueDate: past })).toBe('void');
    expect(outstandingMinor({ totalMinor: 12_345, paidMinor: 2_345 })).toBe(10_000);
    expect(outstandingMinor({ totalMinor: 100, paidMinor: 0, status: 'void' })).toBe(0);
  });
});

describe('mock payments', () => {
  it('provider is MOCK and decides outcomes server-side', () => {
    expect(mockProvider.environment).toBe('MOCK');
    expect(mockProvider.newReference()).toMatch(/^MOCK-/);
    expect(mockProvider.resolve({ scenario: 'success', status: 'initiated' })).toBe('succeeded');
    expect(mockProvider.resolve({ scenario: 'failure', status: 'initiated' })).toBe('failed');
    expect(mockProvider.resolve({ scenario: 'pending', status: 'initiated' })).toBe('pending');
    expect(mockProvider.resolve({ scenario: 'pending', status: 'pending' })).toBe('succeeded');
  });
});

describe('viewing slots', () => {
  const now = new Date('2026-06-01T08:00:00Z');
  it('requires grid alignment, >=1h ahead, <=60 days', () => {
    expect(() => validateSlotStart(new Date('2026-06-02T10:30:00Z'), 30, now)).not.toThrow();
    expect(() => validateSlotStart(new Date('2026-06-02T10:15:00Z'), 30, now)).toThrow();
    expect(() => validateSlotStart(new Date('2026-06-01T08:30:00Z'), 30, now)).toThrow(/1 hour/);
    expect(() => validateSlotStart(new Date('2026-09-01T10:00:00Z'), 30, now)).toThrow(/60 days/);
    expect(() => validateSlotStart(new Date('nope'), 30, now)).toThrow();
  });
});

describe('security utilities', () => {
  it('csv neutralises formula injection and quotes', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(toCsv(['a'], [['-2']])).toBe("a\r\n'-2");
  });
  it('signed urls: valid, tampered, expired', () => {
    const secret = 'x'.repeat(32), exp = Date.now() + 60_000;
    const sig = signFile(secret, 'private/a.pdf', exp);
    expect(verifyFile(secret, 'private/a.pdf', exp, sig)).toBe(true);
    expect(verifyFile(secret, 'private/b.pdf', exp, sig)).toBe(false);
    expect(verifyFile(secret, 'private/a.pdf', exp + 1, sig)).toBe(false);
    expect(verifyFile('y'.repeat(32), 'private/a.pdf', exp, sig)).toBe(false);
    const past = Date.now() - 1; expect(verifyFile(secret, 'k', past, signFile(secret, 'k', past))).toBe(false);
  });
  it('sniffFile identifies real types and rejects disguised files', () => {
    expect(sniffFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))?.mime).toBe('image/jpeg');
    expect(sniffFile(Buffer.from('%PDF-1.7 hello world'))?.kind).toBe('pdf');
    expect(sniffFile(Buffer.from('<?php echo 1; ?> not an image at all'))).toBeNull();
    expect(sniffFile(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });
  it('audit scrub redacts secrets recursively', () => {
    const o = scrub({ password: 'p', nested: { refreshToken: 't', ok: 1 }, list: [{ cardNumber: '4111' }] });
    expect(o.password).toBe('[redacted]'); expect(o.nested.refreshToken).toBe('[redacted]'); expect(o.nested.ok).toBe(1); expect(o.list[0].cardNumber).toBe('[redacted]');
  });
});
