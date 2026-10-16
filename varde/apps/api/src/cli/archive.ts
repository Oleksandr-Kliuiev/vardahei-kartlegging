// `node dist/cli.js archive restore --file <path> [--sha256 <hex>]` (5.2): restores a round
// archive into the database of DATABASE_URL (empty and migrated, or one that already holds the
// same parents); prints the outcome and counts. A repeated restore prints `unchanged`.
// `--sha256`: the hash from the AuditLog entry of the export; without it the hash of the file
// only shows that the file is whole.
import { readFileSync } from 'node:fs';
import { RoundArchiveService } from '../modules/exports/round-archive.service.js';
import { flags, withContext } from './context.js';

const USAGE = 'usage: archive restore --file <path> [--sha256 <hex>]';

export async function archiveCommand(args: string[]): Promise<number> {
  if (args[0] !== 'restore') throw new Error(USAGE);
  const rest = args.slice(1);
  const at = rest.indexOf('--sha256');
  const expected = at < 0 ? undefined : rest.splice(at, 2)[1];
  if (at >= 0 && !/^[0-9a-f]{64}$/.test(expected ?? '')) throw new Error(USAGE);
  const f = flags(rest, ['file']);
  const input = JSON.parse(readFileSync(f.file ?? '', 'utf8')) as unknown;
  const result = await withContext((get) =>
    get(RoundArchiveService).restore(input, 'cli:archive-restore', expected),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
}
