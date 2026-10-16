// Admin routes of a seminar's rounds (3.8): the card «Rundar» and the links «Før» and «Etter»;
// «Før og etter» (3.9), class aggregate through privacy. A survey after the seminar is launched by
// the round wizard (POST /api/admin/rounds/launch with `seminar`), which links it at once.
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { BeforeAfterView } from '../dashboard/before-after-view.js';
import { auditWho } from '../auth/audit-who.js';
import { parseWith } from './seminar-input.js';
import { type RoundSlot, SeminarRoundsService } from './seminar-rounds.service.js';

const Link = z.strictObject({ round: z.uuid().nullable() });
const Filter = z.strictObject({ client: z.string().min(1).max(100).optional() });

@Controller('api/admin/seminars/:id')
@UseGuards(AdminSessionGuard)
export class SeminarRoundsController {
  constructor(
    private readonly rounds: SeminarRoundsService,
    private readonly beforeAfter: BeforeAfterView,
  ) {}

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

  @Get('before-after')
  compare(@Param('id', ParseUUIDPipe) id: string, @Query() query: unknown) {
    return this.beforeAfter.load(id, parseWith(Filter, query).client);
  }
}
