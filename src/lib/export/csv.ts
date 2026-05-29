/**
 * Minimal RFC 4180 CSV emitter. No streaming — fine for the row counts a
 * personal-finance app produces (sub-10k for any realistic user).
 *
 * Quoting rules:
 *   - Wrap a field in double-quotes if it contains a comma, double-quote,
 *     CR, or LF.
 *   - Inside a quoted field, double a literal double-quote.
 *   - Lines are terminated by CRLF per the RFC.
 */

type CsvCell = string | number | boolean | null | undefined;

const NEEDS_QUOTING = /[",\r\n]/;

function escapeField(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  if (NEEDS_QUOTING.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeField).join(','));
  for (const row of rows) lines.push(row.map(escapeField).join(','));
  return lines.join('\r\n') + '\r\n';
}

/**
 * Today's date as YYYY-MM-DD in the server's local timezone — used in the
 * Content-Disposition filename so the download is self-dated.
 */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
