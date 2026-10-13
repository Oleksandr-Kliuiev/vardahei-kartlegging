// Task 1.2b: synthetic fixtures — deterministic, along the old runner path, edge rows in place.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { currentBank, oldBank } from '../bank.mjs';
import { FIXTURES, generateFixtures, INITIALS } from '../generate.mjs';

type Row = {
  id?: string;
  skjema: string;
  k: string;
  versjon: string;
  leiardel: boolean;
  svar: Record<string, unknown>;
  fri: Record<string, string>;
};
type Q = {
  id: string;
  del: string;
  type: string;
  vis?: (s: object) => boolean;
  val?: { id: string; aleine?: boolean; vis?: (s: object) => boolean }[];
  valFraa?: string;
  maks?: number;
  rolle?: boolean;
};
type Bank = {
  leiarRoller: string[];
  skjema: Record<string, { initialar?: string; sporsmal: Q[] }>;
};

const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');
const rows = read('svar.synthetic.jsonl')
  .trimEnd()
  .split('\n')
  .map((l) => JSON.parse(l) as Row);
const readme = read('README.md');
const edgeLines = [...readme.matchAll(/^- (\d+): (.+)$/gm)].map((m) => ({
  line: Number(m[1]),
  reason: m[2]!,
}));
const kiOldLine =
  readme.split('\n')[
    readme.split('\n').findIndex((l) => l.startsWith('## Строки KI 2026-10-12')) + 2
  ]!;
const kiOldLines = kiOldLine.split(', ').map(Number);
const bank = currentBank() as Bank;
const old = oldBank() as Bank;
const edge = new Set(edgeLines.map((e) => e.line));
const regular = rows.filter((_, i) => !edge.has(i + 1));
const bOf = (b: Bank, sid: string) =>
  new Set(b.skjema[sid]!.sporsmal.filter((q) => q.del === 'B').map((q) => q.id));

describe('synthetic fixtures (1.2b)', () => {
  it('the generator is deterministic and equals the committed files', () => {
    const a = generateFixtures() as Map<string, string>;
    const b = generateFixtures() as Map<string, string>;
    expect([...a.entries()]).toEqual([...b.entries()]);
    for (const [name, body] of a) expect(read(name), name).toBe(body);
  });

  it('every row answers only questions and options the old runner showed', () => {
    for (const [i, row] of rows.entries()) {
      const b = row.skjema === 'ki' && row.versjon === '2026-10-12' ? old : bank;
      const sk = b.skjema[row.skjema]!;
      const role = sk.sporsmal.find((q) => q.rolle)!;
      const leader = b.leiarRoller.includes(row.svar[role.id] as string);
      for (const [id, value] of Object.entries(row.svar)) {
        const q = sk.sporsmal.find((x) => x.id === id);
        expect(q, `line ${i + 1} ${id}`).toBeDefined();
        if (q!.del === 'B') expect(leader && row.leiardel, `line ${i + 1} ${id}`).toBe(true);
        if (q!.vis) expect(q!.vis(row.svar), `line ${i + 1} vis ${id}`).toBeTruthy();
        if (!q!.val) continue;
        const source = q!.valFraa ? (row.svar[q!.valFraa] as string[]) : null;
        const allowed = q!.val
          .filter((o) => (!o.vis || o.vis(row.svar)) && (!source || source.includes(o.id)))
          .map((o) => o.id);
        const values = Array.isArray(value) ? (value as string[]) : [value as string];
        for (const v of values) expect(allowed, `line ${i + 1} ${id}=${v}`).toContain(v);
        if (values.some((v) => q!.val!.find((o) => o.id === v)?.aleine))
          expect(values).toHaveLength(1);
        if (q!.maks) expect(values.length).toBeLessThanOrEqual(q!.maks);
      }
      for (const id of Object.keys(row.fri))
        expect(row.svar[id], `line ${i + 1} fri ${id}`).toBeDefined();
    }
  });

  it('edge rows are at the README line numbers', () => {
    expect(edgeLines.map((e) => e.reason)).toEqual([
      'no id',
      'duplicate id',
      'duplicate id',
      'unknown versjon',
      'unknown k',
      'leiardel without id',
    ]);
    const at = (n: number) => rows[n - 1]!;
    const [noId, dupA, dupB, versjon, k, leaderNoId] = edgeLines.map((e) => at(e.line));
    expect(noId!.id).toBeUndefined();
    expect(dupA!.id).toBe(dupB!.id);
    expect(rows.filter((r) => r.id === dupA!.id)).toHaveLength(2);
    expect(['2026-10-12', '2026-10-13']).not.toContain(versjon!.versjon);
    expect(
      bank.skjema.tryggleik && Object.keys((bank as unknown as { kundar: object }).kundar),
    ).not.toContain(k!.k);
    expect(leaderNoId!.id).toBeUndefined();
    expect(leaderNoId!.leiardel).toBe(true);
    expect(Object.keys(leaderNoId!.svar).some((id) => bOf(bank, 'tryggleik').has(id))).toBe(true);
  });

  it('KI 2026-10-12 rows: 5, without K0, ≥ 3 leaders with B answers, ≥ 1 with free text', () => {
    const ki = kiOldLines.map((n) => rows[n - 1]!);
    expect(rows.filter((r) => r.skjema === 'ki' && r.versjon === '2026-10-12')).toEqual(ki);
    expect(ki).toHaveLength(5);
    expect(ki.every((r) => r.svar.K0 === undefined)).toBe(true);
    const b = bOf(old, 'ki');
    expect(
      ki.filter((r) => r.leiardel && Object.keys(r.svar).some((id) => b.has(id))).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      ki.filter((r) => Object.keys(r.fri).length > 0 || r.svar.K15 !== undefined).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('roles: two clients with roles ≥ 3 and < 3; one client with < 3 answers; leaders with part B', () => {
    const t = regular.filter((r) => r.skjema === 'tryggleik');
    const byRole = (k: string) => {
      const c: Record<string, number> = {};
      for (const r of t.filter((x) => x.k === k))
        c[r.svar.F2 as string] = (c[r.svar.F2 as string] ?? 0) + 1;
      return Object.values(c);
    };
    const mixed = ['daco', 'gasta', 'kviknes', 'maskinsenteret', 'sfhs'].filter(
      (k) => byRole(k).some((n) => n >= 3) && byRole(k).some((n) => n < 3),
    );
    expect(mixed.length).toBeGreaterThanOrEqual(2);
    expect(t.filter((r) => r.k === 'tharaso').length).toBeLessThan(3);
    expect(rows.length).toBeGreaterThanOrEqual(140);
  });

  it('runde1.synthetic.js through vm: 40 records, 5 clients, F2–F19 with F15 as an array', () => {
    const window: {
      RUNDE1?: {
        namn: string;
        dato: string;
        svar: { k: string; init: string; svar: Record<string, unknown> }[];
      };
    } = {};
    vm.runInNewContext(read('runde1.synthetic.js'), { window });
    const r1 = window.RUNDE1!;
    expect(r1.dato).toBe('2026-01');
    expect(r1.svar).toHaveLength(40);
    expect(new Set(r1.svar.map((x) => x.k)).size).toBe(5);
    for (const x of r1.svar) {
      expect(Object.keys(x.svar)).toEqual(Array.from({ length: 18 }, (_, i) => `F${i + 2}`));
      expect(Array.isArray(x.svar.F15)).toBe(true);
    }
    const t = new Set(
      regular.filter((r) => r.skjema === 'tryggleik').map((r) => `${r.k}|${String(r.svar.F1)}`),
    );
    expect(r1.svar.filter((x) => t.has(`${x.k}|${x.init}`))).toHaveLength(10);
  });

  it('initials only from the synthetic list; one pair of namesakes inside a client', () => {
    const list = new Set(INITIALS);
    const window: { RUNDE1?: { svar: { init: string }[] } } = {};
    vm.runInNewContext(read('runde1.synthetic.js'), { window });
    const used = [
      ...rows
        .map((r) => (r.svar.F1 ?? r.svar.K0) as string | undefined)
        .filter((x) => x !== undefined),
      ...window.RUNDE1!.svar.map((x) => x.init),
    ];
    for (const init of used) expect(list.has(init), init).toBe(true);
    const pairs = regular
      .filter((r) => r.skjema === 'tryggleik')
      .map((r) => `${r.k}|${String(r.svar.F1)}`);
    expect(pairs.length - new Set(pairs).size).toBe(1);
  });
});
