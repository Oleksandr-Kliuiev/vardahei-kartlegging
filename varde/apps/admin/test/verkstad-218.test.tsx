// 2.18: where a question is used (with warnings), what the last round answered under the privacy
// limit, notes on a question, ready questions and copies from another survey, and sent marks.
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../../../packages/schema/src/template/question.js';
import type { RoundClient } from '../src/models.js';
import { SendtListe } from '../src/sendt.js';
import { copyOf, standard } from '../src/verkstad-bank.js';
import { Meir, openNotes, same, type Note } from '../src/verkstad-meir.js';
import { mount, settle } from './support.js';
import { byText, open, serve, versions, wait, workshopTests } from './verkstad-support.js';

const json = (data: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(data), { status }));

describe('a copy and the ready questions', () => {
  it('a question from another survey comes without its ties, in the languages of this survey', () => {
    const q = {
      id: 'F5',
      type: 'single',
      part: 'leader',
      frozen: true,
      anchor_key: 'F5',
      role: true,
      visible_if: { '==': [{ var: 'F4' }, 'ja'] },
      texts: { text: { nn: 'Brukar du MFA?', en: 'Do you use MFA?' }, help: { nn: 'Hjelp' } },
      options: [{ id: 'ja', score: 0, texts: { text: { nn: 'Ja', en: 'Yes' } } }],
    } as unknown as Question;
    const copy = copyOf(q, ['nn', 'nb']) as Question & Record<string, unknown>;
    for (const key of ['frozen', 'anchor_key', 'role', 'visible_if'])
      expect(copy[key]).toBeUndefined();
    expect(copy.part).toBe('common');
    expect(copy.texts.text).toEqual({ nn: 'Brukar du MFA?', nb: '' });
    expect(copy.texts.help).toEqual({ nn: 'Hjelp', nb: '' });
    expect((copy as Question & { options: unknown[] }).options[0]).toMatchObject({
      id: 'ja',
      score: 0,
    });
    expect(q).toMatchObject({ frozen: true, anchor_key: 'F5' });
  });
  it('answer conditions and answers taken from another question stay behind', () => {
    const q = {
      id: 'K16',
      type: 'single',
      part: 'common',
      choices_from: 'K3',
      texts: { text: { nn: 'Kva tek mest tid?' } },
      options: [
        {
          id: 'timar',
          visible_if: { '==': [{ var: 'K1' }, 'prod'] },
          texts: { text: { nn: 'Timar' } },
        },
      ],
    } as unknown as Question;
    const copy = copyOf(q, ['nn']) as Question & Record<string, unknown>;
    expect(copy['choices_from']).toBeUndefined();
    expect(
      (copy as unknown as { options: Record<string, unknown>[] }).options[0]!['visible_if'],
    ).toBeUndefined();
  });
  it('ready questions are written in Nynorsk and English, other languages left to fill in', () => {
    const [nps] = standard(['nn', 'en', 'nb']);
    expect(nps!.q.type).toBe('nps');
    expect(nps!.q.texts.text).toEqual({
      nn: 'Kor sannsynleg er det at du vil tilrå oss til ein kollega?',
      en: 'How likely are you to recommend us to a colleague?',
      nb: '',
    });
  });
});

describe('an earlier answer belongs to this question only when it means the same', () => {
  const base = {
    id: 'Q7',
    type: 'single',
    part: 'common',
    texts: { text: { nn: 'Tek de backup?' } },
    options: [
      { id: 'a1', texts: { text: { nn: 'Ja' } } },
      { id: 'a2', texts: { text: { nn: 'Nei' } } },
    ],
  } as unknown as Question;
  it('without anchors the wording must match; ids and scores always', () => {
    expect(same(base, structuredClone(base))).toBe(true);
    const words = structuredClone(base);
    words.texts.text.nn = 'Har de nødstraum?';
    expect(same(base, words)).toBe(false);
    const score = structuredClone(base) as Question & { options: { score?: number }[] };
    score.options[0]!.score = 2;
    expect(same(base, score)).toBe(false);
  });
  it('with anchors on both, a spelling fix keeps it; a new anchor does not', () => {
    const a = { ...structuredClone(base), anchor_key: 'X' } as Question;
    const fixed = { ...structuredClone(a), texts: { text: { nn: 'Tek de back-up?' } } } as Question;
    expect(same(a, fixed)).toBe(true);
    expect(same(a, { ...fixed, anchor_key: 'Y' })).toBe(false);
  });
  it('a scale with other bounds is another question', () => {
    const nps = {
      id: 'N',
      type: 'nps',
      part: 'common',
      texts: { text: { nn: 'Tilrå?' } },
      scale: { min: 0, max: 10, low: { nn: '' }, high: { nn: '' } },
    } as unknown as Question;
    const five = structuredClone(nps) as Question & { scale: { max: number } };
    five.scale.max = 5;
    expect(same(nps, five)).toBe(false);
  });
});

describe('notes and the marks on the trail', () => {
  it('counts open notes per question, solved ones not', () => {
    const note = (node: string, resolved: boolean) =>
      ({ node, resolved_at: resolved ? '2026-10-18T10:00:00Z' : null }) as Note;
    expect([
      ...openNotes([note('Q1', false), note('Q1', false), note('Q2', true)]).entries(),
    ]).toEqual([['Q1', 2]]);
    expect(openNotes(undefined).size).toBe(0);
  });
});

describe('more about a question', () => {
  afterEach(() => vi.unstubAllGlobals());
  const content = versions()['version']!.content;
  content.key = 'tryggleik';
  content.questions[2] = {
    ...content.questions[2]!,
    visible_if: { '==': [{ var: 'F1' }, 'ja'] },
  };
  const f1 = content.questions[0]!;
  it('«Brukt i» names conditions, rules and numbers, and warns when an edit breaks them', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        if (url.endsWith('/metrics'))
          return json([
            {
              key: 'tryggleik.zone',
              kind: 'zone',
              part: 'common',
              questions: ['F1', 'F3'],
              holds: false,
            },
            {
              key: 'tryggleik.f1.distribution',
              kind: 'distribution',
              part: 'common',
              questions: ['F1'],
              holds: true,
            },
          ]);
        if (url.includes('/finding-rules?') && url.includes('aggregate'))
          return json([
            {
              key: 'tryggleik.f1',
              version: 1,
              versions: 1,
              rule: {
                question: 'F1',
                options: ['nei', 'usikker'],
                text: { nn: '{n} brukar ikkje MFA', en: '' },
              },
              questions: [{ id: 'F1', label: 'MFA' }],
            },
          ]);
        if (url.endsWith('/comments')) return json([]);
        return json([]);
      }),
    );
    const view = mount(<Meir versionId="version" hash="h" content={content} q={f1} />, true);
    await settle();
    await settle();
    const text = view.div.textContent ?? '';
    expect(text).toContain('Vilkåret til Q3');
    expect(text).toContain('Funn: brukar ikkje MFA');
    expect(text).toContain('Tal i resultatet: fordelinga');
    expect(text).toContain('rundar på denne versjonen får ikkje sona.');
    // The rule counts «usikker», which F1 no longer has.
    expect(text).toContain('tel svaret «usikker», som ikkje finst i spørsmålet lenger');
    expect(view.div.querySelector('a.chip')?.getAttribute('href')).toBe(
      '/admin/surveys/funn?rule=tryggleik.f1',
    );
    view.close();
  });

  it('names the question that changed on the others, keeps leader rules quiet, says a recount is no loss', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/metrics'))
          return json([
            {
              key: 'z',
              kind: 'zone',
              part: 'common',
              questions: ['F1', 'Q3'],
              holds: false,
              causes: ['Q3'],
            },
            {
              key: 'd',
              kind: 'distribution',
              part: 'common',
              questions: ['F1'],
              holds: false,
              causes: ['F1'],
            },
          ]);
        if (url.includes('/finding-rules?') && url.includes('leader'))
          return json([
            {
              key: 'tryggleik.leader_b17',
              version: 1,
              versions: 1,
              rule: {
                question: 'F1',
                options: ['sensitive'],
                raw_options: ['ja'],
                text: { nn: 'Sensitivt', en: '' },
              },
              questions: [{ id: 'F1', label: 'F1' }],
            },
          ]);
        return json([]);
      }),
    );
    const view = mount(<Meir versionId="version" hash="h" content={content} q={f1} />, true);
    await settle();
    await settle();
    const text = view.div.textContent ?? '';
    expect(text).toContain(
      'Q3 har endra meining eller svar, så rundar på denne versjonen får ikkje sona.',
    );
    expect(text).not.toContain('Spørsmålet har endra meining');
    expect(text).toContain(
      'Svara blir talde på nytt, men blir ikkje samanlikna med tidlegare rundar.',
    );
    expect(text).not.toContain('som ikkje finst i spørsmålet lenger');
    view.close();
  });

  it('«Innsikt» shows the last round under the privacy limit, and nothing when the question changed', async () => {
    const round = {
      id: 'r1',
      name: 'Runde 2',
      status: 'closed',
      has_data: true,
      template_version_id: 'base',
      round_clients: [],
    };
    const before = versions()['base']!;
    const bucket = (id: string, label: string, numerator: number | null) => ({
      id,
      label,
      score: null,
      cell:
        numerator === null
          ? { suppressed: true }
          : { suppressed: false, n: 12, numerator, denominator: 12, missing: 0 },
    });
    const fetcher = vi.fn((url: string) => {
      if (url === '/api/admin/rounds') return json([round]);
      if (url === '/api/admin/versions')
        return json([{ id: 'base', label: 'v1', template: { key: 'tryggleik' } }]);
      if (url === '/api/admin/surveys/versions/base') return json(before);
      if (url.startsWith('/api/admin/dashboard?'))
        return json({
          questions: [
            {
              id: 'F1',
              label: 'MFA',
              short_label: 'MFA',
              type: 'single',
              series: [
                {
                  key: 'F1',
                  label: 'MFA',
                  n: 12,
                  mean: null,
                  nps: null,
                  buckets: [bucket('ja', 'Ja', 9), bucket('nei', 'Nei', null)],
                },
              ],
            },
          ],
        });
      return json([]);
    });
    vi.stubGlobal('fetch', fetcher);
    const view = mount(<Meir versionId="version" hash="h" content={content} q={f1} />, true);
    await settle();
    await settle();
    await settle();
    const block = view.div.querySelector('.vk-innsikt')!;
    expect(block.textContent).toContain('Innsikt frå Runde 2');
    expect(block.textContent).toContain('75 %');
    expect(block.textContent).toContain('–');
    expect(block.textContent).toContain('12 svar');
    // Aggregates only: the dashboard of the round, never rows, quotes or leader answers.
    expect(fetcher.mock.calls.some(([u]) => /\/rows\/|leader-answers|\/report/.test(u))).toBe(
      false,
    );
    view.close();
    // Another anchor: the earlier answers are about something else, so they are not shown.
    const changed = { ...f1, anchor_key: 'F1-ny' } as Question;
    const again = mount(<Meir versionId="version" hash="h" content={content} q={changed} />, true);
    await settle();
    await settle();
    expect(again.div.querySelector('.vk-innsikt')?.textContent).toContain(
      'Spørsmålet har endra svar eller meining sidan då',
    );
    again.close();
  });

  it('notes: written, listed with who and version, solved', async () => {
    let notes: Note[] = [];
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/comments') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string) as { node: string; text: string };
        notes = [
          {
            id: 'n1',
            node: body.node,
            text: body.text,
            version_no: 2,
            created_at: '2026-10-18T09:00:00Z',
            created_by: 'Syntetisk Admin',
            resolved_at: null,
            resolved_by: null,
          },
        ];
        return json({ id: 'n1' }, 201);
      }
      if (url.endsWith('/comments')) return json(notes);
      if (url.includes('/comments/n1')) {
        notes = notes.map((n) => ({
          ...n,
          resolved_at: '2026-10-18T10:00:00Z',
          resolved_by: 'Syntetisk Admin',
        }));
        return json({ id: 'n1', resolved: true });
      }
      return json([]);
    });
    vi.stubGlobal('fetch', fetcher);
    const view = mount(<Meir versionId="version" hash="h" content={content} q={f1} />, true);
    await settle();
    const area = view.div.querySelector<HTMLTextAreaElement>('#vk-ny-kommentar-F1')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        area,
        'Kan vi seie dette enklare?',
      );
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => byText(view.div, 'Legg til kommentar').click());
    await settle();
    await settle();
    expect(fetcher).toHaveBeenCalledWith(
      '/api/admin/surveys/versions/version/comments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ node: 'F1', text: 'Kan vi seie dette enklare?' }),
      }),
    );
    expect(view.div.querySelector('.vk-kommentar')?.textContent).toContain('Syntetisk Admin');
    expect(view.div.querySelector('.vk-kommentar')?.textContent).toContain('v2');
    act(() => byText(view.div, 'Merk som løyst').click());
    await settle();
    await settle();
    expect(view.div.textContent).toContain('1 løyst kommentar');
    view.close();
  });
});

describe('sent by hand', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('shows what is sent with its date, marks and takes back through the API', async () => {
    const fetcher = vi.fn(() => json({}));
    vi.stubGlobal('fetch', fetcher);
    const rc = {
      id: 'rc',
      client_id: 'c',
      client: { name: 'Daco' },
      status: 'open',
      deadline: null,
      population_snapshot: 10,
      invitation_sent_at: '2026-10-12T10:00:00Z',
      reminder_sent_at: null,
    } as RoundClient;
    const view = mount(<SendtListe rc={rc} kinds={['invitation', 'reminder']} />, true);
    expect(view.div.textContent).toContain('Sendt 12. oktober');
    expect(view.div.textContent).toContain('Ikkje merkt');
    act(() =>
      view.div
        .querySelector<HTMLButtonElement>('[aria-label="Merk påminninga til Daco som sendt"]')!
        .click(),
    );
    await settle();
    expect(fetcher).toHaveBeenCalledWith(
      '/api/admin/round-clients/rc/sent',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ kind: 'reminder', sent: true }),
      }),
    );
    act(() =>
      view.div
        .querySelector<HTMLButtonElement>('[aria-label="Angre at invitasjonen til Daco er sendt"]')!
        .click(),
    );
    await settle();
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/admin/round-clients/rc/sent',
      expect.objectContaining({ body: JSON.stringify({ kind: 'invitation', sent: false }) }),
    );
    view.close();
  });
});

describe('«Hent» in the workshop', () => {
  workshopTests();
  it('a ready question goes into the section with a new id', async () => {
    serve(versions());
    const div = await open();
    const before = div.querySelectorAll('.vk-sti [data-sel]').length;
    act(() => byText(div, 'Hent').click());
    expect(div.querySelector('.vk-bank')).not.toBeNull();
    act(() =>
      [...div.querySelectorAll<HTMLButtonElement>('.vk-bank-val')]
        .find((b) => b.textContent?.startsWith('Kor sannsynleg'))!
        .click(),
    );
    await wait(50);
    expect(div.querySelector('.vk-bank')).toBeNull();
    const rows = [...div.querySelectorAll('.vk-sti [data-sel]')];
    expect(rows).toHaveLength(before + 1);
    expect(rows.map((r) => r.getAttribute('data-sel'))).toContain('Q4');
  });
});
