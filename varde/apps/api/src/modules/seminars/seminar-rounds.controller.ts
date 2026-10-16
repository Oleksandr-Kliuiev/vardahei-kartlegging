// Admin routes of a seminar's rounds (3.8): the card «Rundar» and the links «Før» and «Etter».
// A survey after the seminar is launched by the round wizard (POST /api/admin/rounds/launch with
// `seminar`), which links it in the same transaction.
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { auditWho } from '../auth/audit-who.js';
import { parseWith } from './seminar-input.js';
import { type RoundSlot, SeminarRoundsService } from './seminar-rounds.service.js';

const Link = z.strictObject({ round: z.uuid().nullable() });

@Controller('api/admin/seminars/:id')
@UseGuards(AdminSessionGuard)
export class SeminarRoundsController {
  constructor(private readonly rounds: SeminarRoundsService) {}

  @Get('rounds')
  card(@Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.card(id);
  }

  @Put('rounds/:slot')
  link(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slot') slot: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    if (slot !== 'before' && slot !== 'after') throw new NotFoundException();
    const input = parseWith(Link, body);
    return this.rounds.link(
      id,
      slot satisfies RoundSlot,
      input.round,
      auditWho(req.adminSession, true),
    );
  }
}
