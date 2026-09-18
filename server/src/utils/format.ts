/**
 * RouterOS duration strings: `1d2h30m`, `3w`, `24h`, `00:45:12`, `1d 00:45:12`.
 * Returns seconds, or null when the value cannot be understood (never 0 --
 * "unknown" and "zero" must stay distinguishable).
 */
export function parseRouterOsDuration(input: string | undefined | null): number | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (!value) return null;

  let total = 0;
  let matched = false;
  let rest = value;

  // Leading `1d` / `2w` components may precede an HH:MM:SS tail.
  const unitPattern = /(\d+(?:\.\d+)?)\s*(w|d|h|m|s|ms)/g;
  const unitSeconds: Record<string, number> = { w: 604800, d: 86400, h: 3600, m: 60, s: 1, ms: 0.001 };
  for (const match of value.matchAll(unitPattern)) {
    total += Number(match[1]) * (unitSeconds[match[2] as string] as number);
    matched = true;
    rest = rest.replace(match[0], ' ');
  }

  const clock = rest.match(/(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)/);
  if (clock) {
    total += Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    matched = true;
  }

  if (!matched) {
    // A bare number is treated as seconds, which is how RouterOS reads it too.
    if (/^\d+$/.test(value)) return Number(value);
    return null;
  }
  return Math.round(total);
}

/** Seconds -> the compact form MikroTik accepts back, e.g. 86400 -> "1d". */
export function toRouterOsDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, secs && `${secs}s`]
    .filter(Boolean)
    .join('') || '0s';
}

/** `500M`, `1.5G`, `1024` -> bytes. Null when unparseable. */
export function parseDataSize(input: string | undefined | null): number | null {
  if (input === undefined || input === null) return null;
  const value = String(input).trim().toUpperCase();
  if (!value) return null;
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(K|M|G|T)?B?$/);
  if (!match) return null;
  const multipliers: Record<string, number> = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  const unit = match[2];
  return Math.round(Number(match[1]) * (unit ? (multipliers[unit] as number) : 1));
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
