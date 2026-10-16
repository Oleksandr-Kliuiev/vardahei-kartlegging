// 2.5: the Funn page with a mocked API: the preview gets only the fields that decide the outcome,
// after a pause; saving sends the version it was based on and never a version of its own.
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { FindingsPage } from '../src/funn-page.js';
import { Toasts } from '../src/shell.js';
import { button, mount, settle } from './support.js';

const rule = {
  key: 'tryggleik.f12',
  version: 1,
  channel: 'aggregate',
  metric_key: 'tryggleik.f12.distribution',
  options: ['nei', 'usikker'],
  basis: 'tryggleik.f12.distribution',
  threshold: { medium: 0.15, high: 0.3 },
  min_count: 2,
  text: { nn: 'veit ikkje kor dei skal melde frå', en: 'do not know where to report' },
  action_text: { nn: 'Éi side på veggen.', en: 'One page on the wall.' },
  severity: 'risk',
  order: 0,
};
const detail = {
  key: rule.key,
  rule,
  choices: ['ja', 'delvis', 'nei', 'usikker'].map((id) => ({
    id,
    label: id[0]!.toUpperCase() + id.slice(1),
  })),
  locked: false,
  countsAnswers: true,
  questions: [{ id: 'F12', label: 'Veit kor dei skal melde frå' }],
  placeholders: [],
  versions: [{ version: 1, created_at: '2026-10-16T08:00:00Z', changed: [] as string[], rule }],
};
const outcome = (share: number) => ({
  kind: 'finding',
  level: share >= 0.3 ? 'high' : 'medium',
  tal: `${Math.round(share * 12)} av 12`,
  share,
});
let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
  view?.close();
  vi.unstubAllGlobals();
});
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
function input(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('previews only outcome fields after a pause, and saves as the next version', async () => {
  const calls: { url: string; body?: unknown }[] = [];
  let current = detail;
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    calls.push({ url, body });
    if (url.endsWith(`${rule.key}/versions`)) {
      const next = { ...(body!.rule as typeof rule), version: 2 };
      current = {
        ...detail,
        rule: next,
        versions: [
          {
            version: 2,
            created_at: '2026-10-16T09:00:00Z',
            changed: ['options', 'text'],
            rule: next,
          },
          ...detail.versions,
        ],
      };
    }
    const json = url.includes('/preview')
      ? {
          round: { id: 'r1', name: 'Syntetisk runde', status: 'open' },
          client: null,
          source: 'live',
          fixed_version: 1,
          audited: false,
          current: { version: 1, outcome: outcome(4 / 12) },
          draft: {
            outcome: outcome(
              ((body?.rule as { options: string[] }).options.length === 2 ? 4 : 6) / 12,
            ),
          },
        }
      : url.endsWith(`${rule.key}/versions`)
        ? { version: 2 }
        : url === '/api/admin/rounds'
          ? [
              {
                id: 'r1',
                name: 'Syntetisk runde',
                status: 'open',
                template_version_id: 'v',
                round_clients: [],
              },
            ]
          : url === '/api/admin/versions'
            ? [{ id: 'v', label: '2026-10-13', template: { key: 'tryggleik' } }]
            : url.startsWith('/api/admin/finding-rules?')
              ? [{ key: rule.key, version: 1, versions: 1, rule, questions: detail.questions }]
              : current;
    return Promise.resolve(new Response(JSON.stringify(json)));
  });
  vi.stubGlobal('fetch', fetcher);
  view = mount(
    <Toasts>
      <FindingsPage />
    </Toasts>,
    true,
  );
  await settle();
  await wait(450);
  const previews = () => calls.filter((c) => c.url.endsWith('/preview'));
  expect(previews()).toHaveLength(1);
  expect(previews()[0]!.body).toEqual({
    round: 'r1',
    client: 'alle',
    rule: { options: ['nei', 'usikker'], threshold: { medium: 0.15, high: 0.3 }, min_count: 2 },
  });
  expect(view.div.textContent).toContain('4 av 12 (33 %)');
  // Text edits change nothing in the outcome: no new read.
  input(
    view.div.querySelector<HTMLTextAreaElement>('textarea[aria-label="Funnet, nynorsk"]')!,
    'Ny tekst',
  );
  await wait(450);
  expect(previews()).toHaveLength(1);
  // One more answer that counts: one debounced read with the new options.
  act(() => {
    view!.div.querySelector<HTMLInputElement>('input[type="checkbox"]:not(:checked)')!.click();
  });
  await wait(450);
  await settle();
  expect(previews()).toHaveLength(2);
  expect(view.div.textContent).toContain('Med endringa');
  expect(view.div.textContent).toContain('6 av 12 (50 %)');
  act(() => button(view!.div, 'Lagre som versjon 2').click());
  await settle();
  await wait(450);
  await settle();
  const saved = calls.find((c) => c.url.endsWith(`${rule.key}/versions`))!;
  expect(saved.body).toMatchObject({ base_version: 1, rule: { text: { nn: 'Ny tekst' } } });
  expect((saved.body as { rule: object }).rule).not.toHaveProperty('version');
  expect(view.div.textContent).toContain('Lagra som versjon 2.');
  // The saved version becomes the base; the preview reads once more, under the new version.
  expect(view.div.querySelector('.merkelappar')!.textContent).toBe('Versjon 2');
  expect(previews()).toHaveLength(3);
  expect(button(view.div, 'Lagre som versjon 3').disabled).toBe(true);
});
