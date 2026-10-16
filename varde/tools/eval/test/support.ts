// Synthetic eval fixtures: drafts, API messages and run references. No real answers, no keys.
import type Anthropic from '@anthropic-ai/sdk';
import type { SurveyDraft } from '@varde/schema/survey-draft';
import type { ModelEntry } from '../src/config.js';
import type { CriticalCode, RecordContext } from '../src/record.js';
import type { RunRef } from '../src/score.js';

export const OPUS: ModelEntry = {
  id: 'claude-opus-5-5',
  effort: 'high',
  max_tokens: 32000,
  price_usd_per_mtok: { input: 4, output: 20, cache_write_5m: 5, cache_read: 0.2 },
};

export const HASH_A = 'a'.repeat(64);
export const HASH_B = 'b'.repeat(64);

export const draft = (): SurveyDraft => ({
  title: 'Backup på hotellet',
  intro:
    'Vi vil vite korleis de tek vare på filer. Det tek fem minutt, og «Veit ikkje» er eit greitt svar.',
  questions: [
    {
      id: 'q1',
      type: 'single',
      text: 'Kvar lagrar du filer du jobbar med?',
      options: [
        { id: 'a', text: 'På PC-en' },
        { id: 'b', text: 'På ein felles stad på nettet' },
        { id: 'c', text: 'Veit ikkje' },
      ],
      optional: false,
    },
    { id: 'q2', type: 'text', text: 'Er det noko anna du vil seie?', options: [], optional: true },
  ],
});

/** A final message as the SDK returns it, with extra fields a record must not copy. */
export function message(
  text: string,
  stopReason: Anthropic.StopReason = 'end_turn',
): Anthropic.Message {
  const msg = {
    id: 'msg_synthetic',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    container: null,
    content: [
      { type: 'thinking', thinking: '', signature: 'sig-synthetic' },
      { type: 'text', text, citations: null },
    ],
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details:
      stopReason === 'refusal'
        ? { type: 'refusal', category: 'cyber', explanation: 'Synthetic refusal.' }
        : null,
    usage: {
      input_tokens: 1200,
      output_tokens: 3000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: null,
      inference_geo: 'global',
      output_tokens_details: { thinking_tokens: 1800 },
      server_tool_use: null,
      service_tier: 'standard',
    },
    _request_id: 'req_synthetic',
  };
  return msg as unknown as Anthropic.Message;
}

export const context = (brief = 'backup-hotell'): RecordContext => ({
  triple: { prompt_hash: HASH_A, model: OPUS.id, briefs_version: HASH_B },
  schemaHash: 'c'.repeat(64),
  brief,
  run: 1,
  model: OPUS,
  startedAt: new Date('2026-10-16T10:00:00Z'),
  durationMs: 41234.5,
});

export const BRIEFS5 = ['brief-a', 'brief-b', 'brief-c', 'brief-d', 'brief-e'];

/** Runs of the simplified profile: one model, one run per brief; output ids 0000000000a1… */
export function runs5(auto: Partial<Record<string, CriticalCode[]>> = {}): RunRef[] {
  return BRIEFS5.map((brief, i) => ({
    model: 'claude-opus-5-5',
    brief,
    run: 1,
    output_sha: `0000000000a${i + 1}`,
    auto_critical: auto[brief] ?? [],
    cost_usd: 0.07,
  }));
}
