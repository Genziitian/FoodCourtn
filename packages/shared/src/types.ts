// Domain types — mirror Postgres schema in /supabase/migrations/0001.
// Keep these in sync manually for now; later, generate with `supabase gen types`.

export type FoodType = 'veg' | 'non_veg' | 'egg';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus = 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded' | 'counter';
export type StaffRole = 'owner' | 'manager' | 'cashier' | 'kitchen' | 'waiter';
export type CouponType = 'percent' | 'flat' | 'bogo' | 'free_item';
export type KotStatus = 'new' | 'cooking' | 'ready' | 'complete';
export type LoyaltyTxnType = 'earn' | 'redeem' | 'bonus' | 'expire' | 'refund';

export interface RestaurantSettings {
  gst_percent: number;
  gst_inclusive: boolean;
  service_charge_percent: number;
  packing_charge: number;
  payment_mode: 'counter' | 'online' | 'both';
  auto_accept_orders: boolean;
  auto_print_kot: boolean;
  loyalty_earn_rate: number;          // points per 100 spent
  loyalty_max_redeem_percent: number; // max % of order redeemable
  // When false, taxes (GST) and service-charge percentages are skipped entirely
  // — neither added to the total nor shown on the customer bill summary. The
  // packing/parcel charge on takeaway is unaffected. Defaults to true.
  apply_taxes_and_charges?: boolean;
  // ── Delivery (manual-update, GPS-gated) ───────────────────────────────
  delivery_enabled?: boolean;       // master switch: when false the Delivery tab is hidden
  delivery_radius_km?: number;      // default 5; customers outside the radius see "out of area"
  delivery_lat?: number | null;     // restaurant latitude — used for the radius check
  delivery_lng?: number | null;     // restaurant longitude
  delivery_fee?: number;            // flat ₹ charge added to delivery orders
}

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  cuisines: string[];
  rating: number;
  review_count: number;
  prep_time_min: number;
  prep_time_max: number;
  hero_image: string | null;
  hero_images?: string[] | null;        // up to 5 carousel images on the Landing page; falls back to hero_image
  menu_hero_images?: string[] | null;   // up to 5 carousel images on the Menu page header; falls back to hero_images
  welcome_text: string;
  is_open: boolean;
  settings: RestaurantSettings;
  // branch fields (added in migration 0004)
  organization_id?: string;
  branch_code?: string;
  area_name?: string;
  city?: string;
  phone?: string;
  address?: string;
  logo_url?: string | null;
  theme?: { primary: string; accent: string };
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  brand_color: string;
  accent_color: string;
  contact_email: string | null;
  contact_phone: string | null;
  gst_no: string | null;
  fssai_no: string | null;
  plan: 'starter' | 'growth' | 'enterprise';
  commission_percent: number;
  is_active: boolean;
  trial_ends_at: string | null;
  created_at: string;
}

export type PaymentProvider = 'razorpay' | 'stripe' | 'phonepe' | 'paytm' | 'cashfree';

export interface PaymentGateway {
  id: string;
  restaurant_id: string;
  provider: PaymentProvider;
  key_id: string;
  is_active: boolean;
  is_primary: boolean;
  test_mode: boolean;
  last_verified_at: string | null;
}

export type ReservationStatus =
  | 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';

export interface Reservation {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  party_size: number;
  reserved_at: string;
  duration_min: number;
  status: ReservationStatus;
  notes: string | null;
  source: 'phone' | 'website' | 'walk_in';
  created_at: string;
}

export interface DiningArea {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
}

export type PlatformAdminRole = 'super_admin' | 'support' | 'finance';

export interface PlatformAdmin {
  user_id: string;
  role: PlatformAdminRole;
  display_name: string;
}

export interface DiningTable {
  id: string;
  restaurant_id: string;
  label: string;
  qr_token: string;
  is_active: boolean;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
  available_from: string | null;
  available_to: string | null;
}

export interface MenuVariant {
  id: string;
  menu_item_id: string;
  name: string;
  price: number;
  sort_order: number;
  is_default: boolean;
}

export interface MenuModifier {
  id: string;
  menu_item_id: string;
  group_name: string;
  name: string;
  price_delta: number;
  is_required: boolean;
  sort_order: number;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: number;
  mrp: number | null;           // pre-discount price for strike-through
  parcel_charge?: number;       // per-unit parcel/packing fee added on takeaway+delivery; defaults to 0
  food_type: FoodType;
  rating: number;
  rating_count: number;
  prep_time_min: number;        // estimated prep time per item (shown on detail)
  is_bestseller: boolean;
  is_recommended: boolean;
  is_chef_special: boolean;
  in_stock: boolean;
  sort_order: number;
  // spice level options shown as a segmented control on the detail modal
  spice_levels: string[];       // e.g. ['Mild','Medium','Spicy']; empty if N/A
  default_spice_level: string | null;
  variants?: MenuVariant[];
  modifiers?: MenuModifier[];
}

export interface UpsellItem {
  id: string;
  name: string;
  price: number;
  image_url: string;
}

export interface Coupon {
  id: string;
  restaurant_id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number | null;
  min_order_value: number;
  max_discount: number | null;
  valid_from: string | null;
  valid_to: string | null;
  applies_to: OrderType[];
  conditions: Record<string, unknown>;
  is_active: boolean;
}

// ---------- cart (client-side, before order is placed) ----------
export interface CartModifier {
  id: string;
  name: string;
  price_delta: number;
}
export interface CartLine {
  line_id: string;             // client-side uuid
  menu_item_id: string;
  item_name: string;
  image_url: string | null;
  food_type: FoodType;
  variant_id: string | null;
  variant_name: string | null;
  modifiers: CartModifier[];
  spice_level: string | null;  // 'Mild' | 'Medium' | 'Spicy' | null
  qty: number;
  unit_price: number;          // variant price + modifiers
  line_total: number;
  parcel_charge_per_unit?: number;   // copied from menu_items.parcel_charge; used on takeaway/delivery
  notes?: string;
}

export interface Cart {
  restaurant_id: string;
  table_id: string | null;
  order_type: OrderType;
  lines: CartLine[];
  coupon_code: string | null;
  use_coins: boolean;
}

export interface PriceBreakdown {
  subtotal: number;
  discount: number;
  coins_redeemed: number;
  coins_value: number;
  tax: number;
  service_charge: number;
  packing_charge: number;
  delivery_fee?: number;        // only present on delivery orders
  total: number;
  applied_coupon: Coupon | null;
}

// ---------- orders ----------
export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  variant_id: string | null;
  item_name: string;
  variant_name: string | null;
  modifiers: CartModifier[];
  qty: number;
  unit_price: number;
  line_total: number;
  notes: string | null;
}

export interface Order {
  id: string;
  restaurant_id: string;
  code: string;
  table_id: string | null;
  customer_id: string | null;
  type: OrderType;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  service_charge: number;
  packing_charge: number;
  discount: number;
  coins_redeemed: number;
  coins_value: number;
  total: number;
  coupon_id: string | null;
  payment_status: PaymentStatus;
  customer_notes: string | null;
  estimated_min: number | null;
  estimated_max: number | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  status_events?: OrderStatusEvent[];
}

export interface OrderStatusEvent {
  id: string;
  order_id: string;
  status: OrderStatus;
  note: string | null;
  created_at: string;
}

// ---------- KOT ----------
export interface KotTicket {
  id: string;
  restaurant_id: string;
  order_id: string;
  ticket_no: string;
  station: string;
  status: KotStatus;
  is_rush: boolean;
  payload: KotPayload;
  items_done: number;
  items_total: number;
  printed_at: string | null;
  reprint_count: number;
  created_at: string;
  updated_at: string;
}

export interface KotPayload {
  order_code: string;
  order_type: OrderType;
  table_label: string | null;
  customer_name: string | null;
  items: Array<{
    id: string;
    name: string;
    variant: string | null;
    modifiers: string[];
    qty: number;
    notes?: string;
  }>;
}

// ---------- loyalty ----------
export interface LoyaltyWallet {
  id: string;
  restaurant_id: string;
  customer_id: string;
  balance: number;
}
