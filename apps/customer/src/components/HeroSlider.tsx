import { useEffect, useRef, useState } from 'react';

interface Props {
  images: string[];
  intervalMs?: number;
  /** Tailwind classes (height, rounding, etc.) added to the wrapper. */
  className?: string;
  /** Inline style overrides for the wrapper. Use this for non-standard heights. */
  style?: React.CSSProperties;
  /** Overlay content (badges, title, CTA) — rendered above the images. */
  children?: React.ReactNode;
}

/**
 * Auto-rotating hero image carousel used on the customer Landing page.
 *
 * - Images cross-fade every `intervalMs` (default 4500ms).
 * - Pagination dots at the bottom let the customer jump.
 * - Tap left / right half of the hero to step manually.
 * - Stops auto-cycling for 8s after manual interaction so the customer
 *   isn't fighting the timer.
 * - Renders nothing image-wise if `images` is empty — caller handles fallback.
 */
export function HeroSlider({ images, intervalMs = 4500, className, style, children }: Props) {
  const safe = images.filter(Boolean);
  const [idx, setIdx] = useState(0);
  const pausedUntil = useRef(0);

  useEffect(() => {
    if (safe.length < 2) return;
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setIdx(i => (i + 1) % safe.length);
    }, intervalMs);
    return () => clearInterval(t);
  }, [safe.length, intervalMs]);

  const goTo = (i: number) => {
    setIdx(((i % safe.length) + safe.length) % safe.length);
    pausedUntil.current = Date.now() + 8000;
  };
  const next = () => goTo(idx + 1);
  const prev = () => goTo(idx - 1);

  return (
    <div
      className={`relative w-full overflow-hidden ${className ?? ''}`}
      style={style}
    >
      {/* Layered images for a soft cross-fade */}
      {safe.map((src, i) => (
        <div
          key={src + i}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-out"
          style={{
            backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.1) 100%), url(${src})`,
            opacity: i === idx ? 1 : 0,
            zIndex: i === idx ? 1 : 0,
          }}
          aria-hidden={i !== idx}
        />
      ))}

      {/* Manual step targets — only when there are multiple images */}
      {safe.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-0 top-0 h-full w-1/4 z-10 bg-transparent"
            aria-label="Previous image"
          />
          <button
            type="button"
            onClick={next}
            className="absolute right-0 top-0 h-full w-1/4 z-10 bg-transparent"
            aria-label="Next image"
          />
        </>
      )}

      {/* Pagination dots */}
      {safe.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
          {safe.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to image ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-6 bg-white' : 'w-1.5 bg-white/50'}`}
            />
          ))}
        </div>
      )}

      {/* Overlay content (title, badges, CTA) — sits above the images */}
      <div className="relative z-20 h-full">{children}</div>
    </div>
  );
}
