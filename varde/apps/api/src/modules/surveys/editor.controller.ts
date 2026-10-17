import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { auditWho } from '../auth/audit-who.js';
import { PublishRejected } from './publish.service.js';
import { EditorService } from './editor.service.js';
import {
  AcceptInput,
  DraftInput,
  PublishInput,
  SaveInput,
  TemplateInput,
  issues,
  parse,
} from './editor-contract.js';

@Controller('/api/admin/surveys')
@UseGuards(AdminSessionGuard)
export class EditorController {
  constructor(private readonly editor: EditorService) {}
  @Get()
  list() {
    return this.editor.list();
  }
  @Post()
  create(@Body() body: unknown, @Req() r: AdminRequest) {
    return this.editor.create(parse(TemplateInput, body), auditWho(r.adminSession));
  }
  @Post('/:id/drafts')
  draft(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() r: AdminRequest) {
    return this.editor.draft(id, parse(DraftInput, body), auditWho(r.adminSession));
  }
  @Get('/versions/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.editor.view(id);
  }
  @Post('/validate')
  validate(@Body() body: unknown) {
    return { issues: issues(body) };
  }
  @Get('/versions/:id/preview')
  async preview(@Param('id', ParseUUIDPipe) id: string) {
    const v = await this.editor.get(id);
    // An unfinished draft is shown as far as it goes; a broken structure is not.
    const errors = issues(v.content).filter((i) => i.blocking);
    if (errors.length)
      throw new BadRequestException({ message: 'Rett felta før førehandsvising.', issues: errors });
    return { id: v.id, content: v.content };
  }
  @Put('/versions/:id')
  save(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() r: AdminRequest) {
    return this.editor.save(id, parse(SaveInput, body), auditWho(r.adminSession));
  }
  @Post('/versions/:id/accept')
  accept(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() r: AdminRequest) {
    const input = parse(AcceptInput, body);
    return this.editor.accept(id, input.content_hash, input.lang, auditWho(r.adminSession));
  }
  @Post('/versions/:id/publish')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() r: AdminRequest,
  ) {
    const input = parse(PublishInput, body);
    try {
      return await this.editor.publish(
        id,
        input.content_hash,
        input.frozen_changes,
        auditWho(r.adminSession),
      );
    } catch (e) {
      if (e instanceof PublishRejected) {
        const language = /language (nn|en|nb) is not accepted/.exec(e.message);
        const message = language
          ? `Godkjenn teksten på ${language[1]} for den lagra versjonen.`
          : /frozen|orthographic|semantic/.test(e.message)
            ? 'Kontroller endringane i frosne spørsmål: vel rettskriving med same ankernøkkel, eller meiningsendring med ny nøkkel. Frosne spørsmål kan ikkje fjernast.'
            : 'Kontroller innhaldet og dei obligatoriske språka før publisering.';
        throw new BadRequestException(message);
      }
      throw e;
    }
  }
}
