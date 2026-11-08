// The concept of Samtalar, «ошиблись клиентом»: a conversation started with the wrong client moves in
// «Endre» (the same call as the people and the day) to the right client of the round, with all that is
// written in it, until it is finished. The wrong client is back as not started, one conversation per
// client per round holds, AuditLog says who moved what and holds nothing typed.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EventsService } from '../../src/modules/events/events.service.js';
import { createSeminar, makeClients, seminarApp, type SeminarApp } from '../support/seminars.js';

let t: SeminarApp;
let guide: string, round: string;
let a: string, b: string, c: string, d: string;
let outside: string;

const json = <T>(r: { json: <U>() => U }) => r.json<T>();
const who = [{ role: 'dagleg leiar' }];
const start = (id: string, extra: object = {}) =>
  t.call('POST', `/api/admin/interviews/${id}/start`, {
    held_on: '2026-11-10',
    interviewees: who,
    interviewers: ['Asbjørn'],
    ...extra,
  });
const answer = (
  id: string,
  q: string,
  field: string,
  value: string | null,
  expect: string | null,
) => t.call('PUT', `/api/admin/interviews/${id}/answers/${q}`, { field, value, expect });

/** «Endre» moving a conversation: the client wanted and the client the screen shows. */
const move = (id: string, from: string, to: string, extra: object = {}) =>
  start(id, { client: to, from, ...extra });

interface Row {
  id: string;
  status: string;
  client: { id: string; name: string };
}
const rows = async () =>
  json<{ interviews: Row[] }>(await t.call('GET', `/api/admin/interview-rounds/${round}`))
    .interviews;
const of = async (client: string) => (await rows()).find((r) => r.client.id === client)!;
const moves = () =>
  t.prisma.auditLog.findMany({ where: { what: 'interviews.client' }, orderBy: { at: 'asc' } });

async function publishGuide(): Promise<string> {
  const path = (id: string) => `/api/admin/surveys/versions/${id}`;
  const created = await t.call('POST', '/api/admin/surveys', {
    title: `Samtaleguide flytt ${t.mark}`,
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

beforeAll(async () => {
  t = await seminarApp();
  const made = (await makeClients(t, ['Flytt A', 'Flytt B', 'Flytt C', 'Flytt D', 'Utanfor'])).map(
    (x) => x.id,
  );
  [a, b, c, d, outside] = made as [string, string, string, string, string];
  guide = await publishGuide();
  const r = await t.call('POST', '/api/admin/interview-rounds', {
    name: `Flytt ${t.mark}`,
    template_version_id: guide,
    clients: [a, b, c, d],
  });
  expect(r.statusCode, r.body).toBe(201);
  round = json<{ id: string }>(r).id;
}, 120_000);

afterAll(async () => {
  await t.prisma.interview.deleteMany({ where: { round: { name: { contains: t.mark } } } });
  await t.prisma.interviewRound.deleteMany({ where: { name: { contains: t.mark } } });
  await t.prisma.auditLog.deleteMany({ where: { what: 'interviews.client' } });
  await t.close();
});

describe('a conversation started with the wrong client', () => {
  it('moves to the right one with all that is written; the wrong one is back as not started', async () => {
    const id = (await of(a)).id;
    const placeOfB = (await of(b)).id;
    expect((await start(id)).statusCode).toBe(201);
    expect((await answer(id, 'N2', 'answer', 'Dagleg leiar har det.', '')).statusCode).toBe(200);
    expect((await answer(id, 'N2', 'rating', 'ivaretatt', null)).statusCode).toBe(200);
    expect((await answer(id, 'N2', 'note', 'Eige notat', '')).statusCode).toBe(200);

    const moved = await move(id, a, b, { held_on: '2026-11-11' });
    expect(moved.statusCode, moved.body).toBe(201);

    const now = json<{
      client: { id: string };
      status: string;
      held_on: string;
      answers: Record<string, { answer: string; rating: string; note: string }>;
    }>(await t.call('GET', `/api/admin/interviews/${id}`));
    expect(now.client.id).toBe(b);
    expect(now.status).toBe('in_progress');
    expect(now.held_on.slice(0, 10)).toBe('2026-11-11');
    expect(now.answers.N2).toMatchObject({
      answer: 'Dagleg leiar har det.',
      rating: 'ivaretatt',
      note: 'Eige notat',
    });

    // One conversation per client: the same four places, B has the conversation, A waits again.
    const list = await rows();
    expect(list).toHaveLength(4);
    expect((await of(b)).id).toBe(id);
    expect((await of(a)).status).toBe('planned');
    expect((await of(a)).id).not.toBe(id);
    expect(list.map((r) => r.id)).not.toContain(placeOfB);

    // The client pages say the same.
    const page = async (client: string) =>
      json<{ id: string; status: string }[]>(
        await t.call('GET', `/api/admin/clients/${client}/interviews`),
      );
    expect((await page(b)).map((x) => [x.id, x.status])).toEqual([[id, 'in_progress']]);
    expect((await page(a)).map((x) => x.status)).toEqual(['planned']);

    // AuditLog: who, the round, both clients; nothing typed.
    const log = (await moves()).filter((l) => l.target === `interview:${id}`);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      who: 'entra:test:seminar-admin',
      details: { round, from: a, to: b },
    });
    expect(JSON.stringify(log[0])).not.toContain('Dagleg leiar har det');
    expect(JSON.stringify(log[0])).not.toContain('Eige notat');

    // And back again: the mistake can itself be corrected.
    expect((await move(id, b, a)).statusCode).toBe(201);
    expect((await of(a)).id).toBe(id);
    expect((await of(b)).status).toBe('planned');
    expect((await moves()).filter((l) => l.target === `interview:${id}`)).toHaveLength(2);
  });

  it('refuses a move from a screen that still shows another client than it has', async () => {
    const id = (await of(a)).id;
    const before = (await moves()).length;
    for (const body of [{ client: c }, { client: c, from: b }]) {
      const r = await start(id, body);
      expect(r.statusCode, r.body).toBe(409);
      expect(json<{ message: string }>(r).message).toMatch(/annan skjerm/);
    }
    expect((await of(a)).id).toBe(id);
    expect((await moves()).length).toBe(before);
  });

  it('tells the other screens, only when it really moved', async () => {
    const id = (await of(a)).id;
    const changed = vi.spyOn(t.app.get(EventsService), 'changed');
    expect((await start(id)).statusCode).toBe(201);
    expect((await start(id, { client: a, from: a })).statusCode).toBe(201);
    expect(changed).not.toHaveBeenCalledWith('samtalar');
    expect((await move(id, a, c)).statusCode).toBe(201);
    expect(changed).toHaveBeenCalledWith('samtalar');
    changed.mockRestore();
    expect((await move(id, c, a)).statusCode).toBe(201);
  });

  it('keeps one conversation per client when a move and a start of its place meet', async () => {
    for (let n = 0; n < 8; n += 1) {
      const r = await t.call('POST', '/api/admin/interview-rounds', {
        name: `Flytt samstundes ${n} ${t.mark}`,
        template_version_id: guide,
        clients: [a, b],
      });
      expect(r.statusCode, r.body).toBe(201);
      const fresh = json<{ id: string }>(r).id;
      const list = async () =>
        json<{ interviews: Row[] }>(await t.call('GET', `/api/admin/interview-rounds/${fresh}`))
          .interviews;
      const first = await list();
      const id = first.find((x) => x.client.id === a)!.id;
      const place = first.find((x) => x.client.id === b)!.id;
      expect((await start(id)).statusCode).toBe(201);

      const [moved, started] = await Promise.all([move(id, a, b), start(place)]);

      // Exactly one of them won; neither conversation was lost or doubled.
      expect(
        [moved.statusCode, started.statusCode].filter((x) => x === 201),
        moved.body,
      ).toHaveLength(1);
      const after = await list();
      expect(after).toHaveLength(2);
      expect(new Set(after.map((x) => x.client.id))).toEqual(new Set([a, b]));
      expect(after.map((x) => x.id)).toContain(id);
      if (started.statusCode === 201) expect(after.map((x) => x.id)).toContain(place);
    }
  });

  it('a move and a deletion on request at the same moment: the ledger lists exactly what went', async () => {
    for (let n = 0; n < 6; n += 1) {
      const made = async (side: string) =>
        (
          await t.prisma.client.create({
            data: { slug: `${t.mark}-g${n}${side}`, name: `Gløym ${side}${n} ${t.mark}` },
          })
        ).id;
      const [x, y] = [await made('a'), await made('b')];
      const r = await t.call('POST', '/api/admin/interview-rounds', {
        name: `Flytt gløym ${n} ${t.mark}`,
        template_version_id: guide,
        clients: [x, y],
      });
      expect(r.statusCode, r.body).toBe(201);
      const view = json<{ interviews: Row[] }>(
        await t.call('GET', `/api/admin/interview-rounds/${json<{ id: string }>(r).id}`),
      );
      const id = view.interviews.find((v) => v.client.id === x)!.id;
      expect((await start(id)).statusCode).toBe(201);

      const [, forgot] = await Promise.all([
        move(id, x, y),
        t.call('POST', '/api/admin/retention/forget', {
          scope: { scope: 'client', client: x },
          reason: 'test',
          dry_run: false,
        }),
      ]);
      expect(forgot.statusCode, forgot.body).toBeLessThan(300);

      const still = await t.prisma.interview.findUnique({ where: { id } });
      const requests = await t.prisma.deletionRequest.findMany({
        where: { scope: 'client', scope_ref: { path: ['client'], equals: x } },
      });
      const listed = requests.flatMap(
        (q) => (q.scope_ref as { interviews?: string[] }).interviews ?? [],
      );
      if (still) {
        expect(still.client_id).toBe(y);
        expect(listed).not.toContain(id);
      } else expect(listed).toContain(id);
    }
  });

  it('takes the id in any case and is no move at all to the client it already has', async () => {
    const id = (await of(a)).id;
    const before = (await moves()).length;
    expect((await start(id, { client: a.toUpperCase() })).statusCode).toBe(201);
    expect((await moves()).length).toBe(before);
    expect((await move(id, a.toUpperCase(), c.toUpperCase())).statusCode).toBe(201);
    expect((await of(c)).id).toBe(id);
    const log = await moves();
    expect(log.at(-1)).toMatchObject({ details: { from: a, to: c } });
    expect((await move(id, c, a)).statusCode).toBe(201);
  });

  it('refuses a client outside the round or one with its own conversation, and changes nothing', async () => {
    const id = (await of(a)).id;
    const before = await rows();
    const logs = (await moves()).length;
    const refused = async (client: string, code: number, text: RegExp) => {
      const r = await move(id, a, client, { held_on: '2026-12-24' });
      expect(r.statusCode, r.body).toBe(code);
      expect(json<{ message: string }>(r).message).toMatch(text);
    };
    await refused(outside, 404, /ikkje med i denne runda/);
    // In another round of the same guide is not in this one.
    const other = await t.call('POST', '/api/admin/interview-rounds', {
      name: `Flytt annan ${t.mark}`,
      template_version_id: guide,
      clients: [outside],
    });
    expect(other.statusCode, other.body).toBe(201);
    await refused(outside, 404, /ikkje med i denne runda/);
    const started = (await of(d)).id;
    expect((await start(started)).statusCode).toBe(201);
    await refused(d, 409, /har alt ein samtale/);
    expect((await start(id, { client: 'ikkje-ein-id' })).statusCode).toBe(400);

    expect((await of(a)).id).toBe(id);
    expect(new Set((await rows()).map((r) => r.id))).toEqual(new Set(before.map((r) => r.id)));
    expect((await moves()).length).toBe(logs);
    const kept = json<{ held_on: string }>(await t.call('GET', `/api/admin/interviews/${id}`));
    expect(kept.held_on.slice(0, 10)).not.toBe('2026-12-24');
  });

  it('is for a conversation going on: not one not started, and a finished one only after reopening', async () => {
    const waiting = (await of(b)).id;
    const r = await move(waiting, b, c);
    expect(r.statusCode, r.body).toBe(409);
    expect((await of(b)).status).toBe('planned');

    const id = (await of(a)).id;
    expect((await t.call('POST', `/api/admin/interviews/${id}/done`)).statusCode).toBe(201);
    expect((await move(id, a, c)).statusCode).toBe(409);
    expect((await of(a)).id).toBe(id);
    expect((await t.call('POST', `/api/admin/interviews/${id}/reopen`)).statusCode).toBe(201);
    expect((await move(id, a, c)).statusCode).toBe(201);
    expect((await of(c)).id).toBe(id);
    expect((await move(id, c, a)).statusCode).toBe(201);
  });

  it('takes the chosen actions along, but not once one has been followed up', async () => {
    const id = (await of(a)).id;
    const made = await t.call('POST', '/api/admin/actions', {
      name: `Flytt-tiltak ${t.mark}`,
      description: 'Eit tiltak.',
      seminar_topic: 'Tema',
    });
    expect(made.statusCode, made.body).toBe(201);
    const action = json<{ id: string }>(made).id;
    expect((await answer(id, 'N3', 'actions', action, '')).statusCode).toBe(200);
    expect((await move(id, a, b)).statusCode).toBe(201);
    const page = (client: string) =>
      t.call('GET', `/api/admin/clients/${client}/interview-actions`);
    expect(json<{ rows: { interview: string }[] }>(await page(b)).rows).toHaveLength(1);
    expect(json<{ rows: unknown[] }>(await page(a)).rows).toHaveLength(0);

    // Done on the client page: it belongs to that client; set open again before moving.
    const status = (value: string, seminar?: string) =>
      t.call('PUT', `/api/admin/interviews/${id}/actions/N3/${action}/status`, {
        status: value,
        ...(seminar ? { seminar } : {}),
      });
    const refused = async () => {
      const r = await move(id, b, a);
      expect(r.statusCode, r.body).toBe(409);
      expect(json<{ message: string }>(r).message).toMatch(/følgt opp/);
      expect((await of(b)).id).toBe(id);
    };
    expect((await status('closed')).statusCode).toBe(200);
    await refused();
    // Taken up at a seminar counts as much as done.
    const seminar = await createSeminar(t, { clients: [b] });
    expect((await status('in_seminar', seminar.id)).statusCode).toBe(200);
    await refused();
    expect((await status('open')).statusCode).toBe(200);
    expect((await move(id, b, a)).statusCode).toBe(201);
    expect((await of(a)).id).toBe(id);

    await answer(id, 'N3', 'actions', '', action);
    await t.prisma.action.delete({ where: { id: action } });
  });
});
