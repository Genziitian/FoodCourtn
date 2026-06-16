import { Navigate, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import Menu from './pages/Menu';
import Cart from './pages/Cart';
import OrderTracking from './pages/OrderTracking';
import Login from './pages/Login';
import Profile from './pages/Profile';
import OrderHistory from './pages/OrderHistory';
import Addresses from './pages/Addresses';
import FoodCoins from './pages/FoodCoins';
import TableChooser from './pages/TableChooser';
import { RequireCustomer } from './components/RequireCustomer';

export default function App() {
  return (
    <Routes>
      {/* Public — login only */}
      <Route path="/login" element={<Login />} />
      {/* Public — single-QR table chooser. Branch shows ONE QR; customer
          picks their table here and we forward into the gated dine-in flow. */}
      <Route path="/:slug/scan" element={<TableChooser />} />
      {/* Root redirect (lands at a demo table; gate kicks in if not signed in) */}
      <Route path="/" element={<Navigate to="/the-spice-route/t/sr-t12" replace />} />

      {/* Gated — every menu / cart / profile route requires a signed-in customer */}
      <Route element={<RequireCustomer />}>
        {/* QR / dine-in flow */}
        <Route path="/:slug/t/:qrToken"                  element={<Landing />} />
        <Route path="/:slug/t/:qrToken/menu"             element={<Menu />} />
        <Route path="/:slug/t/:qrToken/cart"             element={<Cart />} />
        <Route path="/:slug/t/:qrToken/order/:code"      element={<OrderTracking />} />
        <Route path="/:slug/t/:qrToken/profile"          element={<Profile />} />
        <Route path="/:slug/t/:qrToken/profile/orders"   element={<OrderHistory />} />
        <Route path="/:slug/t/:qrToken/profile/coins"    element={<FoodCoins />} />
        <Route path="/:slug/t/:qrToken/profile/addresses" element={<Addresses />} />

        {/* Takeaway */}
        <Route path="/:slug"                  element={<Landing />} />
        <Route path="/:slug/menu"             element={<Menu />} />
        <Route path="/:slug/cart"             element={<Cart />} />
        <Route path="/:slug/order/:code"      element={<OrderTracking />} />
        <Route path="/:slug/profile"          element={<Profile />} />
        <Route path="/:slug/profile/orders"   element={<OrderHistory />} />
        <Route path="/:slug/profile/coins"    element={<FoodCoins />} />
        <Route path="/:slug/profile/addresses" element={<Addresses />} />
      </Route>

      <Route path="*" element={<div className="p-8">Not found</div>} />
    </Routes>
  );
}
