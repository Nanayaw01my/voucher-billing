import { buildRow, type ParseResult } from './mikrotikCommandParser';

/** Minimal RFC4180-ish CSV splitter: quoted fields, doubled quotes, no newlines in fields. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i += 1; }
        else inQuotes = false;
      } else current += char;
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === ',') { fields.push(current.trim()); current = ''; continue; }
    current += char;
  }
  fields.push(current.trim());
  return fields;
}

/** Column aliases so an export from another tool still imports cleanly. */
const HEADER_ALIASES: Record<string, string> = {
  code: 'name',
  voucher: 'name',
  vouchercode: 'name',
  username: 'name',
  user: 'name',
  name: 'name',
  password: 'password',
  pass: 'password',
  profile: 'profile',
  mikrotikprofile: 'profile',
  limituptime: 'limit-uptime',
  'limit-uptime': 'limit-uptime',
  uptime: 'limit-uptime',
  duration: 'limit-uptime',
  limitbytestotal: 'limit-bytes-total',
  'limit-bytes-total': 'limit-bytes-total',
  datalimit: 'limit-bytes-total',
  comment: 'comment',
};

function normaliseHeader(header: string): string | null {
  return HEADER_ALIASES[header.trim().toLowerCase().replace(/[\s_]/g, '')] ?? null;
}

export function parseCsv(content: string, defaults: { profile?: string } = {}): { rows: ParseResult[]; raw: string[] } {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const raw: string[] = [];
  const rows: ParseResult[] = [];
  if (lines.length === 0) return { rows, raw };

  const headers = splitCsvLine(lines[0] as string).map(normaliseHeader);
  for (const line of lines.slice(1)) {
    raw.push(line);
    const values = splitCsvLine(line);
    const properties: Record<string, string> = {};
    if (defaults.profile) properties.profile = defaults.profile;
    headers.forEach((header, index) => {
      const value = values[index];
      if (header && value) properties[header] = value;
    });
    rows.push(buildRow(properties));
  }
  return { rows, raw };
}

export function parseJson(content: string, defaults: { profile?: string } = {}): { rows: ParseResult[]; raw: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { rows: [{ ok: false, reason: 'file is not valid JSON' }], raw: [''] };
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { vouchers?: unknown[] })?.vouchers;
  if (!Array.isArray(list)) {
    return { rows: [{ ok: false, reason: 'expected a JSON array of vouchers' }], raw: [''] };
  }

  const raw: string[] = [];
  const rows: ParseResult[] = list.map((entry) => {
    raw.push(JSON.stringify(entry));
    if (typeof entry !== 'object' || entry === null) return { ok: false as const, reason: 'entry is not an object' };
    const source = entry as Record<string, unknown>;
    const properties: Record<string, string> = {};
    if (defaults.profile) properties.profile = defaults.profile;
    for (const [key, value] of Object.entries(source)) {
      const header = normaliseHeader(key);
      if (header && value !== null && value !== undefined) properties[header] = String(value);
    }
    return buildRow(properties);
  });
  return { rows, raw };
}
