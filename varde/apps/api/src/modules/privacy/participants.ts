// Seminar participants (3.1, ADR-017 classes `contact` and `registration`): the only read and
// write path of Contact and Registration (lint varde/privacy-only-release). Names, companies and
// e-mail addresses leave only through `list` and `reviewList`: admin session, AuditLog written
// first in the same transaction (as class `rows`). Reports, archives, exports, the assistant and
// Atlas never see them; counts per company carry no names. Reached as `PrivacyService.participants`.
import type { Prisma } from '@prisma/client';
import { auditWho } from '../auth/audit-who.js';
import type { RowsDb } from './rows.js';
import { type PrivacySession, UnauthorizedError } from './types.js';

export const PARTICIPANTS_AUDIT = 'privacy.participants';
export type ParticipantLang = 'nn' | 'en';

export interface ParticipantInput {
  seminar: string;
  name: string;
  /** Normalized: trimmed, lower case. */
  email: string;
  /** The chosen client's name or the person's own text. */
  company: string;
  client: string | null;
  lang: ParticipantLang;
  consent_version: string;
}
export interface ParticipantRow {
  name: string;
  company: string;
  email: string;
  lang: string;
  registered_at: string;
}
export interface ContactReviewRow {
  id: string;
  name: string;
  company: string;
  email: string;
  last_confirmed_at: string;
  flagged_at: string;
  registrations: number;
}
/** Registrations of a seminar: per client of Varde (names of clients only), the rest as `other`
 * — a company typed by a participant is shown only in the audited list. */
export interface ParticipantCounts {
  total: number;
  companies: { company: string; n: number }[];
  other: number;
}
export interface ParticipantDeleteCounts {
  contacts: number;
  registrations: number;
  total: number;
}

function requireSession(session: PrivacySession | null | undefined): PrivacySession {
  if (session === null || session === undefined) throw new UnauthorizedError();
  return session;
}

/** Same lock for registration and deletion of one e-mail (no duplicate contact, no lost delete). */
const lockEmail = (tx: Prisma.TransactionClient, email: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'contact:' + email}, 0))`;

export class ParticipantStore {
  /** Idempotent per seminar and e-mail: a repeat changes nothing and returns false. A new
   * registration of a known contact renews only its consent: the public form has no login and
   * the e-mail is not verified, so it never rewrites the name, company or client someone gave
   * before (an admin can). The caller holds the seminar row lock and has checked the seminar,
   * the company and the consent version. */
  async register(tx: Prisma.TransactionClient, p: ParticipantInput, now: Date): Promise<boolean> {
    await lockEmail(tx, p.email);
    const details = {
      name: p.name,
      company: p.company,
      client_id: p.client,
      consent_version: p.consent_version,
      consent_at: now,
      last_confirmed_at: now,
      review_flagged_at: null,
    };
    const known = await tx.contact.findUnique({ where: { email: p.email }, select: { id: true } });
    if (known) {
      const again = await tx.registration.findUnique({
        where: { seminar_id_contact_id: { seminar_id: p.seminar, contact_id: known.id } },
        select: { id: true },
      });
      if (again) return false;
      await tx.contact.update({
        where: { id: known.id },
        data: {
          consent_version: details.consent_version,
          consent_at: details.consent_at,
          last_confirmed_at: details.last_confirmed_at,
          review_flagged_at: null,
        },
      });
    }
    const contact =
      known ??
      (await tx.contact.create({ data: { ...details, email: p.email }, select: { id: true } }));
    await tx.registration.create({
      data: { seminar_id: p.seminar, contact_id: contact.id, lang: p.lang },
    });
    return true;
  }

  count(db: Prisma.TransactionClient, seminar: string): Promise<number> {
    return db.registration.count({ where: { seminar_id: seminar } });
  }

  /** Registrations per seminar and per client: numbers only, for the admin's seminar cards. */
  async counts(
    db: Prisma.TransactionClient,
    seminars: readonly string[],
  ): Promise<Record<string, ParticipantCounts>> {
    const out: Record<string, ParticipantCounts> = {};
    for (const id of seminars) out[id] = { total: 0, companies: [], other: 0 };
    if (seminars.length === 0) return out;
    const rows = await db.registration.findMany({
      where: { seminar_id: { in: [...seminars] } },
      select: { seminar_id: true, contact: { select: { client: { select: { name: true } } } } },
    });
    for (const r of rows) {
      const c = out[r.seminar_id]!;
      c.total += 1;
      const name = r.contact.client?.name;
      if (name === undefined) {
        c.other += 1;
        continue;
      }
      const known = c.companies.find((x) => x.company === name);
      if (known) known.n += 1;
      else c.companies.push({ company: name, n: 1 });
    }
    for (const c of Object.values(out))
      c.companies.sort((a, b) => b.n - a.n || a.company.localeCompare(b.company, 'nb'));
    return out;
  }

  /** Names, companies and e-mail of one seminar: admin session, AuditLog in the same transaction. */
  list(
    db: RowsDb,
    seminar: string,
    session: PrivacySession | null | undefined,
  ): Promise<ParticipantRow[]> {
    const who = auditWho(requireSession(session), true);
    return db.$transaction(async (tx) => {
      const entry = await tx.auditLog.create({
        data: { who, what: PARTICIPANTS_AUDIT, target: `seminar:${seminar}`, details: {} },
      });
      const rows = await tx.registration.findMany({
        where: { seminar_id: seminar },
        orderBy: { created_at: 'asc' },
        select: {
          lang: true,
          created_at: true,
          contact: { select: { name: true, company: true, email: true } },
        },
      });
      await tx.auditLog.update({
        where: { id: entry.id },
        data: { details: { count: rows.length } },
      });
      return rows.map((r) => ({
        name: r.contact.name,
        company: r.contact.company,
        email: r.contact.email,
        lang: r.lang,
        registered_at: r.created_at.toISOString(),
      }));
    });
  }

  /** How many contacts wait for the yearly check (no names). */
  reviewCount(db: Prisma.TransactionClient): Promise<number> {
    return db.contact.count({ where: { review_flagged_at: { not: null } } });
  }

  /** Contacts marked by the yearly check: admin session, AuditLog in the same transaction. */
  reviewList(db: RowsDb, session: PrivacySession | null | undefined): Promise<ContactReviewRow[]> {
    const who = auditWho(requireSession(session), true);
    return db.$transaction(async (tx) => {
      const entry = await tx.auditLog.create({
        data: { who, what: PARTICIPANTS_AUDIT, target: 'contacts:review', details: {} },
      });
      const rows = await tx.contact.findMany({
        where: { review_flagged_at: { not: null } },
        orderBy: { last_confirmed_at: 'asc' },
        select: {
          id: true,
          name: true,
          company: true,
          email: true,
          last_confirmed_at: true,
          review_flagged_at: true,
          _count: { select: { registrations: true } },
        },
      });
      await tx.auditLog.update({
        where: { id: entry.id },
        data: { details: { count: rows.length } },
      });
      return rows.map((c) => ({
        id: c.id,
        name: c.name,
        company: c.company,
        email: c.email,
        last_confirmed_at: c.last_confirmed_at.toISOString(),
        flagged_at: (c.review_flagged_at ?? c.last_confirmed_at).toISOString(),
        registrations: c._count.registrations,
      }));
    });
  }

  /** The admin has checked that relationship and consent still hold: a new year starts. */
  confirm(
    db: RowsDb,
    contact: string,
    session: PrivacySession | null | undefined,
    now = new Date(),
  ) {
    const who = auditWho(requireSession(session), true);
    return db.$transaction(async (tx) => {
      const r = await tx.contact.updateMany({
        where: { id: contact },
        data: { last_confirmed_at: now, review_flagged_at: null },
      });
      if (r.count)
        await tx.auditLog.create({
          data: { who, what: 'seminars.contact.confirm', target: `contact:${contact}` },
        });
      return r.count > 0;
    });
  }

  /** Retention (daily job): registrations of seminars that ended before `cutoff`. */
  async expire(tx: Prisma.TransactionClient, cutoff: Date): Promise<number> {
    return (await tx.registration.deleteMany({ where: { seminar: { ends_at: { lt: cutoff } } } }))
      .count;
  }

  /** Retention (daily job): marks contacts confirmed before `cutoff` for the yearly check. */
  async flagReviews(tx: Prisma.TransactionClient, cutoff: Date, now: Date): Promise<number> {
    return (
      await tx.contact.updateMany({
        where: { review_flagged_at: null, last_confirmed_at: { lt: cutoff } },
        data: { review_flagged_at: now },
      })
    ).count;
  }

  /** Deletion on request (scope `participant`): the contact of one e-mail and its registrations.
   * Request and tombstone carry the contact id only; AuditLog has counts and the reason. */
  async forget(
    tx: Prisma.TransactionClient,
    email: string,
    who: string,
    reason: string,
    dryRun = false,
  ): Promise<ParticipantDeleteCounts> {
    await lockEmail(tx, email);
    const contact = await tx.contact.findUnique({
      where: { email },
      select: { id: true, _count: { select: { registrations: true } } },
    });
    const registrations = contact?._count.registrations ?? 0;
    const counts = {
      contacts: contact ? 1 : 0,
      registrations,
      total: (contact ? 1 : 0) + registrations,
    };
    if (dryRun || !contact) return counts;
    const request = await tx.deletionRequest.create({
      data: { requested_by: who, reason, scope: 'participant', scope_ref: { contact: contact.id } },
    });
    await tx.participantTombstone.create({
      data: { request_id: request.id, contact_id: contact.id, registrations },
    });
    await tx.contact.delete({ where: { id: contact.id } });
    await tx.auditLog.create({
      data: {
        who,
        what: 'retention.forget',
        target: request.id,
        details: { scope: 'participant', reason, contacts: 1, registrations },
      },
    });
    return counts;
  }

  /** After a restore from an older copy: contacts deleted on request go again (with their
   * registrations). Returns the number of contacts removed. */
  async applyLedger(tx: Prisma.TransactionClient): Promise<number> {
    const ids = (await tx.participantTombstone.findMany({ select: { contact_id: true } })).map(
      (t) => t.contact_id,
    );
    if (ids.length === 0) return 0;
    return (await tx.contact.deleteMany({ where: { id: { in: ids } } })).count;
  }
}
