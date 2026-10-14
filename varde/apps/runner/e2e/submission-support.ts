import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type { TemplateContent } from '@varde/schema/template/template';
import type { Answers } from '@varde/rules/runner';
import { steps } from '../src/path.js';
import { state } from './support.js';

export type SurveyKind = 'nn' | 'anonymous' | 'security';
export function contentFor(kind: SurveyKind): TemplateContent {
  const file =
    kind === 'anonymous'
      ? 'ki.2026-10-12'
      : kind === 'security'
        ? 'tryggleik.2026-10-13'
        : 'ki.2026-10-13';
  return (
    JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, `../../../config/seed/templates/${file}.json`),
        'utf8',
      ),
    ) as { content: TemplateContent }
  ).content;
}
export function draftKeyFor(kind: SurveyKind) {
  const s = state()[kind];
  return `varde:${createHash('sha256').update(s.code).digest('hex').slice(0, 16)}:${s.version}`;
}
export async function draftAt(
  page: Page,
  kind: SurveyKind,
  answers: Answers,
  position: 'B-intro' | 'review' | number,
) {
  const path = steps(contentFor(kind), answers);
  const step =
    position === 'review'
      ? path.length
      : position === 'B-intro'
        ? path.indexOf('B-intro')
        : position;
  await page.addInitScript(
    ({ key, answers, step }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({
            answers,
            free: {},
            step,
            lang: 'nn',
            started_at: Date.now(),
            expires: '2099-06-01T22:00:00Z',
            submission_ids: { common: crypto.randomUUID(), leader: crypto.randomUUID() },
          }),
        );
    },
    { key: draftKeyFor(kind), answers, step },
  );
  await page.goto(`/r?c=${state()[kind].code}`);
}
export async function responseRows(ids: string[]) {
  const pg = createRequire(resolve(import.meta.dirname, '../../api/package.json'))('pg') as {
    Client: new (options: { connectionString: string | undefined }) => {
      connect(): Promise<void>;
      end(): Promise<void>;
      query(
        sql: string,
        values: unknown[],
      ): Promise<{
        rows: {
          submission_id: string;
          respondent_key: string | null;
          part: string;
          answers: object;
        }[];
      }>;
    };
  };
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (
      await c.query(
        'SELECT submission_id, respondent_key, part, answers FROM response WHERE submission_id = ANY($1::uuid[])',
        [ids],
      )
    ).rows;
  } finally {
    await c.end();
  }
}
