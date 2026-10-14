// e2e stack: mock Entra and a built API in a child CommonJS process (Node 22) on
// Postgres from DATABASE_URL (migrated), with a client certificate generated for this run.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { clientCertificate, MockOidc } from '../../api/test/support/mock-oidc.js';

export const API_PORT = 3100;
export const ADMIN_GROUP = '00000000-0000-4000-8000-00000000e2e0';
const API_MAIN = fileURLToPath(new URL('./server.cjs', import.meta.url));

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
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL (migrated) is required for e2e');
  const workspace = fileURLToPath(new URL('../../..', import.meta.url));
  for (const args of [
    ['--filter', '@varde/api', 'db:migrate'],
    ['--filter', '@varde/api...', 'build'],
    ['--filter', '@varde/runner', 'build'],
    ['--filter', '@varde/admin', 'build'],
  ])
    execFileSync('pnpm', args, { cwd: workspace, stdio: 'pipe' });
  const dir = mkdtempSync(resolve(tmpdir(), 'varde-admin-e2e-'));
  const cert = clientCertificate();
  const mock = new MockOidc(cert.certFile);
  await mock.start();
  const publicUrl = `http://127.0.0.1:${API_PORT}`;
  const sessionSecret = randomBytes(32).toString('hex');
  const start = () =>
    spawn(process.execPath, [API_MAIN], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: {
        ...process.env,
        PORT: String(API_PORT),
        ENTRA_TENANT_ID: mock.tenant,
        ENTRA_CLIENT_ID: mock.clientId,
        ENTRA_CLIENT_KEY_FILE: cert.keyFile,
        ENTRA_CLIENT_CERT_FILE: cert.certFile,
        VARDE_ADMIN_GROUP_ID: ADMIN_GROUP,
        SESSION_SECRET: sessionSecret,
        PUBLIC_URL: publicUrl,
        VARDE_OIDC_ISSUER: mock.issuer,
        ADMIN_E2E_STATE_FILE: resolve(dir, 'state.json'),
      },
    });
  let api = start();
  await waitForHealth(`${publicUrl}/health`, api);
  process.env.MOCK_OIDC_ORIGIN = mock.origin;
  // Restart the child abruptly to exercise real EventSource reconnection and preserve fixtures.
  const control = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/restart') {
      response.writeHead(404).end();
      return;
    }
    void (async () => {
      const exited = new Promise<void>((done) =>
        api.once('exit', () => {
          done();
        }),
      );
      api.kill('SIGKILL');
      await exited;
      api = start();
      await waitForHealth(`${publicUrl}/health`, api);
      response.writeHead(204).end();
    })().catch(() => {
      response.writeHead(500).end();
    });
  });
  await new Promise<void>((done) => control.listen(3101, '127.0.0.1', done));
  return async () => {
    await new Promise<void>((done) =>
      control.close(() => {
        done();
      }),
    );
    const exited = new Promise<void>((done) =>
      api.once('exit', () => {
        done();
      }),
    );
    api.kill('SIGTERM');
    await exited;
    await mock.stop();
    rmSync(cert.dir, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  };
}
