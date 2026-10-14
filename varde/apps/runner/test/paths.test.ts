import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { optionsFor, type Answers } from '@varde/rules/runner';
import type { TemplateContent } from '@varde/schema/template/template';
import { steps, submissionAnswers } from '../src/path.js';

export interface Scenario { id: string; survey: string; answers: Answers; free: Record<string, string>; path: string[] }
const workspace = resolve(import.meta.dirname, '../../..');
const scenarios = (JSON.parse(readFileSync(resolve(workspace, 'tools/parity/golden/paths.json'), 'utf8')) as { scenarios: Scenario[] }).scenarios;
function content(survey: string): TemplateContent {
  return (JSON.parse(readFileSync(resolve(workspace, `config/seed/templates/${survey}.2026-10-13.json`), 'utf8')) as { content: TemplateContent }).content;
}
describe('paths from synthetic old-runner fixtures (1.13c)', () => {
  for (const s of scenarios) it(s.id, () => {
    const path = steps(content(s.survey), s.answers).map((q) => q === 'B-intro' ? q : q.id);
    expect(path).toEqual(s.path);
  });
  it('K16 offers only options selected in K3; an earlier change prunes hidden answers/free', () => {
    const v = content('ki');
    const q = v.questions.find((q) => q.id === 'K16')!;
    const s = scenarios.find((s) => s.id === 'ki-fleire')!;
    expect(optionsFor(q, s.answers).map((o) => o.id).sort()).toEqual([...(s.answers.K3 as string[])].sort());
    const changed = { ...s.answers, K3: ['ingen'] };
    const clean = submissionAnswers(v, { ...changed, K16: ['epost'] }, { K16: 'Syntetisk tekst' });
    expect(clean.answers).not.toHaveProperty('K16');
    expect(clean.free).not.toHaveProperty('K16');
  });
  it('RUTINE option visibility changes with practical role', () => {
    const v = content('ki');
    const q = v.questions.find((q) => (q.type === 'single' || q.type === 'multi') && q.options.some((o) => o.visible_if))!;
    expect(q).toBeDefined();
    const practical = scenarios.find((s) => s.id === 'ki-praktisk')!;
    const office = scenarios.find((s) => s.id === 'ki-kontor')!;
    expect(optionsFor(q, practical.answers).map((o) => o.id)).not.toEqual(optionsFor(q, office.answers).map((o) => o.id));
  });
});
