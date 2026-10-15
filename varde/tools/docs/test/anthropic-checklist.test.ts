// Task 0.13: checklist of the Anthropic API conditions (ADR-010, 0d.md) and the draft entry of
// the processing register. Default mode: every required item is a row, its status is pending,
// ok or fail, and a confirmed row names its evidence (green while Oleksandr confirms).
// Strict mode for gate G0 — `pnpm --filter @varde/tools-docs test -- anthropic-checklist
// --require-complete` (or VARDE_REQUIRE_COMPLETE=1): no pending or fail, every row has a link or
// a screenshot, every named screenshot exists, confirmer and date are filled.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findBokmal } from '@varde/schema/i18n/nn-stoplist';
import { describe, expect, inject, it } from 'vitest';
import { readDoc, REPO, tableRows } from './support.js';

const EVIDENCE = 'docs/varde/evidence/stage-0';
const checklist = readDoc(`${EVIDENCE}/0.13-anthropic-checklist.md`);
const register = readDoc('docs/varde/personvern/behandlingsregister-varde.md');

/** Items of ADR-010 (decision, lines 1–4) and 0d.md §0.13. */
const REQUIRED = [
  'org',
  'terms',
  'dpa',
  'retention',
  'zdr',
  'location',
  'models',
  'access',
  'key',
  'spend',
];
const STATUSES = ['pending', 'ok', 'fail'];
/** Hosts of Anthropic's own documents. */
const ANTHROPIC_HOSTS =
  /^https:\/\/(www\.anthropic\.com|trust\.anthropic\.com|platform\.claude\.com|privacy\.claude\.com|support\.claude\.com)\//;
const DATE = /\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}/;

interface Row {
  id: string;
  evidence: string;
  status: string;
  who: string;
}

const rows: Row[] = tableRows(checklist).map((line) => {
  const [id = '', , evidence = '', status = '', who = ''] = line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
  return { id: id.replace(/`/g, ''), evidence, status: status.replace(/`/g, ''), who };
});
const links = (text: string): string[] => text.match(/https:\/\/[^\s)]+/g) ?? [];
const screenshots = (text: string): string[] =>
  text.match(/0\.13\/[\w.-]+\.(?:png|jpe?g|webp|pdf)/g) ?? [];

describe('0.13 Anthropic checklist (default mode)', () => {
  it('has one row per required ADR-010 item', () => {
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of REQUIRED) expect(ids, id).toContain(id);
  });

  it('every status is pending, ok or fail; a row that is not pending names its evidence', () => {
    for (const row of rows) {
      expect(STATUSES, row.id).toContain(row.status);
      if (row.status !== 'pending') {
        expect(
          links(row.evidence).length + screenshots(row.evidence).length,
          row.id,
        ).toBeGreaterThan(0);
        expect(row.who, row.id).toMatch(DATE);
      }
    }
  });

  it('links go to Anthropic documents and carry the date they were checked', () => {
    for (const row of rows)
      for (const url of links(row.evidence)) {
        expect(url, row.id).toMatch(ANTHROPIC_HOSTS);
        expect(row.evidence, row.id).toMatch(/проверено \d{2}\.\d{2}\.\d{4}/);
      }
  });

  it('states the screenshot rule in the header', () => {
    const header = checklist.split('\n| ID |')[0] ?? '';
    for (const rule of [
      'никаких снимков с ключами API',
      'organization id и e-mail учёток замазаны',
      'Oleksandr проверяет каждый файл перед коммитом',
      'gitleaks изображения не сканирует',
    ])
      expect(header, rule).toContain(rule);
  });

  it('contains no key, e-mail address or organization id', () => {
    expect(checklist).not.toMatch(/sk-ant-|[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(checklist).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe('0.13 draft entry of the processing register', () => {
  const entry = register.split('\n## ')[0] ?? '';

  it('names roles, data, purpose, recipient, retention, transfer and measures', () => {
    for (const part of [
      'behandlingsansvarleg',
      'databehandlar',
      'underdatabehandlar',
      '**Føremål:**',
      '**Opplysningar modellen får:**',
      '**Opplysningar modellen aldri får:** Initialar, respondentnøkkel',
      '**Mottakar:** Anthropic',
      '**Lagring hos leverandøren:**',
      '**Overføring til tredjeland:**',
      '**Tiltak:**',
    ])
      expect(entry, part).toContain(part);
  });

  it('is nynorsk without bokmål forms, with notes for Oleksandr after it', () => {
    expect(findBokmal(entry)).toEqual([]);
    expect(register).toContain('\n## Пометки для Oleksandr');
  });
});

const strict = inject('requireComplete');

describe('0.13 strict mode (--require-complete, gate G0)', () => {
  it.runIf(strict)('no pending or fail; links or existing screenshots; confirmer and date', () => {
    for (const row of rows) {
      expect(row.status, row.id).toBe('ok');
      const shots = screenshots(row.evidence);
      expect(links(row.evidence).length + shots.length, row.id).toBeGreaterThan(0);
      for (const shot of shots) expect(existsSync(join(REPO, EVIDENCE, shot)), shot).toBe(true);
      expect(row.who, row.id).toMatch(DATE);
    }
  });
});
