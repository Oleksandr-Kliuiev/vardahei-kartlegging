// The phone's view of a live poll (3.6): `GET /api/runner/live` with the poll's code as a bearer,
// polled every few seconds (participants get no SSE, ADR-015). Only the open question leaves here;
// answers go through the ordinary Submission API (ADR-006, responses/live-answer.ts). Successful
// runner requests leave no log line (request-log.ts).
import { Controller, Get, Header, NotFoundException, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { bearer, CodesService, requireCode } from '../rounds/codes.js';
import { LiveView } from './live-view.js';

@Controller('/api/runner')
export class LiveRunnerController {
  constructor(
    private readonly codes: CodesService,
    private readonly view: LiveView,
  ) {}

  @Get('/live')
  @Header('Cache-Control', 'no-store')
  async live(@Req() request: FastifyRequest) {
    const rc = requireCode(await this.codes.resolveCode(bearer(request)));
    if (rc.round.type !== 'live') throw new NotFoundException('Lenkja er ikkje til live-spørsmål.');
    return this.view.participant(rc.round_id);
  }
}
