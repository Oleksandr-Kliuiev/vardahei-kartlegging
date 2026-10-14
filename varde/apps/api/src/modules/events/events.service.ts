import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ServerResponse } from 'node:http';

export type Topic = 'progress' | 'responses' | 'rounds';

@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly listeners = new Set<ServerResponse>();
  private readonly pending = new Set<Topic>();
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
    for (const topic of ['rounds', 'progress', 'responses'] as const) this.send(response, topic);
    return () => {
      this.listeners.delete(response);
    };
  }

  onModuleDestroy(): void {
    clearTimeout(this.timer);
    for (const response of this.listeners) response.end();
    this.listeners.clear();
  }
}
