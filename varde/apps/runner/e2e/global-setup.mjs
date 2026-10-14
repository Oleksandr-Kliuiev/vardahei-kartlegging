// Built API + synthetic seed/import fixtures, no Docker and no real data.
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

export default async function setup() {
  const workspace = resolve(import.meta.dirname, '../../..');
  const api = resolve(workspace, 'apps/api');
  const fixtures = resolve(workspace, 'tools/parity/fixtures');
  const run = (args) => execFileSync('pnpm', args, { cwd: workspace, stdio: 'pipe' });
  run(['--filter', '@varde/api', 'db:migrate']);
  run(['--filter', '@varde/api...', 'build']);
  run(['--filter', '@varde/runner', 'build']);
  const cli = (args) => execFileSync(process.execPath, [resolve(api, 'dist/cli.js'), ...args], {
    cwd: api, stdio: 'pipe',
  });
  cli(['seed', '--clients', resolve(workspace, 'config/seed/clients.json'), '--kundar', resolve(fixtures, 'kundar.json'), '--tilgang', resolve(fixtures, 'tilgang.json')]);
  cli(['import', 'svar', '--file', resolve(fixtures, 'svar.synthetic.jsonl')]);
  cli(['import', 'runde1', '--file', resolve(fixtures, 'runde1.synthetic.js')]);
  const child = spawn(process.execPath, [resolve(import.meta.dirname, 'server.cjs')], { cwd: api, stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise((done) => child.once('exit', done));
  await new Promise((ready, fail) => {
    const timer = setTimeout(() => fail(new Error('e2e server did not become ready in 90 s')), 90_000);
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('READY')) { clearTimeout(timer); ready(undefined); } });
    child.once('exit', (code) => { clearTimeout(timer); fail(new Error(`e2e server exited with ${String(code)}`)); });
  });
  return async () => { child.kill('SIGTERM'); await exited; };
}
