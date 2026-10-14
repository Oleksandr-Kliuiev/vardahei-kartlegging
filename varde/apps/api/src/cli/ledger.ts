import { DeletionLedger } from '../modules/retention/ledger.js';
import { withContext } from './context.js';

export async function ledgerCommand(args: string[]): Promise<number> {
  const result = await withContext(async (get) => {
    const ledger = get(DeletionLedger);
    if (args.join(' ') === 'tombstones --format kartlegging')
      return ledger.tombstonesForKartlegging();
    if (args.join(' ') === 'apply-db') return { removed: await ledger.apply() };
    throw new Error('usage: ledger tombstones --format kartlegging | ledger apply-db');
  });
  process.stdout.write(JSON.stringify(result) + '\n');
  return 0;
}
