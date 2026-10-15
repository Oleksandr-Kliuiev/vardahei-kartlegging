// Task 0.14: eval inputs — five nynorsk briefs (drafts for Oleksandr to approve), the prompt
// with the PRINCIPLES §3 requirements, models.json of the simplified version and the triple hashes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findBokmal } from '@varde/schema/i18n/nn-stoplist';
import { findProducts, surveyDraftJsonSchema } from '@varde/schema/survey-draft';
import { describe, expect, it } from 'vitest';
import { EvalConfig, loadConfig } from '../src/config.js';
import { briefNames, briefsVersion, promptHash, schemaHash } from '../src/hash.js';
import { SHEET_COLUMNS } from '../src/lesepakke.js';
import { BRIEFS_DIR, EVAL_DIR, MODELS_FILE, PROMPT_FILE } from '../src/paths.js';
import { CRITICAL_CODES } from '../src/record.js';
import { THRESHOLDS } from '../src/score.js';

const names = briefNames(BRIEFS_DIR);
const read = (name: string): string => readFileSync(join(BRIEFS_DIR, `${name}.md`), 'utf8');
const prompt = readFileSync(PROMPT_FILE, 'utf8');
const config = loadConfig(MODELS_FILE);

describe('briefs/v1 (0.14)', () => {
  it('as many briefs as the threshold profile of models.json expects', () => {
    expect(names).toHaveLength(THRESHOLDS[config.thresholds].briefs);
  });

  it.each(names)('%s: title, topic, audience, goal and 2–3 constraints', (name) => {
    const text = read(name);
    expect(text).toMatch(/^# \S.+\n/);
    for (const field of ['Tema', 'Målgruppe', 'Mål med undersøkinga'])
      expect(text, field).toMatch(new RegExp(`^- \\*\\*${field}:\\*\\* \\S.+$`, 'm'));
    const constraints = text.split('- **Avgrensingar:**\n')[1]?.match(/^ {2}- \S.+$/gm) ?? [];
    expect(constraints.length).toBeGreaterThanOrEqual(2);
    expect(constraints.length).toBeLessThanOrEqual(3);
  });

  it.each(names)('%s: nynorsk without bokmål forms and without product names', (name) => {
    expect(findBokmal(read(name))).toEqual([]);
    expect(findProducts(read(name))).toEqual([]);
  });
});

describe('prompt/v1.md (0.14)', () => {
  it('carries the PRINCIPLES §3 requirements and the output fields', () => {
    for (const term of [
      'nynorsk',
      'Åtferd framfor kunnskap',
      'sjargong',
      'Høgst 25 ord',
      '«Veit ikkje»',
      'hoppast over',
      'Ingen produktnamn',
      'Ikkje dikt opp',
      'initialar',
    ])
      expect(prompt, term).toContain(term);
    const schema = surveyDraftJsonSchema() as { properties: Record<string, unknown> };
    for (const field of Object.keys(schema.properties)) expect(prompt).toContain(`\`${field}\``);
    for (const field of ['id', 'type', 'text', 'options', 'optional'])
      expect(prompt).toContain(`\`${field}\``);
  });

  it('is nynorsk without bokmål forms and names no product', () => {
    expect(findBokmal(prompt)).toEqual([]);
    expect(findProducts(prompt)).toEqual([]);
  });
});

describe('scoring-guide.md (0.14)', () => {
  const guide = readFileSync(join(EVAL_DIR, 'scoring-guide.md'), 'utf8');

  it('nynorsk without bokmål forms; explains every column and every critical code', () => {
    expect(findBokmal(guide)).toEqual([]);
    for (const column of SHEET_COLUMNS) expect(guide, column).toContain(`\`${column}\``);
    for (const code of CRITICAL_CODES) expect(guide, code).toContain(`\`${code}\``);
  });
});

describe('models.json (simplified 0.14, decision 13.10)', () => {
  it('one model claude-opus-5-5 with explicit effort, one run per brief, simplified thresholds', () => {
    expect(config.thresholds).toBe('simplified');
    expect(config.runs_per_brief).toBe(1);
    expect(config.models.map((m) => m.id)).toEqual(['claude-opus-5-5']);
    expect(config.models[0]!.effort).toBe('high');
  });

  it('rejects model ids with a date suffix and unknown effort', () => {
    const base = JSON.parse(readFileSync(MODELS_FILE, 'utf8')) as { models: object[] };
    const bad = (model: object) => ({ ...base, models: [{ ...base.models[0], ...model }] });
    expect(EvalConfig.safeParse(bad({ id: 'claude-opus-5-5-20260401' })).success).toBe(false);
    expect(EvalConfig.safeParse(bad({ effort: 'ultra' })).success).toBe(false);
  });
});

describe('triple hashes (ADR-018)', () => {
  it('are sha256 hex and stable', () => {
    for (const h of [promptHash(PROMPT_FILE), briefsVersion(BRIEFS_DIR), schemaHash()])
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(briefsVersion(BRIEFS_DIR)).toBe(briefsVersion(BRIEFS_DIR));
  });
});
