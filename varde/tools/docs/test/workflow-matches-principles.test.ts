import { describe, expect, it } from 'vitest';
import { readDoc } from './support.js';

const START = '**Роли и усилия моделей**';

describe('docs/varde/WORKFLOW.md', () => {
  it('contains PRINCIPLES §20 verbatim, from "Роли и усилия моделей" to the end of the item', () => {
    const principles = readDoc('docs/varde/PRINCIPLES.md');
    const item = principles.split('\n').find((line) => line.startsWith(`20. ${START}`));
    expect(item, 'PRINCIPLES §20 not found').toBeDefined();
    const paragraph = (item ?? '').slice('20. '.length);
    expect(paragraph.length).toBeGreaterThan(500);
    expect(readDoc('docs/varde/WORKFLOW.md')).toContain(paragraph);
  });

  it('describes the checkpoint procedure', () => {
    const workflow = readDoc('docs/varde/WORKFLOW.md');
    for (const word of [
      'varde/<cp>',
      'один коммит',
      'docs/varde/evidence/',
      '§10',
      'Приёмка',
      'Merge',
    ]) {
      expect(workflow).toContain(word);
    }
  });
});
