// A minimal valid client-survey template (1.1) and helpers to break it in tests.
const t = (nn: string, en = `${nn} (en)`) => ({ nn, en });

export function minimalTemplate(): Record<string, unknown> & {
  questions: Record<string, unknown>[];
} {
  return {
    key: 'demo',
    audience: 'client_survey',
    required_languages: ['nn', 'en'],
    leader_roles: ['leiar'],
    intro: {
      title: t('Tittel'),
      short: t('Kort'),
      minutes: 5,
      letter: [t('Brev')],
      sender: t('Avsendar'),
      facts: [t('Fakta')],
      contact: {
        name: 'Vardahei IT',
        phone: '+47 000',
        email: 'post@example.test',
        hours: t('Måndag'),
      },
    },
    leader_intro: { title: t('Leiar'), text: t('Tekst') },
    tips: [],
    max_tips: 4,
    questions: [
      {
        id: 'Q1',
        part: 'common',
        type: 'text',
        identifier: true,
        single_line: true,
        uppercase: true,
        max_length: 8,
        texts: { text: t('Initialar') },
      },
      {
        id: 'Q2',
        part: 'common',
        type: 'single',
        role: true,
        texts: { text: t('Rolle') },
        options: [
          { id: 'leiar', texts: { text: t('Leiar') } },
          { id: 'anna', texts: { text: t('Anna') } },
        ],
      },
      {
        id: 'Q3',
        part: 'common',
        type: 'multi',
        texts: { text: t('Oppgåver') },
        options: [
          { id: 'a', texts: { text: t('A') }, score: 0 },
          { id: 'b', texts: { text: t('B') }, score: 3 },
          { id: 'ingen', texts: { text: t('Ingen') } },
        ],
        exclusive_options: ['ingen'],
      },
      {
        id: 'Q4',
        part: 'leader',
        type: 'single',
        texts: { text: t('Plan') },
        visible_if: { '==': [{ var: 'Q2' }, 'leiar'] },
        options: [
          { id: 'ja', texts: { text: t('Ja') }, score: 0 },
          { id: 'nei', texts: { text: t('Nei') }, score: 2 },
        ],
      },
    ],
  };
}

/** `{op: [x, …]}` nested `depth` times around a `var` (each level is one operator). */
export function nested(depth: number): unknown {
  let e: unknown = { var: 'Q2' };
  for (let i = 1; i < depth; i += 1) e = { '!': e };
  return e;
}
