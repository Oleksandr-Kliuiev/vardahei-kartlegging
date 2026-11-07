// 2.20: an interview guide (audience `interview`) is free text read aloud by Vardahei, nn only.
// 3.1: each question may say when it is Ivaretatt, Forbetringspotensial or Manglar (a guide only).
import { describe, expect, it } from 'vitest';
import { CRITERION_MAX_LENGTH } from '../src/template/criteria.js';
import { respondentTexts } from '../src/template/respondent-texts.js';
import type { TemplateContent } from '../src/template/template.js';
import { TemplateVersionContent } from '../src/template/validate.js';
import { minimalTemplate } from './support/template.js';

const nn = (text: string) => ({ nn: text });

function guide(): TemplateContent {
  return {
    key: 'nokkelpersonar',
    audience: 'interview',
    identification: 'none',
    required_languages: ['nn'],
    leader_roles: [],
    tips: [],
    max_tips: 0,
    intro: {
      title: nn('Kartlegging nøkkelpersonar'),
      short: nn('Nøkkelpersonar'),
      minutes: 45,
      letter: [],
      sender: nn('Vardahei IT'),
      facts: [],
      contact: {
        name: 'Vardahei IT',
        phone: '+47 00 00 00 00',
        email: 'post@example.test',
        hours: nn('08–16'),
      },
    },
    leader_intro: { title: nn('–'), text: nn('–') },
    questions: [
      {
        id: 'N2',
        type: 'text',
        part: 'common',
        texts: {
          text: nn('Er det definert kven som har ansvaret for IT hos dykk?'),
          section_title: nn('Ansvar og rolle'),
          short_label: nn('Kven har IT-ansvaret'),
          help: nn('Lytt etter eit namn og ein stadfortredar.'),
        },
      },
      {
        id: 'N3',
        type: 'text',
        part: 'common',
        texts: { text: nn('Blir dei tilsette informerte om endringar i tryggleik?') },
      },
    ],
  };
}

const messages = (c: unknown) => {
  const r = TemplateVersionContent.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe('interview guide (2.20)', () => {
  it('free-text questions in nn only, with help and short labels → valid', () => {
    expect(messages(guide())).toEqual([]);
  });

  it('a choice question, a leader part, a condition or a role → rejected, one message each', () => {
    const g = guide();
    g.questions[1] = {
      id: 'N3',
      type: 'single',
      part: 'leader',
      role: true,
      texts: { text: nn('Rolle?') },
      options: [{ id: 'a', texts: { text: nn('A') } }],
      visible_if: { '==': [{ var: 'N2' }, 'x'] },
    };
    g.leader_roles = ['a'];
    const m = messages(g).join('\n');
    expect(m).toMatch(/interview question N3 must be text/);
    expect(m).toMatch(/interview question N3 must be common/);
    expect(m).toMatch(/interview has no role or initials \(N3\)/);
    expect(m).toMatch(/interview question N3 has no condition/);
    expect(m).toMatch(/interview has no leader part/);
  });

  it('initials, tips or an invitation → rejected', () => {
    const g = guide();
    g.identification = 'initials';
    g.tips = [{ id: 't', when: { '==': [1, 1] }, title: nn('T'), text: nn('T') }];
    g.invitation = {
      letter: nn('Hei'),
      poster: { title: nn('P'), text: nn('P'), footer: nn('P') },
    };
    const m = messages(g).join('\n');
    expect(m).toMatch(/interview has identification none/);
    expect(m).toMatch(/interview has no tips/);
    expect(m).toMatch(/interview has no invitation/);
  });

  it('English is not required; a text without nn still is rejected', () => {
    const g = guide();
    expect(messages(g).some((x) => /requires en/.test(x))).toBe(false);
    g.questions[0]!.texts.help = {
      en: 'Listen',
    } as unknown as (typeof g.questions)[0]['texts']['text'];
    // The shape itself asks for nn before any language rule runs.
    expect(messages(g).join('\n')).toMatch(/expected string, received undefined/);
  });
});

describe('criteria of a rating (3.1)', () => {
  const criteria = {
    criteria_ivaretatt: nn('Éin namngitt ansvarleg med stadfortredar.'),
    criteria_forbetring: nn('Nokon tek det i praksis, men det er ikkje avklart.'),
    criteria_manglar: nn('Ingen har ansvaret.'),
  };

  it('a guide question may have all three, one or none; they are texts a reader meets', () => {
    const g = guide();
    g.questions[0]!.texts = { ...g.questions[0]!.texts, ...criteria };
    g.questions[1]!.texts.criteria_manglar = nn('Dei tilsette får ikkje vite noko.');
    expect(messages(g)).toEqual([]);
    const keys = respondentTexts(g).map((t) => [t.key, t.where]);
    expect(keys).toContainEqual(['q.N2.criteria_ivaretatt', 'N2: Ivaretatt når …']);
    expect(keys).toContainEqual(['q.N2.criteria_forbetring', 'N2: Forbetringspotensial når …']);
    expect(keys).toContainEqual(['q.N3.criteria_manglar', 'N3: Manglar når …']);
    // Optional: an empty criterion is no gap that stops publishing.
    expect(
      respondentTexts(g)
        .filter((t) => t.key.includes('criteria'))
        .every((t) => !t.required),
    ).toBe(true);
  });

  it(`a criterion over ${CRITERION_MAX_LENGTH} characters → rejected at its place; at the limit → valid`, () => {
    const g = guide();
    g.questions[1]!.texts.criteria_forbetring = nn('x'.repeat(CRITERION_MAX_LENGTH));
    expect(messages(g)).toEqual([]);
    g.questions[1]!.texts.criteria_forbetring = nn('x'.repeat(CRITERION_MAX_LENGTH + 1));
    const r = TemplateVersionContent.safeParse(g);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => [i.message, i.path])).toEqual([
      [
        `criterion forbetring of N3 is over ${CRITERION_MAX_LENGTH} characters`,
        ['questions', 1, 'texts', 'criteria_forbetring'],
      ],
    ]);
  });

  it('a client survey has no criteria; an unknown text key stays refused', () => {
    const c = minimalTemplate();
    const q = c.questions[1] as { texts: Record<string, unknown> };
    q.texts.criteria_ivaretatt = { nn: 'Alltid', en: 'Always' };
    expect(messages(c)).toEqual(['criteria belong to a conversation guide (Q2)']);
    const g = guide();
    (g.questions[0]!.texts as Record<string, unknown>).criteria_delvis = nn('Delvis');
    expect(messages(g).join('\n')).toMatch(/criteria_delvis/);
  });
});
