import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditTarget, auditWhat, auditWhen, auditWho } from '../src/audit-labels.js';

const names = {
  rounds: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Runde 1',
      round_clients: [{ id: '22222222-2222-4222-8222-222222222222', client: { name: 'Daco' } }],
    },
  ],
};

describe('audit labels', () => {
  it('turns keys into readable text and keeps unknown keys visible', () => {
    expect(auditWhat('rounds.close')).toBe('Runde avslutta');
    expect(auditWhat('something.new')).toBe('something.new');
    expect(auditWho('system')).toBe('Systemet');
    expect(auditWho('entra:oid-1')).toBe('entra:oid-1');
  });
  it('names rounds and clients instead of showing UUIDs', () => {
    expect(auditTarget('round:11111111-1111-4111-8111-111111111111', names)).toBe('Runde Runde 1');
    expect(auditTarget('round_client:22222222-2222-4222-8222-222222222222', names)).toBe(
      'Daco · Runde 1',
    );
    expect(auditTarget('round:99999999-9999-4999-8999-999999999999', names)).toBe('Runde');
    expect(auditTarget(null, names)).toBe('');
    expect(auditTarget('thing:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', names)).toBe('thing:…');
  });
  it('formats the time the same in every locale', () => {
    expect(auditWhen(new Date(2026, 9, 13, 8, 5).toISOString())).toBe('13.10.2026 08:05');
    expect(auditWhen('not a date')).toBe('not a date');
  });
});

/**
 * Every action the server writes to the journal needs Norwegian words; a raw key would show.
 * Two shapes reach the column: a literal `what: 'rounds.close'`, and a key a service builds from
 * its own prefix and the word a call site passes — `what: \`surveys.${what}\`` with
 * `this.audit(tx, who, 'trash', id)` somewhere else in the same file. The second shape is what
 * «surveys.trash» slipped through as, raw, in production on 09.11.
 */
const LANGS = ['nn', 'en', 'nb'];
function serverActions(): string[] {
  // Vitest runs from apps/admin, so the server's sources lie beside it.
  const root = resolve(process.cwd(), '../api/src');
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const source = readFileSync(path, 'utf8');
      for (const m of source.matchAll(/what: *'([a-z_][a-z_.]*)'/g)) found.add(m[1]!);
      const prefixes = [...source.matchAll(/what: *`([a-z_][a-z_.]*)\.\$\{/g)].map((m) => `${m[1]!}.`);
      if (!prefixes.length) continue;
      const suffixes = [
        ...source.matchAll(
          /\b(?:this\.)?audit\((?:[^()]*?,)?\s*[^,()]*,\s*[^,()]*,\s*[`']([a-z_][a-z_.${}]*)[`']/g,
        ),
      ].map((m) => m[1]!);
      for (const prefix of prefixes)
        for (const suffix of suffixes)
          if (!suffix.includes('${')) found.add(prefix + suffix);
          else if (suffix.includes('${lang}'))
            for (const lang of LANGS) found.add(prefix + suffix.replace('${lang}', lang));
    }
  };
  walk(root);
  return [...found].sort();
}

describe('the journal has words for every action', () => {
  it('leaves no raw key from the server without Norwegian text', () => {
    const actions = serverActions();
    expect(actions.length).toBeGreaterThan(40);
    expect(actions.filter((a) => auditWhat(a) === a)).toEqual([]);
  });
});
