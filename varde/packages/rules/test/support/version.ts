// A small version in the shape of kartlegging (role, routine tasks with choices_from, a scale,
// a leader part) for the runner tests of 1.6.
import type { Question } from '@varde/schema/template/question';
import type { RunnerVersion } from '../../src/runner/types.js';

const t = (nn: string) => ({ text: { nn, en: nn } });
const opt = (id: string, extra: object = {}) => ({ id, texts: t(id), ...extra });
const practical = { or: [{ '==': [{ var: 'R' }, 'prod'] }, { in: ['praktisk', { var: 'W' }] }] };

export const QUESTIONS = [
  {
    id: 'ID',
    part: 'common',
    type: 'text',
    identifier: true,
    single_line: true,
    uppercase: true,
    max_length: 8,
    texts: t('Initialar'),
  },
  {
    id: 'R',
    part: 'common',
    type: 'single',
    role: true,
    texts: t('Rolle'),
    options: ['leiar', 'kontor', 'prod', 'it'].map((id) => opt(id)),
  },
  {
    id: 'W',
    part: 'common',
    type: 'multi',
    texts: t('Arbeid'),
    options: [opt('kontor'), opt('praktisk')],
  },
  {
    id: 'T',
    part: 'common',
    type: 'multi',
    max_choices: 3,
    exclusive_options: ['ingen'],
    texts: t('Rutine'),
    options: [opt('epost'), opt('referat'), opt('timar', { visible_if: practical }), opt('ingen')],
  },
  {
    id: 'M',
    part: 'common',
    type: 'single',
    choices_from: 'T',
    texts: t('Mest tid'),
    visible_if: { '>=': [{ count: [{ var: 'T' }, { '!=': [{ var: '' }, 'ingen'] }] }, 2] },
    options: [opt('epost'), opt('referat'), opt('timar'), opt('ingen')],
  },
  {
    id: 'S',
    part: 'common',
    type: 'scale',
    texts: t('Skala'),
    rows: [opt('a'), opt('b')],
    scale: { min: 1, max: 5, low: { nn: 'l', en: 'l' }, high: { nn: 'h', en: 'h' } },
  },
  { id: 'F', part: 'common', type: 'text', texts: t('Fritt') },
  {
    id: 'N',
    part: 'common',
    type: 'nps',
    texts: t('NPS'),
    scale: { min: 0, max: 10, low: { nn: 'l', en: 'l' }, high: { nn: 'h', en: 'h' } },
  },
  { id: 'B1', part: 'leader', type: 'single', texts: t('Plan'), options: [opt('ja'), opt('nei')] },
  {
    id: 'B2',
    part: 'leader',
    type: 'text',
    texts: t('Kvifor'),
    visible_if: { '==': [{ var: 'B1' }, 'nei'] },
  },
] as unknown as Question[];

export const VERSION: RunnerVersion = {
  identification: 'initials',
  leader_roles: ['leiar', 'it'],
  questions: QUESTIONS,
};
export const ANON: RunnerVersion = {
  ...VERSION,
  identification: 'none',
  questions: QUESTIONS.filter((q) => !q.identifier),
};
