// useCan(permission) — single source of truth for "is the current admin
// allowed to do X right now?". Wraps useSession + useTenant so callers don't
// have to reach into both contexts every time.
//
// Resolution order (first match wins):
//   1. Platform admin → all permissions.
//   2. Org admin (owner of an org containing the active branch) → all perms.
//   3. Branch staff with a role assigned to the active branch → role perms.
//   4. No active branch (overview mode) → use highest role across all branches.

import { useSession } from './session';
import { useTenant } from './tenant';
import { highestRole, roleHas, roleLabel, type Permission } from './permissions';

export function useCan() {
  const { admin } = useSession();
  const { branch } = useTenant();

  const role = (() => {
    if (!admin) return null;
    if (admin.isPlatformAdmin || admin.isOrgAdmin) return 'owner' as const;
    if (branch) {
      const match = admin.staffRoles.find(r => r.restaurant_id === branch.id);
      if (match) return match.role;
    }
    return highestRole(admin.staffRoles.map(r => r.role));
  })();

  const can = (perm: Permission): boolean => {
    if (!admin) return false;
    if (admin.isPlatformAdmin || admin.isOrgAdmin) return true;
    return roleHas(role, perm);
  };

  return {
    can,
    role,
    roleLabel: roleLabel(role),
    isElevated: !!admin && (admin.isPlatformAdmin || admin.isOrgAdmin),
  };
}
