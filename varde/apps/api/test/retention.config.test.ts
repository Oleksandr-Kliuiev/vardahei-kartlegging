// Task 0.19: varde/config/retention.json loads; every class of ADR-017 (including the technical
// tables of stage 0) is present; responses have no timer; the backup window adds up.
import { describe, expect, it } from 'vitest';
import { readConfigJson } from '../src/config/config-dir.js';
import { readRetentionConfig, RetentionConfig } from '../src/modules/retention/retention.config.js';

const CLASSES = [
  'progress_event',
  'response',
  'aggregate_snapshot_released',
  'contact',
  'registration',
  'proposal',
  'audit_log',
  'deletion_ledger',
  'app_logs',
  'admin_session',
  'connection_log',
  'pgboss_jobs',
  'backup',
];

const raw = () =>
  structuredClone(readConfigJson('retention.json')) as {
    classes: Record<string, Record<string, unknown>>;
    external_copies: { name: string }[];
  };

const issues = (value: unknown): string => {
  const r = RetentionConfig.safeParse(value);
  expect(r.success).toBe(false);
  return r.error?.issues.map((i) => i.message).join('; ') ?? '';
};

describe('retention config (0.19)', () => {
  it('loads', () => {
    const config = readRetentionConfig();
    expect(config.classes.progress_event.ttl_hours).toBe(24);
    expect(config.classes.backup).toEqual({
      rotation_days: 35,
      recycle_bin_days: 93,
      effective_max_days: 128,
    });
  });

  it('has every class of ADR-017, including the technical tables of stage 0', () => {
    expect(Object.keys(readRetentionConfig().classes).sort()).toEqual([...CLASSES].sort());
  });

  it('lists the copies outside Varde, including restore-kopi', () => {
    expect(readRetentionConfig().external_copies.map((c) => c.name)).toEqual([
      'runde1-js-git',
      'master-analyse-xlsx',
      'kartlegging-data-backups',
      'cutover-archive',
      'varde-backup-copies',
      'restore-kopi',
    ]);
  });

  it('response with ttl_hours → rejected (responses have no timer)', () => {
    const c = raw();
    c.classes.response = { kind: 'on_request', ttl_hours: 24 };
    expect(issues(c)).toMatch(/response has no timer \(ttl_hours\)/);
  });

  it('response with ttl_months or without kind on_request → rejected', () => {
    const c = raw();
    c.classes.response = { kind: 'on_request', ttl_months: 18 };
    expect(issues(c)).toMatch(/no timer/);
    const d = raw();
    d.classes.response = { kind: 'forever' };
    issues(d);
  });

  it('inconsistent backup.effective_max_days → rejected', () => {
    const c = raw();
    c.classes.backup = { rotation_days: 35, recycle_bin_days: 93, effective_max_days: 35 };
    expect(issues(c)).toMatch(/effective_max_days/);
  });

  it('no versions_days key (library versioning does not apply to named files)', () => {
    const c = raw();
    c.classes.backup = { ...c.classes.backup, versions_days: 30 };
    issues(c);
  });

  it('a missing class → rejected', () => {
    const c = raw();
    delete c.classes.connection_log;
    issues(c);
  });
});
