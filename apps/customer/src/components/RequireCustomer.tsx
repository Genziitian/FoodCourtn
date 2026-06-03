import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Customer-route guard.
 *
 * If the visitor has no user profile yet (never completed phone OTP / name
 * entry), bounce them to /login with a `from` so we can return them to the
 * exact menu/QR URL they were trying to reach.
 *
 * Note: customers identify themselves with a stable browser UUID (customerId)
 * that always exists. The `user` profile is what indicates they've actually
 * filled in name + phone, so we gate on that.
 */
export function RequireCustomer() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
