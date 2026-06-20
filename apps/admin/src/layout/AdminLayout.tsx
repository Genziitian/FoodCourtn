import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bell, Calendar, Check as CheckIcon, ChevronDown, ChevronRight, CreditCard,
  Download, LayoutGrid, LogOut, MapPin, Monitor, RefreshCcw, Search,
  Package, Settings, Shield, ShoppingBag, Sparkles, Tag, Coins, Utensils, QrCode, Users, UserCog,
  ChartBar, MessageSquare, Check,
} from 'lucide-react';
import { cls } from '@foodcourt/shared';
import { TenantProvider, useTenant } from '../lib/tenant';
import { useSession } from '../lib/session';
import { useCan } from '../lib/useCan';
import type { Permission } from '../lib/permissions';

export default function AdminLayout() {
  return (
    <TenantProvider>
      <LayoutInner />
    </TenantProvider>
  );
}

function LayoutInner() {
  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="admin-main flex-1 min-w-0 flex flex-col">
        <Topbar />
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sidebar
// ────────────────────────────────────────────────────────────

function Sidebar() {
  const { can } = useCan();

  // Small helper so each nav item carries its required permission inline.
  const gate = (perm: Permission, node: React.ReactNode) => (can(perm) ? node : null);
  // Show a section only if at least one of its children is visible.
  const section = (title: string, kids: React.ReactNode[]) => {
    const visible = kids.filter(Boolean);
    if (!visible.length) return null;
    return <NavSection title={title}>{visible}</NavSection>;
  };

  return (
    <aside className="admin-sidebar w-[260px] shrink-0 bg-white border-r border-slate-100 flex flex-col">
      <div className="px-5 py-5 flex items-center gap-3">
        <span className="size-9 grid place-items-center rounded-full bg-brand-50">
          <span className="size-6 rounded-full bg-gradient-to-br from-brand-500 to-brand-700" />
        </span>
        <span className="font-extrabold text-lg">FoodCourt</span>
      </div>

      <TenantSwitcher />

      <nav className="flex-1 overflow-y-auto mt-6 px-3 pb-4">
        {section('Operations', [
          <NavItem key="d"  to="/dashboard"     icon={LayoutGrid}  label="Dashboard" />,
          gate('orders.view',           <NavItem key="o"  to="/orders"        icon={ShoppingBag} label="Orders"          badge={12} />),
          gate('kds.view',              <NavItem key="k"  to="/kds"           icon={Monitor}     label="Kitchen Display" badge={5} />),
          gate('payments.view',         <NavItem key="p"  to="/payments"      icon={CreditCard}  label="Payments" />),
          gate('payments_config.manage',<NavItem key="pc" to="/payments-config" icon={CreditCard} label="Payment Keys" />),
          gate('tables.manage',         <NavItem key="t"  to="/tables"        icon={QrCode}      label="Tables & QR" />),
        ])}
        {section('Menu', [
          gate('menu.view',     <NavItem key="m"   to="/menu"   icon={Utensils} label="Menu Items" />),
          gate('combos.manage', <NavItem key="cmb" to="/combos" icon={Sparkles} label="Combos" />),
          gate('inventory.view', <NavItem key="ing" to="/ingredients" icon={Package} label="Ingredients" />),
          gate('offers.manage', <NavItem key="off" to="/offers" icon={Tag}      label="Offers & Coupons" badge={3} />),
          gate('loyalty.manage',<NavItem key="loy" to="/loyalty" icon={Coins}   label="Loyalty Coins" />),
        ])}
        {section('People', [
          gate('customers.view',         <NavItem key="cus" to="/customers" icon={Users}   label="Customers" />),
          gate('staff.manage',           <NavItem key="stf" to="/staff"     icon={Shield}  label="Staff" />),
          gate('branch_managers.manage', <NavItem key="mgr" to="/managers"  icon={UserCog} label="Branch Managers" />),
        ])}
        {section('Insights', [
          gate('reports.view',       <NavItem key="rep" to="/reports"       icon={ChartBar} label="Reports" />),
          gate('notifications.view', <NavItem key="ntf" to="/notifications" icon={Bell}     label="Notifications"   badge={3} />),
        ])}
        {section('System', [
          gate('settings.manage', <NavItem key="set" to="/settings" icon={Settings} label="Settings" />),
        ])}
      </nav>

      <UserFooter />
    </aside>
  );
}

function UserFooter() {
  const { admin, signOut } = useSession();
  const navigate = useNavigate();

  if (!admin) {
    return (
      <button
        onClick={() => navigate('/login')}
        className="w-full border-t border-slate-100 px-3 py-3 flex items-center gap-3 hover:bg-slate-50 transition text-left"
      >
        <span className="size-10 grid place-items-center rounded-full bg-slate-200 text-slate-500 font-bold">?</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">Guest mode</p>
          <p className="text-xs text-brand-600 font-semibold truncate">Sign in →</p>
        </div>
      </button>
    );
  }

  const initials = admin.displayName.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const subtitle = admin.platformRole
    ? admin.platformRole.replace('_', ' ')
    : admin.isOrgAdmin
      ? 'Org owner'
      : admin.staffRoles[0]?.role ?? 'Member';

  return (
    <div className="border-t border-slate-100 px-3 py-3 flex items-center gap-3">
      <span className="size-10 grid place-items-center rounded-full bg-brand-600 text-white font-bold">{initials}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{admin.displayName}</p>
        <p className="text-xs text-slate-500 capitalize truncate">{subtitle}</p>
      </div>
      <button
        onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
        className="size-8 grid place-items-center rounded-full hover:bg-slate-100"
        title="Sign out"
      >
        <LogOut className="size-4 text-slate-500" />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tenant switcher (org + branch)
// ────────────────────────────────────────────────────────────

function TenantSwitcher() {
  const { org, orgs, branch, branches, loading, setOrg, setBranch } = useTenant();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (loading || !org) {
    return (
      <div className="mx-3 mt-2 rounded-2xl bg-brand-50/60 px-3 py-3 flex items-center gap-3">
        <span className="size-9 rounded-full bg-slate-200 animate-pulse" />
        <div className="flex-1 space-y-1">
          <div className="h-3 w-32 rounded bg-slate-200 animate-pulse" />
          <div className="h-2.5 w-20 rounded bg-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  const initials = org.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="relative px-3 mt-2" ref={popRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full rounded-2xl bg-brand-50 hover:bg-brand-100 transition px-3 py-3 flex items-center gap-3 text-left"
      >
        <span
          className="size-9 grid place-items-center rounded-full text-white font-bold text-sm shrink-0"
          style={{ background: org.brand_color }}
        >
          {initials}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate text-sm">{org.name}</p>
          <p className="text-xs text-slate-500 truncate inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {branch ? (branch.area_name ?? branch.name) : `All ${branches.length} branches`}
          </p>
        </div>
        <ChevronDown className={cls('size-4 text-slate-400 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Org list */}
          <div className="border-b border-slate-100">
            <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Organization</p>
            <ul>
              {orgs.map(o => (
                <li key={o.id}>
                  <button
                    onClick={() => { setOrg(o.id); setOpen(false); }}
                    className={cls(
                      'w-full px-4 py-2.5 flex items-center gap-3 text-left text-sm transition',
                      o.id === org.id ? 'bg-brand-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <span
                      className="size-7 grid place-items-center rounded-full text-white font-bold text-xs shrink-0"
                      style={{ background: o.brand_color }}
                    >
                      {o.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{o.name}</p>
                      <p className="text-xs text-slate-500 capitalize">{o.plan} · {o.commission_percent}% comm</p>
                    </div>
                    {o.id === org.id && <Check className="size-4 text-brand-600" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Branches */}
          <div>
            <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Branches</p>
            <ul className="max-h-[320px] overflow-y-auto pb-2">
              <li>
                <button
                  onClick={() => { setBranch(null); setOpen(false); }}
                  className={cls(
                    'w-full px-4 py-2.5 flex items-center gap-3 text-left text-sm transition',
                    branch === null ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50',
                  )}
                >
                  <span className="size-7 grid place-items-center rounded-full bg-slate-100 text-slate-500 shrink-0">
                    <LayoutGrid className="size-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">All branches</p>
                    <p className="text-xs text-slate-500">Combined view across {branches.length}</p>
                  </div>
                  {branch === null && <Check className="size-4 text-brand-600" />}
                </button>
              </li>
              {branches.map(b => (
                <li key={b.id}>
                  <button
                    onClick={() => { setBranch(b.id); setOpen(false); }}
                    className={cls(
                      'w-full px-4 py-2.5 flex items-center gap-3 text-left text-sm transition',
                      branch?.id === b.id ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50',
                    )}
                  >
                    <span className="size-7 grid place-items-center rounded-md bg-slate-100 text-xs font-mono font-bold text-slate-500 shrink-0">
                      {(b.branch_code?.split('-').pop() ?? b.name.charAt(0))}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{b.area_name ?? b.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {b.city ?? '—'} · {b.branch_code ?? b.slug}
                      </p>
                    </div>
                    <span className={cls(
                      'size-1.5 rounded-full shrink-0',
                      b.is_open ? 'bg-emerald-500' : 'bg-slate-300',
                    )} />
                    {branch?.id === b.id && <Check className="size-4 text-brand-600 ml-1" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-slate-100 p-2">
            <a
              href="/super/restaurants"
              className="w-full block text-center text-xs font-semibold text-brand-700 hover:bg-brand-50 rounded-lg px-3 py-2"
            >
              Manage in Super Admin →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Topbar
// ────────────────────────────────────────────────────────────

function Topbar() {
  const { branch } = useTenant();
  return (
    <header className="admin-topbar bg-white border-b border-slate-100 px-6 py-4 flex items-center gap-4">
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            placeholder={branch ? `Search ${branch.area_name ?? branch.name}…` : 'Search across all branches…'}
            className="w-full rounded-full bg-slate-100 pl-11 pr-4 py-2.5 outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>
      <button className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium">
        <Calendar className="size-4" />
        Today, 21 May
      </button>
      <IconBtn onClick={() => window.location.reload()} title="Reload"><RefreshCcw className="size-4" /></IconBtn>
      <InstallPwaButton />
      <IconBtn dot title="Notifications"><Bell className="size-4" /></IconBtn>
      <TopbarAvatar />
    </header>
  );
}

// ────────────────────────────────────────────────────────────
// Sidebar helpers
// ────────────────────────────────────────────────────────────

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="px-3 text-[11px] font-semibold tracking-widest text-slate-400 uppercase">{title}</p>
      <ul className="mt-2 space-y-0.5">{children}</ul>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, badge, tag }: { to: string; icon: any; label: string; badge?: number; tag?: React.ReactNode }) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) => cls(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
          isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50',
        )}
      >
        <Icon className="size-4" />
        <span className="flex-1">{label}</span>
        {tag}
        {badge != null && (
          <span className="rounded-full bg-slate-100 text-slate-600 text-xs px-2 py-0.5 font-semibold">
            {badge}
          </span>
        )}
      </NavLink>
    </li>
  );
}

function TopbarAvatar() {
  const { admin } = useSession();
  if (!admin) return null;
  const initials = admin.displayName.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="size-9 grid place-items-center rounded-full bg-brand-600 text-white font-bold text-sm" title={admin.displayName}>
      {initials}
    </span>
  );
}

function IconBtn({
  children, dot, onClick, title, className,
}: {
  children: React.ReactNode;
  dot?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cls(
        'relative size-9 grid place-items-center rounded-full hover:bg-slate-100',
        className,
      )}
    >
      {children}
      {dot && <span className="absolute top-2 right-2 size-2 rounded-full bg-brand-500" />}
    </button>
  );
}

/**
 * PWA install button. The Download icon in the topbar previously did nothing.
 * Now it:
 *   • Shows nothing when the app is already installed (running in standalone mode)
 *   • Captures the browser's `beforeinstallprompt` event and surfaces it on tap
 *   • Falls back to a helpful tip for iOS (Safari) which doesn't fire the event
 *
 * On Chrome/Edge/Android, tapping calls `prompt.prompt()` which shows the
 * native install dialog. On iOS we tell the user how to "Add to Home Screen"
 * via the share sheet — there is no programmatic install API on iOS today.
 */
function InstallPwaButton() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Already installed → no button.
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }
    const onBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    if (deferred) {
      try {
        deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice?.outcome === 'accepted') setInstalled(true);
      } catch (e) {
        console.warn('Install prompt failed:', e);
      } finally {
        setDeferred(null);
      }
      return;
    }
    // No deferred event — likely iOS Safari, or the browser already showed
    // the install prompt earlier and the user dismissed it.
    const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);
    if (isIOS) {
      alert('To install on iPhone/iPad: tap the Share button in Safari and choose "Add to Home Screen".');
    } else {
      alert('Install is not available right now. In Chrome/Edge, look for the install icon in the address bar (▢ with ↓).');
    }
  };

  return (
    <IconBtn onClick={handleClick} title="Install FoodCourt Admin">
      <Download className="size-4" />
    </IconBtn>
  );
}

// (suppress unused)
export const _icons = { CheckIcon, ChevronRight, MessageSquare };
