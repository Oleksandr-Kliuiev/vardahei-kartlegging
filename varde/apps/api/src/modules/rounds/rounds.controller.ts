import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { auditWho } from '../auth/audit-who.js';
import { RoundsService } from './rounds.service.js';

const RoundInput = z.strictObject({
  name: z.string().trim().min(1).max(200),
  template_version_id: z.uuid(),
});
const Day = z.iso.date();
const ClientInput = z.strictObject({
  client_id: z.uuid(),
  population_snapshot: z.number().int().min(1).nullable().optional(),
  deadline: Day,
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException('Kontroller opplysningane.');
  return result.data;
}

@Controller('/api/admin')
@UseGuards(AdminSessionGuard)
export class RoundsController {
  constructor(private readonly rounds: RoundsService) {}

  @Post('/rounds/launch')
  launch(@Body() input: unknown, @Req() r: AdminRequest) {
    const value = parse(
      RoundInput.extend({
        clients: z.array(ClientInput).min(1).max(500),
        open: z.boolean(),
      }),
      input,
    );
    return this.rounds.launch(value, auditWho(r.adminSession));
  }

  @Post('/rounds')
  create(@Body() input: unknown, @Req() r: AdminRequest) {
    return this.rounds.create(parse(RoundInput, input), auditWho(r.adminSession));
  }

  @Patch('/rounds/:id')
  version(@Param('id', ParseUUIDPipe) id: string, @Body() input: unknown, @Req() r: AdminRequest) {
    return this.rounds.setVersion(
      id,
      parse(z.strictObject({ template_version_id: z.uuid() }), input).template_version_id,
      auditWho(r.adminSession),
    );
  }

  @Post('/rounds/:id/clients')
  add(@Param('id', ParseUUIDPipe) id: string, @Body() input: unknown, @Req() r: AdminRequest) {
    return this.rounds.addClient(id, parse(ClientInput, input), auditWho(r.adminSession));
  }

  @Post('/round-clients/:id/open')
  open(@Param('id', ParseUUIDPipe) id: string, @Req() r: AdminRequest) {
    return this.rounds.openClient(id, auditWho(r.adminSession));
  }

  @Post('/round-clients/:id/close')
  closeClient(@Param('id', ParseUUIDPipe) id: string, @Req() r: AdminRequest) {
    return this.rounds.closeClient(id, auditWho(r.adminSession));
  }

  @Patch('/round-clients/:id/deadline')
  deadline(@Param('id', ParseUUIDPipe) id: string, @Body() input: unknown, @Req() r: AdminRequest) {
    return this.rounds.setDeadline(
      id,
      parse(z.strictObject({ deadline: Day }), input).deadline,
      auditWho(r.adminSession),
    );
  }

  @Post('/round-clients/:id/reissue')
  reissue(@Param('id', ParseUUIDPipe) id: string, @Req() r: AdminRequest) {
    return this.rounds.reissue(id, auditWho(r.adminSession));
  }

  @Post('/rounds/:id/close')
  close(@Param('id', ParseUUIDPipe) id: string, @Req() r: AdminRequest) {
    return this.rounds.close(id, auditWho(r.adminSession));
  }

  @Post('/rounds/:id/release')
  release(@Param('id', ParseUUIDPipe) id: string, @Req() r: AdminRequest) {
    return this.rounds.release(id, auditWho(r.adminSession));
  }
}
