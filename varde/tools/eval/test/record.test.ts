// Task 0.14: a recorded run keeps only the answer and metadata; automatic checks and critical codes.
import { describe, expect, it } from 'vitest';
import {
  buildRecord,
  costUsd,
  evaluate,
  parseVariant,
  RunRecord,
  SECRET_PATTERN,
  serializeRecord,
  variantLabel,
} from '../src/record.js';
import { context, draft, message, OPUS } from './support.js';

const json = (value: unknown): string => JSON.stringify(value);

describe('evaluate (automatic checks)', () => {
  it('a clean draft has no critical codes and no findings', () => {
    const { checks, auto_critical } = evaluate(json(draft()), 'end_turn');
    expect(auto_critical).toEqual([]);
    expect(checks).toEqual({
      schema: [],
      bokmal: [],
      products: [],
      long_questions: [],
      missing_dont_know: [],
    });
  });

  it('stop_reason refusal is the critical error refusal, whatever the text', () => {
    expect(evaluate('', 'refusal').auto_critical).toEqual(['refusal']);
    expect(evaluate(json(draft()), 'refusal').auto_critical).toEqual(['refusal']);
  });

  it('a truncated or non-JSON answer is a schema violation', () => {
    const cut = json(draft()).slice(0, 40);
    const { checks, auto_critical } = evaluate(cut, 'max_tokens');
    expect(auto_critical).toEqual(['schema_violation']);
    expect(checks.schema[0]).toMatch(/not JSON \(stop_reason max_tokens\)/);
  });

  it('a draft outside the schema or with structural issues is a schema violation', () => {
    expect(evaluate(json({ ...draft(), questions: 'none' }), 'end_turn').auto_critical).toEqual([
      'schema_violation',
    ]);
    const d = draft();
    d.questions[0]!.options = [];
    expect(evaluate(json(d), 'end_turn').checks.schema).toEqual(['q1: fewer than 2 options']);
  });

  it('bokmål forms and product names are critical; length and «veit ikkje» are warnings', () => {
    const d = draft();
    d.questions[0]!.text = 'Hvor lagrer du filer? Bruker du OneDrive? Jeg spør.';
    d.questions[0]!.options[2]!.text = 'Usikker';
    d.questions[1]!.text = Array.from({ length: 30 }, () => 'ord').join(' ');
    const { checks, auto_critical } = evaluate(json(d), 'end_turn');
    expect(auto_critical).toEqual(['mixed_nn_nb', 'product_name']);
    expect(checks.long_questions).toEqual(['q2 (30)']);
    expect(checks.missing_dont_know).toEqual(['q1']);
  });
});

describe('buildRecord', () => {
  it('keeps the answer, model, effort, stop_reason, usage, cost and time — nothing else', () => {
    const record = buildRecord(message(json(draft())), context());
    expect(RunRecord.parse(record)).toEqual(record);
    expect(record.request).toEqual({
      model: 'claude-opus-5-5',
      effort: 'high',
      max_tokens: 32000,
      thinking: 'adaptive',
    });
    expect(record.response.usage).toEqual({
      input_tokens: 1200,
      output_tokens: 3000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      thinking_tokens: 1800,
      inference_geo: 'global',
      service_tier: 'standard',
    });
    expect(record.cost_usd).toBe(0.0648);
    expect(record.duration_ms).toBe(41235);
    expect(record.output_sha).toMatch(/^[0-9a-f]{12}$/);
    const text = serializeRecord(record);
    for (const leaked of ['msg_synthetic', 'req_synthetic', 'sig-synthetic', 'signature'])
      expect(text).not.toContain(leaked);
  });

  it('records a refusal with its category as the critical error refusal', () => {
    const record = buildRecord(message('', 'refusal'), context());
    expect(record.auto_critical).toEqual(['refusal']);
    expect(record.response.stop_details).toEqual({
      category: 'cyber',
      explanation: 'Synthetic refusal.',
    });
  });

  it('the record schema rejects any extra key, e.g. request headers', () => {
    const record = buildRecord(message(json(draft())), context());
    const withHeaders = {
      ...record,
      response: { ...record.response, headers: { 'request-id': 'x' } },
    };
    expect(RunRecord.safeParse(withHeaders).success).toBe(false);
  });

  it('never serializes a key or an auth header', () => {
    const planted = ['sk', 'ant', 'api03', 'x'.repeat(24)].join('-');
    const record = buildRecord(message(json({ ...draft(), title: planted })), context());
    expect(() => serializeRecord(record)).toThrow(/key or header pattern/);
    for (const s of ['X-Api-Key: 1', 'authorization: Bearer y', planted])
      expect(s).toMatch(SECRET_PATTERN);
  });
});

describe('cost and variants', () => {
  it('cost uses the four token prices of models.json', () => {
    const usage = {
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_creation_input_tokens: 200_000,
      cache_read_input_tokens: 500_000,
      thinking_tokens: null,
      inference_geo: null,
      service_tier: null,
    };
    expect(costUsd(usage, OPUS.price_usd_per_mtok)).toBeCloseTo(7.1, 6);
  });

  it('variant labels round-trip', () => {
    expect(variantLabel('claude-opus-5-5', 2)).toBe('claude-opus-5-5#2');
    expect(parseVariant('claude-opus-5-5#2')).toEqual({ model: 'claude-opus-5-5', run: 2 });
    expect(parseVariant('A')).toBeNull();
  });
});
