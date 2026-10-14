import { ArchiveService } from '../modules/cutover/archive.service.js';
import { withContext } from './context.js';

export async function cutoverCommand(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  const result = await withContext(async (get) => {
    const a = get(ArchiveService);
    if (command === 'archive-deleted' || command === 'archive-restored') {
      if (rest.length) throw new Error('unexpected arguments');
      return a.mark(command);
    }
    if (command === 'set-report-date' && rest.length === 1) return a.report(rest[0]!);
    if (command === 'register-archive') {
      const f: Record<string, string> = {};
      for (let i = 0; i < rest.length; i += 2) {
        const name = rest[i]?.replace(/^--/, '');
        const value = rest[i + 1];
        if (!name || !['sha256', 'cutover-date', 'report-date'].includes(name) || !value || f[name])
          throw new Error('invalid archive flags');
        f[name] = value;
      }
      if (!f.sha256 || !f['cutover-date']) throw new Error('missing archive flags');
      return a.register(f.sha256, f['cutover-date'], f['report-date']);
    }
    throw new Error(
      'usage: cutover register-archive --sha256 <hex> --cutover-date <date> [--report-date <date>] | set-report-date <date> | archive-deleted | archive-restored',
    );
  });
  process.stdout.write(JSON.stringify(result) + '\n');
  return 0;
}
