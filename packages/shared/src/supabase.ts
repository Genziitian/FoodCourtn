import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare global {
  // eslint-disable-next-line no-var
  var __FOODCOURT_SUPABASE__: SupabaseClient | undefined;
}

interface ClientEnv {
  url?: string;
  anonKey?: string;
}

/**
 * Single shared Supabase client per browser tab.
 * Each app passes its own VITE_SUPABASE_* env at startup.
 */
export function getSupabase(env: ClientEnv): SupabaseClient | null {
  if (!env.url || !env.anonKey) return null;
  if (globalThis.__FOODCOURT_SUPABASE__) return globalThis.__FOODCOURT_SUPABASE__;
  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  globalThis.__FOODCOURT_SUPABASE__ = client;
  return client;
}

export const isSupabaseConfigured = (env: ClientEnv): boolean =>
  Boolean(env.url && env.anonKey);
