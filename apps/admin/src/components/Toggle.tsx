import { cls } from '@foodcourt/shared';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled }: Props) {
  const switchEl = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cls(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand-600' : 'bg-slate-300',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={cls(
          'inline-block size-5 transform rounded-full bg-white shadow transition',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
  if (!label) return switchEl;
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      {switchEl}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm text-slate-900">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}
