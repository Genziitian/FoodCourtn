// Role-based permissions catalog. Owners/managers see everything; cashier
// and kitchen staff get scoped views. Org-admins and platform-admins always
// bypass these checks (they're a tier above branch staff).
//
// IMPORTANT: this is front-end gating only — for defence in depth, add RLS
// policies that mirror these rules. Until then a malicious user with a
// Supabase token could still call the underlying tables directly.

import type { StaffRole } from './session';

export type Permission =
  // Operations
  | 'orders.view'
  | 'orders.update_status'
  | 'orders.cancel'
  | 'kds.view'
  | 'payments.view'
  | 'payments.refund'
  | 'payments_config.manage'
  | 'tables.manage'
  // Menu
  | 'menu.view'
  | 'menu.edit'
  | 'combos.manage'
  | 'offers.manage'
  | 'loyalty.manage'
  // People
  | 'customers.view'
  | 'staff.manage'
  | 'branch_managers.manage'
  // Insights
  | 'reports.view'
  | 'notifications.view'
  // System
  | 'settings.manage'
  // Inventory
  | 'inventory.view'
  | 'inventory.adjust';

const ROLE_PERMS: Record<StaffRole, Permission[]> = {
  owner: [
    'orders.view', 'orders.update_status', 'orders.cancel',
    'kds.view',
    'payments.view', 'payments.refund', 'payments_config.manage',
    'tables.manage',
    'menu.view', 'menu.edit', 'combos.manage', 'offers.manage', 'loyalty.manage',
    'customers.view', 'staff.manage', 'branch_managers.manage',
    'reports.view', 'notifications.view',
    'settings.manage',
    'inventory.view', 'inventory.adjust',
  ],
  manager: [
    'orders.view', 'orders.update_status', 'orders.cancel',
    'kds.view',
    'payments.view', 'payments.refund',
    'tables.manage',
    'menu.view', 'menu.edit', 'combos.manage', 'offers.manage', 'loyalty.manage',
    'customers.view', 'staff.manage',
    'reports.view', 'notifications.view',
    'inventory.view', 'inventory.adjust',
  ],
  cashier: [
    'orders.view', 'orders.update_status',
    'payments.view',
    'tables.manage',
    'menu.view',
    'customers.view',
  ],
  kitchen: [
    'orders.view', 'orders.update_status',
    'kds.view',
    'menu.view',
    'inventory.view',
  ],
  waiter: [
    'orders.view', 'orders.update_status',
    'tables.manage',
    'menu.view',
    'customers.view',
  ],
};

/** Resolve the highest-priority role for a user across their branches. */
export function highestRole(roles: StaffRole[]): StaffRole | null {
  const priority: StaffRole[] = ['owner', 'manager', 'cashier', 'waiter', 'kitchen'];
  for (const r of priority) if (roles.includes(r)) return r;
  return null;
}

export function roleHas(role: StaffRole | null, perm: Permission): boolean {
  if (!role) return false;
  return (ROLE_PERMS[role] ?? []).includes(perm);
}

/** Friendly label for the role chip in the topbar. */
export function roleLabel(role: StaffRole | null): string {
  if (!role) return 'Member';
  return ({
    owner: 'Owner',
    manager: 'Manager',
    cashier: 'Cashier',
    kitchen: 'Kitchen',
    waiter: 'Waiter',
  } as const)[role];
}
