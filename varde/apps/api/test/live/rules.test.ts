// Live poll rules without a database (3.4): the steps of a question, which question leads, what
// the phone is told, which versions can be a live poll, the presenter window (Oslo, also across
// a daylight saving change), the key's bearer format and the nynorsk of the new texts.
import { describe, expect, it } from 'vitest';
import { findBokmal } from '@varde/schema/i18n/nn-stoplist';
import { TemplateVersionContent } from '@varde/schema/template/validate';
import {
  liveProblem,
  liveQuestions,
  participantQuestion,
} from '../../src/modules/live/live-template.js';
import { nextState } from '../../src/modules/live/live-poll.service.js';
import { currentQuestion, participantState } from '../../src/modules/live/live-view.js';
import { presenterBearer } from '../../src/modules/live/presenter-token.service.js';
import { inWindow, presenterWindow, windowText } from '../../src/modules/live/window.js';
import { LIVE_CLOSED, LIVE_NOT_YET } from '../../src/modules/responses/live-answer.js';
import { liveContent } from '../support/live.js';

describe('steps of a question', () => {
  it.each([
    ['open', 'waiting', 'open'],
    ['open', 'closed', 'open'],
    ['open', 'open', 'same'],
    ['close', 'open', 'closed'],
    ['close', 'closed', 'same'],
    ['release', 'closed', 'released'],
    ['release', 'released', 'same'],
  ] as const)('%s from %s → %s', (action, from, to) => {
    expect(nextState(action, from)).toBe(to);
  });
  it.each([
    ['open', 'released', 'Resultatet er vist'],
    ['close', 'waiting', 'ikkje ope'],
    ['close', 'released', 'ikkje ope'],
    ['release', 'waiting', 'ikkje stilt enno'],
    ['release', 'open', 'Steng spørsmålet før'],
  ] as const)('%s from %s is refused', (action, from, text) => {
    const r = nextState(action, from);
    expect(typeof r === 'object' && r.refused).toContain(text);
  });
});

describe('which question leads', () => {
  const at = (s: string) => new Date(`2026-11-05T09:${s}:00Z`);
  it('the open one, else the one changed last, else none', () => {
    expect(currentQuestion([{ state: 'waiting', changed_at: at('00'), position: 1 }])).toBeNull();
    const states = [
      { state: 'released', changed_at: at('05'), position: 1 },
      { state: 'closed', changed_at: at('09'), position: 2 },
      { state: 'waiting', changed_at: at('10'), position: 3 },
    ];
    expect(currentQuestion(states)?.position).toBe(2);
    expect(
      currentQuestion([...states, { state: 'open', changed_at: at('01'), position: 4 }])?.position,
    ).toBe(4);
  });
  it('the phone: waiting, open, between and done', () => {
    expect(participantState([{ state: 'waiting' }, { state: 'waiting' }])).toBe('waiting');
    expect(participantState([{ state: 'open' }, { state: 'waiting' }])).toBe('open');
    expect(participantState([{ state: 'released' }, { state: 'waiting' }])).toBe('between');
    expect(participantState([{ state: 'released' }, { state: 'closed' }])).toBe('done');
  });
});

describe('versions that can be a live poll', () => {
  const content = liveContent();
  it('the fixture is a valid version and a valid live poll', () => {
    expect(TemplateVersionContent.safeParse(content).success).toBe(true);
    expect(liveProblem(content)).toBeNull();
    expect(liveQuestions(content).map((q) => q.id)).toEqual(['L1', 'L2', 'L3']);
  });
  it('refuses a client survey, initials, text, leader questions, free text and conditions', () => {
    const q = content.questions;
    const cases = [
      { ...content, audience: 'client_survey' as const },
      { ...content, identification: 'initials' as const },
      {
        ...content,
        questions: [
          ...q,
          { id: 'T1', part: 'common', type: 'text', texts: { text: { nn: 'Tekst' } } },
        ],
      },
      {
        ...content,
        questions: q.map((x) => (x.id === 'L2' ? { ...x, part: 'leader' as const } : x)),
      },
      {
        ...content,
        questions: q.map((x) =>
          x.id === 'L2' ? { ...x, free_text: { texts: { text: { nn: 'Kvifor?' } } } } : x,
        ),
      },
      { ...content, questions: q.map((x) => (x.id === 'L3' ? { ...x, choices_from: 'L1' } : x)) },
    ];
    for (const c of cases) {
      const problem = liveProblem(c as typeof content);
      expect(problem).not.toBeNull();
      expect(findBokmal(problem!)).toEqual([]);
    }
  });
  it('the phone gets texts and options of the open question only, in the languages of the version', () => {
    const view = participantQuestion(liveQuestions(content)[2]!, ['nn'], 3, 3);
    expect(view).toMatchObject({
      no: 3,
      total: 3,
      question: { id: 'L3', type: 'multi', exclusive_options: ['ingenting'] },
    });
    expect(JSON.stringify(view)).not.toContain('"en"');
    expect(JSON.stringify(view)).not.toMatch(/Kva arbeider|tofaktor/);
  });
});

describe('presenter window (Europe/Oslo)', () => {
  const seminar = (start: string, end: string) => ({
    starts_at: new Date(start),
    ends_at: new Date(end),
  });
  it('from 00:00 the day before to 24:00 the day after', () => {
    const w = presenterWindow(seminar('2026-11-05T08:00:00Z', '2026-11-05T10:30:00Z'));
    expect(w.from.toISOString()).toBe('2026-11-03T23:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-11-06T23:00:00.000Z');
    expect(windowText(w)).toBe('frå onsdag 4. november 2026 til og med fredag 6. november 2026');
    const s = seminar('2026-11-05T08:00:00Z', '2026-11-05T10:30:00Z');
    expect(inWindow(s, new Date('2026-11-03T22:59:59Z'))).toBe(false);
    expect(inWindow(s, new Date('2026-11-03T23:00:00Z'))).toBe(true);
    expect(inWindow(s, new Date('2026-11-06T22:59:59Z'))).toBe(true);
    expect(inWindow(s, new Date('2026-11-06T23:00:00Z'))).toBe(false);
  });
  it('across the end of summer time (25 October 2026)', () => {
    const w = presenterWindow(seminar('2026-10-26T07:00:00Z', '2026-10-26T09:00:00Z'));
    // 25 Oct 00:00 is still summer time (UTC+2); 28 Oct 00:00 is winter time (UTC+1).
    expect(w.from.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-27T23:00:00.000Z');
  });
});

describe('the key', () => {
  it('only as a 43-character bearer', () => {
    const key = 'k'.repeat(43);
    expect(presenterBearer({ headers: { authorization: `Bearer ${key}` } })).toBe(key);
    for (const value of [
      undefined,
      key,
      `Bearer ${'k'.repeat(22)}`,
      `Bearer ${key}x`,
      `Basic ${key}`,
    ])
      expect(presenterBearer({ headers: { authorization: value } })).toBe('');
  });
  it('texts to the phones are nynorsk', () => {
    for (const text of [LIVE_CLOSED, LIVE_NOT_YET]) expect(findBokmal(text)).toEqual([]);
  });
});
