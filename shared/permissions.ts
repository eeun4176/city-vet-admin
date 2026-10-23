/**
 * Single source of truth for who can do what. Imported by the API (authoritative)
 * and by the React app (to hide what a person cannot use). Hiding is never the
 * protection: every API route must still call `can()`.
 */
export type Role = 'SuperAdmin' | 'Admin' | 'Paravet' | 'User'; // User retained only for historical account records.

export const GRANT_PERMISSIONS = ['archive', 'restore', 'delete_submission', 'export_with_ids'] as const;
export type GrantPermission = (typeof GRANT_PERMISSIONS)[number];

export type Capability =
  | 'dashboard.view'
  | 'registry.view' | 'registry.write' | 'registry.archive' | 'registry.restore'
  | 'census.submit' | 'census.review' | 'census.delete' | 'census.reports'
  | 'programs.manage' | 'program_day.manage' | 'stubs.manage' | 'services.manage'
  | 'paravets.manage' | 'barangays.view'
  | 'accounts.manage_portal' | 'accounts.manage_staff' | 'accounts.set_state'
  | 'program_interest.view'
  | 'reports.view' | 'quality.view' | 'quality.flag' | 'quality.review'
  | 'data.import' | 'data.export' | 'data.export_ids'
  | 'requests.submit' | 'requests.decide' | 'requests.view' | 'grants.manage' | 'issues.submit' | 'issues.manage'
  | 'audit.view' | 'system.settings' | 'system.backup';

/** Capabilities that an active, unexpired grant unlocks for a role that lacks them. */
export const GRANT_UNLOCKS: Partial<Record<Capability, GrantPermission>> = {
  'registry.archive': 'archive',
  'registry.restore': 'restore',
  'census.delete': 'delete_submission',
  'data.export_ids': 'export_with_ids',
};

const ADMIN: readonly Capability[] = [
  'dashboard.view',
  'registry.view', 'registry.write',
  'census.review', 'census.reports',
  'programs.manage', 'program_day.manage', 'stubs.manage', 'services.manage',
  'paravets.manage', 'barangays.view',
  'accounts.manage_portal',
  'program_interest.view',
  'reports.view', 'quality.view', 'quality.flag', 'quality.review',
  'data.import', 'data.export',
  'requests.submit', 'requests.view', 'issues.submit',
];

const PARAVET: readonly Capability[] = [
  'dashboard.view', 'registry.view', 'census.submit', 'program_interest.view', 'stubs.manage', 'program_day.manage', 'issues.submit', 'quality.view', 'quality.flag',
];

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  SuperAdmin: [
    // Admin-only duties: SuperAdmin decides permission requests and resolves issues instead of filing them.
    ...ADMIN.filter((capability) => capability !== 'requests.submit' && capability !== 'issues.submit'),
    'registry.archive', 'registry.restore', 'census.delete', 'data.export_ids',
    'accounts.manage_staff', 'accounts.set_state',
    'requests.decide', 'requests.view', 'grants.manage', 'issues.manage',
    'audit.view', 'system.settings', 'system.backup',
  ],
  Admin: ADMIN,
  Paravet: PARAVET,
  User: [],
};

export const GRANT_PERMISSIONS_BY_ROLE: Record<'Admin' | 'Paravet', readonly GrantPermission[]> = {
  Admin: GRANT_PERMISSIONS,
  Paravet: ['archive', 'restore', 'delete_submission'],
};

export interface Principal {
  role: Role;
  /** Active, unexpired grants for this account. */
  grants?: readonly GrantPermission[];
}

export function can(principal: Principal | null | undefined, capability: Capability): boolean {
  if (!principal || principal.role === 'User') return false;
  if (ROLE_CAPABILITIES[principal.role].includes(capability)) return true;
  const unlock = GRANT_UNLOCKS[capability];
  return Boolean(unlock && principal.grants?.includes(unlock));
}

export function landingPageForRole(role: Role): '/dashboard' | '/settings' {
  return ROLE_CAPABILITIES[role].includes('dashboard.view') ? '/dashboard' : '/settings';
}

/** Roles that may hold the capability without a grant (for API `requireAuth({ roles })`). */
export function rolesWith(capability: Capability): Role[] {
  return (Object.keys(ROLE_CAPABILITIES) as Role[]).filter((role) => ROLE_CAPABILITIES[role].includes(capability));
}
