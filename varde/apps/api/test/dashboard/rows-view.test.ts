import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  RowsView,
  type EmployeeModel,
  type QuotesModel,
} from '../../src/modules/dashboard/rows-view.js';
import { PrismaResponseSource } from '../../src/modules/privacy/prisma-source.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import { golden, section, questions } from '../support/golden.js';
import { clients } from '../support/fixtures.js';
import { withPg, insertResponse } from '../support/rounds.js';
import { dashboardFixture, type DashboardFixture } from './fixture.js';

let f: DashboardFixture, view: RowsView;
const added: string[] = [];
beforeAll(async () => {
  f = await dashboardFixture();
  view = f.app.get(RowsView);
}, 180_000);
afterAll(async () => {
  for (const id of added) {
    await withPg((db) =>
      db.query(
        'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id=$1)',
        [id],
      ),
    );
    await f.prisma.roundClient.deleteMany({ where: { round_id: id } });
    await f.prisma.round.delete({ where: { id } });
  }
  await f.close();
});
const num = (v: number | null) => (v === null ? '–' : v.toFixed(2).replace('.', ','));
const zones = ['Grøn', 'Gul', 'Oransje', 'Raud'];
function table(v: EmployeeModel) {
  return v.rows.map((r) => [
    r.respondent_key || '–',
    r.role,
    ...(v.client ? [] : [r.client_name]),
    ...(v.template === 'ki'
      ? r.columns.map((c) => c.label)
      : [
          num(r.mean),
          r.zone === null ? '–' : zones[r.zone]!,
          r.previous
            ? `${zones[r.previous.zone!]} ${num(r.previous.mean)} ${r.previous.change}`
            : '–',
          r.marked.length
            ? r.marked
                .slice(0, 5)
                .map((m) => m.label)
                .join(', ') + (r.marked.length > 5 ? ` +${r.marked.length - 5}` : '')
            : '–',
        ]),
  ]);
}
function goldenQuotes(file: string, template: string) {
  const lines = section(golden(file), 'Svar frå alle tilsette').lines;
  const qs = questions(template),
    boundaries = new Set(qs.map((q) => q.texts.text.nn));
  const roles =
    qs.find((q) => q.id === 'F2' || q.id === 'K1')?.options?.map((o) => o.texts.text.nn) ?? [];
  const metadata = new Set([
    ...roles,
    ...clients().flatMap((c) => [c.name, ...roles.map((r) => `${c.name}, ${r}`)]),
  ]);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const isText = qs.some((q) => q.type === 'text' && q.texts.text.nn === lines[i]);
    if (!isText && lines[i] !== 'Fritekst') continue;
    for (let j = i + 1; j < lines.length && !boundaries.has(lines[j]!); j++) {
      const line = lines[j]!;
      if (
        /^\d+ svar$/.test(line) ||
        line === 'Ingen svar enno.' ||
        /^Vis \d+ til$/.test(line) ||
        metadata.has(line)
      )
        continue;
      out.push(line);
    }
  }
  return out.sort();
}
describe('1.27b audited rows; golden runs (a)/(b), §6.11', () => {
  it('tryggleik table for all/every client = golden with synthetic initials', async () => {
    for (const slug of ['alle', ...clients().map((c) => c.slug)]) {
      const v = await view.perEmployee(f.tryggleik, slug, f.session);
      expect(table(v).sort(), slug).toEqual(
        section(golden(`tryggleik.${slug}.json`), 'Svar per tilsett')
          .tables[0]!.slice(1)
          .sort(),
      );
      expect(v.rows.every((r) => !!r.submission_id)).toBe(true);
      const summary = section(golden(`tryggleik.${slug}.json`), 'Svar per tilsett').lines.find(
        (l) => l.startsWith('Av dei '),
      );
      if (summary)
        expect(summary).toBe(
          `Av dei ${v.summary.matched} som svarte begge gongene: ${v.summary.better} betre, ${v.summary.worse} verre, ${v.summary.same} omtrent likt.`,
        );
    }
  });
  it('KI seven short columns and marked answers = golden, no prior column on first round', async () => {
    for (const slug of ['alle', ...clients().map((c) => c.slug)]) {
      const v = await view.perEmployee(f.ki, slug, f.session);
      expect(table(v).sort(), slug).toEqual(
        section(golden(`ki.${slug}.json`), 'Svar per tilsett')
          .tables[0]!.slice(1)
          .sort(),
      );
      expect(v.previous_round).toBeNull();
      expect(v.columns).toHaveLength(7);
      for (const r of v.rows)
        for (const c of r.columns)
          if (c.id === 'K19') expect(c.marked).toBe(['Privat konto', 'Begge'].includes(c.label));
    }
  });
  it('quotes in all/client views match golden for identified and anonymous runs', async () => {
    for (const [round, prefix, version, dir] of [
      [f.tryggleik, 'tryggleik', '2026-10-13', ''],
      [f.ki, 'ki', '2026-10-13', ''],
      [f.anon, 'ki', '2026-10-12', 'ki-2026-10-12/'],
    ] as const) {
      for (const slug of ['alle', ...clients().map((c) => c.slug)]) {
        if (dir && ['maskinsenteret', 'tharaso'].includes(slug)) continue;
        const q = await view.quotes(round, slug, f.session);
        expect(q.quotes.map((q) => q.text).sort(), `${dir}${prefix}/${slug}`).toEqual(
          goldenQuotes(`${dir}${prefix}.${slug}.json`, `${prefix}.${version}`),
        );
        expect(q.quotes.every((q) => !!q.submission_id)).toBe(true);
      }
    }
  });
  it('anonymous employee view is 404 before reading; quotes have no identifier or small role', async () => {
    const read = vi.spyOn(PrismaResponseSource.prototype, 'read');
    try {
      const r = await f.get(`/api/admin/rows/per-employee?round=${f.anon}`, f.cookie);
      expect(r.statusCode).toBe(404);
      await expect(
        f.app.get(PrivacyService).employeeHistory({ round: f.anon }, undefined, f.session),
      ).rejects.toMatchObject({ status: 404 });
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
    const q = await f.get(`/api/admin/rows/quotes?round=${f.anon}&client=daco`, f.cookie);
    expect(q.statusCode).toBe(200);
    expect(q.body).not.toMatch(/respondent_key|K0|answers|leader/);
    expect(q.json<QuotesModel>().quotes.every((q) => !('role' in q))).toBe(true);
  });
  it('rows routes require sessions and never return leader fields', async () => {
    for (const endpoint of ['per-employee', 'quotes']) {
      const url = `/api/admin/rows/${endpoint}?round=${f.tryggleik}`;
      expect((await f.get(url)).statusCode).toBe(401);
      const result = await f.get(url, f.cookie);
      expect(result.statusCode).toBe(200);
      expect(result.body).not.toMatch(/"part"|"answers"|B13|leader/);
    }
  });
  it('audit failure aborts both current/prior reads in one transaction without returning rows', async () => {
    const read = vi.spyOn(PrismaResponseSource.prototype, 'read');
    const real = f.prisma.$transaction.bind(f.prisma);
    const spy = vi.spyOn(f.prisma, '$transaction').mockImplementation((fn: unknown) =>
      real(async (tx) => {
        vi.spyOn(tx.auditLog, 'create').mockRejectedValue(
          new Error('synthetic rows audit failure'),
        );
        try {
          return await (fn as (t: typeof tx) => Promise<unknown>)(tx);
        } finally {
          expect(read).toHaveBeenCalledTimes(2);
          expect(read.mock.calls.every(([, client]) => client === tx)).toBe(true);
        }
      }),
    );
    try {
      await expect(view.perEmployee(f.tryggleik, undefined, f.session)).rejects.toThrow(
        'synthetic rows audit failure',
      );
    } finally {
      spy.mockRestore();
      read.mockRestore();
    }
  });
  it('two identified KI rounds compare K9 by client+key: opp/ned/likt, not other-client matches', async () => {
    const version = await f.prisma.templateVersion.findFirstOrThrow({
      where: { template: { key: 'ki' }, label: '2026-10-13' },
    });
    const client = await f.prisma.client.findUniqueOrThrow({ where: { slug: 'daco' } });
    const created = [];
    for (const [i, date] of ['2090-01-01', '2090-02-01'].entries()) {
      const round = await f.prisma.round.create({
        data: {
          name: `synthetic-ki-history-${i}`,
          type: 'regular',
          status: 'open',
          identification: 'initials',
          template_version_id: version.id,
          created_at: new Date(date),
        },
      });
      added.push(round.id);
      created.push(round.id);
      const rc = await f.prisma.roundClient.create({
        data: { round_id: round.id, client_id: client.id, status: 'open' },
      });
      await withPg(async (db) => {
        for (const [key, before, after] of [
          ['ZZA', 'n1', 'n3'],
          ['ZZB', 'n4', 'n2'],
          ['ZZC', 'n2', 'n2'],
        ] as const)
          await insertResponse(db, {
            round_client_id: rc.id,
            respondent_key: key,
            answers: { K9: i ? after : before },
            role: 'kontor',
          });
      });
    }
    const v = await view.perEmployee(created[1]!, undefined, f.session);
    expect(v.previous_round?.id).toBe(created[0]);
    expect(v.rows.map((r) => r.previous?.change)).toEqual(['opp', 'ned', 'likt']);
    const audit = await f.prisma.auditLog.findFirstOrThrow({
      where: { what: 'privacy.rows', target: `round:${created[1]}` },
      orderBy: { at: 'desc' },
    });
    expect(audit.details).toMatchObject({ count: 3, previous_count: 3 });
    expect(await f.get(`/api/admin/rows/per-employee?round=${created[1]}`, f.cookie)).toMatchObject(
      { statusCode: 200 },
    );
  });
});
