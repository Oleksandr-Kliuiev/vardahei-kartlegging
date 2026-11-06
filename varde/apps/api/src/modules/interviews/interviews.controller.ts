// Admin routes of «Samtalar» (2.20): admin session only; the Origin check of 1.3 covers every change.
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { auditWho } from '../auth/audit-who.js';
import {
  AnswerFieldInput,
  ClientsInput,
  InterviewFieldInput,
  parseWith,
  RoundInput,
  StartInput,
} from './interview-input.js';
import { type Actor, InterviewsService } from './interviews.service.js';

const QUESTION_ID = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

function actor(req: AdminRequest): Actor {
  const name = req.adminSession?.name?.trim();
  return { audit: auditWho(req.adminSession, true), name: name || auditWho(req.adminSession) };
}

@Controller('api/admin')
@UseGuards(AdminSessionGuard)
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

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
  @Get('interview-rounds/:id')
  round(@Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.round(id);
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
}
