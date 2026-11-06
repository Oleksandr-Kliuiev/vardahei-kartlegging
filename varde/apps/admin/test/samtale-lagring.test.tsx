// 2.20 the autosave of a conversation (samtale-lagring.ts) against a fake server with compare-and-set:
// nothing typed is lost (in flight, offline, signed out, two tabs, a reload) and nothing is saved over
// another screen's change unless the person chose it. Started from the acceptance review's probe.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clean, Lagring } from '../src/samtale-lagring.js';
import { SaveLine } from '../src/samtale-felt.js';
import { mount } from './support.js';

type V = string | null;
const ID = 'samtale-1';
const BK = `varde:samtale:${ID}`;

class FakeServer {
  values = new Map<string, V>();
  mode: 'ok' | 'offline' | 'auth' | 'done' | 'drop' = 'ok';
  fail500 = new Set<string>();
  hold = false;
  pending: (() => void)[] = [];
  release() {
    const p = this.pending;
    this.pending = [];
    p.forEach((r) => r());
  }
  fetch = async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { field: string; value: V; expect: V };
    const m = /interviews\/[^/]+\/(?:answers\/([^/]+)|fields)/.exec(url)!;
    const key = m[1] ? `${decodeURIComponent(m[1])}:${body.field}` : `:${body.field}`;
    if (this.hold) await new Promise<void>((r) => this.pending.push(r));
    const res = (status: number, b: unknown) => ({
      ok: status < 300,
      status,
      json: () => Promise.resolve(b),
    });
    if (this.mode === 'offline') throw new TypeError('Failed to fetch');
    if (this.mode === 'auth') return res(401, { statusCode: 401 });
    if (this.mode === 'done')
      return res(409, { statusCode: 409, message: 'Samtalen er fullført.' });
    if (this.fail500.has(key))
      return res(500, { statusCode: 500, message: 'Internal server error' });
    const cur = this.values.get(key) ?? (key.endsWith(':rating') ? null : '');
    if (cur !== body.expect)
      return res(409, { statusCode: 409, message: 'endra', current: cur, updated_by: 'Anna' });
    this.values.set(key, body.value);
    if (this.mode === 'drop') throw new TypeError('Failed to fetch'); // saved, the answer is lost
    return res(200, { value: body.value });
  };
}

const base = (): Record<string, V> => {
  const o: Record<string, V> = { ':summary': '', ':agreed': '', ':note': '' };
  for (const q of ['N2', 'N3', 'N4']) {
    o[`${q}:answer`] = '';
    o[`${q}:rating`] = null;
    o[`${q}:action`] = '';
    o[`${q}:note`] = '';
  }
  return o;
};
const snap = (s: FakeServer) => {
  const b = base();
  for (const [k, v] of s.values) b[k] = v;
  return b;
};
const settle = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 30; i++) await vi.advanceTimersByTimeAsync(0);
};
const backup = () =>
  (JSON.parse(localStorage.getItem(BK) ?? '{"kept":{}}') as { kept: Record<string, { value: V }> })
    .kept;
const open = (s: FakeServer) => {
  const store = new Lagring(ID);
  store.load(snap(s), false);
  return store;
};

let s: FakeServer;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  s = new FakeServer();
  vi.stubGlobal('fetch', s.fetch);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the autosave of a conversation', () => {
  it('typing while a save is on its way: the newer text follows, the copy is cleared', async () => {
    const a = open(s);
    s.hold = true;
    a.set('N2:answer', 'Hei');
    await settle(700);
    a.set('N2:answer', 'Hei der');
    await settle(700);
    s.hold = false;
    s.release();
    await settle();
    expect(s.values.get('N2:answer')).toBe('Hei der');
    expect(localStorage.getItem(BK)).toBeNull();
  });

  it('offline: the change is kept in the browser and sent by the retry when the network is back', async () => {
    const a = open(s);
    s.mode = 'offline';
    a.set('N2:answer', 'Utan nett');
    await settle(700);
    expect(a.state.kind).toBe('offline');
    expect(backup()['N2:answer']?.value).toBe('Utan nett');
    s.mode = 'ok';
    await settle(4000);
    expect(s.values.get('N2:answer')).toBe('Utan nett');
  });

  it('signed out (401): the text waits; after signing in, the next visit sends it', async () => {
    const a = open(s);
    s.mode = 'auth';
    a.set('N2:answer', 'Før utlogging');
    await settle(700);
    expect(a.state.kind).toBe('auth');
    s.mode = 'ok';
    open(s);
    await settle();
    expect(s.values.get('N2:answer')).toBe('Før utlogging');
  });

  it('four fields of one question in quick succession all arrive', async () => {
    const a = open(s);
    a.set('N2:answer', 'A');
    a.set('N2:rating', 'manglar');
    a.set('N2:action', 'C');
    a.set('N2:note', 'D');
    await settle(700);
    expect(['answer', 'rating', 'action', 'note'].map((f) => s.values.get(`N2:${f}`))).toEqual([
      'A',
      'manglar',
      'C',
      'D',
    ]);
  });

  it('a conflict, typing goes on, «Behald mitt»: what was typed after the conflict is kept and sent', async () => {
    const a = open(s);
    s.values.set('N2:answer', 'Deira');
    a.set('N2:answer', 'Mitt');
    await settle(700);
    expect(a.conflicts.get('N2:answer')).toMatchObject({ theirs: 'Deira', by: 'Anna' });
    a.set('N2:answer', 'Mitt og meir');
    await settle(700);
    expect(s.values.get('N2:answer')).toBe('Deira');
    const kept = backup()['N2:answer']?.value;
    a.resolve('N2:answer', 'mine');
    await settle();
    expect({ kept, server: s.values.get('N2:answer'), screen: a.text('N2:answer') }).toEqual({
      kept: 'Mitt og meir',
      server: 'Mitt og meir',
      screen: 'Mitt og meir',
    });
  });

  it('«Bruk deira» takes their text and sends nothing', async () => {
    const a = open(s);
    s.values.set('N3:action', 'Deira tiltak');
    a.set('N3:action', 'Mitt tiltak');
    await settle(700);
    a.resolve('N3:action', 'theirs');
    await settle();
    expect({ screen: a.text('N3:action'), server: s.values.get('N3:action') }).toEqual({
      screen: 'Deira tiltak',
      server: 'Deira tiltak',
    });
    expect(await a.flush()).toBe(true);
  });

  it('a save whose answer was lost: the retry finds its own text and is no conflict', async () => {
    const a = open(s);
    s.mode = 'drop';
    a.set(':summary', 'Godt inntrykk');
    await settle(700);
    s.mode = 'ok';
    await settle(4000);
    expect({ conflicts: a.conflicts.size, finished: await a.flush() }).toEqual({
      conflicts: 0,
      finished: true,
    });
  });

  it('a lost answer, then more typing: the newer text goes on top of its own, no conflict', async () => {
    const a = open(s);
    s.mode = 'drop';
    a.set('N2:answer', 'Første');
    await settle(700);
    s.mode = 'ok';
    a.set('N2:answer', 'Første og andre');
    await settle(4000);
    expect({ conflicts: a.conflicts.size, server: s.values.get('N2:answer') }).toEqual({
      conflicts: 0,
      server: 'Første og andre',
    });
  });

  it('a lost answer, then typed back to what it was: the server gets that back too', async () => {
    const a = open(s);
    s.mode = 'drop';
    a.set('N2:answer', 'Skrive ved ein feil');
    await settle(700);
    s.mode = 'ok';
    a.set('N2:answer', '');
    await settle(4000);
    expect({ server: s.values.get('N2:answer'), finished: await a.flush() }).toEqual({
      server: '',
      finished: true,
    });
  });

  it('a reload with a copy written on an older value: mine on screen, a conflict, never «Lagra»', async () => {
    localStorage.setItem(
      BK,
      JSON.stringify({ kept: { ':summary': { value: 'Mitt inntrykk', expect: '' } } }),
    );
    s.values.set(':summary', 'Anna sitt');
    const b = open(s);
    await settle();
    expect(b.text(':summary')).toBe('Mitt inntrykk');
    expect(b.conflicts.get(':summary')).toMatchObject({ theirs: 'Anna sitt' });
    const ui = mount(<SaveLine store={b} />);
    const line = ui.div.textContent;
    ui.close();
    expect(line).not.toMatch(/Alt er lagra|Lagra \d/);
    expect(line).toContain('Eitt felt er endra på ein annan skjerm');
    expect(await b.flush()).toBe(false);
    expect(s.values.get(':summary')).toBe('Anna sitt');
  });

  it('two tabs of one browser: one tab never drops the other tab’s kept change', async () => {
    const a = open(s);
    const b = open(s);
    s.mode = 'offline';
    a.set('N2:answer', 'Fane A, utan nett');
    await settle(700);
    b.set(':summary', 'Fane B');
    await settle(700);
    s.mode = 'ok';
    const c = open(s); // tab A was closed while offline, and opened again later
    await settle();
    expect(c.text('N2:answer')).toBe('Fane A, utan nett');
    expect(s.values.get('N2:answer')).toBe('Fane A, utan nett');
  });

  it('a field the server keeps failing on (500) does not stop the others', async () => {
    const a = open(s);
    s.fail500.add('N2:answer');
    a.set('N2:answer', 'Feil');
    a.set('N3:answer', 'Skal lagrast');
    await settle(12_700);
    expect(s.values.get('N3:answer')).toBe('Skal lagrast');
    expect(a.state).toMatchObject({ kind: 'error' });
    s.fail500.clear();
    await settle(4000);
    expect(s.values.get('N2:answer')).toBe('Feil');
  });

  it('«Fullfør» while a save is on its way waits for it instead of saying it is not saved', async () => {
    const a = open(s);
    s.hold = true;
    a.set('N2:answer', 'x');
    await settle(700);
    const finished = a.flush();
    s.hold = false;
    s.release();
    await settle();
    expect(await finished).toBe(true);
  });

  it('finished on another screen, then «Opne for endring»: the waiting change goes', async () => {
    const a = open(s);
    s.mode = 'done';
    a.set('N2:answer', 'Etter fullført');
    await settle(700);
    expect(a.locked).toBe(true);
    s.mode = 'ok';
    a.setLocked(false);
    await settle();
    expect({ server: s.values.get('N2:answer'), state: a.state.kind }).toEqual({
      server: 'Etter fullført',
      state: 'saved',
    });
  });

  it('a rating conflict where the other screen cleared it survives a reload unchosen', async () => {
    s.values.set('N2:rating', 'manglar');
    const a = open(s);
    s.values.set('N2:rating', null);
    a.set('N2:rating', 'ivaretatt');
    await settle();
    const b = open(s);
    await settle();
    expect({ conflict: b.conflicts.has('N2:rating'), server: s.values.get('N2:rating') }).toEqual({
      conflict: true,
      server: null,
    });
  });

  it('a reload while a save was on its way and typing went on: no conflict with itself', async () => {
    const a = open(s);
    s.hold = true;
    a.set('N2:answer', 'Del ein');
    await settle(700);
    a.set('N2:answer', 'Del ein og to');
    s.hold = false;
    s.values.set('N2:answer', 'Del ein'); // the server saved it; the tab reloads before the answer
    const b = open(s);
    await settle();
    expect({ conflict: b.conflicts.has('N2:answer'), server: s.values.get('N2:answer') }).toEqual({
      conflict: false,
      server: 'Del ein og to',
    });
  });

  it('pasted characters that cannot be stored are cleaned as they are typed', () => {
    expect(clean('Linje\r\nto\vtre\ffire\u0007\u0000 \ud83d slutt\t😀')).toBe(
      'Linje\nto\ntre\nfire � slutt\t😀',
    );
    expect(clean(null)).toBeNull();
  });
});
