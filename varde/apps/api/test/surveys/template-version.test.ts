// Task 1.4a (integration): SurveyTemplate/TemplateVersion; a published version is immutable.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service.js';

const prisma = new PrismaService();
const KEY = `test-tv-${Date.now()}`;
let templateId: string;

beforeAll(async () => {
  const t = await prisma.surveyTemplate.create({
    data: { key: KEY, audience: 'client_survey', required_languages: ['nn', 'en'] },
  });
  templateId = t.id;
});

afterAll(async () => {
  // Published rows cannot be deleted through the app; the test removes them as table owner.
  await prisma.$executeRawUnsafe(
    'ALTER TABLE template_version DISABLE TRIGGER template_version_immutable',
  );
  await prisma.templateVersion.deleteMany({ where: { template_id: templateId } });
  await prisma.$executeRawUnsafe(
    'ALTER TABLE template_version ENABLE TRIGGER template_version_immutable',
  );
  await prisma.surveyTemplate.delete({ where: { id: templateId } });
  await prisma.$disconnect();
});

const version = (no: number, extra: object = {}) =>
  prisma.templateVersion.create({
    data: {
      template_id: templateId,
      label: `v${no}`,
      version_no: no,
      required_languages: ['nn', 'en'],
      content: { questions: [] },
      origin: 'authored',
      content_hash: 'a'.repeat(64),
      ...extra,
    },
  });

describe('template_version (1.4a)', () => {
  it('a draft can be updated and deleted', async () => {
    const v = await version(1);
    const u = await prisma.templateVersion.update({
      where: { id: v.id },
      data: { content: { questions: [1] } },
    });
    expect(u.content).toEqual({ questions: [1] });
    await prisma.templateVersion.delete({ where: { id: v.id } });
  });

  it('publishing a draft is an update of the draft row', async () => {
    const v = await version(2);
    const p = await prisma.templateVersion.update({
      where: { id: v.id },
      data: { status: 'published', published_at: new Date(), published_by: 'test' },
    });
    expect(p.status).toBe('published');
  });

  it('a published version: UPDATE content and DELETE → trigger error', async () => {
    const v = await version(3, {
      status: 'published',
      published_at: new Date(),
      published_by: 'test',
    });
    await expect(
      prisma.templateVersion.update({ where: { id: v.id }, data: { content: { changed: true } } }),
    ).rejects.toThrow(/template_version_immutable/);
    await expect(
      prisma.templateVersion.update({ where: { id: v.id }, data: { status: 'draft' } }),
    ).rejects.toThrow(/template_version_immutable/);
    await expect(prisma.templateVersion.delete({ where: { id: v.id } })).rejects.toThrow(
      /template_version_immutable/,
    );
  });

  it('unique (template, version_no) and (template, label); CHECKs on status and origin', async () => {
    await version(4);
    await expect(version(4, { label: 'other' })).rejects.toThrow();
    await expect(version(5, { label: 'v4' })).rejects.toThrow();
    await expect(version(6, { status: 'archived', published_at: new Date() })).rejects.toThrow(/status_check/);
    await expect(version(7, { origin: 'ai' })).rejects.toThrow(/origin_check/);
    await expect(version(8, { status: 'published' })).rejects.toThrow(/published_check/);
  });
});
