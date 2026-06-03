import { NavLink, useLocation, useParams } from 'react-router-dom';
import { cls } from '@foodcourt/shared';
import { useCart } from '../lib/cart';
import { Icon } from './Icon';

type Tab = 'home' | 'menu' | 'cart' | 'profile';

export function BottomNav() {
  const { slug, qrToken } = useParams();
  const location = useLocation();
  const cartCount = useCart(s => s.cart.lines.reduce((n, l) => n + l.qty, 0));

  const base = qrToken ? `/${slug}/t/${qrToken}` : `/${slug ?? 'the-spice-route'}`;
  const path = location.pathname;
  const active: Tab =
    path.endsWith('/menu') ? 'menu' :
    path.includes('/cart') ? 'cart' :
    path.includes('/order') ? 'cart' :
    path.endsWith('/profile') ? 'profile' :
    'home';

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest border-t border-outline-variant/30 pt-2 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.03)]"
      aria-label="Primary"
    >
      <div className="max-w-md mx-auto flex justify-around items-center px-2 pb-2">
        <Tab to={base}             label="Home"    icon="home"            active={active === 'home'} />
        <Tab to={`${base}/menu`}   label="Menu"    icon="restaurant_menu" active={active === 'menu'} />
        <Tab to={`${base}/cart`}   label="Cart"    icon="shopping_cart"   active={active === 'cart'} badge={cartCount} />
        <Tab to={`${base}/profile`} label="Profile" icon="person"         active={active === 'profile'} />
      </div>
    </nav>
  );
}

function Tab({
  to, label, icon, active, badge,
}: { to: string; label: string; icon: string; active: boolean; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={cls(
        'flex flex-col items-center gap-0.5 min-w-[64px] py-1 transition-colors',
        active ? 'text-primary' : 'text-on-surface-variant',
      )}
    >
      <span className="relative">
        <Icon name={icon} size={24} fill={active} weight={active ? 600 : 400} />
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-primary text-on-primary text-[10px] font-bold border-2 border-white">
            {badge}
          </span>
        )}
      </span>
      <span className={cls('text-[10px]', active ? 'font-bold' : 'font-medium')}>{label}</span>
    </NavLink>
  );
}
