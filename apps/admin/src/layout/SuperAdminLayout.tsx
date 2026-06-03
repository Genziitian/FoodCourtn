import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, Globe, LayoutGrid, LifeBuoy, LogOut, Server, Shield,
  Wallet,
} from 'lucide-react';
import { cls } from '@foodcourt/shared';
import { useSession } from '../lib/session';

export default function SuperAdminLayout() {
  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-[260px] shrink-0 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-5 py-5 flex items-center gap-3">
          <span className="size-9 grid place-items-center rounded-full bg-purple-500/20">
            <Shield className="size-5 text-purple-300" />
          </span>
          <div className="min-w-0">
            <p className="font-extrabold text-base leading-tight">FoodCourt</p>
            <p className="text-[10px] uppercase tracking-widest text-purple-300 font-bold">Super Admin</p>
          </div>
        </div>

        <a href="/dashboard" className="mx-3 mt-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition px-3 py-2.5 flex items-center gap-2 text-sm text-slate-300">
          <ArrowLeft className="size-4" />
          Back to restaurant admin
        </a>

        <nav className="flex-1 overflow-y-auto mt-6 px-3 pb-4">
          <Section title="Platform">
            <Item to="/super"                  icon={LayoutGrid} label="Dashboard" exact />
            <Item to="/super/restaurants"      icon={Building2}  label="Restaurants" />
            <Item to="/super/payments"         icon={Wallet}     label="Payment Integrations" />
          </Section>
          <Section title="Team">
            <Item to="/super/admins"           icon={Shield}     label="Platform Admins" />
            <Item to="/super/support"          icon={LifeBuoy}   label="Support Tickets" />
          </Section>
          <Section title="Infrastructure">
            <Item to="/super/health"           icon={Server}     label="System Health" />
            <Item to="/super/marketing"        icon={Globe}      label="Public Site" />
          </Section>
        </nav>

        <SuperFooter />
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 text-purple-700 px-3 py-1 text-xs font-bold">
              <Shield className="size-3.5" /> Platform mode
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-600">Full access across all tenants</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              All systems operational
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function SuperFooter() {
  const { admin, signOut } = useSession();
  const navigate = useNavigate();

  if (!admin) {
    return (
      <button
        onClick={() => navigate('/login')}
        className="w-full border-t border-slate-800 px-3 py-3 flex items-center gap-3 hover:bg-slate-800 transition text-left"
      >
        <span className="size-10 grid place-items-center rounded-full bg-slate-700 text-slate-300 font-bold">?</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">Guest mode</p>
          <p className="text-xs text-purple-300 truncate">Sign in →</p>
        </div>
      </button>
    );
  }

  const initials = admin.displayName.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="border-t border-slate-800 px-3 py-3 flex items-center gap-3">
      <span className="size-10 grid place-items-center rounded-full bg-purple-500 text-white font-bold">{initials}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{admin.displayName}</p>
        <p className="text-xs text-slate-400 capitalize">{admin.platformRole?.replace('_', ' ') ?? 'Member'}</p>
      </div>
      <button
        onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
        className="size-8 grid place-items-center rounded-full hover:bg-slate-800"
        title="Sign out"
      >
        <LogOut className="size-4 text-slate-400" />
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="px-3 text-[11px] font-semibold tracking-widest text-slate-400 uppercase">{title}</p>
      <ul className="mt-2 space-y-0.5">{children}</ul>
    </div>
  );
}

function Item({ to, icon: Icon, label, exact }: { to: string; icon: any; label: string; exact?: boolean }) {
  return (
    <li>
      <NavLink
        to={to}
        end={exact}
        className={({ isActive }) => cls(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
          isActive ? 'bg-purple-500/15 text-purple-300' : 'text-slate-300 hover:bg-slate-800',
        )}
      >
        <Icon className="size-4" />
        <span>{label}</span>
      </NavLink>
    </li>
  );
}
