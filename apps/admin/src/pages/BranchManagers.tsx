import { useCallback, useEffect, useState } from 'react';
import { Building2, Mail, Plus, Shield, Trash2, UserCog } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Drawer';
import { useTenant } from '../lib/tenant';
import {
  listStaff, removeStaff, createBranchManager, isValidEmail,
  type StaffRow,
} from '../lib/api';

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function BranchManagers() {
  const { branches } = useTenant();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ branchId: string; branchName: string } | null>(null);

  const branchIds = branches.map(b => b.id);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await listStaff(branchIds)); }
    catch (e: any) { setError(e.message ?? 'Failed to load staff'); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchIds.join(',')]);

  useEffect(() => { refresh(); }, [refresh]);

  const managersByBranch = (rid: string) =>
    rows.filter(r => r.restaurant_id === rid && r.role === 'manager');

  const ownersByBranch = (rid: string) =>
    rows.filter(r => r.restaurant_id === rid && r.role === 'owner');

  const handleRemove = async (s: StaffRow) => {
    if (!confirm(`Remove ${s.display_name ?? 'this manager'} from the branch? Their account stays but loses access here.`)) return;
    const prev = rows;
    setRows(rs => rs.filter(r => r.id !== s.id));
    try { await removeStaff(s.restaurant_id, s.user_id); }
    catch (e: any) { setError(e.message); setRows(prev); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branch Managers"
        subtitle={`${branches.length} branches in your organization · create a manager login for each branch`}
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 flex items-start gap-3">
        <Shield className="size-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold mb-0.5">Role split</p>
          <ul className="list-disc list-inside text-xs text-blue-900/85 space-y-0.5">
            <li><strong>Owner</strong> (you) — sees and manages every branch in this organization.</li>
            <li><strong>Branch Manager</strong> — limited to one branch's orders, menu, tables, payments.</li>
          </ul>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      <ul className="space-y-3">
        {branches.map(b => {
          const managers = managersByBranch(b.id);
          const owners = ownersByBranch(b.id);
          return (
            <li key={b.id} className="bg-white rounded-2xl shadow-card overflow-hidden">
              <header className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 justify-between flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <Building2 className="size-5 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold truncate">{b.name}</p>
                    <p className="text-xs text-slate-500 truncate">/{b.slug} · {managers.length} manager{managers.length === 1 ? '' : 's'} · {owners.length} owner{owners.length === 1 ? '' : 's'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setCreating({ branchId: b.id, branchName: b.name })}
                  className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700"
                >
                  <Plus className="size-4" /> Create manager
                </button>
              </header>

              <ul className="divide-y divide-slate-100">
                {[...owners, ...managers].map(m => (
                  <li key={m.id} className="px-5 py-3 flex items-center gap-3">
                    <span className="size-9 grid place-items-center rounded-full bg-brand-600 text-white text-xs font-bold shrink-0">
                      {initials(m.display_name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{m.display_name ?? 'Team member'}</p>
                      <p className="text-xs text-slate-500 capitalize">{m.role}</p>
                    </div>
                    {m.role === 'manager' && (
                      <button
                        onClick={() => handleRemove(m)}
                        className="size-8 grid place-items-center rounded-full hover:bg-rose-50 text-rose-600"
                        title="Remove from branch"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
                {managers.length + owners.length === 0 && (
                  <li className="px-5 py-6 text-center text-sm text-slate-500">
                    No team members yet for {b.name}.
                  </li>
                )}
              </ul>
            </li>
          );
        })}
        {!loading && branches.length === 0 && (
          <li className="bg-white rounded-2xl shadow-card p-10 text-center">
            <UserCog className="size-10 mx-auto text-slate-300" />
            <p className="mt-3 text-slate-700 font-semibold">No branches yet</p>
            <p className="text-sm text-slate-500 mt-1">Ask Super Admin to add branches to your organization first.</p>
          </li>
        )}
      </ul>

      {creating && (
        <CreateManagerModal
          open
          branchId={creating.branchId}
          branchName={creating.branchName}
          onClose={() => setCreating(null)}
          onCreated={() => { setCreating(null); refresh(); }}
        />
      )}
    </div>
  );
}

function CreateManagerModal({
  open, branchId, branchName, onClose, onCreated,
}: {
  open: boolean;
  branchId: string;
  branchName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password) { setErr('Email and password are required'); return; }
    if (!isValidEmail(email)) { setErr('Email looks malformed — use the format name@example.com'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setSaving(true); setErr(null); setSavedNote(null);
    try {
      await createBranchManager({
        restaurant_id: branchId,
        manager: { email, password, display_name: name || undefined },
      });
      setSavedNote(`Manager account created. ${name || email.split('@')[0]} can sign in at /login.`);
      setName(''); setEmail(''); setPassword('');
      onCreated();
    } catch (e: any) {
      setErr(e.message ?? 'Could not create');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { setSavedNote(null); onClose(); }}
      title={`Create manager for ${branchName}`}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={() => { setSavedNote(null); onClose(); }} className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white rounded-full">
            {savedNote ? 'Close' : 'Cancel'}
          </button>
          {!savedNote && (
            <button onClick={submit} disabled={saving || !email || !password} className="px-5 py-2 text-sm font-semibold rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create manager'}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex items-start gap-2">
          <Mail className="size-4 mt-0.5 shrink-0" />
          <span>This person will be able to sign in and manage only <strong>{branchName}</strong>. They won't see other branches or your organization's billing details.</span>
        </div>
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Email</span>
          <input value={email} onChange={e => setEmail(e.target.value.trim())} type="email" placeholder="alice@spicegarden.in" className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" autoFocus />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Password</span>
          <div className="relative">
            <input value={password} onChange={e => setPassword(e.target.value)} type={showPwd ? 'text' : 'password'} placeholder="At least 6 characters" className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 pr-16" />
            <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1">
              {showPwd ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        {err && <p className="text-sm text-rose-700 bg-rose-50 rounded-lg p-2">{err}</p>}
        {savedNote && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-lg p-2">{savedNote}</p>}
      </div>
    </Modal>
  );
}
