// Scoring sheets scores/<rater>.csv (task 0.14). Tolerant of how a spreadsheet saves them:
// comma, semicolon or tab as delimiter, quoted cells, decimal comma in edit_minutes.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { CRITICAL_CODES, type CriticalCode } from './record.js';

export interface Rating {
  rater: string;
  brief: string;
  variant: string;
  meaning: number;
  naturalness: number;
  edit_minutes: number;
  critical: CriticalCode[];
  /** Output id pre-filled in the sheet; binds the rating to the exact recorded answer. */
  output_sha: string | null;
  /** `<file>:<line>` for error messages. */
  at: string;
}

/** Rows of a CSV text: quotes per RFC 4180, delimiter detected from the header line. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const header = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = header.includes('\t')
    ? '\t'
    : header.includes(';') && !header.includes(',')
      ? ';'
      : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const REQUIRED = [
  'brief',
  'variant',
  'meaning_1_5',
  'naturalness_1_5',
  'edit_minutes',
  'critical_errors',
];

function score1to5(value: string, at: string, column: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5)
    throw new Error(`${at}: ${column} must be 1–5, got "${value}"`);
  return n;
}

/** Ratings of one sheet; the rater is the file name without `.csv`. */
export function parseRatings(text: string, file: string): Rating[] {
  const rater = basename(file, '.csv');
  const [header = [], ...rows] = parseCsv(text);
  const col = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const missing = REQUIRED.filter((c) => !col.has(c));
  if (missing.length > 0) throw new Error(`${file}: missing columns ${missing.join(', ')}`);
  return rows.map((cells, i) => {
    const at = `${basename(file)}:${i + 2}`;
    const get = (name: string): string => (cells[col.get(name) ?? -1] ?? '').trim();
    const minutes = Number(get('edit_minutes').replace(',', '.'));
    if (get('edit_minutes') === '' || !Number.isFinite(minutes) || minutes < 0)
      throw new Error(`${at}: edit_minutes must be a number ≥ 0, got "${get('edit_minutes')}"`);
    const codes = get('critical_errors')
      .split(/[\s,;|+]+/)
      .filter((c) => c !== '');
    const unknown = codes.filter((c) => !(CRITICAL_CODES as readonly string[]).includes(c));
    if (unknown.length > 0)
      throw new Error(
        `${at}: unknown critical_errors ${unknown.join(', ')} (allowed: ${CRITICAL_CODES.join(', ')})`,
      );
    return {
      rater,
      brief: get('brief'),
      variant: get('variant'),
      meaning: score1to5(get('meaning_1_5'), at, 'meaning_1_5'),
      naturalness: score1to5(get('naturalness_1_5'), at, 'naturalness_1_5'),
      edit_minutes: minutes,
      critical: [...new Set(codes)] as CriticalCode[],
      output_sha: get('output_sha') || null,
      at,
    };
  });
}

export const readRatings = (file: string): Rating[] =>
  parseRatings(readFileSync(file, 'utf8'), file);
