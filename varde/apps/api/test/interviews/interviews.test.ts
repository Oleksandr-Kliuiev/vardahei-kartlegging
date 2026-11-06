// 2.20 Samtalar on Postgres: a guide from «Nytt skjema → Samtale», a round of conversations, the start,
// field-by-field saves against the value last seen (409), «Fullfør» / «Opne for endring» in AuditLog,
// typed text never in AuditLog, and the data class `samtale` in forget, the ledger and handover.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyInterviewLedger,
  interviewsCsv,
} from '../../src/modules/interviews/interview-retention.js';
import { makeClients, seminarApp, type SeminarApp } from '../support/seminars.js';

let t: SeminarApp;
let guide: string;
let round: string;
let clientA: string, clientB: string;
let interviewA: string, interviewB: string;

const json = <T>(r: { json: <U>() => U }) => r.json<T>();
const surveyPath = (id: string) => `/api/admin/surveys/versions/${id}`;

async function publishGuide(): Promise<string> {
  const created = await t.call('POST', '/api/admin/surveys', {
    title: `Samtaleguide ${t.mark}`,
    audience: 'interview',
    identification: 'none',
    required_languages: ['nn'],
  });
  expect(created.statusCode).toBe(201);
  const id = json<{ id: string }>(created).id;
  let v = json<{ content_hash: string }>(await t.call('GET', surveyPath(id)));
  expect(
    (await t.call('POST', `${surveyPath(id)}/accept`, { content_hash: v.content_hash, lang: 'nn' }))
      .statusCode,
  ).toBe(201);
  v = json<{ content_hash: string }>(await t.call('GET', surveyPath(id)));
  const published = await t.call('POST', `${surveyPath(id)}/publish`, {
    content_hash: v.content_hash,
    confirmed: true,
  });
  expect(published.statusCode, published.body).toBe(201);
  return id;
}

beforeAll(async () => {
  t = await seminarApp();
  [clientA, clientB] = (await makeClients(t, ['Samtale A', 'Samtale B'])).map((c) => c.id) as [
    string,
    string,
  ];
  guide = await publishGuide();
});

afterAll(async () => {
  await t.prisma.interview.deleteMany({ where: { round: { name: { contains: t.mark } } } });
  await t.prisma.interviewRound.deleteMany({ where: { name: { contains: t.mark } } });
  await t.close();
});

describe('a conversation guide (2.20)', () => {
  it('«Nytt skjema → Samtale» gives the 27 standard questions as free text in Nynorsk', async () => {
    const v = json<{
      content: { audience: string; required_languages: string[]; questions: { type: string }[] };
    }>(await t.call('GET', surveyPath(guide)));
    expect(v.content.audience).toBe('interview');
    expect(v.content.required_languages).toEqual(['nn']);
    expect(v.content.questions).toHaveLength(27);
    expect(v.content.questions.every((q) => q.type === 'text')).toBe(true);
  });

  it('is listed for Samtalar, never for rounds, and a round cannot be made from it', async () => {
    const guides = json<{ id: string; question_count: number }[]>(
      await t.call('GET', '/api/admin/interview-guides'),
    );
    expect(guides.find((g) => g.id === guide)?.question_count).toBe(27);
    const versions = json<{ id: string }[]>(await t.call('GET', '/api/admin/versions'));
    expect(versions.some((v) => v.id === guide)).toBe(false);
    const r = await t.call('POST', '/api/admin/rounds', {
      name: `Runde ${t.mark}`,
      template_version_id: guide,
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('a round of conversations', () => {
  it('starts with its clients as planned conversations; the name is unique; AuditLog has it', async () => {
    const r = await t.call('POST', '/api/admin/interview-rounds', {
      name: `Haust ${t.mark}`,
      template_version_id: guide,
      clients: [clientA, clientB, clientA],
    });
    expect(r.statusCode, r.body).toBe(201);
    round = json<{ id: string }>(r).id;
    const again = await t.call('POST', '/api/admin/interview-rounds', {
      name: `Haust ${t.mark}`,
      template_version_id: guide,
      clients: [],
    });
    expect(again.statusCode).toBe(409);
    const view = json<{ interviews: { id: string; client: { id: string }; status: string }[] }>(
      await t.call('GET', `/api/admin/interview-rounds/${round}`),
    );
    expect(view.interviews.map((i) => i.status)).toEqual(['planned', 'planned']);
    interviewA = view.interviews.find((i) => i.client.id === clientA)!.id;
    interviewB = view.interviews.find((i) => i.client.id === clientB)!.id;
    const log = await t.prisma.auditLog.findFirst({
      where: { what: 'interviews.round.create', target: `interview_round:${round}` },
    });
    expect(log?.details).toMatchObject({ clients: 2 });
  });

  it('refuses a guide that is not a published conversation guide and an unknown client', async () => {
    const other = await t.prisma.templateVersion.findFirst({
      where: { status: 'published', template: { audience: 'client_survey' } },
    });
    if (other) {
      const r = await t.call('POST', '/api/admin/interview-rounds', {
        name: `Feil ${t.mark}`,
        template_version_id: other.id,
      });
      expect(r.statusCode).toBe(400);
    }
    const r = await t.call('POST', '/api/admin/interview-rounds', {
      name: `Feil2 ${t.mark}`,
      template_version_id: guide,
      clients: [randomUUID()],
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('one conversation', () => {
  const answer = (id: string, q: string, body: object) =>
    t.call('PUT', `/api/admin/interviews/${id}/answers/${q}`, body);

  it('cannot be written before it starts; the start names who sits at the table', async () => {
    expect(
      (await answer(interviewB, 'N2', { field: 'answer', value: 'x', expect: '' })).statusCode,
    ).toBe(409);
    const r = await t.call('POST', `/api/admin/interviews/${interviewA}/start`, {
      held_on: '2026-11-10',
      interviewees: [{ role: 'dagleg leiar', name: 'Kari Nordmann' }],
      interviewers: ['Asbjørn', 'Oleksandr'],
    });
    expect(r.statusCode, r.body).toBe(201);
    const v = json<{ status: string; held_on: string; interviewees: unknown }>(
      await t.call('GET', `/api/admin/interviews/${interviewA}`),
    );
    expect(v).toMatchObject({ status: 'in_progress', held_on: '2026-11-10' });
    expect(v.interviewees).toEqual([{ role: 'dagleg leiar', name: 'Kari Nordmann' }]);
    expect(
      await t.prisma.auditLog.count({
        where: { target: `interview:${interviewA}`, what: 'interviews.start' },
      }),
    ).toBe(1);
  });

  it('saves a field only while it still holds what the screen last saw (409 names the change)', async () => {
    const first = await answer(interviewA, 'N2', {
      field: 'answer',
      value: `Ingen definert ansvarleg ${t.mark}`,
      expect: '',
    });
    expect(first.statusCode, first.body).toBe(200);
    const stale = await answer(interviewA, 'N2', {
      field: 'answer',
      value: 'Ein annan tekst',
      expect: '',
    });
    expect(stale.statusCode).toBe(409);
    expect(json<{ current: string; updated_by: string }>(stale)).toMatchObject({
      current: `Ingen definert ansvarleg ${t.mark}`,
      updated_by: 'Syntetisk admin',
    });
    // Another field of the same question does not conflict.
    expect(
      (await answer(interviewA, 'N2', { field: 'rating', value: 'manglar', expect: null }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await answer(interviewA, 'N2', {
          field: 'action',
          value: 'Peik ut ein ansvarleg',
          expect: '',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await answer(interviewA, 'N2', { field: 'note', value: 'Kandidat for pakken', expect: '' }))
        .statusCode,
    ).toBe(200);
    expect(
      (await answer(interviewA, 'N3', { field: 'rating', value: 'ivaretatt', expect: null }))
        .statusCode,
    ).toBe(200);
    expect(
      (await answer(interviewA, 'N3', { field: 'rating', value: 'betre', expect: null }))
        .statusCode,
    ).toBe(400);
    expect(
      (await answer(interviewA, 'N99', { field: 'answer', value: 'x', expect: '' })).statusCode,
    ).toBe(404);
    const v = json<{
      answers: Record<string, { answer: string; rating: string; action: string; note: string }>;
    }>(await t.call('GET', `/api/admin/interviews/${interviewA}`));
    expect(v.answers.N2).toMatchObject({
      rating: 'manglar',
      action: 'Peik ut ein ansvarleg',
      note: 'Kandidat for pakken',
    });
  });

  it('keeps the overall impression, what was agreed and the note the same way', async () => {
    const put = (body: object) => t.call('PUT', `/api/admin/interviews/${interviewA}/fields`, body);
    expect((await put({ field: 'summary', value: 'God merksemd', expect: '' })).statusCode).toBe(
      200,
    );
    expect((await put({ field: 'summary', value: 'Anna', expect: '' })).statusCode).toBe(409);
    expect(
      (await put({ field: 'agreed', value: 'Tilbod innan 2. desember', expect: '' })).statusCode,
    ).toBe(200);
  });

  it('«Fullfør» locks it and counts it; «Opne for endring» opens it; both in AuditLog', async () => {
    expect((await t.call('POST', `/api/admin/interviews/${interviewA}/done`)).statusCode).toBe(201);
    expect(
      (await answer(interviewA, 'N4', { field: 'answer', value: 'x', expect: '' })).statusCode,
    ).toBe(409);
    expect((await t.call('POST', `/api/admin/interviews/${interviewA}/done`)).statusCode).toBe(409);
    const byClient = json<
      {
        id: string;
        status: string;
        counts: { manglar: number; ivaretatt: number; none: number };
        score: number;
      }[]
    >(await t.call('GET', `/api/admin/clients/${clientA}/interviews`));
    expect(byClient[0]).toMatchObject({
      id: interviewA,
      status: 'done',
      counts: { manglar: 1, ivaretatt: 1, none: 25 },
      score: 50,
    });
    expect((await t.call('POST', `/api/admin/interviews/${interviewA}/reopen`)).statusCode).toBe(
      201,
    );
    const whats = (
      await t.prisma.auditLog.findMany({ where: { target: `interview:${interviewA}` } })
    ).map((l) => l.what);
    expect(whats).toEqual(
      expect.arrayContaining(['interviews.start', 'interviews.done', 'interviews.reopen']),
    );
  });

  it('never writes what was typed to AuditLog', async () => {
    const logs = await t.prisma.auditLog.findMany({
      where: { what: { startsWith: 'interviews.' } },
    });
    expect(JSON.stringify(logs)).not.toContain(t.mark + '');
    expect(JSON.stringify(logs)).not.toContain('Kandidat for pakken');
    expect(JSON.stringify(logs)).not.toContain('Kari Nordmann');
  });
});

describe('data class samtale: handover, forget and the ledger', () => {
  it('the handover lists every answer with notes, the summary and what was agreed', async () => {
    const text = await interviewsCsv(t.prisma, clientA);
    expect(text).toContain(`Ingen definert ansvarleg ${t.mark}`);
    expect(text).toContain('Manglar');
    expect(text).toContain('Kandidat for pakken');
    expect(text).toContain('Tilbod innan 2. desember');
  });

  it('forget by client: a dry run counts, the real run deletes and the ledger deletes a restored copy again', async () => {
    const forget = (dry_run: boolean) =>
      t.call('POST', '/api/admin/retention/forget', {
        scope: { scope: 'client', client: clientA },
        reason: 'Kunden ba om sletting (test)',
        dry_run,
      });
    const preview = await forget(true);
    expect(preview.statusCode, preview.body).toBe(201);
    expect(json<{ interviews: number; total: number }>(preview)).toMatchObject({
      interviews: 1,
      total: 1,
    });
    expect(await t.prisma.interview.count({ where: { client_id: clientA } })).toBe(1);
    const done = await forget(false);
    expect(json<{ interviews: number }>(done).interviews).toBe(1);
    expect(await t.prisma.interview.count({ where: { client_id: clientA } })).toBe(0);
    expect(await t.prisma.interviewAnswer.count({ where: { interview_id: interviewA } })).toBe(0);
    const request = await t.prisma.deletionRequest.findFirst({
      where: { scope: 'client', scope_ref: { path: ['client'], equals: clientA } },
    });
    expect(request?.scope_ref).toMatchObject({ interviews: [interviewA] });
    // A restore brings the row back; the ledger takes it away again.
    await t.prisma.interview.create({
      data: { id: interviewA, interview_round_id: round, client_id: clientA },
    });
    const gone = await t.prisma.$transaction((tx) => applyInterviewLedger(tx));
    expect(gone).toBeGreaterThanOrEqual(1);
    expect(await t.prisma.interview.count({ where: { id: interviewA } })).toBe(0);
    // The other client's conversation is untouched.
    expect(await t.prisma.interview.count({ where: { id: interviewB } })).toBe(1);
  });
});
