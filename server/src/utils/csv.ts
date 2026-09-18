/** Escapes a value for CSV, including the leading-quote guard against formula injection. */
function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<{ key: keyof T & string; label: string }>): string {
  const header = columns.map((c) => escapeCsv(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsv(row[c.key])).join(','));
  return [header, ...body].join('\r\n');
}
