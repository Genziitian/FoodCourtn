import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './layout/AdminLayout';
import SuperAdminLayout from './layout/SuperAdminLayout';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import MenuItems from './pages/MenuItems';
import Combos from './pages/Combos';
import Ingredients from './pages/Ingredients';
import Offers from './pages/Offers';
import Loyalty from './pages/Loyalty';
import Tables from './pages/Tables';
import Staff from './pages/Staff';
import Notifications from './pages/Notifications';
import SettingsPage from './pages/Settings';
import Reservations from './pages/Reservations';
import Customers from './pages/Customers';
import Payments from './pages/Payments';
import Reports from './pages/Reports';
import Placeholder from './pages/Placeholder';

import SuperDashboard from './pages/super/SuperDashboard';
import SuperRestaurants from './pages/super/SuperRestaurants';
import SuperPayments from './pages/super/SuperPayments';
import SuperAdmins from './pages/super/SuperAdmins';
import SuperSupport from './pages/super/SuperSupport';
import SuperHealth from './pages/super/SuperHealth';
import Login from './pages/Login';
import SuperLogin from './pages/SuperLogin';
import BranchManagers from './pages/BranchManagers';
import Kds from './pages/Kds';
import PaymentsConfig from './pages/PaymentsConfig';
import { RequireAuth } from './components/RequireAuth';
import { RequirePerm } from './components/RequirePerm';

export default function App() {
  return (
    <Routes>
      {/* Public — sign-in only */}
      <Route path="/login" element={<Login />} />
      {/* Hidden platform-admin login — not linked from the main /login page on purpose. */}
      <Route path="/super/login" element={<SuperLogin />} />

      {/* Restaurant admin — requires staff OR org admin OR platform admin */}
      <Route element={<RequireAuth mode="staff" />}>
        <Route element={<AdminLayout />}>
          <Route path="/"                element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"       element={<Dashboard />} />
          <Route path="/orders"          element={<Orders />} />
          <Route path="/payments"        element={<Payments />} />
          <Route path="/payments-config" element={<PaymentsConfig />} />
          <Route path="/reservations"    element={<Reservations />} />
          <Route path="/kds"             element={<Kds />} />
          <Route path="/tables"          element={<Tables />} />
          <Route path="/menu"            element={<RequirePerm perm="menu.view"><MenuItems /></RequirePerm>} />
          <Route path="/combos"          element={<RequirePerm perm="combos.manage"><Combos /></RequirePerm>} />
          <Route path="/ingredients"     element={<RequirePerm perm="inventory.view"><Ingredients /></RequirePerm>} />
          <Route path="/offers"          element={<RequirePerm perm="offers.manage"><Offers /></RequirePerm>} />
          <Route path="/loyalty"         element={<RequirePerm perm="loyalty.manage"><Loyalty /></RequirePerm>} />
          <Route path="/customers"       element={<RequirePerm perm="customers.view"><Customers /></RequirePerm>} />
          <Route path="/staff"           element={<RequirePerm perm="staff.manage"><Staff /></RequirePerm>} />
          <Route path="/managers"        element={<RequirePerm perm="branch_managers.manage"><BranchManagers /></RequirePerm>} />
          <Route path="/reports"         element={<RequirePerm perm="reports.view"><Reports /></RequirePerm>} />
          <Route path="/notifications"   element={<RequirePerm perm="notifications.view"><Notifications /></RequirePerm>} />
          <Route path="/settings"        element={<RequirePerm perm="settings.manage"><SettingsPage /></RequirePerm>} />
        </Route>
      </Route>

      {/* Super admin (platform-wide) — requires platform_admins row */}
      <Route element={<RequireAuth mode="platform" />}>
        <Route path="/super" element={<SuperAdminLayout />}>
          <Route index                 element={<SuperDashboard />} />
          <Route path="restaurants"    element={<SuperRestaurants />} />
          <Route path="payments"       element={<SuperPayments />} />
          <Route path="admins"         element={<SuperAdmins />} />
          <Route path="support"        element={<SuperSupport />} />
          <Route path="health"         element={<SuperHealth />} />
          <Route
            path="marketing"
            element={<Placeholder title="Public marketing site" subtitle="Manage the foodcourt.app landing page, pricing, and onboarding flow." />}
          />
        </Route>
      </Route>

      <Route path="*" element={<div className="p-8">Not found</div>} />
    </Routes>
  );
}
