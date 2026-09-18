import { parseRouterOsDuration, parseDataSize } from '../../utils/format';

/**
 * Parses RouterOS *text* such as:
 *
 *   /ip hotspot user add name=D4BKB3UD password=D4BKB3UD profile="VOUCHER-24H-1CODE" limit-uptime=24h
 *
 * This is a parser, not an executor. Imported text is never handed to a shell
 * and never forwarded to a router as a raw sentence: only the structured fields
 * below are used, and only after passing the whitelist.
 */

/** The single command form this importer accepts. Anything else is rejected. */
const ALLOWED_COMMAND = '/ip hotspot user add';

const ALLOWED_PROPERTIES = new Set([
  'name',
  'password',
  'profile',
  'limit-uptime',
  'limit-bytes-total',
  'limit-bytes-in',
  'limit-bytes-out',
  'comment',
  'server',
  'disabled',
]);

/** Voucher codes and profile names must stay safe to echo back into a sentence. */
const SAFE_VALUE = /^[A-Za-z0-9._@:-]+$/;
const SAFE_PROFILE = /^[A-Za-z0-9 ._@:-]+$/;

export interface ParsedVoucherRow {
  code: string;
  username: string;
  password: string;
  profileName: string;
  limitUptimeSeconds?: number;
  dataLimitBytes?: number;
  comment?: string;
  disabled?: boolean;
}

export type ParseResult =
  | { ok: true; value: ParsedVoucherRow }
  | { ok: false; reason: string };

/**
 * Splits a RouterOS line into words, honouring double quotes so that
 * `profile="VOUCHER-24H-1CODE"` survives as one token. Backslash escapes inside
 * quotes are respected, as RouterOS does.
 */
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let started = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] as string;
    if (char === '\\' && inQuotes && i + 1 < line.length) {
      current += line[i + 1];
      i += 1;
      started = true;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      started = true;
      continue;
    }
    if (!inQuotes && /\s/.test(char)) {
      if (started) tokens.push(current);
      current = '';
      started = false;
      continue;
    }
    current += char;
    started = true;
  }
  if (inQuotes) throw new Error('unterminated quote');
  if (started) tokens.push(current);
  return tokens;
}

export function parseMikrotikUserCommand(line: string): ParseResult {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return { ok: false, reason: 'blank or comment line' };

  let tokens: string[];
  try {
    tokens = tokenize(trimmed);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'could not tokenize line' };
  }

  // The command is everything before the first `key=value` token.
  const firstProperty = tokens.findIndex((token) => token.includes('='));
  if (firstProperty <= 0) return { ok: false, reason: 'no command properties found' };

  const command = tokens.slice(0, firstProperty).join(' ').toLowerCase();
  if (command !== ALLOWED_COMMAND) {
    return { ok: false, reason: `unsupported command "${command}" (only "${ALLOWED_COMMAND}" is accepted)` };
  }

  const properties: Record<string, string> = {};
  for (const token of tokens.slice(firstProperty)) {
    const separator = token.indexOf('=');
    if (separator <= 0) return { ok: false, reason: `malformed property "${token}"` };
    const key = token.slice(0, separator).toLowerCase();
    const value = token.slice(separator + 1);
    if (!ALLOWED_PROPERTIES.has(key)) return { ok: false, reason: `property "${key}" is not allowed by the importer` };
    properties[key] = value;
  }

  return buildRow(properties);
}

/** Shared validation for every source format (TXT, CSV, JSON). */
export function buildRow(properties: Record<string, string>): ParseResult {
  const name = properties.name?.trim();
  if (!name) return { ok: false, reason: 'missing name' };
  if (!SAFE_VALUE.test(name)) return { ok: false, reason: `name "${name}" contains unsupported characters` };
  if (name.length > 64) return { ok: false, reason: 'name is longer than 64 characters' };

  // MikroTik allows an empty hotspot password; we mirror the username instead,
  // which is what the existing voucher stock in this business already does.
  const password = properties.password?.trim() || name;
  if (!SAFE_VALUE.test(password)) return { ok: false, reason: 'password contains unsupported characters' };

  const profileName = properties.profile?.trim();
  if (!profileName) return { ok: false, reason: 'missing profile' };
  if (!SAFE_PROFILE.test(profileName)) return { ok: false, reason: `profile "${profileName}" contains unsupported characters` };

  let limitUptimeSeconds: number | undefined;
  if (properties['limit-uptime']) {
    const parsed = parseRouterOsDuration(properties['limit-uptime']);
    if (parsed === null) return { ok: false, reason: `could not read limit-uptime "${properties['limit-uptime']}"` };
    limitUptimeSeconds = parsed;
  }

  let dataLimitBytes: number | undefined;
  const rawLimitBytes = properties['limit-bytes-total'];
  if (rawLimitBytes) {
    const parsed = parseDataSize(rawLimitBytes);
    if (parsed === null) return { ok: false, reason: `could not read limit-bytes-total "${rawLimitBytes}"` };
    dataLimitBytes = parsed;
  }

  return {
    ok: true,
    value: {
      code: name.toUpperCase(),
      username: name,
      password,
      profileName,
      ...(limitUptimeSeconds !== undefined ? { limitUptimeSeconds } : {}),
      ...(dataLimitBytes !== undefined ? { dataLimitBytes } : {}),
      ...(properties.comment ? { comment: properties.comment } : {}),
      ...(properties.disabled ? { disabled: properties.disabled === 'yes' || properties.disabled === 'true' } : {}),
    },
  };
}
