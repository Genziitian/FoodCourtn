import { useEffect, useState } from 'react';
import { cls } from '@foodcourt/shared';
import { Icon } from './Icon';

const DISMISS_KEY = 'foodcourt-push-dismissed-v1';

type Status = 'idle' | 'granted' | 'denied' | 'unsupported' | 'dismissed';

function initial(): Status {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  try {
    if (localStorage.getItem(DISMISS_KEY) === '1') return 'dismissed';
  } catch { /* ignore */ }
  return 'idle';
}

export function NotificationOptIn() {
  const [status, setStatus] = useState<Status>(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // re-check on focus in case the user changed it in browser settings
    const onFocus = () => setStatus(initial());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (status !== 'idle') return null;

  const enable = async () => {
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        setStatus('granted');
        try {
          new Notification('You\'re all set!', {
            body: 'We\'ll let you know when your order is on the way.',
            silent: true,
          });
        } catch { /* ignore */ }
      } else if (result === 'denied') {
        setStatus('denied');
      }
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setStatus('dismissed');
  };

  return (
    <div className="card p-4 flex items-start gap-3">
      <span className="size-10 grid place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
        <Icon name="notifications_active" size={20} fill />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-on-surface">Get order updates</p>
        <p className="text-label-sm text-on-surface-variant mt-0.5">
          Allow notifications so we can ping you when your food is ready.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={enable}
            disabled={busy}
            className={cls(
              'rounded-pill bg-primary text-on-primary text-label-bold px-4 py-2 shadow-cta active:scale-95 transition',
              busy && 'opacity-70',
            )}
          >
            {busy ? 'Asking…' : 'Enable'}
          </button>
          <button
            onClick={dismiss}
            className="text-label-sm font-semibold text-on-surface-variant hover:bg-surface-container-low rounded-lg px-3 py-2"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
