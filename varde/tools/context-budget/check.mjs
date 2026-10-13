#!/usr/bin/env node
// Context-budget (PRINCIPLES §11, ADR-018): files in varde/** over 700 lines fail, over 500 warn.
// Usage: node tools/context-budget/check.mjs [--selfcheck]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARD_LIMIT = 700;
export const SOFT_LIMIT = 500;
export const EXTENSIONS = ['ts', 'tsx', 'js', 'mjs', 'cjs', 'css', 'scss', 'sql', 'prisma'];
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);
/** Generated SQL has its own CLAUDE.md (0.4). */
const EXCLUDED_PATH = /(^|\/)prisma\/migrations(\/|$)/;

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const VARDE_ROOT = join(HERE, '..', '..');

/** @param {string} text */
export function countLines(text) {
  if (text === '') return 0;
  const lines = text.split('\n').length;
  return text.endsWith('\n') ? lines - 1 : lines;
}

/**
 * @param {string} root
 * @returns {{ over: { path: string, lines: number }[], warnings: { path: string, lines: number }[], scanned: number }}
 */
export function checkBudget(root) {
  /** @type {{ path: string, lines: number }[]} */
  const over = [];
  /** @type {{ path: string, lines: number }[]} */
  const warnings = [];
  let scanned = 0;
  const ext = new RegExp(`\\.(${EXTENSIONS.join('|')})$`);

  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(sep).join('/');
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name) || EXCLUDED_PATH.test(rel)) continue;
        walk(full);
      } else if (entry.isFile() && ext.test(entry.name)) {
        scanned += 1;
        const lines = countLines(readFileSync(full, 'utf8'));
        if (lines > HARD_LIMIT) over.push({ path: rel, lines });
        else if (lines > SOFT_LIMIT) warnings.push({ path: rel, lines });
      }
    }
  };
  walk(root);
  return { over, warnings, scanned };
}

/** @param {string} root */
function report(root) {
  const { over, warnings, scanned } = checkBudget(root);
  for (const w of warnings)
    console.warn(`warning: ${w.path} has ${w.lines} lines (> ${SOFT_LIMIT})`);
  for (const o of over) console.error(`error: ${o.path} has ${o.lines} lines (> ${HARD_LIMIT})`);
  console.log(`${scanned} files scanned, ${over.length} files over ${HARD_LIMIT}`);
  return over.length === 0 ? 0 : 1;
}

function selfcheck() {
  const dir = join(HERE, '.selfcheck');
  const file = join(dir, 'long.ts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    file,
    Array.from({ length: HARD_LIMIT + 1 }, (_, i) => `export const l${i} = ${i};`).join('\n') +
      '\n',
  );
  try {
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8' });
    if (
      run.status === 1 &&
      run.stderr.includes('tools/context-budget/.selfcheck/long.ts has 701 lines')
    ) {
      console.log('selfcheck: 701-line file rejected');
      return 0;
    }
    console.error(`selfcheck: FAILED (exit ${run.status})\n${run.stdout}${run.stderr}`);
    return 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(process.argv.includes('--selfcheck') ? selfcheck() : report(VARDE_ROOT));
}
