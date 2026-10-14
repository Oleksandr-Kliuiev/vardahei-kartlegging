import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const doc = readFileSync(resolve('../../../docs/varde/runbooks/cutover.md'), 'utf8');
const checklist = readFileSync(resolve('../../../docs/varde/evidence/stage-1/cutover.md'), 'utf8');
it('runbook covers the operational gates, rollback and archive deletion', () => {
  for (const term of [
    'T−1',
    'четыре проверки pg_hba',
    '§9 п. 5',
    'age-keygen',
    '0600',
    'diff -u',
    '--force-recreate',
    'printenv KARTLEGGING_LESEMODUS',
    'api/framdrift',
    '409',
    '(2a)',
    'pg_dump',
    'pg_restore',
    '--single-transaction',
    'go/no-go',
    'jq -s',
    'Soner',
    'SHA256SUMS',
    'scp',
    'test ! -e',
    'same',
    'validate',
    'reload',
    '--exclude private/runde1.js',
    'archive-restored',
    'archive-deleted',
    'register-archive',
    'set-report-date',
    '(r1)',
    '(r2)',
    '(r3)',
    '(r4)',
    '(r5)',
  ].filter((s) => s !== 'same'))
    expect(doc, term).toContain(term);
  expect(doc).toMatch(/только блок kartlegging/);
  expect(doc).toContain('Ответы Varde не откатываются');
});
it('pending checklist requires signatures, three flag checks and a verified archive', () => {
  for (const term of [
    'pending',
    'Подпись Oleksandr',
    'printenv=1',
    'framdrift {}=410',
    'открыть=409',
    'response=0',
    'aggregate_snapshot=0',
    'расшифровкой',
    'Шифротекст на VPS удалён',
    'Приём в kartlegging после rollback не открывается',
    'snittscore',
    'kritisk andel',
    'archive-deleted',
  ])
    expect(checklist, term).toContain(term);
});
it('no actual key, credential, initials or legacy access code in either document', () => {
  expect(doc + checklist).not.toMatch(
    /AGE-SECRET-KEY-|-----BEGIN .*PRIVATE KEY|postgresql:\/\/[^\s]+:[^\s]+@|[?&]t=[A-Za-z0-9_-]{10,}|SESSION_SECRET=['"][^<]/,
  );
});
