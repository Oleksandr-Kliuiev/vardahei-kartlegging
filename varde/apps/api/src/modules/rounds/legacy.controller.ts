// GET /r/legacy?s&k&t (1.7): an old kartlegging link (Caddy of the old host rewrites to it, 1.35).
// A match of (k, sha256(t)) with RoundClient.legacy_code_hash of the survey s → «avslutta» (200),
// otherwise 404. The code is compared by hash only and never logged (path without query, 0.6).
import { Controller, Get, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ENDED_PAGE, INVALID_PAGE, LEGACY_CSP } from './legacy-page.js';
import { LegacyService } from './legacy.service.js';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

@Controller()
export class LegacyController {
  constructor(private readonly links: LegacyService) {}

  @Get('/r/legacy')
  async legacy(@Query() query: Record<string, unknown>, @Res() reply: FastifyReply): Promise<void> {
    const [s, k, t] = [str(query.s), str(query.k), str(query.t)];
    const known = (await this.links.isKnown(s, k, t)) ? 1 : 0;
    void reply
      .status(known > 0 ? 200 : 404)
      .type('text/html; charset=utf-8')
      .header('content-security-policy', LEGACY_CSP)
      .header('cache-control', 'no-store')
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'no-referrer')
      .header('x-frame-options', 'DENY')
      .send(known > 0 ? ENDED_PAGE : INVALID_PAGE);
  }
}
