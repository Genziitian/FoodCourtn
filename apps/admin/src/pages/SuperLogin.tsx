import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Lock, Mail, Shield, ShieldCheck, Sparkles } from 'lucide-react';
import { cls } from '@foodcourt/shared';
import { useSession } from '../lib/session';
import { isValidEmail } from '../lib/api';

type Mode = 'signin' | 'signup';

/**
 * Hidden /super/login route — separate from the regular admin /login.
 *
 * Only platform admins should know this URL exists. The normal admin login
 * page intentionally does NOT link here so that customers and restaurant
 * staff have no surface area onto super-admin sign-in.
 *
 * Behaviour:
 *   • On success (platform admin) → redirect to /super.
 *   • Signed in but NOT a platform admin → show an explicit "wrong portal"
 *     message instead of dumping them into the org dashboard. They can still
 *     navigate to /login on their own if they're a regular admin.
 *   • Sign-up path remains available so the first install can bootstrap
 *     the very first super admin. After that, additional super admins are
 *     created from inside Super Admin → Admins.
 */
export default function SuperLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, admin, signIn, signUp } = useSession();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Once role-resolution finishes, route by role.
  useEffect(() => {
    if (state !== 'authed' || !admin) return;
    const requestedFrom = (location.state as { from?: string } | null)?.from;
    if (admin.isPlatformAdmin) {
      navigate(requestedFrom?.startsWith('/super') ? requestedFrom : '/super', { replace: true });
    } else {
      setError(
        'Signed in, but this account is not a platform admin. Please use the regular admin login.',
      );
    }
  }, [state, admin, navigate, location.state]);

  const submit = async () => {
    setError(null); setInfo(null);
    if (!email || !password) { setError('Email and password are required'); return; }
    if (!isValidEmail(email)) { setError('Email looks malformed — use name@example.com'); return; }
    if (mode === 'signup' && !name.trim()) { setError('Please enter your name'); return; }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        const result = await signUp(email, password, name.trim());
        if (result.becameSuperAdmin) {
          setInfo('You\'re the first platform admin — your account was promoted to Super Admin. Redirecting…');
        } else {
          setInfo('Account created, but a platform admin already exists. Ask them to grant you access from Super Admin → Admins.');
        }
      }
    } catch (e: any) {
      const msg = e?.message ?? 'Sign in failed';
      if (/invalid login credentials/i.test(msg)) {
        setError('Invalid email or password. Double-check the values, or contact another platform admin.');
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
    <div className="min-h-screen flex bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 text-white">
      <div className="hidden lg:flex flex-col w-[44%] p-12 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 size-72 rounded-full bg-purple-500/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 size-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="size-10 grid place-items-center rounded-full bg-purple-500/20">
            <ShieldCheck className="size-6 text-purple-300" />
          </span>
          <span className="font-extrabold text-xl">FoodCourt · Platform</span>
        </div>
        <div className="relative mt-auto">
          <p className="text-xs uppercase tracking-widest text-purple-300 font-bold mb-3">Restricted access</p>
          <h1 className="font-display text-4xl lg:text-5xl font-extrabold leading-tight">
            Platform administration <span className="text-purple-400">portal</span>.
          </h1>
          <p className="mt-5 text-slate-300 text-lg leading-relaxed">
            Multi-tenant oversight, billing, support, and health. Sessions are logged and audited.
          </p>
        </div>
        <div className="relative mt-8 inline-flex items-center gap-2 text-sm text-slate-400">
          <Sparkles className="size-4 text-purple-400" />
          Authorized personnel only
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 overflow-y-auto">
        <div className="w-full max-w-md">
          <div className="text-center mb-7">
            <span className="inline-flex items-center gap-2 rounded-full bg-purple-500/15 border border-purple-500/30 px-3 py-1 text-xs font-bold uppercase tracking-widest text-purple-300 mb-4">
              <Shield className="size-3.5" />
              Platform Admin
            </span>
            <h2 className="font-display text-3xl font-extrabold">
              {mode === 'signin' ? 'Sign in to the platform' : 'Bootstrap super admin'}
            </h2>
            <p className="text-sm text-slate-400 mt-1.5">
              {mode === 'signin'
                ? 'Access the multi-tenant control panel'
                : 'First account on this install is promoted automatically'}
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
            {mode === 'signup' && (
              <Field label="Your name">
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Priya Sharma"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-3 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 transition text-sm text-white"
                />
              </Field>
            )}

            <Field label="Work email">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@foodcourt.app"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/50 pl-10 pr-3 py-3 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 transition text-sm text-white"
                  autoFocus
                />
              </div>
            </Field>

            <Field
              label="Password"
              trailing={
                <button
                  type="button"
                  onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null); }}
                  className="text-xs font-semibold text-purple-300 hover:underline"
                >
                  {mode === 'signin' ? 'Bootstrap account' : 'Have an account? Sign in'}
                </button>
              }
            >
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/50 pl-10 pr-10 py-3 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 transition text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            {mode === 'signup' && (
              <div className="rounded-xl bg-purple-500/10 border border-purple-500/30 px-3 py-2 text-xs text-purple-100 flex items-start gap-2">
                <Shield className="size-4 mt-0.5 shrink-0" />
                <span>
                  The very first signup here is promoted to <strong>super_admin</strong>. After that, additional platform admins are created from inside the dashboard.
                </span>
              </div>
            )}

            {error && (
              <p className="text-sm font-medium bg-rose-500/15 border border-rose-500/40 text-rose-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {info && (
              <p className="text-sm font-medium bg-emerald-500/15 border border-emerald-500/40 text-emerald-100 rounded-lg px-3 py-2">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={cls(
                'w-full rounded-pill bg-purple-600 hover:bg-purple-500 text-white font-bold text-base py-3.5 transition active:scale-[0.98] flex items-center justify-center gap-2 shadow-cta',
                submitting && 'opacity-70 cursor-wait',
              )}
            >
              {submitting
                ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                : (
                    <>
                      {mode === 'signin' ? 'Sign in as Platform Admin' : 'Create Platform Admin account'}
                      <ArrowRight className="size-4" />
                    </>
                  )}
            </button>

            <p className="text-[11px] text-center text-slate-500">
              Supabase Auth · Session pinned to this device.
            </p>
          </form>

          <div className="mt-7 text-center text-xs text-slate-500">
            Restaurant team? <a href="/login" className="text-purple-300 font-semibold hover:underline">Open admin login</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, trailing, children }: { label: string; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
        {label}
        {trailing}
      </span>
      {children}
    </label>
  );
}
