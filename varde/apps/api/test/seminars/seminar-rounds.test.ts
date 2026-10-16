// 3.8 (integration): the rounds of a seminar. «Før» is an ordinary survey of its clients, «Live»
// the live poll (3.4), «Etter» a survey after the seminar (type post_seminar), started by the round
// wizard (codes per client, linked at once) or linked. Checks: a shared client, the types (API and
// database trigger), one seminar per «Etter», clear refusals without a change, AuditLog of every
// change of a link; the live round and the technical client are never offered.
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REFUSAL } from '../../src/modules/seminars/seminar-rounds.service.js';
import { cleanupLive, liveVersion } from '../support/live.js';
import { cleanupRounds, survey, surveyVersion } from '../support/seminar-rounds.js';
import { createSeminar, makeClients, seminarApp, type SeminarApp } from '../support/seminars.js';

let t: SeminarApp;
let a: { id: string; name: string },
  b: { id: string; name: string },
  c: { id: string; name: string };
let version: string;

beforeAll(async () => {
  t = await seminarApp();
  const made = await makeClients(t, ['Syntetisk A', 'Syntetisk B', 'Syntetisk C']);
  [a, b, c] = [made[0]!, made[1]!, made[2]!];
  version = await surveyVersion(t);
}, 120_000);
afterAll(async () => {
  await cleanupRounds(t);
  await cleanupLive(t);
  await t.close();
});

const audits = (seminar: string) =>
  t.prisma.auditLog.findMany({
    where: { target: `seminar:${seminar}`, what: { startsWith: 'seminars.rounds.' } },
    orderBy: { at: 'asc' },
  });
const link = (seminar: string, slot: string, round: string | null) =>
  t.call('PUT', `/api/admin/seminars/${seminar}/rounds/${slot}`, { round });
const card = async (seminar: string) => {
  const res = await t.call('GET', `/api/admin/seminars/${seminar}/rounds`);
  expect(res.statusCode).toBe(200);
  return res.json<{
    before: { id: string; round_clients: { client_id: string }[]; others: number } | null;
    live: { id: string; status: string } | null;
    after: { id: string; type: string } | null;
    choices: { before: { id: string; shared: number }[]; after: { id: string }[] };
    versions: { id: string }[];
  }>();
};

describe('the card «Rundar» (3.8)', () => {
  it('without a session the card, the links and the wizard are 401', async () => {
    const { id } = await createSeminar(t, { clients: [a.id] });
    const none = { cookie: '' };
    expect(
      (await t.call('GET', `/api/admin/seminars/${id}/rounds`, undefined, none)).statusCode,
    ).toBe(401);
    expect(
      (await t.call('PUT', `/api/admin/seminars/${id}/rounds/before`, { round: null }, none))
        .statusCode,
    ).toBe(401);
    expect(
      (await t.call('POST', '/api/admin/rounds/launch', { seminar: id }, none)).statusCode,
    ).toBe(401);
  });

  it('three steps: before and after empty, live from 3b; choices share a client, opened, not live', async () => {
    const { id } = await createSeminar(t, { clients: [a.id, b.id] });
    const shared = await survey(t, {
      type: 'regular',
      status: 'open',
      clients: [a.id, c.id],
      version,
    });
    const foreign = await survey(t, { type: 'regular', status: 'open', clients: [c.id], version });
    const draft = await survey(t, { type: 'regular', status: 'draft', clients: [a.id], version });
    const after = await survey(t, {
      type: 'post_seminar',
      status: 'open',
      clients: [b.id],
      version,
    });
    const live = await t.call('POST', `/api/admin/seminars/${id}/live`, {
      template_version_id: await liveVersion(t),
    });
    expect(live.statusCode).toBe(201);
    const v = await card(id);
    expect(v.before).toBeNull();
    expect(v.after).toBeNull();
    expect(v.live).toEqual({ id: live.json<{ round: string }>().round, status: 'open' });
    const before = v.choices.before.map((r) => r.id);
    expect(before).toContain(shared);
    expect(before).not.toContain(foreign);
    expect(before).not.toContain(draft);
    expect(before).not.toContain(v.live!.id);
    expect(v.choices.before.find((r) => r.id === shared)?.shared).toBe(1);
    expect(v.choices.after.map((r) => r.id)).toEqual([after]);
    // Versions for «Etter»: made for clients (not for live polls).
    expect(v.versions.map((x) => x.id)).toContain(version);
    // The technical client of the live poll is no client of the seminar.
    expect(JSON.stringify(v)).not.toContain('varde-seminar-live');
  });

  it('«Før»: links an ordinary survey with a shared client; AuditLog keeps the previous link', async () => {
    const { id } = await createSeminar(t, { clients: [a.id, b.id] });
    const first = await survey(t, {
      type: 'regular',
      status: 'open',
      clients: [a.id, c.id],
      version,
    });
    const second = await survey(t, { type: 'regular', status: 'closed', clients: [b.id], version });
    expect((await link(id, 'before', first)).json()).toEqual({ ok: true, changed: true });
    const v = await card(id);
    expect(v.before?.id).toBe(first);
    // Only the seminar's clients are listed; the other client of the round is counted.
    expect(v.before?.round_clients.map((rc) => rc.client_id)).toEqual([a.id]);
    expect(v.before?.others).toBe(1);
    expect((await link(id, 'before', first)).json()).toEqual({ ok: true, changed: false });
    expect((await link(id, 'before', second)).statusCode).toBe(200);
    expect((await link(id, 'before', null)).statusCode).toBe(200);
    expect((await audits(id)).map((x) => [x.what, x.details])).toEqual([
      ['seminars.rounds.before', { round: first, previous: null }],
      ['seminars.rounds.before', { round: second, previous: first }],
      ['seminars.rounds.before', { round: null, previous: second }],
    ]);
    expect((await audits(id)).every((x) => x.who === 'entra:test:seminar-admin')).toBe(true);
  });

  it('«Før» refuses a survey after a seminar, a live poll, a draft, no shared client, an unknown round', async () => {
    const { id } = await createSeminar(t, { clients: [a.id] });
    const post = await survey(t, {
      type: 'post_seminar',
      status: 'open',
      clients: [a.id],
      version,
    });
    const draft = await survey(t, { type: 'regular', status: 'draft', clients: [a.id], version });
    const foreign = await survey(t, { type: 'regular', status: 'open', clients: [c.id], version });
    const live = await t.call('POST', `/api/admin/seminars/${id}/live`, {
      template_version_id: await liveVersion(t),
    });
    const cases: [string, number, string][] = [
      [post, 400, REFUSAL.before],
      [live.json<{ round: string }>().round, 400, REFUSAL.before],
      [draft, 400, REFUSAL.draft],
      [foreign, 400, REFUSAL.noShared],
      ['00000000-0000-4000-8000-000000000000', 404, 'Runden finst ikkje.'],
    ];
    for (const [round, status, message] of cases) {
      const res = await link(id, 'before', round);
      expect(res.statusCode, round).toBe(status);
      expect(res.json<{ message: string }>().message).toBe(message);
    }
    expect((await link(id, 'middle', post)).statusCode).toBe(404);
    expect((await link(id, 'before', 'not-a-uuid')).statusCode).toBe(400);
    const empty = await createSeminar(t, { clients: [] });
    const res = await link(empty.id, 'before', foreign);
    expect(res.json<{ message: string }>().message).toBe(REFUSAL.noClients);
    expect(await audits(id)).toEqual([]);
    expect((await card(id)).before).toBeNull();
  });

  it('«Etter»: only a survey after a seminar, of one seminar (409 and the database index)', async () => {
    const one = await createSeminar(t, { clients: [a.id, b.id] });
    const two = await createSeminar(t, { clients: [b.id] });
    const regular = await survey(t, { type: 'regular', status: 'open', clients: [a.id], version });
    const post = await survey(t, {
      type: 'post_seminar',
      status: 'draft',
      clients: [b.id],
      version,
    });
    const res = await link(one.id, 'after', regular);
    expect(res.statusCode).toBe(400);
    expect(res.json<{ message: string }>().message).toBe(REFUSAL.after);
    expect((await link(one.id, 'after', post)).statusCode).toBe(200);
    expect((await card(one.id)).after).toMatchObject({ id: post, type: 'post_seminar' });
    const taken = await link(two.id, 'after', post);
    expect(taken.statusCode).toBe(409);
    expect(taken.json<{ message: string }>().message).toBe(REFUSAL.taken);
    // Not offered to the other seminar either.
    expect((await card(two.id)).choices.after.map((r) => r.id)).not.toContain(post);
    await expect(
      t.prisma.seminar.update({ where: { id: two.id }, data: { round_after_id: post } }),
    ).rejects.toThrow();
    expect((await audits(two.id)).length).toBe(0);
  });

  it('the database refuses wrong types without the API (trigger seminar_round_before_after_type)', async () => {
    const { id } = await createSeminar(t, { clients: [a.id] });
    const regular = await survey(t, { type: 'regular', status: 'open', clients: [a.id], version });
    const post = await survey(t, {
      type: 'post_seminar',
      status: 'open',
      clients: [a.id],
      version,
    });
    await expect(
      t.prisma.seminar.update({ where: { id }, data: { round_before_id: post } }),
    ).rejects.toThrow(/seminar_round_before_type/);
    await expect(
      t.prisma.seminar.update({ where: { id }, data: { round_after_id: regular } }),
    ).rejects.toThrow(/seminar_round_after_type/);
    await t.prisma.seminar.update({
      where: { id },
      data: { round_before_id: regular, round_after_id: post },
    });
  });
});

describe('«Etter» from the round wizard (3.8)', () => {
  const launch = (seminar: string | undefined, clients: string[], over: object = {}) =>
    t.call('POST', '/api/admin/rounds/launch', {
      name: `${t.mark} etter`,
      template_version_id: version,
      open: true,
      clients: clients.map((client_id) => ({ client_id, deadline: '2099-12-01' })),
      ...(seminar ? { seminar } : {}),
      ...over,
    });

  it('a post_seminar round with a code per client, linked in the same step; AuditLog', async () => {
    const { id } = await createSeminar(t, { clients: [a.id, b.id] });
    const res = await launch(id, [a.id, b.id]);
    expect(res.statusCode).toBe(201);
    const { id: round, round_client_ids } = res.json<{ id: string; round_client_ids: string[] }>();
    const r = await t.prisma.round.findUniqueOrThrow({
      where: { id: round },
      include: { round_clients: true },
    });
    expect(r).toMatchObject({ type: 'post_seminar', status: 'open', identification: 'none' });
    expect(r.round_clients.map((rc) => rc.client_id).sort()).toEqual([a.id, b.id].sort());
    expect(r.round_clients.every((rc) => rc.code_hash !== null && rc.status === 'open')).toBe(true);
    expect(round_client_ids).toHaveLength(2);
    expect((await card(id)).after?.id).toBe(round);
    expect((await audits(id)).map((x) => [x.what, x.details])).toEqual([
      ['seminars.rounds.after', { round, previous: null, launched: true }],
    ]);
    expect(
      await t.prisma.auditLog.count({ where: { what: 'rounds.launch', target: `round:${round}` } }),
    ).toBe(1);
    // A second «Etter» for the same seminar is refused; nothing is made.
    const again = await launch(id, [a.id]);
    expect(again.statusCode).toBe(409);
    expect(again.json<{ message: string }>().message).toMatch(/har alt ei undersøking etter/);
  });

  it('refuses a client outside the seminar, the technical client and a live version; nothing is made', async () => {
    const { id } = await createSeminar(t, { clients: [a.id] });
    const before = await t.prisma.round.count({ where: { name: `${t.mark} etter` } });
    const outside = await launch(id, [a.id, c.id]);
    expect(outside.statusCode).toBe(400);
    expect(outside.json<{ message: string }>().message).toBe(
      'Vel berre kundar som er med på seminaret.',
    );
    const technical = await t.prisma.client.findFirst({ where: { kind: 'seminar' } });
    if (technical) expect((await launch(id, [technical.id])).statusCode).toBe(400);
    const liveV = await liveVersion(t);
    const live = await launch(id, [a.id], { template_version_id: liveV });
    expect(live.statusCode).toBe(400);
    expect(live.json<{ message: string }>().message).toMatch(/ikkje eit for live-spørsmål/);
    expect((await launch('00000000-0000-4000-8000-000000000000', [a.id])).statusCode).toBe(404);
    expect(await t.prisma.round.count({ where: { name: `${t.mark} etter` } })).toBe(before);
    expect((await card(id)).after).toBeNull();
    expect(await audits(id)).toEqual([]);
  });

  it('without a seminar the wizard still makes an ordinary round', async () => {
    const res = await launch(undefined, [c.id], { open: false });
    expect(res.statusCode).toBe(201);
    const r = await t.prisma.round.findUniqueOrThrow({
      where: { id: res.json<{ id: string }>().id },
    });
    expect(r.type).toBe('regular');
  });
});
