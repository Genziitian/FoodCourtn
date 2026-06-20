import { useEffect, useState } from 'react';
import type { CartModifier, MenuItem, MenuVariant } from '@foodcourt/shared';
import { cls, inr } from '@foodcourt/shared';
import { useCart } from '../lib/cart';
import { VegMark } from './VegMark';
import { Icon } from './Icon';
import { UpsellPopup } from './UpsellPopup';

interface Props {
  item: MenuItem | null;
  onClose: () => void;
}

export function ItemDetailModal({ item, onClose }: Props) {
  const addLine = useCart(s => s.addLine);

  const [variantId, setVariantId] = useState<string | null>(null);
  const [mods, setMods] = useState<Record<string, boolean>>({});
  const [spice, setSpice] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [qty, setQty] = useState(1);
  const [upsell, setUpsell] = useState<{ id: string; name: string } | null>(null);

  // Reset when a new item is opened
  useEffect(() => {
    if (!item) return;
    const def = item.variants?.find(v => v.is_default) ?? item.variants?.[0] ?? null;
    setVariantId(def?.id ?? null);
    setMods({});
    setSpice(item.default_spice_level);
    setNotes('');
    setQty(1);
  }, [item?.id]);

  // ESC to close
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  const variant: MenuVariant | undefined = item.variants?.find(v => v.id === variantId);
  const basePrice = variant?.price ?? item.base_price;
  const modAdds = (item.modifiers ?? []).filter(m => mods[m.id]);
  const unitPrice = basePrice + modAdds.reduce((s, m) => s + m.price_delta, 0);
  const lineTotal = unitPrice * qty;
  const hasDiscount = item.mrp && item.mrp > item.base_price;
  const discountPct = hasDiscount ? Math.round(((item.mrp! - item.base_price) / item.mrp!) * 100) : 0;

  const handleAdd = () => {
    const modifierPayload: CartModifier[] = modAdds.map(m => ({
      id: m.id, name: m.name, price_delta: m.price_delta,
    }));
    addLine({
      menu_item_id: item.id,
      item_name: item.name,
      image_url: item.image_url,
      food_type: item.food_type,
      variant_id: variant?.id ?? null,
      variant_name: variant?.name ?? null,
      modifiers: modifierPayload,
      spice_level: spice,
      qty,
      unit_price: unitPrice,
      parcel_charge_per_unit:   Number(item.parcel_charge   ?? 0),
      delivery_charge_per_unit: Number(item.delivery_charge ?? 0),
      notes: notes.trim() || undefined,
    });
    // Open the upsell pop right after the add. If no suggestions exist it
    // auto-closes itself and we fall through to onClose.
    setUpsell({ id: item.id, name: item.name });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/45 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md bg-surface-container-lowest sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="absolute top-2 left-0 right-0 flex justify-center z-30 pointer-events-none">
          <div className="w-10 h-1.5 bg-surface-dim/50 rounded-pill" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-40 size-10 grid place-items-center rounded-full bg-white/60 backdrop-blur-xl shadow-md text-on-surface transition active:scale-90"
        >
          <Icon name="close" size={22} />
        </button>

        {/* Scrollable content — min-h-0 is critical so flex-1 with overflow actually shrinks */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
          {/* Hero image with cinematic fade */}
          <div className="relative w-full h-[300px] bg-surface-container">
            {item.image_url && (
              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/80 to-transparent" />
          </div>

          <div className="px-container-margin -mt-6 relative z-10">
            {/* Badges row */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <Badge icon={<VegMark type={item.food_type} size={10} />}>
                {item.food_type === 'veg' ? 'Veg' : 'Non-Veg'}
              </Badge>
              {item.is_bestseller && (
                <span className="inline-flex items-center px-3 py-1 rounded-pill bg-primary/10 text-label-sm font-bold text-primary">
                  Bestseller
                </span>
              )}
              {item.is_chef_special && !item.is_bestseller && (
                <span className="inline-flex items-center px-3 py-1 rounded-pill bg-tertiary/10 text-label-sm font-bold text-tertiary">
                  Chef's Special
                </span>
              )}
              <Badge>
                <Icon name="schedule" size={14} />
                {item.prep_time_min} mins
              </Badge>
            </div>

            {/* Title + rating */}
            <div className="flex justify-between items-start gap-4 mb-3">
              <h1 className="font-display text-headline-lg text-on-surface">{item.name}</h1>
              <div className="flex items-center gap-1 bg-surface-container-low px-2.5 py-1.5 rounded-lg shrink-0">
                <Icon name="star" size={16} fill className="text-primary" />
                <span className="font-semibold text-label-bold text-on-surface">{item.rating.toFixed(1)}</span>
                <span className="text-label-sm text-on-surface-variant">({formatK(item.rating_count)})</span>
              </div>
            </div>

            {/* Price row */}
            <div className="flex items-center gap-2 mb-3">
              <span className="font-display text-headline-md text-on-surface">{inr(item.base_price)}</span>
              {hasDiscount && (
                <>
                  <span className="text-body-md text-on-surface-variant line-through opacity-60">{inr(item.mrp!)}</span>
                  <span className="text-success-text bg-success-tint px-2 py-0.5 rounded font-bold text-label-sm">
                    {discountPct}% OFF
                  </span>
                </>
              )}
            </div>

            {/* Description */}
            {item.description && (
              <p className="text-body-md text-on-surface-variant leading-relaxed opacity-80">
                {item.description}
              </p>
            )}

            <div className="h-px bg-surface-variant/40 my-6" />

            {/* Portion size */}
            {item.variants && item.variants.length > 0 && (
              <section className="mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display text-headline-md text-on-surface">Portion Size</h3>
                  <span className="text-label-sm font-bold uppercase tracking-wider text-primary">Required</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {item.variants.map(v => {
                    const selected = variantId === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setVariantId(v.id)}
                        className={cls(
                          'relative flex flex-col items-center justify-center py-4 px-2 rounded-xl border-2 transition',
                          selected
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-outline-variant bg-white hover:bg-surface-container-low',
                        )}
                      >
                        <span className={cls(
                          'font-semibold text-label-bold',
                          selected ? 'text-primary' : 'text-on-surface-variant',
                        )}>
                          {v.name}
                        </span>
                        <span className={cls(
                          'text-[12px] font-medium mt-0.5',
                          selected ? 'text-primary/70' : 'text-on-surface-variant/70',
                        )}>
                          {inr(v.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Spice level */}
            {item.spice_levels.length > 0 && (
              <section className="mb-8">
                <h3 className="font-display text-headline-md text-on-surface mb-4">Spice Level</h3>
                <div className="flex gap-3">
                  {item.spice_levels.map(level => {
                    const selected = spice === level;
                    return (
                      <button
                        key={level}
                        onClick={() => setSpice(level)}
                        className={cls(
                          'flex-1 py-3 rounded-xl font-semibold text-label-bold transition flex items-center justify-center gap-1.5',
                          selected
                            ? 'bg-primary text-on-primary shadow-md'
                            : 'border border-outline-variant bg-white text-on-surface-variant hover:border-primary/50',
                        )}
                      >
                        {level}
                        {level === 'Spicy' && (
                          <Icon name="local_fire_department" size={16} fill className={selected ? 'text-on-primary' : 'text-primary'} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Extra toppings */}
            {item.modifiers && item.modifiers.length > 0 && (
              <section className="mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display text-headline-md text-on-surface">Extra Toppings</h3>
                  <span className="text-label-sm text-on-surface-variant">Optional</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {item.modifiers.map(m => {
                    const checked = !!mods[m.id];
                    return (
                      <label
                        key={m.id}
                        className={cls(
                          'flex items-center justify-between p-3.5 rounded-xl border bg-white cursor-pointer transition active:scale-[0.98]',
                          checked ? 'border-primary/40 bg-primary/5' : 'border-outline-variant hover:border-primary/30',
                        )}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-on-surface truncate">{m.name}</span>
                          <span className="text-[12px] text-primary font-medium">+{inr(m.price_delta)}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => setMods(p => ({ ...p, [m.id]: e.target.checked }))}
                          className="w-5 h-5 rounded border-outline accent-primary focus:ring-primary"
                        />
                      </label>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Cooking instructions */}
            <section className="mb-10">
              <h3 className="font-display text-headline-md text-on-surface mb-4">Cooking Instructions</h3>
              <div className="relative">
                <Icon name="notes" size={20} className="absolute left-4 top-4 text-on-surface-variant" />
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Less spicy, no onion, extra gravy..."
                  className="w-full pl-11 pr-4 py-3.5 bg-surface-container-low border-none rounded-2xl text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary/20 resize-none transition-all"
                />
              </div>
            </section>
          </div>
        </div>

        {/* Sticky footer: qty stepper + Add to Cart.
            Flex-shrink-0 so it always takes its natural height; the scroll
            area above shrinks instead of being overlapped. */}
        <div className="flex-shrink-0 bg-white/95 backdrop-blur-xl px-container-margin pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-topfloat border-t border-surface-variant/30">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Qty stepper — compact on narrow screens */}
            <div className="flex items-center bg-surface-container-low h-12 px-1 shrink-0 border border-surface-variant rounded-xl">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="size-10 grid place-items-center rounded-pill text-on-surface active:bg-surface-dim transition"
                aria-label="Decrease quantity"
              >
                <Icon name="remove" size={18} weight={500} />
              </button>
              <span className="font-display text-body-lg font-bold text-on-surface px-2 min-w-[28px] text-center tabular-nums">{qty}</span>
              <button
                onClick={() => setQty(q => q + 1)}
                className="size-10 grid place-items-center rounded-pill text-on-surface active:bg-surface-dim transition"
                aria-label="Increase quantity"
              >
                <Icon name="add" size={18} weight={500} />
              </button>
            </div>

            {/* Add to Cart — flex-1, label and price won't crowd */}
            <button
              onClick={handleAdd}
              className="flex-1 min-w-0 h-12 bg-primary text-on-primary flex items-center justify-between gap-2 px-4 sm:px-5 shadow-cta active:scale-[0.97] transition rounded-xl"
            >
              <span className="font-bold text-body-lg truncate">Add item</span>
              <span className="font-display text-body-lg font-bold tabular-nums shrink-0">{inr(lineTotal)}</span>
            </button>
          </div>
        </div>
      </div>

      {upsell && (
        <UpsellPopup
          restaurantId={item.restaurant_id}
          triggerItemId={upsell.id}
          triggerName={upsell.name}
          onClose={() => { setUpsell(null); onClose(); }}
        />
      )}
    </div>
  );
}

function Badge({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-surface-container-low text-label-sm font-medium text-on-surface-variant">
      {icon}
      {children}
    </span>
  );
}

function formatK(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
