import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ServerResponse } from 'node:http';

export type Topic = 'progress' | 'responses' | 'rounds' | 'seminars' | 'live';

@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly listeners = new Set<ServerResponse>();
  private readonly pending = new Set<Topic>();
  private readonly live = new Set<(round: string) => void>();
  private shared?: EventsService;
  private timer?: ReturnType<typeof setTimeout>;

  shareWith(source: EventsService): void {
    this.shared = source;
  }

  get connections(): number {
    return this.listeners.size;
  }

  changed(topic: Topic): void {
    if (this.shared) {
      this.shared.changed(topic);
      return;
    }
    this.pending.add(topic);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      for (const topic of this.pending) {
        for (const listener of this.listeners) this.send(listener, topic);
      }
      this.pending.clear();
    }, 300);
    this.timer.unref();
  }

  /** A seminar live poll changed (3.5): admin streams refetch (topic `live`), and the presenter
   * streams of that round push a new snapshot (live-stream.service.ts). */
  liveChanged(round: string): void {
    if (this.shared) {
      this.shared.liveChanged(round);
      return;
    }
    this.changed('live');
    for (const listener of this.live) listener(round);
  }

  onLive(listener: (round: string) => void): () => void {
    if (this.shared) return this.shared.onLive(listener);
    this.live.add(listener);
    return () => {
      this.live.delete(listener);
    };
  }

  private send(response: ServerResponse, topic: Topic): void {
    if (!response.write(`event: changed\ndata: ${JSON.stringify({ topic })}\n\n`)) response.end();
  }

  subscribe(response: ServerResponse): () => void {
    this.listeners.add(response);
    if (this.shared) {
      const unsubscribe = this.shared.subscribe(response);
      return () => {
        unsubscribe();
        this.listeners.delete(response);
      };
    }
    // Reconnect refetches current state, including mutations missed while disconnected.
    for (const topic of ['rounds', 'progress', 'responses', 'seminars', 'live'] as const)
      this.send(response, topic);
    return () => {
      this.listeners.delete(response);
    };
  }

  onModuleDestroy(): void {
    clearTimeout(this.timer);
    for (const response of this.listeners) response.end();
    this.listeners.clear();
    this.live.clear();
  }
}
