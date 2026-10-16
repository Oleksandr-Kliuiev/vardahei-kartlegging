// 3.1 (integration): personal data of seminars. The participant list is read under AuditLog;
// the daily job deletes registrations 90 days after the seminar (dry-run, idempotent, journal in
// AuditLog) and marks contacts for the yearly check without deleting them; deletion on request
// by e-mail removes the contact and its registrations with a ledger entry that has no e-mail.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeletionLedger } from '../../src/modules/retention/ledger.js';
import { RetentionRun } from '../../src/modules/retention/run.service.js';
import { withPg } from '../support/rounds.js';
import {
  contactsOf,
  createSeminar,
  email,
  register,
  registrationsOf,
  seminarApp,
  type SeminarApp,
} from '../support/seminars.js';

let t: SeminarApp;
const DAY = 86400_000;

beforeAll(async () => {
  t = await seminarApp();
  // The retention job prunes varde_audit.connection_log; a plain test database needs the function.
  await withPg(async (c) => {
    if (
      !(await c.query<{ f: string | null }>("SELECT to_regprocedure('varde_audit.prune()') f"))
        .rows[0]?.f
    ) {
      await c.query('CREATE SCHEMA IF NOT EXISTS varde_audit');
      await c.query(
        'CREATE TABLE IF NOT EXISTS varde_audit.connection_log (at timestamptz NOT NULL DEFAULT now(), role_name text)',
      );
      const sql = readFileSync(resolve('../../infra/sql/varde-db.sql'), 'utf8');
      await c.query(
        sql.slice(
          sql.indexOf('CREATE FUNCTION varde_audit.prune()'),
          sql.indexOf('ALTER FUNCTION varde_audit.prune()'),
        ),
      );
    }
  });
}, 120_000);
afterAll(async () => {
  await t.close();
});

/** A seminar that ended `days` days before now. */
async function endedAgo(days: number) {
  const s = await createSeminar(t, { languages: ['nn'], topic_en: undefined });
  const ends = new Date(Date.now() - days * DAY);
  await t.prisma.seminar.update({
    where: { id: s.id },
    data: { starts_at: new Date(ends.getTime() - 2 * 3600_000), ends_at: ends },
  });
  return s;
}

describe('participant list (class rows of seminars)', () => {
  it('needs an admin session and writes AuditLog with the count, never names', async () => {
    const s = await createSeminar(t);
    await register(t, s.id, email(t, 'a'), { name: 'ZZ Ola Syntetisk' });
    await register(t, s.id, email(t, 'b'), { name: 'ZZ Kari Syntetisk', lang: 'en' });
    expect(
      (await t.call('GET', `/api/admin/seminars/${s.id}/registrations`, undefined, { cookie: '' }))
        .statusCode,
    ).toBe(401);
    const before = await t.prisma.auditLog.count({ where: { what: 'privacy.participants' } });
    const res = await t.call('GET', `/api/admin/seminars/${s.id}/registrations`);
    expect(res.statusCode).toBe(200);
    expect(res.json<{ rows: { name: string; email: string; lang: string }[] }>().rows).toEqual([
      expect.objectContaining({ name: 'ZZ Ola Syntetisk', email: email(t, 'a'), lang: 'nn' }),
      expect.objectContaining({ name: 'ZZ Kari Syntetisk', email: email(t, 'b'), lang: 'en' }),
    ]);
    const audit = await t.prisma.auditLog.findMany({
      where: { what: 'privacy.participants', target: `seminar:${s.id}` },
    });
    expect(await t.prisma.auditLog.count({ where: { what: 'privacy.participants' } })).toBe(
      before + 1,
    );
    expect(audit[0]).toMatchObject({ who: 'entra:test:seminar-admin', details: { count: 2 } });
    expect(JSON.stringify(audit)).not.toMatch(/Syntetisk|example\.test/);
  });

  it('a repeat for the same seminar changes nothing; a new seminar renews only the consent', async () => {
    const one = await createSeminar(t),
      two = await createSeminar(t);
    expect(await register(t, one.id, email(t, 'r'), { name: 'ZZ Fyrste' })).toBe(true);
    expect(await register(t, one.id, email(t, 'r'), { name: 'ZZ Andre' })).toBe(false);
    expect((await contactsOf(t)).find((c) => c.email === email(t, 'r'))?.name).toBe('ZZ Fyrste');
    const before = (await contactsOf(t)).find((c) => c.email === email(t, 'r'))!;
    // The public form cannot rewrite a known contact (no login, e-mail not verified).
    expect(await register(t, two.id, email(t, 'r'), { name: 'ZZ Andre' })).toBe(true);
    const contact = (await contactsOf(t)).filter((c) => c.email === email(t, 'r'));
    expect(contact).toHaveLength(1);
    expect(contact[0]!.name).toBe('ZZ Fyrste');
    expect([contact[0]!.company, contact[0]!.client_id]).toEqual([
      before.company,
      before.client_id,
    ]);
    expect(contact[0]!.last_confirmed_at.getTime()).toBeGreaterThanOrEqual(
      before.last_confirmed_at.getTime(),
    );
    expect(await registrationsOf(one.id)).toHaveLength(1);
  });
});

describe('retention (1.31 job, classes registration and contact)', () => {
  it('dry-run counts registrations older than seminar + 90 days and deletes nothing', async () => {
    const old = await endedAgo(91),
      recent = await endedAgo(89);
    await register(t, old.id, email(t, 'old'));
    await register(t, recent.id, email(t, 'recent'));
    const dry = await t.app.get(RetentionRun).run(true);
    expect(dry.dry_run).toBe(true);
    expect(dry.registration).toBeGreaterThanOrEqual(1);
    expect(dry.skipped).toEqual(['Proposal']);
    expect(await registrationsOf(old.id)).toHaveLength(1);

    const audit = await t.prisma.auditLog.count({ where: { what: 'retention.run' } });
    const real = await t.app.get(RetentionRun).run();
    expect(real.registration).toBe(dry.registration);
    expect(await registrationsOf(old.id)).toHaveLength(0);
    expect(await registrationsOf(recent.id)).toHaveLength(1);
    // The contact itself is not deleted by a timer.
    expect((await contactsOf(t)).some((c) => c.email === email(t, 'old'))).toBe(true);
    // The journal of the timed deletion: counts only.
    const journal = await t.prisma.auditLog.findMany({
      where: { what: 'retention.run' },
      orderBy: { at: 'desc' },
      take: 1,
    });
    expect(await t.prisma.auditLog.count({ where: { what: 'retention.run' } })).toBe(audit + 1);
    expect(journal[0]?.who).toBe('system:retention');
    expect((journal[0]?.details as { registration?: number }).registration).toBe(real.registration);
    expect(JSON.stringify(journal)).not.toMatch(/example\.test|ZZ Deltakar/);

    const again = await t.app.get(RetentionRun).run();
    expect(again.registration).toBe(0);
  });

  it('marks a contact confirmed more than a year ago, once; the admin sees it and confirms it', async () => {
    const s = await createSeminar(t);
    await register(t, s.id, email(t, 'yearly'), { name: 'ZZ Årleg' });
    const contact = (await contactsOf(t)).find((c) => c.email === email(t, 'yearly'))!;
    await withPg((c) =>
      c.query(`UPDATE contact SET last_confirmed_at = now() - interval '366 days' WHERE id = $1`, [
        contact.id,
      ]),
    );
    const dry = await t.app.get(RetentionRun).run(true);
    expect(dry.contact_review).toBeGreaterThanOrEqual(1);
    expect((await contactsOf(t)).find((c) => c.id === contact.id)?.review_flagged_at).toBeNull();
    await t.app.get(RetentionRun).run();
    const flagged = (await contactsOf(t)).find((c) => c.id === contact.id)!.review_flagged_at;
    expect(flagged).not.toBeNull();
    await t.app.get(RetentionRun).run();
    expect((await contactsOf(t)).find((c) => c.id === contact.id)!.review_flagged_at).toEqual(
      flagged,
    );

    const list = (await t.call('GET', '/api/admin/seminars')).json<{
      contacts_to_review: number;
    }>();
    expect(list.contacts_to_review).toBeGreaterThanOrEqual(1);
    const review = await t.call('GET', '/api/admin/contacts/review');
    expect(review.json<{ rows: { id: string; name: string }[] }>().rows).toContainEqual(
      expect.objectContaining({ id: contact.id, name: 'ZZ Årleg', registrations: 1 }),
    );
    expect(
      await t.prisma.auditLog.count({
        where: { what: 'privacy.participants', target: 'contacts:review' },
      }),
    ).toBeGreaterThan(0);
    expect((await t.call('POST', `/api/admin/contacts/${contact.id}/confirm`)).statusCode).toBe(
      201,
    );
    const after = (await contactsOf(t)).find((c) => c.id === contact.id)!;
    expect(after.review_flagged_at).toBeNull();
    expect(Date.now() - after.last_confirmed_at.getTime()).toBeLessThan(60_000);
  });
});

describe('deletion on request, scope «Deltakar» (by e-mail)', () => {
  it('dry-run shows the contact and its registrations; the real run leaves a ledger without the e-mail', async () => {
    const one = await createSeminar(t),
      two = await createSeminar(t);
    const address = email(t, 'forget');
    await register(t, one.id, address, { name: 'ZZ Gløym Meg' });
    await register(t, two.id, address, { name: 'ZZ Gløym Meg' });
    const contact = (await contactsOf(t)).find((c) => c.email === address)!;
    const body = (dry_run: boolean, mail = address) => ({
      scope: { scope: 'participant', email: `  ${mail.toUpperCase()} ` },
      reason: 'Syntetisk førespurnad',
      dry_run,
    });
    expect(
      (await t.call('POST', '/api/admin/retention/forget', body(true), { cookie: '' })).statusCode,
    ).toBe(401);
    const requests = await t.prisma.deletionRequest.count();
    const preview = await t.call('POST', '/api/admin/retention/forget', body(true));
    expect(preview.json()).toEqual({ dry_run: true, contacts: 1, registrations: 2, total: 3 });
    expect(await t.prisma.deletionRequest.count()).toBe(requests);

    const done = await t.call('POST', '/api/admin/retention/forget', body(false));
    expect(done.json()).toEqual({ dry_run: false, contacts: 1, registrations: 2, total: 3 });
    expect((await contactsOf(t)).some((c) => c.email === address)).toBe(false);
    expect(await registrationsOf(one.id)).toHaveLength(0);
    const request = await t.prisma.deletionRequest.findFirstOrThrow({
      where: { scope: 'participant' },
      orderBy: { at: 'desc' },
      include: { participants: true },
    });
    expect(request.scope_ref).toEqual({ contact: contact.id });
    expect(request.participants).toEqual([
      expect.objectContaining({ contact_id: contact.id, registrations: 2 }),
    ]);
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { target: request.id } });
    expect(audit).toMatchObject({
      what: 'retention.forget',
      details: { scope: 'participant', contacts: 1, registrations: 2 },
    });
    expect(JSON.stringify([request, audit])).not.toMatch(/example\.test|Gløym/);

    // Unknown address: nothing to do, no ledger entry; the answer does not say more than counts.
    const none = await t.call(
      'POST',
      '/api/admin/retention/forget',
      body(false, email(t, 'never')),
    );
    expect(none.json()).toEqual({ dry_run: false, contacts: 0, registrations: 0, total: 0 });
    expect(await t.prisma.deletionRequest.count()).toBe(requests + 1);
    expect(
      (
        await t.call('POST', '/api/admin/retention/forget', {
          ...body(false),
          scope: { scope: 'participant', email: 'ikkje-ei-adresse' },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('after a restore from an older copy the ledger removes the contact again', async () => {
    const s = await createSeminar(t);
    const address = email(t, 'restore');
    await register(t, s.id, address);
    const old = (await contactsOf(t)).find((c) => c.email === address)!;
    await t.call('POST', '/api/admin/retention/forget', {
      scope: { scope: 'participant', email: address },
      reason: 'Syntetisk',
    });
    // The restored dump still has the contact and its registration (same ids).
    await withPg(async (c) => {
      await c.query(
        `INSERT INTO contact (id, name, email, company, consent_version, consent_at) VALUES ($1, 'ZZ', $2, 'x', 'samtykke-v1', now())`,
        [old.id, address],
      );
      await c.query(
        `INSERT INTO registration (seminar_id, contact_id, lang) VALUES ($1, $2, 'nn')`,
        [s.id, old.id],
      );
    });
    expect(await t.app.get(DeletionLedger).apply()).toBeGreaterThanOrEqual(1);
    expect((await contactsOf(t)).some((c) => c.email === address)).toBe(false);
    expect(await registrationsOf(s.id)).toHaveLength(0);
  });
});
