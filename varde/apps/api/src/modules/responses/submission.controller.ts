import { Body, Controller, Header, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { bearer } from '../rounds/codes.js';
import { SubmissionService } from './submission.service.js';

/** Trusted proxy appends the actual peer as the last X-Forwarded-For item. */
export function peerIp(request: Pick<FastifyRequest, 'headers' | 'ip'>): string {
  const forwarded = request.headers['x-forwarded-for'];
  return typeof forwarded === 'string'
    ? forwarded.split(',').at(-1)!.trim() || request.ip
    : request.ip;
}

@Controller('/api/runner')
export class SubmissionController {
  constructor(private readonly submissions: SubmissionService) {}

  @Post('/submissions')
  @Header('Cache-Control', 'no-store')
  submit(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.submissions.submit(bearer(request), body, peerIp(request));
  }
}
