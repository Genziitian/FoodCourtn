import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CartLine, OrderType } from '@foodcourt/shared';
import { calculatePrice, cls, inr, mocks } from '@foodcourt/shared';
import { useCoupons, useRestaurant, useTable, placeOrder } from '../lib/data';
import { useCart } from '../lib/cart';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/Icon';
import { BottomNav } from '../components/BottomNav';
import { getBranchPaymentKey, awardOrderCoins } from '../lib/api';
import { openRazorpay } from '../lib/razorpay';

export default function Cart() {
  const { slug, qrToken } = useParams();
  const navigate = useNavigate();
  const { restaurant } = useRestaurant(slug ?? '');
  const { tableId, tableLabel } = useTable(restaurant?.id, qrToken);
  const coupons = useCoupons(restaurant?.id);

  const cart = useCart(s => s.cart);
  const couponDismissed = useCart(s => s.coupon_dismissed);
  const incLine = useCart(s => s.incLine);
  const decLine = useCart(s => s.decLine);
  const removeLine = useCart(s => s.removeLine);
  const setOrderType = useCart(s => s.setOrderType);
  const setCoupon = useCart(s => s.setCoupon);
  const toggleCoins = useCart(s => s.toggleCoins);
  const clear = useCart(s => s.clear);
  const addLine = useCart(s => s.addLine);

  const [submitting, setSubmitting] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const { customerId, user, refreshLoyalty } = useAuth();
  const coinsAvailable = user?.loyalty_balance ?? 0;

  const breakdown = useMemo(() => {
    if (!restaurant) return null;
    return calculatePrice({
      cart,
      settings: restaurant.settings,
      coupons,
      coinsAvailable,
    });
  }, [cart, restaurant, coupons, coinsAvailable]);

  // Auto-apply the best eligible coupon, but only if:
  //   - no coupon is currently applied
  //   - user hasn't explicitly dismissed (clicked Remove)
  // "Best" = largest min_order_value the cart qualifies for.
  useMemo(() => {
    if (!restaurant || cart.coupon_code || couponDismissed) return;
    const subtotal = cart.lines.reduce((s, l) => s + l.line_total, 0);
    const eligible = coupons
      .filter(c => c.is_active && subtotal >= c.min_order_value)
      .sort((a, b) => b.min_order_value - a.min_order_value);
    if (eligible.length) setCoupon(eligible[0].code);
  }, [restaurant, coupons, cart.lines, cart.coupon_code, couponDismissed, setCoupon]);

  const goBack = () => {
    const base = qrToken ? `/${slug}/t/${qrToken}` : `/${slug}`;
    navigate(`${base}/menu`);
  };

  const [placeError, setPlaceError] = useState<string | null>(null);

  // Toggle dine-in ↔ takeaway. Used by both the segmented control and the
  // "Change" link on the context banner below it.
  const toggleOrderType = () => setOrderType(cart.order_type === 'dine_in' ? 'takeaway' : 'dine_in');

  // Header three-dot menu — clear cart with confirmation.
  const handleClearCart = () => {
    setShowMoreMenu(false);
    if (cart.lines.length === 0) return;
    if (window.confirm('Clear your cart? You\'ll need to add items again.')) {
      clear();
    }
  };

  const handlePlaceOrder = async () => {
    if (!restaurant || !breakdown || cart.lines.length === 0) return;
    setSubmitting(true);
    setPlaceError(null);
    try {
      // 1) Place the order — generates the order code we'll use as Razorpay receipt.
      const order = await placeOrder({
        restaurant_id: restaurant.id,
        table_id: tableId,
        table_label: tableLabel,
        customer_id: customerId,
        order_type: cart.order_type,
        cart,
        breakdown,
      });

      // 2) Open Razorpay Checkout whenever this branch has a configured key —
      //    test mode and live mode both. In test mode Razorpay accepts
      //    test card numbers (4111 1111 1111 1111) and shows the same UI,
      //    so the customer experience matches production. The order row is
      //    already inserted with payment_status='success' as a safety net:
      //    if Razorpay is dismissed/cancelled, the customer can still pay at
      //    the counter via the order tracking page.
      const branchKey = await getBranchPaymentKey(restaurant.id);
      const tryRazorpay = branchKey && branchKey.provider === 'razorpay'
        && !!branchKey.key_id;

      if (tryRazorpay) {
        try {
          const result = await openRazorpay({
            keyId: branchKey!.key_id,
            amount: breakdown.total,
            orderCode: order.code,
            customerName: user?.name ?? 'Guest',
            customerPhone: user?.phone ?? '',
            customerEmail: user?.email ?? undefined,
            restaurantName: restaurant.name,
          });
          if (!result.ok) {
            console.info('Razorpay non-success:', result.error, '— order still placed.');
          }
        } catch (e) {
          console.warn('Razorpay flow threw, continuing:', e);
        }
      }

      // 3) Award FoodCoins for this order based on the restaurant's earn rate.
      //    Per-restaurant rate (points per ₹100 spent) lives on `settings.loyalty_earn_rate`.
      //    Falls back to a sensible 5/100 if unset so the system isn't silently free.
      //    Loyalty is fire-and-forget: any failure inside awardOrderCoins is
      //    swallowed so it can never block the customer from reaching tracking.
      const earnRate = Number(restaurant.settings?.loyalty_earn_rate ?? 5);
      try {
        const awarded = await awardOrderCoins({
          restaurant_id: restaurant.id,
          customer_id: customerId,
          order_id: order.id,
          order_total: breakdown.total,
          earn_rate: earnRate,
        });
        if (awarded > 0) {
          await refreshLoyalty();
          console.info(`Awarded ${awarded} FoodCoins at rate ${earnRate}/100`);
        }
      } catch (e) {
        console.warn('Loyalty award failed (non-fatal):', e);
      }

      clear();
      const base = qrToken ? `/${slug}/t/${qrToken}` : `/${slug}`;
      navigate(`${base}/order/${order.code}`);
    } catch (e: any) {
      console.error('Place order failed:', e);
      setPlaceError(e?.message ?? 'Could not place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpsell = (id: string) => {
    const u = mocks.mockUpsells.find(x => x.id === id);
    if (!u) return;
    addLine({
      menu_item_id: u.id,
      item_name: u.name,
      image_url: u.image_url,
      food_type: 'veg',
      variant_id: null,
      variant_name: null,
      modifiers: [],
      spice_level: null,
      qty: 1,
      unit_price: u.price,
    });
  };

  if (!restaurant) return null;

  const empty = cart.lines.length === 0;
  const taxesAndCharges = breakdown ? breakdown.tax + breakdown.service_charge + breakdown.packing_charge : 0;
  const totalSavings = breakdown ? breakdown.discount + breakdown.coins_value : 0;

  return (
    <div className="min-h-screen bg-background pb-44 font-sans">
      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 sticky top-0 z-40 flex justify-between items-center px-container-margin h-16">
        <div className="flex items-center gap-md">
          <button
            onClick={goBack}
            className="size-10 grid place-items-center rounded-full hover:bg-surface-container-high/50 active:scale-95 transition"
          >
            <Icon name="arrow_back" size={22} className="text-primary" />
          </button>
          <div className="flex flex-col">
            <span className="font-display text-headline-md text-on-surface leading-tight">Checkout</span>
            <span className="text-label-sm text-secondary">{restaurant.name}</span>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMoreMenu(v => !v)}
            className="size-10 grid place-items-center rounded-full hover:bg-surface-container-high/50 active:scale-95 transition"
            aria-label="More options"
            aria-expanded={showMoreMenu}
          >
            <Icon name="more_vert" size={22} className="text-on-surface-variant" />
          </button>
          {showMoreMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />
              <div className="absolute right-0 top-12 z-20 w-52 rounded-2xl border border-outline-variant/30 bg-surface shadow-xl overflow-hidden text-sm">
                <button
                  onClick={() => { setShowMoreMenu(false); goBack(); }}
                  className="w-full px-4 py-3 text-left flex items-center gap-2 hover:bg-surface-container-low"
                >
                  <Icon name="add_shopping_cart" size={18} className="text-on-surface-variant" />
                  Add more items
                </button>
                <button
                  onClick={handleClearCart}
                  disabled={cart.lines.length === 0}
                  className="w-full px-4 py-3 text-left flex items-center gap-2 hover:bg-error/5 text-error border-t border-outline-variant/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Icon name="delete_sweep" size={18} />
                  Clear cart
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="max-w-md md:max-w-2xl mx-auto px-container-margin py-6 space-y-8">
        {/* Order type segmented */}
        <section className="space-y-4">
          <div className="bg-surface-container p-1 rounded-2xl flex relative h-12">
            <button
              onClick={() => setOrderType('dine_in')}
              className={cls(
                'flex-1 z-10 font-semibold transition-colors flex items-center justify-center gap-2',
                cart.order_type === 'dine_in' ? 'text-on-surface' : 'text-secondary',
              )}
            >
              <Icon name="restaurant" size={18} />
              Dine-In
            </button>
            <button
              onClick={() => setOrderType('takeaway')}
              className={cls(
                'flex-1 z-10 font-semibold transition-colors flex items-center justify-center gap-2',
                cart.order_type === 'takeaway' ? 'text-on-surface' : 'text-secondary',
              )}
            >
              <Icon name="shopping_bag" size={18} />
              Takeaway
            </button>
            <div
              className={cls(
                'absolute top-1 w-[calc(50%-4px)] h-[calc(100%-8px)] bg-white rounded-xl shadow-soft transition-all',
                cart.order_type === 'dine_in' ? 'left-1' : 'left-[50%]',
              )}
            />
          </div>

          {/* Context banner */}
          <div className="card p-5 flex items-center gap-md">
            <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Icon
                name={cart.order_type === 'dine_in' ? 'location_on' : 'shopping_bag'}
                size={24}
                className="text-primary"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-on-surface">
                {cart.order_type === 'dine_in'
                  ? tableLabel ? `Dining at ${tableLabel}` : 'Dine-in'
                  : 'Takeaway'}
              </p>
              <p className="text-label-sm text-secondary">
                Ready in {restaurant.prep_time_min + 10}–{restaurant.prep_time_max + 10} mins
              </p>
            </div>
            <button
              onClick={toggleOrderType}
              className="text-primary font-semibold text-label-sm px-3 py-1.5 hover:bg-primary/5 rounded-lg transition active:scale-95"
            >
              Change
            </button>
          </div>
        </section>

        {empty ? (
          <EmptyCart onBack={goBack} />
        ) : (
          <>
            {/* Cart items */}
            <section className="space-y-4">
              <div className="flex justify-between items-end px-1">
                <h2 className="section-label">Your Order</h2>
                <span className="text-label-sm text-primary font-bold">
                  {cart.lines.length} ITEM{cart.lines.length > 1 ? 'S' : ''}
                </span>
              </div>
              <div className="space-y-4">
                {cart.lines.map(line => (
                  <CartItemRow
                    key={line.line_id}
                    line={line}
                    onInc={() => incLine(line.line_id)}
                    onDec={() => decLine(line.line_id)}
                    onRemove={() => removeLine(line.line_id)}
                    onEdit={goBack}   // Edit takes them back to the menu to re-customise the item
                  />
                ))}
              </div>
            </section>

            {/* Complete Your Meal */}
            <section className="space-y-md">
              <h2 className="section-label px-1">Complete Your Meal</h2>
              <div className="no-scrollbar flex overflow-x-auto pb-2 gap-4 -mx-container-margin px-container-margin">
                {mocks.mockUpsells.map(u => (
                  <UpsellCard key={u.id} upsell={u} onAdd={() => handleUpsell(u.id)} />
                ))}
              </div>
            </section>

            {/* Offers & rewards */}
            <section className="space-y-4">
              <h2 className="section-label px-1">Offers &amp; Rewards</h2>

              <AppliedCouponCard
                code={breakdown?.applied_coupon?.code ?? null}
                description={breakdown?.applied_coupon?.description ?? null}
                savings={breakdown?.discount ?? 0}
                coupons={coupons}
                subtotal={cart.lines.reduce((s, l) => s + l.line_total, 0)}
                onRemove={() => setCoupon(null)}
                onApply={(code) => setCoupon(code)}
              />

              <CoinsCard
                balance={coinsAvailable}
                used={cart.use_coins}
                onToggle={() => toggleCoins()}
              />
            </section>

            {/* Bill summary */}
            {breakdown && (
              <section className="card p-6 space-y-6">
                <h2 className="font-display text-headline-md text-on-surface">Bill Summary</h2>

                <div className="space-y-4">
                  <Row label="Item Total" value={inr(breakdown.subtotal)} />
                  <Row label="Taxes &amp; Charges" value={inr(taxesAndCharges)} />
                  {totalSavings > 0 && (
                    <div className="bg-primary/5 -mx-6 px-6 py-3 flex justify-between text-primary">
                      <div className="flex items-center gap-2">
                        <Icon name="workspace_premium" size={18} />
                        <span className="font-bold">Total Savings</span>
                      </div>
                      <span className="font-extrabold">-{inr(totalSavings)}</span>
                    </div>
                  )}
                  <div className="pt-6 border-t border-outline-variant/30 flex justify-between items-center">
                    <span className="text-label-bold uppercase tracking-widest text-secondary text-[12px]">Grand Total</span>
                    <span className="font-display text-[28px] font-extrabold text-on-surface">{inr(breakdown.total)}</span>
                  </div>
                </div>

                {totalSavings > 0 && (
                  <div className="bg-success-tint border border-success/30 py-3 px-4 rounded-xl flex items-center justify-center gap-3">
                    <span className="size-6 rounded-full bg-success grid place-items-center shrink-0 text-white">
                      <Icon name="check" size={16} />
                    </span>
                    <span className="font-semibold text-success-text text-label-bold">
                      You saved {inr(totalSavings)} on this order!
                    </span>
                  </div>
                )}
              </section>
            )}

            {/* Payment method */}
            <section className="space-y-4">
              <h2 className="section-label px-1">Payment Method</h2>
              <div className="card p-md flex items-center gap-md">
                <div className="size-12 bg-surface-container-low rounded-xl border border-outline-variant/20 shadow-sm grid place-items-center shrink-0">
                  <Icon name="account_balance_wallet" size={26} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block font-semibold text-on-surface">Razorpay Secure</span>
                  <span className="text-label-sm text-secondary">UPI, Cards, Wallets — pick on the next screen</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-success-text bg-success-tint px-2 py-1 rounded">
                  Default
                </span>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Sticky Pay CTA */}
      {!empty && breakdown && (
        <div className="fixed bottom-[64px] left-0 right-0 z-30 bg-surface/90 backdrop-blur-xl border-t border-outline-variant/30 shadow-topfloat">
          {placeError && (
            <div className="max-w-md md:max-w-2xl mx-auto px-container-margin pt-3">
              <p className="text-sm font-medium text-error bg-error-container/60 rounded-lg px-3 py-2 text-center">
                {placeError}
              </p>
            </div>
          )}
          <div className="max-w-md md:max-w-2xl mx-auto px-container-margin py-4 flex items-center justify-between gap-4">
            <div className="flex flex-col shrink-0">
              <span className="text-[10px] uppercase font-bold tracking-widest text-secondary leading-none mb-1">
                Amount to Pay
              </span>
              <span className="font-display text-headline-lg text-on-surface leading-none">{inr(breakdown.total)}</span>
            </div>
            <button
              onClick={handlePlaceOrder}
              disabled={submitting}
              className={cls(
                'flex-grow bg-primary text-on-primary rounded-2xl h-14 font-display font-bold text-headline-md shadow-cta active:scale-[0.97] transition flex items-center justify-center gap-2',
                submitting && 'opacity-70',
              )}
            >
              {submitting ? 'Processing…' : 'Proceed to Pay'}
              <Icon name="arrow_forward" size={20} />
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// pieces
// ────────────────────────────────────────────────────────────

function CartItemRow({
  line, onInc, onDec, onRemove, onEdit,
}: { line: CartLine; onInc: () => void; onDec: () => void; onRemove: () => void; onEdit: () => void }) {
  // Build sub-description from spice level + modifiers + variant
  const parts: string[] = [];
  if (line.variant_name) parts.push(line.variant_name);
  line.modifiers.forEach(m => parts.push('Extra ' + m.name));
  if (line.spice_level) parts.push(`${line.spice_level} Spicy`);
  const subline = parts.join(', ');

  return (
    <article className="card p-md flex gap-md">
      <div className="w-28 h-28 rounded-2xl overflow-hidden shrink-0 shadow-sm bg-surface-container">
        {line.image_url && (
          <img src={line.image_url} alt={line.item_name} className="w-full h-full object-cover" />
        )}
      </div>
      <div className="flex flex-col flex-grow justify-between py-0.5 min-w-0">
        <div className="space-y-1">
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-display text-[17px] font-bold text-on-surface leading-snug">{line.item_name}</h3>
            <span className="font-semibold text-label-bold text-on-surface shrink-0">{inr(line.line_total)}</span>
          </div>
          {subline && <p className="text-label-sm text-secondary">{subline}</p>}
          {line.notes && <p className="text-[12px] italic text-on-surface-variant/70 line-clamp-1">"{line.notes}"</p>}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={onEdit}
              className="text-[12px] text-primary font-bold hover:underline active:scale-95"
              title="Open menu to customise this item"
            >
              Edit
            </button>
            <button
              onClick={onRemove}
              className="text-[12px] text-error/70 font-bold hover:underline active:scale-95"
            >
              Remove
            </button>
          </div>
        </div>
        <div className="flex items-center justify-end">
          <div className="bg-surface-container-high rounded-pill flex items-center p-1 border border-outline-variant/30">
            <button
              onClick={onDec}
              className="size-7 grid place-items-center rounded-pill hover:bg-surface-container-highest active:scale-90 transition"
              aria-label="Decrease quantity"
            >
              <Icon name="remove" size={18} />
            </button>
            <span className="px-3 font-semibold text-label-bold">{line.qty}</span>
            <button
              onClick={onInc}
              className="size-7 grid place-items-center bg-primary text-on-primary rounded-pill shadow-premium active:scale-90 transition"
              aria-label="Increase quantity"
            >
              <Icon name="add" size={18} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function UpsellCard({
  upsell, onAdd,
}: { upsell: { id: string; name: string; price: number; image_url: string }; onAdd: () => void }) {
  return (
    <div className="shrink-0 w-44 bg-surface-container-lowest rounded-2xl p-3 shadow-soft border border-outline-variant/10">
      <div className="relative mb-3">
        <img src={upsell.image_url} alt={upsell.name} className="w-full h-28 object-cover rounded-xl shadow-sm" />
        <div className="absolute bottom-2 right-2 bg-white/95 backdrop-blur-md px-2 py-1 rounded-lg text-primary font-bold text-[13px] shadow-sm">
          {inr(upsell.price)}
        </div>
      </div>
      <p className="font-semibold text-label-bold text-on-surface truncate mb-3">{upsell.name}</p>
      <button
        onClick={onAdd}
        className="w-full py-2 bg-primary/10 text-primary rounded-pill font-bold text-label-sm border border-primary/20 hover:bg-primary hover:text-on-primary transition active:scale-95 flex items-center justify-center gap-1"
      >
        <Icon name="add" size={16} />
        Add
      </button>
    </div>
  );
}

function AppliedCouponCard({
  code, description, savings, coupons, subtotal, onRemove, onApply,
}: {
  code: string | null;
  description: string | null;
  savings: number;
  coupons: import('@foodcourt/shared').Coupon[];
  subtotal: number;
  onRemove: () => void;
  onApply: (code: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!code) {
    return (
      <>
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full bg-surface-container-lowest rounded-2xl border-2 border-dashed border-primary/30 shadow-soft p-5 flex items-center gap-md hover:bg-primary/5 active:scale-[0.99] transition text-left"
        >
          <div className="size-14 rounded-2xl bg-primary/10 grid place-items-center text-primary shrink-0">
            <Icon name="confirmation_number" size={28} fill />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-on-surface">Apply Coupon</p>
            <p className="text-label-sm text-secondary truncate">
              {coupons.length > 0
                ? `${coupons.length} coupon${coupons.length === 1 ? '' : 's'} available · tap to view`
                : 'Enter a code'}
            </p>
          </div>
          <Icon name="chevron_right" size={22} className="text-outline" />
        </button>
        <CouponPickerSheet
          open={pickerOpen}
          coupons={coupons}
          subtotal={subtotal}
          onClose={() => setPickerOpen(false)}
          onApply={(c) => { onApply(c); setPickerOpen(false); }}
        />
      </>
    );
  }
  return (
    <div className="card p-5 flex items-center justify-between group">
      <div className="flex items-center gap-md min-w-0">
        <div className="size-14 rounded-2xl bg-primary/10 grid place-items-center text-primary shrink-0">
          <Icon name="confirmation_number" size={28} fill />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-on-surface font-mono">{code}</p>
            <span className="bg-success-tint text-success-text text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
              Applied
            </span>
          </div>
          {description && <p className="text-[13px] text-secondary mt-0.5">{description}</p>}
          {savings > 0 && <p className="text-[13px] text-primary font-medium mt-0.5">You saved {inr(savings)}</p>}
        </div>
      </div>
      <button onClick={onRemove} className="text-error text-label-sm font-bold hover:bg-error/5 px-3 py-1.5 rounded-lg transition shrink-0">
        Remove
      </button>
    </div>
  );
}

function CouponPickerSheet({
  open, coupons, subtotal, onClose, onApply,
}: {
  open: boolean;
  coupons: import('@foodcourt/shared').Coupon[];
  subtotal: number;
  onClose: () => void;
  onApply: (code: string) => void;
}) {
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const sorted = [...coupons].filter(c => c.is_active).sort((a, b) => b.min_order_value - a.min_order_value);

  const apply = (code: string) => {
    const c = coupons.find(x => x.code.toUpperCase() === code.toUpperCase());
    if (!c) { setError(`Coupon "${code}" not found.`); return; }
    if (!c.is_active) { setError(`Coupon "${code}" is not active.`); return; }
    if (subtotal < c.min_order_value) {
      setError(`Need ${inr(c.min_order_value)} order to use ${c.code}. Add ${inr(c.min_order_value - subtotal)} more.`);
      return;
    }
    setError(null);
    onApply(c.code);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[85vh] animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
          <div className="w-10 h-1.5 bg-surface-dim/50 rounded-pill" />
        </div>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 size-9 grid place-items-center rounded-full bg-surface-container-low text-on-surface z-10"
          aria-label="Close"
        >
          <Icon name="close" size={20} />
        </button>

        <header className="px-container-margin pt-8 pb-3">
          <h2 className="font-display text-headline-md text-on-surface">Apply coupon</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">Pick from active offers or enter a code below.</p>
        </header>

        <div className="px-container-margin pb-3">
          <form
            onSubmit={(e) => { e.preventDefault(); if (manualCode.trim()) apply(manualCode.trim()); }}
            className="flex items-center gap-2"
          >
            <input
              value={manualCode}
              onChange={e => { setManualCode(e.target.value.toUpperCase()); setError(null); }}
              placeholder="ENTER CODE"
              className="flex-1 rounded-pill border-2 border-outline-variant/40 bg-surface-container-low px-4 py-3 outline-none focus:border-primary font-mono text-on-surface uppercase tracking-wider text-sm"
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="rounded-pill bg-primary text-on-primary font-bold px-5 py-3 text-sm disabled:opacity-50"
            >
              Apply
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-error font-medium">{error}</p>}
        </div>

        <div className="flex-1 overflow-y-auto px-container-margin pb-6 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-center text-on-surface-variant py-8 text-sm">No active coupons right now.</p>
          ) : (
            sorted.map(c => {
              const eligible = subtotal >= c.min_order_value;
              return (
                <div
                  key={c.code}
                  className={cls(
                    'border rounded-2xl p-4 flex items-center gap-3',
                    eligible ? 'border-primary/30 bg-primary/5' : 'border-outline-variant/30 bg-surface-container-low opacity-70',
                  )}
                >
                  <div className={cls(
                    'size-10 rounded-xl grid place-items-center shrink-0',
                    eligible ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant',
                  )}>
                    <Icon name="confirmation_number" size={22} fill={eligible} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-bold text-on-surface">{c.code}</p>
                    {c.description && <p className="text-[13px] text-on-surface-variant truncate">{c.description}</p>}
                    {c.min_order_value > 0 && (
                      <p className={cls(
                        'text-[11px] mt-0.5',
                        eligible ? 'text-primary font-semibold' : 'text-on-surface-variant',
                      )}>
                        {eligible
                          ? `Min ${inr(c.min_order_value)} — eligible`
                          : `Add ${inr(c.min_order_value - subtotal)} more to use`}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => eligible && apply(c.code)}
                    disabled={!eligible}
                    className={cls(
                      'rounded-pill font-bold text-label-sm px-4 py-2 shrink-0',
                      eligible ? 'bg-primary text-on-primary active:scale-95' : 'bg-surface-container-high text-on-surface-variant cursor-not-allowed',
                    )}
                  >
                    Apply
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function CoinsCard({
  balance, used, onToggle,
}: { balance: number; used: boolean; onToggle: () => void }) {
  return (
    <div className="bg-gradient-to-br from-primary-container to-primary rounded-2xl p-5 text-white shadow-xl flex items-center justify-between relative overflow-hidden">
      <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
      <div className="absolute -left-4 -top-4 w-20 h-20 bg-white/5 rounded-full blur-xl" />

      <div className="flex items-center gap-md relative z-10">
        <div className="size-12 bg-white/20 rounded-xl grid place-items-center shadow-lg border border-white/20">
          <Icon name="token" size={26} fill className="text-white" />
        </div>
        <div>
          <h3 className="font-display text-[16px] font-bold text-white">{balance} FoodCoins</h3>
          <p className="text-label-sm text-white/85">
            {balance > 0
              ? `Redeem for up to ${inr(balance)} discount`
              : 'Place an order to start earning'}
          </p>
        </div>
      </div>

      <button
        onClick={onToggle}
        disabled={balance <= 0}
        className={cls(
          'relative inline-flex items-center w-12 h-6 rounded-pill bg-white/30 z-10 shrink-0',
          balance <= 0 && 'opacity-50 cursor-not-allowed',
        )}
        aria-label="Toggle coins"
      >
        <span
          className={cls(
            'absolute top-[2px] left-[2px] size-5 rounded-full shadow-md transition-all',
            used ? 'translate-x-6 bg-white' : 'translate-x-0 bg-primary-container',
          )}
        />
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-secondary">
      <span className="font-medium" dangerouslySetInnerHTML={{ __html: label }} />
      <span className="text-on-surface font-semibold">{value}</span>
    </div>
  );
}

function EmptyCart({ onBack }: { onBack: () => void }) {
  return (
    <div className="card p-10 text-center">
      <Icon name="shopping_cart" size={48} className="mx-auto text-on-surface-variant/40" />
      <p className="mt-4 text-on-surface-variant">Your cart is empty.</p>
      <button onClick={onBack} className="mt-5 btn-primary mx-auto">
        Browse Menu
      </button>
    </div>
  );
}

// to satisfy unused-import linter on OrderType (used via store)
export type _OT = OrderType;
