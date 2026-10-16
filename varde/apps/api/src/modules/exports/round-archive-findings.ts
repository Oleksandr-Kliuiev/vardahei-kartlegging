// Findings of a round archive (5.2): every Finding must follow from the archive itself, or the
// whole restore is refused. A restored Finding reaches the client report (5.1), and sha256 of the
// file only shows that the file is whole, not that a person did not write it. So: the rule is an
// aggregate rule of the archive; the release is a release of the same round and scope
// (round_client of that client, or all_clients); n ≥ k; and evaluate() on that release's cells
// gives exactly the saved numbers, as when the Finding was saved (FindingsService.released).
// The finding sets (2.5) must belong to the archive in the same way.
import type { TemplateContent } from '@varde/schema/template/template';
import { evaluate } from '../findings/evaluate.js';
import type { ArchivedSnapshot, ViewCell } from '../privacy/privacy.service.js';
import { type ArchiveBody, ArchiveConflict } from './round-archive.js';

function view(s: ArchivedSnapshot): ViewCell {
  const base = { metric_key: s.metric_key, metric_version: s.metric_version, group: s.group };
  if (s.suppressed) return { ...base, suppressed: true };
  return {
    ...base,
    suppressed: false,
    n: s.n ?? 0,
    numerator: s.numerator ?? 0,
    denominator: s.denominator ?? 0,
    missing: s.missing ?? 0,
    stale: s.stale,
    release_id: s.release_id,
  };
}

/** Cells of one release in one scope, in the order the dashboard reads them. */
function cellsOf(
  releases: ReadonlyMap<string, readonly ArchivedSnapshot[]>,
  release: string,
  client: string | null,
): ViewCell[] {
  return (releases.get(release) ?? [])
    .filter((s) =>
      client === null
        ? s.population === 'all_clients'
        : s.population === 'round_client' && s.client_id === client,
    )
    .sort((x, y) => x.metric_key.localeCompare(y.metric_key) || x.group.localeCompare(y.group))
    .map(view);
}

export function assertArchivedFindings(a: ArchiveBody, k: number): void {
  const content = a.template_version.content as unknown as TemplateContent;
  const releases = new Map<string, ArchivedSnapshot[]>();
  for (const s of a.snapshots) {
    const list = releases.get(s.release_id);
    if (list) list.push(s);
    else releases.set(s.release_id, [s]);
  }
  for (const f of a.findings) {
    const at = `finding ${f.id} (${f.rule_key}@${f.rule_version})`;
    const rule = a.finding_rules.find((x) => x.key === f.rule_key && x.version === f.rule_version);
    if (!rule) throw new ArchiveConflict(`${at}: no such rule in the archive`);
    if (rule.channel !== 'aggregate' || rule.definition.channel !== 'aggregate')
      throw new ArchiveConflict(`${at}: not an aggregate rule`);
    if (f.client_id !== null && !a.clients.some((c) => c.id === f.client_id))
      throw new ArchiveConflict(`${at}: client outside the archive`);
    const cells = cellsOf(releases, f.release_id, f.client_id);
    if (cells.length === 0)
      throw new ArchiveConflict(`${at}: not a release of this round and scope`);
    if (f.numbers.n < k) throw new ArchiveConflict(`${at}: n below k`);
    const again = evaluate([rule.definition], cells, content, 'all', 'aggregate').find(
      (x) => x.key === f.rule_key && x.version === f.rule_version,
    );
    // jsonb keeps about 16 digits of a share (5/14 comes back as …4572): compare to 1e-9.
    // A count of people is whole and compared exactly; only computed rules count hours.
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-9;
    const counted = rule.definition.computed === undefined;
    const same =
      again !== undefined &&
      again.n === f.numbers.n &&
      (counted ? again.count === f.numbers.count : near(again.count, f.numbers.count)) &&
      near(again.share, f.numbers.share) &&
      again.level === f.numbers.level &&
      again.release_id === f.release_id;
    if (!same) throw new ArchiveConflict(`${at}: numbers do not follow from the archived cells`);
  }
}

/**
 * Finding sets of the archive (2.5): a release of this round in that scope (`all` for
 * all_clients, a client of the archive for round_client), one archived version per rule, and for
 * every rule with saved Findings the version of the smallest one (what dashboard and report read).
 */
export function assertArchivedSets(a: ArchiveBody): void {
  const releases = new Map<string, { population: string; clients: Set<string> }>();
  for (const s of a.snapshots) {
    const r = releases.get(s.release_id) ?? { population: s.population, clients: new Set() };
    if (s.client_id) r.clients.add(s.client_id);
    releases.set(s.release_id, r);
  }
  const rules = new Set(a.finding_rules.map((r) => `${r.key}@${r.version}`));
  const clients = new Set(a.clients.map((c) => c.id));
  const seen = new Set<string>();
  for (const set of a.finding_sets ?? []) {
    const at = `finding set ${set.release_id} (${set.scope})`;
    const r = releases.get(set.release_id);
    if (!r) throw new ArchiveConflict(`${at}: not a release of this round`);
    const fits =
      set.scope === 'all'
        ? r.population === 'all_clients'
        : r.population === 'round_client' && clients.has(set.scope) && r.clients.has(set.scope);
    if (!fits) throw new ArchiveConflict(`${at}: not a scope of that release`);
    if (seen.has(`${set.release_id}/${set.scope}`)) throw new ArchiveConflict(`${at}: twice`);
    seen.add(`${set.release_id}/${set.scope}`);
    const version = new Map<string, number>();
    for (const k of set.rule_keys) {
      if (!rules.has(k)) throw new ArchiveConflict(`${at}: ${k} is not a rule of the archive`);
      const key = k.slice(0, k.lastIndexOf('@'));
      if (version.has(key)) throw new ArchiveConflict(`${at}: two versions of ${key}`);
      version.set(key, Number(k.slice(k.lastIndexOf('@') + 1)));
    }
    const saved = new Map<string, number>();
    for (const f of a.findings)
      if (f.release_id === set.release_id && (f.client_id ?? 'all') === set.scope)
        saved.set(f.rule_key, Math.min(saved.get(f.rule_key) ?? f.rule_version, f.rule_version));
    for (const [key, v] of saved)
      if (version.get(key) !== v)
        throw new ArchiveConflict(
          `${at}: ${key}@${v} of its Findings is not the version of the set`,
        );
  }
}
