import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { uuid } from '@foodcourt/shared';
import {
  getCustomer, upsertCustomer,
  listAddresses, createAddress, updateAddress as updateAddressDb, deleteAddress,
  sendOtpRequest, verifyOtpRequest, getLoyaltyBalance,
  type AddressRow,
} from './api';

export interface CustomerUser {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  initials: string;
  joined_at: string;
  total_orders: number;
  total_spent: number;
  loyalty_balance: number;
  notify_order_updates: boolean;
  notify_promotions: boolean;
  notify_loyalty: boolean;
}

export interface Address {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  address_line: string;
  locality: string;
  city: string;
  pincode: string;
  landmark: string;
  is_default: boolean;
}

interface AuthCtx {
  user: CustomerUser | null;
  customerId: string;
  addresses: Address[];
  loading: boolean;
  sendOtp: (phone: string) => Promise<{ ok: true }>;
  /** Throws with a human-readable message if OTP is wrong / expired. */
  verifyOtp: (phone: string, code: string, name?: string) => Promise<CustomerUser>;
  logout: () => void;
  updateUser: (patch: Partial<CustomerUser>) => void;
  addAddress: (a: Omit<Address, 'id'>) => Promise<void>;
  updateAddress: (id: string, patch: Partial<Address>) => Promise<void>;
  removeAddress: (id: string) => Promise<void>;
  setDefaultAddress: (id: string) => Promise<void>;
  /** Re-fetch the loyalty balance from the DB (e.g. after placing an order). */
  refreshLoyalty: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

const KEY_CID  = 'foodcourt-customer-id-v1';
const KEY_USER = 'foodcourt-customer-user-v1';

function load<T>(key: string): T | null {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function save<T>(key: string, v: T) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

function getOrCreateCustomerId(): string {
  let id: string;
  try {
    id = localStorage.getItem(KEY_CID) ?? '';
    if (!id) {
      id = uuid();
      localStorage.setItem(KEY_CID, id);
    }
  } catch {
    id = uuid();
  }
  return id;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || 'U';
}

function toUI(a: AddressRow): Address {
  return {
    id: a.id,
    label: a.label,
    recipient: a.recipient ?? '',
    phone: a.phone ?? '',
    address_line: a.address_line,
    locality: a.locality ?? '',
    city: a.city ?? '',
    pincode: a.pincode ?? '',
    landmark: a.landmark ?? '',
    is_default: !!a.is_default,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customerId] = useState<string>(() => getOrCreateCustomerId());
  const [user, setUser]           = useState<CustomerUser | null>(() => load<CustomerUser>(KEY_USER));
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => { save(KEY_USER, user); }, [user]);

  const reloadAddresses = useCallback(async () => {
    try {
      const rows = await listAddresses(customerId);
      setAddresses(rows.map(toUI));
    } catch (e) { console.warn('Could not load addresses', e); }
  }, [customerId]);

  // Try to load customer row + addresses from DB on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [row, coinBalance] = await Promise.all([
          getCustomer(customerId),
          getLoyaltyBalance(customerId),
        ]);
        if (!cancelled && row && !user) {
          setUser({
            id: row.id,
            name: row.name ?? 'Friend',
            phone: row.phone ?? null,
            email: row.email ?? null,
            initials: initials(row.name ?? 'Friend'),
            joined_at: row.created_at ?? new Date().toISOString(),
            total_orders: row.total_orders ?? 0,
            total_spent: Number(row.total_spent ?? 0),
            loyalty_balance: coinBalance,
            notify_order_updates: true,
            notify_promotions: false,
            notify_loyalty: true,
          });
        } else if (!cancelled && user) {
          // Refresh loyalty balance for an already-restored session.
          setUser(u => u ? { ...u, loyalty_balance: coinBalance } : u);
        }
      } catch {
        /* Supabase not reachable — stay logged out */
      }
      await reloadAddresses();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [customerId, user, reloadAddresses]);

  const value: AuthCtx = {
    user, customerId, addresses, loading,

    sendOtp: async (phone) => {
      // 1. Try the real 2factor.in flow via the send-otp Edge Function.
      // 2. If that fails (function not deployed, key not set, network down),
      //    fall back to "dev mode" so local testing still works without 2factor.
      const result = await sendOtpRequest(phone);
      if (result.ok) return { ok: true };

      // Edge Function unavailable / not configured — log + fall back to dev OTP.
      console.info('OTP send failed (using dev fallback):', result.error);
      await new Promise(r => setTimeout(r, 400));
      return { ok: true };
    },

    verifyOtp: async (phone, code, name) => {
      const display = name?.trim();
      if (!display) throw new Error('Your name is required to create an account.');

      // Try real verification via 2factor.in. If the Edge Function isn't
      // deployed or returns a transport error, accept the code in dev mode
      // so engineers can keep working without 2factor.
      const verify = await verifyOtpRequest(phone, code);
      const realVerificationAttempted = verify.error !== undefined &&
        !/not configured|unreachable|threw|404/i.test(verify.error);

      if (verify.ok) {
        // Real flow succeeded — proceed.
      } else if (realVerificationAttempted) {
        // Real 2factor said "no" (wrong / expired OTP). Bubble the message up.
        throw new Error(verify.error ?? 'OTP verification failed');
      } else {
        // Transport / config failure — accept any 6-digit code in dev.
        console.info('OTP verify in dev fallback mode:', verify.error);
        if (!/^\d{4,8}$/.test(code)) throw new Error('Enter the 6-digit code.');
      }

      try {
        await upsertCustomer({ id: customerId, name: display, phone });
      } catch (e) {
        console.warn('Could not upsert customer row:', e);
      }
      const u: CustomerUser = {
        id: customerId,
        name: display,
        phone,
        email: null,
        initials: initials(display),
        joined_at: new Date().toISOString(),
        total_orders: user?.total_orders ?? 0,
        total_spent: user?.total_spent ?? 0,
        loyalty_balance: user?.loyalty_balance ?? 0,
        notify_order_updates: user?.notify_order_updates ?? true,
        notify_promotions:    user?.notify_promotions    ?? false,
        notify_loyalty:       user?.notify_loyalty       ?? true,
      };
      setUser(u);
      return u;
    },

    logout: () => {
      setUser(null);
      setAddresses([]);
      try {
        localStorage.removeItem(KEY_USER);
      } catch { /* ignore */ }
    },

    updateUser: (patch) => setUser(u => {
      if (!u) return u;
      const next = { ...u, ...patch };
      if (patch.name !== undefined || patch.phone !== undefined || patch.email !== undefined) {
        upsertCustomer({
          id: customerId,
          name: next.name,
          phone: next.phone ?? undefined,
          email: next.email ?? undefined,
        }).catch(() => { /* ignore */ });
      }
      return next;
    }),

    addAddress: async (a) => {
      // Make sure the customer row exists so the FK insert succeeds.
      try { await upsertCustomer({ id: customerId, name: user?.name ?? 'Friend' }); } catch { /* ignore */ }
      await createAddress({
        customer_id: customerId,
        label: a.label,
        recipient: a.recipient || null,
        phone: a.phone || null,
        address_line: a.address_line,
        locality: a.locality || null,
        city: a.city || null,
        pincode: a.pincode || null,
        landmark: a.landmark || null,
        is_default: a.is_default,
      });
      await reloadAddresses();
    },
    updateAddress: async (id, patch) => {
      await updateAddressDb(id, customerId, {
        label: patch.label,
        recipient: patch.recipient ?? null,
        phone: patch.phone ?? null,
        address_line: patch.address_line,
        locality: patch.locality ?? null,
        city: patch.city ?? null,
        pincode: patch.pincode ?? null,
        landmark: patch.landmark ?? null,
        is_default: patch.is_default,
      });
      await reloadAddresses();
    },
    removeAddress: async (id) => {
      await deleteAddress(id);
      await reloadAddresses();
    },
    setDefaultAddress: async (id) => {
      await updateAddressDb(id, customerId, { is_default: true });
      await reloadAddresses();
    },

    refreshLoyalty: async () => {
      const bal = await getLoyaltyBalance(customerId);
      setUser(u => u ? { ...u, loyalty_balance: bal } : u);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be inside <AuthProvider>');
  return c;
}
