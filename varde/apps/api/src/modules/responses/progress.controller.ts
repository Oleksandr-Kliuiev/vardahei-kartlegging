import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { PrivacyService } from '../privacy/privacy.service.js';
import { bearer } from '../rounds/codes.js';
import { peerIp } from './submission.controller.js';
import { ProgressService } from './progress.service.js';

@Controller()
export class ProgressController {
  constructor(
    private readonly progress: ProgressService,
    private readonly privacy: PrivacyService,
  ) {}

  @Post('/api/runner/progress')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  record(@Req() r: FastifyRequest, @Body() body: unknown) {
    return this.progress.record(bearer(r), body, peerIp(r));
  }

  @Get('/api/admin/rounds/:id/progress')
  @UseGuards(AdminSessionGuard)
  @Header('Cache-Control', 'no-store')
  aggregate(@Param('id', ParseUUIDPipe) id: string) {
    return this.privacy.progress(id);
  }
}
