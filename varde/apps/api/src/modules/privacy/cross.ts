// Joint check of the two partitions of all_clients (BACKLOG «privacy, до этапа 4», 16.10).
// Inside all_clients the client cells and the role cells are two partitions of one total, so
// every visible cell is a margin of the client × role table. An attacker who knows which client
// has which roles solves that table: a set S of (client, role) groups is determined exactly when
// a combination of visible margins has coefficient 1 on S and 0 on every other non-empty group.
//
// Graph of one release: one node per visible client and per visible role; hidden clients share
// one node, hidden roles and answers without a role share another (a hidden margin is never an
// equation of its own). Edges are the non-empty (client, role) groups. With the total visible, a
// combination a·total + Σ α_c·client_c + Σ β_r·role_r puts a + α_c + β_r on edge (c, r); 0/1 on
// every edge splits the nodes into levels, and each step between two levels is a cut X with
//   - closure: a role in X has all its clients in X (otherwise the edge would get −1);
//   - S = edges from a client in X to a role outside X;
//   - n(S) = Σ margins of the clients in X − Σ margins of the roles in X.
// A combination with more levels is a sum of such cuts with smaller n, so «no cut with
// 0 < |n(S)| < k» is exactly «no linear combination determines a set of groups below k».
// Without a total the two hidden nodes keep coefficient 0 together: they stay on one side (tie).
// A total that is not visible but equals the sum of all visible clients (or roles) still counts.
//
// Two releases (rule 7 on differences): S is determined in both exactly when its indicator lies
// in both spans (twoViews below: per connected component of the structure, each with its own
// total). Answers are assumed only to arrive between the two (a difference per group ≥ 0): then
// the current structure is a superset of the old one and a small difference has a small cut.
// Answers deleted in between are outside this model (BACKLOG). The attacker is assumed to know
// the structure, not who answered between the two releases.
//
// Enumeration: every subset of the role nodes, its forced clients, and any extra clients (they
// bring their own margin) — exact, small (2^roles, at most MAX_ROLE_NODES), no linear algebra.
import type { ComputedCell } from './release.js';

/** Non-empty (client, role) groups of one metric; role '' = answers without a role. */
export type Structure = ReadonlyMap<string, ReadonlySet<string>>;

/** The equations one release gives: its visible total, client margins and role margins. */
export interface View {
  total: number | undefined;
  clients: ReadonlyMap<string, number>;
  roles: ReadonlyMap<string, number>;
}

export interface Cut {
  /** Nodes of X: client slugs and role ids, merged classes as `#clients:<i>` / `#roles:<i>`. */
  clients: string[];
  roles: string[];
  n: number;
}

/** Structure of each metric (`key@version`) from the per-client cells (`all` and `role:<id>`). */
export function structures(cross: readonly ComputedCell[]): Map<string, Structure> {
  const out = new Map<string, Map<string, Set<string>>>();
  const totals = new Map<string, number>();
  const roleSum = new Map<string, number>();
  for (const c of cross) {
    if (c.client === undefined) continue;
    const metric = `${c.metric_key}@${c.metric_version}`;
    const at = `${metric}|${c.client}`;
    const m = out.get(metric) ?? new Map<string, Set<string>>();
    out.set(metric, m);
    const roles = m.get(c.client) ?? new Set<string>();
    m.set(c.client, roles);
    if (c.group === 'all') totals.set(at, c.n);
    else if (c.group.startsWith('role:')) {
      roleSum.set(at, (roleSum.get(at) ?? 0) + c.n);
      if (c.n > 0) roles.add(c.group.slice(5));
    }
  }
  for (const [metric, m] of out)
    for (const [client, roles] of m) {
      const at = `${metric}|${client}`;
      if ((totals.get(at) ?? 0) > (roleSum.get(at) ?? 0)) roles.add('');
    }
  return out;
}

/** More role nodes than this are not searched (2^n subsets): the caller hides role cells until
 * the graph is small enough (fail closed). Real templates have one role question of a few options. */
const MAX_ROLE_NODES = 12;

const sum = (x: Iterable<number>) => [...x].reduce((s, v) => s + v, 0);
const HIDDEN_CLIENTS = '#clients';
const HIDDEN_ROLES = '#roles';

function universe(structure: Structure, views: readonly View[]) {
  const clients = [
    ...new Set([...structure.keys(), ...views.flatMap((v) => [...v.clients.keys()])]),
  ].sort();
  // '' (answers without a role) is hidden in every view: never a margin of its own.
  const roles = [
    ...new Set([
      ...[...structure.values()].flatMap((s) => [...s]),
      ...views.flatMap((v) => [...v.roles.keys()]),
    ]),
  ].sort();
  return { clients, roles };
}

/** Too many role nodes: a «cut» that asks for one of `roles` to be hidden. */
const exhausted = (roles: readonly string[]): Cut => ({ clients: [], roles: [...roles], n: 0 });

/** One release: the graph with one hidden node per side (see above). */
function oneView(structure: Structure, v: View, k: number): Cut | null {
  const ids = universe(structure, [v]);
  const hc = ids.clients.filter((c) => !v.clients.has(c));
  const hr = ids.roles.filter((r) => !v.roles.has(r));
  const total =
    v.total ??
    (hc.length === 0 ? sum(v.clients.values()) : hr.length === 0 ? sum(v.roles.values()) : 0);
  const clients = new Map(v.clients);
  const roles = new Map(v.roles);
  if (hc.length > 0) clients.set(HIDDEN_CLIENTS, total - sum(v.clients.values()));
  if (hr.length > 0) roles.set(HIDDEN_ROLES, total - sum(v.roles.values()));
  const roleNodes = [...roles.keys()];
  if (roleNodes.length > MAX_ROLE_NODES) return exhausted([...v.roles.keys()]);
  const bit = new Map(roleNodes.map((r, i) => [r, 1 << i]));
  const adjacency = new Map<string, number>();
  for (const [c, set] of structure) {
    const node = v.clients.has(c) ? c : HIDDEN_CLIENTS;
    for (const r of set) {
      const b = bit.get(r !== '' && v.roles.has(r) ? r : HIDDEN_ROLES)!;
      adjacency.set(node, (adjacency.get(node) ?? 0) | b);
    }
  }
  const clientNodes = [...clients.keys()];
  // Without a total the two hidden nodes keep coefficient 0 together.
  const tie = v.total === undefined && hc.length > 0 && hr.length > 0;
  for (let mask = 0; mask < 1 << roleNodes.length; mask += 1) {
    const forced = new Set(clientNodes.filter((c) => ((adjacency.get(c) ?? 0) & mask) !== 0));
    const extras = clientNodes.filter((c) => !forced.has(c));
    if (tie) {
      const inside = (mask & bit.get(HIDDEN_ROLES)!) !== 0;
      if (!inside && forced.has(HIDDEN_CLIENTS)) continue;
      extras.splice(extras.indexOf(HIDDEN_CLIENTS), extras.includes(HIDDEN_CLIENTS) ? 1 : 0);
      if (inside) forced.add(HIDDEN_CLIENTS);
    }
    const R = roleNodes.filter((r) => (mask & bit.get(r)!) !== 0);
    const base = sum([...forced].map((c) => clients.get(c)!)) - sum(R.map((r) => roles.get(r)!));
    const found = subsetSums(
      base,
      [...forced],
      extras.map((c) => [c, clients.get(c)!] as const),
      k,
    );
    for (const [n, set] of found)
      if (n !== 0 && Math.abs(n) < k) return { clients: set, roles: R, n };
  }
  return null;
}

/** Sums of `base` and any subset of `extras`, one witness each. Once every extra has one sign,
 * sums past k on that side never return, so they are dropped. */
function subsetSums(
  base: number,
  start: readonly string[],
  extras: readonly (readonly [string, number])[],
  k: number,
): Map<number, string[]> {
  const up = extras.every(([, v]) => v >= 0);
  const down = extras.every(([, v]) => v <= 0);
  let reach = new Map<number, string[]>([[base, [...start]]]);
  for (const [c, v] of extras) {
    if (v === 0) continue;
    const step = new Map(reach);
    for (const [s, set] of reach) {
      const t = s + v;
      if ((up && t >= k) || (down && t <= -k) || step.has(t)) continue;
      step.set(t, [...set, c]);
    }
    reach = step;
  }
  return reach;
}

function unionFind(items: readonly string[]) {
  const parent = new Map(items.map((u) => [u, u]));
  const find = (u: string): string => {
    const p = parent.get(u)!;
    if (p === u) return u;
    const r = find(p);
    parent.set(u, r);
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  return { find, union };
}

interface Witness {
  clients: string[];
  roles: string[];
}

/**
 * Two releases (then, now): a cut X of the full client × role graph whose 0/1 labels lie in the
 * span of each release, and n_now(S) − n_then(S). Release v writes every label as
 * a_v + α_c + β_r with α = 0 on its hidden clients, β = 0 on its hidden roles and a_v = 0 without
 * a total. On a connected component K the potentials of X are fixed up to a shift t_K, so in
 * release v: the hidden roles of K lie on one side (t_K = −side), its hidden clients on one side,
 * and where K has both, side(clients) − side(roles) = a_v — one value for every such component of
 * the release (enumerated: −1, 0, 1 with a total, else 0). Components are searched one by one and
 * their sums combined; the hidden clients of release v together add a_v × their remainder.
 */
function twoViews(structure: Structure, then: View, now: View, k: number): Cut | null {
  const views = [then, now];
  const sign = [-1, 1];
  const ids = universe(structure, views);
  const uf = unionFind([...ids.clients.map((c) => `c:${c}`), ...ids.roles.map((r) => `r:${r}`)]);
  for (const [c, set] of structure) for (const r of set) uf.union(`c:${c}`, `r:${r}`);
  const comps = new Map<string, { clients: string[]; roles: string[] }>();
  const comp = (key: string) => {
    const root = uf.find(key);
    const k0 = comps.get(root) ?? { clients: [], roles: [] };
    comps.set(root, k0);
    return k0;
  };
  for (const c of ids.clients) comp(`c:${c}`).clients.push(c);
  for (const r of ids.roles) comp(`r:${r}`).roles.push(r);
  const adjacent = (c: string, R: ReadonlySet<string>) =>
    [...(structure.get(c) ?? [])].some((r) => R.has(r));
  const hiddenC = views.map((v) => (c: string) => !v.clients.has(c));
  const hiddenR = views.map((v) => (r: string) => !v.roles.has(r));
  const remainder = views.map((v) => {
    if (v.total === undefined) return 0;
    return v.total - sum(v.clients.values());
  });
  const options = views.map((v, i) =>
    v.total !== undefined &&
    [...comps.values()].some((K) => K.clients.some(hiddenC[i]!) && K.roles.some(hiddenR[i]!))
      ? [-1, 0, 1]
      : [0],
  );

  /** Reachable n_now − n_then of one component for given a_then, a_now. */
  const component = (K: { clients: string[]; roles: string[] }, a: readonly number[]) => {
    const ru = unionFind(K.roles);
    const cu = unionFind(K.clients);
    views.forEach((_, i) => {
      const hr = K.roles.filter(hiddenR[i]!);
      for (const r of hr.slice(1)) ru.union(r, hr[0]!);
      const hc = K.clients.filter(hiddenC[i]!);
      for (const c of hc.slice(1)) cu.union(c, hc[0]!);
    });
    const roleUnits = [...new Set(K.roles.map(ru.find))];
    if (roleUnits.length > MAX_ROLE_NODES) return null;
    const hiddenUnits = [
      ...new Set(K.clients.filter((c) => views.some((_, i) => hiddenC[i]!(c))).map(cu.find)),
    ];
    const out = new Map<number, Witness>();
    for (let mask = 0; mask < 1 << roleUnits.length; mask += 1) {
      const R = new Set(K.roles.filter((r) => (mask & (1 << roleUnits.indexOf(ru.find(r)))) !== 0));
      const forced = new Set(K.clients.filter((c) => adjacent(c, R)));
      for (let pick = 0; pick < 1 << hiddenUnits.length; pick += 1) {
        const X = new Set(forced);
        let ok = true;
        hiddenUnits.forEach((u, j) => {
          const members = K.clients.filter((c) => cu.find(c) === u);
          const inside = (pick & (1 << j)) !== 0;
          if (!inside && members.some((c) => forced.has(c))) ok = false;
          if (inside) for (const c of members) X.add(c);
        });
        if (!ok) continue;
        let base = 0;
        for (let i = 0; i < 2 && ok; i += 1) {
          const v = views[i]!;
          const hr = K.roles.find(hiddenR[i]!);
          const hc = K.clients.find(hiddenC[i]!);
          const sr = hr === undefined ? undefined : Number(R.has(hr));
          const sc = hc === undefined ? undefined : Number(X.has(hc));
          if (sr !== undefined && sc !== undefined && sc - sr !== a[i]) ok = false;
          const t = sr !== undefined ? -sr : sc !== undefined ? a[i]! - sc : 0;
          for (const c of K.clients)
            if (v.clients.has(c)) base += sign[i]! * (Number(X.has(c)) + t) * v.clients.get(c)!;
          for (const r of K.roles)
            if (v.roles.has(r)) base += sign[i]! * (-Number(R.has(r)) - t) * v.roles.get(r)!;
        }
        if (!ok) continue;
        // Free clients (visible in both) join X at will; their margins then enter as is.
        const extras = K.clients
          .filter((c) => !X.has(c) && views.every((_, i) => !hiddenC[i]!(c)))
          .map((c) => [c, now.clients.get(c)! - then.clients.get(c)!] as const);
        const sums = subsetSums(base, [...X], extras, Number.POSITIVE_INFINITY);
        for (const [n, clients] of sums) if (!out.has(n)) out.set(n, { clients, roles: [...R] });
      }
    }
    return out;
  };

  for (const at of options[0]!)
    for (const an of options[1]!) {
      const a = [at, an];
      let total = new Map<number, Witness>([[0, { clients: [], roles: [] }]]);
      for (const K of comps.values()) {
        const part = component(K, a);
        if (part === null) return exhausted(K.roles.filter((r) => now.roles.has(r)));
        const next = new Map<number, Witness>();
        for (const [s, w] of total)
          for (const [p, x] of part)
            if (!next.has(s + p))
              next.set(s + p, {
                clients: [...w.clients, ...x.clients],
                roles: [...w.roles, ...x.roles],
              });
        total = next;
      }
      const shift = sign[0]! * at * remainder[0]! + sign[1]! * an * remainder[1]!;
      for (const [s, w] of total) {
        const n = s + shift;
        if (n !== 0 && Math.abs(n) < k) return { ...w, n };
      }
    }
  return null;
}

/** A cut whose groups the views determine (one view: values; two: then → now differences) with
 * 0 < |n| < k, or null (see above). */
export function smallCut(structure: Structure, views: readonly View[], k: number): Cut | null {
  return views.length === 1
    ? oneView(structure, views[0]!, k)
    : twoViews(structure, views[0]!, views[1]!, k);
}

/** The cell to hide or carry for a small cut (decision 16.10: a role, never a client or the
 * total, for the values shown now): a role of the cut visible now, else any role visible now,
 * the smallest first. `differences`: a difference is carried as by rule 2, so a client or the
 * total of the cut may go before a role outside the cut. */
export function cellToHide(cut: Cut, now: View, differences = false): string | undefined {
  const pick = (m: ReadonlyMap<string, number>, ids: string[], prefix: string) => {
    const id = ids
      .filter((x) => m.has(x))
      .sort((a, b) => Math.abs(m.get(a)!) - Math.abs(m.get(b)!) || a.localeCompare(b))[0];
    return id === undefined ? undefined : `${prefix}${id}`;
  };
  const roles = [...now.roles.keys()];
  const clients = [...now.clients.keys()];
  return (
    pick(now.roles, cut.roles, 'role:') ??
    (differences ? pick(now.clients, cut.clients, 'client:') : undefined) ??
    (differences && now.total !== undefined ? 'all' : undefined) ??
    pick(now.roles, roles, 'role:') ??
    (differences ? pick(now.clients, clients, 'client:') : undefined)
  );
}

/** Role cells of one all_clients block (live view) to hide until no cut is small. Hiding every
 * role cell is always enough: the client partition alone is safe by complementary suppression.
 * Without the structure of the metric every visible role cell is hidden (fail closed). */
export function hideJointRoles(
  total: { group: string; n: number },
  parts: readonly { group: string; n: number }[],
  hidden: Set<string>,
  structure: Structure | undefined,
  k: number,
): void {
  const roles = parts.filter((p) => p.group.startsWith('role:'));
  const clients = parts.filter((p) => p.group.startsWith('client:'));
  if (roles.length === 0 || clients.length === 0 || hidden.has(total.group)) return;
  const visible = (ps: typeof parts, cut: number) =>
    new Map(ps.filter((p) => !hidden.has(p.group)).map((p) => [p.group.slice(cut), p.n]));
  for (;;) {
    const now: View = { total: total.n, clients: visible(clients, 7), roles: visible(roles, 5) };
    if (now.roles.size === 0) return;
    if (structure === undefined) {
      for (const r of roles) hidden.add(r.group);
      return;
    }
    const cut = smallCut(structure, [now], k);
    if (cut === null) return;
    hidden.add(cellToHide(cut, now)!);
  }
}
