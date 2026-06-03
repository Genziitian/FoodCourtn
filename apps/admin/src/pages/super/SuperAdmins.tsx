import { useEffect, useState } from 'react';
import { IndianRupee, LifeBuoy, Mail, Plus, Shield, ShieldCheck } from 'lucide-react';
import type { PlatformAdminRole } from '@foodcourt/shared';
import { cls } from '@foodcourt/shared';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Drawer';
import { listPlatformAdmins, type PlatformAdminRow } from '../../lib/api';

const ROLE_STYLE: Record<PlatformAdminRole, { bg: string; icon: any; desc: string }> = {
  super_admin: { bg: 'bg-purple-100 text-purple-700', icon: ShieldCheck, desc: 'Full platform access — restaurants, billing, payments, infra' },
  support:     { bg: 'bg-blue-100 text-blue-700',     icon: LifeBuoy,    desc: 'Read tenant data, resolve tickets, refund' },
  finance:     { bg: 'bg-emerald-100 text-emerald-700', icon: IndianRupee, desc: 'Commissions, payouts, invoices' },
};

function initials(name: string | null): string {
  if (!name) return '?';
  return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function SuperAdmins() {
  const [admins, setAdmins] = useState<PlatformAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listPlatformAdmins()
      .then(a => { if (!cancelled) setAdmins(a); })
      .catch(e => console.error(e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Admins"
        subtitle={loading ? 'Loading…' : `${admins.length} platform-level users · access to every tenant`}
        actions={
          <button
            onClick={() => setInviting(true)}
            className="inline-flex items-center gap-2 rounded-full bg-purple-600 text-white px-4 py-2 text-sm font-semibold hover:bg-purple-700"
          >
            <Plus className="size-4" /> Invite admin
          </button>
        }
      />

      <div className="rounded-xl bg-purple-50 border border-purple-200 p-4 text-sm text-purple-900 flex items-start gap-3">
        <Shield className="size-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold mb-0.5">Platform admins bypass tenant isolation</p>
          <p>Their queries skip RLS on tenant tables. Grant carefully and audit periodically.</p>
        </div>
      </div>

      <section className="bg-white rounded-2xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-3">Member</th>
              <th className="px-6 py-3">Role</th>
              <th className="px-6 py-3">Access scope</th>
              <th className="px-6 py-3">Granted</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {admins.map(a => {
              const s = ROLE_STYLE[a.role];
              const Icon = s.icon;
              return (
                <tr key={a.user_id} className="hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <span className="size-10 grid place-items-center rounded-full bg-purple-600 text-white font-bold text-xs shrink-0">
                        {initials(a.display_name)}
                      </span>
                      <div>
                        <p className="font-semibold">{a.display_name ?? 'Platform admin'}</p>
                        <p className="text-xs text-slate-500 inline-flex items-center gap-1 font-mono">
                          <Mail className="size-3" /> {a.user_id.slice(0, 8)}…
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={cls('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize', s.bg)}>
                      <Icon className="size-3.5" />
                      {a.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-600 max-w-[280px]">{s.desc}</td>
                  <td className="px-6 py-3 text-xs text-slate-500">{new Date(a.created_at).toLocaleDateString('en-IN')}</td>
                  <td className="px-6 py-3 text-right">
                    <button className="text-xs font-semibold text-slate-600 hover:bg-slate-100 px-3 py-1.5 rounded-lg">
                      Manage
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && admins.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                  No platform admins yet. Add a row to <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">platform_admins</code> via Supabase SQL to seed the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <InviteAdminModal open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}

function InviteAdminModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite platform admin"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-full hover:bg-white">Close</button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          Inviting platform admins requires Supabase Auth + a service-role action (creating an <code className="font-mono">auth.users</code> row and a <code className="font-mono">platform_admins</code> entry). Add admins manually via SQL Editor for now:
          <pre className="mt-2 text-xs bg-amber-100 p-2 rounded font-mono overflow-x-auto">{`insert into platform_admins (user_id, role, display_name)
values ('<auth.uid here>', 'super_admin', 'Your name');`}</pre>
        </div>
      </div>
    </Modal>
  );
}
