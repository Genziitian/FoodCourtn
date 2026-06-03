import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cls } from '@foodcourt/shared';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Drawer({ open, onClose, title, subtitle, width = 'md', footer, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widthCls = width === 'sm' ? 'max-w-md' : width === 'lg' ? 'max-w-2xl' : 'max-w-xl';

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-slate-900/40 animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
      />
      <aside
        className={cls(
          'relative ml-auto h-full w-full bg-white shadow-2xl flex flex-col animate-[slideInRight_0.25s_cubic-bezier(0.16,1,0.3,1)]',
          widthCls,
        )}
      >
        <header className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="size-9 grid place-items-center rounded-full hover:bg-slate-100 text-slate-500"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer && (
          <footer className="px-6 py-4 border-t border-slate-100 bg-slate-50">
            {footer}
          </footer>
        )}
      </aside>

      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes fadeIn       { from { opacity: 0 }                  to { opacity: 1 } }
      `}</style>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const widthCls = width === 'sm' ? 'max-w-md' : width === 'lg' ? 'max-w-2xl' : 'max-w-xl';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 animate-[fadeIn_0.2s_ease-out]" onClick={onClose} />
      <div className={cls('relative bg-white rounded-2xl shadow-2xl flex flex-col w-full animate-[fadeIn_0.2s_ease-out]', widthCls)}>
        <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X className="size-5" />
          </button>
        </header>
        <div className="px-6 py-5">{children}</div>
        {footer && <footer className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">{footer}</footer>}
      </div>
    </div>
  );
}
