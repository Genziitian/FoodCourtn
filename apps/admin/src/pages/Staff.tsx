import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChefHat, IndianRupee, MoreHorizontal, Plus, Search, Shield, UserCog, Utensils,
} from 'lucide-react';
import type { StaffRole } from '@foodcourt/shared';
import { cls } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { useTenant } from '../lib/tenant';
import { listStaff, type StaffRow } from '../lib/api';

const ROLE_STYLE: Record<StaffRole, { bg: string; icon: any; label: string; desc: string }> = {
  owner:   { bg: 'bg-purple-100 text-purple-700', icon: Shield,    label: 'Owner',         desc: 'Full access to everything' },
  manager: { bg: 'bg-brand-100 text-brand-700',   icon: UserCog,   label: 'Manager',       desc: 'Operations, menu, offers, settings' },
  cashier: { bg: 'bg-blue-100 text-blue-700',     icon: IndianRupee,label: 'Cashier',      desc: 'Payments, refunds, reconciliation' },
  kitchen: { bg: 'bg-amber-100 text-amber-700',   icon: ChefHat,   label: 'Kitchen staff', desc: 'KDS, KOT management' },
  waiter:  { bg: 'bg-emerald-100 text-emerald-700', icon: Utensils,label: 'Waiter',       desc: 'Orders, table assignment' },
};

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function Staff() {
  const { scopedRestaurantIds } = useTenant();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all');

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await listStaff(scopedRestaurantIds)); }
    catch (e: any) { setError(e.message ?? 'Failed to load staff'); }
    finally { setLoading(false); }
  }, [scopedRestaurantIds]);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(s => {
      if (roleFilter !== 'all' && s.role !== roleFilter) return false;
      const nm = (s.display_name ?? '').toLowerCase();
      if (q && !nm.includes(q)) return false;
      return true;
    });
  }, [rows, query, roleFilter]);

  const counts = useMemo(() => {
    const c: Record<StaffRole | 'total', number> = { owner: 0, manager: 0, cashier: 0, kitchen: 0, waiter: 0, total: rows.length };
    rows.forEach(s => { c[s.role] = (c[s.role] ?? 0) + 1; });
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        subtitle={loading ? 'Loading…' : `${counts.total} members · ${counts.manager} managers · ${counts.kitchen + counts.waiter} on the floor`}
        actions={
          <button
            disabled
            title="Inviting staff requires Supabase Auth wiring — coming soon"
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold opacity-50 cursor-not-allowed"
          >
            <Plus className="size-4" /> Invite staff
          </button>
        }
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {(Object.keys(ROLE_STYLE) as StaffRole[]).map(r => {
          const s = ROLE_STYLE[r];
          return (
            <button
              key={r}
              onClick={() => setRoleFilter(roleFilter === r ? 'all' : r)}
              className={cls(
                'text-left bg-white rounded-xl p-4 shadow-card transition',
                roleFilter === r && 'ring-2 ring-brand-500/50',
              )}
            >
              <div className="flex items-start gap-3">
                <span className={cls('size-9 grid place-items-center rounded-lg', s.bg)}>
                  <s.icon className="size-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{s.label}</p>
                  <p className="text-xl font-bold mt-0.5">{counts[r]}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <section className="bg-white rounded-2xl shadow-card overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name..."
              className="w-full rounded-full bg-slate-100 pl-10 pr-4 py-2 text-sm outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          {roleFilter !== 'all' && (
            <button onClick={() => setRoleFilter('all')} className="text-sm text-brand-600 font-semibold">
              Clear filter
            </button>
          )}
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-3">Member</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Joined</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(m => {
                const role = ROLE_STYLE[m.role];
                const RoleIcon = role.icon;
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span className="size-9 grid place-items-center rounded-full bg-brand-600 text-white text-xs font-bold shrink-0">
                          {initials(m.display_name)}
                        </span>
                        <div>
                          <p className="font-semibold">{m.display_name ?? 'Team member'}</p>
                          <p className="text-xs text-slate-500">{role.desc}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={cls('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', role.bg)}>
                        <RoleIcon className="size-3.5" />
                        {role.label}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500">
                      {new Date(m.created_at).toLocaleDateString('en-IN')}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button className="size-8 grid place-items-center rounded-full hover:bg-slate-100 text-slate-500">
                        <MoreHorizontal className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="text-center text-slate-500 py-12">
              No staff yet. Wire Supabase Auth and invite team members via <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">restaurant_staff</code>.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
