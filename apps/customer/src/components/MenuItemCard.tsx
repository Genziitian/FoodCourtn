import type { MenuItem } from '@foodcourt/shared';
import { inr } from '@foodcourt/shared';
import { VegMark } from './VegMark';
import { Icon } from './Icon';

interface Props {
  item: MenuItem;
  qtyInCart?: number;
  onAdd: (item: MenuItem) => void;
  onInc?: (item: MenuItem) => void;
  onDec?: (item: MenuItem) => void;
}

/**
 * Horizontal row card used in category sections.
 * Image on the right with floating Add button / qty stepper.
 */
export function MenuItemCard({ item, qtyInCart = 0, onAdd, onInc, onDec }: Props) {
  const hasDiscount = item.mrp && item.mrp > item.base_price;
  const inCart = qtyInCart > 0;

  return (
    <article className="flex gap-md p-md bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/30 relative">
      {/* Left: details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <VegMark type={item.food_type} size={16} />
          {item.is_bestseller && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10">
              Bestseller
            </span>
          )}
          {item.is_chef_special && !item.is_bestseller && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-on-tertiary bg-tertiary/90">
              Chef's Special
            </span>
          )}
        </div>

        <h3 className="font-sans font-semibold text-on-surface text-[16px] leading-tight">
          {item.name}
        </h3>

        <div className="flex items-baseline gap-2 mt-1.5">
          <span className="font-semibold text-on-surface text-label-bold">{inr(item.base_price)}</span>
          {hasDiscount && (
            <span className="text-on-surface-variant/60 line-through text-label-sm">{inr(item.mrp!)}</span>
          )}
        </div>

        {item.description && (
          <p className="mt-2 text-[13px] text-on-surface-variant/80 leading-snug line-clamp-2">
            {item.description}
          </p>
        )}

        <div className="mt-2 flex items-center gap-1 text-label-sm text-on-surface-variant/80">
          <Icon name="star" size={14} fill className="text-yellow-500" />
          <span>{item.rating.toFixed(1)} ({item.rating_count}+)</span>
        </div>
      </div>

      {/* Right: image + floating CTA */}
      <div className="relative w-32 h-32 shrink-0">
        {item.image_url && (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover rounded-xl"
            loading="lazy"
          />
        )}

        {/* Floating CTA — overlaps bottom edge */}
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-[104px]">
          {inCart && onInc && onDec ? (
            <div className="flex items-center justify-between bg-primary-fixed/95 backdrop-blur-md rounded-xl shadow-md text-primary px-1 py-1 border border-primary/15">
              <button
                onClick={() => onDec(item)}
                className="size-8 grid place-items-center rounded-lg active:scale-90 transition"
                aria-label="Decrease quantity"
              >
                <Icon name="remove" size={18} weight={500} />
              </button>
              <span className="font-semibold text-label-bold">{qtyInCart}</span>
              <button
                onClick={() => onInc(item)}
                className="size-8 grid place-items-center rounded-lg active:scale-90 transition"
                aria-label="Increase quantity"
              >
                <Icon name="add" size={18} weight={500} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onAdd(item)}
              className="w-full bg-primary-fixed/95 backdrop-blur-md rounded-xl shadow-md border border-primary/15 text-primary font-bold text-[13px] py-2.5 hover:bg-primary-fixed transition active:scale-95 uppercase tracking-wide"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Compact tile for the recommended carousel — image-on-top with badge. */
export function RecommendedTile({
  item, badge, onClick,
}: { item: MenuItem; badge?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="min-w-[200px] max-w-[200px] rounded-2xl overflow-hidden relative shadow-soft border border-outline-variant/30 bg-surface-container-lowest text-left"
    >
      <div className="relative">
        {item.image_url && (
          <img src={item.image_url} alt={item.name} className="w-full h-32 object-cover" loading="lazy" />
        )}
        {badge && (
          <span className="absolute top-3 left-3 bg-primary/95 text-on-primary px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm">
            {badge}
          </span>
        )}
      </div>
      <div className="p-3 space-y-1">
        <p className="font-semibold text-[15px] truncate text-on-surface">{item.name}</p>
        <p className="text-label-sm text-on-surface-variant/70">
          {inr(item.base_price)} · {item.food_type === 'veg' ? '1 Person' : 'Premium'}
        </p>
      </div>
    </button>
  );
}
