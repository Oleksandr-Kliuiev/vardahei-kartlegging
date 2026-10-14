import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { parseInput } from './dashboard.controller.js';
import { LeaderView } from './leader-view.js';

const querySchema = z.strictObject({ round: z.uuid() });
@Controller('api/admin')
@UseGuards(AdminSessionGuard)
export class LeaderController {
  constructor(private readonly view: LeaderView) {}
  @Get('clients/:clientId/leader-answers')
  client(
    @Param('clientId', ParseUUIDPipe) client: string,
    @Query() query: unknown,
    @Req() req: AdminRequest,
  ) {
    return this.view.client(parseInput(querySchema, query).round, client, req.adminSession);
  }
  @Get('leader-answers')
  summary(@Query() query: unknown, @Req() req: AdminRequest) {
    return this.view.summary(parseInput(querySchema, query).round, req.adminSession);
  }
}
