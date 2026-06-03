import { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

/**
 * Hides the admin chrome (sidebar + topbar) by toggling a body class.
 * The layout listens for this class and collapses everything except the
 * active route content — useful for KDS on a kitchen TV or Orders on a
 * pickup-counter monitor.
 *
 * State persists across reloads via localStorage, scoped to the page key.
 */
const BODY_CLASS = 'admin-fullscreen';
const STORAGE_PREFIX = 'foodcourt-fullscreen:';

export function useFullscreen(pageKey: string) {
  const [on, setOn] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_PREFIX + pageKey) === '1'; }
    catch { return false; }
  });

  useEffect(() => {
    if (on) document.body.classList.add(BODY_CLASS);
    else document.body.classList.remove(BODY_CLASS);
    try { localStorage.setItem(STORAGE_PREFIX + pageKey, on ? '1' : '0'); }
    catch { /* ignore */ }
    return () => { document.body.classList.remove(BODY_CLASS); };
  }, [on, pageKey]);

  // Press Esc to exit fullscreen
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOn(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);

  return { fullscreen: on, setFullscreen: setOn, toggle: () => setOn(v => !v) };
}

export function FullscreenButton({
  fullscreen, toggle, className = '',
}: { fullscreen: boolean; toggle: () => void; className?: string }) {
  return (
    <button
      onClick={toggle}
      className={`inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${className}`}
      title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen mode'}
    >
      {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
    </button>
  );
}
