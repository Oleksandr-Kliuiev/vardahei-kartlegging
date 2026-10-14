import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { parseInput } from '../dashboard/dashboard.controller.js';
import { ForgetService } from './forget.service.js';

const scope = z.discriminatedUnion('scope', [
  z.strictObject({ scope: z.literal('client'), client: z.uuid() }),
  z.strictObject({
    scope: z.literal('respondent'),
    client: z.uuid(),
    respondent_key: z.string().regex(/^[A-Z]{2,6}$/),
    round: z.uuid().optional(),
  }),
  z.strictObject({
    scope: z.literal('submissions'),
    submission_ids: z.array(z.uuid()).min(1).max(1000),
  }),
]);
const input = z.strictObject({
  scope,
  reason: z.string().trim().min(1).max(1000),
  dry_run: z.boolean().default(false),
});
@Controller('api/admin/retention')
@UseGuards(AdminSessionGuard)
export class ForgetController {
  constructor(private readonly forget: ForgetService) {}
  @Post('forget')
  run(@Body() body: unknown, @Req() req: AdminRequest) {
    const q = parseInput(input, body);
    return this.forget.forget(q.scope, q.reason, req.adminSession, q.dry_run);
  }
}
