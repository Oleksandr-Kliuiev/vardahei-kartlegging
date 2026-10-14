import { RetentionRun } from '../modules/retention/run.service.js';
import { withContext } from './context.js';

export async function retentionCommand(args: string[]): Promise<number> {
  if (args[0] !== 'run' || args.slice(1).some((a) => a !== '--dry-run') || args.length > 2)
    throw new Error('usage: retention run [--dry-run]');
  const result = await withContext((get) => get(RetentionRun).run(args.includes('--dry-run')));
  process.stdout.write(JSON.stringify(result) + '\n');
  return 0;
}
