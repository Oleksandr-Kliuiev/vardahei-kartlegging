// Subtraction attack across the two client populations of a round (BACKLOG «до этапа 4», приёмка
// 1c I1; 3c, решение 2; decision of Oleksandr 16.10): random rounds released by the real
// privacy.release() in the order of MetricsService.releaseRound, read back through PrivacyService,
// solved by linear rank. A client's own round_client cells go only to its own channel (ownCells)
// and to the admin dashboard (adminClientCells); every other reader gets the all_clients view.
// «alle» by itself (BACKLOG «до этапа 4», 16.10): its client and role cells are margins of one
// client × role table; release rule 7 and the live view check them together (privacy/cross.ts).
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import {
  PrivacyService,
  PrivacyViolation,
  type ResponseRow,
  type ResponseSource,
  type SourceQuery,
  type ViewCell,
} from '../../src/modules/privacy/privacy.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { LinkedMemorySnapshotStore } from '../support/memory-snapshot-store.js';
import {
  allClientsCover,
  clientGroupCover,
  type Equation,
  equations,
  type Group,
  groupsOf,
  historyLeaks,
  homeRoleRows,
  K,
  leaks,
  METRIC,
  randomRows,
  rng,
  roundClientCover,
  row,
  SYNTHETIC_DEF,
  wrong,
} from '../support/subtraction-attack.js';

const DEFS = [SYNTHETIC_DEF] as unknown as MetricDefinition[];
const ACTOR = { type: 'auto', who: 'system' } as const;

/** A round released into memory and read back through PrivacyService as the app reads it. */
async function releasedRound(input: readonly ResponseRow[], status = 'closed') {
  const round = 'r-attack';
  const rows = [...input];
  const store = new LinkedMemorySnapshotStore();
  const source: ResponseSource = {
    roundMode: () => Promise.resolve('none'),
    read: (q: SourceQuery) =>
      Promise.resolve(rows.filter((r) => q.client === undefined || r.client === q.client)),
  };
  const prisma = {
    round: { findUnique: () => Promise.resolve({ id: round, status }) },
    client: {
      findUnique: ({ where }: { where: { slug: string } }) =>
        Promise.resolve({ id: where.slug, slug: where.slug }),
    },
    aggregateSnapshot: {
      findMany: ({ where }: { where: { population: string; client_id: string | null } }) =>
        Promise.resolve(
          store.all.filter(
            (s) =>
              s.status === 'released' &&
              s.population === where.population &&
              (s.client ?? null) === where.client_id,
          ),
        ),
    },
    auditLog: { create: ({ data }: { data: unknown }) => Promise.resolve(data) },
  };
  const privacy = new PrivacyService(prisma as unknown as PrismaService, source, {
    k: K,
    exact_counts: ['responses_total'],
  });
  const clients = [...new Set(rows.map((r) => r.client))].sort();
  const perClient = await Promise.all(
    clients.map((c) => privacy.computeCells(round, 'round_client', DEFS, c)),
  );
  await privacy.release(round, 'round_client', perClient.flat(), store, ACTOR);
  const { cells, cross } = await privacy.allClientsCells(round, DEFS);
  await privacy.release(round, 'all_clients', cells, store, ACTOR, { cross });
  return { round, privacy, clients, rows, groups: groupsOf(rows), store };
}
const closedRound = (rows: readonly ResponseRow[]) => releasedRound(rows);

type Round = Awaited<ReturnType<typeof releasedRound>>;

/** The client's own channel (report 5.1, client CSV): its released round_client cells. */
const own = (r: Round, client: string) => r.privacy.ownCells(r.round, client, DEFS);
const alle = (r: Round) => r.privacy.viewCells(r.round, 'all_clients', DEFS);

/** The 3c acceptance test: one unknown per client, the cells over whole clients (`all` and
 * `client:<slug>`; role cells are another partition and stay out). */
function perClient(r: Round, eqs: readonly Equation[]) {
  const clients = r.clients.map((c) => ({
    client: c,
    role: '',
    n: r.groups.filter((g) => g.client === c).reduce((s, g) => s + g.n, 0),
    yes: r.groups.filter((g) => g.client === c).reduce((s, g) => s + g.yes, 0),
  }));
  const folded = eqs.flatMap((e) => {
    if (e.group !== 'all' && !e.group.startsWith('client:')) return [];
    const vector = r.clients.map((c) => {
      const mine = r.groups.flatMap((g, i) => (g.client === c ? [e.vector[i]!] : []));
      return mine.every((v) => v === mine[0]) ? mine[0]! : NaN;
    });
    expect(vector.some((v) => Number.isNaN(v))).toBe(false);
    return [{ ...e, vector }];
  });
  return { clients, folded };
}

/** Clients hidden in the all_clients view although n ≥ k: complementary suppression. */
function complementary(r: Round, view: readonly ViewCell[]): string[] {
  return r.clients.filter((c) => {
    const cell = view.find((x) => x.metric_key === METRIC && x.group === `client:${c}`);
    const n = r.groups.filter((g) => g.client === c).reduce((s, g) => s + g.n, 0);
    return cell?.suppressed === true && n >= K;
  });
}

const subsets = (items: readonly string[]) =>
  Array.from({ length: 2 ** items.length - 1 }, (_, m) =>
    items.filter((_, i) => (m + 1) & (1 << i)),
  );

const describeLeaks = (ls: Group[][]) =>
  ls.map((s) => s.map((g) => `${g.client}/${g.role || '–'} n=${g.n} ja=${g.yes}`).join(' + '));

describe('subtraction attack: round_client ↔ all_clients', () => {
  it('the path: a client hidden in «alle» next to a client of one answer gives that answer away', async () => {
    // 3c acceptance: A4, B3, C1, D3. C is below k, B is hidden with it in all_clients.
    const rows = [
      ...[0.1, 0.2, 0.7, 0.8].map((y) => row('r-attack', 'a', 'r0', y)),
      ...[0.1, 0.7, 0.8].map((y) => row('r-attack', 'b', 'r0', y)),
      row('r-attack', 'c', 'r0', 0.1),
      ...[0.1, 0.2, 0.7].map((y) => row('r-attack', 'd', 'r0', y)),
    ];
    const r = await closedRound(rows);
    const view = await alle(r);
    expect(complementary(r, view)).toEqual(['b']);
    const eqs = [
      ...equations(r.groups, view, allClientsCover),
      ...equations(r.groups, await own(r, 'b'), roundClientCover('b')),
    ];
    expect(wrong(eqs)).toEqual([]);
    expect(describeLeaks(leaks(r.groups, eqs))).toEqual(['c/r0 n=1 ja=1']);
    // Without the client's own cells the same view keeps C hidden.
    expect(leaks(r.groups, equations(r.groups, view, allClientsCover))).toEqual([]);
  });

  it('random rounds: what every reader gets — «alle» and seminar sums over every subset of clients — gives no client away', async () => {
    const rand = rng(31337);
    let complementaryRounds = 0;
    for (let t = 0; t < 400; t += 1) {
      const r = await closedRound(randomRows(rand, 'r-attack'));
      const view = await alle(r);
      if (complementary(r, view).length > 0) complementaryRounds += 1;
      const base = equations(r.groups, view, allClientsCover);
      const eqs: Equation[] = [...base];
      for (const s of subsets(r.clients)) {
        const g = await r.privacy.clientGroup(r.round, DEFS, s);
        eqs.push(...equations(r.groups, g.cells, clientGroupCover(s)));
      }
      expect(wrong(eqs)).toEqual([]);
      // Per client (one unknown each, as in the 3c acceptance): no set of clients below k.
      const { clients, folded } = perClient(r, eqs);
      expect(describeLeaks(leaks(clients, folded))).toEqual([]);
      // Per client and role: the sums add nothing to what «alle» itself shows.
      expect(describeLeaks(leaks(r.groups, eqs))).toEqual(describeLeaks(leaks(r.groups, base)));
    }
    expect(complementaryRounds).toBeGreaterThan(100);
  });

  it('random rounds: the own channel of a client next to «alle» gives clients away — why it goes to that client only', async () => {
    const rand = rng(777);
    let leaking = 0;
    for (let t = 0; t < 200; t += 1) {
      const r = await closedRound(randomRows(rand, 'r-attack'));
      const view = await alle(r);
      for (const c of complementary(r, view)) {
        const eqs = [
          ...equations(r.groups, view, allClientsCover),
          ...equations(r.groups, await own(r, c), roundClientCover(c)),
        ];
        const { clients, folded } = perClient(r, eqs);
        if (leaks(clients, folded).length > 0) leaking += 1;
      }
    }
    expect(leaking).toBeGreaterThan(50);
  });

  it('random rounds: the own channel of a client alone gives away no group below k', async () => {
    const rand = rng(4242);
    for (let t = 0; t < 400; t += 1) {
      const r = await closedRound(randomRows(rand, 'r-attack'));
      for (const c of r.clients) {
        const eqs = equations(r.groups, await own(r, c), roundClientCover(c));
        expect(wrong(eqs)).toEqual([]);
        expect(describeLeaks(leaks(r.groups, eqs))).toEqual([]);
      }
    }
  });
});

describe('round_client cells leave privacy through two named doors (decision 16.10)', () => {
  const rows = [
    ...[0.1, 0.2, 0.7].map((y) => row('r-attack', 'a', 'r0', y)),
    ...[0.1, 0.7, 0.8].map((y) => row('r-attack', 'b', 'r0', y)),
  ];

  it('viewCells never returns round_client cells', async () => {
    const r = await releasedRound(rows);
    await expect(
      r.privacy.viewCells(r.round, 'round_client' as 'all_clients', DEFS),
    ).rejects.toBeInstanceOf(PrivacyViolation);
  });

  it('ownCells reads the released snapshot even while the round is open; adminClientCells reads live', async () => {
    const r = await releasedRound(rows, 'open');
    r.rows.push(
      row('r-attack', 'a', 'r0', 0.1),
      row('r-attack', 'a', 'r0', 0.2),
      row('r-attack', 'a', 'r0', 0.3),
    );
    const at = (cells: readonly ViewCell[]) =>
      cells.find((c) => c.metric_key === METRIC && c.group === 'all');
    expect(at(await r.privacy.ownCells(r.round, 'a', DEFS))).toMatchObject({ n: 3, numerator: 2 });
    expect(at(await r.privacy.adminClientCells(r.round, 'a', DEFS))).toMatchObject({
      n: 6,
      numerator: 5,
    });
  });
});

/** The task's example (BACKLOG 16.10): k0 has one answer in r1, k1 four in r1; k2, k3 one and k4
 * three in r0. Before rule 7: `all` 10, `role:r1` 5, `client:k1` 4 → k0 = 5 − 4 = 1. */
const EXAMPLE = [
  row('r-attack', 'k0', 'r1', 0.1),
  ...[0.1, 0.2, 0.7, 0.8].map((y) => row('r-attack', 'k1', 'r1', y)),
  row('r-attack', 'k2', 'r0', 0.1),
  row('r-attack', 'k3', 'r0', 0.7),
  ...[0.1, 0.2, 0.7].map((y) => row('r-attack', 'k4', 'r0', y)),
];

/** One answer group per client, role and the release it first counts in (1, 2, …). */
interface Atom extends Group {
  epoch: number;
}

/** A round released several times while open, then closed: rows of epoch e arrive before
 * release e. Every all_clients release is kept as the attacker would: visible cells, each with
 * the release its value comes from (a carried value is the one of an earlier release). */
async function releasedInSteps(
  input: readonly (ResponseRow & { epoch: number })[],
  withRoundClient = true,
) {
  const epochs = Math.max(...input.map((r) => r.epoch));
  const r = await releasedRound(
    input.filter((x) => x.epoch === 1),
    epochs === 1 ? 'closed' : 'open',
  );
  const views: { cells: ViewCell[]; origin: Map<string, number> }[] = [];
  const read = (e: number) => {
    const batch = r.store.batches.filter((b) => b.population === 'all_clients').at(-1)!;
    const prev = views.at(-1)?.origin;
    const origin = new Map<string, number>();
    const cells = batch.cells.map((c): ViewCell => {
      const s = c as unknown as ViewCell & { stale?: boolean };
      origin.set(c.group, s.stale ? (prev?.get(c.group) ?? e) : e);
      return s;
    });
    views.push({ cells, origin });
  };
  read(1);
  for (let e = 2; e <= epochs; e += 1) {
    r.rows.push(...input.filter((x) => x.epoch === e));
    const perClient = await Promise.all(
      [...new Set(r.rows.map((x) => x.client))]
        .sort()
        .map((c) => r.privacy.computeCells(r.round, 'round_client', DEFS, c)),
    );
    if (withRoundClient)
      await r.privacy.release(r.round, 'round_client', perClient.flat(), r.store, ACTOR);
    const { cells, cross } = await r.privacy.allClientsCells(r.round, DEFS);
    await r.privacy.release(r.round, 'all_clients', cells, r.store, ACTOR, { cross });
    read(e);
  }
  const atoms = new Map<string, Atom>();
  for (const x of input) {
    const key = `${x.client}|${x.role}|${x.epoch}`;
    const a = atoms.get(key) ?? { client: x.client, role: x.role, epoch: x.epoch, n: 0, yes: 0 };
    a.n += 1;
    if (x.answers.F12 === 'ja') a.yes += 1;
    atoms.set(key, a);
  }
  const list = [...atoms.values()];
  // Release e counts the atoms of epochs up to the origin of the value it shows.
  const eqs = views.flatMap((v) =>
    equations(list, v.cells, (cell) => {
      const inside = allClientsCover(cell);
      return (g) => inside(g) && (g as Atom).epoch <= v.origin.get(cell)!;
    }),
  );
  // The same releases as equations over the cells of the final structure (rule 7's model).
  const cells = groupsOf([...input]).map((g) => ({ client: g.client, role: g.role }));
  // A group a release does not list had no answers then: the attacker reads a zero.
  const groups = [
    ...new Set(cells.flatMap((x) => [`client:${x.client}`, ...(x.role ? [`role:${x.role}`] : [])])),
  ];
  const shown = views.flatMap((v, i) => {
    const listed = new Set(v.cells.filter((c) => c.metric_key === METRIC).map((c) => c.group));
    const zeros = groups.filter((g) => !listed.has(g)).map((group) => ({ group, origin: i + 1 }));
    return [
      ...v.cells.flatMap((c) =>
        c.suppressed || c.metric_key !== METRIC
          ? []
          : [{ group: c.group, origin: v.origin.get(c.group)! }],
      ),
      ...zeros,
    ].map(({ group, origin }) => {
      const inside = allClientsCover(group);
      return { vector: cells.map((x) => (inside({ ...x, n: 0, yes: 0 }) ? 1 : 0)), origin };
    });
  });
  const value = (i: number, e: number) =>
    list
      .filter((a) => a.client === cells[i]!.client && a.role === cells[i]!.role && a.epoch <= e)
      .reduce((t, a) => t + a.n, 0);
  return { eqs, views, model: historyLeaks(cells, shown, value, views.length) };
}

const visibility = (cells: readonly ViewCell[]) =>
  cells
    .filter((c) => c.metric_key === METRIC)
    .map((c) => `${c.group}:${c.suppressed ? 'X' : 'v'}`)
    .sort();

/** «alle» as before rule 7: each partition with k and complementary suppression on its own. */
function separately(groups: readonly Group[]): ViewCell[] {
  const total = groups.reduce((s, g) => s + g.n, 0);
  const by = (key: (g: Group) => string) => {
    const m = new Map<string, number>();
    for (const g of groups) if (key(g) !== '') m.set(key(g), (m.get(key(g)) ?? 0) + g.n);
    // In the order of @varde/rules (groups by name): ties of complementary suppression.
    return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([group, n]) => ({ group, n }));
  };
  const parts = [by((g) => `client:${g.client}`), by((g) => (g.role ? `role:${g.role}` : ''))];
  const hidden = new Set<string>(total < K ? ['all'] : []);
  for (const p of parts) {
    for (const x of p) if (x.n < K) hidden.add(x.group);
    for (;;) {
      const rest = total - p.filter((x) => !hidden.has(x.group)).reduce((s, x) => s + x.n, 0);
      const next = p.filter((x) => !hidden.has(x.group)).sort((a, b) => a.n - b.n)[0];
      if (rest === 0 || rest >= K || next === undefined) break;
      hidden.add(next.group);
    }
  }
  return [{ group: 'all', n: total }, ...parts.flat()].map((x) =>
    hidden.has(x.group) || hidden.has('all')
      ? { metric_key: METRIC, metric_version: 1, group: x.group, suppressed: true }
      : {
          metric_key: METRIC,
          metric_version: 1,
          group: x.group,
          suppressed: false,
          n: x.n,
          numerator: 0,
          denominator: x.n,
          missing: 0,
        },
  );
}

describe('«alle» by itself gives away no client × role group below k (release rule 7, live view)', () => {
  it('the example: the role cell is hidden, the clients and the total stay', async () => {
    const r = await closedRound(EXAMPLE);
    const view = await alle(r);
    const at = (g: string) => view.find((c) => c.metric_key === METRIC && c.group === g);
    expect(at('all')).toMatchObject({ suppressed: false, n: 10 });
    expect(at('client:k1')).toMatchObject({ suppressed: false, n: 4 });
    expect(at('role:r1')?.suppressed).toBe(true);
    expect(leaks(r.groups, equations(r.groups, view, allClientsCover))).toEqual([]);
    // The same example on the live view of an open round.
    const open = await releasedRound(EXAMPLE, 'open');
    const live = await alle(open);
    expect(live.find((c) => c.metric_key === METRIC && c.group === 'role:r1')?.suppressed).toBe(
      true,
    );
    expect(leaks(open.groups, equations(open.groups, live, allClientsCover))).toEqual([]);
  });

  it('random rounds: released «alle» determines no set of groups below k', async () => {
    const rand = rng(1610);
    let hiddenRoles = 0;
    let changed = 0;
    for (let t = 0; t < 1500; t += 1) {
      const r = await closedRound(randomRows(rand, 'r-attack'));
      const view = await alle(r);
      const eqs = equations(r.groups, view, allClientsCover);
      expect(wrong(eqs)).toEqual([]);
      expect(describeLeaks(leaks(r.groups, eqs))).toEqual([]);
      // Rule 7 changes only rounds whose partitions, each safe alone, leak together.
      const separate = separately(r.groups);
      const before = equations(r.groups, separate, allClientsCover);
      if (leaks(r.groups, before).length === 0)
        expect(visibility(view)).toEqual(visibility(separate));
      else changed += 1;
      hiddenRoles += view.filter(
        (c) => c.metric_key === METRIC && c.group.startsWith('role:') && c.suppressed,
      ).length;
    }
    expect(hiddenRoles).toBeGreaterThan(0);
    expect(changed).toBeGreaterThan(0);
  });

  it('random rounds: the live «alle» of an open round determines no set of groups below k', async () => {
    const rand = rng(2610);
    const shape = (cells: readonly ViewCell[]) =>
      cells
        .filter((c) => c.metric_key === METRIC)
        .map((c) => `${c.group}=${c.suppressed ? 'X' : c.n}`)
        .sort();
    for (let t = 0; t < 1500; t += 1) {
      const rows = randomRows(rand, 'r-attack');
      const r = await releasedRound(rows, 'open');
      const live = await alle(r);
      const eqs = equations(r.groups, live, allClientsCover);
      expect(wrong(eqs)).toEqual([]);
      expect(describeLeaks(leaks(r.groups, eqs))).toEqual([]);
      // The live view hides what the first release hides, no more (no blanket role hiding).
      expect(shape(live)).toEqual(shape(await alle(await closedRound(rows))));
    }
  });

  it('random rounds released 2–3 times: every «alle» release together determines no set below k, nor a difference below k', async () => {
    // The attacker of rule 7 knows which client has which roles, not who answered between two
    // releases (historyLeaks). One who also knows that is beyond rules 2, 3 and 7 (evidence).
    const rand = rng(3610);
    let carried = 0;
    let lost = 0;
    for (let t = 0; t < 1500; t += 1) {
      const epochs = 2 + Math.floor(rand() * 2);
      const rows = randomRows(rand, 'r-attack').map((x) => ({
        ...x,
        epoch: 1 + Math.floor(rand() * epochs),
      }));
      if (!rows.some((x) => x.epoch === 1)) rows[0]!.epoch = 1;
      const { eqs, views, model } = await releasedInSteps(rows);
      for (const v of views)
        lost += v.cells.filter(
          (c) => c.metric_key === METRIC && (c.suppressed || (c as { stale?: boolean }).stale),
        ).length;
      expect(wrong(eqs)).toEqual([]);
      expect(model).toEqual([]);
      carried += views.reduce(
        (s, v, i) => s + [...v.origin.values()].filter((o) => o < i + 1).length,
        0,
      );
    }
    expect(carried).toBeGreaterThan(0);
    // Rule 7 waits for rules 1–3 and answers only what they leave: hiding more is a regression
    // (16.10: 14 128 cells hidden or carried; 14 519 when rule 7 ran before rules 1–3 settled).
    expect(lost).toBeLessThanOrEqual(14_128);
  });
});

describe('«alle» released twice on a client × role structure in pieces (acceptance 16.10)', () => {
  const at = (client: string, role: string, ja: boolean, epoch: number) => ({
    ...row('r-attack', client, role, ja ? 0.1 : 0.9),
    epoch,
  });

  it.each([true, false])(
    'k1 only in r1, k0 and k2 only in r0: the hidden total = r0 + k1 gives the two new answers away (round_client between: %s)',
    async (withRoundClient) => {
      const rows = [
        at('k1', 'r1', true, 1),
        at('k1', 'r1', false, 1),
        at('k1', 'r1', false, 1),
        at('k2', 'r0', true, 1),
        at('k2', 'r0', false, 1),
        at('k0', 'r0', true, 2),
        at('k0', 'r0', true, 2),
      ];
      const { model } = await releasedInSteps(rows, withRoundClient);
      expect(model).toEqual([]);
    },
  );

  it('answers without a role: the hidden total = client:k0 + role:r0 gives the new answer away', async () => {
    const rows = [
      at('k0', '', true, 1),
      at('k0', '', false, 1),
      at('k1', 'r0', false, 1),
      at('k1', 'r0', false, 1),
      at('k2', 'r0', true, 1),
      at('k0', '', true, 2),
    ];
    const { model } = await releasedInSteps(rows);
    expect(model).toEqual([]);
  });

  it('a value carried into the second release belongs to the first: r0 and r1 stale next to fresh clients', async () => {
    // Acceptance 16.10 (no role-less answers): release 2 carries r0 7 and r1 5 from release 1.
    const spec =
      'k0/r0@2 k0/r0@3 k0/r1@1 k1/r0@1 k1/r1@1 k1/r1@2 k1/r1@3 k1/r1@3 k1/r1@3 k2/r0@1 k2/r0@1 ' +
      'k2/r0@2 k3/r0@1 k3/r1@1 k3/r1@1 k3/r1@1 k3/r1@3 k4/r0@1 k4/r0@2 k4/r0@3 k5/r0@1 k5/r0@1 ' +
      'k5/r0@2 k5/r0@2 k5/r0@2 k5/r0@2';
    const rows = spec.split(' ').map((x, i) => {
      const [client, role, epoch] = x.split(/[/@]/);
      return at(client!, role!, i % 2 === 0, Number(epoch));
    });
    const { model } = await releasedInSteps(rows);
    expect(model).toEqual([]);
  });

  it('random rounds with home roles, released 2–3 times: no set or difference below k', async () => {
    const rand = rng(99);
    for (let t = 0; t < 1500; t += 1) {
      const epochs = 2 + Math.floor(rand() * 2);
      const rows = homeRoleRows(rand, 'r-attack').map((x) => ({
        ...x,
        epoch: 1 + Math.floor(rand() * epochs),
      }));
      if (!rows.some((x) => x.epoch === 1)) rows[0]!.epoch = 1;
      const { eqs, model } = await releasedInSteps(rows);
      expect(wrong(eqs)).toEqual([]);
      expect(model).toEqual([]);
    }
  });
});

describe('«Før og etter» of every client next to the report of one client (BACKLOG 16.10)', () => {
  it('a round of two clients: the total is hidden when total − report gives the other away', async () => {
    const r = await closedRound([
      ...[0.1, 0.2, 0.3, 0.7, 0.8].map((y) => row('r-attack', 'a', 'r0', y)),
      row('r-attack', 'b', 'r0', 0.1),
    ]);
    const g = await r.privacy.clientGroup(r.round, DEFS, r.clients);
    expect(g.cells.find((c) => c.metric_key === METRIC && c.group === 'all')?.suppressed).toBe(
      true,
    );
    const eqs = [
      ...equations(r.groups, g.cells, clientGroupCover(r.clients)),
      ...equations(r.groups, await own(r, 'a'), roundClientCover('a')),
    ];
    expect(leaks(r.groups, eqs)).toEqual([]);
  });

  it('random rounds: the group of every client plus the report of any one client gives no client away', async () => {
    const rand = rng(4610);
    let hiddenTotals = 0;
    for (let t = 0; t < 600; t += 1) {
      const r = await closedRound(randomRows(rand, 'r-attack'));
      const g = await r.privacy.clientGroup(r.round, DEFS, r.clients);
      if (g.cells.some((c) => c.metric_key === METRIC && c.group === 'all' && c.suppressed))
        hiddenTotals += 1;
      for (const c of r.clients) {
        const eqs = [
          ...equations(r.groups, g.cells, clientGroupCover(r.clients)),
          ...equations(r.groups, await own(r, c), roundClientCover(c)),
        ];
        expect(wrong(eqs)).toEqual([]);
        const { clients, folded } = perClient(r, eqs);
        expect(describeLeaks(leaks(clients, folded))).toEqual([]);
      }
    }
    expect(hiddenTotals).toBeGreaterThan(0);
  });
});
