// Keeping a conversation round tidy (10.11): a new name for one that exists, the end of a tour and
// the way back from it. A closed round takes no new clients and no new conversation; one already
// going stays writable, so closing never traps half-done work, and closing deletes nothing. Deleting
// is its own act: a round or one conversation, written ones with a deletion request behind them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeClients, seminarApp, type SeminarApp } from '../support/seminars.js';

let t: SeminarApp;
let guide: string;
let clientA: string, clientB: string;

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
  const hash = async () =>
    json<{ content_hash: string }>(await t.call('GET', surveyPath(id))).content_hash;
  expect(
    (await t.call('POST', `${surveyPath(id)}/accept`, { content_hash: await hash(), lang: 'nn' }))
      .statusCode,
  ).toBe(201);
  const published = await t.call('POST', `${surveyPath(id)}/publish`, {
    content_hash: await hash(),
    confirmed: true,
  });
  expect(published.statusCode, published.body).toBe(201);
  return id;
}

async function makeRound(name: string, clients: string[] = [clientA]) {
  const r = await t.call('POST', '/api/admin/interview-rounds', {
    name,
    template_version_id: guide,
    clients,
  });
  expect(r.statusCode, r.body).toBe(201);
  return json<{ id: string }>(r).id;
}

const roundRow = async (id: string) =>
  (await t.call('GET', '/api/admin/interview-rounds'))
    .json<{ id: string; status: string; name: string }[]>()
    .find((r) => r.id === id);

const planned = async (round: string) =>
  json<{ interviews: { id: string; status: string }[] }>(
    await t.call('GET', `/api/admin/interview-rounds/${round}`),
  ).interviews.find((i) => i.status === 'planned')!.id;

async function startOne(round: string, client: string) {
  const rows = json<{ interviews: { id: string; client: { id: string } }[] }>(
    await t.call('GET', `/api/admin/interview-rounds/${round}`),
  ).interviews;
  const id = rows.find((i) => i.client.id === client)!.id;
  const r = await t.call('POST', `/api/admin/interviews/${id}/start`, {
    held_on: '2026-11-10',
    interviewees: [{ role: 'dagleg leiar' }],
    interviewers: ['Syntetisk admin'],
    client,
  });
  expect(r.statusCode, r.body).toBe(201);
  return id;
}

/** Whether a deletion request lists the conversation, the way `applyInterviewLedger` reads it. */
const ledgerHas = async (interview: string) =>
  (
    await t.prisma.deletionRequest.findMany({
      where: { scope: 'client' },
      select: { scope_ref: true },
    })
  ).some((r) => ((r.scope_ref as { interviews?: string[] }).interviews ?? []).includes(interview));

const whatIn = async (round: string) =>
  (
    await t.prisma.auditLog.findMany({
      where: { target: `interview_round:${round}` },
      select: { what: true },
    })
  ).map((a) => a.what);

beforeAll(async () => {
  t = await seminarApp();
  [clientA, clientB] = (await makeClients(t, ['Rundeadmin A', 'Rundeadmin B'])).map(
    (c) => c.id,
  ) as [string, string];
  guide = await publishGuide();
});

afterAll(async () => {
  await t.prisma.interview.deleteMany({ where: { round: { name: { contains: t.mark } } } });
  await t.prisma.interviewRound.deleteMany({ where: { name: { contains: t.mark } } });
  await t.close();
});

describe('the name of a conversation round', () => {
  it('can be corrected, keeps the old name in the journal and refuses a name in use', async () => {
    const round = await makeRound(`Kartkegging ${t.mark}`);
    const other = await makeRound(`Vår ${t.mark}`, [clientB]);

    const ok = await t.call('PUT', `/api/admin/interview-rounds/${round}/name`, {
      name: `Kartlegging ${t.mark}`,
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect((await roundRow(round))?.name).toBe(`Kartlegging ${t.mark}`);
    const log = await t.prisma.auditLog.findFirst({
      where: { target: `interview_round:${round}`, what: 'interviews.round.rename' },
      select: { details: true },
    });
    expect(log?.details).toMatchObject({
      from: `Kartkegging ${t.mark}`,
      to: `Kartlegging ${t.mark}`,
    });

    const clash = await t.call('PUT', `/api/admin/interview-rounds/${other}/name`, {
      name: `Kartlegging ${t.mark}`,
    });
    expect(clash.statusCode).toBe(409);
    expect(clash.body).toContain('alt ei samtalerunde med dette namnet');
    expect((await roundRow(other))?.name).toBe(`Vår ${t.mark}`);
  });

  it('refuses an empty name and a round that does not exist', async () => {
    const round = await makeRound(`Tom ${t.mark}`);
    const empty = await t.call('PUT', `/api/admin/interview-rounds/${round}/name`, { name: '   ' });
    expect(empty.statusCode).toBe(400);
    const gone = await t.call(
      'PUT',
      '/api/admin/interview-rounds/00000000-0000-4000-8000-000000000000/name',
      { name: `Finst ikkje ${t.mark}` },
    );
    expect(gone.statusCode).toBe(404);
  });
});

describe('closing a conversation round', () => {
  it('takes no new client and no new conversation, and says so', async () => {
    const round = await makeRound(`Avslutt ${t.mark}`);
    const first = await planned(round);

    expect((await t.call('POST', `/api/admin/interview-rounds/${round}/close`)).statusCode).toBe(
      201,
    );
    expect((await roundRow(round))?.status).toBe('closed');

    const again = await t.call('POST', `/api/admin/interview-rounds/${round}/close`);
    expect(again.statusCode).toBe(409);
    expect(again.body).toContain('avslutta alt');

    const addClient = await t.call('POST', `/api/admin/interview-rounds/${round}/clients`, {
      clients: [clientB],
    });
    expect(addClient.statusCode).toBe(409);
    expect(addClient.body).toContain('Samtalerunda er avslutta');

    const start = await t.call('POST', `/api/admin/interviews/${first}/start`, {
      held_on: '2026-11-10',
      interviewees: [{ role: 'dagleg leiar' }],
      interviewers: ['Syntetisk admin'],
      client: clientA,
    });
    expect(start.statusCode).toBe(409);
    expect(start.body).toContain('Samtalerunda er avslutta');
  });

  it('leaves a conversation that is already going writable, and opening the round undoes it all', async () => {
    const round = await makeRound(`Halvvegs ${t.mark}`);
    const going = await planned(round);
    expect(
      (
        await t.call('POST', `/api/admin/interviews/${going}/start`, {
          held_on: '2026-11-10',
          interviewees: [{ role: 'dagleg leiar' }],
          interviewers: ['Syntetisk admin'],
          client: clientA,
        })
      ).statusCode,
    ).toBe(201);

    expect((await t.call('POST', `/api/admin/interview-rounds/${round}/close`)).statusCode).toBe(
      201,
    );
    // The half-done conversation is not trapped: «Endre kven som er med» still goes through.
    const edit = await t.call('POST', `/api/admin/interviews/${going}/start`, {
      held_on: '2026-11-11',
      interviewees: [{ role: 'økonomi' }],
      interviewers: ['Syntetisk admin'],
      client: clientA,
    });
    expect(edit.statusCode, edit.body).toBe(201);

    expect((await t.call('POST', `/api/admin/interview-rounds/${round}/reopen`)).statusCode).toBe(
      201,
    );
    expect((await roundRow(round))?.status).toBe('open');
    expect(
      (await t.call('POST', `/api/admin/interview-rounds/${round}/clients`, { clients: [clientB] }))
        .statusCode,
    ).toBe(201);
    expect(await whatIn(round)).toEqual(
      expect.arrayContaining(['interviews.round.close', 'interviews.round.reopen']),
    );
  });

  it('refuses to open a round that is open, and never deletes anything', async () => {
    const round = await makeRound(`Open alt ${t.mark}`);
    const again = await t.call('POST', `/api/admin/interview-rounds/${round}/reopen`);
    expect(again.statusCode).toBe(409);
    expect(again.body).toContain('open alt');
    const rows = json<{ interviews: unknown[] }>(
      await t.call('GET', `/api/admin/interview-rounds/${round}`),
    );
    expect(rows.interviews).toHaveLength(1);
  });
});

describe('deleting a conversation round', () => {
  it('removes one nobody has sat down in, with its planned conversations', async () => {
    const round = await makeRound(`Feilopretta ${t.mark}`, [clientA, clientB]);
    const gone = await t.call('DELETE', `/api/admin/interview-rounds/${round}`);
    expect(gone.statusCode, gone.body).toBe(200);
    expect(await roundRow(round)).toBeUndefined();
    expect(await t.prisma.interview.count({ where: { interview_round_id: round } })).toBe(0);
    const log = await t.prisma.auditLog.findFirst({
      where: { target: `interview_round:${round}`, what: 'interviews.round.delete' },
      select: { details: true },
    });
    expect(log?.details).toMatchObject({ name: `Feilopretta ${t.mark}`, planned: 2 });
  });

  it('deletes a round with written conversations too, leaving a deletion request per client', async () => {
    const round = await makeRound(`Øving ${t.mark}`, [clientA, clientB]);
    const going = await startOne(round, clientA);
    expect((await t.call('POST', `/api/admin/interview-rounds/${round}/close`)).statusCode).toBe(
      201,
    );
    const gone = await t.call('DELETE', `/api/admin/interview-rounds/${round}`);
    expect(gone.statusCode, gone.body).toBe(200);
    expect(await roundRow(round)).toBeUndefined();
    expect(await t.prisma.interview.count({ where: { interview_round_id: round } })).toBe(0);
    // The written one is in the ledger, so a restore from backup deletes it again.
    expect(await ledgerHas(going)).toBe(true);
    const log = await t.prisma.auditLog.findFirst({
      where: { target: `interview_round:${round}`, what: 'interviews.round.delete' },
      select: { details: true },
    });
    expect(log?.details).toMatchObject({ name: `Øving ${t.mark}`, planned: 1, started: 1 });
  });

  it('says so when the round is already gone', async () => {
    const gone = await t.call(
      'DELETE',
      '/api/admin/interview-rounds/00000000-0000-4000-8000-000000000000',
    );
    expect(gone.statusCode).toBe(404);
  });
});

describe('deleting one conversation', () => {
  it('takes a planned client off the round without a ledger entry', async () => {
    const round = await makeRound(`Ta av ${t.mark}`, [clientA, clientB]);
    const first = await planned(round);
    const gone = await t.call('DELETE', `/api/admin/interviews/${first}`);
    expect(gone.statusCode, gone.body).toBe(200);
    expect(gone.json()).toEqual({ id: first, round });
    expect(await t.prisma.interview.count({ where: { interview_round_id: round } })).toBe(1);
    expect(await ledgerHas(first)).toBe(false);
    const log = await t.prisma.auditLog.findFirst({
      where: { target: `interview:${first}`, what: 'interviews.delete' },
      select: { details: true },
    });
    expect(log?.details).toMatchObject({ round, status: 'planned' });
  });

  it('deletes a written one with its answers and keeps it deleted after a restore', async () => {
    const round = await makeRound(`Skriven ${t.mark}`, [clientA]);
    const going = await startOne(round, clientA);
    await t.prisma.interviewAnswer.create({
      data: {
        interview_id: going,
        question_id: 'q1',
        answer: 'Syntetisk svar',
        updated_by: 'Syntetisk admin',
      },
    });
    const gone = await t.call('DELETE', `/api/admin/interviews/${going}`);
    expect(gone.statusCode, gone.body).toBe(200);
    expect(await t.prisma.interview.count({ where: { id: going } })).toBe(0);
    expect(await t.prisma.interviewAnswer.count({ where: { interview_id: going } })).toBe(0);
    expect(await ledgerHas(going)).toBe(true);
    const log = await t.prisma.auditLog.findFirst({
      where: { target: `interview:${going}`, what: 'interviews.delete' },
      select: { details: true },
    });
    expect(log?.details).toMatchObject({ round, status: 'in_progress' });
    // The round stays, and the client can be added to it again.
    expect((await roundRow(round))?.name).toBe(`Skriven ${t.mark}`);
    expect(
      (await t.call('POST', `/api/admin/interview-rounds/${round}/clients`, { clients: [clientA] }))
        .statusCode,
    ).toBe(201);
  });

  it('says so when the conversation is already gone', async () => {
    const gone = await t.call(
      'DELETE',
      '/api/admin/interviews/00000000-0000-4000-8000-000000000000',
    );
    expect(gone.statusCode).toBe(404);
  });
});
