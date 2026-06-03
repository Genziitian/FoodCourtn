// Admin app session — Supabase Auth (email/password) + platform_admin / restaurant_staff role lookup.
//
// Currently the sign-in gate is OFF in App.tsx (we'll re-enable later). This
// module still runs so that when login is re-added, the role lookup keeps
// working without further changes.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './api';

export type PlatformAdminRole = 'super_admin' | 'support' | 'finance';
export type StaffRole = 'owner' | 'manager' | 'cashier' | 'kitchen' | 'waiter';

export interface AdminSession {
  user: User;
  session: Session;
  platformRole: PlatformAdminRole | null;
  staffRoles: Array<{ restaurant_id: string; role: StaffRole }>;
  orgAdminOf: string[];     // organization_ids this user is an admin of
  isPlatformAdmin: boolean;
  isOrgAdmin: boolean;
  isStaff: boolean;
  displayName: string;
}

interface SessionCtx {
  state: 'loading' | 'authed' | 'anon';
  admin: AdminSession | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ becameSuperAdmin: boolean }>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

function client() {
  if (!supabase) throw new Error('Supabase client not configured');
  return supabase;
}

async function loadRoles(user: User): Promise<{
  platformRole: PlatformAdminRole | null;
  staffRoles: Array<{ restaurant_id: string; role: StaffRole }>;
  orgAdminOf: string[];
}> {
  const c = client();
  const [{ data: padmin }, { data: staff }, { data: orgAdmin }] = await Promise.all([
    c.from('platform_admins').select('role').eq('user_id', user.id).maybeSingle(),
    c.from('restaurant_staff').select('restaurant_id, role').eq('user_id', user.id),
    c.from('org_admins').select('organization_id').eq('user_id', user.id),
  ]);
  return {
    platformRole: (padmin?.role as PlatformAdminRole | undefined) ?? null,
    staffRoles: (staff ?? []) as Array<{ restaurant_id: string; role: StaffRole }>,
    orgAdminOf: (orgAdmin ?? []).map((r: any) => r.organization_id),
  };
}

function buildSession(
  user: User,
  session: Session,
  platformRole: PlatformAdminRole | null,
  staffRoles: Array<{ restaurant_id: string; role: StaffRole }>,
  orgAdminOf: string[],
): AdminSession {
  return {
    user,
    session,
    platformRole,
    staffRoles,
    orgAdminOf,
    isPlatformAdmin: platformRole !== null,
    isOrgAdmin: orgAdminOf.length > 0,
    isStaff: staffRoles.length > 0,
    displayName: (user.user_metadata?.display_name as string | undefined)
      || user.email?.split('@')[0]
      || 'Member',
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionCtx['state']>('loading');
  const [admin, setAdmin] = useState<AdminSession | null>(null);

  const hydrate = useCallback(async (session: Session | null) => {
    if (!session?.user) { setAdmin(null); setState('anon'); return; }
    try {
      const { platformRole, staffRoles, orgAdminOf } = await loadRoles(session.user);
      setAdmin(buildSession(session.user, session, platformRole, staffRoles, orgAdminOf));
      setState('authed');
    } catch (e) {
      console.error('Role lookup failed', e);
      setAdmin(buildSession(session.user, session, null, [], []));
      setState('authed');
    }
  }, []);

  useEffect(() => {
    if (!supabase) { setState('anon'); return; }
    let unmounted = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!unmounted) hydrate(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!unmounted) hydrate(session);
    });
    return () => { unmounted = true; sub.subscription.unsubscribe(); };
  }, [hydrate]);

  const refreshRoles = useCallback(async () => {
    if (!admin) return;
    const { platformRole, staffRoles, orgAdminOf } = await loadRoles(admin.user);
    setAdmin(prev => prev ? {
      ...prev,
      platformRole, staffRoles, orgAdminOf,
      isPlatformAdmin: platformRole !== null,
      isOrgAdmin: orgAdminOf.length > 0,
      isStaff: staffRoles.length > 0,
    } : prev);
  }, [admin]);

  const value: SessionCtx = useMemo(() => ({
    state, admin,

    signIn: async (email, password) => {
      const { error } = await client().auth.signInWithPassword({ email, password });
      if (error) throw error;
    },

    signUp: async (email, password, displayName) => {
      const c = client();
      let isFirst = false;
      try {
        const { count } = await c.from('platform_admins').select('user_id', { count: 'exact', head: true });
        isFirst = (count ?? 0) === 0;
      } catch { isFirst = false; }

      const { data: signUpData, error } = await c.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;
      if (!signUpData.user) throw new Error('Sign-up succeeded but no user returned');

      let becameSuperAdmin = false;
      if (isFirst) {
        const { error: padErr } = await c.from('platform_admins').insert({
          user_id: signUpData.user.id,
          role: 'super_admin',
          display_name: displayName,
        });
        if (!padErr) becameSuperAdmin = true;
      }

      return { becameSuperAdmin };
    },

    signOut: async () => {
      await client().auth.signOut();
      setAdmin(null);
      setState('anon');
    },

    refreshRoles,
  }), [state, admin, refreshRoles]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession must be inside <SessionProvider>');
  return c;
}
