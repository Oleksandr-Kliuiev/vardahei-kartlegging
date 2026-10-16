// Presenter key and the seminar scenario without Entra (3.4, ADR-008): the app runs with no Entra
// settings at all (login answers 503), and the big screen still opens a question, collects answers
// from phones, closes it and shows the result. Results leave only through privacy with k = 3; the
// key is a bearer with its own window and is revoked from the admin (403); AuditLog has issue,
// revoke and every step, never the key.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureOutput, type Captured } from '../support/capture-output.js';
import { seminarApp, createSeminar, type SeminarApp } from '../support/seminars.js';
import {
  answer,
  cleanupLive,
  issuedKeys,
  keysIn,
  livePoll,
  presenter,
  presenterKey,
  todayOslo,
} from '../support/live.js';

const NO_ENTRA = {
  ENTRA_TENANT_ID: undefined,
  ENTRA_CLIENT_ID: undefined,
  ENTRA_CLIENT_KEY_FILE: undefined,
  ENTRA_CLIENT_CERT_FILE: undefined,
  VARDE_ADMIN_GROUP_ID: undefined,
  VARDE_OIDC_ISSUER: undefined,
};

let t: SeminarApp;
// Everything the app writes goes here: no presenter key may ever be in it (logs, errors).
let out: Captured;
beforeAll(async () => {
  out = captureOutput({ console: true });
  t = await seminarApp(NO_ENTRA);
});
afterAll(async () => {
  out.restore();
  await cleanupLive(t);
  await t.close();
});

interface Snapshot {
  total: number;
  link: string | null;
  qr: string | null;
  questions: { id: string; state: string }[];
  current: null | {
    id: string;
    state: string;
    answered: { class: string; suppressed: boolean; n?: number } | null;
    result:
      | null
      | { suppressed: true }
      | { suppressed: false; n: number; options: { id: string; count: number; share: number }[] };
  };
}
const RAW = /"(?:answers|respondent_key|submission_id|free)"\s*:/;

describe('seminar day without Entra', () => {
  it('Entra is off: login answers 503', async () => {
    expect((await t.call('GET', '/auth/login', undefined, { cookie: '' })).statusCode).toBe(503);
  });

  it('open → three phones answer → close → show: bars from privacy, the steps in AuditLog', async () => {
    const p = await livePoll(t);
    const key = await presenterKey(t, p.seminar);
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const first = await presenter(t, key, 'GET', '/api/presenter/poll');
    expect(first.statusCode).toBe(200);
    const s0 = first.json<Snapshot>();
    expect(s0.total).toBe(3);
    expect(s0.current).toBeNull();
    expect(s0.link).toBe(`https://varde.test/r?c=${p.code}`);
    expect(s0.qr).toMatch(/^<svg /);

    const opened = await presenter(t, key, 'POST', '/api/presenter/questions/L2/open');
    expect(opened.statusCode).toBe(200);
    expect(opened.json<Snapshot>().current).toMatchObject({
      id: 'L2',
      state: 'open',
      answered: { class: 'aggregate', suppressed: true },
      result: null,
    });
    for (const [i, value] of ['ja', 'ja', 'nei'].entries()) {
      expect((await answer(t, p.code, 'L2', value, {}, `192.0.2.${i + 20}`)).statusCode).toBe(201);
      const now = (await presenter(t, key, 'GET', '/api/presenter/poll')).json<Snapshot>();
      // «N har svart» with k = 3: below three only that there are fewer, never the number.
      if (i < 2) {
        expect(now.current!.answered).toEqual({ class: 'aggregate', suppressed: true });
        expect(JSON.stringify(now.current!.answered)).not.toMatch(/\d/);
      } else expect(now.current!.answered).toEqual({ class: 'aggregate', suppressed: false, n: 3 });
    }

    expect((await presenter(t, key, 'POST', '/api/presenter/questions/L2/close')).statusCode).toBe(
      200,
    );
    const late = await answer(t, p.code, 'L2', 'ja');
    expect(late.statusCode).toBe(409);
    expect(late.json<{ message: string }>().message).toBe('Spørsmålet er stengt.');
    const closed = (await presenter(t, key, 'GET', '/api/presenter/poll')).json<Snapshot>();
    expect(closed.current).toMatchObject({
      state: 'closed',
      answered: { suppressed: false, n: 3 },
      result: null,
    });

    const shown = await presenter(t, key, 'POST', '/api/presenter/questions/L2/release');
    expect(shown.statusCode).toBe(200);
    expect(shown.body).not.toMatch(RAW);
    const result = shown.json<Snapshot>().current!.result;
    expect(result).toEqual({
      class: 'aggregate',
      suppressed: false,
      n: 3,
      options: [
        { id: 'ja', count: 2, share: 2 / 3 },
        { id: 'nei', count: 1, share: 1 / 3 },
        { id: 'veit_ikkje', count: 0, share: 0 },
      ],
    });
    const keyRow = await t.prisma.presenterToken.findFirstOrThrow({
      where: { seminar_id: p.seminar, revoked_at: null },
    });
    const steps = await t.prisma.auditLog.findMany({
      where: { target: `round:${p.round}`, what: { startsWith: 'seminars.live.' } },
      orderBy: { at: 'asc' },
    });
    expect(steps.map((s) => [s.what, s.who])).toEqual([
      ['seminars.live.open', `presenter:${keyRow.id}`],
      ['seminars.live.close', `presenter:${keyRow.id}`],
      ['seminars.live.release', `presenter:${keyRow.id}`],
    ]);
  });

  it('k = 3: with two answers no number leaves, open, closed or shown', async () => {
    const p = await livePoll(t);
    const key = await presenterKey(t, p.seminar);
    await presenter(t, key, 'POST', '/api/presenter/questions/L1/open');
    for (const value of ['kontor', 'sal'])
      expect((await answer(t, p.code, 'L1', value)).statusCode).toBe(201);
    const open = (await presenter(t, key, 'GET', '/api/presenter/poll')).json<Snapshot>();
    expect(open.current).toMatchObject({
      state: 'open',
      answered: { class: 'aggregate', suppressed: true },
    });
    const closed = (
      await presenter(t, key, 'POST', '/api/presenter/questions/L1/close')
    ).json<Snapshot>();
    expect(closed.current).toMatchObject({
      state: 'closed',
      answered: { class: 'aggregate', suppressed: true },
    });
    for (const s of [open, closed]) expect(JSON.stringify(s.current!.answered)).not.toMatch(/\d/);
    const shown = (
      await presenter(t, key, 'POST', '/api/presenter/questions/L1/release')
    ).json<Snapshot>();
    expect(shown.current!.result).toEqual({ class: 'aggregate', suppressed: true });
    expect(JSON.stringify(shown.current!.result)).not.toMatch(/\d/);
    // The count is gone once the question is shown: nothing with a number about its answers.
    expect(shown.current!.answered).toBeNull();
  });

  it('a multi question counts each chosen option once per answer', async () => {
    const p = await livePoll(t);
    const key = await presenterKey(t, p.seminar);
    await presenter(t, key, 'POST', '/api/presenter/questions/L3/open');
    for (const value of [['melder', 'slettar'], ['melder'], ['ingenting', 'melder']])
      expect((await answer(t, p.code, 'L3', value)).statusCode).toBe(201);
    await presenter(t, key, 'POST', '/api/presenter/questions/L3/close');
    const result = (
      await presenter(t, key, 'POST', '/api/presenter/questions/L3/release')
    ).json<Snapshot>().current!.result as { n: number; options: { id: string; count: number }[] };
    expect(result.n).toBe(3);
    // «Ingenting» is exclusive: the server keeps only it in the third answer.
    expect(Object.fromEntries(result.options.map((o) => [o.id, o.count]))).toEqual({
      slettar: 1,
      melder: 2,
      spor: 0,
      ingenting: 1,
    });
  });
});

describe('the key', () => {
  it('shown once as a link (fragment), stored as sha256 only, issue and revoke in AuditLog', async () => {
    const p = await livePoll(t);
    const res = await t.call('POST', `/api/admin/seminars/${p.seminar}/presenter`);
    expect(res.statusCode).toBe(201);
    const body = res.json<{ link: string; valid_text: string }>();
    expect(body.link).toMatch(/^https:\/\/varde\.test\/p#t=[A-Za-z0-9_-]{43}$/);
    expect(body.valid_text).toMatch(/^frå \S+ \d+\. \S+ \d{4} til og med \S+ \d+\. \S+ \d{4}$/);
    const key = new URL(body.link).hash.slice(3);
    const rows = await t.prisma.presenterToken.findMany({ where: { seminar_id: p.seminar } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(key);
    const panel = await t.call('GET', `/api/admin/seminars/${p.seminar}/live`);
    expect(panel.body).not.toContain(key);
    expect(
      panel.json<{ presenter: { active: object | null; valid_now: boolean } }>().presenter,
    ).toMatchObject({
      valid_now: true,
      active: { issued_by: 'entra:test:seminar-admin' },
    });
    // A new key replaces the old one at once.
    const second = await presenterKey(t, p.seminar);
    expect((await presenter(t, key, 'GET', '/api/presenter/poll')).statusCode).toBe(403);
    expect((await presenter(t, second, 'GET', '/api/presenter/poll')).statusCode).toBe(200);
    // «Trekk tilbake»: 403 with its own text.
    expect((await t.call('DELETE', `/api/admin/seminars/${p.seminar}/presenter`)).statusCode).toBe(
      200,
    );
    const revoked = await presenter(t, second, 'GET', '/api/presenter/poll');
    expect(revoked.statusCode).toBe(403);
    expect(revoked.json<{ message: string }>().message).toContain('trekt tilbake');
    expect(
      (await presenter(t, second, 'POST', '/api/presenter/questions/L1/open')).statusCode,
    ).toBe(403);
    expect((await t.call('DELETE', `/api/admin/seminars/${p.seminar}/presenter`)).statusCode).toBe(
      404,
    );
    const log = await t.prisma.auditLog.findMany({
      where: { target: `seminar:${p.seminar}`, what: { startsWith: 'seminars.presenter.' } },
      orderBy: { at: 'asc' },
    });
    expect(log.map((l) => l.what)).toEqual([
      'seminars.presenter.issue',
      'seminars.presenter.revoke',
      'seminars.presenter.issue',
      'seminars.presenter.revoke',
    ]);
    const all = await t.prisma.auditLog.findMany({
      where: { target: { in: [`seminar:${p.seminar}`, `round:${p.round}`] } },
    });
    for (const key2 of [key, second]) expect(JSON.stringify(all)).not.toContain(key2);
  });

  it('works only from the day before to the day after the seminar (Oslo)', async () => {
    const coming = await createSeminar(t, { date: '2099-11-05' });
    const version = await (await import('../support/live.js')).liveVersion(t);
    await t.call('POST', `/api/admin/seminars/${coming.id}/live`, { template_version_id: version });
    const key = await presenterKey(t, coming.id);
    const early = await presenter(t, key, 'GET', '/api/presenter/poll');
    expect(early.statusCode).toBe(403);
    expect(early.json<{ message: string }>().message).toContain('dagen før');
    // Yesterday's seminar still works today; one held two days ago does not.
    const p = await livePoll(t, todayOslo(-1));
    const yesterday = await presenterKey(t, p.seminar);
    expect((await presenter(t, yesterday, 'GET', '/api/presenter/poll')).statusCode).toBe(200);
    const day = todayOslo(-2);
    await t.prisma.seminar.update({
      where: { id: p.seminar },
      data: { starts_at: new Date(`${day}T08:00:00Z`), ends_at: new Date(`${day}T10:00:00Z`) },
    });
    expect((await presenter(t, yesterday, 'GET', '/api/presenter/poll')).statusCode).toBe(403);
    expect((await t.call('POST', `/api/admin/seminars/${p.seminar}/presenter`)).statusCode).toBe(
      400,
    );
  });

  it('no key, a wrong key, a participant code or an admin cookie alone → 401', async () => {
    const p = await livePoll(t);
    const inject = (headers: Record<string, string>) =>
      t.app
        .getHttpAdapter()
        .getInstance()
        .inject({ method: 'GET', url: '/api/presenter/poll', headers });
    expect((await inject({})).statusCode).toBe(401);
    expect((await inject({ authorization: `Bearer ${'A'.repeat(43)}` })).statusCode).toBe(401);
    expect((await inject({ authorization: `Bearer ${p.code}` })).statusCode).toBe(401);
    expect((await t.call('GET', '/api/presenter/poll')).statusCode).toBe(401);
  });
});

describe('the output', () => {
  it('carries no presenter key: not in the request log, errors or anything else', async () => {
    expect(issuedKeys.length).toBeGreaterThan(3);
    const text = out.text();
    expect(text).toContain('/api/presenter/');
    expect(await keysIn(t, text)).toEqual([]);
  });
});
