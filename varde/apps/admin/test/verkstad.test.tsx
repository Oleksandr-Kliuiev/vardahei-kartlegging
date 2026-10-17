import { act, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Question } from '../../../packages/schema/src/template/question.js';
import type { TemplateContent } from '../../../packages/schema/src/template/template.js';
import { Toasts } from '../src/shell.js';
import type { EditorVersion } from '../src/survey-models.js';
import { VerkstadPage } from '../src/verkstad-page.js';
import { editorFixture } from './editor-fixture.js';
import { mount, settle } from './support.js';

const t = (nn: string) => ({ nn, en: nn });
const options = [
  { id: 'ja', texts: { text: t('Ja') } },
  { id: 'nei', texts: { text: t('Nei') } },
];
const hash = (n: number) => 'abcdefghij'[n]!.repeat(64);

/** A published v1 with a frozen F1, and the draft v2 made from it. */
function versions(status = 'draft'): Record<string, EditorVersion> {
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
function serve(
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

let view: ReturnType<typeof mount> | undefined;
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
  view?.close();
  view = undefined;
  vi.unstubAllGlobals();
});
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));
async function open(id = 'version') {
  view = mount(
    <Toasts>
      <VerkstadPage id={id} />
    </Toasts>,
    true,
  );
  await settle();
  await settle();
  return view.div;
}
const $ = <T extends Element = HTMLElement>(div: HTMLElement, selector: string) =>
  div.querySelector<T & HTMLElement>(selector)!;
function byText(div: HTMLElement, text: string) {
  const b = [...div.querySelectorAll('button')].find((x) => x.textContent?.trim() === text);
  if (!b) throw new Error(`missing button ${text}`);
  return b;
}
function type(element: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const question = (div: HTMLElement) => $<HTMLTextAreaElement>(div, 'textarea.vk-stor');
const choose = (div: HTMLElement, id: string) => act(() => $(div, `[data-sel="${id}"]`).click());
const status = (div: HTMLElement) => $(div, '.vk-lagring').textContent;
const trail = (div: HTMLElement) =>
  [...div.querySelectorAll('[data-sel]')].map((x) => x.getAttribute('data-sel'));

it('a published version is read-only and «Lag utkast» opens the next draft', async () => {
  const api = serve(versions('published'));
  const div = await open('base');
  expect(div.textContent).toContain('Publisert v1');
  expect(div.textContent).toContain('v1 er publisert og låst');
  expect(div.querySelector('.vk-lagring')).toBeNull();
  expect(question(div).readOnly).toBe(true);
  choose(div, 'Q3');
  expect(question(div).readOnly).toBe(true);
  expect(div.textContent).not.toContain('Slett spørsmålet');
  act(() => byText(div, 'Lag utkast v2').click());
  await settle();
  expect(api.calls.find((c) => c.url.endsWith('/drafts'))?.body).toEqual({
    label: 'v2',
    copy_from: 'base',
  });
  expect(location.pathname).toBe('/admin/surveys/ny');
});

it('edits save themselves with the hash they were loaded with, then with the new one', async () => {
  const api = serve(versions());
  const div = await open();
  choose(div, 'Q3');
  type(question(div), 'Tek de backup kvar veke?');
  expect(status(div)).toBe('Lagrar …');
  await wait(800);
  expect(api.puts()).toHaveLength(1);
  expect(api.puts()[0]!.body.content_hash).toBe(hash(0));
  expect(api.puts()[0]!.body.content!.questions[2]!.texts.text.nn).toBe('Tek de backup kvar veke?');
  expect(status(div)).toMatch(/^Lagra kl\. \d\d\.\d\d$/);
  type(question(div), 'Tek de backup kvar dag?');
  await wait(800);
  expect(api.puts().map((c) => c.body.content_hash)).toEqual([hash(0), hash(1)]);
});

it('a conflict keeps what was typed and saves over the other version only on purpose', async () => {
  const store = versions();
  const api = serve(store, (n) =>
    n === 1 ? new Response(JSON.stringify({ message: 'Endra.' }), { status: 409 }) : undefined,
  );
  const div = await open();
  choose(div, 'Q3');
  type(question(div), 'Mi endring');
  await wait(800);
  expect($(div, '[role="alert"]').textContent).toContain('endra ein annan stad');
  expect(status(div)).toBe('Ikkje lagra');
  expect(question(div).value).toBe('Mi endring');
  expect(localStorage.getItem('varde:verkstad:version')).toContain('Mi endring');
  // While the conflict stands nothing is sent, and one click on «Hent» only asks again.
  type(question(div), 'Mi endring, meir');
  await wait(800);
  expect(api.puts()).toHaveLength(1);
  act(() => byText(div, 'Hent det lagra utkastet').click());
  expect(question(div).value).toBe('Mi endring, meir');
  expect(div.textContent).toContain('Klikk igjen: endringane dine her blir borte');
  store['version'] = { ...store['version']!, content_hash: hash(9) };
  act(() => byText(div, 'Lagre mine over').click());
  await settle();
  expect(api.puts()[1]!.body).toMatchObject({ content_hash: hash(9) });
  expect(api.puts()[1]!.body.content!.questions[2]!.texts.text.nn).toBe('Mi endring, meir');
  expect(div.querySelector('[role="alert"]')).toBeNull();
  expect(status(div)).toMatch(/^Lagra kl\./);
});

it('a draft the server turns down says what to do and saves after the next edit', async () => {
  const api = serve(versions(), (n) =>
    n === 1
      ? new Response(JSON.stringify({ message: 'Kontroller felta.' }), { status: 400 })
      : undefined,
  );
  const div = await open();
  choose(div, 'Q3');
  type(question(div), 'Første');
  await wait(800);
  expect(status(div)).toBe('Ikkje lagra: rett feilen som er merkt');
  type(question(div), 'Andre');
  await wait(800);
  expect(api.puts()).toHaveLength(2);
  expect(status(div)).toMatch(/^Lagra kl\./);
});

it('«Angre» after deleting brings the question back to its place, also after another edit', async () => {
  serve(versions());
  const div = await open();
  choose(div, 'Q3');
  act(() => byText(div, 'Slett spørsmålet').click());
  expect(trail(div)).toEqual(['F1', 'R']);
  expect($(div, '.toast').textContent).toContain('Q3 er sletta.');
  choose(div, 'R');
  type(question(div), 'Kva rolle har du?');
  act(() => byText($(div, '.toast'), 'Angre').click());
  expect(trail(div)).toEqual(['F1', 'R', 'Q3']);
  expect(question(div).value).toBe('Tek de backup?');
  choose(div, 'R');
  expect(question(div).value).toBe('Kva rolle har du?');
});

it('a frozen question is locked until «Rett ordlyden»; the choice holds for that wording only', async () => {
  const api = serve(versions());
  const div = await open();
  expect($(div, '[aria-current="true"][data-sel]').getAttribute('data-sel')).toBe('F1');
  expect(question(div).readOnly).toBe(true);
  expect(div.textContent).toContain('Ordlyden ligg fast');
  act(() => byText(div, 'Rett ordlyden').click());
  expect(question(div).readOnly).toBe(false);
  type(question(div), 'Brukar du MFA (tofaktor)?');
  const title = () => $(div, '.vk-klassifiser-tittel').textContent;
  expect(title()).toBe('Du har endra ordlyden i F1. Kva slags endring er det?');
  act(() => $<HTMLInputElement>(div, 'input[name="merke-F1"]').click());
  expect(title()).toBe('Endringa i F1 er merkt som rettskriving.');
  expect(Object.keys(JSON.parse(localStorage.getItem('varde:merke:version')!) as object)).toEqual([
    'F1',
  ]);
  type(question(div), 'Brukar du MFA (to faktorar)?');
  expect(title()).toBe('Du har endra F1 etter at du valde «Rettskriving». Vel på nytt.');
  act(() => div.querySelectorAll<HTMLInputElement>('input[name="merke-F1"]')[1]!.click());
  expect(title()).toBe('Endringa i F1 er merkt som ny meining.');
  await wait(800);
  expect(api.puts().at(-1)!.body.content!.questions[0]).toMatchObject({ anchor_key: 'F1~v2' });
  // Spelling again; after a reload the choice is still there for the same wording.
  act(() => $<HTMLInputElement>(div, 'input[name="merke-F1"]').click());
  await wait(800);
  expect(api.puts().at(-1)!.body.content!.questions[0]).toMatchObject({ anchor_key: 'F1' });
  view!.close();
  const again = await open();
  expect($(again, '.vk-klassifiser-tittel').textContent).toBe(
    'Endringa i F1 er merkt som rettskriving.',
  );
});

it('the publish panel holds the focus while open and gives it back when it closes', async () => {
  serve(versions());
  const div = await open();
  const publish = [...div.querySelectorAll('button')].find((b) =>
    b.textContent?.startsWith('Gjer klar til publisering'),
  )!;
  publish.focus();
  act(() => publish.click());
  expect(div.querySelector('.vk-skuff')).not.toBeNull();
  expect($(div, '.vk-flate').inert).toBe(true);
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Lukk');
  expect(div.textContent).toContain('Ingen faste spørsmål er endra.');
  act(() => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
  });
  expect(div.querySelector('.vk-skuff')).toBeNull();
  expect($(div, '.vk-flate').inert).toBe(false);
  expect(document.activeElement).toBe(publish);
});

it('a new survey starts with «Første spørsmål», and a blocked save leads to what is missing', async () => {
  const store = versions();
  store['version']!.content.questions = [];
  serve(
    store,
    () => new Response(JSON.stringify({ message: 'Kontroller felta.' }), { status: 400 }),
    [{ path: ['intro', 'contact', 'email'], message: 'Invalid email', blocking: true }],
  );
  const div = await open();
  expect(trail(div)).toEqual([]);
  act(() => byText(div, 'Første spørsmål').click());
  // Q3 is taken by the published version, so the new question is Q4.
  expect(trail(div)).toEqual(['Q4']);
  type(question(div), 'Kva tenkjer du om seminaret?');
  await wait(800);
  expect(status(div)).toBe('Ikkje lagra · Vis kva som manglar');
  act(() => byText(div, 'Vis kva som manglar').click());
  expect($(div, '.vk-node-tittel').textContent).toBe('Velkomen');
});

/** The workshop that can be left and opened again inside the app (menu, «Skjema», back). */
function Away({ id }: { id: string }) {
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
async function openAway() {
  view = mount(
    <Toasts>
      <Away id="version" />
    </Toasts>,
    true,
  );
  await settle();
  await settle();
  return view.div;
}
function pick(select: HTMLSelectElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

it('opened again, the workshop starts from the saved draft, not from an earlier copy', async () => {
  const api = serve(versions());
  const div = await openAway();
  choose(div, 'Q3');
  type(question(div), 'Første besøk');
  await wait(800);
  act(() => byText(div, 'Bytt').click());
  act(() => byText(div, 'Bytt').click());
  await settle();
  await settle();
  choose(div, 'Q3');
  expect(question(div).value).toBe('Første besøk');
  type(question(div), 'Andre besøk');
  await wait(800);
  expect(api.puts().map((c) => c.body.content_hash)).toEqual([hash(0), hash(1)]);
  expect(div.querySelector('.vk-feilmelding')).toBeNull();
});

it('leaving the workshop right after typing saves what was typed', async () => {
  const api = serve(versions());
  const div = await openAway();
  choose(div, 'Q3');
  type(question(div), 'Rask endring');
  act(() => byText(div, 'Bytt').click());
  await settle();
  expect(api.puts()).toHaveLength(1);
  expect(api.puts()[0]!.body.content!.questions[2]!.texts.text.nn).toBe('Rask endring');
});

it('saves run one after another with the hash the previous one returned', async () => {
  const api = serve(versions(), undefined, [], 2400);
  const div = await open();
  choose(div, 'Q3');
  type(question(div), 'A');
  await wait(800);
  type(question(div), 'AB');
  await wait(800);
  type(question(div), 'ABC');
  await wait(800);
  await wait(4200);
  expect(api.puts().map((c) => c.body.content_hash)).toEqual([hash(0), hash(1)]);
  expect(api.puts()[1]!.body.content!.questions[2]!.texts.text.nn).toBe('ABC');
  expect(div.querySelector('.vk-feilmelding')).toBeNull();
  expect(status(div)).toMatch(/^Lagra kl\./);
}, 15000);

it('work kept in the browser from an older version goes through the conflict choice', async () => {
  const store = versions();
  const kept = structuredClone(store['version']!.content);
  kept.questions[2]!.texts.text.nn = 'Frå førre gong';
  localStorage.setItem(
    'varde:verkstad:version',
    JSON.stringify({ content: kept, at: '2026-10-17T10:00:00.000Z', hash: hash(7) }),
  );
  const api = serve(store);
  const div = await open();
  expect(div.textContent).toContain('Utkastet er lagra på nytt sidan då');
  act(() => byText(div, 'Hent dei inn').click());
  await wait(800);
  expect(api.puts()[0]!.body.content_hash).toBe(hash(7));
  expect($(div, '.vk-feilmelding').textContent).toContain('endra ein annan stad');
});

it('changing the question of a rule keeps the rule being written', async () => {
  const store = versions();
  store['version']!.content.questions[2]!.visible_if = { '==': [{ var: 'F1' }, 'nei'] };
  const api = serve(store);
  const div = await open();
  choose(div, 'Q3');
  pick($<HTMLSelectElement>(div, '[aria-label="Spørsmål i vilkår 1"]'), 'R');
  expect($<HTMLSelectElement>(div, '[aria-label="Spørsmål i vilkår 1"]').value).toBe('R');
  expect(div.textContent).not.toContain('Alltid.');
  pick($<HTMLSelectElement>(div, '[aria-label="Svar i vilkår 1"]'), 'test');
  await wait(800);
  expect(api.puts().at(-1)!.body.content!.questions[2]!.visible_if).toEqual({
    '==': [{ var: 'R' }, 'test'],
  });
});

it('a deleted question keeps its id: a new question gets another, and «Angre» brings it back', async () => {
  serve(versions());
  const div = await open();
  choose(div, 'Q3');
  act(() => byText(div, 'Slett spørsmålet').click());
  act(() => $(div, '.vk-seksjon.aktiv .vk-legg').click());
  expect(trail(div)).toEqual(['F1', 'R', 'Q4']);
  act(() => byText($(div, '.toast'), 'Angre').click());
  expect(trail(div)).toEqual(['F1', 'R', 'Q4', 'Q3']);
});

it('the first section without a title cannot be moved: it would melt into its neighbour', async () => {
  const store = versions();
  const [f1, r, q3] = store['version']!.content.questions as [Question, Question, Question];
  delete f1.texts.section_title;
  q3.texts.section_title = t('Andre');
  serve(store);
  const div = await open();
  act(() => [...div.querySelectorAll<HTMLElement>('.vk-seksjon .vk-node')][1]!.click());
  expect(byText(div, 'Flytt opp').disabled).toBe(true);
  act(() => [...div.querySelectorAll<HTMLElement>('.vk-seksjon .vk-node')][0]!.click());
  expect(byText(div, 'Flytt ned').disabled).toBe(true);
  expect(div.textContent).toContain('Gi seksjonen ein tittel før du flyttar han.');
  expect(r.id).toBe('R');
});
