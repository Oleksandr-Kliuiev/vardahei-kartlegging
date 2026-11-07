// 2.22b a fake server for the tests of the actions of the catalogue: the catalogue, the chosen actions of
// client c1, what the page sends (PUT and POST, with the body), and the few reads the client page makes.
import { vi } from 'vitest';
import type { ChosenAction } from '../src/kunde-samtale-tiltak.js';
import type { CatalogAction } from '../src/samtale-tiltak.js';

export const id = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
export const CATALOG: CatalogAction[] = [
  {
    id: id(3),
    name: 'Beredskapsplan',
    description: 'Ein plan.',
    seminar_topic: 'Når noko går gale',
  },
  { id: id(1), name: 'Passordhandterar', description: 'Eit verktøy.', seminar_topic: 'Passord' },
  {
    id: id(2),
    name: 'Phishing-øving',
    description: 'Ei øving.',
    seminar_topic: 'Phishing og svindel',
  },
];
export const server = {
  catalog: CATALOG,
  chosen: [] as ChosenAction[],
  sent: [] as { url: string; method: string; body: Record<string, unknown> }[],
  reset() {
    this.catalog = CATALOG;
    this.chosen = [];
    this.sent.length = 0;
  },
};
export const fetcher = vi.fn((url: string, init?: RequestInit) => {
  if (init?.method && init.method !== 'GET') {
    const raw = typeof init.body === 'string' ? init.body : '{}';
    const body = JSON.parse(raw) as Record<string, unknown>;
    server.sent.push({ url, method: init.method, body });
    return Promise.resolve(new Response(JSON.stringify({ value: body.value ?? null, id: 'ny' })));
  }
  const reads: Record<string, unknown> = {
    '/api/admin/actions': server.catalog,
    '/api/admin/clients': [{ id: 'c1', name: 'Daco', slug: 'daco', employee_count: 25 }],
    '/api/admin/rounds': [],
    '/api/admin/seminars': { seminars: [], contacts_to_review: 0 },
    '/api/admin/clients/c1/interview-actions': { rows: server.chosen },
    '/api/admin/clients/c1/interviews': [],
  };
  return Promise.resolve(new Response(JSON.stringify(reads[url] ?? {})));
});
/** A value typed into an input or a text area, the way React sees it. */
export function setValue(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
