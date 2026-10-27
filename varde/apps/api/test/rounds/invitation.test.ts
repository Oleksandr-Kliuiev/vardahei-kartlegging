import 'reflect-metadata';
import qrcode from 'qrcode-generator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupSubmissions, submissionApp, submissionRound } from '../support/submissions.js';
import notices from '../../../runner/src/i18n/notice-v2.nn.json';

let t: Awaited<ReturnType<typeof submissionApp>>, cookie: string;
const saved = { ...process.env },
  rounds: string[] = [];
beforeAll(async () => {
  t = await submissionApp();
  process.env.PUBLIC_URL = 'https://survey.example.invalid';
  const s = await t.store.create({
    oid: 'test.invitation',
    name: 'test',
    via: 'entra',
    expiresAt: new Date(Date.now() + 3600_000),
  });
  cookie = t.app.getHttpAdapter().getInstance().signCookie(s.sid);
});
afterAll(async () => {
  await cleanupSubmissions(t.prisma, rounds);
  await t.app.close();
  process.env = saved;
});
async function fresh(mode: 'initials' | 'none' = 'initials') {
  const f = await submissionRound(t, mode);
  rounds.push(f.round.id);
  return f;
}
const get = (url: string, authenticated = true) =>
  t.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: 'GET',
      url,
      headers: authenticated ? { cookie: `__Host-varde_session=${encodeURIComponent(cookie)}` } : {},
    });

describe('invitations and poster (1.21)', () => {
  it('both routes require an admin session', async () => {
    const f = await fresh();
    for (const url of [
      `/api/admin/round-clients/${f.rc.id}/invitation`,
      `/admin/poster/${f.rc.id}`,
    ])
      expect((await get(url, false)).statusCode).toBe(401);
  });
  it('identified invitation uses RoundClient code, minutes, host and deadline; initials promise retained', async () => {
    const f = await fresh();
    const res = await get(`/api/admin/round-clients/${f.rc.id}/invitation?lang=nn`);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json<{ text: string; link: string }>();
    expect(body.link).toBe(`https://survey.example.invalid/r?c=${f.code}`);
    expect(body.text).toContain(body.link);
    expect(body.text).toContain('Svara per person ser berre Vardahei IT');
    expect(body.text).toContain('initialane');
    expect(body.text).toContain(String(f.content.intro.minutes));
    expect(body.text).toContain('Svar gjerne innan');
    expect(body.text).not.toMatch(/\{(minutt|frist|lenkje|host)\}/);
    expect(body.text).not.toContain('kartlegging.vardahei.tech');
  });
  it('anonymous invitation and poster use approved anonymous text with no initials request', async () => {
    const f = await fresh('none');
    for (const url of [
      `/api/admin/round-clients/${f.rc.id}/invitation`,
      `/admin/poster/${f.rc.id}`,
    ]) {
      const res = await get(url);
      expect(res.statusCode, res.body).toBe(200);
      const text = url.startsWith('/api') ? res.json<{ text: string }>().text : res.body;
      expect(text).toContain(notices['notice.anonymous.intro']);
      expect(text).not.toContain('Svara per person ser berre Vardahei IT');
      expect(text).not.toContain('Skriv inn initialane');
      expect(text).not.toContain('Du skriv inn initialane dine først');
    }
  });
  it('only version languages are supported; poster defaults to language of the client', async () => {
    const f = await fresh();
    await t.prisma.client.update({ where: { id: f.client.id }, data: { default_lang: 'en' } });
    expect((await get(`/admin/poster/${f.rc.id}`)).body).toContain('<html lang="en">');
    for (const url of [
      `/api/admin/round-clients/${f.rc.id}/invitation?lang=nb`,
      `/admin/poster/${f.rc.id}?lang=nb`,
    ])
      expect((await get(url)).statusCode).toBe(400);
    expect(
      (await get(`/api/admin/round-clients/${f.rc.id}/invitation?lang=en`)).json<{ text: string }>()
        .text,
    ).toContain('Only Vardahei IT');
  });
  it('A4 poster QR has exactly the qrcode-generator 1.4.4 matrix for the same link', async () => {
    const f = await fresh();
    const res = await get(`/admin/poster/${f.rc.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('size: A4 portrait');
    expect(res.body).toContain('data:image/png;base64,');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    const qr = qrcode(0, 'M');
    qr.addData(`https://survey.example.invalid/r?c=${f.code}`);
    qr.make();
    let path = '';
    for (let r = 0; r < qr.getModuleCount(); r++)
      for (let c = 0; c < qr.getModuleCount(); c++)
        if (qr.isDark(r, c)) path += `M${c + 2},${r + 2}h1v1h-1z`;
    expect(res.body).toContain(`<path d="${path}" fill="#000"/>`);
    expect(res.body).toContain(
      `viewBox="0 0 ${qr.getModuleCount() + 4} ${qr.getModuleCount() + 4}"`,
    );
  });
  it('HTML escapes client data; invalid PUBLIC_URL fails without exposing codes', async () => {
    const f = await fresh();
    await t.prisma.client.update({
      where: { id: f.client.id },
      data: { name: '<script>synthetic</script>' },
    });
    const res = await get(`/admin/poster/${f.rc.id}`);
    expect(res.body).toContain('&lt;script&gt;synthetic&lt;/script&gt;');
    expect(res.body).not.toContain('<script>synthetic');
    process.env.PUBLIC_URL = 'javascript:invalid';
    const bad = await get(`/api/admin/round-clients/${f.rc.id}/invitation`);
    expect(bad.statusCode).toBe(503);
    expect(bad.body).not.toContain(f.code);
    process.env.PUBLIC_URL = 'https://survey.example.invalid';
  });
});
