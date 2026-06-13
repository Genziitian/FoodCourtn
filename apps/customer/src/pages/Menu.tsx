import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { MenuItem } from '@foodcourt/shared';
import { cls, inr } from '@foodcourt/shared';
import { useCoupons, useMenu, useRestaurant, useTable } from '../lib/data';
import { useCart } from '../lib/cart';
import { MenuItemCard, RecommendedTile } from '../components/MenuItemCard';
import { ItemDetailModal } from '../components/ItemDetailModal';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { HeroSlider } from '../components/HeroSlider';
import { ProfileBadge } from '../components/ProfileBadge';

const MENU_HERO_FALLBACKS = [
  'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=1600',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600',
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1600',
];

type Filter = 'all' | 'veg' | 'non_veg';

export default function Menu() {
  const { slug, qrToken } = useParams();
  const navigate = useNavigate();
  const { restaurant } = useRestaurant(slug ?? '');
  const { tableLabel } = useTable(restaurant?.id, qrToken);
  const { categories, items, loading } = useMenu(restaurant?.id);
  void useCoupons(restaurant?.id); // prefetch so cart screen is instant

  const cart = useCart(s => s.cart);
  const incLine = useCart(s => s.incLine);
  const decLine = useCart(s => s.decLine);
  const cartCount = cart.lines.reduce((n, l) => n + l.qty, 0);
  const cartTotal = cart.lines.reduce((s, l) => s + l.line_total, 0);

  const [filter, setFilter] = useState<Filter>('all');
  const [activeCat, setActiveCat] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);

  // Make the item-detail modal participate in browser history.
  // Without this, pressing the device/browser back button while the modal
  // is open leaves the Menu page entirely (lands you on the Landing /
  // "Start Ordering" screen). With this, back simply closes the modal.
  useEffect(() => {
    if (!openItem) return;
    // Push a placeholder history entry the moment the modal opens.
    window.history.pushState({ itemModal: true }, '');
    const onPop = () => setOpenItem(null);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // If we close the modal programmatically (close button / overlay tap),
      // pop the placeholder so the URL stays clean and a real back doesn't
      // accidentally go back twice.
      if (window.history.state?.itemModal) window.history.back();
    };
  }, [openItem]);

  // Combos are surfaced as a pseudo-category alongside the real ones.
  // The chip is only shown when the menu actually has combo items.
  const combos = useMemo(() => items.filter(i => i.is_combo === true), [items]);
  const hasCombos = combos.length > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(i => {
      if (filter === 'veg'     && i.food_type !== 'veg')     return false;
      if (filter === 'non_veg' && i.food_type !== 'non_veg') return false;
      if (activeCat === 'combos') {
        if (i.is_combo !== true) return false;
      } else if (activeCat !== 'all' && i.category_id !== activeCat) return false;
      if (q) {
        const cat = categories.find(c => c.id === i.category_id)?.name.toLowerCase() ?? '';
        if (!i.name.toLowerCase().includes(q) && !cat.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, activeCat, query, categories]);

  const recommended = useMemo(
    () => items.filter(i => i.is_recommended || i.is_chef_special).slice(0, 8),
    [items],
  );

  // Hero strip resolution order — owner can override per surface:
  //   1. menu_hero_images[]  (Menu-specific, set in Admin → Settings → Branding)
  //   2. hero_images[]       (Landing's images, used as fallback for back-compat)
  //   3. hero_image           (legacy single image)
  //   4. built-in food photos
  const menuHeroImages = useMemo(() => {
    if (!restaurant) return MENU_HERO_FALLBACKS;
    const fromMenu = (restaurant.menu_hero_images ?? []).filter(Boolean);
    if (fromMenu.length) return fromMenu.slice(0, 5);
    const fromLanding = (restaurant.hero_images ?? []).filter(Boolean);
    if (fromLanding.length) return fromLanding.slice(0, 5);
    if (restaurant.hero_image) return [restaurant.hero_image];
    return MENU_HERO_FALLBACKS;
  }, [restaurant]);

  const goCart = () => {
    const base = qrToken ? `/${slug}/t/${qrToken}` : `/${slug}`;
    navigate(`${base}/cart`);
  };

  // qty-in-cart count per menu item (sum across lines so steppers reflect total)
  const cartByItem = useMemo(() => {
    const m = new Map<string, { qty: number; firstLineId: string }>();
    cart.lines.forEach(l => {
      const cur = m.get(l.menu_item_id);
      if (cur) cur.qty += l.qty;
      else m.set(l.menu_item_id, { qty: l.qty, firstLineId: l.line_id });
    });
    return m;
  }, [cart.lines]);

  const handleRowInc = (item: MenuItem) => {
    // If item has variants/modifiers, re-open the modal so a new line is configurable.
    if (item.variants?.length || item.modifiers?.length) {
      setOpenItem(item);
      return;
    }
    const lineId = cartByItem.get(item.id)?.firstLineId;
    if (lineId) incLine(lineId);
  };
  const handleRowDec = (item: MenuItem) => {
    const lineId = cartByItem.get(item.id)?.firstLineId;
    if (lineId) decLine(lineId);
  };

  if (loading || !restaurant) {
    return (
      <div className="min-h-screen grid place-items-center text-on-surface-variant">
        <div className="size-8 rounded-full border-2 border-surface-container-high border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-32 font-sans">
      {/* Sticky top bar — back on the left, profile on the right (info icon removed per spec) */}
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 h-16 px-container-margin flex items-center justify-between">
        <button
          onClick={() => navigate(qrToken ? `/${slug}/t/${qrToken}` : `/${slug}`)}
          className="size-10 grid place-items-center rounded-full hover:bg-surface-container-high/50 active:scale-95 transition"
          aria-label="Back to landing"
        >
          <Icon name="arrow_back" size={22} className="text-primary" />
        </button>
        <h1 className="font-display text-headline-lg text-primary truncate">{restaurant.name}</h1>
        <ProfileBadge />
      </header>

      <main className="max-w-md mx-auto">
        {/* Hero strip — auto-rotating image carousel */}
        <HeroSlider
          images={menuHeroImages}
          className="mx-container-margin mt-4 rounded-2xl shadow-soft"
          style={{ height: '220px' }}
        >
          <div className="absolute bottom-0 left-0 right-0 p-5 text-on-primary z-30">
            <div className="flex justify-between items-end gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-[28px] leading-tight font-extrabold">{restaurant.name}</h2>
                <p className="text-label-sm text-on-primary/90 mt-1">
                  {restaurant.cuisines.join(', ')} · ₹800 for two
                </p>
                <div className="flex items-center gap-2 mt-2 text-label-sm">
                  <span className="bg-white/20 text-on-primary px-2 py-1 rounded backdrop-blur-md flex items-center gap-1">
                    <Icon name="star" size={14} fill className="text-yellow-400" />
                    {restaurant.rating.toFixed(1)}
                  </span>
                  <span className="bg-white/20 text-on-primary px-2 py-1 rounded backdrop-blur-md flex items-center gap-1">
                    <Icon name="schedule" size={14} />
                    {restaurant.prep_time_min}-{restaurant.prep_time_max} mins
                  </span>
                </div>
              </div>
              {tableLabel && (
                <div className="flex flex-col items-end text-right">
                  <span className="text-[10px] text-on-primary/70 uppercase tracking-wider mb-1">Dining At</span>
                  <span className="bg-primary text-on-primary px-3 py-1.5 rounded-lg font-semibold text-label-bold shadow">
                    {tableLabel}
                  </span>
                </div>
              )}
            </div>
          </div>
        </HeroSlider>

        {/* Search + filters + categories — sticky band below header */}
        <div className="sticky top-16 z-40 bg-surface/95 backdrop-blur-xl pt-5 pb-3 mt-4 shadow-[0_8px_24px_rgba(0,0,0,0.03)] border-b border-outline-variant/20">
          <div className="px-container-margin">
            <div className="flex items-center bg-surface-container-lowest rounded-2xl px-4 py-3.5 mb-4 shadow-sm border border-outline-variant/30 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15 transition-all">
              <Icon name="search" size={20} className="text-on-surface-variant mr-3" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search for dishes, categories..."
                className="bg-transparent border-none outline-none w-full text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:ring-0 p-0"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-on-surface-variant">
                  <Icon name="close" size={18} />
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <FilterChip label="Veg"     color="veg"    active={filter === 'veg'}     onClick={() => setFilter(f => f === 'veg' ? 'all' : 'veg')} />
              <FilterChip label="Non-Veg" color="nonveg" active={filter === 'non_veg'} onClick={() => setFilter(f => f === 'non_veg' ? 'all' : 'non_veg')} />
            </div>
          </div>

          <div className="no-scrollbar overflow-x-auto px-container-margin gap-3 py-3 flex">
            <CatPill active={activeCat === 'all'} onClick={() => setActiveCat('all')}>All</CatPill>
            {hasCombos && (
              <CatPill active={activeCat === 'combos'} onClick={() => setActiveCat('combos')}>
                🎁 Combos
              </CatPill>
            )}
            {categories.map(c => (
              <CatPill key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>
                {c.name}
              </CatPill>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-container-margin pt-6 space-y-8">
          {/* Recommended carousel */}
          {activeCat === 'all' && !query && recommended.length > 0 && (
            <section>
              <h2 className="font-display text-headline-md text-on-surface mb-4">Recommended</h2>
              <div className="no-scrollbar overflow-x-auto -mx-container-margin px-container-margin flex gap-4">
                {recommended.map(i => (
                  <RecommendedTile
                    key={i.id}
                    item={i}
                    badge={i.is_bestseller ? 'Bestseller' : i.is_chef_special ? "Chef's Special" : undefined}
                    onClick={() => setOpenItem(i)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Category sections */}
          {categories
            .filter(c => activeCat === 'all' || c.id === activeCat)
            .map(c => {
              const inCat = filtered.filter(i => i.category_id === c.id);
              if (inCat.length === 0) return null;
              return (
                <section key={c.id}>
                  <div className="flex justify-between items-center mb-5">
                    <h2 className="font-display text-headline-md text-on-surface">{c.name}</h2>
                    <span className="text-label-sm text-on-surface-variant/80">{inCat.length} items</span>
                  </div>
                  <div className="space-y-7">
                    {inCat.map(i => {
                      const qty = cartByItem.get(i.id)?.qty ?? 0;
                      return (
                        <MenuItemCard
                          key={i.id}
                          item={i}
                          qtyInCart={qty}
                          onAdd={item => setOpenItem(item)}
                          onInc={handleRowInc}
                          onDec={handleRowDec}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}

          {filtered.length === 0 && (
            <p className="text-center text-on-surface-variant py-12">No items match your filter.</p>
          )}
        </div>
      </main>

      {/* Sticky cart bar */}
      {cartCount > 0 && (
        <div className="fixed bottom-[84px] left-0 right-0 z-30 px-container-margin pointer-events-none flex justify-center">
          <button
            onClick={goCart}
            className="w-full max-w-sm bg-primary text-on-primary rounded-2xl px-5 py-3.5 flex justify-between items-center shadow-cta pointer-events-auto active:scale-[0.98] transition"
          >
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-wider text-on-primary/90">
                {cartCount} item{cartCount > 1 ? 's' : ''} selected
              </p>
              <p className="font-display text-headline-md">{inr(cartTotal)}</p>
            </div>
            <span className="inline-flex items-center gap-2 font-bold text-label-bold">
              View Cart
              <Icon name="arrow_forward" size={20} />
            </span>
          </button>
        </div>
      )}

      <ItemDetailModal item={openItem} onClose={() => setOpenItem(null)} />
      <BottomNav />
    </div>
  );
}

function FilterChip({
  label, color, active, onClick,
}: { label: string; color: 'veg' | 'nonveg'; active: boolean; onClick: () => void }) {
  const isVeg = color === 'veg';
  return (
    <button
      onClick={onClick}
      className={cls(
        'flex items-center gap-2 border bg-surface-container-lowest rounded-pill px-4 py-2 font-semibold text-label-bold shadow-sm transition-colors',
        active
          ? isVeg
            ? 'border-veg text-veg bg-veg/5'
            : 'border-nonveg text-nonveg bg-nonveg/5'
          : 'border-outline-variant/50 text-on-surface-variant hover:bg-surface-container-low',
      )}
    >
      <span
        className={cls(
          'w-4 h-4 border flex items-center justify-center rounded-sm bg-white',
          isVeg ? 'border-veg' : 'border-nonveg',
        )}
      >
        <span className={cls('w-2 h-2 rounded-full', isVeg ? 'bg-veg' : 'bg-nonveg')} />
      </span>
      {label}
    </button>
  );
}

function CatPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cls(
        'whitespace-nowrap px-6 py-2.5 rounded-pill font-semibold text-label-bold transition shrink-0',
        active
          ? 'bg-primary text-on-primary shadow-md'
          : 'bg-surface-container-lowest border border-outline-variant/30 text-on-surface hover:bg-surface-container-low shadow-sm',
      )}
    >
      {children}
    </button>
  );
}
