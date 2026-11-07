// Step 3 of Samtalar on Postgres (decisions 3.1 and 3.2 of 07.11). A round keeps the guide version it was
// made with, and its conversations show the criteria of the newest published version of the same guide
// (the round's own where that one has none; never a draft, never another guide). A repeat conversation
// gets the client's previous finished one with the same guide: not another client's, not one in
// progress, not a later one, not one of another guide, not itself; and never a note.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeClients, seminarApp, type SeminarApp } from '../support/seminars.js';

let t: SeminarApp;
let clientA: string, clientB: string;
/** The guide in three versions (v1 and v2 published, v3 a draft), and a second guide. */
let v1: string, v2: string, other: string;
let spring: string, autumn: string, summer: string, otherGuide: string, winter: string;

type Texts = Record<string, { nn: string } | undefined>;
interface Content {
  questions: { id: string; texts: Texts }[];
}
interface Criteria {
  ivaretatt: string | null;
  forbetring: string | null;
  manglar: string | null;
}
interface View {
  guide: { questions: { id: string; criteria: Criteria | null }[] };
  previous: {
    id: string;
    held_on: string;
    round: { id: string; name: string };
    counts: Record<string, number>;
    score: number | null;
    answers: Record<string, { rating: string | null; answer: string; action: string }>;
  } | null;
}

const json = <T>(r: { json: <U>() => U }) => r.json<T>();
const surveyPath = (id: string) => `/api/admin/surveys/versions/${id}`;
const version = async (id: string) =>
  json<{ content: Content; content_hash: string; template_id: string }>(
    await t.call('GET', surveyPath(id)),
  );
const note = (what: string) => `NOTAT-${t.mark}-${what}`;
const ok = (r: { statusCode: number; body: string }) => {
  expect(r.statusCode, r.body).toBeLessThan(300);
  return r;
};

async function newGuide(title: string) {
  const r = ok(
    await t.call('POST', '/api/admin/surveys', {
      title: `${title} ${t.mark}`,
      audience: 'interview',
      identification: 'none',
      required_languages: ['nn'],
    }),
  );
  return json<{ id: string }>(r).id;
}
async function edit(id: string, change: (c: Content) => void) {
  const v = await version(id);
  change(v.content);
  ok(await t.call('PUT', surveyPath(id), { content_hash: v.content_hash, content: v.content }));
}
async function publish(id: string) {
  ok(
    await t.call('POST', `${surveyPath(id)}/accept`, {
      content_hash: (await version(id)).content_hash,
      lang: 'nn',
    }),
  );
  ok(
    await t.call('POST', `${surveyPath(id)}/publish`, {
      content_hash: (await version(id)).content_hash,
      confirmed: true,
    }),
  );
}
async function nextDraft(of: string) {
  const r = await t.call('POST', `/api/admin/surveys/${(await version(of)).template_id}/drafts`, {
    copy_from: of,
  });
  return json<{ id: string }>(ok(r)).id;
}
const set = (c: Content, id: string, key: string, nn: string | undefined) => {
  const q = c.questions.find((x) => x.id === id)!;
  q.texts[key] = nn === undefined ? undefined : { nn };
};
const answer = async (id: string, q: string, body: object) =>
  ok(await t.call('PUT', `/api/admin/interviews/${id}/answers/${q}`, body));

/** A round of one client on `guide`, its conversation started on `day` and rated. */
async function conversation(
  name: string,
  guide: string,
  client: string,
  day: string,
  ratings: Record<string, string>,
) {
  const r = await t.call('POST', '/api/admin/interview-rounds', {
    name: `${name} ${t.mark}`,
    template_version_id: guide,
    clients: [client],
  });
  const round = json<{ id: string }>(ok(r)).id;
  const id = json<{ interviews: { id: string }[] }>(
    await t.call('GET', `/api/admin/interview-rounds/${round}`),
  ).interviews[0]!.id;
  ok(
    await t.call('POST', `/api/admin/interviews/${id}/start`, {
      held_on: day,
      interviewees: [{ role: 'dagleg leiar' }],
    }),
  );
  for (const [q, rating] of Object.entries(ratings))
    await answer(id, q, { field: 'rating', value: rating, expect: null });
  return id;
}
const finish = async (id: string) => ok(await t.call('POST', `/api/admin/interviews/${id}/done`));
const view = async (id: string) => {
  const r = ok(await t.call('GET', `/api/admin/interviews/${id}`));
  return { body: r.body, v: json<View>(r) };
};

beforeAll(async () => {
  t = await seminarApp();
  [clientA, clientB] = (await makeClients(t, ['Gjenteke A', 'Gjenteke B'])).map((c) => c.id) as [
    string,
    string,
  ];
  // v1: own criteria on N2, N3 and N5; none on N4.
  v1 = await newGuide('Samtaleguide steg 3');
  await edit(v1, (c) => {
    set(c, 'N2', 'criteria_ivaretatt', `v1 N2 ${t.mark}`);
    set(c, 'N3', 'criteria_ivaretatt', `v1 N3 ${t.mark}`);
    set(c, 'N5', 'criteria_ivaretatt', `v1 N5 ${t.mark}`);
    for (const key of ['criteria_ivaretatt', 'criteria_forbetring', 'criteria_manglar'])
      set(c, 'N4', key, undefined);
  });
  await publish(v1);
  // v2: new words for N2, none left on N3, N5 gone.
  v2 = await nextDraft(v1);
  await edit(v2, (c) => {
    set(c, 'N2', 'criteria_ivaretatt', `v2 N2 ${t.mark}`);
    for (const key of ['criteria_ivaretatt', 'criteria_forbetring', 'criteria_manglar'])
      set(c, 'N3', key, undefined);
    c.questions = c.questions.filter((q) => q.id !== 'N5');
  });
  await publish(v2);
  // v3 stays a draft; another guide is published after all of them.
  const v3 = await nextDraft(v2);
  await edit(v3, (c) => set(c, 'N2', 'criteria_ivaretatt', `v3 N2 ${t.mark}`));
  other = await newGuide('Ein annan guide');
  await edit(other, (c) => set(c, 'N2', 'criteria_ivaretatt', `anna N2 ${t.mark}`));
  await publish(other);

  // Client A: spring (done, on v1), autumn (going, on v2), summer (going), another guide (done) and
  // winter (done later). Client B: one finished conversation.
  spring = await conversation('Vår', v1, clientA, '2026-05-04', {
    N2: 'forbetring',
    N3: 'ivaretatt',
  });
  await answer(spring, 'N2', { field: 'answer', value: `Dagleg leiar ${t.mark}`, expect: '' });
  await answer(spring, 'N2', { field: 'action', value: 'Peik ut ein ansvarleg', expect: '' });
  await answer(spring, 'N2', { field: 'note', value: note('svar'), expect: '' });
  await answer(spring, 'N4', { field: 'note', value: note('berre-notat'), expect: '' });
  ok(
    await t.call('PUT', `/api/admin/interviews/${spring}/fields`, {
      field: 'note',
      value: note('heile'),
      expect: '',
    }),
  );
  await finish(spring);
  await finish(await conversation('B vår', v1, clientB, '2026-06-01', { N2: 'manglar' }));
  autumn = await conversation('Haust', v2, clientA, '2026-11-10', {
    N2: 'ivaretatt',
    N3: 'manglar',
  });
  summer = await conversation('Sommar', v1, clientA, '2026-08-01', { N2: 'manglar' });
  otherGuide = await conversation('Anna', other, clientA, '2026-09-01', { N2: 'manglar' });
  await finish(otherGuide);
  winter = await conversation('Vinter', v2, clientA, '2026-12-01', {
    N2: 'ivaretatt',
    N3: 'forbetring',
    N4: 'ikkje_aktuelt',
  });
  await finish(winter);
});

afterAll(async () => {
  await t.prisma.interview.deleteMany({ where: { round: { name: { contains: t.mark } } } });
  await t.prisma.interviewRound.deleteMany({ where: { name: { contains: t.mark } } });
  await t.close();
});

describe('criteria (3.1)', () => {
  const ivaretatt = (v: View, id: string) =>
    v.guide.questions.find((q) => q.id === id)?.criteria?.ivaretatt ?? null;

  it('the standard guide has all three for each of its 27 questions', async () => {
    const { content } = await version(other);
    expect(content.questions).toHaveLength(27);
    for (const q of content.questions)
      for (const key of ['criteria_ivaretatt', 'criteria_forbetring', 'criteria_manglar'])
        expect(q.texts[key]?.nn.trim(), `${q.id} ${key}`).toBeTruthy();
    const n3 = content.questions.find((q) => q.id === 'N3')!.texts;
    expect(n3.criteria_manglar?.nn).toBe('Dei tilsette får ikkje vite om endringar.');
  });

  it('a round on v1 shows the newest published version’s, falling back to its own, never a draft', async () => {
    const { v } = await view(spring);
    expect(ivaretatt(v, 'N2')).toBe(`v2 N2 ${t.mark}`);
    // v2 has none for N3 and no N5: the round's own v1 words stay.
    expect(ivaretatt(v, 'N3')).toBe(`v1 N3 ${t.mark}`);
    expect(ivaretatt(v, 'N5')).toBe(`v1 N5 ${t.mark}`);
    expect(v.guide.questions.find((q) => q.id === 'N4')?.criteria).toBeNull();
    // The other two of N2 are v2's as well (the standard words, kept by both versions).
    expect(v.guide.questions.find((q) => q.id === 'N2')?.criteria?.manglar).toBe(
      'Ingen har ansvaret, eller ingen veit kven som har det.',
    );
    // The round keeps its own questions: N5 is still asked.
    expect(v.guide.questions.map((q) => q.id)).toContain('N5');
  });

  it('another guide keeps its own criteria', async () => {
    expect(ivaretatt((await view(otherGuide)).v, 'N2')).toBe(`anna N2 ${t.mark}`);
    expect(ivaretatt((await view(autumn)).v, 'N2')).toBe(`v2 N2 ${t.mark}`);
  });
});

describe('a repeat conversation (3.2)', () => {
  it('gets the previous finished one of the same client and guide, with what was said', async () => {
    const { v, body } = await view(autumn);
    expect(v.previous).toMatchObject({
      id: spring,
      held_on: '2026-05-04',
      round: { name: `Vår ${t.mark}` },
      counts: { ivaretatt: 1, forbetring: 1, manglar: 0, ikkje_aktuelt: 0 },
      score: 75,
    });
    expect(v.previous?.answers).toEqual({
      N2: {
        rating: 'forbetring',
        answer: `Dagleg leiar ${t.mark}`,
        action: 'Peik ut ein ansvarleg',
      },
      N3: { rating: 'ivaretatt', answer: '', action: '' },
    });
    // Neither the notes of its answers nor that of the whole conversation, nor a row that only had a note.
    expect(body).not.toContain(`NOTAT-${t.mark}`);
  });

  it('never another client’s, one in progress, a later one, another guide’s or itself', async () => {
    // Summer (in progress, August), client B (June), the other guide (September) and winter (December)
    // are all left out for autumn; for spring nothing came before it.
    expect((await view(summer)).v.previous?.id).toBe(spring);
    expect((await view(spring)).v.previous).toBeNull();
    expect((await view(otherGuide)).v.previous).toBeNull();
    expect((await view(winter)).v.previous?.id).toBe(spring);
    const b = json<{ id: string }[]>(
      await t.call('GET', `/api/admin/clients/${clientB}/interviews`),
    );
    expect((await view(b[0]!.id)).v.previous).toBeNull();
  });

  it('the client page compares the latest finished one with the previous: score, better, worse', async () => {
    const r = ok(await t.call('GET', `/api/admin/clients/${clientA}/interviews`));
    const rows = json<
      {
        id: string;
        score: number | null;
        change: {
          previous: { id: string; held_on: string; score: number | null };
          better: number;
          worse: number;
        } | null;
      }[]
    >(r);
    const of = (id: string) => rows.find((x) => x.id === id)!;
    // Winter against spring: N2 Forbetringspotensial → Ivaretatt, N3 Ivaretatt → Forbetringspotensial;
    // N4 «Ikkje aktuelt» is no move.
    expect(of(winter).change).toEqual({
      previous: { id: spring, held_on: '2026-05-04', score: 75 },
      better: 1,
      worse: 1,
    });
    for (const id of [spring, autumn, summer, otherGuide]) expect(of(id).change).toBeNull();
    expect(r.body).not.toContain(`NOTAT-${t.mark}`);
  });
});
