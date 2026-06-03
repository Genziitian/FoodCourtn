// In-memory fixtures matching supabase/migrations/0003_seed.sql.
// Used when VITE_SUPABASE_URL is not set, so the UI is fully demoable
// without a backend.

import type {
  Category,
  Coupon,
  KotTicket,
  MenuItem,
  Order,
  Restaurant,
  UpsellItem,
} from './types';

const RID = '00000000-0000-0000-0000-000000000001';
const TABLE12 = '00000000-0000-0000-0000-0000000000a7';

export const mockRestaurant: Restaurant = {
  id: RID,
  slug: 'the-spice-route',
  name: 'The Spice Route',
  cuisines: ['North Indian', 'Mughlai', 'Biryani'],
  rating: 4.8,
  review_count: 1240,
  prep_time_min: 10,
  prep_time_max: 15,
  hero_image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=1600',
  welcome_text:
    "Your table is ready. Browse the menu and order when you're hungry.",
  is_open: true,
  settings: {
    gst_percent: 5,
    gst_inclusive: false,
    service_charge_percent: 0,
    packing_charge: 0,
    payment_mode: 'online',
    auto_accept_orders: true,
    auto_print_kot: true,
    loyalty_earn_rate: 5,
    loyalty_max_redeem_percent: 100, // 1 coin = ₹1, up to balance
  },
};

export const mockAdminRestaurant: Restaurant = {
  ...mockRestaurant,
  id: '00000000-0000-0000-0000-000000000002',
  slug: 'spice-garden',
  name: 'Spice Garden',
  cuisines: ['North Indian', 'Continental'],
  rating: 4.6,
  review_count: 1450,
};

export const mockTable = {
  id: TABLE12,
  restaurant_id: RID,
  label: 'Table 12',
  qr_token: 'sr-t12',
  is_active: true,
};

export const mockCategories: Category[] = [
  { id: 'c1', restaurant_id: RID, name: 'Starters',    sort_order: 1, available_from: null, available_to: null },
  { id: 'c2', restaurant_id: RID, name: 'Main Course', sort_order: 2, available_from: null, available_to: null },
  { id: 'c3', restaurant_id: RID, name: 'Breads',      sort_order: 3, available_from: null, available_to: null },
  { id: 'c4', restaurant_id: RID, name: 'Biryani',     sort_order: 4, available_from: null, available_to: null },
  { id: 'c5', restaurant_id: RID, name: 'Desserts',    sort_order: 5, available_from: null, available_to: null },
  { id: 'c6', restaurant_id: RID, name: 'Beverages',   sort_order: 6, available_from: null, available_to: null },
];

const SPICE_LEVELS = ['Mild', 'Medium', 'Spicy'];

function item(partial: Partial<MenuItem> & Pick<MenuItem, 'id' | 'category_id' | 'name' | 'base_price' | 'food_type' | 'image_url'>): MenuItem {
  return {
    restaurant_id: RID,
    description: null,
    mrp: null,
    rating: 4.5,
    rating_count: 100,
    prep_time_min: 15,
    is_bestseller: false,
    is_recommended: false,
    is_chef_special: false,
    in_stock: true,
    sort_order: 0,
    spice_levels: [],
    default_spice_level: null,
    variants: undefined,
    modifiers: undefined,
    ...partial,
  };
}

export const mockMenu: MenuItem[] = [
  item({
    id: 'm-bc',
    category_id: 'c2',
    name: 'Signature Butter Chicken',
    description: 'Tender chicken marinated overnight, slow-cooked in a rich, creamy tomato gravy infused with aromatic spices and finished with a touch of fenugreek.',
    image_url: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=900',
    base_price: 345,
    mrp: 400,
    food_type: 'non_veg',
    rating: 4.8,
    rating_count: 1200,
    prep_time_min: 15,
    is_bestseller: true,
    is_recommended: true,
    spice_levels: SPICE_LEVELS,
    default_spice_level: 'Medium',
    variants: [
      { id: 'v-bc-1', menu_item_id: 'm-bc', name: 'Half',  price: 345, sort_order: 1, is_default: true },
      { id: 'v-bc-2', menu_item_id: 'm-bc', name: 'Full',  price: 545, sort_order: 2, is_default: false },
    ],
    modifiers: [
      { id: 'mo-bc-1', menu_item_id: 'm-bc', group_name: 'Extra Toppings', name: 'Extra Cheese',   price_delta: 40, is_required: false, sort_order: 1 },
      { id: 'mo-bc-2', menu_item_id: 'm-bc', group_name: 'Extra Toppings', name: 'Butter',         price_delta: 20, is_required: false, sort_order: 2 },
      { id: 'mo-bc-3', menu_item_id: 'm-bc', group_name: 'Extra Toppings', name: 'Paneer',         price_delta: 60, is_required: false, sort_order: 3 },
      { id: 'mo-bc-4', menu_item_id: 'm-bc', group_name: 'Extra Toppings', name: 'Garlic Butter',  price_delta: 30, is_required: false, sort_order: 4 },
    ],
  }),
  item({
    id: 'm-pt',
    category_id: 'c1',
    name: 'Paneer Tikka',
    description: 'Smoky cottage cheese cubes marinated in spiced yogurt, grilled in tandoor.',
    image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=900',
    base_price: 289,
    food_type: 'veg',
    rating: 4.7,
    rating_count: 234,
    is_chef_special: true,
    is_recommended: true,
    spice_levels: SPICE_LEVELS,
    default_spice_level: 'Medium',
    variants: [
      { id: 'v-pt-1', menu_item_id: 'm-pt', name: 'Half (6 pcs)',  price: 289, sort_order: 1, is_default: true },
      { id: 'v-pt-2', menu_item_id: 'm-pt', name: 'Full (12 pcs)', price: 489, sort_order: 2, is_default: false },
    ],
    modifiers: [
      { id: 'mo-pt-1', menu_item_id: 'm-pt', group_name: 'Extra Toppings', name: 'Extra Mint Chutney', price_delta: 20, is_required: false, sort_order: 1 },
      { id: 'mo-pt-2', menu_item_id: 'm-pt', group_name: 'Extra Toppings', name: 'Cheese Topping',     price_delta: 40, is_required: false, sort_order: 2 },
    ],
  }),
  item({
    id: 'm-cc',
    category_id: 'c1',
    name: 'Crispy Corn Chilli Pepper',
    description: 'Crispy fried corn kernels tossed with crunchy bell peppers, onions, and a spicy, tangy Asian-style sauce.',
    image_url: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=900',
    base_price: 249,
    mrp: 299,
    food_type: 'veg',
    rating: 4.5,
    rating_count: 120,
    is_recommended: false,
    spice_levels: SPICE_LEVELS,
    default_spice_level: 'Spicy',
  }),
  item({
    id: 'm-ck',
    category_id: 'c1',
    name: 'Chicken Tikka Kebab',
    description: 'Boneless chicken chunks marinated in spiced yogurt and roasted in a traditional clay oven. Served with mint chutney.',
    image_url: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=900',
    base_price: 329,
    food_type: 'non_veg',
    rating: 4.8,
    rating_count: 350,
    spice_levels: SPICE_LEVELS,
    default_spice_level: 'Medium',
  }),
  item({
    id: 'm-dm',
    category_id: 'c2',
    name: 'Dal Makhani',
    description: 'Slow-cooked black lentils with butter and cream.',
    image_url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=900',
    base_price: 260,
    food_type: 'veg',
    rating: 4.8,
    rating_count: 412,
    is_bestseller: true,
    is_recommended: true,
  }),
  item({
    id: 'm-gn',
    category_id: 'c3',
    name: 'Garlic Naan',
    description: 'Soft naan brushed with garlic butter.',
    image_url: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=900',
    base_price: 80,
    food_type: 'veg',
  }),
  item({
    id: 'm-bn',
    category_id: 'c3',
    name: 'Butter Naan (Basket)',
    description: 'Classic tandoori naan with butter, 3 pcs.',
    image_url: 'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=900',
    base_price: 180,
    food_type: 'veg',
  }),
  item({
    id: 'm-cb',
    category_id: 'c4',
    name: 'Chicken Dum Biryani',
    description: 'Aromatic basmati rice cooked with chicken on slow dum.',
    image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=900',
    base_price: 380,
    food_type: 'non_veg',
    rating: 4.8,
    rating_count: 612,
    is_bestseller: true,
    spice_levels: SPICE_LEVELS,
    default_spice_level: 'Medium',
  }),
  item({
    id: 'm-vb',
    category_id: 'c4',
    name: 'Veg Dum Biryani',
    description: 'Fragrant basmati with seasonal vegetables and spices.',
    image_url: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=900',
    base_price: 280,
    food_type: 'veg',
  }),
  item({
    id: 'm-gj',
    category_id: 'c5',
    name: 'Gulab Jamun',
    description: 'Soft milk dumplings in rose-cardamom syrup.',
    image_url: 'https://images.unsplash.com/photo-1601303516534-4dc16d2b6f49?w=900',
    base_price: 120,
    food_type: 'veg',
  }),
  item({
    id: 'm-cc-bev',
    category_id: 'c6',
    name: 'Coke (500ml)',
    description: 'Chilled bottled Coca-Cola.',
    image_url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=900',
    base_price: 60,
    food_type: 'veg',
  }),
  item({
    id: 'm-chai',
    category_id: 'c6',
    name: 'Masala Chai',
    description: 'Traditional spiced milk tea.',
    image_url: 'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=900',
    base_price: 60,
    food_type: 'veg',
  }),
];

export const mockUpsells: UpsellItem[] = [
  {
    id: 'm-cc-bev',
    name: 'Coke (500ml)',
    price: 60,
    image_url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600',
  },
  {
    id: 'm-gj',
    name: 'Gulab Jamun',
    price: 120,
    image_url: 'https://images.unsplash.com/photo-1601303516534-4dc16d2b6f49?w=600',
  },
  {
    id: 'm-gs',
    name: 'Garden Salad',
    price: 140,
    image_url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600',
  },
];

export const mockCoupons: Coupon[] = [
  {
    id: 'cp1', restaurant_id: RID, code: 'SPICE200',
    description: 'Extra ₹200 savings with this coupon',
    type: 'flat', value: 200, min_order_value: 500, max_discount: null,
    valid_from: null, valid_to: null, applies_to: ['dine_in', 'takeaway'],
    conditions: { featured: true, banner: true }, is_active: true,
  },
  {
    id: 'cp2', restaurant_id: RID, code: 'FIRST50',
    description: 'Flat ₹50 off on your first order',
    type: 'flat', value: 50, min_order_value: 200, max_discount: null,
    valid_from: null, valid_to: null, applies_to: ['dine_in', 'takeaway'],
    conditions: { first_order_only: true }, is_active: true,
  },
  {
    id: 'cp3', restaurant_id: RID, code: 'SAVE10',
    description: '10% off site-wide',
    type: 'percent', value: 10, min_order_value: 0, max_discount: 80,
    valid_from: null, valid_to: null, applies_to: ['dine_in', 'takeaway'],
    conditions: {}, is_active: true,
  },
];

// ---- Admin / KDS mocks ----

export const mockAdminMetrics = {
  revenueToday: 48320,
  revenueDeltaPct: 14.6,
  revenueDeltaAbs: 6140,
  ordersToday: 127,
  ordersDeltaPct: 8.2,
  ordersLastHour: 18,
  avgOrderValue: 380,
  aovDeltaPct: -3.1,
  aovDeltaAbs: -12,
  kitchenQueue: 11,
  queueIncrease: 3,
  couponRedemptions: 34,
  couponDiscount: 2890,
  repeatCustomersPct: 61,
  repeatCount: 78,
  coinsRedeemed: 2140,
  coinsCustomers: 12,
  coinsValue: 214,
  peakHour: '1 PM – 2 PM',
  peakHourOrders: 34,
};

export const mockKotTickets: KotTicket[] = [
  {
    id: 'k1', restaurant_id: RID, order_id: 'o1', ticket_no: 'KOT-8412',
    station: 'curry', status: 'cooking', is_rush: true,
    items_done: 2, items_total: 4, printed_at: null, reprint_count: 0,
    created_at: new Date(Date.now() - 8 * 60 * 1000 - 2000).toISOString(),
    updated_at: new Date().toISOString(),
    payload: {
      order_code: 'FC-567710', order_type: 'dine_in', table_label: 'T-7', customer_name: 'Arjun Sharma',
      items: [
        { id: 'i1', name: 'Butter Chicken', variant: 'Regular', modifiers: [], qty: 1 },
        { id: 'i2', name: 'Dal Makhani',    variant: null,      modifiers: [], qty: 1 },
        { id: 'i3', name: 'Garlic Naan',    variant: null,      modifiers: [], qty: 3 },
        { id: 'i4', name: 'Masala Chai',    variant: null,      modifiers: [], qty: 2 },
      ],
    },
  },
  {
    id: 'k2', restaurant_id: RID, order_id: 'o2', ticket_no: 'KOT-8411',
    station: 'curry', status: 'ready', is_rush: false,
    items_done: 6, items_total: 6, printed_at: null, reprint_count: 0,
    created_at: new Date(Date.now() - 12 * 60 * 1000 - 2000).toISOString(),
    updated_at: new Date().toISOString(),
    payload: {
      order_code: 'FC-567711', order_type: 'dine_in', table_label: 'T-3', customer_name: 'Priya Nair',
      items: [
        { id: 'i5', name: 'Mutton Rogan Josh', variant: 'Full',         modifiers: [], qty: 1 },
        { id: 'i6', name: 'Paneer Tikka',      variant: 'Half (6 pcs)', modifiers: [], qty: 1 },
        { id: 'i7', name: 'Butter Naan',       variant: null,           modifiers: [], qty: 4 },
      ],
    },
  },
  {
    id: 'k3', restaurant_id: RID, order_id: 'o3', ticket_no: 'KOT-8410',
    station: 'grill', status: 'new', is_rush: false,
    items_done: 0, items_total: 2, printed_at: null, reprint_count: 0,
    created_at: new Date(Date.now() - 1 * 60 * 1000 - 32000).toISOString(),
    updated_at: new Date().toISOString(),
    payload: {
      order_code: 'FC-567712', order_type: 'dine_in', table_label: 'T-12', customer_name: 'Mohammed Riyaz',
      items: [
        { id: 'i8', name: 'Chicken 65',    variant: 'Full', modifiers: [], qty: 1 },
        { id: 'i9', name: 'Kadai Chicken', variant: 'Half', modifiers: [], qty: 1 },
      ],
    },
  },
  {
    id: 'k4', restaurant_id: RID, order_id: 'o4', ticket_no: 'KOT-8409',
    station: 'curry', status: 'cooking', is_rush: false,
    items_done: 1, items_total: 3, printed_at: null, reprint_count: 0,
    created_at: new Date(Date.now() - 6 * 60 * 1000 - 2000).toISOString(),
    updated_at: new Date().toISOString(),
    payload: {
      order_code: 'FC-567713', order_type: 'takeaway', table_label: null, customer_name: 'Divya Krishnan',
      items: [
        { id: 'i10', name: 'Chicken Dum Biryani', variant: 'Full (2 persons)', modifiers: [], qty: 1 },
        { id: 'i11', name: 'Raita',               variant: null,               modifiers: [], qty: 1 },
        { id: 'i12', name: 'Mirchi Salan',        variant: null,               modifiers: [], qty: 1 },
      ],
    },
  },
];

export function mockNewOrder(code: string, tableLabel: string | null, total: number): Order {
  const now = new Date().toISOString();
  return {
    id: 'o-new',
    restaurant_id: RID,
    code,
    table_id: tableLabel ? TABLE12 : null,
    customer_id: null,
    type: tableLabel ? 'dine_in' : 'takeaway',
    status: 'received',
    subtotal: total,
    tax: 0,
    service_charge: 0,
    packing_charge: 0,
    discount: 0,
    coins_redeemed: 0,
    coins_value: 0,
    total,
    coupon_id: null,
    payment_status: 'success',
    customer_notes: null,
    estimated_min: 12,
    estimated_max: 15,
    created_at: now,
    updated_at: now,
    status_events: [
      { id: 'e1', order_id: 'o-new', status: 'received', note: null, created_at: now },
    ],
  };
}

// ════════════════════════════════════════════════════════════
// Admin-specific mocks (orders feed, top items, sales, payment
// breakdown, staff, tables, notifications, audit, settings).
// ════════════════════════════════════════════════════════════

import type { OrderStatus, OrderType, PaymentStatus, StaffRole } from './types';

export interface AdminOrderRow {
  id: string;
  code: string;
  type: OrderType;
  status: OrderStatus;
  table_label: string | null;
  customer_name: string;
  items: Array<{ name: string; qty: number; variant?: string }>;
  item_count: number;
  subtotal: number;
  discount: number;
  total: number;
  payment_status: PaymentStatus;
  payment_method: 'UPI' | 'Card' | 'Wallet' | 'Cash' | null;
  created_at: string;          // ISO
  age_minutes: number;
  is_rush?: boolean;
  notes?: string;
}

const _now = Date.now();
const _agoIso = (m: number) => new Date(_now - m * 60 * 1000).toISOString();

export const mockOrdersFeed: AdminOrderRow[] = [
  {
    id: 'o-8412', code: 'FC-567812', type: 'dine_in', status: 'preparing',
    table_label: 'T-7', customer_name: 'Arjun Sharma',
    items: [
      { name: 'Butter Chicken', qty: 1, variant: 'Full' },
      { name: 'Dal Makhani', qty: 1 },
      { name: 'Garlic Naan', qty: 3 },
      { name: 'Masala Chai', qty: 2 },
    ],
    item_count: 7, subtotal: 990, discount: 99, total: 925,
    payment_status: 'success', payment_method: 'UPI',
    created_at: _agoIso(8), age_minutes: 8, is_rush: true,
  },
  {
    id: 'o-8411', code: 'FC-567811', type: 'dine_in', status: 'ready',
    table_label: 'T-3', customer_name: 'Priya Nair',
    items: [
      { name: 'Mutton Rogan Josh', qty: 1, variant: 'Full' },
      { name: 'Paneer Tikka', qty: 1, variant: 'Half' },
      { name: 'Butter Naan', qty: 4 },
    ],
    item_count: 6, subtotal: 1120, discount: 0, total: 1176,
    payment_status: 'success', payment_method: 'Card',
    created_at: _agoIso(12), age_minutes: 12,
  },
  {
    id: 'o-8410', code: 'FC-567810', type: 'dine_in', status: 'received',
    table_label: 'T-12', customer_name: 'Mohammed Riyaz',
    items: [
      { name: 'Chicken 65', qty: 1, variant: 'Full' },
      { name: 'Kadai Chicken', qty: 1, variant: 'Half' },
    ],
    item_count: 2, subtotal: 660, discount: 0, total: 693,
    payment_status: 'success', payment_method: 'UPI',
    created_at: _agoIso(2), age_minutes: 2,
  },
  {
    id: 'o-8409', code: 'FC-567809', type: 'takeaway', status: 'preparing',
    table_label: null, customer_name: 'Divya Krishnan',
    items: [
      { name: 'Chicken Dum Biryani', qty: 1, variant: 'Full (2 persons)' },
      { name: 'Raita', qty: 1 },
      { name: 'Mirchi Salan', qty: 1 },
    ],
    item_count: 3, subtotal: 520, discount: 52, total: 491,
    payment_status: 'success', payment_method: 'UPI',
    created_at: _agoIso(6), age_minutes: 6,
  },
  {
    id: 'o-8408', code: 'FC-567808', type: 'dine_in', status: 'preparing',
    table_label: 'T-5', customer_name: 'Santosh Rao',
    items: [{ name: 'Tandoori Platter', qty: 1 }, { name: 'Butter Naan', qty: 2 }],
    item_count: 3, subtotal: 580, discount: 0, total: 609,
    payment_status: 'success', payment_method: 'Card',
    created_at: _agoIso(11), age_minutes: 11, is_rush: true,
  },
  {
    id: 'o-8407', code: 'FC-567807', type: 'dine_in', status: 'received',
    table_label: 'T-9', customer_name: 'Lakshmi Menon',
    items: [{ name: 'Veg Thali', qty: 1 }, { name: 'Sweet Lassi', qty: 1 }],
    item_count: 2, subtotal: 320, discount: 32, total: 302,
    payment_status: 'pending', payment_method: 'UPI',
    created_at: _agoIso(1), age_minutes: 1,
  },
  {
    id: 'o-8406', code: 'FC-567806', type: 'takeaway', status: 'ready',
    table_label: null, customer_name: 'Vikram Patel',
    items: [{ name: 'Hyderabadi Biryani', qty: 2 }],
    item_count: 2, subtotal: 720, discount: 144, total: 605,
    payment_status: 'success', payment_method: 'Wallet',
    created_at: _agoIso(15), age_minutes: 15,
  },
  {
    id: 'o-8405', code: 'FC-567805', type: 'dine_in', status: 'completed',
    table_label: 'T-2', customer_name: 'Anjali Desai',
    items: [{ name: 'Paneer Butter Masala', qty: 1 }, { name: 'Jeera Rice', qty: 1 }],
    item_count: 2, subtotal: 460, discount: 0, total: 483,
    payment_status: 'success', payment_method: 'UPI',
    created_at: _agoIso(35), age_minutes: 35,
  },
  {
    id: 'o-8404', code: 'FC-567804', type: 'dine_in', status: 'completed',
    table_label: 'T-1', customer_name: 'Rahul Mehta',
    items: [{ name: 'Butter Chicken', qty: 1 }, { name: 'Garlic Naan', qty: 2 }],
    item_count: 3, subtotal: 540, discount: 50, total: 514,
    payment_status: 'success', payment_method: 'Card',
    created_at: _agoIso(50), age_minutes: 50,
  },
  {
    id: 'o-8403', code: 'FC-567803', type: 'takeaway', status: 'cancelled',
    table_label: null, customer_name: 'Kavya Iyer',
    items: [{ name: 'Veg Biryani', qty: 1 }],
    item_count: 1, subtotal: 280, discount: 0, total: 294,
    payment_status: 'refunded', payment_method: 'UPI',
    created_at: _agoIso(65), age_minutes: 65,
    notes: 'Customer cancelled — wrong item ordered',
  },
];

export interface AdminTopItem {
  id: string;
  name: string;
  image_url: string;
  category: string;
  qty_sold: number;
  revenue: number;
  rating: number;
}

export const mockTopItems: AdminTopItem[] = [
  { id: 'm-bc',  name: 'Butter Chicken',       image_url: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=300', category: 'Main Course', qty_sold: 84, revenue: 28980, rating: 4.9 },
  { id: 'm-cb',  name: 'Chicken Dum Biryani',  image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=300', category: 'Biryani',     qty_sold: 72, revenue: 27360, rating: 4.8 },
  { id: 'm-dm',  name: 'Dal Makhani',          image_url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=300', category: 'Main Course', qty_sold: 61, revenue: 15860, rating: 4.8 },
  { id: 'm-gn',  name: 'Garlic Naan',          image_url: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=300', category: 'Breads',      qty_sold: 132, revenue: 10560, rating: 4.6 },
  { id: 'm-pt',  name: 'Paneer Tikka',         image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=300', category: 'Starters',    qty_sold: 44, revenue: 12320, rating: 4.7 },
];

/** Hourly sales for the last 24 hours, indexed by hour (0..23). */
export const mockHourlySales = [
  { hour: 9,  orders: 4,  sales: 1820 },
  { hour: 10, orders: 6,  sales: 2310 },
  { hour: 11, orders: 9,  sales: 3580 },
  { hour: 12, orders: 18, sales: 7240 },
  { hour: 13, orders: 34, sales: 13620 }, // peak
  { hour: 14, orders: 22, sales: 8480 },
  { hour: 15, orders: 11, sales: 3940 },
  { hour: 16, orders: 8,  sales: 2820 },
  { hour: 17, orders: 6,  sales: 2110 },
  { hour: 18, orders: 9,  sales: 3340 },
  { hour: 19, orders: 16, sales: 6210 },
  { hour: 20, orders: 24, sales: 9420 }, // dinner rush
  { hour: 21, orders: 19, sales: 7180 },
  { hour: 22, orders: 11, sales: 4220 },
];

export interface PaymentSlice {
  method: 'UPI' | 'Card' | 'Wallet' | 'Cash';
  count: number;
  amount: number;
}

export const mockPaymentBreakdown: PaymentSlice[] = [
  { method: 'UPI',    count: 82, amount: 31240 },
  { method: 'Card',   count: 24, amount: 11620 },
  { method: 'Wallet', count: 14, amount:  4180 },
  { method: 'Cash',   count:  7, amount:  1280 },
];

export interface AdminCouponStat {
  code: string;
  description: string;
  redemptions: number;
  discount_given: number;
  is_active: boolean;
}

export const mockCouponStats: AdminCouponStat[] = [
  { code: 'SPICE200', description: 'Flat ₹200 off above ₹500',         redemptions: 18, discount_given: 3600, is_active: true },
  { code: 'FIRST50',  description: 'Flat ₹50 off on first order',      redemptions: 9,  discount_given:  450, is_active: true },
  { code: 'SAVE10',   description: '10% off site-wide',                redemptions: 7,  discount_given:  560, is_active: true },
  { code: 'HAPPY20',  description: '20% off beverages, 4–6 PM',        redemptions: 0,  discount_given:    0, is_active: false },
];

export interface AdminStaff {
  id: string;
  name: string;
  initials: string;
  role: StaffRole;
  phone: string;
  email: string;
  status: 'active' | 'invited' | 'disabled';
  last_active_min: number;
}

export const mockStaff: AdminStaff[] = [
  { id: 's1', name: 'Rajesh Kumar',  initials: 'RK', role: 'owner',   phone: '+91 98201 14523', email: 'rajesh@spicegarden.in', status: 'active', last_active_min: 0 },
  { id: 's2', name: 'Anita Iyer',    initials: 'AI', role: 'manager', phone: '+91 98765 12245', email: 'anita@spicegarden.in',  status: 'active', last_active_min: 6 },
  { id: 's3', name: 'Vikram Singh',  initials: 'VS', role: 'cashier', phone: '+91 90123 88412', email: 'vikram@spicegarden.in', status: 'active', last_active_min: 2 },
  { id: 's4', name: 'Pooja Reddy',   initials: 'PR', role: 'kitchen', phone: '+91 98321 76234', email: '—',                     status: 'active', last_active_min: 14 },
  { id: 's5', name: 'Manish Joshi',  initials: 'MJ', role: 'waiter',  phone: '+91 98000 12200', email: '—',                     status: 'active', last_active_min: 1 },
  { id: 's6', name: 'Riya Bansal',   initials: 'RB', role: 'waiter',  phone: '+91 98123 45678', email: 'riya@spicegarden.in',   status: 'invited', last_active_min: -1 },
  { id: 's7', name: 'Sunil Verma',   initials: 'SV', role: 'kitchen', phone: '+91 99022 33445', email: '—',                     status: 'disabled', last_active_min: 480 },
];

export interface AdminTable {
  id: string;
  label: string;
  qr_token: string;
  covers: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
  last_order_min: number | null;
  active_order_code: string | null;
  total_today: number;
}

export const mockTables: AdminTable[] = Array.from({ length: 16 }).map((_, i) => {
  const num = i + 1;
  const computedStatus: AdminTable['status'] =
    num === 3 || num === 7 || num === 12 || num === 5 ? 'occupied' :
    num === 9 || num === 14 ? 'reserved' :
    num === 4 ? 'cleaning' :
    'available';
  const status = computedStatus;
  return {
    id: `t${num}`,
    label: `Table ${num}`,
    qr_token: `sr-t${num}`,
    covers: num <= 4 ? 2 : num <= 10 ? 4 : 6,
    status,
    last_order_min: status === 'occupied' ? (num * 3) % 20 + 3 : status === 'available' ? null : 25,
    active_order_code: status === 'occupied' ? `FC-5678${10 + num}` : null,
    total_today: Math.floor(800 + (num * 137) % 4200),
  };
});

export type NotificationKind = 'order' | 'payment' | 'kitchen' | 'staff' | 'system';

export interface AdminNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  time_min: number;
  read: boolean;
}

export const mockNotifications: AdminNotification[] = [
  { id: 'n1', kind: 'kitchen', title: 'Kitchen queue backing up', message: '11 orders in queue, 3 added in the last 5 minutes.', time_min: 2, read: false },
  { id: 'n2', kind: 'order',   title: 'New order on Table 12',    message: 'FC-567810 · ₹693 · 2 items', time_min: 2, read: false },
  { id: 'n3', kind: 'payment', title: 'Payment failed',           message: 'FC-567807 · ₹302 UPI payment did not confirm. Customer retrying.', time_min: 4, read: false },
  { id: 'n4', kind: 'kitchen', title: 'KOT-8409 marked Ready',    message: 'Takeaway · Divya Krishnan — please serve.', time_min: 6, read: true },
  { id: 'n5', kind: 'staff',   title: 'Riya Bansal accepted invite', message: 'New waiter joined the team.', time_min: 22, read: true },
  { id: 'n6', kind: 'system',  title: 'Daily report ready',       message: 'Yesterday: ₹42,180 revenue · 109 orders.', time_min: 360, read: true },
];

export interface AdminActivity {
  id: string;
  actor: string;
  initials: string;
  action: string;
  entity: string;
  time_min: number;
}

export const mockActivity: AdminActivity[] = [
  { id: 'a1', actor: 'Vikram Singh', initials: 'VS', action: 'Marked KOT-8411 as Ready', entity: 'KOT-8411',   time_min: 1 },
  { id: 'a2', actor: 'Pooja Reddy',  initials: 'PR', action: 'Started cooking KOT-8412', entity: 'KOT-8412',   time_min: 3 },
  { id: 'a3', actor: 'Anita Iyer',   initials: 'AI', action: 'Disabled HAPPY20 coupon',   entity: 'HAPPY20',    time_min: 14 },
  { id: 'a4', actor: 'Rajesh Kumar', initials: 'RK', action: 'Updated GST to 5%',         entity: 'Settings',   time_min: 25 },
  { id: 'a5', actor: 'Anita Iyer',   initials: 'AI', action: 'Marked Paneer Tikka in stock', entity: 'Paneer Tikka', time_min: 40 },
];

export interface AdminSettingsState {
  // Tax
  gst_percent: number;
  gst_inclusive: boolean;
  // Charges
  service_charge_percent: number;
  packing_charge: number;
  // Ops
  auto_accept_orders: boolean;
  auto_print_kot: boolean;
  reprint_kot_allowed: boolean;
  // Loyalty
  loyalty_earn_rate: number;
  loyalty_max_redeem_percent: number;
  // Hours
  open_at: string;   // "10:30"
  close_at: string;  // "23:00"
  // Razorpay
  razorpay_key_id: string;
  razorpay_secret_set: boolean;
  // Notifications
  notify_new_order_sound: boolean;
  notify_payment_failed: boolean;
}

export const mockSettings: AdminSettingsState = {
  gst_percent: 5,
  gst_inclusive: false,
  service_charge_percent: 0,
  packing_charge: 20,
  auto_accept_orders: true,
  auto_print_kot: true,
  reprint_kot_allowed: true,
  loyalty_earn_rate: 5,
  loyalty_max_redeem_percent: 10,
  open_at: '10:30',
  close_at: '23:00',
  razorpay_key_id: 'rzp_live_kx2t****',
  razorpay_secret_set: true,
  notify_new_order_sound: true,
  notify_payment_failed: true,
};

export interface AdminLoyaltyMember {
  id: string;
  customer_name: string;
  phone: string;
  balance: number;
  lifetime_earned: number;
  lifetime_redeemed: number;
  last_order_days: number;
  tier: 'Silver' | 'Gold' | 'Platinum';
}

export const mockLoyaltyMembers: AdminLoyaltyMember[] = [
  { id: 'l1', customer_name: 'Arjun Sharma',     phone: '+91 98201 24523', balance: 184, lifetime_earned: 940, lifetime_redeemed: 756, last_order_days: 0, tier: 'Gold' },
  { id: 'l2', customer_name: 'Priya Nair',       phone: '+91 98765 88234', balance: 32,  lifetime_earned: 380, lifetime_redeemed: 348, last_order_days: 1, tier: 'Silver' },
  { id: 'l3', customer_name: 'Mohammed Riyaz',   phone: '+91 90212 33445', balance: 256, lifetime_earned: 1240,lifetime_redeemed: 984, last_order_days: 0, tier: 'Platinum' },
  { id: 'l4', customer_name: 'Divya Krishnan',   phone: '+91 99882 12200', balance: 68,  lifetime_earned: 280, lifetime_redeemed: 212, last_order_days: 0, tier: 'Silver' },
  { id: 'l5', customer_name: 'Lakshmi Menon',    phone: '+91 99012 76234', balance: 120, lifetime_earned: 540, lifetime_redeemed: 420, last_order_days: 2, tier: 'Gold' },
  { id: 'l6', customer_name: 'Vikram Patel',     phone: '+91 98301 33212', balance: 24,  lifetime_earned: 188, lifetime_redeemed: 164, last_order_days: 0, tier: 'Silver' },
];

export interface AdminLoyaltyTxn {
  id: string;
  member: string;
  type: LoyaltyTxnType_;
  points: number;
  order_code: string | null;
  time_min: number;
}

type LoyaltyTxnType_ = 'earn' | 'redeem' | 'bonus' | 'expire' | 'refund';

export const mockLoyaltyTxns: AdminLoyaltyTxn[] = [
  { id: 'lt1', member: 'Arjun Sharma',   type: 'earn',   points:  46, order_code: 'FC-567812', time_min: 8 },
  { id: 'lt2', member: 'Mohammed Riyaz', type: 'redeem', points: -50, order_code: 'FC-567810', time_min: 2 },
  { id: 'lt3', member: 'Divya Krishnan', type: 'earn',   points:  24, order_code: 'FC-567809', time_min: 6 },
  { id: 'lt4', member: 'Priya Nair',     type: 'earn',   points:  58, order_code: 'FC-567811', time_min: 12 },
  { id: 'lt5', member: 'Vikram Patel',   type: 'bonus',  points:  30, order_code: null,        time_min: 90 },
  { id: 'lt6', member: 'Anjali Desai',   type: 'expire', points: -12, order_code: null,        time_min: 240 },
];

// ════════════════════════════════════════════════════════════
// Phase B mocks — organizations, branches, payment gateways,
// detailed payments, reservations, customers, platform admins.
// ════════════════════════════════════════════════════════════

import type {
  Organization, PaymentGateway, PaymentProvider, Reservation, ReservationStatus,
  PlatformAdmin, DiningArea, PaymentStatus as PStatus,
} from './types';

// ---- Organizations ----
export const mockOrganizations: Organization[] = [
  {
    id: 'org-1', slug: 'spice-garden-hospitality', name: 'Spice Garden Hospitality',
    logo_url: null, brand_color: '#EA580C', accent_color: '#16A34A',
    contact_email: 'rajesh@spicegarden.in', contact_phone: '+91 98201 14523',
    gst_no: '29ABCDE1234F1Z5', fssai_no: '10024056001234',
    plan: 'growth', commission_percent: 2.5, is_active: true,
    trial_ends_at: null, created_at: new Date(_now - 180 * 86400e3).toISOString(),
  },
  {
    id: 'org-2', slug: 'the-spice-route-co', name: 'The Spice Route Co',
    logo_url: null, brand_color: '#b7122a', accent_color: '#F59E0B',
    contact_email: 'contact@spiceroute.in', contact_phone: '+91 98765 12245',
    gst_no: null, fssai_no: null,
    plan: 'starter', commission_percent: 3.0, is_active: true,
    trial_ends_at: null, created_at: new Date(_now - 45 * 86400e3).toISOString(),
  },
  {
    id: 'org-3', slug: 'curry-leaf-group', name: 'Curry Leaf Group',
    logo_url: null, brand_color: '#0EA5E9', accent_color: '#10B981',
    contact_email: 'ops@curryleaf.in', contact_phone: '+91 90123 88412',
    gst_no: '07PQRST5678U2W3', fssai_no: null,
    plan: 'enterprise', commission_percent: 1.8, is_active: true,
    trial_ends_at: null, created_at: new Date(_now - 365 * 86400e3).toISOString(),
  },
];

// ---- Branches (denormalized as Restaurant-like rows) ----
export interface AdminBranch {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  branch_code: string;
  area_name: string;
  city: string;
  phone: string;
  address: string;
  is_active: boolean;
  orders_today: number;
  revenue_today: number;
  staff_count: number;
  table_count: number;
}

export const mockBranches: AdminBranch[] = [
  // Spice Garden Hospitality
  {
    id: 'br-sg-mg', organization_id: 'org-1', slug: 'spice-garden',
    name: 'Spice Garden — MG Road', branch_code: 'SG-MG',
    area_name: 'MG Road', city: 'Bengaluru', phone: '+91 80 4900 1200',
    address: '221, MG Road, Bengaluru 560001', is_active: true,
    orders_today: 127, revenue_today: 48320, staff_count: 9, table_count: 16,
  },
  {
    id: 'br-sg-kor', organization_id: 'org-1', slug: 'spice-garden-koramangala',
    name: 'Spice Garden — Koramangala', branch_code: 'SG-KOR',
    area_name: 'Koramangala', city: 'Bengaluru', phone: '+91 80 4900 1300',
    address: 'Block 5, 80 Feet Road, Koramangala 560034', is_active: true,
    orders_today: 84, revenue_today: 31180, staff_count: 7, table_count: 14,
  },
  {
    id: 'br-sg-ind', organization_id: 'org-1', slug: 'spice-garden-indiranagar',
    name: 'Spice Garden — Indiranagar', branch_code: 'SG-IND',
    area_name: 'Indiranagar', city: 'Bengaluru', phone: '+91 80 4900 1400',
    address: '100 Feet Road, Indiranagar 560038', is_active: true,
    orders_today: 102, revenue_today: 38940, staff_count: 8, table_count: 12,
  },
  // The Spice Route
  {
    id: 'br-sr', organization_id: 'org-2', slug: 'the-spice-route',
    name: 'The Spice Route', branch_code: 'SR-WTF',
    area_name: 'Whitefield', city: 'Bengaluru', phone: '+91 80 4900 1100',
    address: '24, Whitefield Main Road 560066', is_active: true,
    orders_today: 73, revenue_today: 24820, staff_count: 6, table_count: 12,
  },
  // Curry Leaf Group (multiple cities)
  {
    id: 'br-cl-blr', organization_id: 'org-3', slug: 'curry-leaf-bengaluru',
    name: 'Curry Leaf — Bengaluru', branch_code: 'CL-BLR',
    area_name: 'HSR Layout', city: 'Bengaluru', phone: '+91 80 5500 0001',
    address: 'Sector 1, HSR Layout 560102', is_active: true,
    orders_today: 156, revenue_today: 62410, staff_count: 11, table_count: 22,
  },
  {
    id: 'br-cl-mum', organization_id: 'org-3', slug: 'curry-leaf-mumbai',
    name: 'Curry Leaf — Mumbai', branch_code: 'CL-MUM',
    area_name: 'Bandra', city: 'Mumbai', phone: '+91 22 5500 0002',
    address: 'Linking Road, Bandra West 400050', is_active: true,
    orders_today: 134, revenue_today: 57280, staff_count: 12, table_count: 20,
  },
  {
    id: 'br-cl-del', organization_id: 'org-3', slug: 'curry-leaf-delhi',
    name: 'Curry Leaf — Delhi', branch_code: 'CL-DEL',
    area_name: 'Connaught Place', city: 'New Delhi', phone: '+91 11 5500 0003',
    address: 'CP Block N, Connaught Place 110001', is_active: false,
    orders_today: 0, revenue_today: 0, staff_count: 5, table_count: 16,
  },
];

// ---- Payment gateways (per branch) ----
export const mockPaymentGateways: PaymentGateway[] = [
  { id: 'pg-1', restaurant_id: 'br-sg-mg', provider: 'razorpay', key_id: 'rzp_live_kx2t****', is_active: true,  is_primary: true,  test_mode: false, last_verified_at: new Date(_now - 3 * 86400e3).toISOString() },
  { id: 'pg-2', restaurant_id: 'br-sg-mg', provider: 'stripe',   key_id: 'pk_live_strp****',  is_active: false, is_primary: false, test_mode: false, last_verified_at: null },
  { id: 'pg-3', restaurant_id: 'br-sg-mg', provider: 'phonepe',  key_id: 'PP-MERCH-12345',   is_active: false, is_primary: false, test_mode: true,  last_verified_at: null },
  { id: 'pg-4', restaurant_id: 'br-sg-mg', provider: 'paytm',    key_id: 'PTM-MERCH-67890',  is_active: false, is_primary: false, test_mode: true,  last_verified_at: null },
];

// Platform-wide gateway availability (super admin manages this)
export interface PlatformGatewayConfig {
  provider: PaymentProvider;
  display_name: string;
  is_available: boolean;            // can branches enable it?
  webhook_url: string;
  total_branches_using: number;
  total_volume_today: number;
}

export const mockPlatformGateways: PlatformGatewayConfig[] = [
  { provider: 'razorpay', display_name: 'Razorpay', is_available: true,  webhook_url: 'https://api.foodcourt.app/webhooks/razorpay', total_branches_using: 6, total_volume_today: 168240 },
  { provider: 'stripe',   display_name: 'Stripe',   is_available: true,  webhook_url: 'https://api.foodcourt.app/webhooks/stripe',   total_branches_using: 1, total_volume_today:  12380 },
  { provider: 'phonepe',  display_name: 'PhonePe',  is_available: true,  webhook_url: 'https://api.foodcourt.app/webhooks/phonepe',  total_branches_using: 2, total_volume_today:  18420 },
  { provider: 'paytm',    display_name: 'Paytm',    is_available: false, webhook_url: 'https://api.foodcourt.app/webhooks/paytm',    total_branches_using: 0, total_volume_today: 0 },
  { provider: 'cashfree', display_name: 'Cashfree', is_available: false, webhook_url: 'https://api.foodcourt.app/webhooks/cashfree', total_branches_using: 0, total_volume_today: 0 },
];

// ---- Detailed payments (per attempt) ----
export interface AdminPaymentRow {
  id: string;
  order_code: string;
  provider: PaymentProvider | 'cash';
  gateway_payment_id: string | null;
  amount: number;
  refunded_amount: number;
  method: 'upi' | 'card' | 'wallet' | 'netbanking' | 'cash';
  status: PStatus;
  customer_name: string;
  attempt_no: number;
  failure_reason: string | null;
  time_min: number;
}

export const mockPayments: AdminPaymentRow[] = [
  { id: 'p1', order_code: 'FC-567812', provider: 'razorpay', gateway_payment_id: 'pay_NXkRzpA12abcd',  amount: 925, refunded_amount: 0,  method: 'upi',         status: 'success', customer_name: 'Arjun Sharma',     attempt_no: 1, failure_reason: null,                          time_min: 8 },
  { id: 'p2', order_code: 'FC-567811', provider: 'razorpay', gateway_payment_id: 'pay_NXkRzpB45efgh',  amount: 1176,refunded_amount: 0,  method: 'card',        status: 'success', customer_name: 'Priya Nair',       attempt_no: 1, failure_reason: null,                          time_min: 12 },
  { id: 'p3', order_code: 'FC-567810', provider: 'razorpay', gateway_payment_id: 'pay_NXkRzpC78ijkl',  amount: 693, refunded_amount: 0,  method: 'upi',         status: 'success', customer_name: 'Mohammed Riyaz',   attempt_no: 1, failure_reason: null,                          time_min: 2 },
  { id: 'p4', order_code: 'FC-567809', provider: 'razorpay', gateway_payment_id: 'pay_NXkRzpD90mnop',  amount: 491, refunded_amount: 0,  method: 'upi',         status: 'success', customer_name: 'Divya Krishnan',   attempt_no: 1, failure_reason: null,                          time_min: 6 },
  { id: 'p5', order_code: 'FC-567808', provider: 'razorpay', gateway_payment_id: 'pay_NXkRzpE11qrst',  amount: 609, refunded_amount: 0,  method: 'card',        status: 'success', customer_name: 'Santosh Rao',      attempt_no: 1, failure_reason: null,                          time_min: 11 },
  { id: 'p6', order_code: 'FC-567807', provider: 'razorpay', gateway_payment_id: 'pay_NXkRzpF22uvwx',  amount: 302, refunded_amount: 0,  method: 'upi',         status: 'failed',  customer_name: 'Lakshmi Menon',    attempt_no: 2, failure_reason: 'Bank declined: insufficient funds', time_min: 4 },
  { id: 'p7', order_code: 'FC-567806', provider: 'phonepe',  gateway_payment_id: 'PP-TXN-9931',       amount: 605, refunded_amount: 0,  method: 'wallet',      status: 'success', customer_name: 'Vikram Patel',     attempt_no: 1, failure_reason: null,                          time_min: 15 },
  { id: 'p8', order_code: 'FC-567803', provider: 'razorpay', gateway_payment_id: 'pay_NXkRzpG33yzab',  amount: 294, refunded_amount: 294,method: 'upi',         status: 'refunded',customer_name: 'Kavya Iyer',       attempt_no: 1, failure_reason: 'Customer cancelled — refund issued', time_min: 65 },
  { id: 'p9', order_code: 'FC-567802', provider: 'cash',     gateway_payment_id: null,                amount: 420, refunded_amount: 0,  method: 'cash',        status: 'success', customer_name: 'Walk-in',          attempt_no: 1, failure_reason: null,                          time_min: 80 },
];

// ---- Reservations ----
function _resAt(daysOffset: number, hour: number, min: number): string {
  const d = new Date(_now + daysOffset * 86400e3);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

export const mockReservations: Reservation[] = [
  { id: 'rv1', restaurant_id: 'br-sg-mg', table_id: 't7',  customer_name: 'Aisha Khan',       customer_phone: '+91 98201 11122', customer_email: 'aisha.khan@gmail.com', party_size: 4, reserved_at: _resAt(0, 19, 30), duration_min: 90, status: 'confirmed', notes: 'Anniversary dinner',                          source: 'website',  created_at: new Date(_now - 4 * 3600e3).toISOString() },
  { id: 'rv2', restaurant_id: 'br-sg-mg', table_id: 't3',  customer_name: 'Karthik Reddy',    customer_phone: '+91 98765 22334', customer_email: null,                  party_size: 2, reserved_at: _resAt(0, 20, 0),  duration_min: 75, status: 'confirmed', notes: null,                                          source: 'phone',    created_at: new Date(_now - 6 * 3600e3).toISOString() },
  { id: 'rv3', restaurant_id: 'br-sg-mg', table_id: 't12', customer_name: 'Neha Bhatt',       customer_phone: '+91 98300 88990', customer_email: 'neha@example.com',    party_size: 6, reserved_at: _resAt(0, 20, 30), duration_min: 120,status: 'pending',   notes: 'Vegetarian only',                              source: 'website',  created_at: new Date(_now - 1 * 3600e3).toISOString() },
  { id: 'rv4', restaurant_id: 'br-sg-mg', table_id: null,  customer_name: 'Mehul Shah',       customer_phone: '+91 98123 44556', customer_email: null,                  party_size: 3, reserved_at: _resAt(1, 13, 0),  duration_min: 90, status: 'confirmed', notes: 'Birthday',                                    source: 'phone',    created_at: new Date(_now - 22 * 3600e3).toISOString() },
  { id: 'rv5', restaurant_id: 'br-sg-mg', table_id: 't5',  customer_name: 'Pooja Reddy',      customer_phone: '+91 98321 76234', customer_email: null,                  party_size: 2, reserved_at: _resAt(-1, 19, 30),duration_min: 90, status: 'completed', notes: null,                                          source: 'walk_in',  created_at: new Date(_now - 26 * 3600e3).toISOString() },
  { id: 'rv6', restaurant_id: 'br-sg-mg', table_id: 't9',  customer_name: 'Sameer Verma',     customer_phone: '+91 98990 12345', customer_email: null,                  party_size: 4, reserved_at: _resAt(-1, 20, 0), duration_min: 90, status: 'no_show',   notes: null,                                          source: 'website',  created_at: new Date(_now - 30 * 3600e3).toISOString() },
  { id: 'rv7', restaurant_id: 'br-sg-mg', table_id: null,  customer_name: 'Ramya Iyer',       customer_phone: '+91 98765 99887', customer_email: 'ramya@example.in',    party_size: 8, reserved_at: _resAt(2, 19, 0),  duration_min: 150,status: 'confirmed', notes: 'Private Dining Room',                         source: 'phone',    created_at: new Date(_now - 12 * 3600e3).toISOString() },
];

// ---- Customers (denormalized view for admin) ----
export interface AdminCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  initials: string;
  total_orders: number;
  total_spent: number;
  last_order_min: number;
  tags: string[];                 // 'vip','regular','new','complainer'
  loyalty_balance: number;
  loyalty_tier: 'Silver' | 'Gold' | 'Platinum';
}

export const mockCustomers: AdminCustomer[] = [
  { id: 'cu1', name: 'Arjun Sharma',     phone: '+91 98201 24523', email: 'arjun@gmail.com',          initials: 'AS', total_orders: 47, total_spent: 28940, last_order_min:   8, tags: ['vip','regular'],  loyalty_balance: 184, loyalty_tier: 'Gold' },
  { id: 'cu2', name: 'Priya Nair',       phone: '+91 98765 88234', email: 'priya@example.com',        initials: 'PN', total_orders: 12, total_spent:  7280, last_order_min:  12, tags: ['regular'],         loyalty_balance:  32, loyalty_tier: 'Silver' },
  { id: 'cu3', name: 'Mohammed Riyaz',   phone: '+91 90212 33445', email: 'm.riyaz@example.in',       initials: 'MR', total_orders: 84, total_spent: 56120, last_order_min:   2, tags: ['vip'],             loyalty_balance: 256, loyalty_tier: 'Platinum' },
  { id: 'cu4', name: 'Divya Krishnan',   phone: '+91 99882 12200', email: null,                       initials: 'DK', total_orders:  6, total_spent:  3420, last_order_min:   6, tags: ['new'],             loyalty_balance:  68, loyalty_tier: 'Silver' },
  { id: 'cu5', name: 'Lakshmi Menon',    phone: '+91 99012 76234', email: 'lakshmi@example.in',       initials: 'LM', total_orders: 23, total_spent: 14280, last_order_min:   4, tags: ['regular'],         loyalty_balance: 120, loyalty_tier: 'Gold' },
  { id: 'cu6', name: 'Vikram Patel',     phone: '+91 98301 33212', email: null,                       initials: 'VP', total_orders:  4, total_spent:  1890, last_order_min:  15, tags: ['new'],             loyalty_balance:  24, loyalty_tier: 'Silver' },
  { id: 'cu7', name: 'Aisha Khan',       phone: '+91 98201 11122', email: 'aisha.khan@gmail.com',     initials: 'AK', total_orders: 31, total_spent: 19420, last_order_min: 720, tags: ['regular','vip'],   loyalty_balance: 142, loyalty_tier: 'Gold' },
  { id: 'cu8', name: 'Karthik Reddy',    phone: '+91 98765 22334', email: null,                       initials: 'KR', total_orders:  9, total_spent:  4680, last_order_min:1440, tags: ['regular'],         loyalty_balance:  44, loyalty_tier: 'Silver' },
  { id: 'cu9', name: 'Kavya Iyer',       phone: '+91 98432 11221', email: 'kavya@example.in',         initials: 'KI', total_orders:  2, total_spent:   620, last_order_min:  65, tags: ['complainer'],      loyalty_balance:   0, loyalty_tier: 'Silver' },
];

// ---- Areas ----
export const mockAreas: DiningArea[] = [
  { id: 'a-main',  restaurant_id: 'br-sg-mg', name: 'Main Hall',      sort_order: 1 },
  { id: 'a-patio', restaurant_id: 'br-sg-mg', name: 'Patio',          sort_order: 2 },
  { id: 'a-pdr',   restaurant_id: 'br-sg-mg', name: 'Private Dining', sort_order: 3 },
];

// ---- Platform admins ----
export const mockPlatformAdmins: PlatformAdmin[] = [
  { user_id: 'pa-1', role: 'super_admin', display_name: 'Ananya Krishnamurthy' },
  { user_id: 'pa-2', role: 'support',     display_name: 'Rohit Bansal' },
  { user_id: 'pa-3', role: 'finance',     display_name: 'Meera Nadkarni' },
];

// ---- Super admin platform metrics ----
export const mockPlatformMetrics = {
  total_orgs: 3,
  total_branches: 7,
  active_branches: 6,
  total_orders_today: 676,
  total_revenue_today: 262950,
  total_commission_today: 6420,
  failed_payments_today: 4,
  new_signups_week: 2,
  avg_order_value: 389,
  uptime_pct: 99.97,
};

// ---- Reservation status palette (re-exported) ----
export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: 'Pending', confirmed: 'Confirmed', seated: 'Seated',
  completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show',
};


