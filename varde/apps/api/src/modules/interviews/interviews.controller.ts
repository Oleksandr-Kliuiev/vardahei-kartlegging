// Admin routes of «Samtalar» (2.20): admin session only; the Origin check of 1.3 covers every change.
// 2.21: the overview of one or more rounds, its CSV and the referat of one conversation.
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { auditWho } from '../auth/audit-who.js';
import { sendCsv } from '../exports/exports.controller.js';
import { FindingStatusInput } from '../seminars/seminar-input.js';
import { InterviewActionsService } from './interview-actions.js';
import {
  AnswerFieldInput,
  ClientsInput,
  InterviewFieldInput,
  OverviewQuery,
  parseWith,
  RoundInput,
  RoundNameInput,
  StartInput,
} from './interview-input.js';
import { InterviewReportService } from './interview-report.service.js';
import { type Actor, InterviewsService } from './interviews.service.js';
import { InterviewRoundsAdmin } from './rounds-admin.service.js';

const QUESTION_ID = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function actor(req: AdminRequest): Actor {
  const name = req.adminSession?.name?.trim();
  return { audit: auditWho(req.adminSession, true), name: name || auditWho(req.adminSession) };
}

@Controller('api/admin')
@UseGuards(AdminSessionGuard)
export class InterviewsController {
  constructor(
    private readonly interviews: InterviewsService,
    private readonly reports: InterviewReportService,
    private readonly actions: InterviewActionsService,
    private readonly roundAdmin: InterviewRoundsAdmin,
  ) {}

  @Get('interview-guides')
  guides() {
    return this.interviews.guides();
  }
  @Get('interview-rounds')
  rounds() {
    return this.interviews.rounds();
  }
  @Post('interview-rounds')
  createRound(@Body() body: unknown, @Req() req: AdminRequest) {
    return this.interviews.createRound(parseWith(RoundInput, body), actor(req));
  }
  /** Static paths before `:id`; the router prefers them in any case. */
  @Get('interview-rounds/overview')
  overview(@Query() query: unknown) {
    const q = parseWith(OverviewQuery, query);
    return this.reports.overview(q.rounds, q.in_progress);
  }
  @Get('interview-rounds/export.csv')
  async exportCsv(@Query() query: unknown, @Req() req: AdminRequest, @Res() reply: FastifyReply) {
    const q = parseWith(OverviewQuery, query);
    return sendCsv(
      reply,
      'samtalar',
      await this.reports.exportCsv(q.rounds, q.in_progress, actor(req)),
    );
  }
  @Get('interview-rounds/:id')
  round(@Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.round(id);
  }
  /** The name of a round that exists (10.11): a typo in it used to stand for good. */
  @Put('interview-rounds/:id/name')
  renameRound(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    return this.roundAdmin.rename(id, parseWith(RoundNameInput, body).name, actor(req));
  }
  /** The end of a tour, and the way back from it: nothing is deleted either way. */
  @Post('interview-rounds/:id/close')
  closeRound(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.roundAdmin.setOpen(id, false, actor(req));
  }
  @Post('interview-rounds/:id/reopen')
  reopenRound(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.roundAdmin.setOpen(id, true, actor(req));
  }
  @Post('interview-rounds/:id/clients')
  addClients(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    return this.interviews.addClients(id, parseWith(ClientsInput, body).clients, actor(req));
  }
  @Get('interviews/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.get(id);
  }
  @Get('interviews/:id/referat')
  referat(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.reports.referat(id, actor(req));
  }
  @Post('interviews/:id/start')
  start(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AdminRequest) {
    return this.interviews.start(id, parseWith(StartInput, body), actor(req));
  }
  @Put('interviews/:id/answers/:question')
  saveAnswer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('question') question: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    if (!QUESTION_ID.test(question))
      throw new NotFoundException('Spørsmålet finst ikkje i samtaleguiden.');
    return this.interviews.saveAnswer(id, question, parseWith(AnswerFieldInput, body), actor(req));
  }
  @Put('interviews/:id/fields')
  saveField(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    return this.interviews.saveField(id, parseWith(InterviewFieldInput, body), actor(req));
  }
  @Post('interviews/:id/done')
  done(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.interviews.done(id, actor(req));
  }
  @Post('interviews/:id/reopen')
  reopen(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.interviews.reopen(id, actor(req));
  }
  @Get('clients/:id/interviews')
  ofClient(@Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.ofClient(id);
  }
  /** 2.22b: the actions of the catalogue chosen in the client's conversations, and their follow-up. */
  @Get('clients/:id/interview-actions')
  actionsOfClient(@Param('id', ParseUUIDPipe) id: string) {
    return this.actions.ofClient(id);
  }
  @Put('interviews/:id/actions/:question/:action/status')
  actionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('question') question: string,
    @Param('action', ParseUUIDPipe) action: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    if (!QUESTION_ID.test(question))
      throw new NotFoundException('Spørsmålet finst ikkje i samtaleguiden.');
    const input = parseWith(FindingStatusInput, body);
    // Lower case, as the database and AuditLog keep a uuid (a search of the log by id finds it).
    return this.actions.setStatus(
      id.toLowerCase(),
      question,
      action.toLowerCase(),
      input,
      actor(req),
    );
  }
}
