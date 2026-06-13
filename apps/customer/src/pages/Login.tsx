import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cls } from '@foodcourt/shared';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/Icon';
import { HeroSlider } from '../components/HeroSlider';

type Step = 'phone' | 'otp';

// Same fallback bank as Landing/Menu so the customer sees consistent food
// imagery even before a restaurant context is loaded. Owner-uploaded photos
// will replace these on the restaurant pages — Login is brand-neutral.
const LOGIN_HEROES = [
  'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=1600',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600',
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1600',
];

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sendOtp, verifyOtp, signInAsGuest } = useAuth();

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/the-spice-route/t/sr-t12';

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName]   = useState('');
  const [otp, setOtp]     = useState(['', '', '', '', '', '']);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const continueAsGuest = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Enter your name to continue as guest.');
      return;
    }
    setGuestSubmitting(true);
    try {
      await signInAsGuest(name.trim());
      navigate(redirectTo, { replace: true });
    } catch (e: any) {
      setError(e?.message ?? 'Could not continue as guest. Try again.');
    } finally {
      setGuestSubmitting(false);
    }
  };

  useEffect(() => {
    if (step !== 'otp' || resendIn <= 0) return;
    const t = setInterval(() => setResendIn(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [step, resendIn]);

  const sendPhoneOtp = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Please enter your name to continue');
      return;
    }
    const trimmed = phone.replace(/\D/g, '').slice(-10);
    if (trimmed.length !== 10) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setSending(true);
    try {
      await sendOtp(trimmed);
      setStep('otp');
      setResendIn(30);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally {
      setSending(false);
    }
  };

  const handleOtpChange = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(0, 1);
    setOtp(prev => {
      const next = [...prev];
      next[i] = digit;
      return next;
    });
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length < 4) return;
    e.preventDefault();
    setOtp(text.padEnd(6, '').split('').slice(0, 6));
    otpRefs.current[Math.min(5, text.length - 1)]?.focus();
  };

  const verify = async () => {
    setError(null);
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Enter all 6 digits');
      return;
    }
    if (!name.trim()) {
      setError('Please go back and enter your name');
      return;
    }
    setVerifying(true);
    try {
      await verifyOtp(phone, code, name.trim());
      navigate(redirectTo, { replace: true });
    } catch {
      setError('Invalid OTP. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-background">
      {/* Hero — rotating food photography slider */}
      <HeroSlider images={LOGIN_HEROES} style={{ height: '16rem' }}>
        <div className="absolute inset-0 z-30">
          <button
            onClick={() => navigate(-1)}
            className="absolute top-4 left-4 size-10 grid place-items-center rounded-full bg-white/15 backdrop-blur-md text-white active:scale-95"
            aria-label="Back"
          >
            <Icon name="arrow_back" size={22} />
          </button>
          <div className="absolute bottom-0 left-0 right-0 p-container-margin text-white">
            <p className="text-label-bold tracking-widest uppercase opacity-80">FoodCourt</p>
            <h1 className="font-display text-[28px] font-extrabold leading-tight mt-1">
              {step === 'phone' ? "Let's get you signed in" : 'Enter the code we sent'}
            </h1>
          </div>
        </div>
      </HeroSlider>

      {/* Card */}
      <main className="flex-1 max-w-md w-full mx-auto px-container-margin py-8 -mt-6 relative z-10">
        <div className="bg-surface-container-lowest rounded-3xl shadow-card p-6 space-y-5">
          {step === 'phone' ? (
            <>
              <div>
                <p className="text-sm text-on-surface-variant">
                  We'll send a one-time password to verify your number. No password required.
                </p>
              </div>

              <Field label="Mobile number">
                <div className="flex items-center rounded-xl border border-outline-variant/40 bg-surface-container-low overflow-hidden focus-within:border-primary">
                  <span className="px-3 text-on-surface-variant text-sm font-semibold border-r border-outline-variant/40">+91</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="flex-1 px-4 py-3 bg-transparent outline-none text-on-surface text-body-md tracking-wide"
                    autoFocus
                  />
                </div>
              </Field>

              <Field label="Your name">
                <input
                  type="text"
                  placeholder="What should we call you?"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 outline-none focus:border-primary text-on-surface"
                  autoComplete="name"
                  required
                />
              </Field>

              {error && <p className="text-sm text-error font-medium">{error}</p>}

              <button
                onClick={sendPhoneOtp}
                disabled={sending || guestSubmitting}
                className={cls('w-full rounded-2xl bg-primary text-on-primary font-display font-bold text-body-lg py-4 shadow-cta active:scale-[0.97] transition flex items-center justify-center gap-2', sending && 'opacity-70')}
              >
                {sending ? 'Sending OTP…' : (
                  <>
                    Send OTP
                    <Icon name="arrow_forward" size={20} />
                  </>
                )}
              </button>

              {/* "or continue as guest" — name-only sign-in. Phone left blank.
                  Guests place orders and see their tracking, but coupons,
                  loyalty coins and promotional offers stay locked. */}
              <div className="flex items-center gap-3 text-label-sm text-on-surface-variant/70">
                <span className="flex-1 h-px bg-outline-variant/40" />
                <span>or</span>
                <span className="flex-1 h-px bg-outline-variant/40" />
              </div>

              <button
                onClick={continueAsGuest}
                disabled={guestSubmitting || sending}
                className={cls(
                  'w-full rounded-2xl border-2 border-outline-variant/50 bg-surface-container-lowest text-on-surface font-display font-bold text-body-lg py-3.5 active:scale-[0.98] transition flex items-center justify-center gap-2',
                  guestSubmitting && 'opacity-70',
                )}
              >
                <Icon name="person" size={20} />
                {guestSubmitting ? 'Continuing…' : 'Continue as guest'}
              </button>
              <p className="text-center text-[11px] text-on-surface-variant/70">
                Guests can order without OTP. Coupons, coins, and offers are only for verified accounts.
              </p>

              <div className="text-center text-label-sm text-on-surface-variant">
                By continuing, you agree to our Terms & Privacy.
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm text-on-surface-variant">
                  We sent a 6-digit code to <strong className="text-on-surface">+91 {phone}</strong>.{' '}
                  <button onClick={() => setStep('phone')} className="text-primary font-semibold">Change</button>
                </p>
              </div>

              <div className="flex justify-between gap-2">
                {otp.map((d, i) => (
                  <input
                    key={i}
                    ref={el => { otpRefs.current[i] = el; }}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKey(i, e)}
                    onPaste={handleOtpPaste}
                    className="w-12 h-14 text-center font-display text-headline-md font-bold rounded-xl border-2 border-outline-variant bg-surface-container-low focus:border-primary focus:bg-white outline-none transition"
                  />
                ))}
              </div>

              {error && <p className="text-sm text-error font-medium">{error}</p>}

              <button
                onClick={verify}
                disabled={verifying || otp.join('').length !== 6}
                className={cls('w-full rounded-2xl bg-primary text-on-primary font-display font-bold text-body-lg py-4 shadow-cta active:scale-[0.97] transition flex items-center justify-center gap-2', verifying && 'opacity-70')}
              >
                {verifying ? 'Verifying…' : 'Verify & sign in'}
              </button>

              <div className="text-center text-label-sm text-on-surface-variant">
                Didn't get it?{' '}
                {resendIn > 0 ? (
                  <span>Resend in {resendIn}s</span>
                ) : (
                  <button
                    onClick={sendPhoneOtp}
                    className="text-primary font-semibold"
                  >
                    Resend OTP
                  </button>
                )}
              </div>

              <p className="text-[11px] text-center text-on-surface-variant/60">
                Demo mode — any 6 digits work.
              </p>
            </>
          )}
        </div>

        {/* Other portals */}
        <div className="mt-6 text-center text-label-sm text-on-surface-variant">
          Are you restaurant staff?{' '}
          <a href={`${(import.meta.env.VITE_ADMIN_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000'}/login`} className="text-primary font-semibold">
            Open admin login
          </a>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
        {label}
      </span>
      {children}
    </label>
  );
}
