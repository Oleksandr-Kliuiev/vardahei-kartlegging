// Keeping a conversation round tidy (10.11): a new name for one that exists, the end of a tour and
// the way back from it. A closed round takes no new clients and no new conversation; one already
// going stays writable, so closing never traps half-done work. Nothing is ever deleted.
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
  (await t.call('GET', '/api/admin/interview-rounds')).json<{ id: string; status: string; name: string }[]>()
    .find((r) => r.id === id);

const planned = async (round: string) =>
  json<{ interviews: { id: string; status: string }[] }>(
    await t.call('GET', `/api/admin/interview-rounds/${round}`),
  ).interviews.find((i) => i.status === 'planned')!.id;

const whatIn = async (round: string) =>
  (
    await t.prisma.auditLog.findMany({
      where: { target: `interview_round:${round}` },
      select: { what: true },
    })
  ).map((a) => a.what);

beforeAll(async () => {
  t = await seminarApp();
  [clientA, clientB] = (await makeClients(t, ['Rundeadmin A', 'Rundeadmin B'])).map((c) => c.id) as [
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
    expect(log?.details).toMatchObject({ from: `Kartkegging ${t.mark}`, to: `Kartlegging ${t.mark}` });

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
