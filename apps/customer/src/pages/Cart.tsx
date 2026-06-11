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
import { distanceKm, useGeolocation } from '../lib/geo';

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

  // ── Delivery: GPS + radius check ─────────────────────────────────────
  // The restaurant opts into delivery from Admin → Settings → Delivery.
  // The settings carry the restaurant's lat/lng and the allowed radius
  // (km). When the customer flips the cart to Delivery, we ask for their
  // location and compute the distance. Within radius → allow checkout;
  // outside → block and show a friendly message.
  const deliveryEnabled = restaurant?.settings?.delivery_enabled === true;
  const deliveryLat = Number(restaurant?.settings?.delivery_lat ?? NaN);
  const deliveryLng = Number(restaurant?.settings?.delivery_lng ?? NaN);
  const restaurantHasLocation = Number.isFinite(deliveryLat) && Number.isFinite(deliveryLng);
  const deliveryRadiusKm = Number(restaurant?.settings?.delivery_radius_km ?? 5);
  const geo = useGeolocation();

  const distanceFromRestaurant = useMemo(() => {
    if (geo.state.status !== 'ready' || !restaurantHasLocation) return null;
    return distanceKm(
      { lat: geo.state.coords.lat, lng: geo.state.coords.lng },
      { lat: deliveryLat, lng: deliveryLng },
    );
  }, [geo.state, deliveryLat, deliveryLng, restaurantHasLocation]);

  const withinRadius = distanceFromRestaurant !== null && distanceFromRestaurant <= deliveryRadiusKm;
  const deliveryBlocked =
    cart.order_type === 'delivery' &&
    (!restaurantHasLocation || geo.state.status !== 'ready' || !withinRadius);

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

  // Cycle through enabled order types on the "Change" link of the context
  // banner. Always Dine-In ↔ Takeaway; Delivery is only in the cycle when
  // the restaurant has it enabled.
  const toggleOrderType = () => {
    const order: OrderType[] = deliveryEnabled
      ? ['dine_in', 'takeaway', 'delivery']
      : ['dine_in', 'takeaway'];
    const i = order.indexOf(cart.order_type as OrderType);
    setOrderType(order[(i + 1) % order.length]);
  };

  // Header three-dot menu — clear cart with confirmation.
  const handleClearCart = () => {
    setShowMoreMenu(false);
    if (cart.lines.length === 0) return;
    if (window.confirm('Clear your cart? You\'ll need to add items again.')) {
      clear();
    }
  };

  // Convert Razorpay's internal error strings into something a customer
  // can act on. null = no message (e.g. successful capture, or user
  // dismissed the modal voluntarily — nothing to say).
  const friendlyRazorpayError = (raw: string | undefined): string | null => {
    if (!raw) return null;
    if (raw === 'dismissed')      return null;
    if (raw === 'timeout')        return 'Payment took too long. Pay at the counter or open this order again to retry.';
    if (raw === 'script_failed')  return 'Could not load the payment widget. Check your internet and pay at the counter.';
    if (raw === 'no_key')         return null;   // configuration; not the customer's problem
    if (raw.startsWith('init_error')) return 'Payment widget couldn\'t start. The order is placed — pay at the counter.';
    if (raw === 'payment_failed') return 'Payment failed. The order is placed — try again from order tracking or pay at the counter.';
    return `Payment didn't go through: ${raw}. The order is placed.`;
  };

  const handlePlaceOrder = async () => {
    if (!restaurant || !breakdown || cart.lines.length === 0) return;
    if (deliveryBlocked) {
      setPlaceError(
        !restaurantHasLocation
          ? 'Delivery is unavailable for this branch right now.'
          : geo.state.status !== 'ready'
            ? 'Tap "Use my location" so we can confirm you\'re in our delivery area.'
            : `Sorry — you're ${distanceFromRestaurant?.toFixed(1)} km away. We deliver within ${deliveryRadiusKm} km only.`,
      );
      return;
    }
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
            // Surface the failure path so the customer knows why no payment
            // popup appeared, or why their card was declined. We DON'T block
            // them from reaching the tracking page — the order is already in.
            const human = friendlyRazorpayError(result.error);
            if (human) setPlaceError(human);
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
  const totalSavings = breakdown ? breakdown.discount + breakdown.coins_value : 0;

  return (
    <div className="min-h-screen bg-background pb-44 lg:pb-24 font-sans">
      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 sticky top-0 z-40 flex justify-between items-center px-container-margin lg:px-8 h-16">
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

      {/* Responsive layout:
            • Mobile / tablet (<lg): single column, sticky pay bar at the bottom.
            • Desktop (lg+): two columns — items left, summary + inline pay CTA right.
              The sticky bottom bar is hidden via `lg:hidden` on its wrapper. */}
      <main className="max-w-md md:max-w-2xl lg:max-w-6xl mx-auto px-container-margin lg:px-8 py-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:items-start space-y-8 lg:space-y-0">
        {/* ── LEFT COLUMN ────────────────────────────────────────────── */}
        <div className="space-y-8 min-w-0">
        {/* Order type segmented — 2-way (Dine-In/Takeaway) by default, 3-way
            when the restaurant has delivery enabled in Admin → Settings. */}
        <section className="space-y-4">
          <div className={cls(
            'bg-surface-container p-1 rounded-2xl grid relative h-12',
            deliveryEnabled ? 'grid-cols-3' : 'grid-cols-2',
          )}>
            <button
              onClick={() => setOrderType('dine_in')}
              className={cls(
                'z-10 font-semibold transition-colors flex items-center justify-center gap-2',
                cart.order_type === 'dine_in' ? 'text-on-surface' : 'text-secondary',
              )}
            >
              <Icon name="restaurant" size={18} />
              <span className="hidden xs:inline">Dine-In</span>
              <span className="xs:hidden">Dine</span>
            </button>
            <button
              onClick={() => setOrderType('takeaway')}
              className={cls(
                'z-10 font-semibold transition-colors flex items-center justify-center gap-2',
                cart.order_type === 'takeaway' ? 'text-on-surface' : 'text-secondary',
              )}
            >
              <Icon name="shopping_bag" size={18} />
              Takeaway
            </button>
            {deliveryEnabled && (
              <button
                onClick={() => setOrderType('delivery')}
                className={cls(
                  'z-10 font-semibold transition-colors flex items-center justify-center gap-2',
                  cart.order_type === 'delivery' ? 'text-on-surface' : 'text-secondary',
                )}
              >
                <Icon name="delivery_dining" size={18} />
                Delivery
              </button>
            )}
            <div
              className={cls(
                'absolute top-1 h-[calc(100%-8px)] bg-white rounded-xl shadow-soft transition-all',
                deliveryEnabled ? 'w-[calc(33.333%-4px)]' : 'w-[calc(50%-4px)]',
                deliveryEnabled
                  ? cart.order_type === 'dine_in'   ? 'left-1'
                  : cart.order_type === 'takeaway' ? 'left-[33.333%]'
                  : 'left-[66.666%]'
                  : cart.order_type === 'dine_in' ? 'left-1' : 'left-[50%]',
              )}
            />
          </div>

          {/* Context banner */}
          <div className="card p-5 flex items-center gap-md">
            <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Icon
                name={
                  cart.order_type === 'dine_in' ? 'location_on'
                  : cart.order_type === 'delivery' ? 'delivery_dining'
                  : 'shopping_bag'
                }
                size={24}
                className="text-primary"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-on-surface">
                {cart.order_type === 'dine_in'
                  ? tableLabel ? `Dining at ${tableLabel}` : 'Dine-in'
                  : cart.order_type === 'delivery' ? 'Delivery'
                  : 'Takeaway'}
              </p>
              <p className="text-label-sm text-secondary">
                {cart.order_type === 'delivery'
                  ? `Within ${deliveryRadiusKm} km of the restaurant`
                  : `Ready in ${restaurant.prep_time_min + 10}–${restaurant.prep_time_max + 10} mins`}
              </p>
            </div>
            <button
              onClick={toggleOrderType}
              className="text-primary font-semibold text-label-sm px-3 py-1.5 hover:bg-primary/5 rounded-lg transition active:scale-95"
            >
              Change
            </button>
          </div>

          {/* Delivery area check — only when delivery is selected */}
          {cart.order_type === 'delivery' && (
            <div className="card p-5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="size-10 grid place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Icon name="my_location" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-on-surface">Confirm your address</p>
                  <p className="text-label-sm text-on-surface-variant">
                    We deliver up to <strong>{deliveryRadiusKm} km</strong> from the restaurant.
                  </p>
                </div>
              </div>

              {!restaurantHasLocation && (
                <p className="text-sm text-error font-medium bg-error-container/40 rounded-lg px-3 py-2">
                  Delivery is configured but this branch hasn't set its location yet. Pick Dine-In or Takeaway.
                </p>
              )}

              {restaurantHasLocation && geo.state.status === 'idle' && (
                <button
                  onClick={() => geo.request()}
                  className="w-full rounded-2xl bg-primary text-on-primary font-semibold py-3 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Icon name="my_location" size={18} />
                  Use my location
                </button>
              )}

              {geo.state.status === 'requesting' && (
                <p className="text-sm text-on-surface-variant flex items-center gap-2">
                  <span className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  Getting your location…
                </p>
              )}

              {geo.state.status === 'denied' && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
                  <p className="font-semibold">Location permission denied.</p>
                  <p className="text-xs mt-1">Enable location in your browser settings and reload, or choose Takeaway / Dine-In instead.</p>
                </div>
              )}

              {geo.state.status === 'unavailable' && (
                <p className="rounded-lg bg-error-container/40 px-3 py-2 text-sm text-error">
                  {geo.state.reason}
                </p>
              )}

              {geo.state.status === 'ready' && restaurantHasLocation && distanceFromRestaurant !== null && (
                withinRadius ? (
                  <div className="rounded-lg bg-success-tint border border-success/30 px-3 py-2 text-sm text-success-text flex items-center gap-2">
                    <Icon name="check_circle" size={18} fill className="text-success" />
                    <span>
                      <strong>You're {distanceFromRestaurant.toFixed(1)} km away</strong>
                      {' · '}within our {deliveryRadiusKm} km area.
                    </span>
                  </div>
                ) : (
                  <div className="rounded-lg bg-error-container/40 px-3 py-2 text-sm text-error space-y-1">
                    <p className="font-semibold">
                      You're {distanceFromRestaurant.toFixed(1)} km away — outside our {deliveryRadiusKm} km delivery area.
                    </p>
                    <p className="text-xs">Pick Takeaway or Dine-In, or order from a closer branch.</p>
                  </div>
                )
              )}
            </div>
          )}
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
              <h2 className="section-label px-1">Offers & Rewards</h2>

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
          </>
        )}
        </div>

        {/* ── RIGHT COLUMN (Bill Summary + Payment + inline CTA on lg+) ─ */}
        {!empty && (
        <aside className="space-y-6 lg:sticky lg:top-20 min-w-0">
            {/* Bill summary */}
            {breakdown && (
              <section className="card p-6 space-y-6">
                <h2 className="font-display text-headline-md text-on-surface">Bill Summary</h2>

                <div className="space-y-4">
                  <Row label="Item Total" value={inr(breakdown.subtotal)} />
                  {/* Tax + service charge row — only shown when the restaurant
                      has `apply_taxes_and_charges` enabled AND there's something
                      to show. Honours the admin toggle in Settings → Tax & Charges. */}
                  {(breakdown.tax + breakdown.service_charge) > 0 && (
                    <Row label="Taxes & Service Charge" value={inr(breakdown.tax + breakdown.service_charge)} />
                  )}
                  {/* Parcel/packing charge — automatic on takeaway. The total
                      already includes this amount; we render it as its own line
                      so the customer can see exactly what the takeaway add-on is. */}
                  {breakdown.packing_charge > 0 && (
                    <div className="flex justify-between text-secondary">
                      <span className="font-medium inline-flex items-center gap-1.5">
                        <Icon name="shopping_bag" size={14} className="text-on-surface-variant" />
                        Parcel Charge
                        <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          {cart.order_type === 'delivery' ? 'Included · Delivery' : 'Included · Takeaway'}
                        </span>
                      </span>
                      <span className="text-on-surface font-semibold">{inr(breakdown.packing_charge)}</span>
                    </div>
                  )}
                  {(breakdown.delivery_fee ?? 0) > 0 && (
                    <div className="flex justify-between text-secondary">
                      <span className="font-medium inline-flex items-center gap-1.5">
                        <Icon name="delivery_dining" size={14} className="text-on-surface-variant" />
                        Delivery Fee
                      </span>
                      <span className="text-on-surface font-semibold">{inr(breakdown.delivery_fee ?? 0)}</span>
                    </div>
                  )}
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

            {/* Inline Pay CTA — desktop-only; mobile uses the sticky bottom bar below */}
            {breakdown && (
              <div className="hidden lg:block">
                {placeError && (
                  <p className="text-sm font-medium text-error bg-error-container/60 rounded-lg px-3 py-2 text-center mb-3">
                    {placeError}
                  </p>
                )}
                <button
                  onClick={handlePlaceOrder}
                  disabled={submitting}
                  aria-busy={submitting}
                  className={cls(
                    'w-full bg-primary text-on-primary rounded-2xl h-14 font-display font-bold text-headline-md shadow-cta active:scale-[0.97] transition flex items-center justify-center gap-2',
                    submitting && 'opacity-70 cursor-wait',
                  )}
                >
                  {submitting ? (
                    <>
                      <span className="size-5 rounded-full border-2 border-on-primary border-t-transparent animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      Pay {inr(breakdown.total)}
                      <Icon name="arrow_forward" size={20} />
                    </>
                  )}
                </button>
                <p className="text-center text-label-sm text-on-surface-variant mt-2">
                  Secured by Razorpay · UPI, Cards, Wallets
                </p>
              </div>
            )}
        </aside>
        )}
      </main>

      {/* Sticky Pay CTA — mobile / tablet only. On lg+ the right column has its own inline CTA. */}
      {!empty && breakdown && (
        <div className="lg:hidden fixed bottom-[64px] left-0 right-0 z-30 bg-surface/90 backdrop-blur-xl border-t border-outline-variant/30 shadow-topfloat">
          {placeError && (
            <div className="max-w-md md:max-w-2xl mx-auto px-container-margin pt-3">
              <p className="text-sm font-medium text-error bg-error-container/60 rounded-lg px-3 py-2 text-center">
                {placeError}
              </p>
            </div>
          )}
          <div className="max-w-md md:max-w-2xl mx-auto px-container-margin py-3 sm:py-4 flex items-center justify-between gap-3 sm:gap-4">
            <div className="flex flex-col shrink-0 min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-widest text-secondary leading-none mb-1">
                Amount to Pay
              </span>
              <span className="font-display text-headline-md sm:text-headline-lg text-on-surface leading-none truncate">{inr(breakdown.total)}</span>
            </div>
            <button
              onClick={handlePlaceOrder}
              disabled={submitting}
              aria-busy={submitting}
              className={cls(
                'flex-1 max-w-xs sm:max-w-sm bg-primary text-on-primary rounded-2xl h-12 sm:h-14 font-display font-bold text-body-lg sm:text-headline-md shadow-cta active:scale-[0.97] transition flex items-center justify-center gap-2',
                submitting && 'opacity-70 cursor-wait',
              )}
            >
              {submitting ? (
                <>
                  <span className="size-5 rounded-full border-2 border-on-primary border-t-transparent animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  Proceed to Pay
                  <Icon name="arrow_forward" size={20} />
                </>
              )}
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
  const [imgFailed, setImgFailed] = useState(false);
  const initials = line.item_name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  // Build sub-description from spice level + modifiers + variant
  const parts: string[] = [];
  if (line.variant_name) parts.push(line.variant_name);
  line.modifiers.forEach(m => parts.push('Extra ' + m.name));
  if (line.spice_level) parts.push(`${line.spice_level} Spicy`);
  const subline = parts.join(', ');

  return (
    <article className="card p-md flex gap-md">
      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden shrink-0 shadow-sm bg-surface-container">
        {!imgFailed && line.image_url ? (
          <img
            src={line.image_url}
            alt={line.item_name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 grid place-items-center">
            <span className="font-display font-extrabold text-2xl text-primary/70">{initials}</span>
          </div>
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
  const [imgFailed, setImgFailed] = useState(false);
  // Two-letter initials for the gradient fallback when the image is broken
  // (we used to render the browser's broken-image icon + alt text, which
  // looked like text overlapping the picture).
  const initials = upsell.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <div className="shrink-0 w-36 sm:w-44 bg-surface-container-lowest rounded-2xl p-3 shadow-soft border border-outline-variant/10">
      <div className="relative mb-3">
        {imgFailed || !upsell.image_url ? (
          <div className="w-full h-24 sm:h-28 rounded-xl shadow-sm bg-gradient-to-br from-primary/20 to-primary/5 grid place-items-center">
            <span className="font-display font-extrabold text-[28px] text-primary/70">{initials}</span>
          </div>
        ) : (
          <img
            src={upsell.image_url}
            alt={upsell.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-24 sm:h-28 object-cover rounded-xl shadow-sm"
          />
        )}
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
    <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600 rounded-2xl p-5 text-white shadow-xl flex items-center justify-between relative overflow-hidden">
      <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/15 rounded-full blur-2xl" />
      <div className="absolute -left-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-xl" />

      <div className="flex items-center gap-md relative z-10">
        <div className="size-12 bg-white/25 rounded-xl grid place-items-center shadow-lg border border-white/30">
          <Icon name="token" size={26} fill className="text-white" />
        </div>
        <div>
          <h3 className="font-display text-[16px] font-bold text-white">{balance} FoodCoins</h3>
          <p className="text-label-sm text-white/90">
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
            used ? 'translate-x-6 bg-white' : 'translate-x-0 bg-orange-300',
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
