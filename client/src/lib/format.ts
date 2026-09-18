export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${seconds}s`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatMoney(amount: number | null | undefined, currency = 'GHS'): string {
  if (amount === null || amount === undefined) return '—';
  const symbols: Record<string, string> = { GHS: 'GH₵', USD: '$', EUR: '€', GBP: '£', NGN: '₦' };
  return `${symbols[currency] ?? `${currency} `}${amount.toFixed(2)}`;
}

/** Turns a populated-or-id reference into a display name. */
export function nameOf(ref: unknown, fallback = '—'): string {
  if (!ref) return fallback;
  if (typeof ref === 'string') return fallback;
  return (ref as { name?: string }).name ?? fallback;
}

export function idOf(ref: unknown): string | undefined {
  if (!ref) return undefined;
  if (typeof ref === 'string') return ref;
  return (ref as { _id?: string })._id;
}
