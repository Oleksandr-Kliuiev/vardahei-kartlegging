import { Controller, Get, Header, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { bearer, CodesService, requireCode } from './codes.js';
import { languageContent } from './runner-content.js';

@Controller('/api/runner')
export class RunnerController {
  constructor(private readonly codes: CodesService) {}

  @Get('/round')
  @Header('Cache-Control', 'no-store')
  async round(@Req() request: FastifyRequest) {
    const rc = requireCode(await this.codes.resolveCode(bearer(request)));
    // A seminar live poll (3.6): the phone asks /api/runner/live for the open question only.
    if (rc.round.type === 'live') return { type: 'live' as const };
    const version = rc.round.template_version!;
    return {
      round_client_id: rc.id,
      client: { name: rc.client.name, default_lang: rc.client.default_lang },
      version: {
        id: version.id, label: version.label, identification: version.identification,
        required_languages: version.required_languages, content: languageContent(version.content, version.required_languages),
      },
      status: rc.status,
      deadline: rc.deadline?.toISOString().slice(0, 10) ?? null,
      expires: rc.code_expires_at?.toISOString() ?? null,
    };
  }
}
