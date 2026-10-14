// Builds current sources because pnpm check runs tests before workspace builds.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { expect, it } from 'vitest';

it('current runner JavaScript bundle is at most 100 KB gzipped', async () => {
  await build({ root: resolve(import.meta.dirname, '..'), logLevel: 'silent' });
  const dir = resolve(import.meta.dirname, '../dist/assets');
  const scripts = readdirSync(dir).filter((f) => f.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(0);
  const size = scripts.reduce((bytes, file) => bytes + gzipSync(readFileSync(resolve(dir, file))).length, 0);
  expect(size).toBeLessThanOrEqual(100 * 1024);
}, 30_000);
