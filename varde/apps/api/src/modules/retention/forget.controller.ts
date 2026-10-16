import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { normalizeRespondentKey, RESPONDENT_KEY_LENGTH } from '@varde/rules/runner';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { parseInput } from '../dashboard/dashboard.controller.js';
import { Email } from '../seminars/seminar-input.js';
import { ForgetService } from './forget.service.js';

const scope = z.discriminatedUnion('scope', [
  z.strictObject({ scope: z.literal('client'), client: z.uuid() }),
  z.strictObject({
    scope: z.literal('respondent'),
    client: z.uuid(),
    respondent_key: z
      .string()
      .trim()
      .max(RESPONDENT_KEY_LENGTH)
      .transform(normalizeRespondentKey)
      .pipe(z.string().min(1)),
    round: z.uuid().optional(),
  }),
  z.strictObject({
    scope: z.literal('submissions'),
    submission_ids: z.array(z.uuid()).min(1).max(1000),
  }),
  // 3.1: a seminar participant (contact and registrations), found by e-mail.
  z.strictObject({ scope: z.literal('participant'), email: Email }),
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
