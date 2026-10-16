import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { auditWho } from '../auth/audit-who.js';
import { parseInput } from '../dashboard/dashboard.controller.js';
import { RulePreview } from './rule-preview.service.js';
import { RuleVersions } from './rule-versions.service.js';

const ListQuery = z.strictObject({
  family: z
    .string()
    .regex(/^[a-z0-9_-]+$/)
    .max(100),
  channel: z.enum(['aggregate', 'leader']),
});
const VersionInput = z.strictObject({
  base_version: z.number().int().positive().optional(),
  rule: z.unknown(),
});
const PreviewInput = z.strictObject({
  rule: z.unknown(),
  round: z.uuid(),
  client: z.string().min(1).max(100),
});
function ruleKey(key: string) {
  if (!/^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/.test(key) || key.length > 200)
    throw new NotFoundException('Regelen finst ikkje.');
  return key;
}

/** FindingRule editor (2.5): admin session only, every new version with AuditLog. */
@Controller('api/admin/finding-rules')
@UseGuards(AdminSessionGuard)
export class RuleEditorController {
  constructor(
    private readonly versions: RuleVersions,
    private readonly previews: RulePreview,
  ) {}
  @Get()
  list(@Query() query: unknown) {
    const q = parseInput(ListQuery, query);
    return this.versions.list(q.family, q.channel);
  }
  @Get(':key')
  history(@Param('key') key: string) {
    return this.versions.history(ruleKey(key));
  }
  @Post(':key/versions')
  create(@Param('key') key: string, @Body() body: unknown, @Req() r: AdminRequest) {
    return this.versions.create(
      ruleKey(key),
      parseInput(VersionInput, body),
      auditWho(r.adminSession),
    );
  }
  @Post(':key/preview')
  @HttpCode(200)
  preview(@Param('key') key: string, @Body() body: unknown, @Req() r: AdminRequest) {
    return this.previews.run(ruleKey(key), parseInput(PreviewInput, body), r.adminSession);
  }
}
