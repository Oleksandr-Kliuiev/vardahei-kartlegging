import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { type Health, HealthService } from './health.service.js';

/** GET /health without authentication: 200 when the database answers, otherwise 503. */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async get(@Res({ passthrough: true }) reply: FastifyReply): Promise<Health> {
    const result = await this.health.check();
    void reply.status(result.db === 'ok' ? 200 : 503);
    return result;
  }
}
