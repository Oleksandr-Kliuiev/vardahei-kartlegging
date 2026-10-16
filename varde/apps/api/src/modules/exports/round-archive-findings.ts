// Findings of a round archive (5.2): every Finding must follow from the archive itself, or the
// whole restore is refused. A restored Finding reaches the client report (5.1), and sha256 of the
// file only shows that the file is whole, not that a person did not write it. So: the rule is an
// aggregate rule of the archive; the release is a release of the same round and scope
// (round_client of that client, or all_clients); n ≥ k; and evaluate() on that release's cells
// gives exactly the saved numbers, as when the Finding was saved (FindingsService.persist).
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
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-9;
    const same =
      again !== undefined &&
      again.n === f.numbers.n &&
      near(again.count, f.numbers.count) &&
      near(again.share, f.numbers.share) &&
      again.level === f.numbers.level &&
      again.release_id === f.release_id;
    if (!same) throw new ArchiveConflict(`${at}: numbers do not follow from the archived cells`);
  }
}
