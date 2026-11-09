// Wave C5: a campaign file goes into the draft from the workshop instead of by hand with curl —
// but only after the editor has said what it holds, what it changes and what is wrong with it.
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { InnhaldFil, fileName, readContent } from '../src/verkstad-fil.js';
import { editorFixture } from './editor-fixture.js';
import { mount } from './support.js';

let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
});

const now = () => editorFixture().content;
const settle = () => act(async () => void (await Promise.resolve()));
const button = (div: HTMLElement, text: string) =>
  [...div.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

it('names the saved file after the survey and its version', () => {
  expect(fileName(now(), 'v3')).toBe('syntetisk-v3.json');
  expect(fileName({ ...now(), key: 'IT Kartlegging' }, 'Haust 2026')).toBe(
    'it-kartlegging-haust-2026.json',
  );
});

it('says in Nynorsk why a file cannot be used, and unwraps one that came from the API', () => {
  const c = now();
  expect(() => readContent('{', c)).toThrow(/gyldig JSON/);
  expect(() => readContent('[]', c)).toThrow(/ikkje eit skjema/);
  expect(() => readContent('{"key":"syntetisk","audience":"client_survey"}', c)).toThrow(
    /questions/,
  );
  expect(() => readContent(JSON.stringify({ ...c, key: 'anna' }), c)).toThrow(/«anna»/);
  expect(() => readContent(JSON.stringify({ ...c, audience: 'seminar_live' }), c)).toThrow(
    /målgruppe/,
  );
  // A whole API answer holds the content under «content»; a saved file is the content itself.
  expect(readContent(JSON.stringify({ id: 'v', content: c }), c).key).toBe('syntetisk');
  expect(readContent(JSON.stringify(c), c).key).toBe('syntetisk');
});

function pick(div: HTMLElement, text: string) {
  const input = div.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([text], 'haust-2026.json', { type: 'application/json' });
  // jsdom's Blob has no text(); every browser Varde runs in does.
  Object.defineProperty(file, 'text', {
    value: () => Promise.resolve(text),
    configurable: true,
  });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  act(() => void input.dispatchEvent(new Event('change', { bubbles: true })));
}

it('reads a picked file, says what it changes, and only then replaces the draft', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ issues: [] }), { status: 200 }))),
  );
  const onChange = vi.fn();
  const c = now();
  const incoming: TemplateContent = {
    ...c,
    questions: [
      { ...c.questions[0]!, texts: { ...c.questions[0]!.texts } },
      { ...c.questions[1]!, id: 'NY1' },
    ],
  };
  view = mount(
    <InnhaldFil content={c} versionLabel="v1" readOnly={false} onChange={onChange} />,
    true,
  );
  pick(view.div, JSON.stringify(incoming));
  await settle();
  await settle();
  const text = view.div.textContent ?? '';
  expect(text).toContain('haust-2026.json');
  expect(text).toContain('2 spørsmål');
  // One question is new and one of the old ones is gone; nothing is applied yet.
  expect(text).toContain('1 nytt');
  expect(onChange).not.toHaveBeenCalled();
  act(() => button(view!.div, 'Bruk innhaldet frå fila')!.click());
  expect(onChange).toHaveBeenCalledWith(incoming);
});

it('refuses to use a file the validator calls broken, and names what is wrong', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            issues: [{ path: ['questions', 0, 'id'], message: 'duplicate id', blocking: true }],
          }),
          { status: 200 },
        ),
      ),
    ),
  );
  const onChange = vi.fn();
  view = mount(
    <InnhaldFil content={now()} versionLabel="v1" readOnly={false} onChange={onChange} />,
    true,
  );
  pick(view.div, JSON.stringify(now()));
  await settle();
  await settle();
  expect(view.div.textContent).toContain('må fiksast');
  expect(button(view.div, 'Bruk innhaldet frå fila')?.disabled).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
});

it('a published version can be saved to file but not written from one', () => {
  view = mount(<InnhaldFil content={now()} versionLabel="v2" readOnly onChange={vi.fn()} />, true);
  expect(button(view.div, 'Lagre innhaldet til fil')).toBeTruthy();
  expect(button(view.div, 'Hent innhald frå fil …')).toBeUndefined();
  expect(view.div.querySelector('input[type="file"]')).toBeNull();
});
