// GET / (decision of 13.10): the placeholder home page. The session is resolved through the
// existing SessionService (same rules as AdminSessionGuard: signature, expiry, revocation,
// listener); without a valid session the page offers "Logg inn med Microsoft".
import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { EntraSettings } from '../config/auth-config.js';
import { ENTRA_SETTINGS } from '../modules/auth/auth.tokens.js';
import { SessionService } from '../modules/auth/session.service.js';
import { homeCsp, renderHome } from './home-page.js';

@Controller()
export class HomeController {
  constructor(
    private readonly sessions: SessionService,
    @Inject(ENTRA_SETTINGS) private readonly settings: EntraSettings | null,
  ) {}

  @Get('/')
  async home(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const session = await this.sessions.resolve(request);
    // Logout redirects to the Entra end-session endpoint, on the issuer's origin.
    const formOrigins = this.settings === null ? [] : [new URL(this.settings.issuer).origin];
    void reply
      .status(200)
      .type('text/html; charset=utf-8')
      .header('content-security-policy', homeCsp(formOrigins))
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'no-referrer')
      .header('x-frame-options', 'DENY')
      .send(renderHome({ session: session === null ? null : { name: session.name } }));
  }
}
