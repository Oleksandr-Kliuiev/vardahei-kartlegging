// Helpers of the import tests (1.8, 1.9): cleanup of import rows, tombstones, README counts.
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { fixtureText } from './fixtures.js';
import { withPg } from './rounds.js';

export const IMPORT_ROUND_NAMES = [
  'Runde 1 (Forms, januar 2026)',
  'Runde 2 IT-tryggleik',
  'KI runde 1',
  'KI 2026-10-12 (anonym)',
];

/** Removes responses, tombstones and manifests of the import rounds and the anonymous round. */
export async function resetImports(prisma: PrismaService): Promise<void> {
  await withPg(async (c) => {
    await c.query(
      `DELETE FROM response WHERE round_client_id IN (
         SELECT rc.id FROM round_client rc JOIN round r ON r.id = rc.round_id WHERE r.name = ANY($1))`,
      [IMPORT_ROUND_NAMES],
    );
    await c.query('DELETE FROM deletion_tombstone');
    await c.query('DELETE FROM deletion_request');
  });
  await prisma.importManifest.deleteMany({});
  const anon = await prisma.round.findMany({ where: { name: 'KI 2026-10-12 (anonym)' } });
  await prisma.roundClient.deleteMany({ where: { round_id: { in: anon.map((r) => r.id) } } });
  await prisma.round.deleteMany({ where: { id: { in: anon.map((r) => r.id) } } });
}

export interface ReadmeCounts {
  lines: number;
  leiardel: number;
  rounds: Record<string, { common: number; leader: number; clients: Record<string, number> }>;
  rejected: { common: number; leader: number };
}

export function readmeCounts(): {
  counts: ReadmeCounts;
  edgeLines: number[];
  kiOldLines: number[];
} {
  const t = fixtureText('README.md');
  const json = /```json\n([\s\S]*?)\n```/.exec(t)?.[1] ?? '{}';
  const edgeLines = [...t.matchAll(/^- (\d+): .+$/gm)].map((m) => Number(m[1]));
  const lines = t.split('\n');
  const kiOldLines = (
    lines[lines.findIndex((l) => l.startsWith('## Строки KI 2026-10-12')) + 2] ?? ''
  )
    .split(', ')
    .map(Number);
  return { counts: JSON.parse(json) as ReadmeCounts, edgeLines, kiOldLines };
}

/** A tombstone for (source_id, part) without a Response (as forget would leave it). */
export async function tombstone(
  c: pg.Client,
  sourceId: string,
  part: 'common' | 'leader',
  roundId: string,
  clientId: string,
): Promise<void> {
  const req = await c.query<{ id: string }>(
    `INSERT INTO deletion_request (requested_by, reason, scope, scope_ref) VALUES ('test', 'test', 'submissions', '{}') RETURNING id`,
  );
  await c.query(
    `INSERT INTO deletion_tombstone (request_id, submission_id, content_hash, round_id, client_id, part, source_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [req.rows[0]?.id, randomUUID(), 'x'.repeat(64), roundId, clientId, part, sourceId],
  );
}

export const countBySource = (c: pg.Client, ids: string[]) =>
  c
    .query<{ part: string; n: string }>(
      'SELECT part, count(*) AS n FROM response WHERE source_id = ANY($1) GROUP BY part ORDER BY part',
      [ids],
    )
    .then((r) => Object.fromEntries(r.rows.map((x) => [x.part, Number(x.n)])));
