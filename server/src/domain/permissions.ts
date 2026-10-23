/**
 * Permission model.
 * Effective access of a staff member = ROLE_CEILING[role]  ∩  membership.permissions (explicit grants)
 * — and only while membership.status === 'active' — and then further limited by property scope
 * (membership.scope 'all' | 'assigned') in modules/companies/scope.ts.
 * Owners always have every permission.
 */
export const PERMISSIONS = [
  'company.update',
  'branch.manage',
  'staff.manage',
  'audit.read',
  'property.read',
  'property.create',
  'property.update',
  'property.archive',
  'booking.manage',
  'application.review',
  'lease.manage',
  'tenant.read',
  'invoice.read',
  'invoice.manage',
  'payment.record_mock',
  'payment.reverse',
  'expense.read',
  'expense.manage',
  'expense.approve',
  'maintenance.read',
  'maintenance.manage',
  'maintenance.assign',
  'report.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ['owner', 'manager', 'agent', 'accountant'] as const;
export type Role = (typeof ROLES)[number];

const MANAGER: Permission[] = PERMISSIONS.filter(
  (p) => !['company.update', 'staff.manage', 'payment.reverse', 'expense.approve'].includes(p)
) as Permission[];

export const ROLE_CEILING: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: [...MANAGER, 'expense.approve'],
  agent: [
    'property.read', 'property.update', 'booking.manage', 'application.review', 'tenant.read',
    'maintenance.read', 'maintenance.manage', 'invoice.read',
  ],
  accountant: [
    'property.read', 'tenant.read', 'invoice.read', 'invoice.manage', 'payment.record_mock',
    'expense.read', 'expense.manage', 'report.read',
  ],
};

/** Default grants for a new membership of a given role (owner decides whether to reduce / extend up to the ceiling). */
export const ROLE_DEFAULTS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: MANAGER,
  agent: ['property.read', 'property.update', 'booking.manage', 'application.review', 'maintenance.read', 'maintenance.manage'],
  accountant: ['property.read', 'tenant.read', 'invoice.read', 'invoice.manage', 'payment.record_mock', 'expense.read', 'expense.manage', 'report.read'],
};

type MemberLike = { role: Role; status: string; permissions?: string[] };

export function effectivePermissions(m: MemberLike | null | undefined): Permission[] {
  if (!m || m.status !== 'active') return [];
  if (m.role === 'owner') return [...PERMISSIONS];
  const ceiling = ROLE_CEILING[m.role] ?? [];
  const granted = new Set(m.permissions ?? []);
  return ceiling.filter((p) => granted.has(p));
}
export const hasPermission = (m: MemberLike | null | undefined, p: Permission) => effectivePermissions(m).includes(p);

/** Clamp requested permissions to the role ceiling and known permission names (prevents privilege escalation). */
export function clampGrant(role: Role, requested: readonly string[]): Permission[] {
  const ceiling = new Set<string>(ROLE_CEILING[role] ?? []);
  return [...new Set(requested)].filter((p): p is Permission => ceiling.has(p));
}
