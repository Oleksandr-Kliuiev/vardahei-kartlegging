import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { TemplateContent } from '@varde/schema/template/template';
import { normalizeAnswers, normalizeFree, prune, visibleQuestions } from '@varde/rules/runner';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PrivacyService } from '../privacy/privacy.service.js';
import { CodesService, requireCode } from '../rounds/codes.js';
import { contentHash } from '../surveys/hashes.js';
import { QuotaService } from './quota.service.js';
import { Submission } from './submission.schema.js';

@Injectable()
export class SubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodesService,
    private readonly privacy: PrivacyService,
    private readonly quotas: QuotaService,
  ) {}

  async submit(code: string, body: unknown, ip: string) {
    const parsed = Submission.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Innsendinga er ikkje gyldig.');
    const { submission_id, ...payload } = parsed.data;
    const hash = contentHash(payload);
    const initial = requireCode(await this.codes.resolveCode(code));
    let undo: (() => void) | undefined;
    try {
      await this.prisma.$transaction(async (tx) => {
        // UUID-wide serialization also covers concurrent requests on different clients.
        // Forget must take the same advisory lock before writing its tombstone (ADR-017).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${submission_id.toLowerCase()}, 0))`;
        // Same lock order as lifecycle: Round, then RoundClient. Revalidate under lock.
        await tx.$queryRaw`SELECT id FROM round WHERE id = ${initial.round_id}::uuid FOR SHARE`;
        await tx.$queryRaw`SELECT id FROM round_client WHERE id = ${initial.id}::uuid FOR UPDATE`;
        const rc = requireCode(await this.codes.resolveCode(code, new Date(), tx));
        const existing = await this.privacy.store.findBySubmission(tx, submission_id);
        if (existing !== null) {
          if (existing.content_hash !== hash || existing.round_client_id !== rc.id)
            throw new ConflictException('Innsendinga har anna innhald.');
          return;
        }
        const tombstones = await tx.deletionTombstone.findMany({
          where: { submission_id },
          select: {
            content_hash: true,
            round_id: true,
            client_id: true,
          },
        });
        if (tombstones.length > 0) {
          if (
            tombstones.some(
              (t) =>
                t.content_hash !== hash ||
                t.round_id !== rc.round_id ||
                t.client_id !== rc.client_id,
            )
          )
            throw new ConflictException('Innsendinga har anna innhald.');
          return;
        }
        const version = rc.round.template_version!.content as unknown as TemplateContent;
        if (!version.required_languages.includes(payload.lang))
          throw new BadRequestException('Språket er ikkje tilgjengeleg.');
        if (
          version.identification === 'none' &&
          Object.keys(payload.answers).some((id) => !version.questions.some((q) => q.id === id))
        )
          throw new BadRequestException('Spørsmålet finst ikkje i denne kartlegginga.');
        if (
          payload.part === 'leader' &&
          (payload.role === undefined || !version.leader_roles.includes(payload.role))
        )
          throw new BadRequestException('Vel ei gyldig leiarrolle.');
        const roleQuestion = version.questions.find((q) => q.role);
        const raw = { ...payload.answers };
        if (payload.part === 'leader' && roleQuestion) raw[roleQuestion.id] = payload.role;
        const normalized = normalizeAnswers(version, raw);
        if (version.identification === 'initials' && normalized.respondent_key === null)
          throw new BadRequestException('Skriv inn initialane dine.');
        const clean = prune(version, normalized.answers);
        const ids = new Set(
          visibleQuestions(version, clean)
            .filter((q) => q.part === payload.part && !q.identifier)
            .map((q) => q.id),
        );
        const answers = Object.fromEntries(Object.entries(clean).filter(([id]) => ids.has(id)));
        const free = Object.fromEntries(
          Object.entries(normalizeFree(version, payload.free ?? {})).filter(([id]) => {
            if (!ids.has(id)) return false;
            const q = version.questions.find((q) => q.id === id)!;
            return (
              'free_text' in q &&
              q.free_text !== undefined &&
              (q.free_text.when === undefined ||
                q.free_text.when.some((o) =>
                  Array.isArray(clean[id]) ? clean[id].includes(o) : clean[id] === o,
                ))
            );
          }),
        );
        undo = await this.quotas.consume(rc, tx, ip);
        const role = roleQuestion ? clean[roleQuestion.id] : undefined;
        await this.privacy.store.insertParts(tx, [
          {
            round_client_id: rc.id,
            part: payload.part,
            lang: payload.lang,
            role: typeof role === 'string' ? role : null,
            respondent_key: normalized.respondent_key,
            answers,
            free,
            submission_id,
            content_hash: hash,
            source_id: null,
            duration_s: payload.duration_s ?? null,
            submitted_day: new Date().toISOString().slice(0, 10),
          },
        ]);
      });
    } catch (error) {
      undo?.(); // process-window reservations are rolled back when the insert fails
      if (error instanceof HttpException) throw error;
      // Prisma errors can contain answers/initials. Never pass them to the exception logger.
      throw new ServiceUnavailableException('Svara kom ikkje fram. Prøv igjen.');
    }
    return { ok: true, submission_id };
  }
}
