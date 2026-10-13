// `node dist/cli.js seed --clients <path> --kundar <path> --tilgang <path>` (1.7): clients,
// templates and import rounds; prints counters only (never codes).
import { readFileSync } from 'node:fs';
import { configDir } from '../config/config-dir.js';
import {
  type Kundar,
  type SeedClient,
  seedDirOf,
  SeedService,
  type Tilgang,
} from '../modules/rounds/seed.service.js';
import { flags, withContext } from './context.js';

const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

export async function seedCommand(args: string[]): Promise<number> {
  const f = flags(args, ['clients', 'kundar', 'tilgang']);
  const result = await withContext((get) =>
    get(SeedService).seedAll({
      clients: json<SeedClient[]>(f.clients ?? ''),
      kundar: json<Kundar>(f.kundar ?? ''),
      tilgang: json<Tilgang>(f.tilgang ?? ''),
      seedDir: seedDirOf(configDir()),
      who: 'cli:seed',
    }),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
}
