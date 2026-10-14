import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import type { Answers } from '@varde/rules/runner';
import { Intro, selectedTips } from '../src/intro-finish.js';
import { contentFor } from '../e2e/submission-support.js';
import notice from '../src/i18n/notice-v2.nn.json';

describe('mode notices and old advice parity (1.13d)', () => {
  it('shows approved notices by identification and omits obsolete facts2 promise', () => {
    const root = document.createElement('div');
    for (const mode of ['nn', 'anonymous'] as const) {
      render(
        <Intro version={contentFor(mode)} client="Syntetisk kunde" lang="nn" start={() => {}} />,
        root,
      );
      const key = mode === 'nn' ? 'notice.identified.who_sees' : 'notice.anonymous.intro';
      expect(root.textContent).toContain(notice[key]);
      const other = mode === 'nn' ? 'notice.anonymous.intro' : 'notice.identified.who_sees';
      expect(root.textContent).not.toContain(notice[other]);
    }
    render(null, root);
  });
  const golden = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../tools/parity/golden/paths.json'), 'utf8'),
  ) as { scenarios: { id: string; survey: string; answers: Answers; tips: string[] }[] };
  for (const s of golden.scenarios)
    it(`advice IDs match old source functions for ${s.id}`, () => {
      const v = contentFor(s.survey === 'ki' ? 'nn' : 'security'),
        answers = { ...s.answers };
      for (const q of v.questions)
        if (q.type === 'scale') {
          const a = answers[q.id];
          if (
            !a ||
            typeof a !== 'object' ||
            Array.isArray(a) ||
            q.rows.some((r) => a[r.id] === undefined)
          )
            delete answers[q.id];
        }
      expect(selectedTips(v, answers).map((t) => t.id)).toEqual(s.tips);
    });
  it('closing advice follows its own condition, reserve is the single fallback, max applies to regular tips', () => {
    const v = contentFor('nn');
    // No answers: no regular advice matches, so exactly one reserve tip stands in; a closing tip
    // is shown only when its own condition holds (old UI: kartlegging/public/index.html ~889).
    const none = selectedTips(v, {});
    expect(none.filter((t) => t.reserve)).toHaveLength(1);
    expect(none.filter((t) => t.closing)).toHaveLength(0);
    const withTasks = selectedTips(v, { K3: ['kopiere'] });
    expect(withTasks.filter((t) => t.closing).map((t) => t.id)).toEqual(['oppgave']);
    expect(withTasks.filter((t) => !t.closing).length).toBeLessThanOrEqual(v.max_tips);
  });
});
