// Route-level guard. Wrap a route's element with <RequirePerm perm="X"> to
// redirect users who lack the permission to the dashboard. Sidebar already
// hides the link, but this catches URL-jumpers and bookmarked routes.

import { Navigate } from 'react-router-dom';
import { useCan } from '../lib/useCan';
import type { Permission } from '../lib/permissions';

export function RequirePerm({ perm, children }: { perm: Permission; children: React.ReactNode }) {
  const { can } = useCan();
  if (!can(perm)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
