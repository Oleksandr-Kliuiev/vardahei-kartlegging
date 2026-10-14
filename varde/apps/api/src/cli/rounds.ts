// `node dist/cli.js rounds close --imported` (1.10): closes the import rounds of ok manifests
// (including the anonymous KI 2026-10-12 round) and releases their snapshots; prints counts.
import { configDir } from '../config/config-dir.js';
import { MetricsService } from '../modules/metrics/metrics.service.js';
import { seedDirOf } from '../modules/rounds/seed.service.js';
import { withContext } from './context.js';

export async function roundsCommand(args: string[]): Promise<number> {
  if (args[0] !== 'close' || args[1] !== '--imported' || args.length !== 2) {
    throw new Error('usage: rounds close --imported');
  }
  const result = await withContext((get) =>
    get(MetricsService).closeImported(seedDirOf(configDir())),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
}
