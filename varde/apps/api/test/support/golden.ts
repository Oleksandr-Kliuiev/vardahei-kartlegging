// Readers of the golden of the old dashboard (1.2c, tools/parity/golden) and of released
// snapshots (via plain pg, lint 0.2b) for the parity tests (1.10 and later).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { API_DIR } from './prisma-cli.js';
import { withPg } from './rounds.js';
import { seedContent } from './seed-dir.js';

export const GOLDEN_DIR = join(API_DIR, '..', '..', 'tools', 'parity', 'golden');

export interface GoldenView {
  meta: string;
  sections: { title: string; tables: string[][][]; lines: string[] }[];
}

export const golden = (name: string): GoldenView =>
  JSON.parse(readFileSync(join(GOLDEN_DIR, name), 'utf8')) as GoldenView;

export function section(g: GoldenView, title: string): GoldenView['sections'][number] {
  const s = g.sections.find((x) => x.title === title);
  if (s === undefined) throw new Error(`golden: no section ${title}`);
  return s;
}

/** "1,14" → 1.14; "32 %" → 32. */
export const num = (s: string): number =>
  Number(s.replace('%', '').replace(',', '.').replace('−', '-').trim());

type Q = {
  id: string;
  type: string;
  part: string;
  texts: { text: { nn: string }; short_label?: { nn: string } };
  options?: { id: string; texts: { text: { nn: string } } }[];
};
export const questions = (template: string): Q[] =>
  seedContent(template).questions as unknown as Q[];

/**
 * Distribution blocks ("<question>", "<N> svar", then "<option>", "<count> · <pct> %") of the
 * single/multi questions of `template` found in `lines`.
 */
export function distributions(
  lines: readonly string[],
  template: string,
  part = 'common',
): Map<string, { n: number; counts: Map<string, number> }> {
  const qs = questions(template);
  const texts = new Set(qs.map((q) => q.texts.text.nn));
  const out = new Map<string, { n: number; counts: Map<string, number> }>();
  for (const q of qs.filter(
    (x) => x.part === part && (x.type === 'single' || x.type === 'multi'),
  )) {
    const at = lines.indexOf(q.texts.text.nn);
    if (at < 0) continue;
    const n = /^(\d+) svar$/.exec(lines[at + 1] ?? '')?.[1];
    if (n === undefined) continue;
    const counts = new Map<string, number>();
    for (let i = at + 2; i < lines.length && !texts.has(lines[i] ?? ''); i += 1) {
      const m = /^(\d+) · \d+ %$/.exec(lines[i] ?? '');
      const label = lines[i - 1] ?? '';
      const opt = q.options?.find((o) => o.texts.text.nn === label);
      if (m !== null && opt !== undefined) counts.set(opt.id, Number(m[1]));
    }
    out.set(q.id, { n: Number(n), counts });
  }
  return out;
}

export interface Snap {
  population: string;
  client: string | null;
  metric_key: string;
  group: string;
  n: number;
  numerator: number;
  denominator: number;
  suppressed: boolean;
}

/** Released snapshots of a round, keyed `${population}|${client ?? ''}|${metric_key}|${group}`. */
export async function released(round: string): Promise<Map<string, Snap>> {
  const rows = await withPg((c) =>
    c.query<Snap>(
      `SELECT s.population, c.slug AS client, s.metric_key, s."group", s.n, s.numerator, s.denominator, s.suppressed
         FROM aggregate_snapshot s LEFT JOIN client c ON c.id = s.client_id
        WHERE s.round_id = $1 AND s.status = 'released'`,
      [round],
    ),
  );
  return new Map(
    rows.rows.map((r) => [`${r.population}|${r.client ?? ''}|${r.metric_key}|${r.group}`, r]),
  );
}
