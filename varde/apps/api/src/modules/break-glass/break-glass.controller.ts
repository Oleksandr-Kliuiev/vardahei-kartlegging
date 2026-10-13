// POST /break-glass/login — only on the Unix-socket listener (0.8). Password → argon2id verify →
// session via=break_glass for min(UNTIL, now + 1 h); the AuditLog row and the session are one
// transaction (a failed audit write leaves no session).
import { Body, Controller, HttpCode, Inject, Logger, Post, Res } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import type { FastifyReply } from 'fastify';
import { type BreakGlassConfig, SESSION_MAX_MS } from '../../config/break-glass-config.js';
import { SessionService } from '../auth/session.service.js';
import { SessionStore } from '../auth/session.store.js';
import { BREAK_GLASS_ON } from './break-glass.tokens.js';

type On = Extract<BreakGlassConfig, { state: 'on' }>;

@Controller('break-glass')
export class BreakGlassController {
  private readonly logger = new Logger('break-glass');

  constructor(
    @Inject(BREAK_GLASS_ON) private readonly config: On,
    private readonly sessions: SessionService,
    private readonly store: SessionStore,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res() reply: FastifyReply): Promise<void> {
    const who = `break-glass:${this.config.operator}`;
    const password = (body as { password?: unknown } | null)?.password;
    const ok =
      typeof password === 'string' &&
      password !== '' &&
      (await verify(this.config.hash, password).catch(() => false));
    if (!ok) {
      await this.store.audit({ who, what: 'break_glass.login_failed' });
      void reply.status(401).send({ statusCode: 401, message: 'login failed' });
      return;
    }
    const expiresAt = new Date(Math.min(this.config.until.getTime(), Date.now() + SESSION_MAX_MS));
    try {
      await this.sessions.issue(
        reply,
        { oid: null, name: who, via: 'break_glass', expiresAt },
        { who, what: 'break_glass.login', details: { expires_at: expiresAt.toISOString() } },
      );
    } catch (error) {
      this.logger.error(`login not recorded, no session: ${(error as Error).message}`);
      void reply.status(503).send({ statusCode: 503, message: 'audit unavailable' });
      return;
    }
    void reply.send({ via: 'break_glass', expiresAt: expiresAt.toISOString() });
  }
}
