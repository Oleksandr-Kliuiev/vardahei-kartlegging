// Shared pieces of the workshop tests: a small survey API, the versions it starts from, and helpers.
import { act, useState } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import type { Question } from '../../../packages/schema/src/template/question.js';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { Toasts } from '../src/shell.js';
import type { EditorVersion } from '../src/survey-models.js';
import { VerkstadPage } from '../src/verkstad-page.js';
import { editorFixture } from './editor-fixture.js';
import { mount, settle } from './support.js';

export const t = (nn: string) => ({ nn, en: nn });
export const options = [
  { id: 'ja', texts: { text: t('Ja') } },
  { id: 'nei', texts: { text: t('Nei') } },
];
export const hash = (n: number) => 'abcdefghij'[n]!.repeat(64);

/** A published v1 with a frozen F1, and the draft v2 made from it. */
export function versions(status = 'draft'): Record<string, EditorVersion> {
  const base = editorFixture('published');
  const role = base.content.questions[0]!;
  base.id = 'base';
  base.content.questions = [
    {
      id: 'F1',
      type: 'single',
      part: 'common',
      frozen: true,
      anchor_key: 'F1',
      texts: { text: t('Brukar du MFA?'), section_title: t('Tilgang') },
      options,
    },
    role,
    { id: 'Q3', type: 'single', part: 'common', texts: { text: t('Tek de backup?') }, options },
  ] as Question[];
  const draft = { ...structuredClone(base), id: 'version', label: 'v2', version_no: 2, status };
  return status === 'draft' ? { base, version: draft } : { base };
}

interface Call {
  url: string;
  method: string;
  body: { content_hash?: string; content?: TemplateContent; label?: string; copy_from?: string };
}
/**
 * A small survey API: versions by id; a save with the current hash answers with a new one, a save with
 * another hash gets 409 like the real API, unless `put` answers first. `slow` delays every save.
 */
export function serve(
  store: Record<string, EditorVersion>,
  put?: (n: number) => Response | undefined,
  issues: object[] = [],
  slow = 0,
) {
  const calls: Call[] = [];
  let puts = 0;
  const json = (data: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(data), { status }));
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = (init?.body ? JSON.parse(init.body as string) : {}) as Call['body'];
      calls.push({ url, method, body });
      if (url === '/api/admin/surveys')
        return json([
          {
            id: 'template',
            key: 'syntetisk',
            audience: 'client_survey',
            versions: Object.values(store).map((v) => ({
              id: v.id,
              label: v.label,
              version_no: v.version_no,
              status: v.status,
            })),
          },
        ]);
      if (url === '/api/admin/surveys/validate') return json({ issues });
      if (url === '/api/admin/surveys/template/drafts')
        return json({ ...store['base'], id: 'ny', status: 'draft', version_no: 2 });
      const id = /^\/api\/admin\/surveys\/versions\/([^/]+)$/.exec(url)?.[1];
      if (id && method === 'GET') return json(store[id]);
      if (id && method === 'PUT') {
        const n = ++puts;
        const answer = put?.(n);
        if (answer) return Promise.resolve(answer);
        return new Promise<Response>((done) =>
          setTimeout(() => {
            if (body.content_hash !== store[id]!.content_hash)
              return done(new Response(JSON.stringify({ message: 'Endra.' }), { status: 409 }));
            store[id] = { ...store[id]!, content: body.content!, content_hash: hash(n) };
            done(new Response(JSON.stringify(store[id])));
          }, slow),
        );
      }
      return json({});
    }),
  );
  return { calls, puts: () => calls.filter((c) => c.method === 'PUT') };
}

export const shown: { view: ReturnType<typeof mount> | undefined } = { view: undefined };
/** Storage in memory and cleanup after each test; call once at the top of a test file. */
export function workshopTests() {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
    });
    if (!('scrollTo' in Element.prototype))
      Object.defineProperty(Element.prototype, 'scrollTo', { value: () => undefined });
  });
  afterEach(() => {
    shown.view?.close();
    shown.view = undefined;
    vi.unstubAllGlobals();
  });
}
export const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));
export async function open(id = 'version') {
  shown.view = mount(
    <Toasts>
      <VerkstadPage id={id} />
    </Toasts>,
    true,
  );
  await settle();
  await settle();
  return shown.view.div;
}
export const $ = <T extends Element = HTMLElement>(div: HTMLElement, selector: string) =>
  div.querySelector<T & HTMLElement>(selector)!;
export function byText(div: HTMLElement, text: string) {
  const b = [...div.querySelectorAll('button')].find((x) => x.textContent?.trim() === text);
  if (!b) throw new Error(`missing button ${text}`);
  return b;
}
export function type(element: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
export const question = (div: HTMLElement) => $<HTMLTextAreaElement>(div, 'textarea.vk-stor');
export const choose = (div: HTMLElement, id: string) =>
  act(() => $(div, `[data-sel="${id}"]`).click());
export const status = (div: HTMLElement) => $(div, '.vk-lagring').textContent;
export const trail = (div: HTMLElement) =>
  [...div.querySelectorAll('[data-sel]')].map((x) => x.getAttribute('data-sel'));

/** The workshop that can be left and opened again inside the app (menu, «Skjema», back). */
export function Away({ id }: { id: string }) {
  const [here, setHere] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setHere((h) => !h)}>
        Bytt
      </button>
      {here && <VerkstadPage id={id} />}
    </>
  );
}
export async function openAway() {
  shown.view = mount(
    <Toasts>
      <Away id="version" />
    </Toasts>,
    true,
  );
  await settle();
  await settle();
  return shown.view.div;
}
export function pick(select: HTMLSelectElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
