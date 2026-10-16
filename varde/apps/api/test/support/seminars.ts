// Seminars in integration tests (3a): an app with an admin session and PUBLIC_URL, synthetic
// clients, seminars through the admin API and registrations through PrivacyService. Contacts are
// read and removed with plain `pg`: outside modules/privacy no code touches them through Prisma.
import { randomUUID } from 'node:crypto';
import type { LightMyRequestResponse, RouteOptions } from 'fastify';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { cookieHeader, startApp, type TestApp } from './auth-app.js';
import { withPg } from './rounds.js';

export const PUBLIC_URL = 'https://varde.test';

export interface SeminarApp extends TestApp {
  prisma: PrismaService;
  cookie: Record<string, string>;
  session: Awaited<ReturnType<TestApp['store']['create']>>;
  mark: string;
  call: (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
    headers?: Record<string, string>,
  ) => Promise<LightMyRequestResponse>;
  close: () => Promise<void>;
}

/** App with the real AppModule; `call` sends the admin cookie unless `headers.cookie` is given.
 * `onRoute` sees every registered route (route walks, 3a/3b). */
export async function seminarApp(
  env: Record<string, string | undefined> = {},
  onRoute?: (route: RouteOptions) => void,
): Promise<SeminarApp> {
  const t = await startApp({ PUBLIC_URL, ...env }, onRoute);
  const prisma = t.app.get(PrismaService);
  const session = await t.store.create({
    oid: 'test:seminar-admin',
    name: 'Syntetisk admin',
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  const cookie = { varde_session: t.app.getHttpAdapter().getInstance().signCookie(session.sid) };
  const mark = `zz${randomUUID().slice(0, 8)}`;
  const call: SeminarApp['call'] = (method, url, payload, headers = {}) =>
    t.app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method,
        url,
        ...(payload === undefined ? {} : { payload: payload as object }),
        headers: { cookie: cookieHeader(cookie), ...headers },
      });
  return {
    ...t,
    prisma,
    session,
    cookie,
    mark,
    call,
    async close() {
      await cleanupSeminars(prisma, mark);
      await t.app.close();
    },
  };
}

/** Synthetic clients of this test file. */
export async function makeClients(t: SeminarApp, names = ['Syntetisk A', 'Syntetisk B']) {
  const out = [];
  for (const [i, name] of names.entries())
    out.push(
      await t.prisma.client.create({ data: { slug: `${t.mark}-k${i}`, name: `${name} ${t.mark}` } }),
    );
  return out;
}

export interface SeminarBody {
  topic_nn: string;
  topic_en?: string;
  date: string;
  start: string;
  end: string;
  place: string;
  format: 'onsite' | 'digital';
  languages?: ('nn' | 'en')[];
  clients?: string[];
}

export function seminarBody(t: SeminarApp, over: Partial<SeminarBody> = {}): SeminarBody {
  return {
    topic_nn: `Passord og MFA ${t.mark}`,
    topic_en: `Passwords and MFA ${t.mark}`,
    date: '2099-11-05',
    start: '09:00',
    end: '11:30',
    place: 'Vardahei IT, Sogndal',
    format: 'onsite',
    languages: ['nn', 'en'],
    clients: [],
    ...over,
  };
}

export async function createSeminar(t: SeminarApp, over: Partial<SeminarBody> = {}) {
  const res = await t.call('POST', '/api/admin/seminars', seminarBody(t, over));
  if (res.statusCode !== 201) throw new Error(`create seminar: ${res.statusCode} ${res.body}`);
  const { id } = res.json<{ id: string }>();
  const seminar = await t.prisma.seminar.findUniqueOrThrow({ where: { id } });
  return { id, code: seminar.code };
}

/** A registration as the public page would make it (3.2 adds the HTTP path). */
export async function register(
  t: SeminarApp,
  seminar: string,
  email: string,
  over: {
    name?: string;
    company?: string;
    client?: string | null;
    lang?: 'nn' | 'en';
    /** Ticks the optional box for invitations. */
    invite?: boolean;
  } = {},
) {
  return t.prisma.$transaction((tx) =>
    t.app.get(PrivacyService).participants.register(
      tx,
      {
        seminar,
        name: over.name ?? 'ZZ Deltakar',
        email,
        company: over.company ?? 'Syntetisk firma',
        client: over.client ?? null,
        lang: over.lang ?? 'nn',
        consent_version: 'pamelding-v1',
        invite_version: over.invite ? 'invitasjon-v1' : null,
      },
      new Date(),
    ),
  );
}

export const email = (t: SeminarApp, n: number | string) => `zz-${t.mark}-${n}@example.test`;

/** Contacts of this file, read with plain pg (names and e-mail never through Prisma outside privacy). */
export function contactsOf(t: SeminarApp) {
  return withPg(
    async (c) =>
      (
        await c.query<{
          id: string;
          name: string;
          email: string;
          company: string;
          client_id: string | null;
          invite_consent_version: string | null;
          invite_consent_at: Date | null;
          last_confirmed_at: Date;
          review_flagged_at: Date | null;
        }>('SELECT * FROM contact WHERE email LIKE $1 ORDER BY email', [`zz-${t.mark}-%`])
      ).rows,
  );
}

export function registrationsOf(seminar: string) {
  return withPg(
    async (c) =>
      (
        await c.query<{
          id: string;
          contact_id: string;
          lang: string;
          consent_version: string;
          consent_at: Date;
        }>(
          'SELECT id, contact_id, lang, consent_version, consent_at FROM registration WHERE seminar_id = $1',
          [seminar],
        )
      ).rows,
  );
}

export async function cleanupSeminars(prisma: PrismaService, mark: string) {
  await withPg(async (c) => {
    await c.query('DELETE FROM contact WHERE email LIKE $1', [`zz-${mark}-%`]);
    await c.query(
      `DELETE FROM finding_status WHERE seminar_id IN (SELECT id FROM seminar WHERE topic_nn LIKE $1)`,
      [`%${mark}%`],
    );
    await c.query('DELETE FROM seminar WHERE topic_nn LIKE $1', [`%${mark}%`]);
  });
  await prisma.client.deleteMany({ where: { slug: { startsWith: `${mark}-` } } });
}
