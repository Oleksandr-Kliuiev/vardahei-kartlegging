// Stub submission (0.12): the same shape as the future Submission API 1.16 — validate, write
// in one transaction (INSERT … jsonb, unique submission_id), answer.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';

export const StubBody = z
  .object({
    submission_id: z.uuid(),
    answers: z.record(
      z.string().max(64),
      z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
    ),
  })
  .strict()
  .refine((b) => Object.keys(b.answers).length <= 100, 'too many answers');

export type StubResult = 'created' | 'duplicate';

@Injectable()
export class StubService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(body: z.infer<typeof StubBody>): Promise<StubResult> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.stubSubmission.create({
          data: { submission_id: body.submission_id, answers: body.answers },
        });
      });
      return 'created';
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return 'duplicate';
      throw error;
    }
  }
}
