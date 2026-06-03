import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Clock, Phone, Plus, Search, Users as UsersIcon,
} from 'lucide-react';
import type { ReservationStatus } from '@foodcourt/shared';
import { cls } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Drawer';
import { useTenant } from '../lib/tenant';
import { listReservations, createReservation, updateReservationStatus, type ReservationRow } from '../lib/api';

type Day = 'today' | 'tomorrow' | 'week' | 'all';

const STATUS_STYLE: Record<ReservationStatus, string> = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  seated:    'bg-blue-100 text-blue-700',
  completed: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-rose-100 text-rose-700',
  no_show:   'bg-rose-100 text-rose-700',
};

const NEXT: Record<ReservationStatus, ReservationStatus | null> = {
  pending: 'confirmed',
  confirmed: 'seated',
  seated: 'completed',
  completed: null,
  cancelled: null,
  no_show: null,
};

export default function Reservations() {
  const { branch, scopedRestaurantIds } = useTenant();
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<Day>('today');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReservationStatus>('all');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await listReservations(scopedRestaurantIds)); }
    catch (e: any) { setError(e.message ?? 'Failed to load reservations'); }
    finally { setLoading(false); }
  }, [scopedRestaurantIds]);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = query.trim().toLowerCase();
    return rows
      .filter(r => {
        const ts = new Date(r.reserved_at).getTime();
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const tomStart = new Date(todayStart); tomStart.setDate(tomStart.getDate() + 1);
        const weekEnd = new Date(todayStart); weekEnd.setDate(weekEnd.getDate() + 7);

        if (day === 'today'    && (ts < todayStart.getTime() || ts >= tomStart.getTime())) return false;
        if (day === 'tomorrow' && (ts < tomStart.getTime()    || ts >= tomStart.getTime() + 86400e3)) return false;
        if (day === 'week'     && (ts < now                    || ts >= weekEnd.getTime())) return false;
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (q && !r.customer_name.toLowerCase().includes(q) && !(r.customer_phone?.includes(q))) return false;
        return true;
      })
      .sort((a, b) => +new Date(a.reserved_at) - +new Date(b.reserved_at));
  }, [rows, day, statusFilter, query]);

  const counts = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const tomStart = new Date(todayStart); tomStart.setDate(tomStart.getDate() + 1);
    const today = rows.filter(r => {
      const ts = new Date(r.reserved_at).getTime();
      return ts >= todayStart.getTime() && ts < tomStart.getTime();
    });
    return {
      total: today.length,
      confirmed: today.filter(r => r.status === 'confirmed').length,
      pending: today.filter(r => r.status === 'pending').length,
      covers: today.reduce((s, r) => s + r.party_size, 0),
    };
  }, [rows]);

  const advance = async (r: ReservationRow) => {
    const next = NEXT[r.status]; if (!next) return;
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, status: next } : x));
    try { await updateReservationStatus(r.id, next); }
    catch (e) { console.error(e); refresh(); }
  };

  const cancel = async (r: ReservationRow) => {
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, status: 'cancelled' } : x));
    try { await updateReservationStatus(r.id, 'cancelled'); }
    catch (e) { console.error(e); refresh(); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservations"
        subtitle={loading ? 'Loading…' : `${counts.total} today · ${counts.confirmed} confirmed · ${counts.pending} pending · ${counts.covers} covers`}
        actions={
          <button
            onClick={() => setCreating(true)}
            disabled={!branch}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="size-4" /> New reservation
          </button>
        }
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 pt-3 flex items-center gap-2 border-b border-slate-100">
          <DayTab active={day === 'today'}    onClick={() => setDay('today')}    label="Today" />
          <DayTab active={day === 'tomorrow'} onClick={() => setDay('tomorrow')} label="Tomorrow" />
          <DayTab active={day === 'week'}     onClick={() => setDay('week')}     label="This week" />
          <DayTab active={day === 'all'}      onClick={() => setDay('all')}      label="All" />
        </div>

        <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or phone..."
              className="w-full rounded-full bg-slate-100 pl-10 pr-4 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs">
            {(['all','pending','confirmed','seated','completed','cancelled','no_show'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cls(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold capitalize',
                  statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
                )}
              >
                {s === 'no_show' ? 'No-show' : s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(r => {
                const next = NEXT[r.status];
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold inline-flex items-center gap-1.5">
                        <Clock className="size-3.5 text-slate-400" />
                        {formatTime(r.reserved_at)}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(r.reserved_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.customer_name}</p>
                      {r.customer_phone && (
                        <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                          <Phone className="size-3" /> {r.customer_phone}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <UsersIcon className="size-3.5 text-slate-400" />
                        {r.party_size}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs uppercase font-bold tracking-wider text-slate-500">{r.source}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cls('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize', STATUS_STYLE[r.status])}>
                        {r.status === 'no_show' ? 'No-show' : r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="text-xs text-slate-600 truncate">
                        {r.notes ?? <span className="text-slate-400 italic">—</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {next && (
                          <button
                            onClick={() => advance(r)}
                            className="inline-flex items-center gap-1 rounded-full bg-brand-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-brand-700 capitalize"
                          >
                            Mark {next.replace('_',' ')}
                          </button>
                        )}
                        {r.status !== 'cancelled' && r.status !== 'completed' && r.status !== 'no_show' && (
                          <button
                            onClick={() => cancel(r)}
                            className="text-xs font-semibold text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-full"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <CalendarDays className="size-8 mx-auto text-slate-300" />
              <p className="mt-2 text-sm">No reservations match your filter.</p>
            </div>
          )}
        </div>
      </div>

      {branch && (
        <CreateModal
          open={creating}
          restaurantId={branch.id}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refresh(); }}
        />
      )}
    </div>
  );
}

function DayTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cls(
        'px-4 py-3 -mb-px border-b-2 text-sm font-semibold',
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700',
      )}
    >
      {label}
    </button>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}

function CreateModal({
  open, restaurantId, onClose, onCreated,
}: { open: boolean; restaurantId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('19:30');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name || !phone) return;
    setSaving(true); setErr(null);
    try {
      await createReservation({
        restaurant_id: restaurantId,
        table_id: null,
        customer_name: name,
        customer_phone: phone,
        customer_email: null,
        party_size: partySize,
        reserved_at: new Date(`${date}T${time}:00`).toISOString(),
        duration_min: 90,
        status: 'confirmed',
        notes: notes || null,
        source: 'phone',
      });
      setName(''); setPhone(''); setPartySize(2); setNotes('');
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
      onClose={onClose}
      title="New reservation"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-full hover:bg-white">Cancel</button>
          <button onClick={submit} disabled={!name || !phone || saving} className="px-5 py-2 text-sm font-semibold rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Confirm reservation'}
          </button>
        </div>
      }
    >
      {err && <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{err}</div>}
      <div className="space-y-4">
        <Field label="Guest name" required>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" />
        </Field>
        <Field label="Phone" required>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98xxx xxxxx" className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Party"><input type="number" min={1} value={partySize} onChange={e => setPartySize(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" /></Field>
          <Field label="Date"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" /></Field>
          <Field label="Time"><input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" /></Field>
        </div>
        <Field label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 resize-none" placeholder="Anniversary, allergies, special requests..." />
        </Field>
      </div>
    </Modal>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
