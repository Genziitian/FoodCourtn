import { cls, inr } from '@foodcourt/shared';

// ────────────────────────────────────────────────────────────
// SimpleBarChart — hourly sales, vertical bars with peak highlight.
// ────────────────────────────────────────────────────────────

interface BarDatum { label: string; value: number; highlight?: boolean }

export function SimpleBarChart({
  data, formatValue = inr, height = 180,
}: { data: BarDatum[]; formatValue?: (n: number) => string; height?: number }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
              <span className="text-[10px] font-semibold text-slate-500 opacity-0 group-hover:opacity-100 transition">
                {formatValue(d.value)}
              </span>
              <div className="w-full bg-slate-100 rounded-md overflow-hidden flex items-end" style={{ height: '100%' }}>
                <div
                  className={cls(
                    'w-full rounded-md transition-all',
                    d.highlight ? 'bg-brand-600' : 'bg-brand-200 group-hover:bg-brand-400',
                  )}
                  style={{ height: `${h}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-2">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[10px] font-medium text-slate-500">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Donut — payment breakdown.
// ────────────────────────────────────────────────────────────

interface DonutSlice { label: string; value: number; color: string }

export function Donut({
  slices, size = 160, stroke = 22, centerLabel,
}: { slices: DonutSlice[]; size?: number; stroke?: number; centerLabel?: { top: string; bottom: string } }) {
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={cx} cy={cy} r={r} stroke="#F1F5F9" strokeWidth={stroke} fill="none" />
          {slices.map((s, i) => {
            const len = (s.value / total) * circumference;
            const dasharray = `${len} ${circumference - len}`;
            const el = (
              <circle
                key={i}
                cx={cx} cy={cy} r={r}
                stroke={s.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={dasharray}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        {centerLabel && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{centerLabel.top}</p>
              <p className="text-xl font-bold mt-0.5">{centerLabel.bottom}</p>
            </div>
          </div>
        )}
      </div>
      <ul className="flex-1 space-y-2 min-w-0">
        {slices.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className="size-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="truncate text-slate-700">{s.label}</span>
            </span>
            <span className="font-semibold text-slate-900 shrink-0">
              {((s.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sparkline — small line chart for stat cards.
// ────────────────────────────────────────────────────────────

export function Sparkline({
  values, color = '#EA580C', height = 36, width = 100,
}: { values: number[]; color?: string; height?: number; width?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} className="block">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(' ')}
      />
    </svg>
  );
}
