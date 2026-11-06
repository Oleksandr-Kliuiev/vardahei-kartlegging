// 2.20: conversations stay out of the survey data paths (aggregates, snapshots, the client CSV, the
// assistant, Atlas). Only the interviews module reads their tables; retention reaches them through it.
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

/** A Prisma call on a conversation table, or SQL naming one. */
const TABLES =
  /\.(?:interview|interviewAnswer|interviewRound)\s*\.\s*(?:find|create|update|upsert|delete|count|aggregate|groupBy)|\binterview_(?:answer|round)\b|\bFROM\s+"?interview"?\b/i;

describe('conversations stay in their own module (2.20)', () => {
  it('only the interviews module touches the conversation tables', () => {
    expect(
      files
        .filter((f) => TABLES.test(f.text))
        .map((f) => f.path)
        .sort(),
    ).toEqual([
      'modules/interviews/interview-retention.ts',
      'modules/interviews/interviews.service.ts',
    ]);
  });

  it('outside it, only the app module and retention (forget, ledger, handover) import it', () => {
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
    ]);
  });
});
