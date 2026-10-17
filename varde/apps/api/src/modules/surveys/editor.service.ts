import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { emptyTexts, unfinishedTexts } from '@varde/schema/template/respondent-texts';
import { TemplateContentShape, type TemplateContent } from '@varde/schema/template/template';
import { PrismaService } from '../../prisma/prisma.service.js';
import { namesOf } from '../auth/people.js';
import { contentHash, sourceHash } from './hashes.js';
import { PublishService } from './publish.service.js';
import { createEditorMetrics } from './editor-metrics.js';
import { SettingsService } from './settings.service.js';
import { keyOf, starterContent } from './starters.js';
import {
  emptyContent,
  issues,
  validated,
  validatedDraft,
  type TemplateInput,
  type DraftInput,
  type SaveInput,
} from './editor-contract.js';

/** What is left before a draft can be published: issues, empty texts, languages not approved. */
function leftOf(v: { content: unknown; translation_acceptance: unknown }): number {
  const shape = TemplateContentShape.safeParse(v.content);
  if (!shape.success) return Math.max(1, issues(v.content).length);
  const c = shape.data,
    hash = sourceHash(c);
  const accepted = v.translation_acceptance as Record<string, { source_hash?: string } | undefined>;
  // A language counts until it is approved for this source and every required text is written in it,
  // as publishing demands (2.16 review).
  const unfinished = unfinishedTexts(c);
  const languages = c.required_languages.filter(
    (l) =>
      accepted[l]?.source_hash !== hash ||
      // Written in Nynorsk but not in this language (an empty Nynorsk text counts once, above).
      unfinished.some((t) => t.text.nn.trim() && !(t.text[l] ?? '').trim()),
  ).length;
  return issues(c).length + emptyTexts(c).length + languages;
}

@Injectable()
export class EditorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: PublishService,
    private readonly settings: SettingsService,
  ) {}

  /** The library (2.16): each survey by its title, with its versions, rounds and open draft. */
  async list() {
    const templates = await this.prisma.surveyTemplate.findMany({
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
            created_at: true,
            published_at: true,
            published_by: true,
            content: true,
            translation_acceptance: true,
            _count: { select: { rounds: true } },
          },
        },
      },
    });
    const names = await namesOf(
      this.prisma,
      templates.flatMap((t) => t.versions.map((v) => v.published_by)),
    );
    return templates.map((t) => {
      const latest = t.versions[0]?.content as Partial<TemplateContent> | undefined;
      const draft = t.versions.find((v) => v.status === 'draft');
      return {
        id: t.id,
        key: t.key,
        audience: t.audience,
        title: latest?.intro?.title?.nn?.trim() || t.key,
        question_count: latest?.questions?.length ?? 0,
        languages: t.required_languages,
        rounds: t.versions.reduce((n, v) => n + v._count.rounds, 0),
        draft: draft ? { id: draft.id, version_no: draft.version_no, left: leftOf(draft) } : null,
        versions: t.versions.map((v) => ({
          id: v.id,
          label: v.label,
          version_no: v.version_no,
          status: v.status,
          identification: v.identification,
          required_languages: v.required_languages,
          created_at: v.created_at,
          published_at: v.published_at,
          published_by: v.published_by ? (names[v.published_by] ?? null) : null,
          rounds: v._count.rounds,
        })),
      };
    });
  }
  /** One version for the workshop, with the names of who approved and published it. */
  async view(id: string) {
    const v = await this.get(id);
    const accepted = Object.values(
      v.translation_acceptance as Record<string, { accepted_by?: string } | undefined>,
    ).map((a) => a?.accepted_by);
    const basis = Object.values(
      v.acceptance_basis as Record<string, { by?: string } | undefined>,
    ).map((a) => a?.by);
    // Every question id any version of the survey has used (2.18 review): a new question never gets
    // the id of a deleted one, so earlier answers and notes never attach to a different question.
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT q->>'id' AS id
      FROM template_version, jsonb_array_elements(content->'questions') AS q
      WHERE template_id = ${v.template_id}::uuid AND jsonb_typeof(content->'questions') = 'array'`;
    return {
      ...v,
      people: await namesOf(this.prisma, [v.published_by, ...accepted, ...basis]),
      used_ids: ids.map((r) => r.id).filter(Boolean),
    };
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
  /** A free key for a title: the title's own, else with -2, -3 … */
  private async freeKey(tx: Prisma.TransactionClient, wanted: string) {
    const taken = new Set(
      (
        await tx.surveyTemplate.findMany({
          where: { key: { startsWith: wanted } },
          select: { key: true },
        })
      ).map((t) => t.key),
    );
    // «auto» names the metrics a workshop version makes for itself (`auto.<version>.`).
    taken.add('auto');
    let key = wanted;
    for (let n = 2; taken.has(key); n += 1) key = `${wanted}-${n}`;
    return key;
  }
  /**
   * A new survey (2.16): by its title from a start for its kind, with the structure questions and the
   * defaults of «Innstillingar»; or a copy of a published version under a new title; or, as before,
   * an empty draft under a given key.
   */
  async create(input: z.infer<typeof TemplateInput>, who: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const base = input.copy_from
          ? await tx.templateVersion.findUnique({
              where: { id: input.copy_from },
              include: { template: true },
            })
          : null;
        if (input.copy_from && (!base || base.status !== 'published'))
          throw new BadRequestException('Vel ein publisert versjon å kopiere.');
        const audience = (base?.template.audience ?? input.audience) as TemplateContent['audience'];
        const langs = (base?.required_languages ??
          input.required_languages) as TemplateContent['required_languages'];
        const identification = (base?.identification ??
          input.identification) as TemplateContent['identification'];
        if (!langs.includes('nn') || (audience === 'client_survey' && !langs.includes('en')))
          throw new BadRequestException('Nynorsk er obligatorisk; kundeskjema krev òg engelsk.');
        if (new Set(langs).size !== langs.length)
          throw new BadRequestException('Vel kvart språk éin gong.');
        const title = input.title?.trim() ?? input.key!;
        const key = input.key ?? (await this.freeKey(tx, keyOf(title)));
        let content: TemplateContent;
        if (base) {
          content = { ...validated(base.content), key };
          content.intro = { ...content.intro, title: { ...content.intro.title, nn: title } };
        } else if (input.title !== undefined) {
          const { contact, sender } = await this.settings.defaults(tx);
          content = {
            ...starterContent({
              title,
              audience,
              identification,
              required_languages: langs,
              contact,
              sender,
            }),
            key,
          };
        } else content = emptyContent({ key, audience, identification, required_languages: langs });
        const template = await tx.surveyTemplate.create({
          data: { key, audience, required_languages: langs },
        });
        const version = await tx.templateVersion.create({
          data: {
            template_id: template.id,
            label: 'v1',
            version_no: 1,
            origin: 'authored',
            identification,
            required_languages: langs,
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
        // One draft per survey (decision 3 of 17.10): the open one is where work goes on.
        const open = await tx.templateVersion.findFirst({
          where: { template_id: templateId, status: 'draft' },
        });
        if (open)
          throw new ConflictException(
            `Det finst alt eit utkast (v${open.version_no}). Opne det i staden.`,
          );
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
            key: template.key,
            audience: template.audience as TemplateContent['audience'],
            identification: previous?.identification === 'none' ? 'none' : 'initials',
            required_languages:
              template.required_languages as TemplateContent['required_languages'],
          });
        const version = await tx.templateVersion.create({
          data: {
            template_id: templateId,
            label: input.label ?? `v${(previous?.version_no ?? 0) + 1}`,
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
    const content = validatedDraft(input.content);
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
