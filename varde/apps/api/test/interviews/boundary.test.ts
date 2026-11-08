// 2.20: conversations stay out of the survey data paths (aggregates, snapshots, the client CSV, the
// assistant, Atlas). Only the interviews module reads their tables; retention reaches them through it.
// 2.21: the overview, its CSV and the referat read them in the same module (interview-report.service).
// 2.22b: the actions of the catalogue chosen in a conversation (`interview_action`) are one of them, also
// through the relations from the catalogue and from seminars (`in_interviews`, `interview_actions`).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', 'src');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(join(dir, e.name))
      : e.name.endsWith('.ts')
        ? [join(dir, e.name)]
        : [],
  );
}
const files = sources(SRC).map((f) => ({ path: relative(SRC, f), text: readFileSync(f, 'utf8') }));

/** A Prisma call on a conversation table (`db.interview.findMany`, `db['interviewAnswer']`), the
 * relation from a client, a round, an action or a seminar (`include: { interviews: true }`), or SQL
 * naming one. */
const TABLES = new RegExp(
  [
    /\.(?:interview|interviewAnswer|interviewRound|interviewAction)\s*\.\s*(?:find|create|update|upsert|delete|count|aggregate|groupBy)/
      .source,
    /\[\s*['"`](?:interview|interviewAnswer|interviewRound|interviewAction)['"`]\s*\]/.source,
    /\b(?:interviews|in_interviews|interview_actions)\s*:\s*(?:true|\{)/.source,
    /\binterview_(?:answer|round|action)\b/.source,
    /\b(?:FROM|JOIN|INTO|UPDATE)\s+"?interview"?\b/.source,
  ].join('|'),
  'i',
);

describe('conversations stay in their own module (2.20)', () => {
  it('only the interviews module touches the conversation tables', () => {
    expect(
      files
        .filter((f) => TABLES.test(f.text))
        .map((f) => f.path)
        .sort(),
    ).toEqual([
      'modules/interviews/interview-actions.ts',
      'modules/interviews/interview-move.ts',
      'modules/interviews/interview-report.service.ts',
      'modules/interviews/interview-retention.ts',
      'modules/interviews/interviews.service.ts',
    ]);
  });

  it('outside it, only the app module, retention (forget, ledger, handover) and a deleted seminar (reopening its actions) import it', () => {
    expect(
      files
        .filter((f) => !f.path.startsWith('modules/interviews/'))
        .filter((f) => /from '[./]+(?:modules\/)?interviews\//.test(f.text))
        .map((f) => f.path)
        .sort(),
    ).toEqual([
      'app.module.ts',
      'modules/retention/forget.service.ts',
      'modules/retention/handover.ts',
      'modules/retention/ledger.ts',
      // A deleted seminar reopens the actions of conversations taken up in it (acceptance of 2.22b).
      'modules/seminars/seminars.service.ts',
    ]);
  });
});
