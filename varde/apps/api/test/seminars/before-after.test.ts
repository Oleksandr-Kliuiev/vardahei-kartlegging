// 3.9 (integration): «Før og etter» of a seminar. The survey before and the one after are compared
// for the seminar's clients, per client and per question, only through privacy: the closed «Før»
// from released snapshots (raw deleted → the same view), the open «Etter» live with k; hidden groups
// carry no numbers, and the sum over the seminar's clients keeps complementary suppression (a client
// hidden in the round hides the sum). Comparability: a changed question (options, anchor) or a metric
// without a declared link is marked without numbers; a declared `approximate` link shows numbers
// with its note. The caveats are always there. The live poll and the technical client stay out.
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import type { TemplateContent } from '@varde/schema/template/template';
import { findBokmal } from '@varde/schema/i18n/nn-stoplist';
import { CAVEATS, type BeforeAfterModel } from '../../src/modules/dashboard/before-after-view.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { editorMetricPrefix } from '../../src/modules/surveys/editor-metrics.js';
import { answer as phone, cleanupLive, liveVersion } from '../support/live.js';
import { withPg } from '../support/rounds.js';
import {
  answer,
  cleanupRounds,
  scoredTemplate,
  scoredVersion,
  survey,
} from '../support/seminar-rounds.js';
import { createSeminar, makeClients, seminarApp, type SeminarApp } from '../support/seminars.js';

type Ready = Extract<BeforeAfterModel, { ready: true }>;
type Q = Ready['questions'][number];

let t: SeminarApp;
let A: { id: string; slug: string },
  B: { id: string; slug: string },
  C: { id: string; slug: string };
let template: { key: string; id: string };
let v1: string, v2: string, v3: string;
let r1: string;
const seminars: Record<'s1' | 's2' | 's3' | 's4', string> = { s1: '', s2: '', s3: '', s4: '' };

const rows = (spec: Record<string, string[]>): Record<string, string>[] =>
  Object.values(spec)[0]!.map((_, i) =>
    Object.fromEntries(Object.entries(spec).map(([q, values]) => [q, values[i] ?? ''])),
  );
async function closed(version: string, data: [string, Record<string, string>[]][], name: string) {
  const round = await survey(t, {
    type: 'regular',
    status: 'closed',
    clients: data.map(([c]) => c),
    version,
    name,
    identification: 'initials',
  });
  for (const [client, answers] of data) await answer(t, round, client, answers);
  await t.app.get(MetricsService).releaseRound(round, { type: 'auto', who: 'system' });
  return round;
}
async function open(version: string, data: [string, Record<string, string>[]][], name: string) {
  const round = await survey(t, {
    type: 'post_seminar',
    status: 'open',
    clients: data.map(([c]) => c),
    version,
    name,
    identification: 'initials',
  });
  for (const [client, answers] of data) await answer(t, round, client, answers);
  return round;
}
async function seminar(before: string, after: string) {
  const { id } = await createSeminar(t, { clients: [A.id, B.id] });
  for (const [slot, round] of [
    ['before', before],
    ['after', after],
  ] as const)
    expect(
      (await t.call('PUT', `/api/admin/seminars/${id}/rounds/${slot}`, { round })).statusCode,
    ).toBe(200);
  return id;
}
async function view(id: string, client?: string): Promise<Ready> {
  const res = await t.call(
    'GET',
    `/api/admin/seminars/${id}/before-after${client ? `?client=${client}` : ''}`,
  );
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json<BeforeAfterModel>();
  expect(body.ready).toBe(true);
  return body as Ready;
}
const question = (v: Ready, id: string) => v.questions.find((q) => q.id === id)!;
const shares = (side: Q['before']) =>
  side?.shares.map((s) => (s === null ? null : Number(s.toFixed(4))));
const r = (n: number) => Number(n.toFixed(4));

beforeAll(async () => {
  t = await seminarApp();
  const made = await makeClients(t, ['Syntetisk A', 'Syntetisk B', 'Syntetisk C']);
  [A, B, C] = [made[0]!, made[1]!, made[2]!];
  template = await scoredTemplate(t);
  v1 = await scoredVersion(t, template, 1);
  // v2: F12 loses «usikker», F14 gets a new anchor (semantic), F5 a corrected wording (same anchor).
  v2 = await scoredVersion(t, template, 2, (c: TemplateContent) => ({
    ...c,
    questions: c.questions.map((q) =>
      q.id === 'F12' && 'options' in q
        ? { ...q, options: q.options.filter((o) => o.id !== 'usikker') }
        : q.id === 'F14'
          ? { ...q, anchor_key: 'F14X' }
          : q.id === 'F5'
            ? { ...q, texts: { ...q.texts, text: { ...q.texts.text, nn: `${q.texts.text.nn} ` } } }
            : q,
    ),
  }));
  // v3: F12 and F14 take a free text, so the template's own definitions no longer hold for them
  // (2.16: a workshop version keeps those only for questions that mean the same); the version's
  // own metrics (as the editor makes them): F12 declares an approximate link to the F12 of v1, F14
  // declares none.
  v3 = await scoredVersion(t, template, 3, (c: TemplateContent) => ({
    ...c,
    questions: c.questions.map((q) =>
      q.id === 'F12' || q.id === 'F14'
        ? { ...q, free_text: { texts: { text: { nn: 'Anna', en: 'Other' } } } }
        : q,
    ),
  }));
  const prefix = editorMetricPrefix(v3);
  for (const [q, options, comparability] of [
    [
      'F12',
      ['ja', 'delvis', 'nei', 'usikker'],
      [
        {
          to: `${template.key}.f12.distribution@1`,
          degree: 'approximate',
          note: 'Same spørsmål, men svara er talde på ein litt annan måte.',
        },
      ],
    ],
    ['F14', ['ja', 'nei', 'usikker'], []],
  ] as const) {
    const def = MetricDefinition.parse({
      key: `${prefix}${q.toLowerCase()}`,
      version: 1,
      kind: 'distribution',
      part: 'common',
      questions: [{ key: q, part: 'common' }],
      options_mapping: { [q]: Object.fromEntries(options.map((o) => [o, o])) },
      scale: 'options',
      recall_period: 'Som formulert i spørsmålet.',
      denominator_rule: 'Svar med eitt gyldig val.',
      populations: ['round_client', 'all_clients'],
      comparability: [...comparability],
      ...(comparability.length ? {} : { first_version: true }),
    });
    await t.prisma.metricDefinition.create({ data: { key: def.key, version: 1, definition: def } });
  }
  // «Før» (closed, released): A 4, B 3, C 5 (C is on no seminar).
  r1 = await closed(
    v1,
    [
      [A.id, rows({ F12: ['ja', 'ja', 'nei', 'usikker'], F14: ['ja', 'ja', 'ja', 'nei'] })],
      [B.id, rows({ F12: ['nei', 'nei', 'delvis'], F14: ['nei', 'ja', 'ja'] })],
      [C.id, rows({ F12: ['ja', 'ja', 'ja', 'ja', 'ja'], F14: ['ja', 'ja', 'ja', 'ja', 'ja'] })],
    ],
    'for',
  );
  // «Etter» (open, live with k): A 3, B 2 — B below k, so A is hidden with it.
  const r2 = await open(
    v1,
    [
      [A.id, rows({ F12: ['ja', 'ja', 'ja'], F14: ['ja', 'ja', 'ja'] })],
      [B.id, rows({ F12: ['ja', 'delvis'], F14: ['ja', 'ja'] })],
    ],
    'etter',
  );
  seminars.s1 = await seminar(r1, r2);
  // A «Før» where C (2) is below k and complementary suppression hides B (3) too.
  const r3 = await closed(
    v1,
    [
      [A.id, rows({ F12: ['ja', 'ja', 'nei', 'nei'] })],
      [B.id, rows({ F12: ['nei', 'nei', 'nei'] })],
      [C.id, rows({ F12: ['ja', 'ja'] })],
    ],
    'for-skjult',
  );
  const r4 = await open(
    v1,
    [
      [A.id, rows({ F12: ['ja', 'ja', 'ja'] })],
      [B.id, rows({ F12: ['ja', 'ja', 'nei'] })],
    ],
    'etter-2',
  );
  seminars.s2 = await seminar(r3, r4);
  const three = rows({ F12: ['ja', 'ja', 'nei'], F14: ['ja', 'ja', 'ja'], F5: ['ja', 'ja', 'ja'] });
  seminars.s3 = await seminar(
    r1,
    await open(
      v2,
      [
        [A.id, three],
        [B.id, three],
      ],
      'etter-v2',
    ),
  );
  seminars.s4 = await seminar(
    r1,
    await open(
      v3,
      [
        [A.id, three],
        [B.id, three],
      ],
      'etter-v3',
    ),
  );
}, 180_000);
afterAll(async () => {
  await cleanupRounds(t);
  await cleanupLive(t);
  await t.close();
});

describe('«Før og etter» (3.9)', () => {
  it('per question over the seminar’s clients: «Før» = A + B from released cells, «Etter» = the round total', async () => {
    const v = await view(seminars.s1);
    expect(v.cohort.map((c) => c.slug)).toEqual([A.slug, B.slug]);
    expect(v.rounds.before.source).toBe('released');
    expect(v.rounds.after.source).toBe('live');
    expect(v.total.before.respondents).toBe(7);
    expect(v.total.after.respondents).toBe(5);
    const f12 = question(v, 'F12');
    expect(f12.comparable.degree).toBe('comparable');
    expect(f12.options.map((o) => o.id)).toEqual(['ja', 'delvis', 'nei', 'usikker']);
    expect(shares(f12.before)).toEqual([2 / 7, 1 / 7, 3 / 7, 1 / 7].map(r));
    expect(shares(f12.after)).toEqual([4 / 5, 1 / 5, 0, 0].map(r));
    expect(f12.before?.n).toBe(7);
    expect(r(f12.score!.before!.mean!)).toBe(r(8 / 7));
    expect(r(f12.score!.before!.critical!)).toBe(r(3 / 7));
    expect(r(f12.score!.after!.mean!)).toBe(r(1 / 5));
    expect(f12.score!.after!.critical).toBe(0);
    expect(f12.score!.change?.kind).toBe('betre');
    expect(f12.score!.critical_change).toEqual({ delta: -43, kind: 'betre' });
    expect(shares(question(v, 'F14').before)).toEqual([5 / 7, 2 / 7, 0].map(r));
    expect(shares(question(v, 'F14').after)).toEqual([1, 0, 0]);
    // Questions nobody answered stay without numbers (below k), not zero.
    expect(question(v, 'F3').before?.shares.every((s) => s === null)).toBe(true);
    expect(v.total.comparable?.degree).toBe('comparable');
    expect(r(v.total.before.mean!)).toBe(r(12 / 14));
    expect(r(v.total.after.mean!)).toBe(r(1 / 10));
    // C answered «Før» but is on no seminar: neither in the sum nor in the list.
    expect(JSON.stringify(v)).not.toContain(C.slug);
  });

  it('per client: k and complementary suppression of the round; a hidden client has no numbers', async () => {
    const v = await view(seminars.s1);
    const a = v.clients.find((c) => c.slug === A.slug)!,
      b = v.clients.find((c) => c.slug === B.slug)!;
    expect(a.before).toEqual({ respondents: 4, mean: 5 / 8, critical: 2 / 8 });
    expect(r(b.before.mean!)).toBe(r(7 / 6));
    // «Etter»: B has 2 answers (< k), and A is hidden with it (else A = total − B).
    for (const c of [a, b]) {
      expect(c.after).toEqual({ respondents: null, mean: null, critical: null });
      expect(c.change).toBeNull();
    }
    const one = await view(seminars.s1, A.slug);
    expect(one.client).toBe(A.slug);
    expect(one.clients).toEqual([]);
    expect(shares(question(one, 'F12').before)).toEqual([2 / 4, 0, 1 / 4, 1 / 4].map(r));
    expect(question(one, 'F12').after?.shares).toEqual([null, null, null, null]);
    expect(one.total.after.respondents).toBeNull();
    expect(
      (await t.call('GET', `/api/admin/seminars/${seminars.s1}/before-after?client=${C.slug}`))
        .statusCode,
    ).toBe(404);
  });

  it('the sum over the seminar’s clients keeps complementary suppression: a hidden client hides it', async () => {
    const v = await view(seminars.s2);
    // C (2) is hidden in «Før», and B with it: A + B would give C away (total − A − B).
    expect(v.total.before.respondents).toBeNull();
    expect(question(v, 'F12').before?.shares).toEqual([null, null, null, null]);
    expect(question(v, 'F12').score?.before?.mean).toBeNull();
    expect(question(v, 'F12').score?.change).toBeNull();
    expect(v.clients.find((c) => c.slug === A.slug)?.before.respondents).toBe(4);
    expect(v.clients.find((c) => c.slug === B.slug)?.before.respondents).toBeNull();
    // «Etter»: A 3 and B 3 are both visible, the total too.
    expect(v.total.after.respondents).toBe(6);
    expect(v.clients.map((c) => c.after.respondents)).toEqual([3, 3]);
  });

  it('a changed question (options, anchor) is marked without numbers; a corrected wording compares', async () => {
    const v = await view(seminars.s3);
    const f12 = question(v, 'F12'),
      f14 = question(v, 'F14'),
      f5 = question(v, 'F5');
    expect(f12.comparable).toEqual({ degree: 'incomparable', note: 'Svaralternativa er endra.' });
    expect(f14.comparable).toEqual({
      degree: 'incomparable',
      note: 'Spørsmålet har fått nytt innhald sidan undersøkinga før.',
    });
    for (const q of [f12, f14]) {
      expect(q.before).toBeNull();
      expect(q.after).toBeNull();
      expect(q.score).toEqual({
        comparable: q.comparable,
        before: null,
        after: null,
        change: null,
        critical_change: null,
      });
    }
    expect(f5.comparable.degree).toBe('comparable');
    expect(f5.after?.n).toBe(6);
    // The mean of all questions has changed questions in it: no numbers, only the reason.
    expect(v.total.comparable?.degree).toBe('incomparable');
    expect(v.total.comparable?.note).toMatch(/kan ikkje samanliknast/);
    expect(v.total.before.mean).toBeNull();
    expect(v.total.change).toBeNull();
    expect(v.total.before.respondents).toBe(7);
  });

  it('metrics from `comparability`: an approximate link shows numbers and its note, none → no numbers', async () => {
    const v = await view(seminars.s4);
    const f12 = question(v, 'F12'),
      f14 = question(v, 'F14');
    expect(f12.comparable).toEqual({
      degree: 'approximate',
      note: 'Same spørsmål, men svara er talde på ein litt annan måte.',
    });
    expect(shares(f12.before)).toEqual([2 / 7, 1 / 7, 3 / 7, 1 / 7].map(r));
    expect(shares(f12.after)).toEqual([4 / 6, 0, 2 / 6, 0].map(r));
    expect(f14.comparable.degree).toBe('incomparable');
    expect(f14.comparable.note).toMatch(/ikkje avtalt/);
    expect(f14.before).toBeNull();
    // v3 has no mean score: the score of a question and of all of them is not compared.
    expect(f12.score?.comparable.degree).toBe('incomparable');
    expect(f12.score?.before).toBeNull();
    expect(v.total.comparable?.degree).toBe('incomparable');
    expect(v.total.after.mean).toBeNull();
  });

  it('nobody answered after yet: no questions, the clients are named with where they are missing', async () => {
    const after = await survey(t, {
      type: 'post_seminar',
      status: 'open',
      clients: [A.id, B.id],
      version: v1,
      name: 'etter-tom',
      identification: 'initials',
    });
    const v = await view(await seminar(r1, after));
    expect(v.cohort).toEqual([]);
    expect(v.questions).toEqual([]);
    expect(v.clients).toEqual([]);
    expect(v.total.comparable).toBeNull();
    expect(v.total.before.respondents).toBeNull();
    expect(v.not_both.map((c) => [c.before, c.after])).toEqual([
      [true, false],
      [true, false],
    ]);
    expect(v.caveats).toEqual([...CAVEATS]);
  });

  it('the caveats are always given, in nynorsk, also before both rounds are chosen', async () => {
    const { id } = await createSeminar(t, { clients: [A.id] });
    const res = await t.call('GET', `/api/admin/seminars/${id}/before-after`);
    expect(res.json()).toEqual({
      class: 'aggregate',
      caveats: [...CAVEATS],
      ready: false,
      missing: { before: true, after: true },
    });
    expect((await view(seminars.s1)).caveats).toEqual([...CAVEATS]);
    expect(CAVEATS).toContain('Vi ser endringa, men kan ikkje seie at seminaret gjorde det.');
    expect(CAVEATS.flatMap(findBokmal)).toEqual([]);
    const all = JSON.stringify(await view(seminars.s3));
    expect(findBokmal(all.replace(/"(id|slug|name|label|text)":"[^"]*"/g, ''))).toEqual([]);
  });

  it('the live poll and the technical client stay out; answers on the phones change nothing', async () => {
    const before = await view(seminars.s1);
    const live = await t.call('POST', `/api/admin/seminars/${seminars.s1}/live`, {
      template_version_id: await liveVersion(t),
    });
    expect(live.statusCode).toBe(201);
    const round = live.json<{ round: string }>().round;
    const rc = await t.prisma.roundClient.findFirstOrThrow({ where: { round_id: round } });
    const q = await t.prisma.livePollQuestion.findFirstOrThrow({
      where: { round_id: round, position: 1 },
    });
    expect(
      (
        await t.call(
          'POST',
          `/api/admin/seminars/${seminars.s1}/live/questions/${q.question_id}/open`,
        )
      ).statusCode,
    ).toBe(200);
    for (const i of [1, 2, 3]) {
      const res = await phone(t, rc.code!, q.question_id, 'kontor', {}, `192.0.2.${i}`);
      expect(res.statusCode).toBe(201);
    }
    const after = await view(seminars.s1);
    expect(after).toEqual(before);
    const text = JSON.stringify(after);
    expect(text).not.toContain(round);
    expect(text).not.toContain('varde-seminar-live');
    expect(text).not.toContain('Seminar (live)');
  });

  it('HTTP: admin session only; never answers, keys or submission ids', async () => {
    const url = `/api/admin/seminars/${seminars.s1}/before-after`;
    expect((await t.call('GET', url, undefined, { cookie: '' })).statusCode).toBe(401);
    const res = await t.call('GET', url);
    expect(res.body).not.toMatch(/answers|respondent_key|submission_id|"ZZ/);
    expect(res.json<{ class: string }>().class).toBe('aggregate');
    expect((await t.call('GET', `${url}?client=`)).statusCode).toBe(400);
  });

  it('a closed «Før» comes from its released snapshots: raw deleted → the same «Før»', async () => {
    const v = await view(seminars.s1);
    await withPg((db) =>
      db.query(
        'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id = $1)',
        [r1],
      ),
    );
    const again = await view(seminars.s1);
    expect(again.total.before).toEqual(v.total.before);
    expect(again.questions.map((q) => q.before)).toEqual(v.questions.map((q) => q.before));
    expect(again.clients.map((c) => c.before)).toEqual(v.clients.map((c) => c.before));
  });
});
