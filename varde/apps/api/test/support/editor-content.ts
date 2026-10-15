import type { TemplateContent } from '@varde/schema/template/template';

const text = (nn: string) => ({ nn, en: nn });

export const editorContent = (key: string): TemplateContent => ({
  key,
  audience: 'client_survey',
  identification: 'none',
  required_languages: ['nn', 'en'],
  leader_roles: [],
  max_tips: 0,
  tips: [],
  intro: {
    title: text('Syntetisk skjema'),
    short: text('Test'),
    minutes: 2,
    letter: [],
    sender: text('Test'),
    facts: [],
    contact: {
      name: 'Test',
      phone: '00000000',
      email: 'test@example.invalid',
      hours: text('Test'),
    },
  },
  leader_intro: { title: text('Leiar'), text: text('Test') },
  invitation: {
    letter: text('Hei {lenkje}{frist}'),
    poster: { title: text('Test'), text: text('{lenkje}'), footer: text('Test') },
  },
  questions: [
    {
      id: 'R',
      part: 'common',
      type: 'single',
      role: true,
      frozen: true,
      anchor_key: 'R1',
      texts: { text: text('Rolle') },
      options: [{ id: 'test', texts: { text: text('Testrolle') } }],
    },
    {
      id: 'S',
      part: 'common',
      type: 'scale',
      texts: { text: text('Skala') },
      rows: [{ id: 'rad', texts: { text: text('Rad') } }],
      scale: { min: 0, max: 3, low: text('Låg'), high: text('Høg') },
    },
    {
      id: 'L',
      part: 'leader',
      type: 'multi',
      texts: { text: text('Leiardel') },
      options: [{ id: 'ja', texts: { text: text('Ja') } }],
    },
  ],
});
