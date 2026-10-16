// «The previous round» of a template is an ordinary round or the imported round 1 — never a survey
// after a seminar or a live poll (decision of Oleksandr 16.10). An ordinary round, then a closed
// post_seminar round of the same template (and a live round, written straight into the database),
// then the next ordinary round: the client report (5.1) and «Svar per tilsett» (class rows, also
// the Master_Analyse export) compare with the first ordinary round, while «Før og etter» of the
// seminar still compares with the post_seminar round.
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PREVIOUS_TYPES } from '../../src/modules/dashboard/dashboard-context.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import {
  answer,
  cleanupRounds,
  scoredTemplate,
  scoredVersion,
  survey,
} from '../support/seminar-rounds.js';
import { createSeminar, makeClients, seminarApp, type SeminarApp } from '../support/seminars.js';

let t: SeminarApp;
let client: { id: string; slug: string };
let first: string, after: string, live: string, next: string;

/** Three synthetic people (same keys in every round) who answer F12 and F14 the same way. */
const three = (value: string) =>
  [0, 1, 2].map(() => ({ F12: value, F14: value === 'nei' ? 'nei' : 'ja' }));
async function round(
  type: 'regular' | 'post_seminar',
  version: string,
  value: string,
  name: string,
  created_at: Date,
) {
  const id = await survey(t, {
    type,
    status: 'closed',
    clients: [client.id],
    version,
    name,
    identification: 'initials',
    created_at,
  });
  await answer(t, id, client.id, three(value));
  await t.app.get(MetricsService).releaseRound(id, { type: 'auto', who: 'system' });
  return id;
}

beforeAll(async () => {
  t = await seminarApp();
  client = (await makeClients(t, ['Syntetisk A']))[0]!;
  const template = await scoredTemplate(t);
  const version = await scoredVersion(t, template, 1);
  first = await round('regular', version, 'ja', 'forste', new Date('2026-09-01T08:00:00Z'));
  after = await round('post_seminar', version, 'nei', 'etter', new Date('2026-09-15T08:00:00Z'));
  // A live round of the same version, as only the database could hold it: never «previous» either.
  live = (
    await t.prisma.round.create({
      data: {
        name: `${t.mark} live`,
        type: 'live',
        status: 'closed',
        identification: 'initials',
        template_version_id: version,
        created_at: new Date('2026-09-20T08:00:00Z'),
        opened_at: new Date('2026-09-20T08:00:00Z'),
        closed_at: new Date('2026-09-20T09:00:00Z'),
      },
    })
  ).id;
  next = await round('regular', version, 'delvis', 'neste', new Date('2026-10-01T08:00:00Z'));
}, 180_000);
afterAll(async () => {
  await cleanupRounds(t);
  await t.close();
});

describe('the previous round is ordinary or imported (decision 16.10)', () => {
  it('only regular and external_import qualify', () => {
    expect([...PREVIOUS_TYPES].sort()).toEqual(['external_import', 'regular']);
  });

  it('«Svar per tilsett» compares with the ordinary round, not the survey after the seminar', async () => {
    const res = await t.call('GET', `/api/admin/rows/per-employee?round=${next}`);
    expect(res.statusCode, res.body).toBe(200);
    const v = res.json<{
      previous_round: { id: string; name: string } | null;
      rows: { previous: { mean: number } | null }[];
    }>();
    expect(v.previous_round?.id).toBe(first);
    expect(v.previous_round?.id).not.toBe(after);
    expect(v.previous_round?.id).not.toBe(live);
    // Everybody answered «ja» (score 0) in the first round and «nei» (2) after the seminar.
    expect(v.rows.map((r) => r.previous?.mean)).toEqual([0, 0, 0]);
  });

  it('the client report compares with the ordinary round', async () => {
    const rc = await t.prisma.roundClient.findFirstOrThrow({ where: { round_id: next } });
    const res = await t.call('GET', `/api/admin/round-clients/${rc.id}/report`);
    expect(res.statusCode, res.body).toBe(200);
    const report = res.json<{
      comparison: { round: { name: string; type: string }; before: { mean: number } } | null;
    }>();
    expect(report.comparison?.round).toMatchObject({ name: `${t.mark} forste`, type: 'regular' });
    expect(report.comparison?.before.mean).toBe(0);
  });

  it('«Før og etter» of the seminar still compares with the post_seminar round', async () => {
    const { id } = await createSeminar(t, { clients: [client.id] });
    for (const [slot, r] of [
      ['before', first],
      ['after', after],
    ] as const)
      expect(
        (await t.call('PUT', `/api/admin/seminars/${id}/rounds/${slot}`, { round: r })).statusCode,
      ).toBe(200);
    const res = await t.call('GET', `/api/admin/seminars/${id}/before-after`);
    const v = res.json<{
      rounds: { before: { id: string }; after: { id: string } };
      questions: { id: string; after: { shares: (number | null)[] } | null }[];
    }>();
    expect(v.rounds.after.id).toBe(after);
    expect(v.rounds.before.id).toBe(first);
    // F12 options ja, delvis, nei, usikker: all three said «nei» after the seminar.
    expect(v.questions.find((q) => q.id === 'F12')?.after?.shares).toEqual([0, 0, 1, 0]);
  });
});
