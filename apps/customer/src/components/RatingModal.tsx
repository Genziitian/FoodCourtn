import { useEffect, useState } from 'react';
import { cls } from '@foodcourt/shared';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => void;
  itemName?: string;
}

const TAGS = ['Tasty', 'Fast service', 'Hot &amp; fresh', 'Good portion', 'Friendly staff', 'Loved it'];

export function RatingModal({ open, onClose, onSubmit, itemName }: Props) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setRating(0); setHover(0); setComment(''); setSelected(new Set());
    }
  }, [open]);

  if (!open) return null;

  const submit = () => {
    if (rating < 1) return;
    const combined = [
      ...Array.from(selected),
      comment.trim(),
    ].filter(Boolean).join(' · ');
    onSubmit(rating, combined);
  };

  const headline = rating >= 5 ? "You loved it!" :
                   rating === 4 ? "Pretty great!" :
                   rating === 3 ? "Decent" :
                   rating === 2 ? "Could be better" :
                   rating === 1 ? "Sorry to hear that" :
                   "How was your meal?";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/45 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl flex flex-col animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
          <div className="w-10 h-1.5 bg-surface-dim/50 rounded-pill" />
        </div>
        <button onClick={onClose} className="absolute top-4 right-4 size-9 grid place-items-center rounded-full bg-surface-container-low" aria-label="Close">
          <Icon name="close" size={20} />
        </button>

        <div className="px-container-margin pt-10 pb-2 text-center">
          <h2 className="font-display text-headline-lg text-on-surface">{headline}</h2>
          {itemName && (
            <p className="text-on-surface-variant mt-1 text-sm">Rate your <strong>{itemName}</strong></p>
          )}
        </div>

        {/* Stars */}
        <div
          className="flex items-center justify-center gap-2 py-4"
          onMouseLeave={() => setHover(0)}
        >
          {[1,2,3,4,5].map(n => {
            const filled = (hover || rating) >= n;
            return (
              <button
                key={n}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                className={cls('transition active:scale-90', filled ? 'text-amber-400' : 'text-outline-variant')}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
              >
                <Icon name="star" size={44} fill={filled} weight={filled ? 700 : 400} />
              </button>
            );
          })}
        </div>

        {/* Tag chips */}
        <div className="px-container-margin pb-3">
          <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant text-center mb-3">
            What stood out?
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {TAGS.map(t => {
              const isSel = selected.has(t);
              return (
                <button
                  key={t}
                  onClick={() => setSelected(prev => {
                    const next = new Set(prev);
                    next.has(t) ? next.delete(t) : next.add(t);
                    return next;
                  })}
                  className={cls(
                    'rounded-pill px-3 py-1.5 text-label-sm font-semibold border transition',
                    isSel
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container-low border-outline-variant/40 text-on-surface-variant',
                  )}
                  dangerouslySetInnerHTML={{ __html: t }}
                />
              );
            })}
          </div>
        </div>

        {/* Comment */}
        <div className="px-container-margin pb-3">
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Tell us more (optional)"
            rows={3}
            className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary resize-none"
          />
        </div>

        <div className="border-t border-outline-variant/15 px-container-margin py-4 flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-pill bg-surface-container-low text-on-surface-variant font-semibold py-3"
          >
            Maybe later
          </button>
          <button
            onClick={submit}
            disabled={rating < 1}
            className={cls(
              'flex-[1.4] rounded-pill bg-primary text-on-primary font-display font-bold text-body-lg py-3 shadow-cta active:scale-[0.97]',
              rating < 1 && 'opacity-50 cursor-not-allowed',
            )}
          >
            Submit rating
          </button>
        </div>
      </div>
    </div>
  );
}
