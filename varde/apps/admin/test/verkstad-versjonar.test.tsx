// Wave C: going back to an older wording is one press in «Versjonar», not a hunt — a draft can be
// built on any published version, and the panel says plainly why it cannot while a draft is open.
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { VersionSummary } from '../src/survey-models.js';
import { Versjonar } from '../src/verkstad-versjonar.js';
import { mount } from './support.js';

let view: ReturnType<typeof mount> | undefined;
afterEach(() => {
  view?.close();
  view = undefined;
});

const VERSIONS: VersionSummary[] = [
  {
    id: 'v2',
    label: 'v2',
    version_no: 2,
    status: 'published',
    published_at: '2026-10-17T10:00:00Z',
    published_by: 'Oleksandr',
    rounds: 1,
  },
  {
    id: 'v1',
    label: 'v1',
    version_no: 1,
    status: 'published',
    published_at: '2026-09-01T10:00:00Z',
    published_by: 'Oleksandr',
    rounds: 2,
  },
];
const button = (div: HTMLElement, text: string) =>
  [...div.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

it('offers a draft from any published version, and says why it cannot while one is open', () => {
  const onDraftFrom = vi.fn();
  view = mount(
    <Versjonar
      versions={VERSIONS}
      current="v2"
      hasDraft={false}
      busy={false}
      onOpen={vi.fn()}
      onDraftFrom={onDraftFrom}
      onClose={vi.fn()}
    />,
  );
  expect(button(view.div, 'Byggj utkast på v2')).toBeTruthy();
  act(() => button(view!.div, 'Byggj utkast på v1')!.click());
  expect(onDraftFrom).toHaveBeenCalledWith('v1');

  view.close();
  view = mount(
    <Versjonar
      versions={VERSIONS}
      current="v2"
      hasDraft
      busy={false}
      onOpen={vi.fn()}
      onDraftFrom={onDraftFrom}
      onClose={vi.fn()}
    />,
  );
  expect(button(view.div, 'Byggj utkast på v1')).toBeUndefined();
  expect(view.div.textContent).toContain('Eitt utkast om gongen');
});
