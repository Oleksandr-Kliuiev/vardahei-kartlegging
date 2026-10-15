import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { contentHash } from './hashes.js';
import { PublishService } from './publish.service.js';
import { createEditorMetrics } from './editor-metrics.js';
import {
  emptyContent,
  validated,
  type TemplateInput,
  type DraftInput,
  type SaveInput,
} from './editor-contract.js';

@Injectable()
export class EditorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: PublishService,
  ) {}

  list() {
    return this.prisma.surveyTemplate.findMany({
      orderBy: { key: 'asc' },
      include: {
        versions: {
          orderBy: { version_no: 'desc' },
          select: {
            id: true,
            version_no: true,
            label: true,
            status: true,
            identification: true,
            required_languages: true,
          },
        },
      },
    });
  }
  async get(id: string) {
    const version = await this.prisma.templateVersion.findUnique({
      where: { id },
      include: { template: true },
    });
    if (!version) throw new NotFoundException('Versjonen finst ikkje.');
    return version;
  }
  private audit(tx: Prisma.TransactionClient, who: string, what: string, id: string) {
    return tx.auditLog.create({
      data: { who, what: `surveys.${what}`, target: `template_version:${id}` },
    });
  }
  async create(input: z.infer<typeof TemplateInput>, who: string) {
    if (
      !input.required_languages.includes('nn') ||
      (input.audience === 'client_survey' && !input.required_languages.includes('en'))
    )
      throw new BadRequestException('Nynorsk er obligatorisk; kundeskjema krev òg engelsk.');
    if (new Set(input.required_languages).size !== input.required_languages.length)
      throw new BadRequestException('Vel kvart språk éin gong.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const template = await tx.surveyTemplate.create({
          data: {
            key: input.key,
            audience: input.audience,
            required_languages: input.required_languages,
          },
        });
        const content = emptyContent(input);
        const version = await tx.templateVersion.create({
          data: {
            template_id: template.id,
            label: 'v1',
            version_no: 1,
            origin: 'authored',
            identification: input.identification,
            required_languages: input.required_languages,
            content,
            content_hash: contentHash(content),
          },
        });
        await this.audit(tx, who, 'create', version.id);
        return version;
      });
    } catch (e) {
      return this.unique(e);
    }
  }
  private unique(e: unknown): never {
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002')
      throw new ConflictException('Nøkkel eller versjonsnamn er allereie i bruk.');
    throw e;
  }
  async draft(templateId: string, input: z.infer<typeof DraftInput>, who: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM survey_template WHERE id = ${templateId}::uuid FOR UPDATE`;
        const template = await tx.surveyTemplate.findUnique({ where: { id: templateId } });
        if (!template) throw new NotFoundException('Skjemaet finst ikkje.');
        const previous = await tx.templateVersion.findFirst({
          where: { template_id: templateId },
          orderBy: { version_no: 'desc' },
        });
        const base = input.copy_from
          ? await tx.templateVersion.findUnique({ where: { id: input.copy_from } })
          : null;
        if (
          input.copy_from &&
          (!base || base.template_id !== templateId || base.status !== 'published')
        )
          throw new BadRequestException('Vel ein publisert versjon av dette skjemaet.');
        const content =
          (base
            ? {
                ...validated(base.content),
                required_languages: template.required_languages as z.infer<
                  typeof TemplateInput
                >['required_languages'],
              }
            : null) ??
          emptyContent({
            ...template,
            audience: template.audience as z.infer<typeof TemplateInput>['audience'],
            identification: previous?.identification === 'none' ? 'none' : 'initials',
            required_languages: template.required_languages as z.infer<
              typeof TemplateInput
            >['required_languages'],
          });
        const version = await tx.templateVersion.create({
          data: {
            template_id: templateId,
            label: input.label,
            version_no: (previous?.version_no ?? 0) + 1,
            origin: 'authored',
            identification: base?.identification ?? previous?.identification ?? 'initials',
            required_languages: template.required_languages,
            content: content,
            content_hash: contentHash(content),
          },
        });
        await this.audit(tx, who, 'draft', version.id);
        return version;
      });
    } catch (e) {
      return this.unique(e);
    }
  }
  /** All mutations lock template then version, including publish, so publication cannot race a save. */
  async locked<T>(
    id: string,
    hash: string,
    work: (
      tx: Prisma.TransactionClient,
      v: Awaited<ReturnType<EditorService['get']>>,
    ) => Promise<T>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.templateVersion.findUnique({ where: { id } });
      if (!found) throw new NotFoundException('Versjonen finst ikkje.');
      await tx.$queryRaw`SELECT id FROM survey_template WHERE id = ${found.template_id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM template_version WHERE id = ${id}::uuid FOR UPDATE`;
      const v = await tx.templateVersion.findUniqueOrThrow({
        where: { id },
        include: { template: true },
      });
      if (v.status !== 'draft')
        throw new ConflictException('Publiserte versjonar kan ikkje endrast.');
      if (v.content_hash !== hash)
        throw new ConflictException('Ein annan har endra utkastet. Hent versjonen på nytt.');
      return work(tx, v);
    });
  }
  save(id: string, input: z.infer<typeof SaveInput>, who: string) {
    const content = validated(input.content);
    return this.locked(id, input.content_hash, async (tx, v) => {
      if (content.key !== v.template.key || content.audience !== v.template.audience)
        throw new BadRequestException('Nøkkel og målgruppe kan ikkje endrast.');
      const version = await tx.templateVersion.update({
        where: { id },
        data: {
          content,
          content_hash: contentHash(content),
          identification: content.identification,
          required_languages: content.required_languages,
          translation_acceptance: {},
        },
      });
      await tx.surveyTemplate.update({
        where: { id: v.template_id },
        data: { required_languages: content.required_languages },
      });
      await this.audit(tx, who, 'save', id);
      return version;
    });
  }
  accept(id: string, hash: string, lang: 'nn' | 'en' | 'nb', who: string) {
    return this.locked(id, hash, async (tx, v) => {
      validated(v.content);
      if (!v.required_languages.includes(lang))
        throw new BadRequestException('Språket er ikkje valt.');
      const acceptance = await this.publisher.acceptIn(tx, id, lang, who);
      await this.audit(tx, who, `translation.${lang}`, id);
      return acceptance;
    });
  }
  publish(
    id: string,
    hash: string,
    marks: Record<string, 'orthographic' | 'semantic'>,
    who: string,
  ) {
    return this.locked(id, hash, async (tx, v) => {
      await this.publisher.publishIn(tx, id, who, marks);
      await createEditorMetrics(tx, id, validated(v.content));
      await this.audit(tx, who, 'editor_metrics', id);
      return { id, status: 'published' };
    });
  }
}
