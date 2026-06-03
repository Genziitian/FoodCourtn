import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, MessageSquare, User } from 'lucide-react';
import { cls } from '@foodcourt/shared';
import { PageHeader } from '../../components/PageHeader';
import {
  listSupportTickets, updateTicketStatus, listBranches, listOrganizations,
  type SupportTicketRow, type TicketStatus, type TicketPriority,
  type BranchRow, type OrgRow,
} from '../../lib/api';

const PRIORITY_STYLE: Record<TicketPriority, string> = {
  urgent: 'bg-rose-100 text-rose-700',
  high:   'bg-amber-100 text-amber-700',
  normal: 'bg-slate-100 text-slate-700',
  low:    'bg-slate-100 text-slate-500',
};

const STATUS_STYLE: Record<TicketStatus, string> = {
  open:     'bg-rose-50 text-rose-700',
  pending:  'bg-amber-50 text-amber-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  closed:   'bg-slate-100 text-slate-500',
};

export default function SuperSupport() {
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ts, bs, os] = await Promise.all([
        listSupportTickets({ status: statusFilter }),
        listBranches(),
        listOrganizations(),
      ]);
      setTickets(ts); setBranches(bs); setOrgs(os);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const counts = useMemo(() => {
    const c: Record<TicketStatus | 'total', number> = { open: 0, pending: 0, resolved: 0, closed: 0, total: tickets.length };
    tickets.forEach(t => { c[t.status] += 1; });
    return c;
  }, [tickets]);

  const setStatus = async (t: SupportTicketRow, status: TicketStatus) => {
    setTickets(ts => ts.map(x => x.id === t.id ? { ...x, status } : x));
    try { await updateTicketStatus(t.id, status); }
    catch (e: any) { setError(e.message); refresh(); }
  };

  const findBranchName = (id: string | null) => id ? branches.find(b => b.id === id)?.name ?? '—' : '—';
  const findOrgName    = (id: string | null) => id ? orgs.find(o => o.id === id)?.name ?? '—' : '—';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support Tickets"
        subtitle={loading ? 'Loading…' : `${counts.open} open · ${counts.pending} pending · ${counts.resolved} resolved`}
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Tile icon={AlertTriangle} color="rose"    label="Open"     value={String(counts.open)} sub="Need response" />
        <Tile icon={Clock}         color="amber"   label="Pending"  value={String(counts.pending)} sub="Awaiting tenant" />
        <Tile icon={CheckCircle2}  color="emerald" label="Resolved" value={String(counts.resolved)} sub="Completed" />
        <Tile icon={CheckCircle2}  color="slate"   label="Closed"   value={String(counts.closed)} sub="Archived" />
      </div>

      <section className="bg-white rounded-2xl shadow-card overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-bold">All tickets</h2>
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs">
            {(['all', 'open', 'pending', 'resolved', 'closed'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cls('px-3 py-1.5 rounded-full font-semibold capitalize', statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}
              >
                {s}
              </button>
            ))}
          </div>
        </header>
        <ul className="divide-y divide-slate-100">
          {tickets.map(t => (
            <li key={t.id} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50">
              <span className="size-10 grid place-items-center rounded-lg bg-slate-100 text-slate-500 shrink-0">
                <MessageSquare className="size-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-slate-500 text-xs">{t.id.slice(0, 8)}…</span>
                  <span className={cls('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', PRIORITY_STYLE[t.priority])}>
                    {t.priority}
                  </span>
                  <span className={cls('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', STATUS_STYLE[t.status])}>
                    {t.status}
                  </span>
                </div>
                <p className="font-semibold mt-1">{t.subject}</p>
                {t.body && (
                  <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">{t.body}</p>
                )}
                <p className="text-xs text-slate-500 inline-flex items-center gap-3 mt-1 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <User className="size-3" /> {t.raised_by ?? 'Unknown'} · {findOrgName(t.organization_id)} {t.restaurant_id ? `· ${findBranchName(t.restaurant_id)}` : ''}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" /> {formatMin(minutesAgo(t.created_at))}
                  </span>
                </p>
                {t.resolution && (
                  <p className="text-xs italic text-emerald-700 mt-2 bg-emerald-50 border border-emerald-200 rounded p-2">
                    Resolution: {t.resolution}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <select
                  value={t.status}
                  onChange={e => setStatus(t, e.target.value as TicketStatus)}
                  className="text-xs font-semibold rounded-lg border border-slate-200 px-2 py-1.5 bg-white"
                >
                  <option value="open">Open</option>
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </li>
          ))}
          {!loading && tickets.length === 0 && (
            <li className="px-6 py-16 text-center">
              <MessageSquare className="size-10 mx-auto text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700">No tickets {statusFilter === 'all' ? 'yet' : `in "${statusFilter}"`}</p>
              <p className="text-sm text-slate-500 mt-1">Admins can raise tickets from their dashboard's Notifications page.</p>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Tile({ icon: Icon, color, label, value, sub }: { icon: any; color: 'rose'|'amber'|'emerald'|'slate'; label: string; value: string; sub: string }) {
  const map = {
    rose:    { bg: 'bg-rose-50 text-rose-700' },
    amber:   { bg: 'bg-amber-50 text-amber-700' },
    emerald: { bg: 'bg-emerald-50 text-emerald-700' },
    slate:   { bg: 'bg-slate-100 text-slate-600' },
  }[color];
  return (
    <div className="bg-white p-5 rounded-2xl shadow-card flex items-start gap-3">
      <span className={cls('size-10 grid place-items-center rounded-lg', map.bg)}>
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-2xl font-extrabold mt-1.5">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{sub}</p>
      </div>
    </div>
  );
}

function minutesAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function formatMin(m: number): string {
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}
