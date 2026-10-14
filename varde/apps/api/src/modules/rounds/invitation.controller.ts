import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { InvitationService } from './invitation.service.js';

@Controller()
@UseGuards(AdminSessionGuard)
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Get('/api/admin/round-clients/:id/invitation')
  @Header('Cache-Control', 'no-store')
  invitation(@Param('id', ParseUUIDPipe) id: string, @Query('lang') lang?: string) {
    return this.invitations.invitation(id, lang);
  }

  @Get('/admin/poster/:id')
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
