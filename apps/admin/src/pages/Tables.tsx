import { useCallback, useEffect, useState } from 'react';
import {
  Coffee, Copy, Download, ExternalLink, Plus, QrCode, Sparkles, Trash2, Users as UsersIcon,
} from 'lucide-react';
import { cls, inr } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Drawer';
import { useTenant } from '../lib/tenant';
import { listTables, createTable, deleteTable, seedDefaultTables, type AdminTableRow } from '../lib/api';
import { CUSTOMER_URL } from '../lib/urls';

const CUSTOMER_BASE = (slug: string) => `${CUSTOMER_URL}/${slug}/t/`;

export default function Tables() {
  const { branch } = useTenant();
  const [tables, setTables] = useState<AdminTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openQr, setOpenQr] = useState<AdminTableRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const seedDefaults = async () => {
    if (!branch) return;
    if (!confirm(`Generate 8 default tables for ${branch.name}? Each gets a unique QR token.`)) return;
    setSeeding(true);
    try { await seedDefaultTables(branch.id, 8); refresh(); }
    catch (e: any) { alert(e.message ?? 'Could not seed tables'); }
    finally { setSeeding(false); }
  };

  const refresh = useCallback(async () => {
    if (!branch) { setTables([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try { setTables(await listTables(branch.id)); }
    catch (e: any) { setError(e.message ?? 'Failed to load tables'); }
    finally { setLoading(false); }
  }, [branch]);

  useEffect(() => { refresh(); }, [refresh]);

  const occupied = tables.filter(t => t.active_order_id).length;
  const totalToday = tables.reduce((s, t) => s + (t.total_today ?? 0), 0);

  const remove = async (t: AdminTableRow) => {
    if (!confirm(`Delete ${t.label}? This is permanent.`)) return;
    const prev = tables;
    setTables(ts => ts.filter(x => x.id !== t.id));
    try { await deleteTable(t.id); }
    catch (e: any) { alert(e.message); setTables(prev); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tables & QR"
        subtitle={loading ? 'Loading…' : `${tables.length} tables · ${occupied} occupied · ${inr(totalToday)} revenue today`}
        actions={
          <button
            disabled={!branch}
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="size-4" /> Add table
          </button>
        }
      />

      {!branch && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          Pick a single branch in the sidebar to manage its tables.
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      {branch && (
        <section>
          <h2 className="text-base font-bold mb-3">Floor plan</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {tables.map(t => {
              const isOccupied = !!t.active_order_id;
              return (
                <div
                  key={t.id}
                  className={cls(
                    'group bg-white rounded-2xl shadow-card overflow-hidden transition hover:shadow-cardHover relative',
                    isOccupied && 'ring-2 ring-brand-500/40',
                  )}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-slate-500 font-medium font-mono">{t.qr_token.toUpperCase()}</p>
                        <p className="text-lg font-bold">{t.label}</p>
                      </div>
                      <span className={cls(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                        isOccupied ? 'bg-brand-100 text-brand-700' : 'bg-emerald-100 text-emerald-700',
                      )}>
                        <span className={cls('size-1.5 rounded-full', isOccupied ? 'bg-brand-500' : 'bg-emerald-500')} />
                        {isOccupied ? 'Occupied' : 'Available'}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <UsersIcon className="size-3.5" />
                        QR active
                      </span>
                      {isOccupied && (
                        <span className="inline-flex items-center gap-1">
                          <Coffee className="size-3.5" />
                          live
                        </span>
                      )}
                    </div>

                    {t.active_order_code && (
                      <div className="mt-3 bg-brand-50 border border-brand-100 rounded-lg px-2.5 py-1.5">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-brand-700/70">Active</p>
                        <p className="font-mono text-sm font-bold text-brand-700">{t.active_order_code}</p>
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Today</span>
                      <span className="font-semibold">{inr(t.total_today ?? 0)}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 grid grid-cols-3">
                    <button
                      onClick={() => setOpenQr(t)}
                      className="py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5"
                    >
                      <QrCode className="size-3.5" />
                      QR
                    </button>
                    <a
                      href={CUSTOMER_BASE(branch.slug) + t.qr_token}
                      target="_blank"
                      rel="noreferrer"
                      className="py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 border-l border-slate-100"
                    >
                      <ExternalLink className="size-3.5" />
                      Preview
                    </a>
                    <button
                      onClick={() => remove(t)}
                      className="py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center gap-1.5 border-l border-slate-100"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {!loading && tables.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl shadow-card">
              <QrCode className="size-10 mx-auto text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700">No tables yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Add tables one-by-one, or generate 8 defaults with auto QR tokens.
              </p>
              <button
                onClick={seedDefaults}
                disabled={seeding}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                <Sparkles className="size-4" />
                {seeding ? 'Generating…' : 'Generate 8 default tables'}
              </button>
            </div>
          )}
        </section>
      )}

      {branch && <QrModal slug={branch.slug} table={openQr} onClose={() => setOpenQr(null)} />}
      {branch && (
        <AddTableModal
          open={adding}
          branchId={branch.id}
          branchSlug={branch.slug}
          onClose={() => setAdding(false)}
          onCreated={() => { setAdding(false); refresh(); }}
        />
      )}
    </div>
  );
}

function AddTableModal({
  open, branchId, branchSlug, onClose, onCreated,
}: {
  open: boolean;
  branchId: string;
  branchSlug: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!label || !token) return;
    setSaving(true); setErr(null);
    try {
      await createTable({ restaurant_id: branchId, label, qr_token: token });
      setLabel(''); setToken('');
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
      title="Add table"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-full hover:bg-white">Cancel</button>
          <button disabled={!label || !token || saving} onClick={submit} className="px-5 py-2 text-sm font-semibold rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Create table'}
          </button>
        </div>
      }
    >
      {err && <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{err}</div>}
      <div className="space-y-4">
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Label</span>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Table 9" className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">QR token (URL suffix)</span>
          <input value={token} onChange={e => setToken(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder={`${branchSlug.split('-').slice(-1)[0]}-t9`} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 font-mono" />
        </label>
        <p className="text-xs text-slate-500">Customer will scan to land on <code className="font-mono">/{branchSlug}/t/{token || '...'}</code></p>
      </div>
    </Modal>
  );
}

function QrModal({ slug, table, onClose }: { slug: string; table: AdminTableRow | null; onClose: () => void }) {
  if (!table) return null;
  const url = CUSTOMER_BASE(slug) + table.qr_token;
  return (
    <Modal
      open
      onClose={onClose}
      title={`QR code · ${table.label}`}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={() => navigator.clipboard?.writeText(url)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
          >
            <Copy className="size-4" /> Copy link
          </button>
          <a
            href={`https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=8&data=${encodeURIComponent(url)}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700"
          >
            <Download className="size-4" /> Open large
          </a>
        </div>
      }
    >
      <div className="text-center">
        <div className="mx-auto size-56 rounded-2xl bg-white border border-slate-200 grid place-items-center overflow-hidden">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(url)}`}
            alt={`QR for ${table.label}`}
            className="size-full p-3"
          />
        </div>
        <p className="mt-4 text-sm text-slate-500">Scan to land on</p>
        <p className="font-mono text-sm text-slate-900 break-all px-6">{url}</p>
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-full px-3 py-1">
          <Sparkles className="size-3.5" />
          Print on table tents — auto-detects {table.label} on the customer app.
        </p>
      </div>
    </Modal>
  );
}
