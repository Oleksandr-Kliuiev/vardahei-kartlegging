// 2.22b on Postgres: actions of the catalogue chosen under «Konklusjon og tiltak» (decision 3.3 of 07.11).
// The choice is one more field of the answer, saved against the value last seen (409 when stale), only
// with ids of the catalogue and never in a finished conversation; an action that stays keeps its
// follow-up. The client page lists the chosen actions with the statuses of findings and AuditLog; Oversikt
// groups the recurring tiltak by action with its seminar topic; the CSV and the referat name them and
// still carry no note; handover names them; forget by client takes them with the conversation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { interviewsCsv } from '../../src/modules/interviews/interview-retention.js';
import { cookieHeader } from '../support/auth-app.js';
import { parseCsv } from '../support/csv.js';
import { createSeminar, makeClients, seminarApp, type SeminarApp } from '../support/seminars.js';

let t: SeminarApp;
let guide: string, round: string;
let clientA: string, clientB: string;
let talkA: string, talkB: string;
/** Two actions of the catalogue, by their id sorted: `first` < `second`. */
let first: { id: string; name: string }, second: { id: string; name: string };
let NOTE: string;
const actions: string[] = [];

const json = <T>(r: { json: <U>() => U }) => r.json<T>();
const answer = (id: string, q: string, body: object) =>
  t.call('PUT', `/api/admin/interviews/${id}/answers/${q}`, body);
const choose = (id: string, q: string, value: string, expect: string) =>
  answer(id, q, { field: 'actions', value, expect });
const status = (id: string, q: string, action: string, body: object) =>
  t.call('PUT', `/api/admin/interviews/${id}/actions/${q}/${action}/status`, body);
interface Row {
  interview: string;
  conversation: { status: string; held_on: string; round: { id: string; name: string } };
  question: { id: string; no: number; short: string };
  action: { id: string; name: string; seminar_topic: string };
  status: string;
  seminar: { id: string; topic: string; starts_at: string } | null;
  changed_by: string | null;
  changed_at: string | null;
}
/** Both actions, in the order of their names (the order of a list and of the joined names). */
const byName = () => [first, second].sort((a, b) => a.name.localeCompare(b.name, 'nn'));
const rowsOf = async (client: string) => {
  const r = await t.call('GET', `/api/admin/clients/${client}/interview-actions`);
  expect(r.statusCode, r.body).toBe(200);
  return { rows: json<{ rows: Row[] }>(r).rows, body: r.body };
};

async function publishGuide(): Promise<string> {
  const path = (id: string) => `/api/admin/surveys/versions/${id}`;
  const created = await t.call('POST', '/api/admin/surveys', {
    title: `Samtaleguide tiltak ${t.mark}`,
    audience: 'interview',
    identification: 'none',
    required_languages: ['nn'],
  });
  const id = json<{ id: string }>(created).id;
  const hash = async () =>
    json<{ content_hash: string }>(await t.call('GET', path(id))).content_hash;
  await t.call('POST', `${path(id)}/accept`, { content_hash: await hash(), lang: 'nn' });
  const published = await t.call('POST', `${path(id)}/publish`, {
    content_hash: await hash(),
    confirmed: true,
  });
  expect(published.statusCode, published.body).toBe(201);
  return id;
}

async function action(name: string, topic: string) {
  const r = await t.call('POST', '/api/admin/actions', {
    name: `${name} ${t.mark}`,
    description: `Kva ${name} går ut på.`,
    seminar_topic: topic,
  });
  expect(r.statusCode, r.body).toBe(201);
  const id = json<{ id: string }>(r).id;
  actions.push(id);
  return { id, name: `${name} ${t.mark}` };
}

async function start(id: string, day: string) {
  const r = await t.call('POST', `/api/admin/interviews/${id}/start`, {
    held_on: day,
    interviewees: [{ role: 'dagleg leiar', name: `Kari ${t.mark}` }],
    interviewers: ['Asbjørn'],
  });
  expect(r.statusCode, r.body).toBe(201);
}

beforeAll(async () => {
  t = await seminarApp();
  NOTE = `NOTAT-${t.mark}`;
  [clientA, clientB] = (await makeClients(t, ['Tiltak A', 'Tiltak B'])).map((c) => c.id) as [
    string,
    string,
  ];
  guide = await publishGuide();
  const r = await t.call('POST', '/api/admin/interview-rounds', {
    name: `Tiltak ${t.mark}`,
    template_version_id: guide,
    clients: [clientA, clientB],
  });
  expect(r.statusCode, r.body).toBe(201);
  round = json<{ id: string }>(r).id;
  const view = json<{ interviews: { id: string; client: { id: string } }[] }>(
    await t.call('GET', `/api/admin/interview-rounds/${round}`),
  );
  talkA = view.interviews.find((i) => i.client.id === clientA)!.id;
  talkB = view.interviews.find((i) => i.client.id === clientB)!.id;
  const made = [
    await action('Phishing-øving', 'Phishing og svindel'),
    await action('Passordhandterar', 'Passord som fungerer'),
  ].sort((a, b) => (a.id < b.id ? -1 : 1));
  [first, second] = made as [typeof first, typeof first];
  await start(talkA, '2026-11-10');
  await start(talkB, '2026-11-12');
}, 120_000);

afterAll(async () => {
  await t.prisma.interview.deleteMany({ where: { round: { name: { contains: t.mark } } } });
  await t.prisma.interviewRound.deleteMany({ where: { name: { contains: t.mark } } });
  await t.prisma.action.deleteMany({ where: { id: { in: actions } } });
  await t.close();
});

describe('the choice is one more field of the answer (2.22b)', () => {
  it('saves the sorted ids against the value last seen; 409 with the current value when stale', async () => {
    const both = `${first.id},${second.id}`;
    const saved = await choose(talkA, 'N4', both, '');
    expect(saved.statusCode, saved.body).toBe(200);
    expect(json<{ value: string }>(saved).value).toBe(both);
    const v = json<{ answers: Record<string, { actions: string; updated_by: string }> }>(
      await t.call('GET', `/api/admin/interviews/${talkA}`),
    );
    expect(v.answers.N4).toMatchObject({ actions: both, updated_by: 'Syntetisk admin' });
    const stale = await choose(talkA, 'N4', first.id, '');
    expect(stale.statusCode).toBe(409);
    expect(json<{ current: string; updated_by: string }>(stale)).toMatchObject({
      current: both,
      updated_by: 'Syntetisk admin',
    });
    // The other fields of the same answer are not in the way, nor is the choice in theirs.
    expect(
      (await answer(talkA, 'N4', { field: 'action', value: 'Reglar for e-post', expect: '' }))
        .statusCode,
    ).toBe(200);
    expect((await choose(talkA, 'N4', second.id, both)).statusCode).toBe(200);
    expect(await t.prisma.interviewAction.count({ where: { interview_id: talkA } })).toBe(1);
    // A choice of none, then back: '' is the value of no actions.
    expect((await choose(talkA, 'N4', '', second.id)).statusCode).toBe(200);
    expect(await t.prisma.interviewAction.count({ where: { interview_id: talkA } })).toBe(0);
    expect((await choose(talkA, 'N4', both, '')).statusCode).toBe(200);
  });

  it('takes only ids of the catalogue, lower case, sorted and each once', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    const refused = await choose(talkA, 'N5', unknown, '');
    expect(refused.statusCode).toBe(400);
    expect(json<{ message: string }>(refused).message).toContain('katalogen');
    for (const value of [
      `${second.id},${first.id}`,
      `${first.id},${first.id}`,
      first.id.toUpperCase(),
      `${first.id},`,
      'tiltak',
      `${first.id};${second.id}`,
    ])
      expect((await choose(talkA, 'N5', value, '')).statusCode, value).toBe(400);
    expect(await t.prisma.interviewAction.count({ where: { question_id: 'N5' } })).toBe(0);
    expect((await choose(talkA, 'N99', first.id, '')).statusCode).toBe(404);
  });

  it('keeps the follow-up of an action that stays; one taken away and chosen again starts open', async () => {
    const seminar = await createSeminar(t, { clients: [clientA] });
    expect(
      (await status(talkA, 'N4', first.id, { status: 'in_seminar', seminar: seminar.id }))
        .statusCode,
    ).toBe(200);
    const both = `${first.id},${second.id}`;
    expect((await choose(talkA, 'N4', first.id, both)).statusCode).toBe(200);
    expect((await choose(talkA, 'N4', both, first.id)).statusCode).toBe(200);
    const kept = await t.prisma.interviewAction.findUniqueOrThrow({
      where: {
        interview_id_question_id_action_id: {
          interview_id: talkA,
          question_id: 'N4',
          action_id: first.id,
        },
      },
    });
    expect(kept).toMatchObject({
      closed: false,
      seminar_id: seminar.id,
      changed_by: 'Syntetisk admin',
    });
    const by = async () => (await rowsOf(clientA)).rows.filter((r) => r.question.id === 'N4');
    // In the order of their names; the one that stayed is still at the seminar.
    expect((await by()).map((r) => [r.action.id, r.status])).toEqual(
      byName().map((x) => [x.id, x.id === first.id ? 'in_seminar' : 'open']),
    );
    // Taken away and chosen again: a new choice, open, with no one named.
    expect((await choose(talkA, 'N4', second.id, both)).statusCode).toBe(200);
    expect((await choose(talkA, 'N4', both, second.id)).statusCode).toBe(200);
    const again = (await by()).find((r) => r.action.id === first.id)!;
    expect(again).toMatchObject({ status: 'open', seminar: null, changed_by: null });
    // A seminar taken away: what it took up is open again (SET NULL), as for findings.
    expect(
      (await status(talkA, 'N4', first.id, { status: 'in_seminar', seminar: seminar.id }))
        .statusCode,
    ).toBe(200);
    expect(
      (await status(talkA, 'N4', second.id, { status: 'closed', seminar: seminar.id })).statusCode,
    ).toBe(200);
    // Deleted by another admin: both rows name who deleted it, not who took them up (the foreign key
    // alone would have cleared the link under the old name), by name and never by Entra id, and the
    // seminar's AuditLog counts the one that went back to open.
    const andre = { oid: 'test:seminar-admin-2', name: 'Andre admin', via: 'entra' };
    const other = await t.store.create({ ...andre, expiresAt: new Date(Date.now() + 3600_000) });
    // Names come from the admin sessions in the database (the test app keeps its own in memory).
    await t.prisma.adminSession.create({
      data: { ...andre, expires_at: new Date(Date.now() + 3600_000) },
    });
    const sid = t.app.getHttpAdapter().getInstance().signCookie(other.sid);
    const removed = await t.call('DELETE', `/api/admin/seminars/${seminar.id}`, undefined, {
      cookie: cookieHeader({ '__Host-varde_session': sid }),
    });
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.json()).toMatchObject({ actions_reopened: 1 });
    const after = await by();
    expect(after.find((r) => r.action.id === first.id)).toMatchObject({
      status: 'open',
      seminar: null,
      changed_by: 'Andre admin',
    });
    expect(after.find((r) => r.action.id === second.id)).toMatchObject({
      status: 'closed',
      seminar: null,
      changed_by: 'Andre admin',
    });
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { what: 'seminars.delete', target: `seminar:${seminar.id}` },
    });
    expect(audit).toMatchObject({
      who: 'entra:test:seminar-admin-2',
      details: { actions_reopened: 1 },
    });
    await t.prisma.adminSession.deleteMany({ where: andre });
  });

  it('an action chosen in a conversation cannot leave the catalogue (RESTRICT)', async () => {
    await expect(t.prisma.action.delete({ where: { id: first.id } })).rejects.toThrow();
    expect(await t.prisma.action.count({ where: { id: first.id } })).toBe(1);
  });
});

describe('the follow-up on the client page (2.22b)', () => {
  it('lists the chosen actions of this client only, with the question, the topic and the conversation', async () => {
    expect((await choose(talkB, 'N2', second.id, '')).statusCode).toBe(200);
    // A note on the answer and on the conversation first: neither may reach the client page
    // (acceptance of 2.22b, M06: this list was read before any note was written).
    expect(
      (await answer(talkA, 'N9', { field: 'note', value: `${NOTE} on the answer`, expect: '' }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await t.call('PUT', `/api/admin/interviews/${talkA}/fields`, {
          field: 'note',
          value: `${NOTE} on the conversation`,
          expect: '',
        })
      ).statusCode,
    ).toBe(200);
    const { rows, body } = await rowsOf(clientA);
    expect(body).not.toContain(NOTE);
    expect(rows.every((r) => r.interview === talkA)).toBe(true);
    const row = rows.find((r) => r.action.id === second.id)!;
    expect(row).toMatchObject({
      conversation: {
        status: 'in_progress',
        held_on: '2026-11-10',
        round: { id: round, name: `Tiltak ${t.mark}` },
      },
      question: { id: 'N4', no: 3, short: 'Privat e-post' },
      action: { id: second.id, name: second.name },
    });
    expect(row.action.seminar_topic).toMatch(/^(Phishing og svindel|Passord som fungerer)$/);
    // Never what was typed: no answer, conclusion or note.
    expect(body).not.toContain('Reglar for e-post');
    expect(body).not.toContain(`Kari ${t.mark}`);
    expect((await rowsOf(clientB)).rows.map((r) => r.interview)).toEqual([talkB]);
    expect(
      (
        await t.call(
          'GET',
          '/api/admin/clients/00000000-0000-4000-8000-000000000000/interview-actions',
        )
      ).statusCode,
    ).toBe(404);
  });

  it('changes the status as for findings, with AuditLog that holds no typed text', async () => {
    const seminar = await createSeminar(t, { clients: [clientA] });
    const r = await status(talkA, 'N4', first.id, { status: 'in_seminar', seminar: seminar.id });
    expect(r.statusCode, r.body).toBe(200);
    expect(json<{ status: string; seminar: string; changed_by: string }>(r)).toMatchObject({
      status: 'in_seminar',
      seminar: seminar.id,
      changed_by: 'Syntetisk admin',
    });
    const done = await status(talkA, 'N4', first.id, { status: 'closed', seminar: seminar.id });
    expect(json<{ status: string }>(done).status).toBe('closed');
    const logs = await t.prisma.auditLog.findMany({
      where: { what: 'interviews.action.status', target: `interview:${talkA}` },
      orderBy: { at: 'desc' },
      take: 2,
    });
    expect(logs[0]?.details).toEqual({
      question: 'N4',
      action: first.id,
      status: 'closed',
      seminar: seminar.id,
    });
    expect(logs[1]?.details).toMatchObject({ status: 'in_seminar', seminar: seminar.id });
    const row = (await rowsOf(clientA)).rows.find(
      (x) => x.action.id === first.id && x.question.id === 'N4',
    )!;
    expect(row).toMatchObject({
      status: 'closed',
      seminar: { id: seminar.id, topic: expect.stringContaining(t.mark) as string },
      changed_by: 'Syntetisk admin',
    });
    expect(row.changed_at).not.toBeNull();
    // Open again; refused: no such choice, a seminar that does not exist, a body findings refuse.
    expect((await status(talkA, 'N4', first.id, { status: 'open' })).statusCode).toBe(200);
    expect((await status(talkA, 'N6', first.id, { status: 'open' })).statusCode).toBe(404);
    expect(
      (
        await status(talkA, 'N4', first.id, {
          status: 'in_seminar',
          seminar: '00000000-0000-4000-8000-000000000000',
        })
      ).statusCode,
    ).toBe(404);
    expect((await status(talkA, 'N4', first.id, { status: 'in_seminar' })).statusCode).toBe(400);
    expect((await status(talkA, 'N4', first.id, { status: 'kanskje' })).statusCode).toBe(400);
    expect((await status(talkA, 'x-y', first.id, { status: 'open' })).statusCode).toBe(404);
    const all = JSON.stringify(
      await t.prisma.auditLog.findMany({ where: { target: `interview:${talkA}` } }),
    );
    for (const typed of ['Reglar for e-post', `Kari ${t.mark}`, first.name, second.name])
      expect(all).not.toContain(typed);
  });

  it('a finished conversation refuses a new choice, and its follow-up still changes', async () => {
    expect(
      (await answer(talkA, 'N4', { field: 'note', value: `${NOTE} N4`, expect: '' })).statusCode,
    ).toBe(200);
    expect(
      (await answer(talkA, 'N4', { field: 'rating', value: 'manglar', expect: null })).statusCode,
    ).toBe(200);
    expect((await t.call('POST', `/api/admin/interviews/${talkA}/done`)).statusCode).toBe(201);
    const locked = await choose(talkA, 'N4', first.id, `${first.id},${second.id}`);
    expect(locked.statusCode).toBe(409);
    expect(json<{ current?: unknown }>(locked).current).toBeUndefined();
    expect(
      await t.prisma.interviewAction.count({ where: { interview_id: talkA, question_id: 'N4' } }),
    ).toBe(2);
    expect((await status(talkA, 'N4', second.id, { status: 'closed' })).statusCode).toBe(200);
    // Before the start a conversation takes nothing either.
    const planned = await t.call('POST', '/api/admin/interview-rounds', {
      name: `Tiltak seinare ${t.mark}`,
      template_version_id: guide,
      clients: [clientB],
    });
    const later = json<{ interviews: { id: string }[] }>(
      await t.call('GET', `/api/admin/interview-rounds/${json<{ id: string }>(planned).id}`),
    ).interviews[0]!.id;
    expect((await choose(later, 'N2', first.id, '')).statusCode).toBe(409);
  });
});

describe('Oversikt, its CSV and the referat (2.22b)', () => {
  it('groups the recurring tiltak by action first; a conclusion without one stays a wording', async () => {
    // B: N2 gets a conclusion beside its action of the catalogue, N3 a conclusion only.
    expect(
      (
        await answer(talkB, 'N3', {
          field: 'action',
          value: 'Fast sak på personalmøtet',
          expect: '',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await answer(talkB, 'N2', { field: 'action', value: 'Med tekst òg', expect: '' }))
        .statusCode,
    ).toBe(200);
    const r = await t.call(
      'GET',
      `/api/admin/interview-rounds/overview?rounds=${round}&in_progress=true`,
    );
    expect(r.statusCode, r.body).toBe(200);
    const o = json<{
      catalog: {
        action: { id: string; name: string; seminar_topic: string };
        clients: number;
        questions: string[];
      }[];
      actions: { question: string; clients: number; texts: { text: string; clients: number }[] }[];
      totals: { actions: number };
    }>(r);
    // «second» is chosen by A (N4) and B (N2); «first» only by A (N4).
    expect(o.catalog.map((g) => [g.action.id, g.clients, g.questions])).toEqual([
      [second.id, 2, ['N2', 'N4']],
      [first.id, 1, ['N4']],
    ]);
    expect(o.catalog[0]!.action).toEqual({
      id: second.id,
      name: second.name,
      seminar_topic: expect.any(String) as string,
    });
    // A's N4 and B's N2 have actions of the catalogue: their texts count under them, not as wordings.
    expect(o.actions).toEqual([
      { question: 'N3', clients: 1, texts: [{ text: 'Fast sak på personalmøtet', clients: 1 }] },
    ]);
    // Conclusions written still count all three.
    expect(o.totals.actions).toBe(3);
    expect(r.body).not.toContain(NOTE);
  });

  it('the CSV names the chosen actions in a column of its own and has no note', async () => {
    const r = await t.call(
      'GET',
      `/api/admin/interview-rounds/export.csv?rounds=${round}&in_progress=true`,
    );
    expect(r.statusCode).toBe(200);
    const rows = parseCsv(r.body);
    expect(rows[0]).toEqual([
      'Samtalerunde',
      'Kunde',
      'Dato',
      'Status',
      'Nr',
      'Tema',
      'Spørsmål',
      'Kva kunden sa',
      'Vurdering',
      'Konklusjon og tiltak',
      'Tiltak frå katalogen',
    ]);
    const a4 = rows.find((x) => x[1] === `Tiltak A ${t.mark}` && x[4] === '3')!;
    expect(a4[9]).toBe('Reglar for e-post');
    expect(a4[10]).toBe(
      byName()
        .map((x) => x.name)
        .join('; '),
    );
    const b3 = rows.find((x) => x[1] === `Tiltak B ${t.mark}` && x[4] === '2')!;
    expect(b3[10]).toBe('');
    expect(r.body).not.toContain(NOTE);
  });

  it('the referat names the chosen actions beside the conclusion and never a note', async () => {
    const r = await t.call('GET', `/api/admin/interviews/${talkA}/referat`);
    expect(r.statusCode, r.body).toBe(200);
    const q = json<{ questions: { id: string; action: string; catalog: string[] }[] }>(r).questions;
    expect(q.find((x) => x.id === 'N4')).toMatchObject({
      action: 'Reglar for e-post',
      catalog: byName().map((x) => x.name),
    });
    expect(q.find((x) => x.id === 'N2')?.catalog).toEqual([]);
    expect(r.body).not.toContain(NOTE);
    expect(r.body).not.toMatch(/"note"\s*:/);
  });
});

describe('data class samtale: handover and forget (2.22b)', () => {
  it('handover names the chosen actions of this client only', async () => {
    const rows = parseCsv(await interviewsCsv(t.prisma, clientA));
    expect(rows[0]).toEqual([
      'Samtalerunde',
      'Dato',
      'Nr',
      'Spørsmål',
      'Kva kunden sa',
      'Vurdering',
      'Konklusjon og tiltak',
      'Tiltak frå katalogen',
      'Eige notat',
    ]);
    const n4 = rows.find((x) => x[2] === '3')!;
    expect(n4[6]).toBe('Reglar for e-post');
    expect(n4[7]).toBe(
      byName()
        .map((x) => x.name)
        .join('; '),
    );
    expect(n4[8]).toBe(`${NOTE} N4`);
    // The rows of who took part have the same nine columns.
    expect(rows.slice(1).every((x) => x.length === 9)).toBe(true);
    const b = await interviewsCsv(t.prisma, clientB);
    expect(b).toContain(second.name);
    expect(b).not.toContain(first.name);
  });

  it('forget by client takes its chosen actions with the conversation; the other client keeps its own', async () => {
    expect(await t.prisma.interviewAction.count({ where: { interview_id: talkA } })).toBe(2);
    const done = await t.call('POST', '/api/admin/retention/forget', {
      scope: { scope: 'client', client: clientA },
      reason: 'Kunden ba om sletting (test)',
      dry_run: false,
    });
    expect(done.statusCode, done.body).toBe(201);
    expect(await t.prisma.interviewAction.count({ where: { interview_id: talkA } })).toBe(0);
    expect(await t.prisma.interviewAction.count({ where: { interview_id: talkB } })).toBe(1);
    expect((await rowsOf(clientA)).rows).toEqual([]);
    // The catalogue stays: an action is Vardahei's, not the client's.
    expect(await t.prisma.action.count({ where: { id: { in: actions } } })).toBe(2);
  });
});
