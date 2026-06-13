import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { cls, inr } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Drawer';
import { ImageField } from '../components/ImageField';
import { useTenant } from '../lib/tenant';
import {
  listMenuItems, listCategories, createCombo, updateCombo, deleteCombo,
  type MenuItemRow, type CategoryRow,
} from '../lib/api';

type ItemLine = { menu_item_id: string; quantity: number };

export default function Combos() {
  const { branch } = useTenant();
  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuItemRow | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!branch) { setItems([]); setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const [m, c] = await Promise.all([listMenuItems(branch.id), listCategories(branch.id)]);
      setItems(m); setCats(c);
    } catch (e: any) {
      setErr(e.message ?? 'Failed to load');
    } finally { setLoading(false); }
  }, [branch]);

  useEffect(() => { refresh(); }, [refresh]);

  const combos = useMemo(() => items.filter(i => i.is_combo), [items]);
  // Combos can include ANY menu item — regardless of category or the is_combo
  // flag. Filtering by is_combo previously hid items that had been (incorrectly)
  // flagged combo at some point, so users couldn't pick them. Show everything.
  const pickableItems = useMemo(() => items, [items]);
  const byId = useMemo(() => {
    const m = new Map<string, MenuItemRow>();
    items.forEach(i => m.set(i.id, i));
    return m;
  }, [items]);

  const remove = async (combo: MenuItemRow) => {
    if (!confirm(`Delete combo "${combo.name}"? This is permanent.`)) return;
    const prev = items;
    setItems(s => s.filter(x => x.id !== combo.id));
    try { await deleteCombo(combo.id); }
    catch (e: any) { alert(e.message ?? 'Delete failed'); setItems(prev); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Combos"
        subtitle={loading ? 'Loading…' : `${combos.length} combo${combos.length === 1 ? '' : 's'} configured`}
        actions={
          <button
            disabled={!branch || pickableItems.length < 2}
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="size-4" /> New combo
          </button>
        }
      />

      {!branch && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          Pick a single branch in the sidebar to manage its combos.
        </div>
      )}
      {err && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{err}</div>
      )}
      {branch && pickableItems.length < 2 && !loading && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          Add at least 2 menu items first — a combo bundles two or more items into a single deal.
        </div>
      )}

      {branch && (
        <section>
          {combos.length === 0 && !loading && (
            <div className="text-center py-16 bg-white rounded-2xl shadow-card">
              <Sparkles className="size-10 mx-auto text-amber-300" />
              <p className="mt-3 font-semibold text-slate-700">No combos yet</p>
              <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                Bundle 2-3 menu items at a sweet-spot price. Customers see them in a dedicated "Combos" tab and as
                smart upsells in the cart.
              </p>
              {pickableItems.length >= 2 && (
                <button
                  onClick={() => setCreating(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700"
                >
                  <Plus className="size-4" /> Create first combo
                </button>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {combos.map(c => {
              const lines = (c.combo_items ?? []) as ItemLine[];
              const partsTotal = lines.reduce((s, l) => {
                const it = byId.get(l.menu_item_id);
                return s + (it ? Number(it.base_price) * l.quantity : 0);
              }, 0);
              const saving = Math.max(0, partsTotal - c.base_price);

              return (
                <div key={c.id} className="bg-white rounded-2xl shadow-card overflow-hidden hover:shadow-cardHover transition">
                  <div className="aspect-[16/9] bg-slate-100 relative">
                    {c.image_url ? (
                      <img src={c.image_url} alt={c.name} className="size-full object-cover" />
                    ) : (
                      <div className="size-full grid place-items-center">
                        <Sparkles className="size-10 text-amber-300" />
                      </div>
                    )}
                    {saving > 0 && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider">
                        Save {inr(saving)}
                      </span>
                    )}
                    {!c.in_stock && (
                      <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-rose-600 text-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider">
                        Out of stock
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold truncate">{c.name}</h3>
                        {c.description && <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{c.description}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-extrabold text-brand-700">{inr(c.base_price)}</p>
                        {partsTotal > c.base_price && (
                          <p className="text-xs text-slate-400 line-through">{inr(partsTotal)}</p>
                        )}
                      </div>
                    </div>

                    <ul className="mt-3 space-y-1">
                      {lines.length === 0 && (
                        <li className="text-xs text-amber-700 bg-amber-50 rounded-md px-2 py-1">
                          No items linked yet — edit to add components.
                        </li>
                      )}
                      {lines.map((l, i) => {
                        const it = byId.get(l.menu_item_id);
                        return (
                          <li key={i} className="text-sm flex items-center gap-2 text-slate-700">
                            <span className="size-1.5 rounded-full bg-brand-500" />
                            <span className="truncate flex-1">{it?.name ?? <em className="text-rose-500">deleted item</em>}</span>
                            <span className="text-xs text-slate-500">× {l.quantity}</span>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setEditing(c)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="size-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => remove(c)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 text-rose-600 px-3 py-2 text-sm font-semibold hover:bg-rose-50"
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {branch && (
        <ComboEditor
          open={creating || !!editing}
          combo={editing}
          // Pass every menu item — combos are cross-category and we don't
          // want to silently hide anything that was once flagged is_combo.
          // The editor excludes the combo being edited from its own picker.
          allItems={pickableItems.filter(i => i.id !== editing?.id)}
          categories={cats}
          restaurantId={branch.id}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Combo editor modal — same shell handles create & edit.
// ──────────────────────────────────────────────────────────────────────────────

function ComboEditor({
  open, combo, allItems, categories, restaurantId, onClose, onSaved,
}: {
  open: boolean;
  combo: MenuItemRow | null;
  allItems: MenuItemRow[];        // non-combo items only
  categories: CategoryRow[];
  restaurantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!combo;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [price, setPrice] = useState<number>(0);
  // category_id is required by the DB but combos are cross-category, so we
  // pick it silently — preserve the existing one on edit, otherwise use any
  // category that exists for the branch.
  const [categoryId, setCategoryId] = useState<string>('');
  const [inStock, setInStock] = useState(true);
  const [lines, setLines] = useState<ItemLine[]>([]);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset form whenever the modal opens with a new combo (or fresh).
  useEffect(() => {
    if (!open) return;
    if (combo) {
      setName(combo.name);
      setDescription(combo.description ?? '');
      setImageUrl(combo.image_url ?? '');
      setPrice(Number(combo.base_price));
      setCategoryId(combo.category_id);
      setInStock(combo.in_stock);
      setLines((combo.combo_items ?? []).map(l => ({ ...l })));
    } else {
      setName(''); setDescription(''); setImageUrl(''); setPrice(0); setInStock(true);
      setCategoryId(categories[0]?.id ?? '');
      setLines([]);
    }
    setErr(null);
  }, [open, combo, categories]);

  const itemById = useMemo(() => {
    const m = new Map<string, MenuItemRow>();
    allItems.forEach(i => m.set(i.id, i));
    return m;
  }, [allItems]);

  const partsTotal = useMemo(
    () => lines.reduce((s, l) => s + (Number(itemById.get(l.menu_item_id)?.base_price ?? 0) * l.quantity), 0),
    [lines, itemById],
  );
  const saving_inr = Math.max(0, partsTotal - price);

  const addItem = (id: string) => {
    setLines(prev => {
      const existing = prev.find(l => l.menu_item_id === id);
      if (existing) return prev.map(l => l.menu_item_id === id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { menu_item_id: id, quantity: 1 }];
    });
    setPicker(false);
  };

  const setQty = (id: string, qty: number) => {
    setLines(prev => prev.map(l => l.menu_item_id === id ? { ...l, quantity: Math.max(1, qty) } : l));
  };

  const removeLine = (id: string) => {
    setLines(prev => prev.filter(l => l.menu_item_id !== id));
  };

  const canSave = name.trim().length >= 2 && price > 0 && lines.length >= 2;

  // Best-effort category pick: existing combo's category > first branch
  // category > the first picked item's category. The customer Menu groups
  // combos under the 🎁 Combos chip via is_combo, not category, so the
  // actual category_id is incidental.
  const resolveCategoryId = () =>
    categoryId
    || categories[0]?.id
    || (lines[0] ? itemById.get(lines[0].menu_item_id)?.category_id : '')
    || '';

  const submit = async () => {
    if (!canSave) return;
    const finalCategoryId = resolveCategoryId();
    if (!finalCategoryId) { setErr('Add at least one category in Menu Items first.'); return; }
    setSaving(true); setErr(null);
    try {
      if (isEdit && combo) {
        await updateCombo(combo.id, {
          name: name.trim(),
          description: description.trim() || null,
          image_url: imageUrl.trim() || null,
          base_price: price,
          category_id: finalCategoryId,
          in_stock: inStock,
          items: lines,
        });
      } else {
        // Pick food_type from majority of selected items — safe default.
        const counts: Record<string, number> = {};
        lines.forEach(l => {
          const ft = itemById.get(l.menu_item_id)?.food_type ?? 'veg';
          counts[ft] = (counts[ft] ?? 0) + 1;
        });
        const food_type = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'veg') as MenuItemRow['food_type'];

        await createCombo({
          restaurant_id: restaurantId,
          category_id: finalCategoryId,
          name: name.trim(),
          description: description.trim() || null,
          image_url: imageUrl.trim() || null,
          base_price: price,
          food_type,
          in_stock: inStock,
          items: lines,
        });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message ?? 'Could not save combo');
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${combo?.name}` : 'New combo'}
      width="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {lines.length < 2
              ? <span className="text-amber-700">Add at least 2 items.</span>
              : saving_inr > 0
                ? <span>Saves customer <strong className="text-emerald-700">{inr(saving_inr)}</strong> vs buying separately.</span>
                : <span>Combo price = parts price. Lower the combo price to create a deal.</span>
            }
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-full hover:bg-white">Cancel</button>
            <button
              disabled={!canSave || saving}
              onClick={submit}
              className="px-5 py-2 text-sm font-semibold rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create combo')}
            </button>
          </div>
        </div>
      }
    >
      {err && <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{err}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Combo name">
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="Biryani + Chai Combo"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
          />
        </Field>
        <Field label="Combo price">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
            <input
              type="number" min={0} step={1}
              value={price || ''} onChange={e => setPrice(Number(e.target.value || 0))}
              className="w-full rounded-lg border border-slate-200 pl-7 pr-3 py-2 outline-none focus:border-brand-500"
            />
          </div>
        </Field>

        <div className="md:col-span-2">
          <ImageField
            label="Combo image"
            value={imageUrl}
            onChange={setImageUrl}
            restaurantId={restaurantId}
            placeholder="https://… or upload"
          />
        </div>

        <div className="md:col-span-2">
          <Field label="Description (optional)">
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Hearty bowl of chicken dum biryani with a soothing cup of masala chai."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 resize-none"
            />
          </Field>
        </div>

        <div className="md:col-span-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={inStock} onChange={e => setInStock(e.target.checked)} className="size-4 accent-brand-600" />
            Available right now (uncheck to hide on customer menu)
          </label>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600">Items in this combo</h3>
          <button
            onClick={() => setPicker(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            <Plus className="size-4" /> Add item
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            Pick 2-3 menu items to bundle in this combo.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {lines.map(l => {
              const it = itemById.get(l.menu_item_id);
              return (
                <div key={l.menu_item_id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="size-10 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                    {it?.image_url && <img src={it.image_url} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{it?.name ?? <em className="text-rose-500">unknown item</em>}</p>
                    <p className="text-xs text-slate-500">{inr(Number(it?.base_price ?? 0))} each</p>
                  </div>
                  <div className="inline-flex items-center rounded-full border border-slate-200 overflow-hidden">
                    <button onClick={() => setQty(l.menu_item_id, l.quantity - 1)} className="px-2 py-1 text-slate-600 hover:bg-slate-50">−</button>
                    <span className="px-2 text-sm font-bold w-8 text-center">{l.quantity}</span>
                    <button onClick={() => setQty(l.menu_item_id, l.quantity + 1)} className="px-2 py-1 text-slate-600 hover:bg-slate-50">+</button>
                  </div>
                  <button
                    onClick={() => removeLine(l.menu_item_id)}
                    className="size-8 grid place-items-center rounded-full hover:bg-rose-50 text-rose-500"
                    aria-label="Remove"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
            <div className="px-3 py-2 bg-slate-50 flex items-center justify-between text-sm">
              <span className="text-slate-600">If bought separately</span>
              <span className="font-bold">{inr(partsTotal)}</span>
            </div>
          </div>
        )}
      </div>

      <ItemPicker
        open={picker}
        items={allItems.filter(i => !lines.some(l => l.menu_item_id === i.id))}
        onPick={addItem}
        onClose={() => setPicker(false)}
      />
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Item picker — secondary modal layered above the editor.
// ──────────────────────────────────────────────────────────────────────────────

function ItemPicker({
  open, items, onPick, onClose,
}: {
  open: boolean;
  items: MenuItemRow[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(i =>
      i.name.toLowerCase().includes(needle) ||
      (i.category_name ?? '').toLowerCase().includes(needle),
    );
  }, [items, q]);

  return (
    <Modal open={open} onClose={onClose} title="Add an item" width="sm">
      <input
        autoFocus
        value={q} onChange={e => setQ(e.target.value)}
        placeholder="Search menu items…"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
      />
      <div className="mt-3 max-h-[55vh] overflow-y-auto -mx-1">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No items match.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(i => (
              <li key={i.id}>
                <button
                  onClick={() => onPick(i.id)}
                  className={cls(
                    'w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 text-left',
                    !i.in_stock && 'opacity-60',
                  )}
                >
                  <div className="size-10 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                    {i.image_url && <img src={i.image_url} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{i.name}</p>
                    <p className="text-xs text-slate-500 truncate">{i.category_name ?? '—'}</p>
                  </div>
                  <span className="text-sm font-bold text-slate-700">{inr(Number(i.base_price))}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
