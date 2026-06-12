import type { Cart, Coupon, PriceBreakdown, RestaurantSettings } from './types';

interface PricingInput {
  cart: Cart;
  settings: RestaurantSettings;
  coupons: Coupon[];
  coinsAvailable: number;
}

/**
 * Authoritative price calculator. Pure function — same result on client and edge.
 *
 * Rules:
 *  - subtotal = sum of line_totals
 *  - apply coupon: percent (capped by max_discount) | flat | (bogo/free_item stubbed)
 *  - apply coin redemption: max = loyalty_max_redeem_percent of post-discount amount
 *  - tax % applied on (subtotal - discount - coins_value)
 *  - service charge & packing charge added (packing only for takeaway)
 */
export function calculatePrice({
  cart,
  settings,
  coupons,
  coinsAvailable,
}: PricingInput): PriceBreakdown {
  const subtotal = cart.lines.reduce((s, l) => s + l.line_total, 0);

  // ---- coupon ----
  let discount = 0;
  let appliedCoupon: Coupon | null = null;
  if (cart.coupon_code) {
    const c = coupons.find(
      x => x.code.toUpperCase() === cart.coupon_code!.toUpperCase() && x.is_active,
    );
    if (c && subtotal >= c.min_order_value && c.applies_to.includes(cart.order_type)) {
      if (c.type === 'percent' && c.value) {
        discount = (subtotal * c.value) / 100;
        if (c.max_discount) discount = Math.min(discount, c.max_discount);
      } else if (c.type === 'flat' && c.value) {
        discount = Math.min(c.value, subtotal);
      }
      // bogo / free_item: not implemented in v1
      if (discount > 0) appliedCoupon = c;
    }
  }

  // ---- coins ----
  const afterDiscount = Math.max(0, subtotal - discount);
  let coinsRedeemed = 0;
  let coinsValue = 0;
  if (cart.use_coins && coinsAvailable > 0) {
    const cap = (afterDiscount * settings.loyalty_max_redeem_percent) / 100;
    // 1 coin = ₹1 by default at redemption (display logic; could be configurable)
    coinsValue = Math.min(coinsAvailable, Math.floor(cap));
    coinsRedeemed = coinsValue;
  }

  // ---- tax ----
  // Honour the per-restaurant `apply_taxes_and_charges` master switch. When the
  // owner has turned it off in Admin → Settings → Tax & Charges, we zero out
  // both GST and service charge so the customer sees a clean bill (item total +
  // packing on takeaway only). Defaults to ON if the field hasn't been set.
  const applyTaxes = settings.apply_taxes_and_charges !== false;
  const taxable = Math.max(0, afterDiscount - coinsValue);
  const tax = !applyTaxes || settings.gst_inclusive
    ? 0
    : (taxable * settings.gst_percent) / 100;

  // ---- charges ----
  const serviceCharge =
    applyTaxes && settings.service_charge_percent > 0
      ? (taxable * settings.service_charge_percent) / 100
      : 0;
  // Order-type-specific charges, taken from each menu item.
  //
  //   TAKEAWAY  → packing/parcel charge per item (e.g. ₹15 per biryani box).
  //               Falls back to settings.packing_charge (flat ₹) when no
  //               line in the cart has a per-unit parcel charge configured.
  //
  //   DELIVERY  → delivery charge per item (e.g. ₹25 per biryani — hot-bag
  //               + dispatch). Falls back to settings.delivery_fee (flat ₹)
  //               for older menus that haven't been touched since the
  //               per-item column was added.
  //
  // They're mutually exclusive: a takeaway order never accrues delivery
  // charge, a delivery order never accrues parcel charge. This keeps the
  // owner's mental model simple — one fee per order type, configurable
  // per item.
  const perItemParcelSum = cart.lines.reduce(
    (s, l) => s + (Number(l.parcel_charge_per_unit ?? 0) * l.qty),
    0,
  );
  const perItemDeliverySum = cart.lines.reduce(
    (s, l) => s + (Number(l.delivery_charge_per_unit ?? 0) * l.qty),
    0,
  );
  const packingCharge =
    cart.order_type !== 'takeaway' ? 0
    : perItemParcelSum > 0 ? perItemParcelSum
    : Number(settings.packing_charge ?? 0);
  const deliveryFee =
    cart.order_type !== 'delivery' ? 0
    : perItemDeliverySum > 0 ? perItemDeliverySum
    : Number(settings.delivery_fee ?? 0);

  const total = round2(taxable + tax + serviceCharge + packingCharge + deliveryFee);

  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    coins_redeemed: coinsRedeemed,
    coins_value: round2(coinsValue),
    tax: round2(tax),
    service_charge: round2(serviceCharge),
    packing_charge: round2(packingCharge),
    delivery_fee: round2(deliveryFee),
    total,
    applied_coupon: appliedCoupon,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
