import type { EditorVersion } from '../src/survey-models.js';

export function editorFixture(status = 'draft'): EditorVersion {
  return {
    id: 'version',
    template_id: 'template',
    label: 'v1',
    status,
    content_hash: 'a'.repeat(64),
    required_languages: ['nn', 'en'],
    translation_acceptance: {},
    content: {
      key: 'syntetisk',
      audience: 'client_survey',
      identification: 'none',
      required_languages: ['nn', 'en'],
      leader_roles: [],
      tips: [],
      max_tips: 0,
      intro: {
        title: { nn: 'Test', en: 'Test' },
        short: { nn: 'Test', en: 'Test' },
        minutes: 2,
        letter: [],
        sender: { nn: 'Test', en: 'Test' },
        facts: [],
        contact: {
          name: 'Test',
          email: 'test@example.invalid',
          phone: '00000000',
          hours: { nn: 'Test', en: 'Test' },
        },
      },
      leader_intro: { title: { nn: 'Test', en: 'Test' }, text: { nn: 'Test', en: 'Test' } },
      questions: [
        {
          id: 'R',
          type: 'single',
          part: 'common',
          role: true,
          texts: { text: { nn: 'Rolle?', en: 'Role?' } },
          options: [{ id: 'test', texts: { text: { nn: 'Test', en: 'Test' } } }],
        },
      ],
    },
  };
}
