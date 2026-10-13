import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** varde/config relative to this file (src/config or dist/config inside apps/api). */
const DEFAULT_CONFIG_DIR = resolve(__dirname, '../../../../config');

/** Directory with varde/config/*.json; `/out/config` in the image (VARDE_CONFIG_DIR). */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.VARDE_CONFIG_DIR;
  return dir === undefined || dir === '' ? DEFAULT_CONFIG_DIR : dir;
}

/** Parsed JSON file from the config directory. */
export function readConfigJson(name: string, env: NodeJS.ProcessEnv = process.env): unknown {
  return JSON.parse(readFileSync(join(configDir(env), name), 'utf8')) as unknown;
}
