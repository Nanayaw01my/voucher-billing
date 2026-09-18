type Level = 'debug' | 'info' | 'warn' | 'error';

// Values under these keys are never written to the log, at any depth.
const REDACTED_KEYS = new Set([
  'password', 'passwordhash', 'encryptedpassword', 'routerpassword',
  'token', 'authorization', 'jwt', 'secret', 'voucherpassword',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACTED_KEYS.has(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

function emit(level: Level, message: string, meta?: unknown): void {
  const line = { ts: new Date().toISOString(), level, message, ...(meta ? { meta: redact(meta) } : {}) };
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const logger = {
  debug: (m: string, meta?: unknown) => emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
