// 2.16 acceptance (integration): a new version of the security survey published in the workshop keeps
// the comparison with round 1 (ADR-005 anchors). The same answers given on the seeded version and on
// a workshop version with an orthographic F change, a moved F question and a renamed section give the
// same comparison; a semantic change never pairs the changed question with round 1.
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TemplateContent } from '@varde/schema/template/template';
import { ComparisonView } from '../../src/modules/dashboard/comparison-view.js';
import { MetricsService } from '../../src/modules/metrics/metrics.service.js';
import { MetricDefinition } from '@varde/schema/metrics/metric-definition';
import { subMetrics } from '@varde/rules/findings';
import { editorMetricPrefix } from '../../src/modules/surveys/editor-metrics.js';
import { EditorService } from '../../src/modules/surveys/editor.service.js';
import { dashboardFixture, type DashboardFixture } from '../dashboard/fixture.js';
import { insertResponse, withPg } from '../support/rounds.js';

let f: DashboardFixture, view: ComparisonView, editor: EditorService;
const who = 'test:acc-216';
const rounds: string[] = [],
  versions: string[] = [],
  templates: string[] = [];
type Q = TemplateContent['questions'][number];

// Twelve synthetic people in two clients, every scored question answered (privacy k holds).
const ANSWERS = [
  { F2: 'kontor', F3: 'ja', F4: 'nei', F5: 'delvis', F6: 'nei', F7: 'ja', F8: 'delvis', F9: 'nei' },
  { F2: 'prod', F3: 'nei', F4: 'ja', F5: 'ja', F6: 'usikker', F7: 'delvis', F8: 'ja', F9: 'ja' },
  {
    F2: 'kontor',
    F3: 'delvis',
    F4: 'usikker',
    F5: 'nei',
    F6: 'ja',
    F7: 'nei',
    F8: 'nei',
    F9: 'ja',
  },
].map((a, i) => ({
  ...a,
  F10: ['ja', 'sjeldan', 'oftast'][i],
  F11: ['nei', 'ja', 'usikker'][i],
  F12: ['ja', 'delvis', 'nei'][i],
  F13: ['nei', 'ja', 'usikker'][i],
  F14: ['ja', 'nei', 'usikker'][i],
  F16: ['delvis', 'ja', 'nei'][i],
  F17: ['avogtil', 'nei', 'ja'][i],
  F18: ['ja', 'nei', 'delvis'][i],
  F19: ['nei', 'ja', 'delvis'][i],
}));

async function roundOn(versionId: string, name: string) {
  const round = await f.prisma.round.create({
    data: {
      name,
      type: 'regular',
      status: 'open',
      identification: 'initials',
      template_version_id: versionId,
    },
  });
  rounds.push(round.id);
  for (const slug of ['daco', 'gasta']) {
    const client = await f.prisma.client.findUniqueOrThrow({ where: { slug } });
    const rc = await f.prisma.roundClient.create({
      data: { round_id: round.id, client_id: client.id, status: 'open' },
    });
    await withPg(async (db) => {
      for (let n = 0; n < 6; n++) {
        const answers = { F1: `Z${slug[0]!.toUpperCase()}${n}`, ...ANSWERS[n % 3]! };
        await insertResponse(db, {
          round_client_id: rc.id,
          role: answers.F2,
          respondent_key: answers.F1,
          answers,
        });
      }
    });
  }
  await f.prisma.round.update({
    where: { id: round.id },
    data: { status: 'closed', closed_at: new Date() },
  });
  await f.app.get(MetricsService).releaseRound(round.id, { type: 'auto', who: 'system' });
  return round.id;
}

/** A new version of «tryggleik» the way the workshop makes it: a draft copied from the latest
 * published version, saved, both languages approved, published with the marks. */
async function workshopVersion(
  change: (qs: Q[]) => Q[],
  marks: Record<string, 'orthographic' | 'semantic'>,
) {
  const template = await f.prisma.surveyTemplate.findUniqueOrThrow({ where: { key: 'tryggleik' } });
  const last = await f.prisma.templateVersion.findFirstOrThrow({
    where: { template_id: template.id, status: 'published' },
    orderBy: { version_no: 'desc' },
  });
  const draft = await editor.draft(template.id, { copy_from: last.id }, who);
  versions.push(draft.id);
  const content = structuredClone(draft.content) as unknown as TemplateContent;
  content.questions = change(content.questions);
  const saved = await editor.save(draft.id, { content_hash: draft.content_hash, content }, who);
  for (const lang of saved.required_languages)
    await editor.accept(draft.id, saved.content_hash, lang as 'nn' | 'en', who);
  await editor.publish(draft.id, saved.content_hash, marks, who);
  return draft.id;
}

const byId = (v: NonNullable<Awaited<ReturnType<ComparisonView['load']>>>) =>
  Object.fromEntries(
    v.questions.map((q) => [q.id, { before: q.before, now: q.now, change: q.change }]),
  );

let existing: Set<string>;
const ofTryggleik = async () =>
  (
    await f.prisma.templateVersion.findMany({
      where: { template: { key: 'tryggleik' } },
      select: { id: true },
    })
  ).map((v) => v.id);
beforeAll(async () => {
  f = await dashboardFixture();
  view = f.app.get(ComparisonView);
  editor = f.app.get(EditorService);
  existing = new Set(await ofTryggleik());
}, 180_000);
afterAll(async () => {
  // Everything this file made, also what a failing guard let through.
  versions.push(
    ...(await ofTryggleik()).filter((id) => !existing.has(id) && !versions.includes(id)),
  );
  for (const t of await f.prisma.surveyTemplate.findMany({
    where: { key: { startsWith: 'acc-216-' } },
  }))
    if (!templates.includes(t.id)) templates.push(t.id);
  for (const id of rounds) {
    await withPg((db) =>
      db.query(
        'DELETE FROM response WHERE round_client_id IN (SELECT id FROM round_client WHERE round_id=$1)',
        [id],
      ),
    );
    await f.prisma.roundClient.deleteMany({ where: { round_id: id } });
    await f.prisma.round.delete({ where: { id } });
  }
  // The workshop versions go, so later files see «tryggleik» as seeded (removed as table owner).
  for (const id of versions)
    await f.prisma.metricDefinition.deleteMany({
      where: { key: { startsWith: editorMetricPrefix(id) } },
    });
  await f.prisma.$executeRawUnsafe(
    'ALTER TABLE template_version DISABLE TRIGGER template_version_immutable',
  );
  await f.prisma.templateVersion.deleteMany({ where: { id: { in: versions } } });
  await f.prisma.$executeRawUnsafe(
    'ALTER TABLE template_version ENABLE TRIGGER template_version_immutable',
  );
  await f.prisma.templateVersion.deleteMany({ where: { template_id: { in: templates } } });
  await f.prisma.surveyTemplate.deleteMany({ where: { id: { in: templates } } });
  await f.prisma.auditLog.deleteMany({ where: { who } });
  await f.close();
});

describe('2.16 acceptance: workshop publication keeps the comparison with round 1', () => {
  let seeded: string, control: NonNullable<Awaited<ReturnType<ComparisonView['load']>>>;
  beforeAll(async () => {
    const v1 = await f.prisma.templateVersion.findFirstOrThrow({
      where: { template: { key: 'tryggleik' }, label: '2026-10-13' },
    });
    seeded = await roundOn(v1.id, 'acc-216 control (seeded version)');
    control = (await view.load(seeded))!;
    expect(control.baseline).toBe(f.runde1);
    expect(control.total.now.mean).not.toBeNull();
    expect(control.questions.find((q) => q.id === 'F5')!.now.mean).not.toBeNull();
  }, 120_000);

  let orthographic: string;
  it('orthographic F5, F7 moved to the top of the next section, a renamed section: only F5 is marked', async () => {
    const id = await workshopVersion(
      (qs) => {
        const at = (k: string) => qs.findIndex((q) => q.id === k);
        const out = qs.map((q) => structuredClone(q));
        const f5 = out[at('F5')]!;
        f5.texts.text = { ...f5.texts.text, nn: `${f5.texts.text.nn} ` };
        const f8 = out[at('F8')]!,
          f11 = out[at('F11')]!;
        const title = f8.texts.section_title!;
        delete f8.texts.section_title;
        const [f7] = out.splice(at('F7'), 1);
        f7!.texts.section_title = title;
        out.splice(at('F8'), 0, f7!);
        f11.texts.section_title = {
          ...f11.texts.section_title!,
          nn: 'Phishing, svindel og opplæring',
        };
        return out;
      },
      { F5: 'orthographic' },
    );
    const v = await f.prisma.templateVersion.findUniqueOrThrow({ where: { id } });
    expect(v.status).toBe('published');
    expect(v.frozen_changes).toEqual([{ id: 'F5', kind: 'orthographic' }]);
    orthographic = await roundOn(id, 'acc-216 orthographic');
    const now = await view.load(orthographic);
    expect(now, 'comparison with round 1 exists').not.toBeNull();
    expect(now!.baseline).toBe(f.runde1);
    const before = (x: typeof control) =>
      Object.fromEntries(x.questions.map((q) => [q.id, q.before]));
    expect(before(now!)).toEqual(before(control));
  });

  it('the same answers on the workshop version give the same comparison as on the seeded version', async () => {
    const now = (await view.load(orthographic))!;
    expect(byId(now)).toEqual(byId(control));
    expect(now.total).toEqual(control.total);
  });

  let semantic: string;
  it('a semantic change of F5 (new anchor) never pairs F5 with round 1', async () => {
    const id = await workshopVersion(
      (qs) =>
        qs.map((q) =>
          q.id === 'F5'
            ? {
                ...q,
                anchor_key: 'F5-acc216',
                texts: { ...q.texts, text: { ...q.texts.text, nn: 'Eit anna spørsmål?' } },
              }
            : q,
        ),
      { F5: 'semantic' },
    );
    const round = await roundOn(id, 'acc-216 semantic');
    semantic = round;
    const now = await view.load(round);
    const f5 = now?.questions.find((q) => q.id === 'F5');
    expect(f5?.before.mean ?? null, 'F5 is a new series').toBeNull();
    // Today the whole comparison goes (DashboardContext.previous wants the same anchor set, `now` is
    // null): safe, but stricter than «F5 starts a new series»; the other F questions could compare.
  });

  it('a workshop version keeps the template definitions whose questions kept their meaning (H1)', async () => {
    const metrics = f.app.get(MetricsService);
    const defs = (round: string) => metrics.definitionsFor(round);
    // One series per question, as the dashboard reads them (answer categories are a view of their own).
    const series = async (round: string) =>
      (await defs(round))
        .filter((d) => d.kind === 'distribution' && d.scale !== 'answer_categories')
        .map((d) => d.questions[0]!.key);
    // A spelling fix: zones, scores and findings of the template hold, and nothing counts twice.
    const kept = (await defs(orthographic)).map((d) => d.key);
    expect(kept).toEqual(
      expect.arrayContaining([
        'tryggleik.zone',
        'tryggleik.mean_score',
        'tryggleik.critical_share',
        'tryggleik.f5.distribution',
      ]),
    );
    const one = await series(orthographic);
    expect(one).toHaveLength(new Set(one).size);
    // A new meaning of F5: what reads F5 goes (a new metric version would bring it back), and F5 is
    // counted by the version's own distribution; the other questions keep the template's.
    const left = (await defs(semantic)).map((d) => d.key);
    expect(left).not.toContain('tryggleik.zone');
    expect(left).not.toContain('tryggleik.mean_score');
    expect(left).not.toContain('tryggleik.f5.distribution');
    expect(left).toContain('tryggleik.f6.distribution');
    const two = await series(semantic);
    expect(two.filter((k) => k === 'F5')).toHaveLength(1);
    expect(two).toHaveLength(new Set(two).size);
  });

  it('a round released before keeps the set it was released with (rule 4 of 1.4c)', async () => {
    const metrics = f.app.get(MetricsService);
    // Released now: the set holds what definitionsFor gives, nothing more.
    const set = await f.prisma.roundMetricSet.findUniqueOrThrow({
      where: { round_id: orthographic },
    });
    const now = (await metrics.definitionsFor(orthographic)).flatMap(subMetrics);
    expect(new Set(now)).toEqual(new Set(set.metric_keys));
    // Released before 2.16 with the version's own distributions only: it keeps exactly those.
    const v = (await f.prisma.round.findUniqueOrThrow({ where: { id: orthographic } }))
      .template_version_id!;
    const earlier = await f.prisma.round.create({
      data: {
        name: 'acc-216 released before',
        type: 'regular',
        status: 'closed',
        identification: 'initials',
        template_version_id: v,
      },
    });
    rounds.push(earlier.id);
    const own = (
      await f.prisma.metricDefinition.findMany({
        where: { key: { startsWith: editorMetricPrefix(v) } },
      })
    ).map((x) => MetricDefinition.parse(x.definition));
    await f.prisma.roundMetricSet.create({
      data: { round_id: earlier.id, metric_keys: own.flatMap(subMetrics) },
    });
    const kept = (await metrics.definitionsFor(earlier.id)).map((d) => d.key);
    expect(kept.length).toBe(own.length);
    expect(kept.every((k) => k.startsWith(editorMetricPrefix(v)))).toBe(true);
    await f.prisma.roundMetricSet.delete({ where: { round_id: earlier.id } });
  });

  it('a new question made in the workshop is counted by its own distribution', async () => {
    const id = await workshopVersion((qs) => {
      const out = qs.map((q) => structuredClone(q));
      const at = out.findIndex((q) => q.part === 'leader');
      out.splice(at < 0 ? out.length : at, 0, {
        id: 'Q90',
        type: 'single',
        part: 'common',
        texts: { text: { nn: 'Eit nytt spørsmål?', en: 'A new question?' } },
        options: [
          { id: 'a', texts: { text: { nn: 'Ja', en: 'Yes' } } },
          { id: 'b', texts: { text: { nn: 'Nei', en: 'No' } } },
        ],
      } as Q);
      return out;
    }, {});
    const round = await roundOn(id, 'acc-216 new question');
    const keys = (await f.app.get(MetricsService).definitionsFor(round))
      .filter((d) => d.kind === 'distribution')
      .map((d) => d.questions[0]!.key);
    expect(keys.filter((k) => k === 'Q90')).toHaveLength(1);
    expect(keys).toContain('F6');
  });

  it('the workshop sees which template numbers a draft keeps before it is published (2.18)', async () => {
    const metrics = f.app.get(MetricsService);
    const template = await f.prisma.surveyTemplate.findUniqueOrThrow({
      where: { key: 'tryggleik' },
    });
    const seededVersion = await f.prisma.templateVersion.findFirstOrThrow({
      where: { template_id: template.id, label: '2026-10-13' },
    });
    const draft = await editor.draft(template.id, { copy_from: seededVersion.id }, who);
    versions.push(draft.id);
    const holds = async () =>
      Object.fromEntries((await metrics.templateUses(draft.id)).map((u) => [u.key, u.holds]));
    const before = await holds();
    expect(before['tryggleik.zone']).toBe(true);
    expect(Object.values(before).every(Boolean)).toBe(true);
    const content = structuredClone(draft.content) as unknown as TemplateContent;
    const f6 = content.questions.find((q) => q.id === 'F6')!;
    f6.anchor_key = 'F6-acc218';
    await editor.save(draft.id, { content_hash: draft.content_hash, content }, who);
    const after = await holds();
    expect(after['tryggleik.zone']).toBe(false);
    expect(after['tryggleik.f6.distribution']).toBe(false);
    expect(after['tryggleik.f7.distribution']).toBe(true);
    // One draft per survey: this one goes, so later tests can make theirs.
    await f.prisma.templateVersion.delete({ where: { id: draft.id } });
  });

  it('an empty text in a language of the survey stops the publication on the server too (L1)', async () => {
    const template = await f.prisma.surveyTemplate.findUniqueOrThrow({
      where: { key: 'tryggleik' },
    });
    const last = await f.prisma.templateVersion.findFirstOrThrow({
      where: { template_id: template.id, status: 'published' },
      orderBy: { version_no: 'desc' },
    });
    const draft = await editor.draft(template.id, { copy_from: last.id }, who);
    versions.push(draft.id);
    const content = structuredClone(draft.content) as unknown as TemplateContent;
    const f6 = content.questions.find((q) => q.id === 'F6')!;
    f6.texts.text = { ...f6.texts.text, en: '' };
    const saved = await editor.save(draft.id, { content_hash: draft.content_hash, content }, who);
    for (const lang of saved.required_languages)
      await editor.accept(draft.id, saved.content_hash, lang as 'nn' | 'en', who);
    await expect(
      editor.publish(draft.id, saved.content_hash, { F6: 'orthographic' }, who),
    ).rejects.toThrow(/empty texts: q\.F6\.text/);
    expect(
      (await f.prisma.templateVersion.findUniqueOrThrow({ where: { id: draft.id } })).status,
    ).toBe('draft');
    // One draft per survey: this one goes, so later tests can make theirs.
    await f.prisma.templateVersion.delete({ where: { id: draft.id } });
  });
});

describe('2.16 acceptance: copies are made only from published versions', () => {
  it('a new survey never copies a draft; a new draft never copies another survey', async () => {
    const made = await editor.create(
      {
        title: 'acc-216 utkast',
        audience: 'client_survey',
        identification: 'initials',
        required_languages: ['nn', 'en'],
      },
      who,
    );
    templates.push(made.template_id);
    await expect(
      editor.create(
        {
          title: 'acc-216 kopi',
          audience: 'client_survey',
          identification: 'initials',
          required_languages: ['nn', 'en'],
          copy_from: made.id,
        },
        who,
      ),
    ).rejects.toThrow(/publisert versjon/);
    const ki = await f.prisma.templateVersion.findFirstOrThrow({
      where: { template: { key: 'ki' }, status: 'published' },
    });
    const tryggleik = await f.prisma.surveyTemplate.findUniqueOrThrow({
      where: { key: 'tryggleik' },
    });
    await expect(editor.draft(tryggleik.id, { copy_from: ki.id }, who)).rejects.toThrow(
      /publisert versjon av dette skjemaet/,
    );
    expect(
      await f.prisma.templateVersion.count({
        where: { template_id: tryggleik.id, status: 'draft' },
      }),
    ).toBe(0);
  });
});
