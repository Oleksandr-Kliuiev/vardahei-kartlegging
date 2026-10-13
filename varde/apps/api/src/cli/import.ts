// `node dist/cli.js import svar --file <path> [--dry-run]` (1.8) and `import runde1 …` (1.9):
// prints the manifest counts as JSON — never initials or answers.
import { readFileSync } from 'node:fs';
import { SvarImportService } from '../modules/imports/svar-import.js';
import { flags, withContext } from './context.js';

export async function importCommand(args: string[]): Promise<number> {
  const [source, ...rest] = args;
  const f = flags(rest, ['file'], ['dry-run']);
  const text = readFileSync(f.file ?? '', 'utf8');
  const dryRun = f['dry-run'] === 'true';
  if (source !== 'svar') throw new Error('usage: import svar|runde1 --file <path> [--dry-run]');
  const m = await withContext((get) =>
    get(SvarImportService).importSvar(text, { who: 'cli:import', dryRun }),
  );
  process.stdout.write(
    `${JSON.stringify({ status: m.status, dry_run: m.dry_run, manifest: m.id, counts: m.counts, rejected: m.rejected })}\n`,
  );
  return 0;
}
