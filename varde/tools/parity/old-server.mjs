// The old kartlegging server on synthetic data (1.2c; also used by 1.13c–e and 1.34).
// A temporary copy of kartlegging/ without data/ and private/runde1.js (real answers are never
// copied or read), the synthetic runde1.js in private/, a temporary DATA_DIR and a test account
// whose scrypt hash (format of server.js 39–42) comes through INIT_BRUKARAR, as on the VPS.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KARTLEGGING } from './bank.mjs';

/** The account tools/test/stotte.js logs in with. */
export const EPOST = 'oleksandr@vardahei.no';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export function copyKartlegging(dest) {
  execFileSync('rsync', [
    '-a',
    '--exclude',
    'data/',
    '--exclude',
    'private/runde1.js',
    KARTLEGGING,
    dest,
  ]);
}

async function waitFor(url, ms = 15_000) {
  const until = Date.now() + ms;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > until) throw new Error(`old server did not answer ${url}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * @param {{ svar: string, runde1: string, tilgang: string, kundar: string }} files contents
 * @returns {Promise<{ base: string, password: string, epost: string, root: string, stop: () => Promise<void> }>}
 */
export async function startOldServer(files) {
  const root = mkdtempSync(join(tmpdir(), 'varde-old-kartlegging-'));
  const app = join(root, 'kartlegging');
  const data = join(root, 'data');
  copyKartlegging(`${app}/`);
  writeFileSync(join(app, 'private', 'runde1.js'), files.runde1);
  mkdirSync(data);
  writeFileSync(join(data, 'svar.jsonl'), files.svar);
  writeFileSync(join(data, 'tilgang.json'), files.tilgang);
  writeFileSync(join(data, 'kundar.json'), files.kundar);
  const password = randomBytes(18).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: app,
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: data,
      BASE_URL: base,
      INIT_BRUKARAR: JSON.stringify({ [EPOST]: { salt, hash, maaByte: false } }),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
    }
    rmSync(root, { recursive: true, force: true });
  };
  try {
    await waitFor(`${base}/healthz`);
  } catch (error) {
    await stop();
    throw error;
  }
  return { base, password, epost: EPOST, root, stop };
}
