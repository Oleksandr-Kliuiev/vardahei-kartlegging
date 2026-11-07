// 2.21 on Postgres: the overview of «Samtalar», its CSV and the referat. The numbers are checked against
// a small table worked out by hand (below); the notes («Eige notat», the note of the whole conversation)
// carry a marker that must reach neither the overview, the CSV nor the referat; exports and referat
// reads are in AuditLog without anything typed.
//
// Round A: A1, A2, A3 finished, A4 not started. Round B: B1 finished, B2 going on. Unlisted = unrated.
//   A1: N2 ✓, N3 ! «Fast sak på personalmøtet», N4 ✕ «Reglar for privat e-post», N5 ·   → 50
//   A2: N2 ✕ «Peik ut ein IT-ansvarleg», N3 ✕ «fast sak på  personalmøtet.», N4 ✕ «Reglar for
//       privat e-post», N7 !                                                            → 13 (12.5)
//   A3: N2 ✓, N3 ✓, N4 ! «Ta det inn i arbeidsavtalen», N7 ✓                          → 88 (87.5)
//   B1: N2 !, N4 ✕ «Reglar for privat e-post.», N28 ✓                                  → 50
//   B2: N2 ✕, N3 ·, N4 ✓, N5 ✓                                                        → 67
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeClients, seminarApp, type SeminarApp } from '../support/seminars.js';
import { parseCsv } from '../support/csv.js';

let t: SeminarApp;
let roundA: string, roundB: string;
const ids: Record<string, string> = {};
let NOTE: string;

const json = <T>(r: { json: <U>() => U }) => r.json<T>();
type Counts = Record<'ivaretatt' | 'forbetring' | 'manglar' | 'ikkje_aktuelt' | 'none', number>;
const counts = (iv: number, fb: number, mg: number, na: number, none: number): Counts => ({
  ivaretatt: iv,
  forbetring: fb,
  manglar: mg,
  ikkje_aktuelt: na,
  none,
});
interface Overview {
  questions: { id: string; no: number; section: string; counts: Counts; actions: number }[];
  sections: { title: string; questions: string[]; counts: Counts; score: number | null }[];
  conversations: {
    id: string;
    status: string;
    held_on: string;
    client: { name: string };
    round: { name: string };
    counts: Counts;
    score: number | null;
    actions: number;
    cells: Record<string, { rating: string | null; answer: string; action: string }>;
  }[];
  totals: {
    conversations: number;
    done: number;
    in_progress: number;
    shown: number;
    counts: Counts;
    score: number | null;
    actions: number;
  };
  actions: { question: string; clients: number; texts: { text: string; clients: number }[] }[];
}

async function publishGuide(): Promise<string> {
  const path = (id: string) => `/api/admin/surveys/versions/${id}`;
  const created = await t.call('POST', '/api/admin/surveys', {
    title: `Samtaleguide oversikt ${t.mark}`,
    audience: 'interview',
    identification: 'none',
    required_languages: ['nn'],
  });
  const id = json<{ id: string }>(created).id;
  const hash = async () =>
    json<{ content_hash: string }>(await t.call('GET', path(id))).content_hash;
  await t.call('POST', `${path(id)}/accept`, { content_hash: await hash(), lang: 'nn' });
  const published = await t.call('POST', `${path(id)}/publish`, {
    content_hash: await hash(),
    confirmed: true,
  });
  expect(published.statusCode, published.body).toBe(201);
  return id;
}

type Answer = [question: string, rating: string, action?: string];
async function conversation(id: string, day: string, answers: Answer[], done: boolean) {
  const start = await t.call('POST', `/api/admin/interviews/${id}/start`, {
    held_on: day,
    interviewees: [{ role: 'dagleg leiar', name: `Kari ${t.mark}` }],
    interviewers: ['Asbjørn'],
  });
  expect(start.statusCode, start.body).toBe(201);
  const put = async (q: string, body: object) =>
    expect((await t.call('PUT', `/api/admin/interviews/${id}/answers/${q}`, body)).statusCode).toBe(
      200,
    );
  for (const [q, rating, action] of answers) {
    await put(q, { field: 'answer', value: `Svar ${q} ${t.mark}`, expect: '' });
    await put(q, { field: 'rating', value: rating, expect: null });
    if (action) await put(q, { field: 'action', value: action, expect: '' });
    await put(q, { field: 'note', value: `${NOTE} ${q}`, expect: '' });
  }
  const field = (f: string, value: string) =>
    t.call('PUT', `/api/admin/interviews/${id}/fields`, { field: f, value, expect: '' });
  expect((await field('summary', `Samla ${t.mark}`)).statusCode).toBe(200);
  expect((await field('agreed', `Avtalt ${t.mark}`)).statusCode).toBe(200);
  expect((await field('note', `${NOTE} heile`)).statusCode).toBe(200);
  if (done) expect((await t.call('POST', `/api/admin/interviews/${id}/done`)).statusCode).toBe(201);
}

async function round(name: string, clients: Record<string, string>) {
  const r = await t.call('POST', '/api/admin/interview-rounds', {
    name: `${name} ${t.mark}`,
    template_version_id: guide,
    clients: Object.values(clients),
  });
  expect(r.statusCode, r.body).toBe(201);
  const id = json<{ id: string }>(r).id;
  const view = json<{ interviews: { id: string; client: { id: string } }[] }>(
    await t.call('GET', `/api/admin/interview-rounds/${id}`),
  );
  for (const [key, client] of Object.entries(clients))
    ids[key] = view.interviews.find((i) => i.client.id === client)!.id;
  return id;
}

let guide: string;
beforeAll(async () => {
  t = await seminarApp();
  NOTE = `NOTAT-${t.mark}`;
  const names = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2'];
  const clients = await makeClients(
    t,
    names.map((n) => `Oversikt ${n}`),
  );
  const client = Object.fromEntries(names.map((n, i) => [n, clients[i]!.id]));
  guide = await publishGuide();
  roundA = await round('Haust', { A1: client.A1!, A2: client.A2!, A3: client.A3!, A4: client.A4! });
  roundB = await round('Vår', { B1: client.B1!, B2: client.B2! });
  await conversation(
    ids.A1!,
    '2026-11-10',
    [
      ['N2', 'ivaretatt'],
      ['N3', 'forbetring', 'Fast sak på personalmøtet'],
      ['N4', 'manglar', 'Reglar for privat e-post'],
      ['N5', 'ikkje_aktuelt'],
    ],
    true,
  );
  await conversation(
    ids.A2!,
    '2026-11-11',
    [
      ['N2', 'manglar', 'Peik ut ein IT-ansvarleg'],
      ['N3', 'manglar', 'fast sak på  personalmøtet.'],
      ['N4', 'manglar', 'Reglar for privat e-post'],
      ['N7', 'forbetring'],
    ],
    true,
  );
  await conversation(
    ids.A3!,
    '2026-11-12',
    [
      ['N2', 'ivaretatt'],
      ['N3', 'ivaretatt'],
      ['N4', 'forbetring', 'Ta det inn i arbeidsavtalen'],
      ['N7', 'ivaretatt'],
    ],
    true,
  );
  await conversation(
    ids.B1!,
    '2026-05-04',
    [
      ['N2', 'forbetring'],
      ['N4', 'manglar', 'Reglar for privat e-post.'],
      ['N28', 'ivaretatt'],
    ],
    true,
  );
  await conversation(
    ids.B2!,
    '2026-05-05',
    [
      ['N2', 'manglar'],
      ['N3', 'ikkje_aktuelt'],
      ['N4', 'ivaretatt'],
      ['N5', 'ivaretatt'],
    ],
    false,
  );
}, 120_000);

afterAll(async () => {
  await t.prisma.interview.deleteMany({ where: { round: { name: { contains: t.mark } } } });
  await t.prisma.interviewRound.deleteMany({ where: { name: { contains: t.mark } } });
  await t.close();
});

const overview = async (rounds: string[], inProgress = false) => {
  const r = await t.call(
    'GET',
    `/api/admin/interview-rounds/overview?rounds=${rounds.join(',')}${inProgress ? '&in_progress=true' : ''}`,
  );
  expect(r.statusCode, r.body).toBe(200);
  return { view: json<Overview>(r), body: r.body };
};

describe('the overview (2.21)', () => {
  it('one round, finished conversations only: the numbers of the table by hand', async () => {
    const { view: o, body } = await overview([roundA]);
    expect(o.totals).toEqual({
      conversations: 4,
      done: 3,
      in_progress: 0,
      shown: 3,
      counts: counts(4, 3, 4, 1, 69),
      score: 50,
      actions: 6,
    });
    const by = (key: string) => o.conversations.find((c) => c.id === ids[key]);
    expect(o.conversations.map((c) => c.id).sort()).toEqual([ids.A1, ids.A2, ids.A3].sort());
    expect(by('A1')).toMatchObject({
      status: 'done',
      held_on: '2026-11-10',
      round: { name: `Haust ${t.mark}` },
      counts: counts(1, 1, 1, 1, 23),
      score: 50,
      actions: 2,
    });
    expect(by('A2')).toMatchObject({ counts: counts(0, 1, 3, 0, 23), score: 13, actions: 3 });
    expect(by('A3')).toMatchObject({ counts: counts(3, 1, 0, 0, 23), score: 88, actions: 1 });
    expect(by('A1')!.cells.N4).toEqual({
      rating: 'manglar',
      answer: `Svar N4 ${t.mark}`,
      action: 'Reglar for privat e-post',
    });
    expect(by('A1')!.cells.N9).toEqual({ rating: null, answer: '', action: '' });
    const q = (id: string) => o.questions.find((x) => x.id === id)!;
    expect(o.questions).toHaveLength(27);
    expect(q('N2')).toMatchObject({ no: 1, counts: counts(2, 0, 1, 0, 0), actions: 1 });
    expect(q('N3')).toMatchObject({ no: 2, counts: counts(1, 1, 1, 0, 0), actions: 2 });
    expect(q('N4')).toMatchObject({ counts: counts(0, 1, 2, 0, 0), actions: 3 });
    expect(q('N5')).toMatchObject({ counts: counts(0, 0, 0, 1, 2), actions: 0 });
    expect(q('N7')).toMatchObject({ counts: counts(1, 1, 0, 0, 1) });
    expect(q('N28')).toMatchObject({ no: 27, counts: counts(0, 0, 0, 0, 3) });
    const s = (title: string) => o.sections.find((x) => x.title === title)!;
    expect(o.sections).toHaveLength(9);
    expect(s('Ansvar og rolle')).toEqual({
      title: 'Ansvar og rolle',
      questions: ['N2', 'N3'],
      counts: counts(3, 1, 2, 0, 0),
      score: 58,
    });
    expect(s('E-post, deling og tilgangar')).toMatchObject({
      counts: counts(0, 1, 2, 1, 5),
      score: 17,
    });
    expect(s('Utstyr og programvare')).toMatchObject({ counts: counts(1, 1, 0, 0, 1), score: 75 });
    expect(s('Personvern og informasjon')).toMatchObject({ score: null });
    // The same conclusion in other case, spaces or with a full stop is one wording.
    expect(o.actions).toEqual([
      {
        question: 'N4',
        clients: 3,
        texts: [
          { text: 'Reglar for privat e-post', clients: 2 },
          { text: 'Ta det inn i arbeidsavtalen', clients: 1 },
        ],
      },
      { question: 'N3', clients: 2, texts: [{ text: 'Fast sak på personalmøtet', clients: 2 }] },
      { question: 'N2', clients: 1, texts: [{ text: 'Peik ut ein IT-ansvarleg', clients: 1 }] },
    ]);
    // Never a note, never the summary or what was agreed (they belong to the referat).
    expect(body).not.toContain(NOTE);
    expect(body).not.toContain(`Samla ${t.mark}`);
    expect(body).not.toMatch(/"(?:note|answers)"\s*:/);
  });

  it('two rounds with those going on: the conversations add up by question', async () => {
    const { view: o } = await overview([roundA, roundB], true);
    expect(o.totals).toEqual({
      conversations: 6,
      done: 4,
      in_progress: 1,
      shown: 5,
      counts: counts(7, 4, 6, 2, 116),
      score: 54,
      actions: 7,
    });
    const b2 = o.conversations.find((c) => c.id === ids.B2)!;
    expect(b2).toMatchObject({ status: 'in_progress', counts: counts(2, 0, 1, 1, 23), score: 67 });
    const q = (id: string) => o.questions.find((x) => x.id === id)!;
    expect(q('N2').counts).toEqual(counts(2, 1, 2, 0, 0));
    expect(q('N4').counts).toEqual(counts(1, 1, 3, 0, 0));
    expect(q('N5').counts).toEqual(counts(1, 0, 0, 1, 3));
    expect(q('N28').counts).toEqual(counts(1, 0, 0, 0, 4));
    expect(o.actions[0]).toEqual({
      question: 'N4',
      clients: 4,
      texts: [
        { text: 'Reglar for privat e-post', clients: 3 },
        { text: 'Ta det inn i arbeidsavtalen', clients: 1 },
      ],
    });
    // Without those going on: B2 is out, the mean is of four.
    const { view: done } = await overview([roundA, roundB]);
    expect(done.totals).toMatchObject({ shown: 4, score: 50, in_progress: 1 });
    expect(done.conversations.some((c) => c.id === ids.B2)).toBe(false);
  });

  it('refuses no round, a bad id and a round that does not exist', async () => {
    const get = (q: string) => t.call('GET', `/api/admin/interview-rounds/overview${q}`);
    expect((await get('')).statusCode).toBe(400);
    expect((await get('?rounds=nei')).statusCode).toBe(400);
    expect((await get(`?rounds=${roundA}&in_progress=kanskje`)).statusCode).toBe(400);
    expect((await get(`?rounds=${roundA},00000000-0000-4000-8000-000000000000`)).statusCode).toBe(
      404,
    );
  });
});

describe('the CSV of the overview (2.21)', () => {
  it('has every question of each shown conversation, without notes; AuditLog counts it', async () => {
    const r = await t.call('GET', `/api/admin/interview-rounds/export.csv?rounds=${roundA}`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toBe('attachment; filename="samtalar.csv"');
    expect(r.headers['cache-control']).toBe('no-store');
    const rows = parseCsv(r.body);
    expect(rows[0]).toEqual([
      'Samtalerunde',
      'Kunde',
      'Dato',
      'Status',
      'Nr',
      'Tema',
      'Spørsmål',
      'Kva kunden sa',
      'Vurdering',
      'Konklusjon og tiltak',
      'Tiltak frå katalogen',
    ]);
    expect(rows.slice(1)).toHaveLength(3 * 27);
    const a1n4 = rows.find((x) => x[1] === `Oversikt A1 ${t.mark}` && x[4] === '3');
    expect(a1n4).toEqual([
      `Haust ${t.mark}`,
      `Oversikt A1 ${t.mark}`,
      '2026-11-10',
      'Fullført',
      '3',
      'E-post, deling og tilgangar',
      'Brukar tilsette privat e-post saman med jobb-e-post?',
      `Svar N4 ${t.mark}`,
      'Manglar',
      'Reglar for privat e-post',
      '',
    ]);
    expect(r.body).not.toContain(NOTE);
    expect(r.body).not.toContain(`Oversikt A4 ${t.mark}`);
    const log = await t.prisma.auditLog.findFirst({
      where: { what: 'interviews.export', target: `interview_round:${roundA}` },
      orderBy: { at: 'desc' },
    });
    expect(log?.details).toEqual({
      rounds: [roundA],
      in_progress: false,
      conversations: 3,
      rows: 81,
    });
  });

  it('two rounds with those going on: 5 conversations; AuditLog has both rounds', async () => {
    const r = await t.call(
      'GET',
      `/api/admin/interview-rounds/export.csv?rounds=${roundA},${roundB}&in_progress=true`,
    );
    expect(r.statusCode).toBe(200);
    const rows = parseCsv(r.body).slice(1);
    expect(rows).toHaveLength(5 * 27);
    expect(rows.filter((x) => x[3] === 'Pågår')).toHaveLength(27);
    expect(r.body).not.toContain(NOTE);
    const log = await t.prisma.auditLog.findFirst({
      where: { what: 'interviews.export', target: null, details: { path: ['rows'], equals: 135 } },
      orderBy: { at: 'desc' },
    });
    expect((log?.details as { rounds: string[] }).rounds.sort()).toEqual([roundA, roundB].sort());
  });

  it('a text that would start a formula is written as text', async () => {
    const put = (value: string, expect: string) =>
      t.call('PUT', `/api/admin/interviews/${ids.B2}/answers/N6`, {
        field: 'answer',
        value,
        expect,
      });
    expect((await put('=HYPERLINK("x")', '')).statusCode).toBe(200);
    const r = await t.call(
      'GET',
      `/api/admin/interview-rounds/export.csv?rounds=${roundB}&in_progress=true`,
    );
    const row = parseCsv(r.body).find((x) => x[1] === `Oversikt B2 ${t.mark}` && x[4] === '5');
    expect(row?.[7]).toBe(`'=HYPERLINK("x")`);
    expect((await put('', '=HYPERLINK("x")')).statusCode).toBe(200);
  });
});

describe('the referat (2.21)', () => {
  it('has what goes to the client and never a note; every read is in AuditLog', async () => {
    const before = await t.prisma.auditLog.count({
      where: { what: 'interviews.referat', target: `interview:${ids.A1}` },
    });
    const r = await t.call('GET', `/api/admin/interviews/${ids.A1}/referat`);
    expect(r.statusCode, r.body).toBe(200);
    const v = json<{
      status: string;
      held_on: string;
      client: { name: string };
      round: { name: string };
      interviewees: unknown;
      interviewers: string[];
      summary: string;
      agreed: string;
      counts: Counts;
      questions: {
        id: string;
        no: number;
        short: string;
        answer: string;
        rating: string | null;
        action: string;
      }[];
    }>(r);
    expect(v).toMatchObject({
      status: 'done',
      held_on: '2026-11-10',
      client: { name: `Oversikt A1 ${t.mark}` },
      round: { name: `Haust ${t.mark}` },
      interviewees: [{ role: 'dagleg leiar', name: `Kari ${t.mark}` }],
      interviewers: ['Asbjørn'],
      summary: `Samla ${t.mark}`,
      agreed: `Avtalt ${t.mark}`,
      counts: counts(1, 1, 1, 1, 23),
    });
    expect(v.questions).toHaveLength(27);
    expect(v.questions[2]).toEqual({
      id: 'N4',
      no: 3,
      short: 'Privat e-post',
      section: 'E-post, deling og tilgangar',
      answer: `Svar N4 ${t.mark}`,
      rating: 'manglar',
      action: 'Reglar for privat e-post',
      catalog: [],
    });
    expect(r.body).not.toContain(NOTE);
    expect(r.body).not.toMatch(/"note"\s*:/);
    expect(
      await t.prisma.auditLog.count({
        where: { what: 'interviews.referat', target: `interview:${ids.A1}` },
      }),
    ).toBe(before + 1);
  });

  it('a conversation going on gives its draft; one not started and an unknown one do not', async () => {
    const draft = await t.call('GET', `/api/admin/interviews/${ids.B2}/referat`);
    expect(draft.statusCode).toBe(200);
    expect(json<{ status: string }>(draft).status).toBe('in_progress');
    expect(draft.body).not.toContain(NOTE);
    expect((await t.call('GET', `/api/admin/interviews/${ids.A4}/referat`)).statusCode).toBe(409);
    expect(
      (await t.call('GET', '/api/admin/interviews/00000000-0000-4000-8000-000000000000/referat'))
        .statusCode,
    ).toBe(404);
  });

  it('AuditLog of exports and referat holds no typed text', async () => {
    const logs = JSON.stringify(
      await t.prisma.auditLog.findMany({
        where: { what: { in: ['interviews.export', 'interviews.referat'] } },
        orderBy: { at: 'desc' },
        take: 50,
      }),
    );
    expect(logs).toContain('interviews.referat');
    expect(logs).toContain('interviews.export');
    for (const typed of [t.mark, NOTE, 'Reglar for privat e-post', 'personalmøtet', 'Kari'])
      expect(logs).not.toContain(typed);
  });
});
