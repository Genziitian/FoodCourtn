import { useEffect, useState } from 'react';
import { inr, cls } from '@foodcourt/shared';
import { useCart } from '../lib/cart';
import { getUpsellsForItem, type UpsellSuggestion } from '../lib/api';
import { Icon } from './Icon';

/**
 * Pops up right after a customer adds a trigger item to their cart. Shows
 * curated add-ons (admin-defined) plus co-occurrence suggestions (items
 * frequently ordered together in the past 30 days). Empty → renders nothing
 * and auto-closes.
 *
 * The popup is fire-and-forget: parents just mount it after they've already
 * added the trigger item. If no suggestions come back, the parent's
 * onClose() runs immediately.
 */
export function UpsellPopup({
  restaurantId, triggerItemId, triggerName, onClose,
}: {
  restaurantId: string;
  triggerItemId: string;
  triggerName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<UpsellSuggestion[]>([]);
  const addLine = useCart(s => s.addLine);

  useEffect(() => {
    let cancelled = false;
    getUpsellsForItem(restaurantId, triggerItemId, 3)
      .then(rows => {
        if (cancelled) return;
        if (!rows.length) { onClose(); return; }
        setSuggestions(rows);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) onClose(); });
    return () => { cancelled = true; };
    // We intentionally do NOT depend on onClose — it would re-run on every
    // parent re-render and re-fetch suggestions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, triggerItemId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addSuggestion = (s: UpsellSuggestion) => {
    addLine({
      menu_item_id: s.menu_item_id,
      item_name: s.name,
      image_url: s.image_url,
      food_type: 'veg', // upsell items default to veg label; the menu list already shows accurate marks
      variant_id: null,
      variant_name: null,
      modifiers: [],
      spice_level: null,
      qty: 1,
      unit_price: s.base_price,
      parcel_charge_per_unit: 0,
      delivery_charge_per_unit: 0,
    });
    // Don't close immediately — let the customer add multiple add-ons. The
    // suggestion is greyed out in place.
    setSuggestions(prev => prev.map(p => p.menu_item_id === s.menu_item_id ? { ...p, _added: true } as any : p));
  };

  if (loading) return null;
  if (!suggestions.length) return null;

  const curated = suggestions.find(s => s.source === 'curated');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/45 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md bg-white sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <header className="px-5 pt-5 pb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Added · {triggerName}</p>
          <h2 className="text-xl font-extrabold mt-1">
            {curated?.prompt_text || 'Customers also added'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Tap to add — you can still review everything in the cart.
          </p>
        </header>

        <div className="px-5 pb-4 space-y-2 max-h-[55vh] overflow-y-auto">
          {suggestions.map((s) => {
            const added = (s as any)._added === true;
            return (
              <button
                key={s.menu_item_id}
                onClick={() => !added && addSuggestion(s)}
                disabled={added}
                className={cls(
                  'w-full flex items-center gap-3 rounded-2xl border p-2.5 transition text-left',
                  added
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-slate-200 hover:border-brand-500 hover:bg-brand-50/40',
                )}
              >
                <div className="size-14 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                  {s.image_url
                    ? <img src={s.image_url} alt="" className="size-full object-cover" />
                    : <div className="size-full grid place-items-center text-slate-400"><Icon name="utensils" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{s.name}</p>
                  <p className="text-xs text-slate-500">
                    {s.source === 'curated' ? "Chef's add-on" : 'Frequently ordered together'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-extrabold text-sm">+{inr(s.base_price)}</p>
                  <p className={cls('text-[11px] font-bold uppercase tracking-wider mt-0.5', added ? 'text-emerald-700' : 'text-brand-700')}>
                    {added ? 'Added' : 'Add'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <footer className="px-5 pb-5 pt-1">
          <button
            onClick={onClose}
            className="w-full rounded-full bg-brand-600 text-white py-3 font-bold hover:bg-brand-700"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
