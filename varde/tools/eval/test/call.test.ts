// Task 0.14: the request run.ts sends through the official SDK, checked offline — a fake fetch
// captures it and answers with a synthetic SSE stream. No network, no real key.
import { randomUUID } from 'node:crypto';
import { surveyDraftJsonSchema } from '@varde/schema/survey-draft';
import { describe, expect, it } from 'vitest';
import { buildRecord, serializeRecord } from '../src/record.js';
import { callModel, createClient } from '../src/run.js';
import { context, draft, OPUS } from './support.js';

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function sse(text: string, stop: Record<string, unknown>): string {
  const events: [string, unknown][] = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_synthetic',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          stop_details: null,
          usage: {
            input_tokens: 900,
            output_tokens: 1,
            inference_geo: 'global',
            service_tier: 'standard',
          },
        },
      },
    ],
    [
      'content_block_start',
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      },
    ],
    [
      'content_block_delta',
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'signature_delta', signature: 'sig-synthetic' },
      },
    ],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    [
      'content_block_start',
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'text', text: '', citations: null },
      },
    ],
    [
      'content_block_delta',
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } },
    ],
    ['content_block_stop', { type: 'content_block_stop', index: 1 }],
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_sequence: null, ...stop },
        usage: { output_tokens: 2500, output_tokens_details: { thinking_tokens: 1500 } },
      },
    ],
    ['message_stop', { type: 'message_stop' }],
  ];
  return events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
}

function fakeApi(body: string): { fetch: typeof globalThis.fetch; captured: Captured[] } {
  const captured: Captured[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    captured.push({
      url: String(input instanceof Request ? input.url : input),
      headers: new Headers(init?.headers),
      body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
        string,
        unknown
      >,
    });
    return Promise.resolve(
      new Response(body, {
        headers: { 'content-type': 'text/event-stream', 'request-id': 'req_synthetic' },
      }),
    );
  };
  return { fetch, captured };
}

describe('run.ts request (offline)', () => {
  const key = `test-${randomUUID()}`;

  it('sends structured output, adaptive thinking and explicit effort — no tool_choice, no prefill', async () => {
    const api = fakeApi(
      sse(JSON.stringify(draft()), { stop_reason: 'end_turn', stop_details: null }),
    );
    await callModel(createClient(key, api.fetch), OPUS, 'SYSTEM', 'BRIEF');
    const [req] = api.captured;
    expect(req!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req!.headers.get('x-api-key')).toBe(key);
    expect(req!.headers.get('authorization')).toBeNull();
    expect(req!.body).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 32000,
      system: 'SYSTEM',
      messages: [{ role: 'user', content: 'BRIEF' }],
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: surveyDraftJsonSchema() },
      },
      stream: true,
    });
  });

  it('the record of the streamed answer holds neither the key nor transport metadata', async () => {
    const api = fakeApi(
      sse(JSON.stringify(draft()), { stop_reason: 'end_turn', stop_details: null }),
    );
    const message = await callModel(createClient(key, api.fetch), OPUS, 'SYSTEM', 'BRIEF');
    const record = buildRecord(message, context());
    expect(record.auto_critical).toEqual([]);
    expect(record.response.usage).toMatchObject({
      input_tokens: 900,
      output_tokens: 2500,
      thinking_tokens: 1500,
    });
    const text = serializeRecord(record);
    for (const leaked of [key, 'req_synthetic', 'msg_synthetic', 'sig-synthetic'])
      expect(text).not.toContain(leaked);
  });

  it('a streamed refusal becomes the critical error refusal', async () => {
    const refusal = { type: 'refusal', category: null, explanation: null };
    const api = fakeApi(sse('', { stop_reason: 'refusal', stop_details: refusal }));
    const record = buildRecord(
      await callModel(createClient(key, api.fetch), OPUS, 'S', 'B'),
      context(),
    );
    expect(record.auto_critical).toEqual(['refusal']);
    expect(record.response.stop_details).toEqual({ category: null, explanation: null });
  });
});
