/** Excel-safe UTF-8 semicolon CSV, including quoted free text. */
export function cell(value: unknown): string {
  let text = '';
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    text = String(value);
  else if (value != null) text = JSON.stringify(value) ?? '';
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function csv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return '\uFEFF' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
