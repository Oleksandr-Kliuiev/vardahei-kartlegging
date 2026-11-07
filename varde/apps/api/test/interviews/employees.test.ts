// 2.22c «Leiar vs tilsette» on Postgres: beside the questions of a conversation, the employees of that
// client in its latest released tryggleik survey, with the numbers the admin dashboard shows for the
// client and round. Groups under 3 are hidden, never another client's numbers, never an open (live),
// unreleased or post-seminar round, nothing for a client without such a survey or added to it after
// its release; the lines follow the questions of the guide and their order; a semantic change of an
// F question ends its pair while a T question is found by id; 401 without a session.
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TemplateContent } from '@varde/schema/template/template';
import type { EmployeeModel } from '../../src/modules/interviews/employee-view.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { PrivacyService } from '../../src/modules/privacy/privacy.service.js';
import {
  createEditorMetrics,
  editorMetricPrefix,
} from '../../src/modules/surveys/editor-metrics.js';
import { interviewGuideQuestions } from '../../src/modules/surveys/interview-guide.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { cookieHeader } from '../support/auth-app.js';
import { withPg } from '../support/rounds.js';
import { seedContent } from '../support/seed-dir.js';

type Model = Extract<EmployeeModel, { round: object }>;
type Line = Model['questions'][number]['employees'][number];
interface DashboardQuestion {
  id: string;
  label: string;
  short_label: string;
  series: {
    n: number | null;
    buckets: { id: string; label: string; cell: { suppressed: boolean; numerator?: number } }[];
  }[];
}

let f: DashboardFixture;
const mark = `zz${randomUUID().slice(0, 8)}`;
const conversation: Record<string, string> = {};
const client: Record<string, string> = {};
const rounds: Record<string, string> = {};
let seeded: string, haust: string;

const inject = (method: 'GET' | 'POST', url: string, payload?: object, cookie = true) =>
  f.app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method,
      url,
      ...(payload ? { payload } : {}),
      headers: cookie ? { cookie: cookieHeader(f.cookie) } : {},
    });
async function ok<T>(method: 'GET' | 'POST', url: string, payload?: object): Promise<T> {
  const r = await inject(method, url, payload);
  expect(r.statusCode, `${url}: ${r.body}`).toBeLessThan(300);
  return r.json<T>();
}
const employees = (who: string) =>
  ok<EmployeeModel>('GET', `/api/admin/interviews/${conversation[who]}/employees`);

/** Synthetic answers of the common part to every paired F question (keys ZZ…, no real initials). */
const PAIRED = ['F3', 'F5', 'F6', 'F7', 'F8', 'F9', 'F11', 'F12', 'F14', 'F16', 'F17', 'F18'];
const every = (value: string, mfa: string) => ({
  F2: 'kontor',
  ...Object.fromEntries(PAIRED.map((q) => [q, value])),
  F15: [mfa],
});
const ALL_NEI = every('nei', 'usikker');
const ALL_JA = every('ja', 'm365');

async function survey(
  name: string,
  version: string,
  status: 'open' | 'closed',
  clients: string[],
  type = 'regular',
): Promise<string> {
  const r = await f.prisma.round.create({
    data: {
      name: `${mark} ${name}`,
      type,
      status,
      template_version_id: version,
      identification: 'initials',
      opened_at: new Date(),
      closed_at: status === 'closed' ? new Date() : null,
    },
  });
  for (const client_id of clients)
    await f.prisma.roundClient.create({
      data: { round_id: r.id, client_id, status, population_snapshot: 10 },
    });
  return (rounds[name] = r.id);
}
async function answer(round: string, clientId: string, answers: Record<string, unknown>[]) {
  const rc = await f.prisma.roundClient.findUniqueOrThrow({
    where: { round_id_client_id: { round_id: round, client_id: clientId } },
  });
  await f.prisma.$transaction((tx) =>
    f.app.get(PrivacyService).store.insertParts(
      tx,
      answers.map((a) => ({
        round_client_id: rc.id,
        part: 'common' as const,
        role: 'kontor',
        lang: 'nn' as const,
        respondent_key: `ZZ${randomUUID().slice(0, 6).toUpperCase()}`,
        answers: a,
        free: {},
        submission_id: randomUUID(),
        content_hash: '0'.repeat(64),
        source_id: null,
        duration_s: null,
        submitted_day: '2026-10-20',
      })),
    ),
  );
}
const release = (round: string) =>
  f.app.get(MetricsService).releaseRound(round, { type: 'manual', who: 'test:employees' });
const times = <T>(n: number, x: T): T[] => Array.from({ length: n }, () => x);

/** A version of tryggleik as «Haust 2026» has it: T2 new, without an anchor, and here also F14 with
 * a semantic change (a new anchor). A draft, so the test can remove it again. */
async function haustVersion(): Promise<string> {
  const template = await f.prisma.surveyTemplate.findUniqueOrThrow({ where: { key: 'tryggleik' } });
  const last = await f.prisma.templateVersion.findFirst({
    where: { template_id: template.id },
    orderBy: { version_no: 'desc' },
  });
  const content = seedContent('tryggleik.2026-10-13') as unknown as TemplateContent;
  const at = content.questions.findIndex((q) => q.id === 'F20');
  const yes = (nn: string, en: string) => ({ texts: { text: { nn, en } } });
  const t2 = {
    id: 'T2',
    type: 'single' as const,
    part: 'common' as const,
    texts: { text: { nn: 'Deler du innlogging med kollegaer?', en: 'Do you share a login?' } },
    options: [
      { id: 'ja', ...yes('Ja', 'Yes') },
      { id: 'nei', ...yes('Nei', 'No') },
      { id: 'usikker', ...yes('Usikker', 'Not sure') },
    ],
  };
  const questions = content.questions.map((q) =>
    q.id === 'F14' ? { ...q, anchor_key: 'F14X' } : q,
  );
  const edited = { ...content, questions: [...questions.slice(0, at), t2, ...questions.slice(at)] };
  const v = await f.prisma.templateVersion.create({
    data: {
      template_id: template.id,
      label: `${mark}-haust`,
      version_no: (last?.version_no ?? 0) + 1,
      identification: 'initials',
      required_languages: ['nn', 'en'],
      content: edited,
      origin: 'authored',
      content_hash: '0'.repeat(64),
    },
  });
  await f.prisma.$transaction((tx) => createEditorMetrics(tx, v.id, edited));
  return v.id;
}

beforeAll(async () => {
  f = await dashboardFixture();
  seeded = (await f.prisma.round.findUniqueOrThrow({ where: { id: f.tryggleik } }))
    .template_version_id!;
  for (const slug of ['daco', 'gasta', 'tharaso'])
    client[slug] = (await f.prisma.client.findUniqueOrThrow({ where: { slug } })).id;
  for (const name of ['none', 'live', 'unreleased', 'small', 'import', 'late', 'haust'])
    client[name] = (
      await f.prisma.client.create({
        data: { slug: `${mark}-${name}`, name: `ZZ ${name} ${mark}` },
      })
    ).id;
  // Newer than Runde 2 for Daco: a live round (released once, answered since), an unreleased one
  // and a released survey after a seminar. None of them is the employees' latest released survey.
  const live = await survey('daco-live', seeded, 'open', [client.daco!, client.live!]);
  for (const c of [client.daco!, client.live!]) await answer(live, c, times(4, ALL_NEI));
  await release(live);
  for (const c of [client.daco!, client.live!]) await answer(live, c, times(3, ALL_JA));
  const closed = await survey('unreleased', seeded, 'closed', [client.daco!, client.unreleased!]);
  for (const c of [client.daco!, client.unreleased!]) await answer(closed, c, times(4, ALL_NEI));
  const after = await survey('after', seeded, 'closed', [client.daco!], 'post_seminar');
  await answer(after, client.daco!, times(4, ALL_NEI));
  await release(after);
  const small = await survey('small', seeded, 'closed', [client.small!]);
  await answer(small, client.small!, times(2, ALL_JA));
  await release(small);
  const imported = await survey('import', seeded, 'closed', [client.import!], 'external_import');
  await answer(imported, client.import!, [ALL_JA, ALL_NEI, ALL_NEI]);
  await release(imported);
  // A client added after the release has no released cells there, though the round has.
  await f.prisma.roundClient.create({
    data: { round_id: imported, client_id: client.late!, status: 'closed' },
  });
  haust = await haustVersion();
  const h = await survey('haust', haust, 'closed', [client.haust!]);
  await answer(
    h,
    client.haust!,
    ['ja', 'nei', 'nei', 'usikker'].map((T2, i) => ({ ...ALL_JA, T2, F14: i ? 'nei' : 'ja' })),
  );
  await release(h);
  // A published conversation guide (the 27 standard questions) and one conversation per client.
  const guide = (
    await ok<{ id: string }>('POST', '/api/admin/surveys', {
      title: `Samtaleguide ${mark}`,
      audience: 'interview',
      identification: 'none',
      required_languages: ['nn'],
    })
  ).id;
  const path = `/api/admin/surveys/versions/${guide}`;
  const hash = async () => (await ok<{ content_hash: string }>('GET', path)).content_hash;
  await ok('POST', `${path}/accept`, { content_hash: await hash(), lang: 'nn' });
  await ok('POST', `${path}/publish`, { content_hash: await hash(), confirmed: true });
  const round = (
    await ok<{ id: string }>('POST', '/api/admin/interview-rounds', {
      name: `Leiar og tilsette ${mark}`,
      template_version_id: guide,
      clients: Object.values(client),
    })
  ).id;
  const view = await ok<{ interviews: { id: string; client: { id: string } }[] }>(
    'GET',
    `/api/admin/interview-rounds/${round}`,
  );
  for (const [name, id] of Object.entries(client))
    conversation[name] = view.interviews.find((i) => i.client.id === id)!.id;
  // A guide of its own: three of the questions, last first. Lines follow the guide, not the pairs.
  const kort = await f.prisma.surveyTemplate.create({
    data: { key: `${mark}-kort`, audience: 'interview', required_languages: ['nn'] },
  });
  const questions = interviewGuideQuestions()
    .filter((q) => ['N2', 'N7', 'N28'].includes(q.id))
    .reverse();
  const short = await f.prisma.templateVersion.create({
    data: {
      template_id: kort.id,
      label: 'v1',
      version_no: 1,
      identification: 'none',
      required_languages: ['nn'],
      content: { key: kort.key, audience: 'interview', required_languages: ['nn'], questions },
      origin: 'authored',
      content_hash: '0'.repeat(64),
      status: 'published',
      published_at: new Date(),
      published_by: mark,
    },
  });
  const other = (
    await ok<{ id: string }>('POST', '/api/admin/interview-rounds', {
      name: `Kort guide ${mark}`,
      template_version_id: short.id,
      clients: [client.daco],
    })
  ).id;
  conversation.kort = (
    await ok<{ interviews: { id: string }[] }>('GET', `/api/admin/interview-rounds/${other}`)
  ).interviews[0]!.id;
}, 300_000);

afterAll(async () => {
  await f.prisma.interview.deleteMany({ where: { round: { name: { contains: mark } } } });
  await f.prisma.interviewRound.deleteMany({ where: { name: { contains: mark } } });
  await withPg(async (c) => {
    const ids = Object.values(rounds);
    await c.query(
      'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id = ANY($1::uuid[]))',
      [ids],
    );
    await c.query('DELETE FROM round_client WHERE round_id = ANY($1::uuid[])', [ids]);
    await c.query('DELETE FROM round WHERE id = ANY($1::uuid[])', [ids]);
  });
  if (haust) {
    await f.prisma.metricDefinition.deleteMany({
      where: { key: { startsWith: editorMetricPrefix(haust) } },
    });
    await f.prisma.templateVersion.delete({ where: { id: haust } });
  }
  await f.prisma.client.deleteMany({ where: { slug: { startsWith: `${mark}-` } } });
  await f.close();
});

/** The dashboard of the same client and round, question by question. */
async function dashboard(round: string, slug: string) {
  const d = await ok<{ source: string; questions: DashboardQuestion[] }>(
    'GET',
    `/api/admin/dashboard?round=${round}&client=${slug}`,
  );
  expect(d.source).toBe('released');
  return (id: string) => d.questions.find((q) => q.id === id)!;
}
/** Every line equals the dashboard: n, each option's label and count, hidden where it is hidden. */
async function sameAsDashboard(m: Model, slug: string) {
  const at = await dashboard(m.round.id, slug);
  let shown = 0;
  for (const line of m.questions.flatMap((q) => q.employees)) {
    const q = at(line.id);
    const s = q.series[0]!;
    expect([line.label, line.text], line.id).toEqual([q.short_label, q.label]);
    if (line.suppressed) {
      expect(s.n, line.id).toBeNull();
      continue;
    }
    expect(line.n, line.id).toBe(s.n);
    expect(line.options, line.id).toEqual(
      s.buckets.map((b) => ({ id: b.id, label: b.label, count: b.cell.numerator })),
    );
    shown += 1;
  }
  return shown;
}
const ids = (m: EmployeeModel) =>
  m.questions.map((q) => [q.question, q.employees.map((e: Line) => e.id)]);

describe('Leiar vs tilsette (2.22c)', () => {
  it('answers 401 without a session and 404 for an unknown conversation', async () => {
    const url = `/api/admin/interviews/${conversation.daco}/employees`;
    expect((await inject('GET', url, undefined, false)).statusCode).toBe(401);
    expect(
      (await inject('GET', `/api/admin/interviews/${randomUUID()}/employees`)).statusCode,
    ).toBe(404);
  });

  it('takes the latest released survey of the client: Runde 2, not newer live, unreleased or post-seminar rounds, not Runde 1', async () => {
    const m = (await employees('daco')) as Model;
    expect(m.class).toBe('aggregate');
    expect(m.round).toMatchObject({ id: f.tryggleik, name: 'Runde 2 IT-tryggleik' });
    // The seeded version has the F questions only: the T pairs have no line.
    expect(ids(m)).toEqual([
      ['N7', ['F18']],
      ['N9', ['F16']],
      ['N12', ['F14', 'F15']],
      ['N14', ['F7', 'F8']],
      ['N18', ['F3']],
      ['N20', ['F17']],
      ['N22', ['F11']],
      ['N23', ['F9']],
      ['N26', ['F11']],
      ['N27', ['F5', 'F6']],
      ['N28', ['F12']],
    ]);
    expect(await sameAsDashboard(m, 'daco')).toBe(14);
  });

  it("shows each client's own numbers, never another client's", async () => {
    const daco = (await employees('daco')) as Model;
    const gasta = (await employees('gasta')) as Model;
    expect(gasta.round.id).toBe(f.tryggleik);
    expect(await sameAsDashboard(gasta, 'gasta')).toBeGreaterThan(10);
    const lines = (m: Model) => JSON.stringify(m.questions);
    expect(lines(gasta)).not.toBe(lines(daco));
  });

  it('hides a group under 3 as a whole, with no number in the answer', async () => {
    for (const who of ['tharaso', 'small']) {
      const r = await inject('GET', `/api/admin/interviews/${conversation[who]}/employees`);
      const m = r.json<Model>();
      expect(m.round, who).not.toBeNull();
      const all = m.questions.flatMap((q) => q.employees);
      expect(all.length, who).toBe(14);
      expect(
        all.every((e) => e.suppressed),
        who,
      ).toBe(true);
      expect(r.body, who).not.toMatch(/"(n|count|options|numerator|denominator)"/);
    }
    expect(await sameAsDashboard((await employees('tharaso')) as Model, 'tharaso')).toBe(0);
  });

  it('gives nothing without a released, closed survey of the client', async () => {
    for (const who of ['none', 'live', 'unreleased', 'late'])
      expect(await employees(who), who).toEqual({ class: 'aggregate', round: null, questions: [] });
  });

  it('follows the questions of the conversation guide and their order', async () => {
    const m = (await employees('kort')) as Model;
    expect(m.round.id).toBe(f.tryggleik);
    expect(ids(m)).toEqual([
      ['N28', ['F12']],
      ['N7', ['F18']],
    ]);
    expect(await sameAsDashboard(m, 'daco')).toBe(2);
  });

  it('takes the imported round 1 when it is the only released survey', async () => {
    const m = (await employees('import')) as Model;
    expect(m.round.id).toBe(rounds.import);
    expect(await sameAsDashboard(m, `${mark}-import`)).toBe(14);
    expect(m.questions.find((q) => q.question === 'N12')!.employees[0]).toMatchObject({
      id: 'F14',
      suppressed: false,
      n: 3,
      options: [{ count: 1 }, { count: 2 }, { count: 0 }],
    });
  });

  it('takes an archived survey as well: archiving keeps its released numbers (acceptance m4)', async () => {
    await f.prisma.round.update({ where: { id: rounds.import }, data: { status: 'archived' } });
    try {
      const m = (await employees('import')) as Model;
      expect(m.round.id).toBe(rounds.import);
      expect(m.questions.find((q) => q.question === 'N12')!.employees[0]).toMatchObject({
        id: 'F14',
        suppressed: false,
        n: 3,
      });
    } finally {
      await f.prisma.round.update({ where: { id: rounds.import }, data: { status: 'closed' } });
    }
  });

  it('follows the anchor across versions: a new anchor ends the F14 pair, T2 is found by id', async () => {
    const m = (await employees('haust')) as Model;
    expect(m.round.id).toBe(rounds.haust);
    const n12 = m.questions.find((q) => q.question === 'N12')!;
    expect(n12.employees.map((e) => e.id)).toEqual(['F15']);
    const t2 = m.questions.find((q) => q.question === 'N13')!.employees;
    expect(t2).toEqual([
      {
        id: 'T2',
        label: 'Deler du innlogging med kollegaer?',
        text: 'Deler du innlogging med kollegaer?',
        multi: false,
        suppressed: false,
        n: 4,
        options: [
          { id: 'ja', label: 'Ja', count: 1 },
          { id: 'nei', label: 'Nei', count: 2 },
          { id: 'usikker', label: 'Usikker', count: 1 },
        ],
      },
    ]);
    // The dashboard still counts the changed F14 for the version: the anchor ends the pair.
    const at = await dashboard(rounds.haust!, `${mark}-haust`);
    expect(at('F14').series[0]!.n).toBe(4);
    expect(await sameAsDashboard(m, `${mark}-haust`)).toBe(14);
  });
});
