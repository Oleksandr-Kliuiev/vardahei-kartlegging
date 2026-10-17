// Publication of a template version with the translation gate (1.5, ADR-019) and the rule for
// frozen anchors (ADR-005): a changed frozen question needs `orthographic` (same anchor_key) or
// `semantic` (new anchor_key); the choice goes to the version and to AuditLog.
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Question } from '@varde/schema/template/question';
import { TemplateContentShape, type TemplateContent } from '@varde/schema/template/template';
import type { Lang } from '@varde/schema/template/texts';
import { TemplateVersionContent } from '@varde/schema/template/validate';
import { PrismaService } from '../../prisma/prisma.service.js';
import { respondentTexts } from '@varde/schema/template/respondent-texts';
import { canonical, contentHash, sourceHash } from './hashes.js';

export type FrozenChange = 'orthographic' | 'semantic';
export type Origin = 'authored' | 'kartlegging' | 'external_import';
export interface Acceptance {
  source_hash: string;
  accepted_by: string;
  at: string;
}

export class PublishRejected extends Error {
  override name = 'PublishRejected';
}

const REQUIRED: Record<TemplateContent['audience'], Lang[]> = {
  client_survey: ['nn', 'en'],
  seminar_live: ['nn'],
  seminar_after: ['nn'],
};

function parseShape(content: unknown): TemplateContent {
  const r = TemplateContentShape.safeParse(content);
  if (!r.success) throw new PublishRejected(`content: ${r.error.issues[0]?.message ?? 'invalid'}`);
  return r.data;
}

// A section title belongs to the section, not to the frozen question that happens to open it: moving a
// question to or from the top of a section, or renaming the section, changes no wording.
const withoutAnchor = (q: Question) =>
  canonical({ ...q, anchor_key: undefined, texts: { ...q.texts, section_title: undefined } });

/** Frozen questions of `prev` that changed in `next`, checked against the marks. */
export function frozenChanges(
  prev: TemplateContent,
  next: TemplateContent,
  marks: Record<string, FrozenChange> = {},
): { id: string; kind: FrozenChange }[] {
  const out: { id: string; kind: FrozenChange }[] = [];
  for (const old of prev.questions.filter((q) => q.frozen)) {
    const q = next.questions.find((x) => x.id === old.id);
    if (q === undefined) throw new PublishRejected(`frozen question ${old.id} removed`);
    if (withoutAnchor(q) === withoutAnchor(old) && q.anchor_key === old.anchor_key) continue;
    const kind = marks[old.id];
    if (kind === undefined)
      throw new PublishRejected(`frozen question ${old.id} changed without a mark`);
    if (kind === 'orthographic' && q.anchor_key !== old.anchor_key) {
      throw new PublishRejected(`orthographic change of ${old.id} keeps anchor_key`);
    }
    if (kind === 'semantic' && q.anchor_key === old.anchor_key) {
      throw new PublishRejected(`semantic change of ${old.id} needs a new anchor_key`);
    }
    out.push({ id: old.id, kind });
  }
  return out;
}

@Injectable()
export class PublishService {
  constructor(private readonly prisma: PrismaService) {}

  async createDraft(
    templateKey: string,
    content: unknown,
    opts: { label?: string; origin?: Origin } = {},
  ): Promise<{ id: string; version_no: number }> {
    const c = parseShape(content);
    if (c.key !== templateKey) throw new PublishRejected(`content key ${c.key} != ${templateKey}`);
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.surveyTemplate.upsert({
        where: { key: templateKey },
        create: {
          key: templateKey,
          audience: c.audience,
          required_languages: c.required_languages,
        },
        update: { required_languages: c.required_languages },
      });
      if (template.audience !== c.audience)
        throw new PublishRejected('audience of a template does not change');
      const last = await tx.templateVersion.aggregate({
        where: { template_id: template.id },
        _max: { version_no: true },
      });
      const versionNo = (last._max.version_no ?? 0) + 1;
      const v = await tx.templateVersion.create({
        data: {
          template_id: template.id,
          label: opts.label ?? `v${versionNo}`,
          version_no: versionNo,
          identification: c.identification,
          required_languages: c.required_languages,
          content: c,
          origin: opts.origin ?? 'authored',
          content_hash: contentHash(c),
        },
      });
      return { id: v.id, version_no: versionNo };
    });
  }

  /** Replaces the content of a draft (texts changed → acceptances no longer match the hash). */
  async updateDraft(versionId: string, content: unknown): Promise<void> {
    const c = parseShape(content);
    await this.prisma.templateVersion.update({
      where: { id: versionId, status: 'draft' },
      data: {
        content: c,
        identification: c.identification,
        required_languages: c.required_languages,
        content_hash: contentHash(c),
      },
    });
  }

  async acceptTranslation(versionId: string, lang: Lang, who: string): Promise<Acceptance> {
    return this.prisma.$transaction((tx) => this.acceptIn(tx, versionId, lang, who));
  }

  async acceptIn(
    tx: Prisma.TransactionClient,
    versionId: string,
    lang: Lang,
    who: string,
  ): Promise<Acceptance> {
    await tx.$queryRaw`SELECT id FROM template_version WHERE id = ${versionId}::uuid FOR UPDATE`;
    const v = await tx.templateVersion.findUniqueOrThrow({ where: { id: versionId } });
    if (v.status !== 'draft')
      throw new PublishRejected('only a draft takes translation acceptances');
    const content = parseShape(v.content);
    const acceptance: Acceptance = {
      source_hash: sourceHash(content),
      accepted_by: who,
      at: new Date().toISOString(),
    };
    const all = {
      ...(v.translation_acceptance as unknown as Record<string, Acceptance>),
      [lang]: acceptance,
    };
    // What was approved (2.16): the texts of this language and their Nynorsk source, kept through
    // later saves, so the workshop can name what changed after the approval.
    const texts = Object.fromEntries(
      respondentTexts(content).map((t) => [
        t.key,
        lang === 'nn' ? { nn: t.text.nn } : { nn: t.text.nn, [lang]: t.text[lang] ?? '' },
      ]),
    );
    const basis = {
      ...(v.acceptance_basis as Record<string, unknown>),
      [lang]: { at: acceptance.at, by: who, texts },
    };
    await tx.templateVersion.update({
      where: { id: versionId },
      data: {
        translation_acceptance: all as unknown as Prisma.InputJsonValue,
        acceptance_basis: basis as Prisma.InputJsonValue,
      },
    });
    return acceptance;
  }

  async publish(
    versionId: string,
    who: string,
    marks: Record<string, FrozenChange> = {},
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.templateVersion.findUniqueOrThrow({ where: { id: versionId } });
      await tx.$queryRaw`SELECT id FROM survey_template WHERE id = ${found.template_id}::uuid FOR UPDATE`;
      await this.publishIn(tx, versionId, who, marks);
    });
  }

  async publishIn(
    tx: Prisma.TransactionClient,
    versionId: string,
    who: string,
    marks: Record<string, FrozenChange> = {},
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM template_version WHERE id = ${versionId}::uuid FOR UPDATE`;
    const v = await tx.templateVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { template: true },
    });
    if (v.status !== 'draft') throw new PublishRejected('version is already published');
    const parsed = TemplateVersionContent.safeParse(v.content);
    if (!parsed.success) {
      throw new PublishRejected(`content: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }
    const c = parsed.data;
    if (c.audience !== v.template.audience)
      throw new PublishRejected('audience differs from the template');
    for (const lang of REQUIRED[c.audience]) {
      if (!c.required_languages.includes(lang))
        throw new PublishRejected(`${c.audience} requires ${lang}`);
    }
    const hash = sourceHash(c);
    const accepted = v.translation_acceptance as unknown as Record<string, Acceptance | undefined>;
    for (const lang of c.required_languages) {
      if (accepted[lang]?.source_hash !== hash)
        throw new PublishRejected(`language ${lang} is not accepted for the current source`);
    }
    const prev = await tx.templateVersion.findFirst({
      where: { template_id: v.template_id, status: 'published' },
      orderBy: { version_no: 'desc' },
    });
    const changes = prev === null ? [] : frozenChanges(parseShape(prev.content), c, marks);
    await tx.templateVersion.update({
      where: { id: versionId },
      data: {
        status: 'published',
        published_at: new Date(),
        published_by: who,
        frozen_changes: changes,
      },
    });
    const target = `template_version:${versionId}`;
    await tx.auditLog.create({
      data: {
        who,
        what: 'surveys.publish',
        target,
        details: { template: c.key, label: v.label, version_no: v.version_no },
      },
    });
    for (const change of changes) {
      await tx.auditLog.create({
        data: {
          who,
          what: 'surveys.frozen_change',
          target,
          details: { question: change.id, kind: change.kind },
        },
      });
    }
  }
}
