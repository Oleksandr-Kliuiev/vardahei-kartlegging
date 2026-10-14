import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { parseInput } from '../dashboard/dashboard.controller.js';
import { HandoverService } from './handover.js';

const input = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
  recipient: z.string().trim().min(1).max(200),
});
@Controller('api/admin')
@UseGuards(AdminSessionGuard)
export class HandoverController {
  constructor(private readonly handover: HandoverService) {}
  @Post('clients/:id/handover')
  async create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
    @Res() reply: FastifyReply,
  ) {
    const q = parseInput(input, body);
    const result = await this.handover.create(id, q.reason, q.recipient, req.adminSession);
    return reply.header('Cache-Control', 'no-store').send(result);
  }
  @Get('handover/:id.zip')
  download(@Param('id', ParseUUIDPipe) id: string, @Res() reply: FastifyReply) {
    const bytes = this.handover.take(id);
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', 'attachment; filename="varde-data.zip"')
      .type('application/zip')
      .send(Buffer.from(bytes));
  }
}
