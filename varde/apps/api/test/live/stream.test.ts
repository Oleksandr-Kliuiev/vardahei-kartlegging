// SSE of the big screen (3.5, ADR-015): a stream for one live poll, opened with its presenter key.
// The first event is the snapshot of now (also after a reconnect); every step and answer pushes a
// new one; shown results have passed privacy; no event carries an answer, a free text, a
// submission id or a code of a phone; a revoked key ends the stream.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seminarApp, type SeminarApp } from '../support/seminars.js';
import { answer, cleanupLive, livePoll, presenter, presenterKey } from '../support/live.js';

let t: SeminarApp, origin: string;
const controllers: AbortController[] = [];
beforeAll(async () => {
  t = await seminarApp();
  await t.app.listen(0, '127.0.0.1');
  origin = await t.app.getUrl();
});
afterAll(async () => {
  for (const c of controllers) c.abort();
  await cleanupLive(t);
  await t.close();
});

interface Event {
  event: string;
  data: {
    current: null | {
      id: string;
      state: string;
      answered: { class: string; suppressed: boolean; n?: number } | null;
      result: unknown;
    };
  };
}

/** Reads SSE events from a fetch stream (EventSource cannot send Authorization). */
async function open(key: string) {
  const controller = new AbortController();
  controllers.push(controller);
  const res = await fetch(`${origin}/api/presenter/stream`, {
    headers: { authorization: `Bearer ${key}` },
    signal: controller.signal,
  });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  expect(res.headers.get('cache-control')).toBe('no-store');
  const reader = res.body!.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const decoder = new TextDecoder();
  let buffer = '';
  const raw: string[] = [];
  const next = async (): Promise<Event> => {
    for (;;) {
      const cut = buffer.indexOf('\n\n');
      if (cut >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        raw.push(block);
        const event = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (event && data) return { event, data: JSON.parse(data) as Event['data'] };
        continue;
      }
      const chunk = await reader.read();
      if (chunk.done) throw new Error('stream ended');
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  };
  /** Next snapshot that matches (pushes are debounced; answers may arrive in one or more). */
  const until = async (match: (e: Event) => boolean) => {
    for (;;) {
      const e = await next();
      if (match(e)) return e;
    }
  };
  return { controller, next, until, raw, reader };
}

describe('presenter stream', () => {
  it('snapshot first, a push on every change, shown results only through privacy', async () => {
    const p = await livePoll(t);
    const key = await presenterKey(t, p.seminar);
    const s = await open(key);
    const first = await s.next();
    expect(first.event).toBe('snapshot');
    expect(first.data.current).toBeNull();
    await presenter(t, key, 'POST', '/api/presenter/questions/L2/open');
    expect((await s.until((e) => e.data.current?.state === 'open')).data.current).toMatchObject({
      id: 'L2',
      answered: { class: 'aggregate', suppressed: true },
      result: null,
    });
    for (const v of ['ja', 'nei', 'ja'])
      expect((await answer(t, p.code, 'L2', v)).statusCode).toBe(201);
    expect(
      (await s.until((e) => e.data.current?.answered?.n === 3)).data.current!.result,
    ).toBeNull();
    await presenter(t, key, 'POST', '/api/presenter/questions/L2/close');
    await s.until((e) => e.data.current?.state === 'closed');
    await presenter(t, key, 'POST', '/api/presenter/questions/L2/release');
    const shown = await s.until((e) => e.data.current?.state === 'released');
    expect(shown.data.current!.result).toMatchObject({ suppressed: false, n: 3 });
    const all = s.raw.join('\n');
    expect(all).not.toMatch(/"(?:answers|respondent_key|submission_id|free)"\s*:/);
    expect(all).not.toContain(key);
    s.controller.abort();
  });

  it('a reconnect gets the snapshot of now, including what happened while it was away', async () => {
    const p = await livePoll(t);
    const key = await presenterKey(t, p.seminar);
    const a = await open(key);
    expect((await a.next()).data.current).toBeNull();
    a.controller.abort();
    await presenter(t, key, 'POST', '/api/presenter/questions/L1/open');
    for (const v of ['kontor', 'sal', 'drift', 'kontor'])
      expect((await answer(t, p.code, 'L1', v)).statusCode).toBe(201);
    await presenter(t, key, 'POST', '/api/presenter/questions/L1/close');
    await presenter(t, key, 'POST', '/api/presenter/questions/L1/release');
    const b = await open(key);
    const first = await b.next();
    expect(first.event).toBe('snapshot');
    expect(first.data.current).toMatchObject({ id: 'L1', state: 'released', answered: null });
    expect(first.data.current!.result).toMatchObject({ suppressed: false, n: 4 });
    b.controller.abort();
  });

  it('below k the stream carries no number of the result', async () => {
    const p = await livePoll(t);
    const key = await presenterKey(t, p.seminar);
    const s = await open(key);
    await s.next();
    await presenter(t, key, 'POST', '/api/presenter/questions/L1/open');
    expect((await answer(t, p.code, 'L1', 'sal')).statusCode).toBe(201);
    await presenter(t, key, 'POST', '/api/presenter/questions/L1/close');
    await presenter(t, key, 'POST', '/api/presenter/questions/L1/release');
    const shown = await s.until((e) => e.data.current?.state === 'released');
    expect(shown.data.current!.result).toEqual({ class: 'aggregate', suppressed: true });
    s.controller.abort();
  });

  it('«N har svart» with k = 3: below three answers no number, open or closed', async () => {
    const p = await livePoll(t);
    const key = await presenterKey(t, p.seminar);
    const s = await open(key);
    await s.next();
    await presenter(t, key, 'POST', '/api/presenter/questions/L3/open');
    for (const v of [['melder'], ['spor']])
      expect((await answer(t, p.code, 'L3', v)).statusCode).toBe(201);
    await presenter(t, key, 'POST', '/api/presenter/questions/L3/close');
    await s.until((e) => e.data.current?.state === 'closed');
    for (const block of s.raw.filter(
      (b) => b.includes('"state":"open"') || b.includes('"state":"closed"'),
    )) {
      const data = JSON.parse(/^data: (.+)$/m.exec(block)![1]!) as Event['data'];
      if (data.current?.state !== 'open' && data.current?.state !== 'closed') continue;
      expect(data.current.answered).toEqual({ class: 'aggregate', suppressed: true });
    }
    // The third answer is refused (closed); reopened, it counts and the number appears.
    await presenter(t, key, 'POST', '/api/presenter/questions/L3/open');
    expect((await answer(t, p.code, 'L3', ['slettar'])).statusCode).toBe(201);
    const three = await s.until((e) => e.data.current?.answered?.suppressed === false);
    expect(three.data.current).toMatchObject({ state: 'open', answered: { n: 3 } });
    s.controller.abort();
  });

  it('a revoked key ends the stream; a new stream with it is refused', async () => {
    const p = await livePoll(t);
    const key = await presenterKey(t, p.seminar);
    const s = await open(key);
    await s.next();
    expect((await t.call('DELETE', `/api/admin/seminars/${p.seminar}/presenter`)).statusCode).toBe(
      200,
    );
    expect((await s.next()).event).toBe('ended');
    await expect(s.next()).rejects.toThrow('stream ended');
    const again = await fetch(`${origin}/api/presenter/stream`, {
      headers: { authorization: `Bearer ${key}` },
    });
    expect(again.status).toBe(403);
    await again.body?.cancel();
  });

  it('participants and admins get no presenter stream', async () => {
    const p = await livePoll(t);
    for (const headers of [{ authorization: `Bearer ${p.code}` }, {}]) {
      const res = await fetch(`${origin}/api/presenter/stream`, { headers });
      expect(res.status).toBe(401);
      await res.body?.cancel();
    }
  });
});
