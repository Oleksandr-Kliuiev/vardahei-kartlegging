import { BadRequestException, Body, Controller, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { RoundsService } from './rounds.service.js';

const RoundInput = z.strictObject({ name: z.string().trim().min(1).max(200), template_version_id: z.uuid() });
const Day = z.iso.date();
const ClientInput = z.strictObject({ client_id: z.uuid(), population_snapshot: z.number().int().min(1), deadline: Day });
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException('Kontroller opplysningane.');
  return result.data;
}
const actor = (r: AdminRequest) => r.adminSession!.oid ?? r.adminSession!.sid;

@Controller('/api/admin')
@UseGuards(AdminSessionGuard)
export class RoundsController {
  constructor(private readonly rounds: RoundsService) {}

  @Post('/rounds')
  create(@Body() input: unknown, @Req() r: AdminRequest) {
    return this.rounds.create(parse(RoundInput, input), actor(r));
  }

  @Patch('/rounds/:id')
  version(@Param('id', ParseUUIDPipe) id: string, @Body() input: unknown, @Req() r: AdminRequest) {
    return this.rounds.setVersion(id, parse(z.strictObject({ template_version_id: z.uuid() }), input).template_version_id, actor(r));
  }

  @Post('/rounds/:id/clients')
  add(@Param('id', ParseUUIDPipe) id: string, @Body() input: unknown, @Req() r: AdminRequest) {
    return this.rounds.addClient(id, parse(ClientInput, input), actor(r));
  }

  @Post('/round-clients/:id/open')
  open(@Param('id', ParseUUIDPipe) id: string, @Req() r: AdminRequest) { return this.rounds.openClient(id, actor(r)); }

  @Post('/round-clients/:id/close')
  closeClient(@Param('id', ParseUUIDPipe) id: string, @Req() r: AdminRequest) { return this.rounds.closeClient(id, actor(r)); }

  @Patch('/round-clients/:id/deadline')
  deadline(@Param('id', ParseUUIDPipe) id: string, @Body() input: unknown, @Req() r: AdminRequest) {
    return this.rounds.setDeadline(id, parse(z.strictObject({ deadline: Day }), input).deadline, actor(r));
  }

  @Post('/round-clients/:id/reissue')
  reissue(@Param('id', ParseUUIDPipe) id: string, @Req() r: AdminRequest) { return this.rounds.reissue(id, actor(r)); }

  @Post('/rounds/:id/close')
  close(@Param('id', ParseUUIDPipe) id: string, @Req() r: AdminRequest) { return this.rounds.close(id, actor(r)); }

  @Post('/rounds/:id/release')
  release(@Param('id', ParseUUIDPipe) id: string, @Req() r: AdminRequest) { return this.rounds.release(id, actor(r)); }
}
