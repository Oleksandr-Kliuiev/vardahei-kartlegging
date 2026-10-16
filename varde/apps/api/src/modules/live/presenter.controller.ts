// The presenter's API (3.4; ADR-008): with the presenter key only. Read the poll's snapshot and
// open / close / show one of its questions. The key decides the poll: there is no seminar or round
// id in these routes, so no other poll can be named.
import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { QUESTION_ID } from '@varde/schema/template/question';
import { LivePollService } from './live-poll.service.js';
import type { LiveAction } from './live-types.js';
import { LiveView } from './live-view.js';
import { PresenterGuard, type PresenterRequest } from './presenter.guard.js';

export function questionParam(id: string): string {
  if (!QUESTION_ID.test(id) || id.length > 100)
    throw new BadRequestException('Spørsmålet finst ikkje.');
  return id;
}

@Controller('/api/presenter')
@UseGuards(PresenterGuard)
export class PresenterController {
  constructor(
    private readonly live: LivePollService,
    private readonly view: LiveView,
  ) {}

  @Get('/poll')
  @Header('Cache-Control', 'no-store')
  poll(@Req() request: PresenterRequest) {
    return this.view.snapshot(request.presenter!.round);
  }

  private async step(request: PresenterRequest, question: string, action: LiveAction) {
    const access = request.presenter!;
    await this.live.step(
      access.round,
      questionParam(question),
      action,
      `presenter:${access.token}`,
    );
    return this.view.snapshot(access.round);
  }

  @Post('/questions/:question/open')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  open(@Req() request: PresenterRequest, @Param('question') question: string) {
    return this.step(request, question, 'open');
  }

  @Post('/questions/:question/close')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  close(@Req() request: PresenterRequest, @Param('question') question: string) {
    return this.step(request, question, 'close');
  }

  @Post('/questions/:question/release')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  release(@Req() request: PresenterRequest, @Param('question') question: string) {
    return this.step(request, question, 'release');
  }
}
