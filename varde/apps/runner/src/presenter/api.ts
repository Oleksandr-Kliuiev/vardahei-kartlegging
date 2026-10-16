// The big screen's calls (3.5): the presenter key comes in the fragment of the link (`/p#t=…`),
// which no server, log or Referer ever sees. It moves at once to this tab's session storage and out
// of the address bar; requests carry it only as `Authorization: Bearer`. The SSE stream is read
// with fetch (EventSource cannot send a header); every event is a whole snapshot, and a reconnect
// starts with the snapshot of now.
export type LiveState = 'waiting' | 'open' | 'closed' | 'released';
export interface LocalText {
  nn: string;
  en?: string;
}
/** «N har svart»: the number from three answers, below three only that there are fewer. */
export type LiveCount =
  { class: 'aggregate'; suppressed: true } | { class: 'aggregate'; suppressed: false; n: number };
export type LiveResult =
  | { class: 'aggregate'; suppressed: true }
  | {
      class: 'aggregate';
      suppressed: false;
      n: number;
      options: { id: string; count: number; share: number }[];
    };
export interface LiveSnapshot {
  round: string;
  seminar: { id: string; topic: LocalText; when: string };
  languages: string[];
  link: string | null;
  qr: string | null;
  total: number;
  questions: { id: string; no: number; state: LiveState; text: LocalText }[];
  current: null | {
    id: string;
    no: number;
    state: LiveState;
    text: LocalText;
    multi: boolean;
    options: { id: string; text: LocalText }[];
    answered: LiveCount | null;
    result: LiveResult | null;
  };
  at: string;
}
export type LiveAction = 'open' | 'close' | 'release';

const KEY = /^[A-Za-z0-9_-]{43}$/;
const STORE = 'varde:storskjerm';

export class ScreenError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The key of this tab: from the fragment (then removed from the address bar), or kept from it. */
export function takeKey(
  loc: Pick<Location, 'hash' | 'pathname' | 'search'> = location,
): string | null {
  const fromHash = new URLSearchParams(loc.hash.replace(/^#/, '')).get('t');
  if (fromHash !== null && KEY.test(fromHash)) {
    try {
      sessionStorage.setItem(STORE, fromHash);
    } catch {
      /* Private mode: the key lives until the page is closed. */
    }
    history.replaceState(null, '', `${loc.pathname}${loc.search}`);
    return fromHash;
  }
  try {
    const kept = sessionStorage.getItem(STORE);
    return kept !== null && KEY.test(kept) ? kept : null;
  } catch {
    return null;
  }
}

const auth = (key: string) => ({ Authorization: `Bearer ${key}` });

async function failure(res: Response): Promise<ScreenError> {
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  return new ScreenError(res.status, typeof body?.message === 'string' ? body.message : '');
}

export async function step(
  key: string,
  question: string,
  action: LiveAction,
): Promise<LiveSnapshot> {
  const res = await fetch(`/api/presenter/questions/${encodeURIComponent(question)}/${action}`, {
    method: 'POST',
    headers: auth(key),
    cache: 'no-store',
  }).catch(() => {
    throw new ScreenError(0, '');
  });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as LiveSnapshot;
}

export type StreamStatus = 'connecting' | 'live' | 'offline';
export interface StreamHandlers {
  snapshot: (s: LiveSnapshot) => void;
  status: (s: StreamStatus) => void;
  /** The key no longer works (401, 403, 404, or `ended` from the server): no more retries. */
  stopped: (e: ScreenError) => void;
}

/** One SSE block → its event name and data line (comments, retry and pings have none). */
export function parseBlock(block: string): { event: string; data: string } | null {
  let event = 'message',
    data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7);
    else if (line.startsWith('data: ')) data += line.slice(6);
  }
  return data ? { event, data } : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The stream with reconnects (1 s, doubling to 15 s). Returns a function that stops it. */
export function connect(key: string, h: StreamHandlers): () => void {
  let stopped = false,
    controller: AbortController | null = null,
    delay = 1000;
  const stop = () => {
    stopped = true;
    controller?.abort();
  };
  const run = async () => {
    while (!stopped) {
      controller = new AbortController();
      h.status('connecting');
      try {
        const res = await fetch('/api/presenter/stream', {
          headers: auth(key),
          cache: 'no-store',
          signal: controller.signal,
        });
        if ([401, 403, 404].includes(res.status)) {
          h.stopped(await failure(res));
          return;
        }
        if (!res.ok || !res.body) throw new Error('stream');
        const reader = res.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
        const decoder = new TextDecoder();
        let buffer = '',
          ended = false;
        while (!ended) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let cut: number;
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const e = parseBlock(buffer.slice(0, cut));
            buffer = buffer.slice(cut + 2);
            if (e?.event === 'snapshot') {
              delay = 1000;
              h.status('live');
              h.snapshot(JSON.parse(e.data) as LiveSnapshot);
            } else if (e?.event === 'ended') ended = true;
          }
        }
        // The server ended the stream because the key stopped working: ask once more at once, so
        // the page shows the server's own reason (revoked, or outside the seminar days).
        if (ended) continue;
      } catch {
        if (stopped) return;
      }
      if (stopped) return;
      h.status('offline');
      await sleep(delay);
      delay = Math.min(delay * 2, 15_000);
    }
  };
  void run();
  return stop;
}
