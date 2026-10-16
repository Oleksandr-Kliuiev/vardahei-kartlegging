// Admin routes of the invitation of a seminar (3.10): the letter, the calendar file, the A4 poster
// and the whole package as a zip. Admin session only; nothing is sent from here.
import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { auditWho } from '../auth/audit-who.js';
import { InvitationService } from './invitation.service.js';

@Controller()
@UseGuards(AdminSessionGuard)
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Get('/api/admin/seminars/:id/invitation')
  invitation(@Param('id', ParseUUIDPipe) id: string, @Query('lang') lang?: string) {
    return this.invitations.text(id, lang);
  }

  @Get('/api/admin/seminars/:id/calendar.ics')
  async calendar(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Query('lang') lang?: string,
  ) {
    const file = await this.invitations.calendar(id, lang);
    void reply
      .header(
        'Content-Disposition',
        `attachment; filename="seminar${lang === 'en' ? '-en' : ''}.ics"`,
      )
      .type('text/calendar; charset=utf-8');
    return file;
  }

  @Get('/api/admin/seminars/:id/invitation.zip')
  async zip(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AdminRequest,
    @Res() reply: FastifyReply,
  ) {
    const bytes = await this.invitations.zip(id, auditWho(req.adminSession, true));
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', 'attachment; filename="invitasjon-seminar.zip"')
      .type('application/zip')
      .send(Buffer.from(bytes));
  }

  /** Opens in a new tab, ready to print; the narrow poster CSP of rounds (no scripts at all). */
  @Get('/admin/poster/seminar/:id')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Frame-Options', 'DENY')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'",
  )
  async poster(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Query('lang') lang?: string,
  ) {
    const html = await this.invitations.poster(id, lang);
    reply.type('text/html; charset=utf-8');
    return html;
  }
}
