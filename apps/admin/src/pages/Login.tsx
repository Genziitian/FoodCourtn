import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, ChefHat, Eye, EyeOff, Lock, Mail, Sparkles } from 'lucide-react';
import { cls } from '@foodcourt/shared';
import { useSession } from '../lib/session';
import { isValidEmail } from '../lib/api';

/**
 * Restaurant admin sign-in.
 *
 * Intentionally single-purpose:
 *   • No "Customer" tab — customers use the customer app (phone OTP).
 *   • No "Super Admin" tab — platform admins use the hidden /super/login URL
 *     so customers and staff don't even see that surface exists.
 *   • No "Create account" — restaurant admin accounts are provisioned by a
 *     platform admin via Super Admin → Restaurants → Admins.
 *
 * Behaviour after sign-in:
 *   • Org admin / branch staff → /dashboard
 *   • Platform admin (rare here, but possible) → /super (their role is
 *     resolved from the platform_admins table at sign-in time, no UI
 *     selection needed).
 *   • Signed in but no role yet → explicit "ask a super admin" message.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, admin, signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state !== 'authed' || !admin) return;
    const requestedFrom = (location.state as { from?: string } | null)?.from;
    if (admin.isPlatformAdmin) {
      navigate(requestedFrom?.startsWith('/super') ? requestedFrom : '/super', { replace: true });
    } else if (admin.isOrgAdmin || admin.isStaff) {
      navigate(requestedFrom && requestedFrom !== '/login' ? requestedFrom : '/dashboard', { replace: true });
    } else {
      setError("Signed in, but your account isn't linked to any organization or branch yet. Ask a super admin to add you.");
    }
  }, [state, admin, navigate, location.state]);

  const submit = async () => {
    setError(null);
    if (!email || !password) { setError('Email and password are required'); return; }
    if (!isValidEmail(email)) { setError('Email looks malformed — use name@example.com'); return; }

    setSubmitting(true);
    try {
      await signIn(email, password);
      // Navigation handled by the useEffect once role resolution completes.
    } catch (e: any) {
      const msg = e?.message ?? 'Sign in failed';
      if (/invalid login credentials/i.test(msg)) {
        setError('Invalid email or password. Ask your super admin to create or reset your account.');
      } else if (/email not confirmed/i.test(msg)) {
        setError('Email not confirmed. Disable "Confirm email" in Supabase → Auth → Providers → Email.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50 flex">
      <div className="hidden lg:flex flex-col w-[44%] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-12 text-white relative overflow-hidden">
        <div className="absolute -top-20 -right-20 size-72 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 size-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="size-10 grid place-items-center rounded-full bg-brand-500/20">
            <span className="size-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600" />
          </span>
          <span className="font-extrabold text-xl">FoodCourt</span>
        </div>
        <div className="relative mt-auto">
          <h1 className="font-display text-4xl lg:text-5xl font-extrabold leading-tight">
            The order pipeline restaurants <span className="text-brand-400">actually trust</span>.
          </h1>
          <p className="mt-5 text-slate-300 text-lg leading-relaxed">
            QR ordering, multi-branch operations, payments, and a kitchen display — one platform.
          </p>
        </div>
        <div className="relative mt-8 inline-flex items-center gap-2 text-sm text-slate-400">
          <Sparkles className="size-4 text-brand-400" />
          Currently in beta · India
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-md">
          <div className="text-center mb-7">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-700 mb-4">
              <ChefHat className="size-3.5" />
              Restaurant Admin
            </span>
            <h2 className="font-display text-3xl font-extrabold text-slate-900">
              Sign in to continue
            </h2>
            <p className="text-sm text-slate-500 mt-1.5">
              Manage your menu, orders, and team
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
            <Field label="Work email">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="rajesh@spicegarden.in"
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition text-sm"
                  autoFocus
                />
              </div>
            </Field>

            <Field label="Password">
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 py-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            {error && (
              <p className="text-sm text-rose-700 font-medium bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={cls(
                'w-full rounded-pill bg-blue-600 hover:bg-blue-700 text-white font-bold text-base py-3.5 transition active:scale-[0.98] flex items-center justify-center gap-2 shadow-cta',
                submitting && 'opacity-70 cursor-wait',
              )}
            >
              {submitting ? 'Signing in…' : (
                <>
                  Sign in
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>

            <p className="text-[11px] text-center text-slate-500">
              Real Supabase Auth · sessions persist across tabs.
            </p>
          </form>

          <div className="mt-7 text-center text-xs text-slate-500">
            Don't have an account? Ask your platform admin to provision one for you.
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-widest text-slate-600 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
