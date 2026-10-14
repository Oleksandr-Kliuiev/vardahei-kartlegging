// Task 1.5 (integration): publication with the translation gate (ADR-019) and frozen anchors (ADR-005).
import { afterAll, describe, expect, it } from 'vitest';
import { PublishService } from '../../src/modules/surveys/publish.service.js';
import { SeedTemplatesService } from '../../src/modules/surveys/seed-templates.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { SEED_DIR, seedContent } from '../support/seed-dir.js';

const prisma = new PrismaService();
const publisher = new PublishService(prisma);
const seeder = new SeedTemplatesService(prisma, publisher);
const RUN = Date.now().toString(36);
const WHO = `test:publish-${RUN}`;
let n = 0;

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { who: WHO } });
  await prisma.$disconnect();
});

/** The tryggleik seed content under a fresh key. */
function content(edit: (c: ReturnType<typeof seedContent>) => void = () => undefined) {
  const c = seedContent('tryggleik.2026-10-13');
  n += 1;
  c.key = `test-${RUN}-${n}`;
  edit(c);
  return c;
}

async function draft(
  c: ReturnType<typeof content>,
  langs = c.required_languages as ('nn' | 'en')[],
) {
  const d = await publisher.createDraft(c.key, c);
  for (const lang of langs) await publisher.acceptTranslation(d.id, lang, WHO);
  return d;
}

const F = (c: ReturnType<typeof content>, id: string) =>
  c.questions.find((q) => q.id === id) as { texts: { text: { nn: string } }; anchor_key?: string };

describe('publish with the translation gate (1.5)', () => {
  it('a client template with nn, en and without nb publishes', async () => {
    const c = content();
    const d = await draft(c);
    await publisher.publish(d.id, WHO);
    const v = await prisma.templateVersion.findUniqueOrThrow({ where: { id: d.id } });
    expect(v.status).toBe('published');
    expect(v.required_languages).toEqual(['nn', 'en']);
    expect(
      await prisma.auditLog.count({
        where: { who: WHO, what: 'surveys.publish', target: `template_version:${d.id}` },
      }),
    ).toBe(1);
  });

  it('a stale translation of an enabled language blocks publish', async () => {
    const c = content();
    const d = await draft(c);
    F(c, 'F3').texts.text.nn = `${F(c, 'F3').texts.text.nn} (endra)`;
    await publisher.updateDraft(d.id, c);
    await publisher.acceptTranslation(d.id, 'nn', WHO);
    await expect(publisher.publish(d.id, WHO)).rejects.toThrow(/language en is not accepted/);
    await publisher.acceptTranslation(d.id, 'en', WHO);
    await publisher.publish(d.id, WHO);
  });

  it('a client template without nn or without en is rejected', async () => {
    for (const langs of [['en'], ['nn']] as const) {
      const c = content((x) => (x.required_languages = [...langs]));
      const d = await draft(c);
      await expect(publisher.publish(d.id, WHO)).rejects.toThrow(/requires (nn|en)/);
    }
  });

  it('a live template with nn only publishes', async () => {
    const c = content((x) => {
      x.audience = 'seminar_live';
      x.required_languages = ['nn'];
    });
    const d = await draft(c);
    await publisher.publish(d.id, WHO);
    expect((await prisma.templateVersion.findUniqueOrThrow({ where: { id: d.id } })).status).toBe(
      'published',
    );
  });

  it('a changed frozen question without a mark is rejected; with a mark → AuditLog', async () => {
    const c = content();
    await publisher.publish((await draft(c)).id, WHO);
    F(c, 'F3').texts.text.nn = `${F(c, 'F3').texts.text.nn}.`;
    const d = await draft(c);
    await expect(publisher.publish(d.id, WHO)).rejects.toThrow(/F3 changed without a mark/);
    await expect(publisher.publish(d.id, WHO, { F3: 'semantic' })).rejects.toThrow(
      /needs a new anchor_key/,
    );
    await publisher.publish(d.id, WHO, { F3: 'orthographic' });
    const audit = await prisma.auditLog.findMany({
      where: { who: WHO, what: 'surveys.frozen_change', target: `template_version:${d.id}` },
    });
    expect(audit.map((a) => a.details)).toEqual([{ question: 'F3', kind: 'orthographic' }]);
    const v = await prisma.templateVersion.findUniqueOrThrow({ where: { id: d.id } });
    expect(v.frozen_changes).toEqual([{ id: 'F3', kind: 'orthographic' }]);
  });

  it('a semantic change takes a new anchor_key', async () => {
    const c = content();
    await publisher.publish((await draft(c)).id, WHO);
    F(c, 'F5').texts.text.nn = 'Nytt spørsmål om rutinar?';
    F(c, 'F5').anchor_key = 'F5b';
    const d = await draft(c);
    await publisher.publish(d.id, WHO, { F5: 'semantic' });
  });

  it('a published version is not published again; its draft is not edited', async () => {
    const c = content();
    const d = await draft(c);
    await publisher.publish(d.id, WHO);
    await expect(publisher.publish(d.id, WHO)).rejects.toThrow(/already published/);
    await expect(publisher.acceptTranslation(d.id, 'en', WHO)).rejects.toThrow(/only a draft/);
  });

  it('seedTemplates twice → one version per file', async () => {
    await seeder.seedTemplates(SEED_DIR, 'seed');
    const second = await seeder.seedTemplates(SEED_DIR, 'seed');
    expect(second.created).toEqual([]);
    expect(second.unchanged.sort()).toEqual([
      'ki@2026-10-12',
      'ki@2026-10-13',
      'tryggleik@2026-10-13',
    ]);
    const seeded: [string, string][] = [
      ['ki', '2026-10-12'],
      ['ki', '2026-10-13'],
      ['tryggleik', '2026-10-13'],
    ];
    for (const [key, label] of seeded) {
      expect(await prisma.templateVersion.count({ where: { label, template: { key } } })).toBe(1);
    }
    const ki12 = await prisma.templateVersion.findFirstOrThrow({
      where: { label: '2026-10-12', template: { key: 'ki' } },
    });
    expect([ki12.identification, ki12.origin]).toEqual(['none', 'kartlegging']);
  });
});
