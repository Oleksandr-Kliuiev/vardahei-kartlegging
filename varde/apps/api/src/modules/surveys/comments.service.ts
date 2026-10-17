// Notes on questions in the workshop (2.18, «kommentarar»): admins write them on a question or a part
// of a survey and mark them solved. They belong to the survey, so they follow the next draft, and
// say which version they were written on. Never shown to respondents, never in exports; the text
// stays out of AuditLog (who and where only).
import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { namesOf } from '../auth/people.js';

export const CommentInput = z.strictObject({
  node: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1, 'Skriv ein kommentar.').max(2000),
});
export const ResolveInput = z.strictObject({ resolved: z.boolean() });

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The notes of the survey of a version, oldest first, with names and the version they were on. */
  async list(versionId: string) {
    const v = await this.prisma.templateVersion.findUnique({ where: { id: versionId } });
    if (!v) throw new NotFoundException('Versjonen finst ikkje.');
    const rows = await this.prisma.questionComment.findMany({
      where: { template_id: v.template_id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      include: { template_version: { select: { version_no: true } } },
    });
    const names = await namesOf(
      this.prisma,
      rows.flatMap((r) => [r.created_by, r.resolved_by]),
    );
    return rows.map((r) => ({
      id: r.id,
      node: r.node,
      text: r.text,
      version_no: r.template_version?.version_no ?? null,
      created_at: r.created_at.toISOString(),
      created_by: names[r.created_by] ?? r.created_by,
      resolved_at: r.resolved_at?.toISOString() ?? null,
      resolved_by: r.resolved_by ? (names[r.resolved_by] ?? r.resolved_by) : null,
    }));
  }

  async add(versionId: string, input: z.infer<typeof CommentInput>, who: string) {
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.templateVersion.findUnique({ where: { id: versionId } });
      if (!v) throw new NotFoundException('Versjonen finst ikkje.');
      const c = await tx.questionComment.create({
        data: {
          template_id: v.template_id,
          template_version_id: v.id,
          node: input.node,
          text: input.text,
          created_by: who,
        },
      });
      await tx.auditLog.create({
        data: {
          who,
          what: 'surveys.comment',
          target: `template_version:${v.id}`,
          details: { node: input.node, comment: c.id },
        },
      });
      return { id: c.id };
    });
  }

  async resolve(id: string, resolved: boolean, who: string) {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.questionComment.findUnique({ where: { id } });
      if (!found) throw new NotFoundException('Kommentaren finst ikkje.');
      await tx.questionComment.update({
        where: { id },
        data: resolved
          ? { resolved_at: new Date(), resolved_by: who }
          : { resolved_at: null, resolved_by: null },
      });
      await tx.auditLog.create({
        data: {
          who,
          what: 'surveys.comment.resolve',
          target: `survey_template:${found.template_id}`,
          details: { comment: id, resolved },
        },
      });
      return { id, resolved };
    });
  }
}
