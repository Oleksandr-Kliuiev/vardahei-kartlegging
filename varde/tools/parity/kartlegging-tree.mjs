// Hash pending legacy changes without modifying this worktree's index or object store.
// Unchanged personal-data blobs are referenced by Git identity, never opened.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { REPO } from './bank.mjs';

export function kartleggingTree() {
  const git = (args, env) =>
    execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', env }).trim();
  const changed = git(['diff', '--name-only', 'HEAD', '--', 'kartlegging'], process.env)
    .split('\n')
    .filter(Boolean);
  if (!changed.length) return git(['rev-parse', 'HEAD:kartlegging'], process.env);
  if (
    changed.some((p) => p.startsWith('kartlegging/data/') || p === 'kartlegging/private/runde1.js')
  )
    throw new Error('protected data changed; cannot refresh golden manifest');
  const dir = mkdtempSync(join(tmpdir(), 'varde-golden-index-'));
  mkdirSync(join(dir, 'objects'));
  const common = resolve(REPO, git(['rev-parse', '--git-common-dir'], process.env));
  const env = {
    ...process.env,
    GIT_INDEX_FILE: join(dir, 'index'),
    GIT_OBJECT_DIRECTORY: join(dir, 'objects'),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: join(common, 'objects'),
  };
  try {
    git(['read-tree', 'HEAD'], env);
    git(['add', '--', ...changed], env);
    const tree = git(['write-tree'], env);
    return git(['rev-parse', `${tree}:kartlegging`], env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
