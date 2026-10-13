// Invariant of checkpoint 0c (0.19b): the serialised output of every public function of
// `privacy` except the class `rows` (and its views) carries no row data on the fixture data of
// both modes; suppressed and stale cells carry no numbers beyond the previous released value;
// `leaders_all` never appears in aggregate() for round_client / all_clients.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  type AggregateQuery,
  type ComputedCell,
  PrivacyService,
} from '../../src/modules/privacy/privacy.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  FIXTURE_INITIALS,
  FixtureSource,
  ROUND_ANONYMOUS,
  ROUND_INITIALS,
} from '../support/fixture-source.js';
import { MemorySnapshotStore } from '../support/memory-snapshot-store.js';

const FORBIDDEN = ['respondent_key', 'answers', 'submission_id', 'fritekst', ...FIXTURE_INITIALS];
// Metric name as a constant: `key: '<dotted name>'` literals look like API keys to gitleaks.
const F12_JA = 'tryggleik.f12_ja';
const NUMBERS = ['n', 'numerator', 'denominator', 'missing'];
const CONFIG = { k: 3, exact_counts: ['responses_total'] };
const prisma = { auditLog: { create: () => Promise.resolve({}) } } as unknown as PrismaService;

const service = () => new PrivacyService(prisma, new FixtureSource(), CONFIG);

/** Every aggregate query the fixture allows, for both rounds (modes). */
function queries(): AggregateQuery[] {
  const out: AggregateQuery[] = [];
  for (const round of [ROUND_INITIALS, ROUND_ANONYMOUS]) {
    for (const option of ['ja', 'nei', 'delvis']) {
      for (const client of ['kunde-a', 'kunde-b']) {
        out.push({
          round,
          population: 'round_client',
          part: 'common',
          client,
          question: 'F12',
          option,
        });
      }
      out.push({ round, population: 'all_clients', part: 'common', question: 'F12', option });
    }
    for (const option of ['skrive', 'nei']) {
      out.push({ round, population: 'leaders_all', part: 'leader', question: 'B13', option });
    }
  }
  return out;
}

const keysOf = (value: unknown): string[] => {
  const keys: string[] = [];
  JSON.stringify(value, (k, v: unknown) => {
    if (k !== '') keys.push(k);
    return v;
  });
  return keys;
};

describe('0c: no leak keys in privacy outputs (0.19b)', () => {
  it('aggregate() in both modes: no row keys, initials or free text', async () => {
    for (const q of queries()) {
      const text = JSON.stringify(await service().aggregate(q));
      for (const word of FORBIDDEN) expect(text, `${q.round} ${q.population}`).not.toContain(word);
    }
  });

  it('aggregate(): suppressed cells have no n, numerator, denominator, missing', async () => {
    let suppressed = 0;
    for (const q of queries()) {
      for (const cell of (await service().aggregate(q)).cells) {
        if (!cell.suppressed) continue;
        suppressed += 1;
        expect(keysOf(cell).filter((k) => NUMBERS.includes(k))).toEqual([]);
      }
    }
    expect(suppressed).toBeGreaterThan(0);
  });

  it('aggregate() for round_client / all_clients never mentions leaders_all', async () => {
    for (const q of queries().filter((x) => x.population !== 'leaders_all')) {
      expect(JSON.stringify(await service().aggregate(q))).not.toContain('leaders_all');
    }
  });

  it('release(): no row data; suppressed cells carry zeros, stale cells only the previous released values', async () => {
    const store = new MemorySnapshotStore();
    const privacy = service();
    const cell = (group: string, n: number, numerator: number): ComputedCell => ({
      client: 'kunde-a',
      metric_key: F12_JA,
      metric_version: 1,
      group,
      n,
      numerator,
      denominator: n,
      missing: 0,
    });
    const actor = { type: 'auto', who: 'system' } as const;
    const first = await privacy.release(
      ROUND_INITIALS,
      'round_client',
      [cell('all', 5, 3), cell('role:sal', 3, 2), cell('role:kontor', 2, 1)],
      store,
      actor,
    );
    const second = await privacy.release(
      ROUND_INITIALS,
      'round_client',
      [cell('all', 6, 4), cell('role:sal', 4, 3), cell('role:kontor', 2, 1)],
      store,
      actor,
    );
    for (const r of [first, second]) {
      const text = JSON.stringify(r);
      for (const word of FORBIDDEN) expect(text).not.toContain(word);
      for (const s of r.released) {
        if (s.suppressed) {
          expect([s.n, s.numerator, s.denominator, s.missing]).toEqual([0, 0, 0, 0]);
        }
      }
    }
    for (const s of second.released.filter((x) => x.stale === true)) {
      const prev = first.released.find((p) => p.group === s.group);
      expect([s.n, s.numerator, s.denominator, s.missing]).toEqual([
        prev?.n,
        prev?.numerator,
        prev?.denominator,
        prev?.missing,
      ]);
    }
    expect(second.released.some((s) => s.stale === true)).toBe(true);
  });
});
