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
// in both spans. For a connected structure that intersection is the graph whose hidden classes
// are those of each release, merged where they share a member; a node's value is its margin now
// minus its margin then, so a cut gives n_now(S) − n_then(S). The attacker is assumed to know the
// structure, not who answered between the two releases (a sound superset of the structure is
// the current one: answers only arrive, and fewer edges only add cuts).
//
// Enumeration: every subset R of the role nodes, its forced clients N(R), and any extra clients
// (they bring their own margin) — exact, small (2^roles), no linear algebra at runtime.
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

interface Graph {
  clients: Map<string, number>;
  roles: Map<string, number>;
  edges: Map<string, Set<string>>;
  /** (client node, role node) that must lie on the same side of every cut. */
  ties: [string, string][];
}

const sum = (x: Iterable<number>) => [...x].reduce((s, v) => s + v, 0);

/** Nodes of one side: members visible in every view keep their own node; members hidden in a
 * view join that view's hidden class, and classes sharing a member are one node. */
function classes(universe: readonly string[], views: readonly ReadonlyMap<string, number>[]) {
  const parent = new Map(universe.map((u) => [u, u]));
  const find = (u: string): string => (parent.get(u) === u ? u : find(parent.get(u)!));
  const hidden = views.map((v) => universe.filter((u) => !v.has(u)));
  for (const h of hidden) for (const u of h.slice(1)) parent.set(find(u), find(h[0]!));
  const roots = [...new Set(hidden.flat().map(find))].sort();
  const node = (u: string) =>
    hidden.some((h) => h.includes(u)) ? `#${roots.indexOf(find(u))}` : u;
  return { node, hidden };
}

function graph(structure: Structure, views: readonly View[]): Graph {
  const clientIds = [
    ...new Set([...structure.keys(), ...views.flatMap((v) => [...v.clients.keys()])]),
  ].sort();
  // '' (answers without a role) is hidden in every view: never a margin of its own.
  const roleIds = [
    ...new Set([
      ...[...structure.values()].flatMap((s) => [...s]),
      ...views.flatMap((v) => [...v.roles.keys()]),
    ]),
  ].sort();
  const cs = classes(
    clientIds,
    views.map((v) => v.clients),
  );
  const rs = classes(
    roleIds,
    views.map((v) => v.roles),
  );
  const clientNode = (c: string) => cs.node(c).replace(/^#/, '#clients:');
  const roleNode = (r: string) => rs.node(r).replace(/^#/, '#roles:');
  const clients = new Map<string, number>();
  const roles = new Map<string, number>();
  const ties: [string, string][] = [];
  // Value of a node in one view: its visible members plus, when it holds the view's hidden
  // class, that class's remainder. An unknown total enters as 0 and cancels through the tie.
  views.forEach((v, i) => {
    const sign = views.length === 2 && i === 0 ? -1 : 1;
    const hc = cs.hidden[i]!;
    const hr = rs.hidden[i]!;
    const total =
      v.total ??
      (hc.length === 0 ? sum(v.clients.values()) : hr.length === 0 ? sum(v.roles.values()) : 0);
    if (v.total === undefined && hc.length > 0 && hr.length > 0)
      ties.push([clientNode(hc[0]!), roleNode(hr[0]!)]);
    const add = (m: Map<string, number>, node: string, x: number) =>
      m.set(node, (m.get(node) ?? 0) + sign * x);
    for (const c of clientIds) add(clients, clientNode(c), v.clients.get(c) ?? 0);
    for (const r of roleIds) add(roles, roleNode(r), v.roles.get(r) ?? 0);
    if (hc.length > 0) add(clients, clientNode(hc[0]!), total - sum(v.clients.values()));
    if (hr.length > 0) add(roles, roleNode(hr[0]!), total - sum(v.roles.values()));
  });
  const edges = new Map<string, Set<string>>();
  for (const [c, set] of structure)
    for (const r of set) {
      const a = clientNode(c);
      edges.set(a, (edges.get(a) ?? new Set()).add(roleNode(r)));
    }
  return { clients, roles, edges, ties };
}

/** A cut whose groups the views determine (one view: values; two: then → now differences) with
 * 0 < |n| < k, or null (see above). */
export function smallCut(structure: Structure, views: readonly View[], k: number): Cut | null {
  const g = graph(structure, views);
  const roleNodes = [...g.roles.keys()];
  const clientNodes = [...g.clients.keys()];
  next: for (let mask = 0; mask < 1 << roleNodes.length; mask += 1) {
    const R = roleNodes.filter((_, i) => mask & (1 << i));
    const inR = new Set(R);
    const forced = clientNodes.filter((c) => [...(g.edges.get(c) ?? [])].some((r) => inR.has(r)));
    const want = new Map<string, boolean>();
    for (const [c, r] of g.ties) {
      if (want.get(c) === !inR.has(r)) continue next;
      want.set(c, inR.has(r));
    }
    const start = [...forced];
    for (const [c, inside] of want) {
      if (!inside && forced.includes(c)) continue next;
      if (inside && !forced.includes(c)) start.push(c);
    }
    const extras = clientNodes.filter((c) => !start.includes(c) && !want.has(c));
    const base = sum(start.map((c) => g.clients.get(c)!)) - sum(R.map((r) => g.roles.get(r)!));
    // Reachable sums with one witness each. Same-signed extras only move away from zero once
    // past k, so those sums are dropped.
    const values = extras.map((c) => g.clients.get(c)!);
    const up = values.every((v) => v >= 0);
    const down = values.every((v) => v <= 0);
    let reach = new Map<number, string[]>([[base, start]]);
    for (const c of extras) {
      const v = g.clients.get(c)!;
      if (v === 0) continue;
      const step = new Map(reach);
      for (const [s, set] of reach) {
        const t = s + v;
        if ((up && t >= k) || (down && t <= -k) || step.has(t)) continue;
        step.set(t, [...set, c]);
      }
      reach = step;
    }
    for (const [s, set] of reach)
      if (s !== 0 && Math.abs(s) < k) return { clients: set, roles: R, n: s };
  }
  return null;
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
