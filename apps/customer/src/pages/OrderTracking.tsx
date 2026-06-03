import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { OrderStatus } from '@foodcourt/shared';
import { cls, formatTime, inr, STATUS_LABEL, STATUS_SUBTITLE } from '@foodcourt/shared';
import { useOrder, useRestaurant } from '../lib/data';
import { Icon } from '../components/Icon';
import { BottomNav } from '../components/BottomNav';
import { RatingModal } from '../components/RatingModal';
import { NotificationOptIn } from '../components/NotificationOptIn';
import { submitFeedback } from '../lib/api';
import { useAuth } from '../lib/auth';

const STEPS: { status: OrderStatus; icon: string }[] = [
  { status: 'received',  icon: 'check_circle' },
  { status: 'preparing', icon: 'soup_kitchen' },
  { status: 'ready',     icon: 'notifications_active' },
  { status: 'completed', icon: 'restaurant' },
];

export default function OrderTracking() {
  const { slug, qrToken, code } = useParams();
  const navigate = useNavigate();
  const { restaurant } = useRestaurant(slug ?? '');
  const order = useOrder(code);
  const { customerId } = useAuth();
  const [ratingOpen, setRatingOpen] = useState(false);
  const [rated, setRated] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Auto-open rating modal once when order reaches completed (and not already rated)
  useEffect(() => {
    if (!order || rated) return;
    if (order.status === 'completed') {
      // small delay so the timeline animation finishes first
      const t = setTimeout(() => setRatingOpen(true), 700);
      return () => clearTimeout(t);
    }
  }, [order?.status, rated]);

  const goMenu = () => {
    const base = qrToken ? `/${slug}/t/${qrToken}` : `/${slug}`;
    navigate(`${base}/menu`);
  };

  if (!order || !restaurant) {
    return (
      <div className="min-h-screen grid place-items-center text-on-surface-variant">
        <div className="size-8 rounded-full border-2 border-surface-container-high border-t-primary animate-spin" />
      </div>
    );
  }

  const currentIdx = STEPS.findIndex(s => s.status === order.status);

  return (
    <div className="min-h-screen bg-background pb-24 font-sans">
      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 sticky top-0 z-40 flex items-center justify-between gap-3 px-container-margin h-16">
        <button
          onClick={goMenu}
          className="size-10 grid place-items-center rounded-full hover:bg-surface-container-high/50 active:scale-95 transition"
        >
          <Icon name="arrow_back" size={22} className="text-primary" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-headline-md text-on-surface truncate">{restaurant.name}</h1>
          <p className="text-label-sm text-secondary truncate">{restaurant.cuisines.join(' · ')}</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-container-margin pt-6 space-y-4">
        {/* Order Placed card */}
        <div className="card p-8 text-center">
          <div className="mx-auto size-16 rounded-full bg-primary grid place-items-center text-on-primary shadow-cta">
            <Icon name="check_circle" size={40} fill />
          </div>
          <h2 className="font-display text-[28px] font-extrabold mt-4 text-on-surface">Order Placed!</h2>
          <p className="text-on-surface-variant mt-1">
            {order.table_id ? `Table ${order.table_id ? '12' : ''} · ` : ''}
            {order.type === 'dine_in' ? 'Dine-in' : 'Takeaway'}
          </p>

          <div className="inline-block mt-4 px-6 py-3 rounded-2xl bg-primary/5 text-primary">
            <p className="text-[11px] uppercase tracking-wider text-primary/70">Order ID</p>
            <p className="text-2xl font-mono font-bold tracking-wider">{order.code}</p>
          </div>

          <p className="mt-4 inline-flex items-center gap-2 text-on-surface-variant">
            <Icon name="schedule" size={18} />
            Estimated: <strong className="text-on-surface">{order.estimated_min}–{order.estimated_max} mins</strong>
          </p>
        </div>

        {/* Push notification opt-in (hidden once decided) */}
        <NotificationOptIn />

        {/* Timeline */}
        <div className="card p-6">
          <h3 className="font-display text-headline-md text-on-surface">Order Status</h3>
          <ol className="mt-5 space-y-6 relative">
            {STEPS.map((step, idx) => {
              const isDone = idx < currentIdx;
              const isActive = idx === currentIdx;
              const isLast = idx === STEPS.length - 1;
              const event = order.status_events?.find(e => e.status === step.status);
              return (
                <li key={step.status} className="flex items-start gap-4 relative">
                  {!isLast && (
                    <span
                      className={cls(
                        'absolute left-5 top-10 w-0.5 h-12',
                        isDone ? 'bg-success' : 'bg-surface-variant',
                      )}
                    />
                  )}
                  <span
                    className={cls(
                      'shrink-0 size-10 grid place-items-center rounded-full border-2',
                      isDone   && 'bg-success border-success text-white',
                      isActive && 'bg-primary border-primary text-on-primary',
                      !isDone && !isActive && 'bg-white border-outline-variant text-on-surface-variant',
                    )}
                  >
                    <Icon name={step.icon} size={20} fill={isDone || isActive} />
                  </span>
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cls('font-semibold', !isDone && !isActive && 'text-on-surface-variant')}>
                        {STATUS_LABEL[step.status]}
                      </p>
                      <div className="text-label-sm text-secondary inline-flex items-center gap-1">
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-primary font-medium">
                            <span className="size-1.5 rounded-full bg-primary animate-pulse" /> In progress
                          </span>
                        )}
                        {event && <span>{formatTime(event.created_at)}</span>}
                      </div>
                    </div>
                    <p className={cls('text-label-sm mt-0.5', !isDone && !isActive ? 'text-on-surface-variant/60' : 'text-on-surface-variant')}>
                      {STATUS_SUBTITLE[step.status]}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Total */}
        <div className="card p-5 flex items-center justify-between">
          <span className="text-on-surface-variant">Amount Paid</span>
          <span className="font-display font-bold text-headline-md text-on-surface">{inr(order.total)}</span>
        </div>

        {/* Rate your order — appears once completed */}
        {order.status === 'completed' && (
          <button
            onClick={() => setRatingOpen(true)}
            className={cls(
              'w-full rounded-2xl px-5 py-4 flex items-center gap-3 active:scale-[0.99] transition border',
              rated
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200 text-amber-900',
            )}
          >
            <span className={cls(
              'size-10 grid place-items-center rounded-full shrink-0',
              rated ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-white',
            )}>
              <Icon name={rated ? 'check' : 'star'} size={20} fill />
            </span>
            <div className="flex-1 text-left">
              <p className="font-bold">{rated ? 'Thanks for the rating!' : 'How was your meal?'}</p>
              <p className="text-label-sm opacity-80">
                {rated ? 'Your feedback helps us improve.' : 'Tap to rate your order'}
              </p>
            </div>
            <Icon name="chevron_right" size={20} />
          </button>
        )}
      </main>

      <RatingModal
        open={ratingOpen}
        onClose={() => setRatingOpen(false)}
        onSubmit={async (rating, comment) => {
          setFeedbackError(null);
          try {
            await submitFeedback({
              restaurant_id: order.restaurant_id,
              order_id: order.id,
              customer_id: customerId,
              rating,
              comment,
            });
            setRated(true);
            setRatingOpen(false);
          } catch (e: any) {
            setFeedbackError(e?.message ?? 'Could not submit rating');
          }
        }}
        itemName={order.code}
      />
      {feedbackError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-error-container/95 backdrop-blur text-error-text text-sm font-semibold px-4 py-2 shadow-cta">
          {feedbackError}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
