// KDS data layer — live KOT tickets via Supabase.
import { getSupabase, type KotStatus, type KotTicket } from '@foodcourt/shared';

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

export interface BranchOption {
  id: string;
  name: string;
  slug: string;
  organization_id: string | null;
}

export interface OrgOption {
  id: string;
  name: string;
}

export async function listBranches(): Promise<BranchOption[]> {
  const { data, error } = await client()
    .from('restaurants')
    .select('id, name, slug, organization_id')
    .order('name');
  if (error) throw error;
  return (data ?? []) as BranchOption[];
}

export async function listOrgs(): Promise<OrgOption[]> {
  const { data, error } = await client()
    .from('organizations')
    .select('id, name')
    .order('name');
  if (error) throw error;
  return (data ?? []) as OrgOption[];
}

export async function listKotTickets(restaurantIds: string[]): Promise<KotTicketWithOrder[]> {
  let q = client()
    .from('kot_tickets')
    .select('*, order:orders(code, customer:customers(name, phone), table:dining_tables(label))')
    .neq('status', 'complete')
    .order('created_at', { ascending: true })
    .limit(80);
  if (restaurantIds.length) q = q.in('restaurant_id', restaurantIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    ...t,
    order_code: t.order?.code ?? null,
    table_label_db: t.order?.table?.label ?? null,
    customer_name_db: t.order?.customer?.name ?? null,
  }));
}

export async function listKotHistory(restaurantIds: string[], limit = 50): Promise<KotTicketWithOrder[]> {
  let q = client()
    .from('kot_tickets')
    .select('*, order:orders(code, customer:customers(name), table:dining_tables(label))')
    .eq('status', 'complete')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (restaurantIds.length) q = q.in('restaurant_id', restaurantIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    ...t,
    order_code: t.order?.code ?? null,
    table_label_db: t.order?.table?.label ?? null,
    customer_name_db: t.order?.customer?.name ?? null,
  }));
}

export async function incrementReprintCount(id: string, currentCount: number) {
  const { error } = await client()
    .from('kot_tickets')
    .update({ reprint_count: currentCount + 1, printed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export interface KotTicketWithOrder extends KotTicket {
  order_code: string | null;
  table_label_db: string | null;
  customer_name_db: string | null;
}

export async function updateKotStatus(id: string, status: KotStatus, itemsDone?: number) {
  const patch: any = { status };
  if (typeof itemsDone === 'number') patch.items_done = itemsDone;
  const { error } = await client().from('kot_tickets').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setKotItemsDone(id: string, items_done: number) {
  const { error } = await client().from('kot_tickets').update({ items_done }).eq('id', id);
  if (error) throw error;
}

export function subscribeToKots(
  restaurantIds: string[],
  onChange: (event: { type: 'insert' | 'update' | 'delete'; row: any }) => void,
) {
  const c = client();
  const channel = c
    .channel('kds-kot')
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
