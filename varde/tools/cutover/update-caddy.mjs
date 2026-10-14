#!/usr/bin/env node
// Replace only the named site block, retaining inode, permissions and unrelated Atlas edits.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** @param {string} text @param {string} block @returns {string} */
export function replaceBlock(text, block) {
  const start = /^kartlegging\.vardahei\.tech\s*\{/m.exec(text)?.index;
  if (start === undefined) throw new Error('kartlegging block missing');
  let depth = 0,
    end = -1,
    quote = false,
    comment = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (comment) {
      if (c === '\n') comment = false;
      else continue;
    }
    if (c === '#' && !quote) {
      comment = true;
      continue;
    }
    if (c === '"' && text[i - 1] !== '\\') quote = !quote;
    if (quote) continue;
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  if (end < 0) throw new Error('unclosed kartlegging block');
  return text.slice(0, start) + block.trimEnd() + text.slice(end);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [file, block, ...extra] = process.argv.slice(2);
  if (!file || !block || extra.length)
    throw new Error('usage: update-caddy.mjs <Caddyfile> <site-block>');
  const current = readFileSync(file, 'utf8');
  const next = replaceBlock(current, readFileSync(block, 'utf8'));
  writeFileSync(file, next); // truncates the existing file; does not rename/unlink a bind mount
}
