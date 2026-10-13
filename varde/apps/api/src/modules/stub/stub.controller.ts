// Load-stand routes (0.12): POST /stub/submit, POST /stub/enqueue-hold?n=, GET /stub/slow.
// Every route needs the switch (readStubConfig) and the X-Varde-Stub-Token header; otherwise
// 404, as if the module did not exist. Removed in 1.33.
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StubConfig } from '../../config/stub-config.js';
import { JobsService } from '../../jobs/jobs.service.js';
import { StubBody, StubService } from './stub.service.js';
import { STUB_CONFIG } from './stub.tokens.js';

export const SLOW_MS = 20_000;
const MAX_HOLD = 10;

function sameToken(given: string | undefined, expected: string): boolean {
  if (given === undefined) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller('stub')
export class StubController {
  constructor(
    @Inject(STUB_CONFIG) private readonly config: StubConfig,
    private readonly stub: StubService,
    private readonly jobs: JobsService,
  ) {}

  private guard(token: string | undefined): void {
    const c = this.config;
    if (!c.enabled || Date.now() >= c.until.getTime() || !sameToken(token, c.token)) {
      throw new NotFoundException();
    }
  }

  @Post('submit')
  async submit(
    @Headers('x-varde-stub-token') token: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    this.guard(token);
    const body = StubBody.safeParse(request.body);
    if (!body.success) {
      void reply.status(400).send({ statusCode: 400, message: 'bad submission' });
      return;
    }
    const result = await this.stub.submit(body.data);
    void reply.status(result === 'created' ? 201 : 409).send({ result });
  }

  @Post('enqueue-hold')
  async enqueueHold(
    @Headers('x-varde-stub-token') token: string | undefined,
    @Query('n') n: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    this.guard(token);
    const count = Math.min(MAX_HOLD, Math.max(1, Number.parseInt(n ?? '1', 10) || 1));
    if (!this.jobs.running) {
      void reply.status(503).send({ statusCode: 503, message: 'jobs not running' });
      return;
    }
    const ids: (string | null)[] = [];
    for (let i = 0; i < count; i += 1)
      ids.push(await this.jobs.enqueue('demo.hold-connection', { id: randomUUID() }));
    void reply.status(202).send({ ids });
  }

  @Get('slow')
  async slow(
    @Headers('x-varde-stub-token') token: string | undefined,
  ): Promise<{ waited_ms: number }> {
    this.guard(token);
    await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    return { waited_ms: SLOW_MS };
  }
}
