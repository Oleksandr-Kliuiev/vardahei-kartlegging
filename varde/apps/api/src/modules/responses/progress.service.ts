import {
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CodesService, requireCode } from '../rounds/codes.js';
import { SlidingWindow } from './sliding-window.js';

const Progress = z.strictObject({
  session_id: z.string().regex(/^[a-f0-9]{16,32}$/),
  question_no: z.number().int().min(0).max(1000),
  finished: z.boolean().optional(),
});
@Injectable()
export class ProgressService {
  private readonly limits = new SlidingWindow();
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodesService,
  ) {}
  async record(code: string, body: unknown, ip: string) {
    const result = Progress.safeParse(body);
    if (!result.success) throw new BadRequestException('Framdrifta er ikkje gyldig.');
    const initial = requireCode(await this.codes.resolveCode(code));
    const undo = this.limits.reserve([
      { key: `ip:${ip}`, max: 3000 },
      { key: `session:${initial.id}:${result.data.session_id}`, max: 300 },
    ]);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM round WHERE id = ${initial.round_id}::uuid FOR SHARE`;
        await tx.$queryRaw`SELECT id FROM round_client WHERE id = ${initial.id}::uuid FOR SHARE`;
        const rc = requireCode(await this.codes.resolveCode(code, new Date(), tx));
        const content = rc.round.template_version!.content as { questions?: unknown[] };
        if (result.data.question_no > (content.questions?.length ?? 0))
          throw new BadRequestException('Spørsmålet finst ikkje.');
        await tx.progressEvent.create({
          data: { round_client_id: rc.id, ...result.data, finished: result.data.finished ?? false },
        });
      });
    } catch (e) {
      undo();
      if (e instanceof HttpException) throw e;
      throw new ServiceUnavailableException('Framdrifta kunne ikkje lagrast.');
    }
  }
}
