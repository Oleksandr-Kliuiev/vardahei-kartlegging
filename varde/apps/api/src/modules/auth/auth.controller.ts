// /auth/login, /auth/callback, /auth/logout, /auth/me (task 0.7, ADR-008).
import { Controller, Get, Inject, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { EntraSettings } from '../../config/auth-config.js';
import { sessionTtlSeconds } from '../../config/auth-config.js';
import { type AdminRequest, AdminSessionGuard } from './admin-session.guard.js';
import { ENTRA_SETTINGS, OIDC_CLIENT } from './auth.tokens.js';
import { OIDC_COOKIE, oidcCookie } from './cookies.js';
import { type IdClaims, isAdmin, type OidcClient } from './oidc.client.js';
import { ConsumedTransactions, newTransaction, parseTransaction } from './oidc-transaction.js';
import { SessionService } from './session.service.js';

export const NOT_MEMBER_TEXT = 'Du har ikkje tilgang til Varde.';

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger('auth');
  private readonly consumed = new ConsumedTransactions();

  constructor(
    @Inject(ENTRA_SETTINGS) private readonly settings: EntraSettings | null,
    @Inject(OIDC_CLIENT) private readonly oidc: OidcClient | null,
    private readonly sessions: SessionService,
  ) {}

  private notConfigured(reply: FastifyReply): boolean {
    if (this.settings !== null && this.oidc !== null) return false;
    void reply.status(503).send({ statusCode: 503, message: 'auth not configured' });
    return true;
  }

  @Get('login')
  async login(@Res() reply: FastifyReply): Promise<void> {
    if (this.notConfigured(reply) || this.oidc === null) return;
    const t = newTransaction();
    let url: URL;
    try {
      url = await this.oidc.loginUrl(t);
    } catch (error) {
      this.logger.error(`discovery failed: ${(error as Error).message}`);
      void reply.status(503).send({ statusCode: 503, message: 'auth unavailable' });
      return;
    }
    void reply.setCookie(OIDC_COOKIE, JSON.stringify(t), oidcCookie());
    void reply.redirect(url.href, 302);
  }

  @Get('callback')
  async callback(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    if (this.notConfigured(reply) || this.oidc === null || this.settings === null) return;
    const bad = (): void =>
      void reply.status(400).send({ statusCode: 400, message: 'bad login state' });
    const raw = request.cookies[OIDC_COOKIE];
    void reply.clearCookie(OIDC_COOKIE, { path: '/auth' });
    const unsigned = raw === undefined ? null : request.unsignCookie(raw);
    const t = unsigned?.valid && unsigned.value !== null ? parseTransaction(unsigned.value) : null;
    if (t === null || !this.consumed.consume(t)) return bad();
    const query = request.query as Record<string, unknown>;
    if (query.state !== t.state) return bad();

    let claims: IdClaims;
    try {
      claims = await this.oidc.exchange(request.url, t);
    } catch (error) {
      this.logger.warn(`login rejected: ${(error as Error).name}`);
      void reply.status(401).send({ statusCode: 401, message: 'login failed' });
      return;
    }
    if (!isAdmin(claims, this.settings.adminGroupId)) {
      void reply.status(403).type('text/plain; charset=utf-8').send(NOT_MEMBER_TEXT);
      return;
    }
    await this.sessions.issue(reply, {
      oid: str(claims.oid) ?? str(claims.sub),
      name: str(claims.name),
      via: 'entra',
      expiresAt: new Date(Date.now() + sessionTtlSeconds() * 1000),
    });
    void reply.redirect('/', 302);
  }

  @Post('logout')
  async logout(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.sessions.revoke(request, reply);
    const url = this.oidc === null ? null : await this.oidc.logoutUrl().catch(() => null);
    if (url === null) void reply.status(204).send();
    else void reply.redirect(url.href, 302);
  }

  @Get('me')
  @UseGuards(AdminSessionGuard)
  me(@Req() request: AdminRequest): { name: string | null; via: string; expiresAt: string } {
    const s = request.adminSession;
    if (s === undefined) throw new Error('guard did not attach a session');
    return { name: s.name, via: s.via, expiresAt: s.expiresAt.toISOString() };
  }
}
