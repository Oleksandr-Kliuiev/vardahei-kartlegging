import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { clientCertificate, MockOidc } from '../../apps/api/test/support/mock-oidc.js';
import { startOldServer } from '../parity/old-server.mjs';

const cert = clientCertificate(),
  mock = new MockOidc(cert.certFile);
await mock.start();
const group = '00000000-0000-4000-8000-00000000e2e0';
mock.scenario = { groups: [group], name: 'Syntetisk admin' };
const api = spawn(process.execPath, [resolve('tools/staging/server.cjs')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ENTRA_TENANT_ID: mock.tenant,
    ENTRA_CLIENT_ID: mock.clientId,
    ENTRA_CLIENT_KEY_FILE: cert.keyFile,
    ENTRA_CLIENT_CERT_FILE: cert.certFile,
    VARDE_ADMIN_GROUP_ID: group,
    SESSION_SECRET: randomBytes(32).toString('hex'),
    PUBLIC_URL: 'http://localhost:3000',
    VARDE_OIDC_ISSUER: mock.issuer,
  },
});
const fixture = (name: string) => readFileSync(resolve('tools/parity/fixtures', name), 'utf8');
const old = await startOldServer({
  svar: fixture('svar.synthetic.jsonl'),
  runde1: fixture('runde1.synthetic.js'),
  tilgang: fixture('tilgang.json'),
  kundar: fixture('kundar.json'),
});
writeFileSync(resolve(process.env.VARDE_STAGING_DIR!, 'old-url'), old.base, { mode: 0o600 });
writeFileSync(
  resolve(process.env.VARDE_STAGING_DIR!, 'old-login.json'),
  JSON.stringify({ base: old.base, user: old.epost, password: old.password }),
  { mode: 0o600 },
);
let stopping = false;
const token = randomBytes(24).toString('hex');
const control = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/stop/' + token) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(202).end();
  void stop();
});
await new Promise<void>((resolve) => control.listen(0, '127.0.0.1', resolve));
writeFileSync(
  resolve(process.env.VARDE_STAGING_DIR!, 'control-url'),
  'http://127.0.0.1:' + (control.address() as AddressInfo).port + '/stop/' + token,
  { mode: 0o600 },
);
async function stop() {
  if (stopping) return;
  stopping = true;
  control.close();
  api.kill('SIGTERM');
  await old.stop();
  await mock.stop();
  rmSync(cert.dir, { recursive: true, force: true });
  process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    void stop();
  });
api.once('exit', (code) => {
  void code;
  if (!stopping) void stop();
});
