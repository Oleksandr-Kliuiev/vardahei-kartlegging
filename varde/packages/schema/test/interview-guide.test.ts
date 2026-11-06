// 2.20: an interview guide (audience `interview`) is free text read aloud by Vardahei, nn only.
import { describe, expect, it } from 'vitest';
import type { TemplateContent } from '../src/template/template.js';
import { TemplateVersionContent } from '../src/template/validate.js';

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
