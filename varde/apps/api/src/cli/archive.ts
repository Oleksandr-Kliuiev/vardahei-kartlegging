// `node dist/cli.js archive restore --file <path>` (5.2): restores a round archive into the
// database of DATABASE_URL (empty and migrated, or one that already holds the same parents);
// prints the outcome and counts. A repeated restore of the same archive prints `unchanged`.
import { readFileSync } from 'node:fs';
import { RoundArchiveService } from '../modules/exports/round-archive.service.js';
import { flags, withContext } from './context.js';

export async function archiveCommand(args: string[]): Promise<number> {
  if (args[0] !== 'restore') throw new Error('usage: archive restore --file <path>');
  const f = flags(args.slice(1), ['file']);
  const input = JSON.parse(readFileSync(f.file ?? '', 'utf8')) as unknown;
  const result = await withContext((get) =>
    get(RoundArchiveService).restore(input, 'cli:archive-restore'),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
}
