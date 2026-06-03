export function inr(amount: number): string {
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}

export function inrFixed(amount: number, fraction = 0): string {
  return '₹' + amount.toLocaleString('en-IN', {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function elapsedMinSec(fromIso: string, now = Date.now()): string {
  const ms = now - new Date(fromIso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function cls(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(' ');
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
