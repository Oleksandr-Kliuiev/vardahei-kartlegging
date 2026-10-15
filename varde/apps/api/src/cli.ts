// CLI of the api image: `node dist/cli.js break-glass-hash` (0.8), `seed` (1.7), `import` (1.8, 1.9), `rounds close --imported` (1.10), `archive restore` (5.2).
// Generates a ≥ 128-bit password, prints it once to stderr, and prints to stdout only the line
// VARDE_BREAK_GLASS_PASSWORD_HASH='$argon2id$…' (single quotes: Compose leaves $ alone), so
// stdout can be appended to app.env as is. Takes no input from argv besides the command.
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { archiveCommand } from './cli/archive.js';
import { cutoverCommand } from './cli/cutover.js';
import { ledgerCommand } from './cli/ledger.js';
import { retentionCommand } from './cli/retention.js';
import { importCommand } from './cli/import.js';
import { roundsCommand } from './cli/rounds.js';
import { seedCommand } from './cli/seed.js';

export const PASSWORD_BYTES = 24;

export async function breakGlassHash(): Promise<{ password: string; line: string }> {
  const password = randomBytes(PASSWORD_BYTES).toString('base64url');
  // @node-rs/argon2 default algorithm is Argon2id.
  const phc = await hash(password);
  return { password, line: `VARDE_BREAK_GLASS_PASSWORD_HASH='${phc}'` };
}

const USAGE = `usage: node dist/cli.js break-glass-hash
       node dist/cli.js seed --clients <path> --kundar <path> --tilgang <path>
       node dist/cli.js import svar|runde1 --file <path> [--dry-run]
       node dist/cli.js rounds close --imported
       node dist/cli.js archive restore --file <path>
`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === 'archive') return archiveCommand(rest);
  if (command === 'cutover') return cutoverCommand(rest);
  if (command === 'ledger') return ledgerCommand(rest);
  if (command === 'retention') return retentionCommand(rest);
  if (command === 'seed') return seedCommand(rest);
  if (command === 'import') return importCommand(rest);
  if (command === 'rounds') return roundsCommand(rest);
  if (command !== 'break-glass-hash' || rest.length > 0) {
    process.stderr.write(USAGE);
    return 2;
  }
  const { password, line } = await breakGlassHash();
  process.stderr.write(`break-glass password (shown once): ${password}\n`);
  process.stdout.write(`${line}\n`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(1);
    },
  );
}
