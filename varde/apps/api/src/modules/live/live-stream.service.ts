// SSE of the big screen (3.5, ADR-015): one stream per presenter screen, for its own live poll only,
// opened with the presenter key. Every event is a whole snapshot (LiveView): texts, states, «N har
// svart» and the result of a shown question that privacy let through (k = 3) — never an answer, a
// free text or a row. The first event of every connection is the snapshot of now, so a reconnect
// restores the screen as it is. A change of the poll (a step, an answer, a key revoked) pushes a
// new snapshot to the streams of that round; the key is checked again on every push and ping, and
// the stream ends when it is revoked or its window is over. Participants never get a stream.
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { EventsService } from '../events/events.service.js';
import { LiveView } from './live-view.js';
import { type PresenterAccess, PresenterTokenService } from './presenter-token.service.js';

interface Subscriber {
  response: ServerResponse;
  access: PresenterAccess;
}

const DEBOUNCE_MS = 200;
const PING_MS = 20_000;

@Injectable()
export class LiveStreamService implements OnModuleDestroy {
  private readonly rounds = new Map<string, Set<Subscriber>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly off: () => void;

  constructor(
    private readonly view: LiveView,
    private readonly keys: PresenterTokenService,
    events: EventsService,
  ) {
    this.off = events.onLive((round) => this.schedule(round));
  }

  get connections(): number {
    let n = 0;
    for (const set of this.rounds.values()) n += set.size;
    return n;
  }

  private write(s: Subscriber, event: string, data: unknown): void {
    if (!s.response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) s.response.end();
  }

  /** Opens the stream: headers, the snapshot of now, then a snapshot on every change. */
  async open(response: ServerResponse, access: PresenterAccess): Promise<void> {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write('retry: 2000\n\n');
    const s: Subscriber = { response, access };
    const set = this.rounds.get(access.round) ?? new Set<Subscriber>();
    set.add(s);
    this.rounds.set(access.round, set);
    const expiry = setTimeout(
      () => response.end(),
      Math.max(0, access.until.getTime() - Date.now()),
    );
    const ping = setInterval(() => {
      void this.keys
        .stillValid(access.token)
        .then((ok) => (ok ? response.write(': ping\n\n') : this.end(s)))
        .catch(() => response.end());
    }, PING_MS);
    expiry.unref();
    ping.unref();
    response.once('close', () => {
      clearTimeout(expiry);
      clearInterval(ping);
      set.delete(s);
      if (set.size === 0 && this.rounds.get(access.round) === set) this.rounds.delete(access.round);
    });
    try {
      this.write(s, 'snapshot', await this.view.snapshot(access.round));
    } catch {
      response.end();
    }
  }

  private end(s: Subscriber): void {
    this.write(s, 'ended', { reason: 'key' });
    s.response.end();
  }

  private schedule(round: string): void {
    if (!this.rounds.has(round)) return;
    clearTimeout(this.timers.get(round));
    const timer = setTimeout(() => {
      this.timers.delete(round);
      // One push at a time per round; a change during a push is picked up by the next one.
      const previous = this.running.get(round) ?? Promise.resolve();
      const next = previous.then(() => this.push(round)).catch(() => undefined);
      this.running.set(round, next);
      void next.finally(() => {
        if (this.running.get(round) === next) this.running.delete(round);
      });
    }, DEBOUNCE_MS);
    timer.unref();
    this.timers.set(round, timer);
  }

  private async push(round: string): Promise<void> {
    const set = this.rounds.get(round);
    if (!set?.size) return;
    let snapshot: unknown = null;
    for (const s of [...set]) {
      if (!(await this.keys.stillValid(s.access.token))) {
        this.end(s);
        continue;
      }
      snapshot ??= await this.view.snapshot(round);
      this.write(s, 'snapshot', snapshot);
    }
  }

  onModuleDestroy(): void {
    this.off();
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const set of this.rounds.values()) for (const s of set) s.response.end();
    this.rounds.clear();
  }
}
