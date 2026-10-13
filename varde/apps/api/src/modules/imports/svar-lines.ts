// Parsing of kartlegging svar.jsonl (1.8): line → rejected with a reason, or a candidate row.
// Reasons: invalid_json, no_id, duplicate_id (both lines), unknown_skjema, unknown_versjon,
// unknown_client. Contents never leave this module in a manifest (line number + reason only).

export interface SvarLine {
  id?: unknown;
  tid?: unknown;
  skjema?: unknown;
  k?: unknown;
  lang?: unknown;
  versjon?: unknown;
  leiardel?: unknown;
  sekund?: unknown;
  svar?: unknown;
  fri?: unknown;
}

export interface Candidate {
  line: number;
  id: string;
  skjema: string;
  k: string;
  /** key@label of the template version (import-map.json). */
  version: string;
  lang: 'nn' | 'en';
  leiardel: boolean;
  day: string;
  sekund: number | null;
  svar: Record<string, unknown>;
  fri: Record<string, unknown>;
}

export interface Rejected {
  line: number;
  reason: string;
  leiardel: boolean;
}

export type ImportMap = Record<string, Record<string, string>>;

const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function parseSvar(
  text: string,
  map: ImportMap,
  clients: ReadonlySet<string>,
): { candidates: Candidate[]; rejected: Rejected[]; lines: number; leiardel: number } {
  const raw = text
    .split('\n')
    .map((l, i) => ({ line: i + 1, text: l.trim() }))
    .filter((l) => l.text !== '');
  const parsed = raw.map(({ line, text: t }) => {
    try {
      return { line, row: JSON.parse(t) as SvarLine };
    } catch {
      return { line, row: null };
    }
  });
  const ids = new Map<string, number>();
  for (const p of parsed) {
    const id = p.row?.id;
    if (typeof id === 'string' && id !== '') ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  const candidates: Candidate[] = [];
  const rejected: Rejected[] = [];
  let leiardel = 0;
  for (const { line, row } of parsed) {
    const leader = row?.leiardel === true;
    if (leader) leiardel += 1;
    const reject = (reason: string) => rejected.push({ line, reason, leiardel: leader });
    if (row === null) {
      reject('invalid_json');
      continue;
    }
    const id = typeof row.id === 'string' ? row.id : '';
    const skjema = typeof row.skjema === 'string' ? row.skjema : '';
    const k = typeof row.k === 'string' ? row.k : '';
    const versjon = typeof row.versjon === 'string' ? row.versjon : '';
    if (id === '') reject('no_id');
    else if ((ids.get(id) ?? 0) > 1) reject('duplicate_id');
    else if (map[skjema] === undefined) reject('unknown_skjema');
    else if (map[skjema]?.[versjon] === undefined) reject('unknown_versjon');
    else if (!clients.has(k)) reject('unknown_client');
    else {
      const tid = typeof row.tid === 'string' ? row.tid : '';
      const sekund =
        Number.isInteger(row.sekund) && (row.sekund as number) > 0 ? (row.sekund as number) : null;
      candidates.push({
        line,
        id,
        skjema,
        k,
        version: map[skjema]?.[versjon] ?? '',
        lang: row.lang === 'en' ? 'en' : 'nn',
        leiardel: leader,
        day: /^\d{4}-\d{2}-\d{2}/.test(tid) ? tid.slice(0, 10) : '1970-01-01',
        sekund,
        svar: obj(row.svar),
        fri: obj(row.fri),
      });
    }
  }
  return { candidates, rejected, lines: parsed.length, leiardel };
}
