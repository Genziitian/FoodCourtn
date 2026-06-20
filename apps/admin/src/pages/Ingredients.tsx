import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Package, Minus, Plus as PlusIcon } from 'lucide-react';
import { cls, inr } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Drawer';
import { useTenant } from '../lib/tenant';
import {
  listIngredients, createIngredient, updateIngredient, deleteIngredient, adjustIngredientStock,
  type IngredientRow,
} from '../lib/api';

const UNIT_OPTIONS = ['pcs', 'g', 'kg', 'ml', 'l', 'tbsp', 'tsp'];

export default function Ingredients() {
  const { branch } = useTenant();
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<IngredientRow | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!branch) { setRows([]); setLoading(false); return; }
    setLoading(true); setErr(null);
    try { setRows(await listIngredients(branch.id)); }
    catch (e: any) { setErr(e.message ?? 'Failed to load'); }
    finally { setLoading(false); }
  }, [branch]);

  useEffect(() => { refresh(); }, [refresh]);

  const lowStock = useMemo(
    () => rows.filter(r => r.low_stock_threshold != null && r.stock_qty <= r.low_stock_threshold),
    [rows],
  );

  const remove = async (r: IngredientRow) => {
    if (!confirm(`Delete ${r.name}? Any recipes using it will break.`)) return;
    const prev = rows;
    setRows(s => s.filter(x => x.id !== r.id));
    try { await deleteIngredient(r.id); }
    catch (e: any) { alert(e.message); setRows(prev); }
  };

  const bump = async (r: IngredientRow, delta: number) => {
    // Optimistic update then write.
    setRows(s => s.map(x => x.id === r.id ? { ...x, stock_qty: Math.max(0, x.stock_qty + delta) } : x));
    try { await adjustIngredientStock(r.id, delta); }
    catch (e: any) { alert(e.message); refresh(); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ingredients"
        subtitle={loading
          ? 'Loading…'
          : `${rows.length} ingredient${rows.length === 1 ? '' : 's'} · ${lowStock.length} low-stock`}
        actions={
          <button
            disabled={!branch}
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="size-4" /> New ingredient
          </button>
        }
      />

      {!branch && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          Pick a single branch in the sidebar to manage its ingredients.
        </div>
      )}
      {err && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{err}</div>
      )}

      {branch && (
        <section className="bg-white rounded-2xl shadow-card overflow-hidden">
          {rows.length === 0 && !loading ? (
            <div className="text-center py-16">
              <Package className="size-10 mx-auto text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700">No ingredients yet</p>
              <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                Add the raw materials your kitchen consumes. Then build recipes from each menu item to link them.
              </p>
              <button
                onClick={() => setCreating(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700"
              >
                <Plus className="size-4" /> Add first ingredient
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-center">Quick adjust</th>
                  <th className="px-4 py-3 text-right">Low alert</th>
                  <th className="px-4 py-3 text-right">Cost / unit</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => {
                  const isLow = r.low_stock_threshold != null && r.stock_qty <= r.low_stock_threshold;
                  const isOut = r.stock_qty <= 0;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-semibold">{r.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={cls(
                          'inline-flex items-center gap-1.5 font-bold',
                          isOut ? 'text-rose-700' : isLow ? 'text-amber-700' : 'text-emerald-700',
                        )}>
                          {r.stock_qty}{' '}
                          <span className="text-xs font-normal text-slate-500">{r.unit}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center rounded-full border border-slate-200 overflow-hidden bg-white">
                          <button onClick={() => bump(r, -1)} className="px-2 py-1 text-slate-600 hover:bg-slate-50">
                            <Minus className="size-3.5" />
                          </button>
                          <button onClick={() => bump(r, 1)} className="px-2 py-1 text-emerald-600 hover:bg-emerald-50 border-l border-slate-200">
                            <PlusIcon className="size-3.5" />
                          </button>
                          <button onClick={() => bump(r, 10)} className="px-2 py-1 text-emerald-700 hover:bg-emerald-50 border-l border-slate-200 text-[11px] font-bold">
                            +10
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                        {r.low_stock_threshold ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                        {r.cost_per_unit ? inr(r.cost_per_unit) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditing(r)} className="size-8 grid place-items-center rounded-full hover:bg-slate-100 text-slate-600" title="Edit">
                            <Pencil className="size-4" />
                          </button>
                          <button onClick={() => remove(r)} className="size-8 grid place-items-center rounded-full hover:bg-rose-50 text-rose-600" title="Delete">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {branch && (
        <IngredientEditor
          open={creating || !!editing}
          ingredient={editing}
          restaurantId={branch.id}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function IngredientEditor({
  open, ingredient, restaurantId, onClose, onSaved,
}: {
  open: boolean;
  ingredient: IngredientRow | null;
  restaurantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!ingredient;
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [qty, setQty] = useState<number>(0);
  const [threshold, setThreshold] = useState<number>(0);
  const [cost, setCost] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (ingredient) {
      setName(ingredient.name);
      setUnit(ingredient.unit);
      setQty(ingredient.stock_qty);
      setThreshold(ingredient.low_stock_threshold ?? 0);
      setCost(ingredient.cost_per_unit);
    } else {
      setName(''); setUnit('pcs'); setQty(0); setThreshold(0); setCost(0);
    }
    setErr(null);
  }, [open, ingredient]);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true); setErr(null);
    try {
      if (isEdit && ingredient) {
        await updateIngredient(ingredient.id, {
          name: name.trim(), unit, stock_qty: qty,
          low_stock_threshold: threshold, cost_per_unit: cost,
        });
      } else {
        await createIngredient({
          restaurant_id: restaurantId,
          name: name.trim(),
          unit,
          stock_qty: qty,
          low_stock_threshold: threshold,
          cost_per_unit: cost,
        });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message ?? 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${ingredient?.name}` : 'New ingredient'}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-full hover:bg-white">Cancel</button>
          <button
            disabled={!name.trim() || saving}
            onClick={submit}
            className="px-5 py-2 text-sm font-semibold rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : (isEdit ? 'Save' : 'Create')}
          </button>
        </div>
      }
    >
      {err && <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{err}</div>}
      <div className="space-y-4">
        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Name</span>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="Chicken breast"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Unit</span>
            <select
              value={unit} onChange={e => setUnit(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 bg-white"
            >
              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Current stock</span>
            <input
              type="number" min={0} step="any"
              value={qty} onChange={e => setQty(Number(e.target.value || 0))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Low-stock alert below</span>
            <input
              type="number" min={0} step="any"
              value={threshold} onChange={e => setThreshold(Number(e.target.value || 0))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Cost per unit (₹)</span>
            <input
              type="number" min={0} step="any"
              value={cost} onChange={e => setCost(Number(e.target.value || 0))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}
