// Supabase queries for the admin app.
// Every admin page reads/writes through this module — no mock fork.

import { getSupabase } from '@foodcourt/shared';
import type {
  CouponType, FoodType, KotStatus, KotTicket, PaymentProvider, ReservationStatus, StaffRole,
} from '@foodcourt/shared';

const env = {
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
};

export const supabase = getSupabase(env);

if (!supabase) {
  // eslint-disable-next-line no-console
  console.error('Supabase env missing — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

function client() {
  if (!supabase) throw new Error('Supabase client not configured');
  return supabase;
}

// ────────────────────────────────────────────────────────────
// Orgs + branches (tenant switcher)
// ────────────────────────────────────────────────────────────

export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  brand_color: string;
  plan: 'starter' | 'growth' | 'enterprise';
  commission_percent: number;
  flat_platform_fee?: number;
  is_active: boolean;
  contact_phone: string | null;
  contact_email?: string | null;
  logo_url?: string | null;
  created_at?: string;
}

export interface BranchRow {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  branch_code: string | null;
  area_name: string | null;
  city: string | null;
  phone: string | null;
  is_open: boolean;
  address?: string | null;
  qr_mode?: 'per_table' | 'single';
}

export async function listOrganizations(): Promise<OrgRow[]> {
  const { data, error } = await client()
    .from('organizations')
    .select('id, slug, name, brand_color, plan, commission_percent, is_active, contact_phone, contact_email, logo_url, created_at')
    .order('name');
  if (error) throw error;
  return (data ?? []) as OrgRow[];
}

export async function createOrganization(input: {
  slug: string; name: string; contact_phone?: string;
  plan?: OrgRow['plan']; commission_percent?: number; brand_color?: string;
}): Promise<OrgRow> {
  const { data, error } = await client()
    .from('organizations')
    .insert({
      slug: input.slug,
      name: input.name,
      contact_phone: input.contact_phone ?? null,
      plan: input.plan ?? 'starter',
      commission_percent: input.commission_percent ?? 2.5,
      brand_color: input.brand_color ?? '#EA580C',
      is_active: true,
    })
    .select('id, slug, name, brand_color, plan, commission_percent, is_active, contact_phone, contact_email, logo_url, created_at')
    .single();
  if (error) throw error;
  return data as OrgRow;
}

export async function updateOrganization(id: string, patch: Partial<OrgRow>) {
  const { error } = await client().from('organizations').update(patch).eq('id', id);
  if (error) throw error;
}

export async function listBranches(orgId?: string): Promise<BranchRow[]> {
  const fullSelect = 'id, organization_id, slug, name, branch_code, area_name, city, phone, is_open, address, qr_mode';
  const legacySelect = 'id, organization_id, slug, name, branch_code, area_name, city, phone, is_open, address';

  const run = async (sel: string) => {
    let q = client().from('restaurants').select(sel).order('name');
    if (orgId) q = q.eq('organization_id', orgId);
    return q;
  };

  let { data, error } = await run(fullSelect) as any;
  if (error && /column .*qr_mode/i.test(error.message ?? '')) {
    ({ data, error } = await run(legacySelect) as any);
  }
  if (error) throw error;
  return (data ?? []) as BranchRow[];
}

export async function createBranch(input: {
  organization_id: string;
  slug: string;
  name: string;
  branch_code?: string;
  area_name?: string;
  city?: string;
  phone?: string;
  address?: string;
  hero_images?: string[];     // 0–5 image URLs for the customer hero carousel
  qr_mode?: 'per_table' | 'single';   // QR strategy — see add_restaurant_qr_mode.sql
}): Promise<BranchRow> {
  // Take the first non-empty image as the legacy `hero_image` so older
  // single-image code paths keep working. Cap the array at 5.
  const cleanImages = (input.hero_images ?? []).map(s => s.trim()).filter(Boolean).slice(0, 5);
  const heroImage = cleanImages[0] ?? null;

  const payload: any = {
    organization_id: input.organization_id,
    slug: input.slug,
    name: input.name,
    branch_code: input.branch_code ?? null,
    area_name: input.area_name ?? null,
    city: input.city ?? 'Bengaluru',
    phone: input.phone ?? null,
    address: input.address ?? null,
    hero_image: heroImage,
    hero_images: cleanImages,
    is_open: true,
  };
  if (input.qr_mode) payload.qr_mode = input.qr_mode;

  // Try insert with qr_mode; if the column isn't migrated yet, retry without.
  let { data, error } = await client()
    .from('restaurants')
    .insert(payload)
    .select('id, organization_id, slug, name, branch_code, area_name, city, phone, is_open, address, qr_mode')
    .single() as any;

  if (error && /column .*qr_mode/i.test(error.message ?? '')) {
    delete payload.qr_mode;
    ({ data, error } = await client()
      .from('restaurants')
      .insert(payload)
      .select('id, organization_id, slug, name, branch_code, area_name, city, phone, is_open, address')
      .single() as any);
  }
  if (error) throw error;
  return data as BranchRow;
}

/** Switch a branch's QR mode after creation. */
export async function setBranchQrMode(branchId: string, mode: 'per_table' | 'single') {
  const { error } = await client().from('restaurants').update({ qr_mode: mode }).eq('id', branchId);
  if (error) throw error;
}

export async function updateBranch(id: string, patch: Partial<BranchRow & { settings: any }>) {
  const { error } = await client().from('restaurants').update(patch).eq('id', id);
  if (error) throw error;
}

/**
 * Hard-delete a branch (restaurant row). Cascades — the DB drops dependent
 * rows (menu items, orders, kot tickets, payments) via the FK on delete
 * cascade clauses set up in 0001_initial_schema.sql.
 *
 * ⚠️  Destructive. The caller MUST confirm with the user first; this is
 * what the super-admin "Delete branch" button calls under the hood.
 */
export async function deleteBranch(id: string): Promise<void> {
  const { error } = await client().from('restaurants').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Hard-delete an organization. Cascades through every branch in the org,
 * which then cascades through orders / menu items / etc.
 *
 * ⚠️  Extremely destructive — wipes the entire tenant. Always confirm
 * before calling.
 */
export async function deleteOrganization(id: string): Promise<void> {
  const { error } = await client().from('organizations').delete().eq('id', id);
  if (error) throw error;
}

export async function getBranchSettings(id: string): Promise<{ settings: any; restaurant: any } | null> {
  const { data, error } = await client()
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { settings: data.settings, restaurant: data };
}

// ────────────────────────────────────────────────────────────
// Orders — list, filter, realtime, status mutations
// ────────────────────────────────────────────────────────────

export interface AdminOrder {
  id: string;
  code: string;
  restaurant_id: string;
  type: 'dine_in' | 'takeaway' | 'delivery';
  status: 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  table_id: string | null;
  table_label: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  discount: number;
  total: number;
  payment_status: string;
  customer_notes: string | null;
  created_at: string;
  age_minutes: number;
  items: Array<{ id: string; name: string; qty: number; variant: string | null; notes: string | null }>;
  item_count: number;
}

interface ListOrdersOpts {
  restaurantIds?: string[];
  limit?: number;
  status?: 'active' | 'all' | 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  customerId?: string;
}

export async function listOrders(opts: ListOrdersOpts = {}): Promise<AdminOrder[]> {
  const c = client();
  let q = c
    .from('orders')
    .select(`
      id, code, restaurant_id, type, status, table_id, customer_id,
      subtotal, discount, total, payment_status, customer_notes, created_at,
      table:dining_tables(label),
      customer:customers(name, phone),
      items:order_items(id, item_name, variant_name, qty, notes)
    `)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.restaurantIds?.length) q = q.in('restaurant_id', opts.restaurantIds);
  if (opts.status === 'active') q = q.not('status', 'in', '(completed,cancelled)');
  else if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status);
  if (opts.customerId) q = q.eq('customer_id', opts.customerId);

  const { data, error } = await q;
  if (error) throw error;

  const now = Date.now();
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    restaurant_id: r.restaurant_id,
    type: r.type,
    status: r.status,
    table_id: r.table_id,
    table_label: r.table?.label ?? null,
    customer_id: r.customer_id,
    customer_name: r.customer?.name ?? null,
    customer_phone: r.customer?.phone ?? null,
    subtotal: Number(r.subtotal),
    discount: Number(r.discount),
    total: Number(r.total),
    payment_status: r.payment_status,
    customer_notes: r.customer_notes,
    created_at: r.created_at,
    age_minutes: Math.max(0, Math.floor((now - new Date(r.created_at).getTime()) / 60000)),
    items: (r.items ?? []).map((it: any) => ({
      id: it.id,
      name: it.item_name,
      qty: it.qty,
      variant: it.variant_name,
      notes: it.notes,
    })),
    item_count: (r.items ?? []).reduce((s: number, it: any) => s + it.qty, 0),
  }));
}

export async function updateOrderStatus(id: string, status: AdminOrder['status']) {
  const { error } = await client().from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function cancelOrder(id: string) {
  const { error } = await client()
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
}

export function subscribeToOrders(
  restaurantIds: string[],
  onChange: (event: { type: 'insert' | 'update'; row: { id: string; restaurant_id: string } }) => void,
) {
  const c = client();
  const channel = c
    .channel('admin-orders')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      (payload) => {
        const row = payload.new as any;
        if (!restaurantIds.length || restaurantIds.includes(row.restaurant_id)) {
          onChange({ type: 'insert', row });
        }
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        const row = payload.new as any;
        if (!restaurantIds.length || restaurantIds.includes(row.restaurant_id)) {
          onChange({ type: 'update', row });
        }
      },
    )
    .subscribe();
  return () => { c.removeChannel(channel); };
}

// ────────────────────────────────────────────────────────────
// Dashboard metrics — aggregated from orders
// ────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  revenue_today: number;
  orders_today: number;
  avg_order_value: number;
  active_kitchen: number;
  failed_payments: number;
  hourly: Array<{ hour: number; orders: number; sales: number }>;
  by_method: Array<{ method: string; count: number; amount: number }>;
}

export async function getDashboardMetrics(restaurantIds: string[]): Promise<DashboardMetrics> {
  const c = client();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  let q = c
    .from('orders')
    .select('total, status, payment_status, created_at')
    .gte('created_at', todayStart.toISOString());
  if (restaurantIds.length) q = q.in('restaurant_id', restaurantIds);

  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];

  const revenue = rows
    .filter((r: any) => r.status !== 'cancelled')
    .reduce((s: number, r: any) => s + Number(r.total), 0);
  const orders = rows.filter((r: any) => r.status !== 'cancelled').length;
  const active = rows.filter((r: any) => !['completed', 'cancelled'].includes(r.status)).length;
  const failed = rows.filter((r: any) => r.payment_status === 'failed').length;

  const hourly: DashboardMetrics['hourly'] = [];
  for (let h = 0; h < 24; h++) hourly.push({ hour: h, orders: 0, sales: 0 });
  rows.forEach((r: any) => {
    if (r.status === 'cancelled') return;
    const h = new Date(r.created_at).getHours();
    hourly[h].orders += 1;
    hourly[h].sales += Number(r.total);
  });

  return {
    revenue_today: Math.round(revenue),
    orders_today: orders,
    avg_order_value: orders === 0 ? 0 : Math.round(revenue / orders),
    active_kitchen: active,
    failed_payments: failed,
    hourly,
    by_method: [],
  };
}

// ────────────────────────────────────────────────────────────
// Menu — categories + items + variants/modifiers CRUD
// ────────────────────────────────────────────────────────────

export interface CategoryRow {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
}

export async function listCategories(restaurantId: string): Promise<CategoryRow[]> {
  const { data, error } = await client()
    .from('categories')
    .select('id, restaurant_id, name, sort_order')
    .eq('restaurant_id', restaurantId)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as CategoryRow[];
}

export async function createCategory(restaurantId: string, name: string): Promise<CategoryRow> {
  const { data: existing } = await client()
    .from('categories')
    .select('sort_order')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((existing?.sort_order as number | undefined) ?? 0) + 1;

  const { data, error } = await client()
    .from('categories')
    .insert({ restaurant_id: restaurantId, name, sort_order: nextOrder })
    .select('id, restaurant_id, name, sort_order')
    .single();
  if (error) throw error;
  return data as CategoryRow;
}

/**
 * Bulk-create categories. Returns { created, skipped } where `created` are
 * the new rows and `skipped` are names that already exist (case-insensitive
 * match against the current category list).
 *
 * Names are trimmed and de-duplicated before insert. The bulk insert is done
 * in one round-trip instead of N — much faster for big paste-jobs.
 */
export async function createCategoriesBulk(
  restaurantId: string,
  names: string[],
): Promise<{ created: CategoryRow[]; skipped: string[] }> {
  const c = client();

  // 1. Fetch current categories so we can dedupe and continue sort_order from the max.
  const { data: existing, error: listErr } = await c
    .from('categories')
    .select('name, sort_order')
    .eq('restaurant_id', restaurantId);
  if (listErr) throw listErr;

  const existingLower = new Set<string>(
    (existing ?? []).map((r: any) => (r.name as string).trim().toLowerCase()),
  );
  const maxOrder = (existing ?? []).reduce(
    (acc: number, r: any) => Math.max(acc, Number(r.sort_order ?? 0)),
    0,
  );

  // 2. Clean + dedupe input.
  const seen = new Set<string>();
  const skipped: string[] = [];
  const toInsert: Array<{ restaurant_id: string; name: string; sort_order: number }> = [];

  names.forEach((raw, i) => {
    const name = (raw ?? '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key) || existingLower.has(key)) { skipped.push(name); return; }
    seen.add(key);
    toInsert.push({ restaurant_id: restaurantId, name, sort_order: maxOrder + 1 + i });
  });

  if (!toInsert.length) return { created: [], skipped };

  const { data, error } = await c
    .from('categories')
    .insert(toInsert)
    .select('id, restaurant_id, name, sort_order');
  if (error) throw error;
  return { created: (data ?? []) as CategoryRow[], skipped };
}

export interface MenuItemRow {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: number;
  parcel_charge?: number;       // per-unit packing fee on TAKEAWAY
  delivery_charge?: number;     // per-unit delivery fee on DELIVERY
  food_type: FoodType;
  rating: number;
  rating_count: number;
  is_bestseller: boolean;
  is_recommended: boolean;
  is_combo?: boolean;           // marks this row as a combo / value deal
  combo_items?: Array<{ menu_item_id: string; quantity: number }>;
  in_stock: boolean;
  sort_order: number;
  category_name?: string;
}

export async function listMenuItems(restaurantId: string): Promise<MenuItemRow[]> {
  // Try the richest select first; fall back progressively if either of the
  // optional charge columns hasn't been migrated yet.
  // is_combo is appended to each select string. If the column is missing
  // the fallback below catches it via the same column-error sniffer.
  const fullSelect = 'id, restaurant_id, category_id, name, description, image_url, base_price, parcel_charge, delivery_charge, food_type, rating, rating_count, is_bestseller, is_recommended, is_combo, combo_items, in_stock, sort_order, categories(name)';
  const noComboItemsSelect = 'id, restaurant_id, category_id, name, description, image_url, base_price, parcel_charge, delivery_charge, food_type, rating, rating_count, is_bestseller, is_recommended, is_combo, in_stock, sort_order, categories(name)';
  const parcelOnlySelect = 'id, restaurant_id, category_id, name, description, image_url, base_price, parcel_charge, food_type, rating, rating_count, is_bestseller, is_recommended, is_combo, in_stock, sort_order, categories(name)';
  const minimalSelect = 'id, restaurant_id, category_id, name, description, image_url, base_price, food_type, rating, rating_count, is_bestseller, is_recommended, in_stock, sort_order, categories(name)';

  // Cast both `data` and `error` to `any` because each fallback SELECT
  // returns a different inferred shape; TS would otherwise complain.
  let data: any = null;
  let error: any = null;
  ({ data, error } = await client()
    .from('menu_items')
    .select(fullSelect)
    .eq('restaurant_id', restaurantId)
    .order('sort_order'));

  if (error && /column .*combo_items/i.test(error.message ?? '')) {
    ({ data, error } = await client()
      .from('menu_items')
      .select(noComboItemsSelect)
      .eq('restaurant_id', restaurantId)
      .order('sort_order'));
  }
  if (error && /column .*(delivery_charge|is_combo)/i.test(error.message ?? '')) {
    ({ data, error } = await client()
      .from('menu_items')
      .select(parcelOnlySelect)
      .eq('restaurant_id', restaurantId)
      .order('sort_order'));
  }
  if (error && /column .*(parcel_charge|is_combo)/i.test(error.message ?? '')) {
    ({ data, error } = await client()
      .from('menu_items')
      .select(minimalSelect)
      .eq('restaurant_id', restaurantId)
      .order('sort_order'));
  }
  if (error) throw error;
  return ((data ?? []) as any[]).map(mapRow);
}

function mapRow(r: any): MenuItemRow {
  return {
    id: r.id,
    restaurant_id: r.restaurant_id,
    category_id: r.category_id,
    name: r.name,
    description: r.description,
    image_url: r.image_url,
    base_price: Number(r.base_price),
    parcel_charge:   r.parcel_charge   != null ? Number(r.parcel_charge)   : 0,
    delivery_charge: r.delivery_charge != null ? Number(r.delivery_charge) : 0,
    food_type: r.food_type,
    rating: Number(r.rating ?? 0),
    rating_count: r.rating_count ?? 0,
    is_bestseller: !!r.is_bestseller,
    is_recommended: !!r.is_recommended,
    is_combo: !!r.is_combo,
    combo_items: Array.isArray(r.combo_items) ? r.combo_items : [],
    in_stock: r.in_stock !== false,
    sort_order: r.sort_order ?? 0,
    category_name: r.categories?.name ?? undefined,
  };
}

/**
 * Extra fields that can be set when an item is imported from the Nakshatra-style
 * template. They map onto optional columns added by `add_menu_template_columns.sql`.
 *
 * Existing single-item creates from the in-app drawer keep working — these are
 * all optional and the DB has sensible defaults / null acceptance.
 */
export interface MenuItemExtras {
  strike_price?: number | null;     // MRP shown with strikethrough on cards
  parcel_charge?: number | null;    // per-unit packing fee on TAKEAWAY
  delivery_charge?: number | null;  // per-unit delivery fee on DELIVERY
  meal_time?: string | null;        // 'breakfast' | 'lunch' | 'dinner' | 'all_day' | free text
  tags?: string[];                  // ['best-seller', 'recommended', 'chef-special', ...]
  rating?: number;                  // free-form imported rating (0-5)
}

export async function createMenuItem(
  input: Omit<MenuItemRow, 'id' | 'rating' | 'rating_count' | 'category_name'>,
  extras: MenuItemExtras = {},
): Promise<MenuItemRow> {
  const payload: any = {
    restaurant_id: input.restaurant_id,
    category_id: input.category_id,
    name: input.name,
    description: input.description,
    image_url: input.image_url,
    base_price: input.base_price,
    food_type: input.food_type,
    is_bestseller: input.is_bestseller,
    is_recommended: input.is_recommended,
    in_stock: input.in_stock,
    sort_order: input.sort_order,
  };
  if (input.is_combo !== undefined) payload.is_combo = input.is_combo;
  if (extras.strike_price    !== undefined) payload.strike_price    = extras.strike_price;
  if (extras.parcel_charge   !== undefined) payload.parcel_charge   = extras.parcel_charge;
  if (extras.delivery_charge !== undefined) payload.delivery_charge = extras.delivery_charge;
  if (extras.meal_time     !== undefined) payload.meal_time     = extras.meal_time;
  if (extras.tags          !== undefined) payload.tags          = extras.tags;
  if (extras.rating        !== undefined) payload.rating        = extras.rating;

  const { data, error } = await client()
    .from('menu_items')
    .insert(payload)
    .select('id, restaurant_id, category_id, name, description, image_url, base_price, food_type, rating, rating_count, is_bestseller, is_recommended, in_stock, sort_order')
    .single();
  if (error) throw error;
  return data as MenuItemRow;
}

/**
 * Bulk-insert variants for a menu item (e.g. half / full sizes from the
 * import template). Empty / 0-price entries are filtered out.
 */
export async function createMenuVariants(
  menuItemId: string,
  variants: Array<{ name: string; price: number }>,
) {
  const clean = variants.filter(v => v.name?.trim() && v.price > 0);
  if (!clean.length) return;
  const { error } = await client()
    .from('menu_variants')
    .insert(clean.map(v => ({ menu_item_id: menuItemId, name: v.name.trim(), price: v.price })));
  if (error) throw error;
}

/**
 * Bulk-insert modifiers (add-ons) for a menu item. `group_name` defaults
 * to 'Add-ons' which is the most common group label.
 */
export async function createMenuModifiers(
  menuItemId: string,
  modifiers: Array<{ name: string; price: number; group_name?: string }>,
) {
  const clean = modifiers.filter(m => m.name?.trim());
  if (!clean.length) return;
  const { error } = await client()
    .from('menu_modifiers')
    .insert(clean.map(m => ({
      menu_item_id: menuItemId,
      group_name: m.group_name?.trim() || 'Add-ons',
      name: m.name.trim(),
      price: m.price,
    })));
  if (error) throw error;
}

export async function updateMenuItem(id: string, patch: Partial<MenuItemRow>) {
  const { category_name: _cn, ...rest } = patch as any;
  void _cn;
  const { error } = await client().from('menu_items').update(rest).eq('id', id);
  if (error) throw error;
}

export async function deleteMenuItem(id: string) {
  const { error } = await client().from('menu_items').delete().eq('id', id);
  if (error) throw error;
}

export async function setMenuItemInStock(id: string, in_stock: boolean) {
  const { error } = await client().from('menu_items').update({ in_stock }).eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Upsell targets — per-item add-on suggestions
// ────────────────────────────────────────────────────────────

export interface UpsellTargetRow {
  id: string;
  restaurant_id: string;
  trigger_item_id: string;
  suggested_item_id: string;
  prompt_text: string | null;
  sort_order: number;
  is_active: boolean;
}

export async function listUpsellTargets(triggerItemId: string): Promise<UpsellTargetRow[]> {
  const { data, error } = await client()
    .from('upsell_targets')
    .select('*')
    .eq('trigger_item_id', triggerItemId)
    .order('sort_order');
  if (error) {
    // Table may not exist yet (migration not run). Treat as empty.
    if (/relation .*upsell_targets.*does not exist/i.test(error.message ?? '')) return [];
    throw error;
  }
  return (data ?? []) as UpsellTargetRow[];
}

export async function createUpsellTarget(input: {
  restaurant_id: string;
  trigger_item_id: string;
  suggested_item_id: string;
  prompt_text?: string;
  sort_order?: number;
}): Promise<UpsellTargetRow> {
  const { data, error } = await client()
    .from('upsell_targets')
    .insert({ ...input, is_active: true })
    .select('*')
    .single();
  if (error) throw error;
  return data as UpsellTargetRow;
}

export async function deleteUpsellTarget(id: string) {
  const { error } = await client().from('upsell_targets').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Upload a food photo from the device. Stored in the `menu-images` bucket
 * (public read) so the customer app can render it directly. Returns the
 * public URL — caller writes it to menu_items.image_url.
 *
 * Requires the storage bucket + policies from `add_menu_images_bucket.sql`.
 */
export async function uploadMenuImage(restaurantId: string, file: File): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error('Please choose an image file.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB.');

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${restaurantId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const c = client();
  const { error } = await c.storage
    .from('menu-images')
    .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
  if (error) throw error;
  const { data } = c.storage.from('menu-images').getPublicUrl(path);
  return data.publicUrl;
}

// ────────────────────────────────────────────────────────────
// Combos — a combo is a menu_items row with is_combo=true and a
// combo_items jsonb array pointing at its constituent items.
// ────────────────────────────────────────────────────────────

export interface ComboInput {
  restaurant_id: string;
  category_id: string;          // any category — combos appear under their own filter on customer
  name: string;
  description?: string | null;
  image_url?: string | null;
  base_price: number;           // combo bundle price (usually less than sum of parts)
  food_type: FoodType;
  in_stock?: boolean;
  items: Array<{ menu_item_id: string; quantity: number }>;
}

export async function createCombo(input: ComboInput): Promise<MenuItemRow> {
  const items = input.items.filter(i => i.menu_item_id && i.quantity > 0);
  if (items.length < 2) throw new Error('A combo needs at least 2 items.');

  const { data, error } = await client()
    .from('menu_items')
    .insert({
      restaurant_id: input.restaurant_id,
      category_id: input.category_id,
      name: input.name,
      description: input.description ?? null,
      image_url: input.image_url ?? null,
      base_price: input.base_price,
      food_type: input.food_type,
      is_bestseller: false,
      is_recommended: false,
      is_combo: true,
      combo_items: items,
      in_stock: input.in_stock ?? true,
      sort_order: 0,
    })
    .select('id, restaurant_id, category_id, name, description, image_url, base_price, food_type, rating, rating_count, is_bestseller, is_recommended, is_combo, combo_items, in_stock, sort_order')
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateCombo(id: string, patch: {
  name?: string;
  description?: string | null;
  image_url?: string | null;
  base_price?: number;
  category_id?: string;
  in_stock?: boolean;
  items?: Array<{ menu_item_id: string; quantity: number }>;
}) {
  const payload: any = {};
  if (patch.name !== undefined)        payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.image_url !== undefined)   payload.image_url = patch.image_url;
  if (patch.base_price !== undefined)  payload.base_price = patch.base_price;
  if (patch.category_id !== undefined) payload.category_id = patch.category_id;
  if (patch.in_stock !== undefined)    payload.in_stock = patch.in_stock;
  if (patch.items !== undefined) {
    const clean = patch.items.filter(i => i.menu_item_id && i.quantity > 0);
    if (clean.length < 2) throw new Error('A combo needs at least 2 items.');
    payload.combo_items = clean;
  }

  const { error } = await client().from('menu_items').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteCombo(id: string) {
  // Same delete path as a regular menu item — the FK cascade migration covers it.
  const { error } = await client().from('menu_items').delete().eq('id', id);
  if (error) throw error;
}

export async function listCombos(restaurantId: string): Promise<MenuItemRow[]> {
  const all = await listMenuItems(restaurantId);
  return all.filter(i => i.is_combo);
}

// ────────────────────────────────────────────────────────────
// Coupons — CRUD with usage stats
// ────────────────────────────────────────────────────────────

export interface CouponRow {
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
  usage_limit: number | null;
  per_user_limit: number | null;   // null = unlimited per customer
  used_count: number;
  is_active: boolean;
}

export async function listCoupons(restaurantIds: string[]): Promise<CouponRow[]> {
  // per_user_limit is optional — fall back to the older select if the column
  // hasn't been migrated yet so this page still loads.
  const fullSelect = 'id, restaurant_id, code, description, type, value, min_order_value, max_discount, valid_from, valid_to, usage_limit, per_user_limit, used_count, is_active';
  const legacySelect = 'id, restaurant_id, code, description, type, value, min_order_value, max_discount, valid_from, valid_to, usage_limit, used_count, is_active';

  const run = async (sel: string) => {
    let q = client().from('coupons').select(sel).order('created_at', { ascending: false });
    if (restaurantIds.length) q = q.in('restaurant_id', restaurantIds);
    return q;
  };

  let { data, error } = await run(fullSelect) as any;
  if (error && /column .*per_user_limit/i.test(error.message ?? '')) {
    ({ data, error } = await run(legacySelect) as any);
  }
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    ...c,
    value: c.value === null ? null : Number(c.value),
    min_order_value: Number(c.min_order_value ?? 0),
    max_discount: c.max_discount === null ? null : Number(c.max_discount),
    per_user_limit: c.per_user_limit ?? null,
    used_count: c.used_count ?? 0,
  })) as CouponRow[];
}

/**
 * For each coupon id, returns total redemptions and unique customer count
 * (derived from non-cancelled orders). Used by the admin Offers page to show
 * "5 redemptions by 3 unique users" alongside the per-user limit setting.
 */
export async function getCouponRedemptionStats(
  couponIds: string[],
): Promise<Map<string, { redemptions: number; uniqueUsers: number }>> {
  const out = new Map<string, { redemptions: number; uniqueUsers: number }>();
  if (!couponIds.length) return out;
  const { data, error } = await client()
    .from('orders')
    .select('coupon_id, customer_id, status')
    .in('coupon_id', couponIds);
  if (error) throw error;

  const acc = new Map<string, { redemptions: number; users: Set<string> }>();
  (data ?? []).forEach((r: any) => {
    if (!r.coupon_id || r.status === 'cancelled') return;
    const cur = acc.get(r.coupon_id) ?? { redemptions: 0, users: new Set<string>() };
    cur.redemptions++;
    if (r.customer_id) cur.users.add(r.customer_id);
    acc.set(r.coupon_id, cur);
  });
  acc.forEach((v, k) => out.set(k, { redemptions: v.redemptions, uniqueUsers: v.users.size }));
  return out;
}

export async function createCoupon(input: {
  restaurant_id: string;
  code: string;
  description: string;
  type: CouponType;
  value: number | null;
  min_order_value?: number;
  max_discount?: number | null;
  valid_from?: string | null;
  valid_to?: string | null;
  per_user_limit?: number | null;
}): Promise<CouponRow> {
  const payload: any = {
    restaurant_id: input.restaurant_id,
    code: input.code,
    description: input.description,
    type: input.type,
    value: input.value,
    min_order_value: input.min_order_value ?? 0,
    max_discount: input.max_discount ?? null,
    valid_from: input.valid_from ?? null,
    valid_to: input.valid_to ?? null,
    is_active: true,
  };
  if (input.per_user_limit !== undefined) payload.per_user_limit = input.per_user_limit;

  // Try with per_user_limit; if the column hasn't been migrated, retry without.
  let { data, error } = await client()
    .from('coupons')
    .insert(payload)
    .select('id, restaurant_id, code, description, type, value, min_order_value, max_discount, valid_from, valid_to, usage_limit, per_user_limit, used_count, is_active')
    .single() as any;

  if (error && /column .*per_user_limit/i.test(error.message ?? '')) {
    delete payload.per_user_limit;
    ({ data, error } = await client()
      .from('coupons')
      .insert(payload)
      .select('id, restaurant_id, code, description, type, value, min_order_value, max_discount, valid_from, valid_to, usage_limit, used_count, is_active')
      .single() as any);
  }
  if (error) throw error;
  return data as CouponRow;
}

export async function updateCoupon(id: string, patch: Partial<Pick<CouponRow, 'per_user_limit' | 'min_order_value' | 'max_discount' | 'value' | 'valid_from' | 'valid_to' | 'description'>>) {
  const { error } = await client().from('coupons').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setCouponActive(id: string, is_active: boolean) {
  const { error } = await client().from('coupons').update({ is_active }).eq('id', id);
  if (error) throw error;
}

export async function deleteCoupon(id: string) {
  const { error } = await client().from('coupons').delete().eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Customers — list + detail
// ────────────────────────────────────────────────────────────

export interface AdminCustomerRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  total_orders: number;
  total_spent: number;
  last_order_at: string | null;
  tags: string[];
  created_at: string;
}

export async function listCustomers(): Promise<AdminCustomerRow[]> {
  const { data, error } = await client()
    .from('customers')
    .select('id, name, phone, email, total_orders, total_spent, last_order_at, tags, created_at')
    .order('total_spent', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    total_orders: c.total_orders ?? 0,
    total_spent: Number(c.total_spent ?? 0),
    last_order_at: c.last_order_at,
    tags: c.tags ?? [],
    created_at: c.created_at,
  }));
}

// ────────────────────────────────────────────────────────────
// Tables / QR codes
// ────────────────────────────────────────────────────────────

export interface AdminTableRow {
  id: string;
  restaurant_id: string;
  label: string;
  qr_token: string;
  is_active: boolean;
  active_order_id?: string | null;
  active_order_code?: string | null;
  active_order_total?: number | null;
  total_today?: number;
}

export async function listTables(restaurantId: string): Promise<AdminTableRow[]> {
  const c = client();
  const { data: tables, error } = await c
    .from('dining_tables')
    .select('id, restaurant_id, label, qr_token, is_active')
    .eq('restaurant_id', restaurantId)
    .order('label');
  if (error) throw error;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { data: orders } = await c
    .from('orders')
    .select('id, code, status, total, table_id, created_at')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', todayStart.toISOString());

  const byTableActive = new Map<string, any>();
  const totalsByTable = new Map<string, number>();
  (orders ?? []).forEach((o: any) => {
    if (!o.table_id) return;
    if (!['completed', 'cancelled'].includes(o.status) && !byTableActive.has(o.table_id)) {
      byTableActive.set(o.table_id, o);
    }
    if (o.status !== 'cancelled') {
      totalsByTable.set(o.table_id, (totalsByTable.get(o.table_id) ?? 0) + Number(o.total));
    }
  });

  return (tables ?? []).map((t: any) => {
    const active = byTableActive.get(t.id);
    return {
      ...t,
      active_order_id: active?.id ?? null,
      active_order_code: active?.code ?? null,
      active_order_total: active?.total ? Number(active.total) : null,
      total_today: totalsByTable.get(t.id) ?? 0,
    };
  });
}

export async function createTable(input: { restaurant_id: string; label: string; qr_token: string }): Promise<AdminTableRow> {
  const { data, error } = await client()
    .from('dining_tables')
    .insert({
      restaurant_id: input.restaurant_id,
      label: input.label,
      qr_token: input.qr_token,
      is_active: true,
    })
    .select('id, restaurant_id, label, qr_token, is_active')
    .single();
  if (error) throw error;
  return data as AdminTableRow;
}

export async function deleteTable(id: string) {
  const { error } = await client().from('dining_tables').delete().eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Reservations
// ────────────────────────────────────────────────────────────

export interface ReservationRow {
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
  source: string;
  created_at: string;
}

export async function listReservations(restaurantIds: string[]): Promise<ReservationRow[]> {
  let q = client()
    .from('reservations')
    .select('*')
    .order('reserved_at', { ascending: false })
    .limit(500);
  if (restaurantIds.length) q = q.in('restaurant_id', restaurantIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ReservationRow[];
}

export async function createReservation(input: Omit<ReservationRow, 'id' | 'created_at'>): Promise<ReservationRow> {
  const { data, error } = await client()
    .from('reservations')
    .insert(input)
    .select('*')
    .single();
  if (error) throw error;
  return data as ReservationRow;
}

export async function updateReservationStatus(id: string, status: ReservationStatus) {
  const { error } = await client().from('reservations').update({ status }).eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Loyalty
// ────────────────────────────────────────────────────────────

export interface LoyaltyMemberRow {
  id: string;
  customer_id: string;
  customer_name: string;
  phone: string;
  restaurant_id: string;
  balance: number;
  lifetime_earned: number;
  lifetime_redeemed: number;
  last_order_at: string | null;
}

export async function listLoyaltyMembers(restaurantIds: string[]): Promise<LoyaltyMemberRow[]> {
  const c = client();
  let q = c
    .from('loyalty_wallets')
    .select('id, customer_id, restaurant_id, balance, updated_at, customer:customers(name, phone, last_order_at)')
    .order('balance', { ascending: false })
    .limit(200);
  if (restaurantIds.length) q = q.in('restaurant_id', restaurantIds);
  const { data, error } = await q;
  if (error) throw error;

  // pull lifetime stats from transactions for each wallet
  const ids = (data ?? []).map((d: any) => d.id);
  let txMap = new Map<string, { earned: number; redeemed: number }>();
  if (ids.length) {
    const { data: txs } = await c
      .from('loyalty_transactions')
      .select('wallet_id, type, points')
      .in('wallet_id', ids);
    (txs ?? []).forEach((t: any) => {
      const cur = txMap.get(t.wallet_id) ?? { earned: 0, redeemed: 0 };
      if (t.type === 'earn' || t.type === 'bonus' || t.type === 'refund') cur.earned += Math.abs(t.points);
      else if (t.type === 'redeem' || t.type === 'expire') cur.redeemed += Math.abs(t.points);
      txMap.set(t.wallet_id, cur);
    });
  }

  return (data ?? []).map((r: any) => {
    const tx = txMap.get(r.id) ?? { earned: 0, redeemed: 0 };
    return {
      id: r.id,
      customer_id: r.customer_id,
      restaurant_id: r.restaurant_id,
      customer_name: r.customer?.name ?? 'Customer',
      phone: r.customer?.phone ?? '—',
      balance: r.balance ?? 0,
      lifetime_earned: tx.earned,
      lifetime_redeemed: tx.redeemed,
      last_order_at: r.customer?.last_order_at ?? null,
    };
  });
}

export interface LoyaltyTxnRow {
  id: string;
  type: 'earn' | 'redeem' | 'bonus' | 'expire' | 'refund';
  points: number;
  member: string;
  order_code: string | null;
  created_at: string;
}

export async function listLoyaltyTransactions(walletIds: string[]): Promise<LoyaltyTxnRow[]> {
  if (!walletIds.length) return [];
  const { data, error } = await client()
    .from('loyalty_transactions')
    .select('id, type, points, note, created_at, order_id, wallet_id, wallet:loyalty_wallets(customer:customers(name)), order:orders(code)')
    .in('wallet_id', walletIds)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    id: t.id,
    type: t.type,
    points: t.points,
    member: t.wallet?.customer?.name ?? 'Customer',
    order_code: t.order?.code ?? null,
    created_at: t.created_at,
  }));
}

// ────────────────────────────────────────────────────────────
// Payments (admin payments tracking page)
// ────────────────────────────────────────────────────────────

export interface AdminPaymentRowDb {
  id: string;
  order_id: string;
  order_code: string;
  customer_name: string;
  provider: PaymentProvider | 'cash';
  method: string;
  amount: number;
  status: 'pending' | 'success' | 'failed' | 'refunded' | 'counter';
  gateway_payment_id: string | null;
  failure_reason: string | null;
  attempt_no: number;
  refunded_amount: number;
  created_at: string;
}

export async function listPayments(restaurantIds: string[]): Promise<AdminPaymentRowDb[]> {
  let q = client()
    .from('payments')
    .select(`
      id, order_id, provider, method, amount, status, gateway_payment_id,
      failure_reason, attempt_no, refunded_amount, created_at,
      order:orders(code, customer:customers(name))
    `)
    .order('created_at', { ascending: false })
    .limit(200);
  if (restaurantIds.length) q = q.in('restaurant_id', restaurantIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    order_id: p.order_id,
    order_code: p.order?.code ?? '—',
    customer_name: p.order?.customer?.name ?? 'Customer',
    provider: p.provider ?? 'cash',
    method: p.method ?? 'unknown',
    amount: Number(p.amount),
    status: p.status,
    gateway_payment_id: p.gateway_payment_id,
    failure_reason: p.failure_reason,
    attempt_no: p.attempt_no ?? 1,
    refunded_amount: Number(p.refunded_amount ?? 0),
    created_at: p.created_at,
  }));
}

export async function refundPayment(id: string, amount: number) {
  const { error } = await client()
    .from('payments')
    .update({ status: 'refunded', refunded_amount: amount })
    .eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Staff
// ────────────────────────────────────────────────────────────

export interface StaffRow {
  id: string;
  restaurant_id: string;
  user_id: string;
  role: StaffRole;
  display_name: string | null;
  created_at: string;
}

export async function removeStaff(restaurantId: string, userId: string) {
  const { error } = await client()
    .from('restaurant_staff')
    .delete()
    .eq('restaurant_id', restaurantId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function listStaff(restaurantIds: string[]): Promise<StaffRow[]> {
  let q = client()
    .from('restaurant_staff')
    .select('id, restaurant_id, user_id, role, display_name, created_at')
    .order('created_at', { ascending: false });
  if (restaurantIds.length) q = q.in('restaurant_id', restaurantIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as StaffRow[];
}

// ────────────────────────────────────────────────────────────
// Payment gateways (per branch + platform)
// ────────────────────────────────────────────────────────────

export interface PaymentGatewayRow {
  id: string;
  restaurant_id: string;
  provider: PaymentProvider;
  key_id: string;
  is_active: boolean;
  is_primary: boolean;
  test_mode: boolean;
  last_verified_at: string | null;
}

export async function listPaymentGateways(restaurantIds: string[]): Promise<PaymentGatewayRow[]> {
  let q = client()
    .from('payment_gateways')
    .select('id, restaurant_id, provider, key_id, is_active, is_primary, test_mode, last_verified_at');
  if (restaurantIds.length) q = q.in('restaurant_id', restaurantIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PaymentGatewayRow[];
}

export async function upsertPaymentGateway(input: {
  restaurant_id: string;
  provider: PaymentProvider;
  key_id: string;
  secret_key?: string;
  is_active?: boolean;
  is_primary?: boolean;
  test_mode?: boolean;
}): Promise<PaymentGatewayRow> {
  const row: any = {
    restaurant_id: input.restaurant_id,
    provider: input.provider,
    key_id: input.key_id,
    is_active: input.is_active ?? true,
    is_primary: input.is_primary ?? true, // first one is primary by default
    test_mode: input.test_mode ?? true,
  };
  if (input.secret_key !== undefined && input.secret_key !== '') {
    row.secret_key = input.secret_key;
  }
  const { data, error } = await client()
    .from('payment_gateways')
    .upsert(row, { onConflict: 'restaurant_id,provider' })
    .select('id, restaurant_id, provider, key_id, is_active, is_primary, test_mode, last_verified_at')
    .single();
  if (error) throw error;
  return data as PaymentGatewayRow;
}

// ────────────────────────────────────────────────────────────
// Platform payment providers (super admin enable/disable)
// ────────────────────────────────────────────────────────────

export interface PaymentProviderRow {
  provider: PaymentProvider;
  display_name: string;
  tagline: string | null;
  is_enabled: boolean;
}

export async function listPaymentProviders(): Promise<PaymentProviderRow[]> {
  const { data, error } = await client()
    .from('payment_providers')
    .select('provider, display_name, tagline, is_enabled')
    .order('display_name');
  if (error) throw error;
  return (data ?? []) as PaymentProviderRow[];
}

export async function setProviderEnabled(provider: PaymentProvider, enabled: boolean) {
  const { error } = await client().rpc('set_provider_enabled', { p: provider, enabled });
  if (error) throw error;
}

/**
 * Org admin overview: list all gateway rows for every branch in the given orgs.
 * Returns rows pre-joined with branch name so the org admin can manage all
 * branches' keys without flipping the tenant switcher per branch.
 */
export interface OrgGatewayRow extends PaymentGatewayRow {
  branch_id: string;
  branch_name: string;
  branch_slug: string;
}

export async function listGatewaysForOrg(branchIds: string[]): Promise<OrgGatewayRow[]> {
  if (!branchIds.length) return [];
  const { data, error } = await client()
    .from('payment_gateways')
    .select('id, restaurant_id, provider, key_id, is_active, is_primary, test_mode, last_verified_at, branch:restaurants(id, name, slug)')
    .in('restaurant_id', branchIds)
    .order('provider');
  if (error) throw error;
  return (data ?? []).map((g: any) => ({
    id: g.id,
    restaurant_id: g.restaurant_id,
    provider: g.provider,
    key_id: g.key_id,
    is_active: g.is_active,
    is_primary: g.is_primary,
    test_mode: g.test_mode,
    last_verified_at: g.last_verified_at,
    branch_id: g.branch?.id ?? g.restaurant_id,
    branch_name: g.branch?.name ?? '—',
    branch_slug: g.branch?.slug ?? '',
  }));
}

// ────────────────────────────────────────────────────────────
// Support tickets
// ────────────────────────────────────────────────────────────

export type TicketStatus   = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface SupportTicketRow {
  id: string;
  restaurant_id: string | null;
  organization_id: string | null;
  raised_by: string | null;
  subject: string;
  body: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  resolution: string | null;
  created_at: string;
  updated_at: string;
}

export async function listSupportTickets(opts: { restaurantIds?: string[]; status?: TicketStatus | 'all' } = {}): Promise<SupportTicketRow[]> {
  let q = client()
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (opts.restaurantIds?.length) q = q.in('restaurant_id', opts.restaurantIds);
  if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SupportTicketRow[];
}

export async function raiseSupportTicket(input: {
  restaurant_id: string | null;
  subject: string;
  body?: string;
  priority?: TicketPriority;
  raised_by?: string;
}): Promise<string> {
  const { data, error } = await client().rpc('raise_ticket', {
    rid: input.restaurant_id,
    subject_text: input.subject,
    body_text: input.body ?? null,
    priority_val: input.priority ?? 'normal',
    raised_by_label: input.raised_by ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function updateTicketStatus(id: string, status: TicketStatus, resolution?: string) {
  const { error } = await client().rpc('update_ticket_status', {
    t_id: id, new_status: status, resolution_text: resolution ?? null,
  });
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Account creation
//
// Pattern: supabase.auth.signUp creates the user AND signs the current
// browser in as them (replacing the existing session). For one super admin
// creating accounts for OTHERS, we save the current session before signUp
// and restore it after. Production should move this to a service-role Edge
// Function — that avoids the temporary session swap entirely.
// ────────────────────────────────────────────────────────────

/**
 * Production path for creating admin/manager accounts: the `admin-create-user`
 * Edge Function does it with service role, so the current admin's session is
 * never swapped. Returns ok:false if the function isn't deployed yet, in
 * which case callers fall back to the legacy `saveAndRestoreSession` flow.
 */
async function createUserViaEdgeFn(input: {
  role: 'org_admin' | 'branch_manager';
  email: string;
  password: string;
  display_name?: string;
  context: { organization_id?: string; restaurant_id?: string };
}): Promise<{ ok: true; user_id: string } | { ok: false; error: string; deployMiss: boolean }> {
  if (!supabase) return { ok: false, error: 'Supabase client not configured', deployMiss: false };
  try {
    const { data, error } = await supabase.functions.invoke('admin-create-user', { body: input });
    if (error) {
      const status = (error as any)?.context?.status as number | undefined;
      const message = (error as any)?.context?.error?.message
        ?? (data as any)?.error
        ?? error.message
        ?? 'admin-create-user call failed';
      // "Failed to send a request to the Edge Function" is what supabase-js
      // returns when the function is undeployed / unreachable.
      const deployMiss = status === 404 || /not found|404|Function not found|not deployed|unreachable|Failed to send|Edge Function|FunctionsFetchError|NetworkError|Failed to fetch/i.test(String(message));
      return { ok: false, error: String(message), deployMiss };
    }
    if (!data?.ok) {
      return { ok: false, error: data?.error ?? 'admin-create-user rejected the request', deployMiss: false };
    }
    return { ok: true, user_id: data.user_id as string };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'admin-create-user threw', deployMiss: true };
  }
}

async function saveAndRestoreSession<T>(fn: () => Promise<T>): Promise<T> {
  const c = client();
  const { data: { session: prev } } = await c.auth.getSession();
  try {
    return await fn();
  } finally {
    if (prev?.refresh_token) {
      try {
        await c.auth.setSession({
          access_token: prev.access_token,
          refresh_token: prev.refresh_token,
        });
      } catch (e) { console.warn('Failed to restore session', e); }
    } else {
      // No previous session — sign out the just-created user
      await c.auth.signOut().catch(() => { /* ignore */ });
    }
  }
}

interface NewAccount { email: string; password: string; display_name?: string }

// Simple RFC-5322-ish syntax check. We deliberately do NOT verify deliverability
// (no Supabase confirmation email is sent — see signUpNewUser below).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

async function signUpNewUser(input: NewAccount): Promise<string> {
  if (!isValidEmail(input.email)) {
    throw new Error('That email doesn\'t look right. Use the format name@example.com.');
  }
  if ((input.password ?? '').length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const { data, error } = await client().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { display_name: input.display_name ?? input.email.split('@')[0] },
      // Don't redirect anywhere after confirm — we don't want the confirm flow at all.
      emailRedirectTo: undefined,
    },
  });

  if (error) {
    const msg = error.message ?? '';
    if (/email rate limit/i.test(msg) || error.status === 429) {
      throw new Error(
        'Supabase is rate-limiting confirmation emails. Open Supabase → Authentication → Sign In / Up → ' +
        'turn OFF "Confirm email". After that, account creation is instant — no emails are sent.',
      );
    }
    if (/already registered|already exists|user already/i.test(msg)) {
      throw new Error('A user with this email already exists. Use a different email or remove the existing account first.');
    }
    throw error;
  }

  if (!data.user) throw new Error('Sign-up returned no user');
  return data.user.id;
}

/**
 * Super admin: create an organization AND its owner account in one shot.
 * The owner becomes the org admin (org_admins row) and is auto-linked as
 * owner of every branch under the org via the link_org_admin_to_branches
 * trigger.
 */
export async function createOrgWithOwner(input: {
  org: {
    slug: string;
    name: string;
    contact_phone?: string;
    flat_platform_fee?: number;
    brand_color?: string;
  };
  owner: NewAccount;
}): Promise<{ org: OrgRow; owner_user_id: string }> {
  // Step 1 of both paths: create the organization. This needs to happen
  // before we can link an owner, regardless of which user-creation path
  // we take. Org insert is RLS-permitted for platform admins today.
  const createdOrg = await createOrganization({
    slug: input.org.slug,
    name: input.org.name,
    contact_phone: input.org.contact_phone,
    commission_percent: 0,
    brand_color: input.org.brand_color,
    ...(input.org.flat_platform_fee !== undefined ? { flat_platform_fee: input.org.flat_platform_fee } as any : {}),
  } as any);
  if (!createdOrg) throw new Error('Org creation failed');

  // Step 2: create the owner account. Production = Edge Function.
  const viaFn = await createUserViaEdgeFn({
    role: 'org_admin',
    email: input.owner.email,
    password: input.owner.password,
    display_name: input.owner.display_name,
    context: { organization_id: createdOrg.id },
  });
  if (viaFn.ok) return { org: createdOrg, owner_user_id: viaFn.user_id };
  if (!viaFn.deployMiss) throw new Error(viaFn.error);

  // Dev fallback if Edge Function isn't deployed yet.
  console.info('[createOrgWithOwner] admin-create-user not available — using dev session-swap fallback.');
  let createdUserId = '';
  await saveAndRestoreSession(async () => {
    createdUserId = await signUpNewUser(input.owner);
    const { error } = await client().rpc('add_org_admin', {
      org: createdOrg.id,
      uid: createdUserId,
      email_arg: input.owner.email,
      display_name_arg: input.owner.display_name ?? input.owner.email.split('@')[0],
    });
    if (error) throw error;
  });
  return { org: createdOrg, owner_user_id: createdUserId };
}

/**
 * Super admin: add a NEW owner account to an EXISTING organization.
 * Creates auth user + records in org_admins. The trigger auto-links them to
 * every branch in the org with role='owner'.
 */
export async function addOrgAdminToExisting(input: {
  organization_id: string;
  owner: NewAccount;
}): Promise<{ user_id: string }> {
  // Production path: service-role Edge Function. Caller's session is untouched.
  const viaFn = await createUserViaEdgeFn({
    role: 'org_admin',
    email: input.owner.email,
    password: input.owner.password,
    display_name: input.owner.display_name,
    context: { organization_id: input.organization_id },
  });
  if (viaFn.ok) return { user_id: viaFn.user_id };
  if (!viaFn.deployMiss) throw new Error(viaFn.error);

  // Dev fallback: legacy session-swap flow if Edge Function isn't deployed yet.
  console.info('[addOrgAdminToExisting] admin-create-user not available — using dev session-swap fallback.');
  let createdUserId = '';
  await saveAndRestoreSession(async () => {
    createdUserId = await signUpNewUser(input.owner);
    const { error } = await client().rpc('add_org_admin', {
      org: input.organization_id,
      uid: createdUserId,
      email_arg: input.owner.email,
      display_name_arg: input.owner.display_name ?? input.owner.email.split('@')[0],
    });
    if (error) throw error;
  });
  return { user_id: createdUserId };
}

/**
 * Org admin: create a branch manager account scoped to one branch.
 */
export async function createBranchManager(input: {
  restaurant_id: string;
  manager: NewAccount;
}): Promise<{ user_id: string }> {
  // Production path: service-role Edge Function.
  const viaFn = await createUserViaEdgeFn({
    role: 'branch_manager',
    email: input.manager.email,
    password: input.manager.password,
    display_name: input.manager.display_name,
    context: { restaurant_id: input.restaurant_id },
  });
  if (viaFn.ok) return { user_id: viaFn.user_id };
  if (!viaFn.deployMiss) throw new Error(viaFn.error);

  // Dev fallback.
  console.info('[createBranchManager] admin-create-user not available — using dev session-swap fallback.');
  let createdUserId = '';
  await saveAndRestoreSession(async () => {
    createdUserId = await signUpNewUser(input.manager);
    const { error } = await client().rpc('add_branch_manager', {
      rid: input.restaurant_id,
      uid: createdUserId,
      display_name_arg: input.manager.display_name ?? input.manager.email.split('@')[0],
    });
    if (error) throw error;
  });
  return { user_id: createdUserId };
}

// ────────────────────────────────────────────────────────────
// Org admin directory
// ────────────────────────────────────────────────────────────

export interface OrgAdminRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
}

export async function listOrgAdmins(organizationId: string): Promise<OrgAdminRow[]> {
  const { data, error } = await client().rpc('list_org_admins', { org: organizationId });
  if (error) throw error;
  return (data ?? []) as OrgAdminRow[];
}

export async function removeOrgAdmin(organizationId: string, userId: string) {
  const { error } = await client().rpc('remove_org_admin', { org: organizationId, uid: userId });
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Kitchen Display (KDS) — KOT tickets
// Mirrors apps/kds/src/lib/api.ts so the same UI can live inside
// the admin dashboard scoped to the tenant context.
// ────────────────────────────────────────────────────────────

export interface KotTicketWithOrder extends KotTicket {
  order_code: string | null;
  table_label_db: string | null;
  customer_name_db: string | null;
}

export async function listKotTickets(restaurantIds: string[]): Promise<KotTicketWithOrder[]> {
  if (!restaurantIds.length) return [];
  const { data, error } = await client()
    .from('kot_tickets')
    .select('*, order:orders(code, customer:customers(name, phone), table:dining_tables(label))')
    .in('restaurant_id', restaurantIds)
    .neq('status', 'complete')
    .order('created_at', { ascending: true })
    .limit(80);
  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    ...t,
    order_code: t.order?.code ?? null,
    table_label_db: t.order?.table?.label ?? null,
    customer_name_db: t.order?.customer?.name ?? null,
  }));
}

export async function listKotHistory(restaurantIds: string[], limit = 50): Promise<KotTicketWithOrder[]> {
  if (!restaurantIds.length) return [];
  const { data, error } = await client()
    .from('kot_tickets')
    .select('*, order:orders(code, customer:customers(name), table:dining_tables(label))')
    .in('restaurant_id', restaurantIds)
    .eq('status', 'complete')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    ...t,
    order_code: t.order?.code ?? null,
    table_label_db: t.order?.table?.label ?? null,
    customer_name_db: t.order?.customer?.name ?? null,
  }));
}

export async function updateKotStatus(id: string, status: KotStatus, itemsDone?: number) {
  const patch: any = { status };
  if (typeof itemsDone === 'number') patch.items_done = itemsDone;
  const { error } = await client().from('kot_tickets').update(patch).eq('id', id);
  if (error) throw error;
}

export async function incrementReprintCount(id: string, currentCount: number) {
  const { error } = await client()
    .from('kot_tickets')
    .update({ reprint_count: currentCount + 1, printed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export function subscribeToKots(
  restaurantIds: string[],
  onChange: (event: { type: 'insert' | 'update' | 'delete'; row: any }) => void,
) {
  const c = client();
  const channel = c
    .channel('admin-embedded-kds')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kot_tickets' }, (payload) => {
      const row = (payload.new ?? payload.old) as any;
      if (!restaurantIds.length || restaurantIds.includes(row.restaurant_id)) {
        const type = payload.eventType.toLowerCase() as 'insert' | 'update' | 'delete';
        onChange({ type, row });
      }
    })
    .subscribe();
  return () => { c.removeChannel(channel); };
}

export async function updatePaymentGateway(id: string, patch: Partial<PaymentGatewayRow>) {
  const { error } = await client().from('payment_gateways').update(patch).eq('id', id);
  if (error) throw error;
}

// ────────────────────────────────────────────────────────────
// Platform admins (super admin section)
// ────────────────────────────────────────────────────────────

export interface PlatformAdminRow {
  user_id: string;
  role: 'super_admin' | 'support' | 'finance';
  display_name: string | null;
  created_at: string;
}

export async function listPlatformAdmins(): Promise<PlatformAdminRow[]> {
  const { data, error } = await client()
    .from('platform_admins')
    .select('user_id, role, display_name, created_at')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as PlatformAdminRow[];
}

// ────────────────────────────────────────────────────────────
// Audit log (for Notifications page activity feed)
// ────────────────────────────────────────────────────────────

export interface AuditRow {
  id: string;
  restaurant_id: string;
  actor_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  created_at: string;
}

export async function listAuditLog(restaurantIds: string[], limit = 50): Promise<AuditRow[]> {
  let q = client()
    .from('audit_log')
    .select('id, restaurant_id, actor_id, action, entity, entity_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (restaurantIds.length) q = q.in('restaurant_id', restaurantIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditRow[];
}

// ────────────────────────────────────────────────────────────
// Super dashboard — platform-wide aggregates
// ────────────────────────────────────────────────────────────

export interface PlatformMetrics {
  total_orgs: number;
  total_branches: number;
  active_branches: number;
  new_signups_week: number;
  total_orders_today: number;
  total_revenue_today: number;
  total_commission_today: number;
  avg_order_value: number;
  failed_payments_today: number;
  uptime_pct: number;
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const c = client();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);

  const [{ data: orgs }, { data: branches }, { data: orders }] = await Promise.all([
    c.from('organizations').select('id, is_active, commission_percent, created_at'),
    c.from('restaurants').select('id, is_open'),
    c.from('orders').select('total, status, payment_status, restaurant_id, created_at').gte('created_at', todayStart.toISOString()),
  ]);

  const orgsTotal = orgs?.length ?? 0;
  const newSignupsWeek = (orgs ?? []).filter((o: any) => new Date(o.created_at) >= weekAgo).length;
  const branchesTotal = branches?.length ?? 0;
  const branchesActive = (branches ?? []).filter((b: any) => b.is_open).length;

  const ordersToday = (orders ?? []).filter((o: any) => o.status !== 'cancelled');
  const revenue = ordersToday.reduce((s: number, o: any) => s + Number(o.total), 0);
  const failed = (orders ?? []).filter((o: any) => o.payment_status === 'failed').length;

  // commission = sum(order.total * org.commission_percent / 100)
  const branchToOrg = new Map<string, string>();
  // We need restaurant.organization_id — re-fetch with that.
  const { data: branchOrgs } = await c.from('restaurants').select('id, organization_id');
  (branchOrgs ?? []).forEach((b: any) => branchToOrg.set(b.id, b.organization_id));
  const orgCommission = new Map<string, number>();
  (orgs ?? []).forEach((o: any) => orgCommission.set(o.id, Number(o.commission_percent ?? 0)));

  const commission = ordersToday.reduce((s: number, o: any) => {
    const orgId = branchToOrg.get(o.restaurant_id);
    const pct = orgId ? (orgCommission.get(orgId) ?? 0) : 0;
    return s + Number(o.total) * pct / 100;
  }, 0);

  return {
    total_orgs: orgsTotal,
    total_branches: branchesTotal,
    active_branches: branchesActive,
    new_signups_week: newSignupsWeek,
    total_orders_today: ordersToday.length,
    total_revenue_today: Math.round(revenue),
    total_commission_today: Math.round(commission),
    avg_order_value: ordersToday.length ? Math.round(revenue / ordersToday.length) : 0,
    failed_payments_today: failed,
    uptime_pct: 99.97,
  };
}

export async function getRevenueByOrg(): Promise<Array<{ org_id: string; org_name: string; brand_color: string; revenue_today: number; orders_today: number }>> {
  const c = client();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const [{ data: orgs }, { data: branches }, { data: orders }] = await Promise.all([
    c.from('organizations').select('id, name, brand_color'),
    c.from('restaurants').select('id, organization_id'),
    c.from('orders').select('total, status, restaurant_id').gte('created_at', todayStart.toISOString()),
  ]);

  const branchToOrg = new Map<string, string>();
  (branches ?? []).forEach((b: any) => branchToOrg.set(b.id, b.organization_id));

  const rev = new Map<string, { revenue: number; orders: number }>();
  (orders ?? []).forEach((o: any) => {
    if (o.status === 'cancelled') return;
    const orgId = branchToOrg.get(o.restaurant_id);
    if (!orgId) return;
    const cur = rev.get(orgId) ?? { revenue: 0, orders: 0 };
    cur.revenue += Number(o.total);
    cur.orders += 1;
    rev.set(orgId, cur);
  });

  return (orgs ?? []).map((o: any) => ({
    org_id: o.id,
    org_name: o.name,
    brand_color: o.brand_color ?? '#EA580C',
    revenue_today: Math.round(rev.get(o.id)?.revenue ?? 0),
    orders_today: rev.get(o.id)?.orders ?? 0,
  })).sort((a, b) => b.revenue_today - a.revenue_today);
}

// ────────────────────────────────────────────────────────────
// Per-org insights for the Super Admin → Restaurants drill-down.
// Aggregates orders + customers + admin counts across every branch
// belonging to the organization.
// ────────────────────────────────────────────────────────────

export interface OrgInsights {
  org_id: string;
  org_name: string;
  branch_count: number;
  admin_count: number;
  customer_count: number;             // distinct customers who ordered
  revenue_today: number;
  revenue_month: number;              // last 30 days
  revenue_total: number;              // all-time
  orders_today: number;
  orders_month: number;
  orders_total: number;
  aov: number;                        // average order value (all-time)
  active_branches: number;            // branches that have at least 1 order
  last_order_at: string | null;       // ISO timestamp of latest order
  top_branch: { name: string; revenue: number } | null;
  recent_orders: Array<{
    code: string; total: number; status: string;
    created_at: string; branch_name: string;
  }>;
}

export async function getOrgInsights(orgId: string): Promise<OrgInsights> {
  const c = client();

  const [{ data: org }, { data: branches }, { data: admins }] = await Promise.all([
    c.from('organizations').select('id, name').eq('id', orgId).maybeSingle(),
    c.from('restaurants').select('id, name').eq('organization_id', orgId),
    c.from('org_admins').select('user_id').eq('organization_id', orgId),
  ]);
  if (!org) throw new Error('Organization not found');

  const branchIds = (branches ?? []).map((b: any) => b.id);
  const branchNameById = new Map<string, string>(
    (branches ?? []).map((b: any) => [b.id, b.name]),
  );

  if (!branchIds.length) {
    return {
      org_id: org.id, org_name: org.name,
      branch_count: 0, admin_count: admins?.length ?? 0,
      customer_count: 0,
      revenue_today: 0, revenue_month: 0, revenue_total: 0,
      orders_today: 0, orders_month: 0, orders_total: 0,
      aov: 0, active_branches: 0, last_order_at: null,
      top_branch: null, recent_orders: [],
    };
  }

  const { data: orders } = await c
    .from('orders')
    .select('id, code, total, status, customer_id, restaurant_id, created_at')
    .in('restaurant_id', branchIds)
    .order('created_at', { ascending: false });

  const successful = (orders ?? []).filter((o: any) => o.status !== 'cancelled');
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(monthStart.getDate() - 30);

  let revToday = 0, ordersToday = 0;
  let revMonth = 0, ordersMonth = 0;
  let revTotal = 0;
  const customerSet = new Set<string>();
  const branchRev = new Map<string, number>();
  const activeBranches = new Set<string>();

  successful.forEach((o: any) => {
    const t = Number(o.total);
    revTotal += t;
    activeBranches.add(o.restaurant_id);
    branchRev.set(o.restaurant_id, (branchRev.get(o.restaurant_id) ?? 0) + t);
    if (o.customer_id) customerSet.add(o.customer_id);
    const at = new Date(o.created_at);
    if (at >= monthStart) { revMonth += t; ordersMonth += 1; }
    if (at >= todayStart) { revToday += t; ordersToday += 1; }
  });

  const topBranchEntry = [...branchRev.entries()].sort((a, b) => b[1] - a[1])[0];
  const topBranch = topBranchEntry
    ? { name: branchNameById.get(topBranchEntry[0]) ?? '—', revenue: Math.round(topBranchEntry[1]) }
    : null;

  const recent_orders = successful.slice(0, 8).map((o: any) => ({
    code: o.code,
    total: Number(o.total),
    status: o.status,
    created_at: o.created_at,
    branch_name: branchNameById.get(o.restaurant_id) ?? '—',
  }));

  return {
    org_id: org.id,
    org_name: org.name,
    branch_count: branchIds.length,
    admin_count: admins?.length ?? 0,
    customer_count: customerSet.size,
    revenue_today: Math.round(revToday),
    revenue_month: Math.round(revMonth),
    revenue_total: Math.round(revTotal),
    orders_today: ordersToday,
    orders_month: ordersMonth,
    orders_total: successful.length,
    aov: successful.length ? Math.round(revTotal / successful.length) : 0,
    active_branches: activeBranches.size,
    last_order_at: successful[0]?.created_at ?? null,
    top_branch: topBranch,
    recent_orders,
  };
}

// ────────────────────────────────────────────────────────────
// Reports — sales by hour, top items, etc.
// ────────────────────────────────────────────────────────────

export interface ReportData {
  revenue: number;
  orders: number;
  aov: number;
  hourly: Array<{ hour: number; sales: number; orders: number }>;
  top_items: Array<{ name: string; qty_sold: number; revenue: number; image_url: string | null; category: string | null }>;
  by_method: Array<{ label: string; value: number; color: string }>;
  weekly: number[];
}

export async function getReports(restaurantIds: string[], range: 'today' | 'week' | 'month' | 'quarter'): Promise<ReportData> {
  const c = client();
  const start = new Date();
  if (range === 'today') start.setHours(0, 0, 0, 0);
  else if (range === 'week') start.setDate(start.getDate() - 7);
  else if (range === 'month') start.setDate(start.getDate() - 30);
  else start.setDate(start.getDate() - 90);

  let oq = c
    .from('orders')
    .select(`
      id, total, status, created_at,
      items:order_items(menu_item_id, item_name, qty, line_total, menu_item:menu_items(image_url, categories(name)))
    `)
    .gte('created_at', start.toISOString());
  if (restaurantIds.length) oq = oq.in('restaurant_id', restaurantIds);
  const { data: orders, error } = await oq;
  if (error) throw error;

  const success = (orders ?? []).filter((o: any) => o.status !== 'cancelled');
  const revenue = success.reduce((s: number, o: any) => s + Number(o.total), 0);

  const hourly: Array<{ hour: number; sales: number; orders: number }> = [];
  for (let h = 0; h < 24; h++) hourly.push({ hour: h, sales: 0, orders: 0 });
  success.forEach((o: any) => {
    const h = new Date(o.created_at).getHours();
    hourly[h].sales += Number(o.total);
    hourly[h].orders += 1;
  });

  // top items by revenue
  const itemMap = new Map<string, { name: string; qty: number; revenue: number; image_url: string | null; category: string | null }>();
  success.forEach((o: any) => {
    (o.items ?? []).forEach((it: any) => {
      const k = it.menu_item_id ?? it.item_name;
      const cur = itemMap.get(k) ?? { name: it.item_name, qty: 0, revenue: 0, image_url: it.menu_item?.image_url ?? null, category: it.menu_item?.categories?.name ?? null };
      cur.qty += Number(it.qty);
      cur.revenue += Number(it.line_total);
      itemMap.set(k, cur);
    });
  });
  const top_items = Array.from(itemMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
    .map(t => ({ name: t.name, qty_sold: t.qty, revenue: Math.round(t.revenue), image_url: t.image_url, category: t.category }));

  // weekly bar chart — last 7 days
  const weekly: number[] = [];
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  for (let d = 6; d >= 0; d--) {
    const a = new Date(dayStart); a.setDate(a.getDate() - d);
    const b = new Date(a); b.setDate(b.getDate() + 1);
    const sum = success
      .filter((o: any) => {
        const t = new Date(o.created_at).getTime();
        return t >= a.getTime() && t < b.getTime();
      })
      .reduce((s: number, o: any) => s + Number(o.total), 0);
    weekly.push(Math.round(sum));
  }

  // method breakdown from payments table
  let by_method: ReportData['by_method'] = [];
  let pq = c.from('payments').select('method, amount, status').gte('created_at', start.toISOString());
  if (restaurantIds.length) pq = pq.in('restaurant_id', restaurantIds);
  const { data: pays } = await pq;
  const methodMap = new Map<string, number>();
  (pays ?? []).filter((p: any) => p.status === 'success').forEach((p: any) => {
    const k = p.method ?? 'other';
    methodMap.set(k, (methodMap.get(k) ?? 0) + Number(p.amount));
  });
  const colors: Record<string, string> = { upi: '#3B82F6', card: '#A855F7', wallet: '#10B981', netbanking: '#0EA5E9', cash: '#F59E0B' };
  by_method = Array.from(methodMap.entries()).map(([k, v]) => ({ label: k.toUpperCase(), value: v, color: colors[k] ?? '#94A3B8' }));

  return {
    revenue: Math.round(revenue),
    orders: success.length,
    aov: success.length ? Math.round(revenue / success.length) : 0,
    hourly,
    top_items,
    by_method,
    weekly,
  };
}

// ────────────────────────────────────────────────────────────
// Branch seeding (tables + starter menu)
// ────────────────────────────────────────────────────────────

export async function seedNewBranch(restaurantId: string, tableCount = 8) {
  const { error } = await client().rpc('seed_new_branch', {
    rid: restaurantId, table_count: tableCount,
  });
  if (error) throw error;
}

export async function seedDefaultMenu(restaurantId: string) {
  const { error } = await client().rpc('seed_default_menu', { rid: restaurantId });
  if (error) throw error;
}

export async function seedDefaultTables(restaurantId: string, tableCount = 8) {
  const { error } = await client().rpc('seed_default_tables', {
    rid: restaurantId, table_count: tableCount,
  });
  if (error) throw error;
}
