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
  const all = await privacy.computeCells(round, 'all_clients', DEFS);
  await privacy.release(round, 'all_clients', all, store, ACTOR, {
    cross: await privacy.crossCells(round, DEFS),
  });
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
async function releasedInSteps(input: readonly (ResponseRow & { epoch: number })[]) {
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
    await r.privacy.release(r.round, 'round_client', perClient.flat(), r.store, ACTOR);
    await r.privacy.release(
      r.round,
      'all_clients',
      await r.privacy.computeCells(r.round, 'all_clients', DEFS),
      r.store,
      ACTOR,
      { cross: await r.privacy.crossCells(r.round, DEFS) },
    );
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
  const shown = views.flatMap((v) =>
    v.cells.flatMap((c) => {
      if (c.suppressed || c.metric_key !== METRIC) return [];
      const inside = allClientsCover(c.group);
      return [{ vector: cells.map((x) => (inside({ ...x, n: 0, yes: 0 }) ? 1 : 0)), origin: v.origin.get(c.group)! }];
    }),
  );
  const value = (i: number, e: number) =>
    list
      .filter((a) => a.client === cells[i]!.client && a.role === cells[i]!.role && a.epoch <= e)
      .reduce((t, a) => t + a.n, 0);
  return { eqs, views, model: historyLeaks(cells, shown, value, views.length) };
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
    for (let t = 0; t < 1500; t += 1) {
      const r = await closedRound(randomRows(rand, 'r-attack'));
      const view = await alle(r);
      const eqs = equations(r.groups, view, allClientsCover);
      expect(wrong(eqs)).toEqual([]);
      expect(describeLeaks(leaks(r.groups, eqs))).toEqual([]);
      hiddenRoles += view.filter(
        (c) => c.metric_key === METRIC && c.group.startsWith('role:') && c.suppressed,
      ).length;
    }
    expect(hiddenRoles).toBeGreaterThan(0);
  });

  it('random rounds: the live «alle» of an open round determines no set of groups below k', async () => {
    const rand = rng(2610);
    for (let t = 0; t < 1500; t += 1) {
      const r = await releasedRound(randomRows(rand, 'r-attack'), 'open');
      const eqs = equations(r.groups, await alle(r), allClientsCover);
      expect(wrong(eqs)).toEqual([]);
      expect(describeLeaks(leaks(r.groups, eqs))).toEqual([]);
    }
  });

  it('random rounds released 2–3 times: every «alle» release together determines no set below k, nor a difference below k', async () => {
    // The attacker of rule 7 knows which client has which roles, not who answered between two
    // releases (historyLeaks). One who also knows that is beyond rules 2, 3 and 7 (evidence).
    const rand = rng(3610);
    let carried = 0;
    for (let t = 0; t < 1500; t += 1) {
      const epochs = 2 + Math.floor(rand() * 2);
      const rows = randomRows(rand, 'r-attack').map((x) => ({
        ...x,
        epoch: 1 + Math.floor(rand() * epochs),
      }));
      if (!rows.some((x) => x.epoch === 1)) rows[0]!.epoch = 1;
      const { eqs, views, model } = await releasedInSteps(rows);
      expect(wrong(eqs)).toEqual([]);
      expect(model).toEqual([]);
      carried += views.reduce(
        (s, v, i) => s + [...v.origin.values()].filter((o) => o < i + 1).length,
        0,
      );
    }
    expect(carried).toBeGreaterThan(0);
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
