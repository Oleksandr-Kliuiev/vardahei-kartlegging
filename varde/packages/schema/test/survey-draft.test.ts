// Task 0.14: survey draft schema, its JSON Schema for structured output and the draft checks.
import { describe, expect, it } from 'vitest';
import {
  type SurveyDraft as Draft,
  checkDraft,
  countWords,
  findProducts,
  surveyDraftJsonSchema,
  SurveyDraft,
} from '../src/survey-draft.js';

const draft = (): Draft => ({
  title: 'Backup på hotellet',
  intro: 'Vi vil vite korleis de tek vare på filer. «Veit ikkje» er eit heilt greitt svar.',
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

/** Every keyword used anywhere in a JSON Schema. */
function keywords(node: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => keywords(n, out));
  else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      out.add(key);
      if (key === 'properties') Object.values(value as object).forEach((v) => keywords(v, out));
      else if (key !== 'enum' && key !== 'required') keywords(value, out);
    }
  }
  return out;
}

/** Every object schema closes with additionalProperties: false (structured outputs). */
function objectsClosed(node: unknown): boolean {
  if (Array.isArray(node)) return node.every(objectsClosed);
  if (node === null || typeof node !== 'object') return true;
  const record = node as Record<string, unknown>;
  if (record.type === 'object' && record.additionalProperties !== false) return false;
  return Object.values(record).every(objectsClosed);
}

describe('SurveyDraft (0.14)', () => {
  it('accepts a minimal draft and rejects unknown fields', () => {
    expect(SurveyDraft.safeParse(draft()).success).toBe(true);
    expect(SurveyDraft.safeParse({ ...draft(), extra: 1 }).success).toBe(false);
  });

  it('JSON Schema stays inside the structured-output subset', () => {
    const schema = surveyDraftJsonSchema();
    expect(schema.$schema).toBeUndefined();
    expect(objectsClosed(schema)).toBe(true);
    const allowed = [
      'type',
      'properties',
      'required',
      'additionalProperties',
      'items',
      'enum',
      'description',
    ];
    expect([...keywords(schema)].filter((k) => !allowed.includes(k))).toEqual([]);
    expect(schema.required).toEqual(['title', 'intro', 'questions']);
  });

  it('a clean nynorsk draft has no findings', () => {
    expect(checkDraft(draft())).toEqual({
      issues: [],
      bokmal: [],
      products: [],
      long_questions: [],
      missing_dont_know: [],
    });
  });

  it('finds bokmål forms and product names with their location', () => {
    const d = draft();
    d.questions[0]!.text = 'Hvor lagrer du filer i OneDrive eller Google Drive?';
    d.questions[0]!.options[0]!.text = 'Jeg vet ikke';
    const check = checkDraft(d);
    expect(check.bokmal).toEqual([
      { where: 'q1', found: ['hvor'] },
      { where: 'q1.a', found: ['jeg', 'vet', 'ikke'] },
    ]);
    expect(check.products).toEqual([
      { where: 'q1', found: ['OneDrive', 'Google', 'Google Drive'] },
    ]);
  });

  it('flags questions over 25 words and questions without «veit ikkje» or skip', () => {
    const d = draft();
    d.questions[1]!.text = Array.from({ length: 26 }, (_, i) => `ord${i}`).join(' ');
    d.questions[1]!.optional = false;
    d.questions[0]!.options[2]!.text = 'Usikker';
    const check = checkDraft(d);
    expect(check.long_questions).toEqual(['q2 (26)']);
    expect(check.missing_dont_know).toEqual(['q1', 'q2']);
  });

  it('reports structural issues the JSON Schema cannot express', () => {
    const d = draft();
    d.questions[1]!.id = 'q1';
    d.questions[1]!.options = [{ id: 'a', text: 'Ja' }];
    d.questions[0]!.options = [{ id: 'a', text: 'Veit ikkje' }];
    expect(checkDraft(d).issues).toEqual([
      'q1: fewer than 2 options',
      'duplicate question id q1',
      'q1: text question has options',
    ]);
  });

  it('matches product names as whole words only, case-insensitively', () => {
    expect(findProducts('Bruker du teams eller WORD?')).toEqual(['Teams', 'Word']);
    expect(findProducts('Eit team skriv ord og macro-ar i ein mac-lab')).toEqual(['Mac']);
    expect(findProducts('Ingen produkt her, berre teamarbeid og ordbruk.')).toEqual([]);
  });

  it('counts words, not punctuation', () => {
    expect(countWords('Kva gjer du – når e-posten ser rar ut ?')).toBe(8);
  });
});
