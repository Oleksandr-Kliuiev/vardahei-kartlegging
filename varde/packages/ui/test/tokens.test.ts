import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8');
const tokens = read('tokens.css');
const base = read('base.css');
const defs = (css: string) =>
  new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
const block = (css: string, head: string) => {
  const start = css.indexOf(head);
  expect(start, head).toBeGreaterThan(-1);
  const open = css.indexOf('{', start + head.length - 1);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed ${head}`);
};

describe('tokens.css', () => {
  it('keeps the brand colours from the logo', () => {
    const all = defs(tokens);
    expect(all.get('--blaa-600')).toBe('#236e91');
    expect(all.get('--graa-800')).toBe('#3f3f42');
    expect(all.get('--graa-600')).toBe('#6b6e70');
  });

  it('dark theme by system setting and by data-theme define the same values', () => {
    const media = defs(block(tokens, ':root:not([data-theme="light"]) {'));
    const attr = defs(block(tokens, ':root[data-theme="dark"] {'));
    expect([...media.entries()]).toEqual([...attr.entries()]);
    expect(media.size).toBeGreaterThan(40);
  });

  it('every zone has a colour and a background in both themes', () => {
    const light = defs(block(tokens, ':root {'));
    const dark = defs(block(tokens, ':root[data-theme="dark"] {'));
    for (const z of ['gron', 'gul', 'oransje', 'raud']) {
      for (const k of [`--sone-${z}`, `--sone-${z}-bg`]) {
        expect(light.has(k), k).toBe(true);
        expect(dark.has(k), k).toBe(true);
      }
    }
  });

  it('springs have a fallback for browsers without linear()', () => {
    expect(tokens).toMatch(
      /@supports not \(transition-timing-function: linear\(0, 1\)\)[\s\S]*--ease-fjor[\s\S]*--ease-sprett/,
    );
  });

  it('reduced motion stops endless loops', () => {
    expect(tokens).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*animation-iteration-count: 1 !important/,
    );
  });
});

describe('base.css', () => {
  it('uses only defined tokens', () => {
    const known = defs(tokens);
    const local = defs(base);
    const used = [...base.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!);
    expect(used.filter((v) => !known.has(v) && !local.has(v))).toEqual([]);
  });

  it('has a visible focus ring', () => {
    expect(base).toMatch(/:focus-visible\s*\{[^}]*outline: 2px solid var\(--focus\)/);
  });
});
