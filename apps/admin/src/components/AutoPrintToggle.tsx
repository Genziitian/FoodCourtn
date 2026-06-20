import { useEffect, useState } from 'react';
import { Printer, ChevronDown, Check } from 'lucide-react';
import { cls } from '@foodcourt/shared';
import { getAutoPrintMode, setAutoPrintMode, type AutoPrintMode } from '../lib/useAutoPrintNewOrders';

const OPTIONS: Array<{ value: AutoPrintMode; label: string; sub: string }> = [
  { value: 'off',      label: 'Off',                sub: "Don't auto-print" },
  { value: 'chef',     label: 'Chef KOT only',      sub: 'Kitchen ticket — for cooking stations' },
  { value: 'customer', label: 'Customer bill only', sub: 'Branded receipt — for cashier counter' },
  { value: 'both',     label: 'Both',               sub: 'Chef KOT + customer bill' },
];

/**
 * Compact dropdown that toggles auto-print on this device. Lives in the
 * Orders / KDS header. Persists in localStorage; broadcasts a custom event
 * so other tabs on the same device pick up the change.
 */
export function AutoPrintToggle() {
  const [mode, setMode] = useState<AutoPrintMode>(() => getAutoPrintMode());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onChange = (e: Event) => setMode((e as CustomEvent<AutoPrintMode>).detail);
    window.addEventListener('fc-autoprint-changed', onChange);
    return () => window.removeEventListener('fc-autoprint-changed', onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-autoprint-root]')) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const active = OPTIONS.find(o => o.value === mode) ?? OPTIONS[0];
  const isOn = mode !== 'off';

  return (
    <div className="relative" data-autoprint-root>
      <button
        onClick={() => setOpen(s => !s)}
        className={cls(
          'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition',
          isOn
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50',
        )}
        title="Auto-print new orders"
      >
        <Printer className="size-3.5" />
        <span className="hidden sm:inline">Auto-print:</span>
        <span>{active.label}</span>
        <ChevronDown className="size-3" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl bg-white shadow-lg border border-slate-200 z-30 overflow-hidden">
          {OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => { setAutoPrintMode(o.value); setOpen(false); }}
              className={cls(
                'w-full flex items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0',
                o.value === mode && 'bg-brand-50/50',
              )}
            >
              <span className="size-5 grid place-items-center shrink-0 mt-0.5">
                {o.value === mode && <Check className="size-4 text-brand-700" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">{o.label}</span>
                <span className="block text-[11px] text-slate-500 mt-0.5">{o.sub}</span>
              </span>
            </button>
          ))}
          <p className="px-3 py-2 text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">
            This setting is per-device. Each station can choose its own.
          </p>
        </div>
      )}
    </div>
  );
}
