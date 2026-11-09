// Wave C: a language is approved on its own texts. A missing English translation is the English
// item's business, not a hole in the survey, so the Nynorsk can be read and signed off while the
// translation is still being written. Publishing still waits for both.
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { Publiser } from '../src/verkstad-publiser.js';
import { editorFixture } from './editor-fixture.js';
import { mount } from './support.js';

let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
  view?.close();
  view = undefined;
});

const button = (div: HTMLElement, text: string) =>
  [...div.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

function panel(extra: Partial<Parameters<typeof Publiser>[0]> = {}) {
  const saved = editorFixture();
  const content = structuredClone(saved.content);
  // The English of one question is still missing; everything else is whole.
  delete (content.questions[0] as { texts: { text: { en?: string } } }).texts.text.en;
  return (
    <Publiser
      saved={saved}
      content={content}
      dirty={false}
      issues={[{ path: ['questions', 0, 'texts', 'text'], message: 'missing en', blocking: false }]}
      frozen={[]}
      marks={{}}
      empty={[]}
      diff={{ added: [], changed: [], removed: [] }}
      baseLabel="v0"
      languages={['nn', 'en']}
      busy={false}
      error=""
      onGoto={vi.fn()}
      onLang={vi.fn()}
      onTranslations={vi.fn()}
      onMark={vi.fn()}
      onAccept={vi.fn()}
      onPublish={vi.fn()}
      onlyVersion={false}
      onDiscard={vi.fn()}
      onRound={vi.fn()}
      onClose={vi.fn()}
      {...extra}
    />
  );
}

it('a missing translation is the language’s own business, and Nynorsk can still be signed off', () => {
  const onAccept = vi.fn();
  view = mount(panel({ onAccept }));
  const div = view.div;
  // The survey itself is whole: the missing English is not counted as a hole in it.
  expect(div.textContent).toContain('Skjemaet er heilt');
  expect(div.textContent).not.toContain('ting må fiksast');
  // Nynorsk can be read and approved right away.
  const korrektur = button(div, 'Eg har lese korrektur')!;
  expect(korrektur.disabled).toBe(false);
  act(() => korrektur.click());
  expect(onAccept).toHaveBeenCalledWith('nn');
  // English says what it is waiting for, and offers to go and write it.
  expect(div.textContent).toContain('tekst manglar');
  expect(button(div, 'Godkjenn English')).toBeUndefined();
  // Nothing is published while a language is unfinished.
  expect(button(div, 'Hald inne for å publisere v1')?.disabled).toBe(true);
});
