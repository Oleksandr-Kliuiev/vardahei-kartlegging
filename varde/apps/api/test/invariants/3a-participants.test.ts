// 3a invariants (integration): seminar participants are personal data (ADR-017). Walking every
// registered route with synthetic registrations in the database, the name, company and e-mail
// leave only through the three named participant channels — the list of one seminar, the
// contacts to check and the contacts of one client (the client page, 2.17) — and each read there
// is in AuditLog. Reports, exports, archives, the dashboard, the public seminar page, the counts
// and findings of the client page and everything else never carry them; Response never refers to
// a contact or registration.
import 'reflect-metadata';
import { TextWriter, Uint8ArrayReader, ZipReader } from '@zip.js/zip.js';
import type { LightMyRequestResponse, RouteOptions } from 'fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { cookieHeader } from '../support/auth-app.js';
import { withPg } from '../support/rounds.js';

let f: DashboardFixture;
const routes: RouteOptions[] = [];
const NAME = 'ZZDELTAKAR Syntetisk',
  EMAIL = 'zz-invariant-3a@example.test',
  COMPANY = 'ZZFIRMA Syntetisk';
/** A second participant, who chose the client Daco: the contact of that client (2.17). */
const CLIENT_NAME = 'ZZKONTAKT Syntetisk',
  CLIENT_EMAIL = 'zz-invariant-3a-kunde@example.test';
const SECRETS = [NAME, EMAIL, COMPANY, CLIENT_NAME, CLIENT_EMAIL];
let seminar: { id: string; code: string };
/** The text of a response; a zip is unpacked (its entries are compressed), every file read. */
async function textOf(res: LightMyRequestResponse): Promise<{ text: string; zip: boolean }> {
  const raw = res.rawPayload;
  if (raw.subarray(0, 4).toString('latin1') !== 'PK\u0003\u0004') return { text: res.body, zip: false };
  const zip = new ZipReader(new Uint8ArrayReader(new Uint8Array(raw)), { useWebWorkers: false });
  try {
    const parts: string[] = [];
    for (const entry of await zip.getEntries()) {
      parts.push(entry.filename);
      // An encrypted entry cannot be read here: the test fails instead of looking away.
      if (!entry.directory) parts.push(await entry.getData(new TextWriter()));
    }
    return { text: parts.join('\n'), zip: true };
  } finally {
    await zip.close();
  }
}
const currentCode = async () =>
  (await f.prisma.seminar.findUniqueOrThrow({ where: { id: seminar.id } })).code;
/** Each channel and the e-mail it must carry. */
const PARTICIPANT_CHANNELS = new Map([
  ['GET /api/admin/seminars/:id/registrations', EMAIL],
  ['GET /api/admin/contacts/review', EMAIL],
  ['GET /api/admin/clients/:id/contacts', CLIENT_EMAIL],
]);

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://varde.test';
  f = await dashboardFixture((r) => {
    routes.push(r);
  });
  const created = await f.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: 'POST',
      url: '/api/admin/seminars',
      headers: { cookie: cookieHeader(f.cookie) },
      payload: { topic_nn: 'ZZ invariant 3a', date: '2020-05-05', start: '09:00', end: '10:00', place: 'Sogndal', format: 'onsite' },
    });
  const id = created.json<{ id: string }>().id;
  seminar = { id, code: (await f.prisma.seminar.findUniqueOrThrow({ where: { id } })).code };
  const daco = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
  for (const p of [
    { name: NAME, email: EMAIL, company: COMPANY, client: null },
    { name: CLIENT_NAME, email: CLIENT_EMAIL, company: daco.name, client: daco.id },
  ])
    await f.prisma.$transaction((tx) =>
      f.app.get(PrivacyService).participants.register(
        tx,
        { seminar: id, ...p, lang: 'nn', consent_version: 'pamelding-v1', invite_version: null },
        new Date(),
      ),
    );
  // The contact also waits for the yearly check, so the second channel has it too.
  await withPg((c) =>
    c.query(`UPDATE contact SET review_flagged_at = now() WHERE email = $1`, [EMAIL]),
  );
  await f.prisma.seminarMaterial.create({
    data: { seminar_id: id, title: 'ZZ lysark', url: 'https://example.test/l.pdf', created_by: 'test' },
  });
}, 180_000);
afterAll(async () => {
  await withPg(async (c) => {
    await c.query('DELETE FROM contact WHERE email = ANY($1::text[])', [[EMAIL, CLIENT_EMAIL]]);
    await c.query('DELETE FROM seminar WHERE id = $1', [seminar.id]);
  });
  await f.close();
});

it('walks every API route: participant data only in the three named channels, each read audited', async () => {
  const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
  const rc = await f.prisma.roundClient.findFirstOrThrow({ where: { round_id: f.tryggleik, client_id: client.id } });
  const seen = new Set<string>(),
    unzipped = new Set<string>();
  for (const route of routes) {
    if (!(route.url.startsWith('/api/') || route.url.startsWith('/admin/poster/')) || route.url === '/api/admin/events') continue;
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      let url = route.url.replace(/:clientId\b/g, client.id);
      url = url.replace(
        /:id\b/g,
        url.includes('/seminars') || url.includes('/poster/seminar')
          ? seminar.id
          : url.includes('round-clients')
            ? rc.id
            : url.includes('/clients')
              ? client.id
              : f.tryggleik,
      );
      if (url.includes('/dashboard') || url.includes('/rows/') || url.includes('leader-answers') || url.includes('/exports/')) {
        url += '?round=' + f.tryggleik;
        if (url.includes('client.csv')) url += '&client=' + client.id;
      }
      const before = await f.prisma.auditLog.count({ where: { what: 'privacy.participants' } });
      // «Ny lenkje» is one of the routes: the public routes always use the current code.
      const code = await currentCode();
      const res = await f.app
        .getHttpAdapter()
        .getInstance()
        .inject({
          // Every registered method, typed as one of them for the inject overload.
          method: method as 'GET',
          url,
          headers: {
            cookie: cookieHeader(f.cookie),
            // The public seminar routes take the code as a bearer.
            ...(route.url.startsWith('/api/public/') ? { authorization: `Bearer ${code}` } : {}),
          },
        });
      const key = `${method} ${route.url}`;
      seen.add(key);
      const { text: body, zip } = await textOf(res);
      if (zip) unzipped.add(key);
      const carries = PARTICIPANT_CHANNELS.get(key);
      if (carries) {
        expect(res.statusCode, key).toBe(200);
        expect(res.body, key).toContain(carries);
        expect(await f.prisma.auditLog.count({ where: { what: 'privacy.participants' } }), key).toBe(before + 1);
        continue;
      }
      for (const secret of SECRETS) expect(body, `${key} → ${secret}`).not.toContain(secret);
      expect(await f.prisma.auditLog.count({ where: { what: 'privacy.participants' } }), key).toBe(before);
    }
  }
  for (const key of [
    ...PARTICIPANT_CHANNELS.keys(),
    'GET /api/admin/clients/:id/contacts/count',
    'GET /api/admin/clients/:id/finding-status',
    'GET /api/public/seminar',
    'GET /api/admin/seminars/:id',
    'GET /api/admin/seminars',
    'GET /api/admin/seminars/:id/invitation.zip',
    'GET /api/admin/exports/client.csv',
    'GET /api/admin/exports/archive.json',
    'POST /api/admin/retention/forget',
    'POST /api/admin/seminars/:id/reissue',
  ])
    expect(seen, key).toContain(key);
  // The invitation package was really opened and read, file by file.
  expect(unzipped).toContain('GET /api/admin/seminars/:id/invitation.zip');
});

it('the public page of a held seminar shows its material, never a participant', async () => {
  const res = await f.app
    .getHttpAdapter()
    .getInstance()
    .inject({ method: 'GET', url: '/api/public/seminar', headers: { authorization: `Bearer ${await currentCode()}` } });
  expect(res.json()).toMatchObject({ phase: 'held', materials: [{ title: 'ZZ lysark' }] });
  for (const secret of SECRETS) expect(res.body).not.toContain(secret);
});

it('Response has no foreign key or column towards contact, registration or seminar', async () => {
  const refs = await withPg(
    async (c) =>
      (
        await c.query<{ ref: string; col: string }>(
          `SELECT ccu.table_name AS ref, kcu.column_name AS col FROM information_schema.table_constraints tc
             JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
             JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
            WHERE tc.table_name = 'response' AND tc.constraint_type = 'FOREIGN KEY'`,
        )
      ).rows,
  );
  expect(refs).toEqual([{ ref: 'round_client', col: 'round_client_id' }]);
  const triggers = await withPg(
    async (c) =>
      (
        await c.query<{ src: string }>(
          `SELECT p.prosrc AS src FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
            WHERE t.tgrelid = 'response'::regclass AND NOT t.tgisinternal`,
        )
      ).rows,
  );
  for (const t of triggers) expect(t.src).not.toMatch(/contact|registration|seminar/i);
});
