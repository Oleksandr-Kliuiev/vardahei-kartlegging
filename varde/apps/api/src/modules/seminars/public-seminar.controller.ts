// Public routes of the seminar page `/s?c=<code>` (3.2): no session, the code as a bearer in
// Authorization (never in the query, ADR-009). Successful requests leave no log line (as runner
// paths, request-log.ts).
import { Body, Controller, Get, Header, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { bearer } from '../rounds/codes.js';
import { peerIp } from '../responses/submission.controller.js';
import { PublicSeminarService } from './public-seminar.service.js';

@Controller('/api/public/seminar')
export class PublicSeminarController {
  constructor(private readonly seminars: PublicSeminarService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  view(@Req() request: FastifyRequest) {
    return this.seminars.view(bearer(request));
  }

  @Post('/registrations')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  register(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.seminars.register(bearer(request), body, peerIp(request));
  }

  @Get('/calendar')
  async calendar(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Query('lang') lang?: string,
  ) {
    const file = await this.seminars.calendar(bearer(request), lang);
    void reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', 'attachment; filename="seminar.ics"')
      .type('text/calendar; charset=utf-8');
    return file;
  }
}
