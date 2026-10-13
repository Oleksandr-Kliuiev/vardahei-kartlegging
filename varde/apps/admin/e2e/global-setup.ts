// e2e stack (0.7b): the mock Entra issuer and the built api (node apps/api/dist/main.js) on
// Postgres from DATABASE_URL (migrated), with a client certificate generated for this run.
import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clientCertificate, MockOidc } from '../../api/test/support/mock-oidc.js';

export const API_PORT = 3100;
export const ADMIN_GROUP = '00000000-0000-4000-8000-00000000e2e0';
const API_MAIN = fileURLToPath(new URL('../../api/dist/main.js', import.meta.url));

async function waitForHealth(url: string, api: ChildProcess): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    if (api.exitCode !== null) throw new Error(`api exited with ${api.exitCode}`);
    try {
      if ((await fetch(url)).status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`api did not become healthy: ${url}`);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!existsSync(API_MAIN)) throw new Error('build the api first: pnpm --filter @varde/api build');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL (migrated) is required for e2e');
  const cert = clientCertificate();
  const mock = new MockOidc(cert.certFile);
  await mock.start();
  const publicUrl = `http://127.0.0.1:${API_PORT}`;
  const api = spawn(process.execPath, [API_MAIN], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      PORT: String(API_PORT),
      ENTRA_TENANT_ID: mock.tenant,
      ENTRA_CLIENT_ID: mock.clientId,
      ENTRA_CLIENT_KEY_FILE: cert.keyFile,
      ENTRA_CLIENT_CERT_FILE: cert.certFile,
      VARDE_ADMIN_GROUP_ID: ADMIN_GROUP,
      SESSION_SECRET: randomBytes(32).toString('hex'),
      PUBLIC_URL: publicUrl,
      VARDE_OIDC_ISSUER: mock.issuer,
    },
  });
  await waitForHealth(`${publicUrl}/health`, api);
  process.env.MOCK_OIDC_ORIGIN = mock.origin;
  return async () => {
    api.kill('SIGTERM');
    await mock.stop();
    rmSync(cert.dir, { recursive: true, force: true });
  };
}
