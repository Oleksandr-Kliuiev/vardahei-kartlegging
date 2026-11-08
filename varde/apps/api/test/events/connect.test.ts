// What a stream gets when it connects: the topics of current state. Not `samtalar`, which is sent only
// after a conversation is really moved: at every connect it would read every open conversation again,
// and each read of a referat is written to AuditLog.
import type { ServerResponse } from 'node:http';
import { expect, it, vi } from 'vitest';
import { EventsService } from '../../src/modules/events/events.service.js';

it('a new stream hears the topics of current state, and not samtalar', () => {
  const chunks: string[] = [];
  const write = (chunk: string) => chunks.push(chunk) > 0;
  new EventsService().subscribe({ write, end: vi.fn() } as unknown as ServerResponse);
  const topics = chunks.map((chunk) => /"topic":"(\w+)"/.exec(chunk)![1]);
  expect(topics.sort()).toEqual(['live', 'progress', 'responses', 'rounds', 'seminars']);
});
