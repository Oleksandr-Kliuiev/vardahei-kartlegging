// Admin routes of a seminar's live poll (3.4, 3.5): the same control panel as the presenter, with
// the admin session; making and removing the poll; issuing and revoking the presenter key. The key
// is in the answer of «issue» once, as a link, and nowhere else.
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { auditWho } from '../auth/audit-who.js';
import { parseWith } from '../seminars/seminar-input.js';
import { LiveAdminService } from './live-admin.service.js';
import { LivePollService } from './live-poll.service.js';
import type { LiveAction } from './live-types.js';
import { LiveView } from './live-view.js';
import { questionParam } from './presenter.controller.js';
import { PresenterTokenService } from './presenter-token.service.js';

const Create = z.strictObject({ template_version_id: z.uuid() });

@Controller('api/admin/seminars/:id')
@UseGuards(AdminSessionGuard)
export class LiveAdminController {
  constructor(
    private readonly admin: LiveAdminService,
    private readonly live: LivePollService,
    private readonly view: LiveView,
    private readonly keys: PresenterTokenService,
  ) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.panel(id);
  }

  @Post('live')
  create(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AdminRequest) {
    const input = parseWith(Create, body);
    return this.live.create(id, input.template_version_id, auditWho(req.adminSession, true));
  }

  @Delete('live')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.live.remove(id, auditWho(req.adminSession, true));
  }

  private async step(id: string, question: string, action: LiveAction, req: AdminRequest) {
    const round = await this.admin.roundOf(id);
    await this.live.step(round, questionParam(question), action, auditWho(req.adminSession, true));
    return this.view.snapshot(round);
  }

  @Post('live/questions/:question/open')
  @HttpCode(200)
  open(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('question') question: string,
    @Req() req: AdminRequest,
  ) {
    return this.step(id, question, 'open', req);
  }

  @Post('live/questions/:question/close')
  @HttpCode(200)
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('question') question: string,
    @Req() req: AdminRequest,
  ) {
    return this.step(id, question, 'close', req);
  }

  @Post('live/questions/:question/release')
  @HttpCode(200)
  release(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('question') question: string,
    @Req() req: AdminRequest,
  ) {
    return this.step(id, question, 'release', req);
  }

  @Post('presenter')
  @Header('Cache-Control', 'no-store')
  issue(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.keys.issue(id, auditWho(req.adminSession, true));
  }

  @Delete('presenter')
  revoke(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.keys.revoke(id, auditWho(req.adminSession, true));
  }
}
