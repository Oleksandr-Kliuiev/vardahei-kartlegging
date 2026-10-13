// Task 1.10 (integration): import fixtures (svar + runde1) → rounds close --imported → released
// snapshots equal the golden of the old dashboard (1.2c): run (a) for tryggleik and KI 2026-10-13,
// run (b) for the anonymous KI 2026-10-12 round (stage-1.md §6 p. 11). Exceptions are named by
// their number in stage-1.md §6.
import 'reflect-metadata';
import vm from 'node:vm';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap.js';
import { Runde1ImportService } from '../../src/modules/imports/runde1-import.js';
import { SvarImportService } from '../../src/modules/imports/svar-import.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { SeedService } from '../../src/modules/rounds/seed.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { clients, fixtureText, kundar, tilgang } from '../support/fixtures.js';
import {
  distributions,
  golden,
  num,
  questions,
  released,
  section,
  type Snap,
} from '../support/golden.js';
import { resetImports } from '../support/imports.js';
import { SEED_DIR } from '../support/seed-dir.js';

let app: NestFastifyApplication;
let prisma: PrismaService;
const snaps: Record<'tryggleik' | 'ki' | 'anon' | 'runde1', Map<string, Snap>> = {
  tryggleik: new Map(),
  ki: new Map(),
  anon: new Map(),
  runde1: new Map(),
};
const ROUND_NAMES = {
  tryggleik: 'Runde 2 IT-tryggleik',
  ki: 'KI runde 1',
  anon: 'KI 2026-10-12 (anonym)',
  runde1: 'Runde 1 (Forms, januar 2026)',
} as const;
const slugOf = Object.fromEntries(clients().map((c) => [c.name, c.slug]));
const mk = (...parts: string[]) => parts.join('.');
const get = (
  m: Map<string, Snap>,
  population: string,
  client: string,
  metric: string,
  group = 'all',
) => m.get(`${population}|${client}|${metric}|${group}`);
const mean = (s: Snap | undefined) =>
  s === undefined || s.suppressed || s.denominator === 0 ? null : s.numerator / s.denominator;
const pct = (s: Snap | undefined) =>
  s === undefined || s.denominator === 0 ? null : Math.round((s.numerator / s.denominator) * 100);
// toFixed as the old dashboard (des()), not Math.round: 1.15 stays 1.1 there.
const round1 = (x: number | null) => (x === null ? null : Number(x.toFixed(1)));
const round2 = (x: number | null) => (x === null ? null : Number(x.toFixed(2)));
/** A grid cell: "1,1", "–" or "1,14 pers." (value 1,1 with «4 pers.» for groups under 5). */
const cellValue = (c: string): number | '–' => {
  const m = /^(–|\d+,\d)(?:\d+ pers\.)?$/.exec(c);
  if (m === null) throw new Error(`grid cell ${c}`);
  return m[1] === '–' ? '–' : num(m[1]!);
};

beforeAll(async () => {
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
  await app
    .get(SeedService)
    .seedAll({
      clients: clients(),
      kundar: kundar(),
      tilgang: tilgang(),
      seedDir: SEED_DIR,
      who: 'test:seed',
    });
  await resetImports(prisma);
  await app
    .get(SvarImportService)
    .importSvar(fixtureText('svar.synthetic.jsonl'), { who: 'test:parity' });
  await app
    .get(Runde1ImportService)
    .importRunde1(fixtureText('runde1.synthetic.js'), { who: 'test:parity' });
  await app.get(MetricsService).closeImported(SEED_DIR);
  for (const [k, name] of Object.entries(ROUND_NAMES)) {
    const r = await prisma.round.findFirstOrThrow({ where: { name } });
    snaps[k as keyof typeof snaps] = await released(r.id);
  }
}, 180_000);

afterAll(async () => {
  await resetImports(prisma);
  await app.close();
});

describe('parity of released snapshots with the old dashboard (1.10)', () => {
  const tA = golden('tryggleik.alle.json');
  const soner = section(tA, 'Soner');

  it('Soner, alle: snittscore, kritisk andel and persons per zone of all clients', () => {
    const s = snaps.tryggleik;
    expect(round2(mean(get(s, 'all_clients', '', mk('tryggleik', 'mean_score', 'all'))))).toBe(
      num(soner.lines[2]!),
    );
    expect(pct(get(s, 'all_clients', '', mk('tryggleik', 'critical_share', 'all')))).toBe(
      num(soner.lines[6]!),
    );
    const zones = ['gron', 'gul', 'oransje', 'raud'].map(
      (z) => get(s, 'all_clients', '', mk('tryggleik', 'persons_per_zone', z))?.numerator,
    );
    expect(zones).toEqual([9, 11, 13, 15].map((i) => num(soner.lines[i]!)));
  });

  it('Soner grid by client and question (all_clients, client:<slug>); tharaso suppressed (§6 p. 1)', () => {
    const [header, ...rows] = soner.tables[0]!;
    const short = questions('tryggleik.2026-10-13').filter(
      (q) => q.texts.short_label !== undefined,
    );
    for (const row of rows) {
      const name = (row[0] ?? '').replace(/ \d+$/, '');
      const slug = slugOf[name];
      if (slug === undefined) continue; // the row «Alle» is the Soner block above
      const group = `client:${slug}`;
      const samla = get(
        snaps.tryggleik,
        'all_clients',
        '',
        mk('tryggleik', 'mean_score', 'all'),
        group,
      );
      if (slug === 'tharaso') {
        expect(samla?.suppressed, '§6 p. 1: small client (n < 3)').toBe(true);
        continue;
      }
      expect(round1(mean(samla)), `${slug} samla`).toBe(cellValue(row.at(-2)!));
      expect(
        pct(
          get(snaps.tryggleik, 'all_clients', '', mk('tryggleik', 'critical_share', 'all'), group),
        ),
      ).toBe(num(row.at(-1)!));
      header!.slice(1, -2).forEach((label, i) => {
        const q = short.find((x) => x.texts.short_label?.nn === label)!;
        const cell = row[i + 1]!;
        const v = round1(
          mean(get(snaps.tryggleik, 'all_clients', '', mk('tryggleik', 'mean_score', q.id), group)),
        );
        expect(v === null ? '–' : v, `${slug} ${q.id}`).toBe(cellValue(cell));
      });
    }
  });

  it('Soner per client (round_client): snittscore, kritisk andel; role rows equal or suppressed (§6 p. 1)', () => {
    for (const slug of Object.values(slugOf)) {
      const g = section(golden(`tryggleik.${slug}.json`), 'Soner');
      const all = get(snaps.tryggleik, 'round_client', slug, mk('tryggleik', 'mean_score', 'all'));
      if (slug === 'tharaso') {
        expect(all?.suppressed, '§6 p. 1').toBe(true);
        continue;
      }
      expect(round2(mean(all)), slug).toBe(num(g.lines[2]!));
      expect(
        pct(get(snaps.tryggleik, 'round_client', slug, mk('tryggleik', 'critical_share', 'all'))),
      ).toBe(num(g.lines[6]!));
      const roles = questions('tryggleik.2026-10-13').find((q) => q.id === 'F2')!.options!;
      for (const row of g.tables[0]!.slice(1)) {
        const label = (row[0] ?? '').replace(/ \d+$/, '');
        const role = roles.find(
          (o) => o.texts.text.nn.split('/')[0]!.split(' eller ')[0]!.trim() === label,
        );
        if (role === undefined) continue; // «Alle»
        const s = get(
          snaps.tryggleik,
          'round_client',
          slug,
          mk('tryggleik', 'mean_score', 'all'),
          `role:${role.id}`,
        );
        if (s?.suppressed === true) continue; // §6 p. 1: complementary suppression beyond minGruppe
        expect(round1(mean(s)), `${slug} ${role.id}`).toBe(cellValue(row.at(-2)!));
      }
    }
  });

  it('distributions of every common question (all_clients, all) = «Svar frå alle tilsette»', () => {
    const d = distributions(section(tA, 'Svar frå alle tilsette').lines, 'tryggleik.2026-10-13');
    expect(d.size).toBeGreaterThan(15);
    for (const [qid, g] of d) {
      for (const [opt, count] of g.counts) {
        const s = get(
          snaps.tryggleik,
          'all_clients',
          '',
          mk('tryggleik', qid.toLowerCase(), 'distribution', opt),
        );
        expect([s?.n, s?.numerator], `${qid}.${opt}`).toEqual([g.n, count]);
      }
    }
  });

  it('Nøkkelspørsmåla: kritisk andel per key question', () => {
    const lines = section(tA, 'Nøkkelspørsmåla').lines;
    const short = questions('tryggleik.2026-10-13');
    let checked = 0;
    lines.forEach((l, i) => {
      const q = short.find((x) => x.texts.short_label?.nn === l);
      if (q === undefined || lines[i + 2] !== 'kritisk') return;
      expect(
        pct(get(snaps.tryggleik, 'all_clients', '', mk('tryggleik', 'critical_share', q.id))),
        q.id,
      ).toBe(num(lines[i + 1]!));
      checked += 1;
    });
    expect(checked).toBe(8);
  });

  it('round 1: counts per client, snittscore and kritisk andel (Samanlikning); persons per zone of the fixture', () => {
    const rows = section(tA, 'Samanlikning med runde 1').tables[0]!.slice(1);
    for (const row of rows) {
      const m = /^(.+) (\d+) → (\d+) pers\.$/.exec(row[0] ?? '');
      const slug = m === null ? undefined : slugOf[m[1]!];
      if (slug === undefined || m![2] === '0') continue;
      expect(
        get(snaps.runde1, 'round_client', slug, mk('tryggleik', 'f2', 'distribution', 'leiar'))?.n,
        slug,
      ).toBe(Number(m![2]));
      expect(
        round2(mean(get(snaps.runde1, 'round_client', slug, mk('tryggleik', 'mean_score', 'all')))),
        `runde1 ${slug}`,
      ).toBe(num(row[1]!.split(' ')[0]!));
      expect(
        pct(get(snaps.runde1, 'round_client', slug, mk('tryggleik', 'critical_share', 'all'))),
      ).toBe(num(row[4]!));
    }
    // persons_per_zone of round 1 (the old dashboard shows no histogram of round 1): the fixture
    // counted with the score table of the template and the person thresholds [1, 2, 3].
    const window: { RUNDE1?: { svar: { svar: Record<string, unknown> }[] } } = {};
    vm.runInNewContext(fixtureText('runde1.synthetic.js'), { window });
    const scoring = Object.fromEntries(
      questions('tryggleik.2026-10-13').flatMap((q) =>
        q.options?.some((o) => 'score' in o)
          ? [
              [
                q.id,
                Object.fromEntries(q.options.map((o) => [o.id, (o as { score?: number }).score])),
              ],
            ]
          : [],
      ),
    ) as Record<string, Record<string, number | undefined>>;
    const levels = [0, 0, 0, 0];
    for (const r of window.RUNDE1!.svar) {
      const s = Object.entries(scoring)
        .map(([q, m]) => m[r.svar[q] as string])
        .filter((x): x is number => x !== undefined);
      if (s.length === 0) continue;
      const avg = s.reduce((a, b) => a + b, 0) / s.length;
      levels[avg >= 3 ? 3 : avg >= 2 ? 2 : avg >= 1 ? 1 : 0]! += 1;
    }
    const got = ['gron', 'gul', 'oransje', 'raud'].map(
      (z) =>
        get(snaps.runde1, 'all_clients', '', mk('tryggleik', 'persons_per_zone', z))?.numerator ??
        0,
    );
    expect(got).toEqual(levels);
  });

  it('KI 2026-10-13: distributions, routine hours, heaviest task, K8 × K7', () => {
    const kA = golden('ki.alle.json');
    const d = distributions(section(kA, 'Svar frå alle tilsette').lines, 'ki.2026-10-13');
    expect(d.size).toBeGreaterThan(8);
    for (const [qid, g] of d) {
      for (const [opt, count] of g.counts) {
        const s = get(
          snaps.ki,
          'all_clients',
          '',
          mk('ki', qid.toLowerCase(), 'distribution', opt),
        );
        expect([s?.n, s?.numerator], `${qid}.${opt}`).toEqual([g.n, count]);
      }
    }
    const funn = section(kA, 'Kvar KI kan hjelpe').lines;
    const hours = /^≈ (\d+) timar\/veke går til rutineoppgåver hos dei (\d+) som svarte/.exec(
      funn.find((l) => l.includes('rutineoppgåver hos dei')) ?? '',
    );
    const r = get(snaps.ki, 'all_clients', '', mk('ki', 'routine_hours_week'));
    expect([Math.round(r!.numerator), r!.n]).toEqual([Number(hours![1]), Number(hours![2])]);
    const heavy = /^≈ (\d+) timar\/veke på «.+», den tyngste oppgåva for (\d+) person/.exec(
      funn.find((l) => l.includes('den tyngste oppgåva')) ?? '',
    );
    const tasks = [...snaps.ki.values()].filter(
      (x) =>
        x.population === 'all_clients' &&
        x.group === 'all' &&
        x.metric_key.startsWith(mk('ki', 'heaviest_task', '')),
    );
    const top = tasks.sort((a, b) => b.numerator - a.numerator || b.n - a.n)[0]!;
    expect([Math.round(top.numerator), top.n]).toEqual([Number(heavy![1]), Number(heavy![2])]);
    const k8 = /^(\d+) av (\d+) brukar KI privat/.exec(
      funn.find((l) => l.includes('brukar KI privat')) ?? '',
    );
    if (k8 !== null) {
      const x = ['aldri', 'provd'].flatMap((a) =>
        ['avogtil', 'veke', 'dag'].map(
          (b) => get(snaps.ki, 'all_clients', '', mk('ki', 'k7_x_k8', a, b))?.numerator ?? 0,
        ),
      );
      expect(x.reduce((a, b) => a + b, 0)).toBe(Number(k8[1]));
    }
  });

  it('anonymous KI 2026-10-12 round = run (b)', () => {
    const d = distributions(
      section(golden('ki-2026-10-12/ki.alle.json'), 'Svar frå alle tilsette').lines,
      'ki.2026-10-12',
    );
    expect(d.size).toBeGreaterThan(5);
    for (const [qid, g] of d) {
      for (const [opt, count] of g.counts) {
        const s = get(
          snaps.anon,
          'all_clients',
          '',
          mk('ki', qid.toLowerCase(), 'distribution', opt),
        );
        if (g.n < 3) {
          expect(s?.suppressed, `§6 p. 1 ${qid}`).toBe(true);
          continue;
        }
        expect([s?.n, s?.numerator], `${qid}.${opt}`).toEqual([g.n, count]);
      }
    }
  });

  it('leader part at «alle» from leaders_all (§6 p. 2: «X av Y leiarar» without client names)', () => {
    const d = distributions(section(tA, 'Leiarane').lines, 'tryggleik.2026-10-13', 'leader');
    expect(d.size).toBeGreaterThan(5);
    for (const [qid, g] of d) {
      for (const [opt, count] of g.counts) {
        const s = get(
          snaps.tryggleik,
          'leaders_all',
          '',
          mk('tryggleik', `leiar_${qid.toLowerCase()}`, 'distribution', opt),
        );
        if (g.n < 3) {
          expect(s?.suppressed, `§6 p. 1/2 ${qid}`).toBe(true);
          continue;
        }
        expect([s?.n, s?.numerator], `${qid}.${opt}`).toEqual([g.n, count]);
      }
    }
  });

  it('no person:* groups; leader cells only in leaders_all', () => {
    for (const m of Object.values(snaps)) {
      for (const s of m.values()) {
        expect(s.group.startsWith('person:')).toBe(false);
        if (s.metric_key.includes('.leiar_')) expect(s.population).toBe('leaders_all');
        if (s.population === 'leaders_all') expect(s.group).toBe('all');
      }
    }
  });
});
