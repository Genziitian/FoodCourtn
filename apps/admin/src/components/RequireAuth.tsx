import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useSession } from '../lib/session';

type Mode = 'staff' | 'platform';

/**
 * Route guard.
 *
 *   mode="staff"     — accepts any signed-in user with at least ONE role link:
 *                      org_admin, restaurant_staff, or platform_admin.
 *   mode="platform"  — accepts only platform admins (super_admin / support / finance).
 *
 * Anon (no session) → redirected to /login with `from` so we can bounce them
 * back where they were trying to go.
 */
export function RequireAuth({ mode }: { mode: Mode }) {
  const { state, admin } = useSession();
  const location = useLocation();

  if (state === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto size-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <p className="mt-3 text-sm text-slate-500 font-medium">Checking session…</p>
        </div>
      </div>
    );
  }

  if (state === 'anon' || !admin) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (mode === 'platform' && !admin.isPlatformAdmin) {
    return <Unauthorized message="This area is for platform admins only." />;
  }

  if (mode === 'staff' && !admin.isStaff && !admin.isOrgAdmin && !admin.isPlatformAdmin) {
    return <Unauthorized message="Your account isn't linked to any restaurant yet. Ask a super admin to grant you access." />;
  }

  return <Outlet />;
}

function Unauthorized({ message }: { message: string }) {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <div className="max-w-md bg-white rounded-2xl shadow-card p-8 text-center">
        <div className="mx-auto size-12 grid place-items-center rounded-full bg-rose-50 text-rose-600 mb-4">
          <Lock className="size-6" />
        </div>
        <h2 className="text-xl font-bold mb-2">Access denied</h2>
        <p className="text-sm text-slate-600">{message}</p>
        <a href="/login" className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700">
          Back to sign in
        </a>
      </div>
    </div>
  );
}
