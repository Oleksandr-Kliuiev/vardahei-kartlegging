import {
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
import { CommentInput, CommentsService, ResolveInput } from './comments.service.js';
import { parse } from './editor-contract.js';

/** Notes on questions in the workshop (2.18): admins only. */
@Controller('/api/admin/surveys')
@UseGuards(AdminSessionGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}
  @Get('/versions/:id/comments')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.comments.list(id);
  }
  @Post('/versions/:id/comments')
  add(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() r: AdminRequest) {
    return this.comments.add(id, parse(CommentInput, body), auditWho(r.adminSession));
  }
  @Put('/comments/:id')
  resolve(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() r: AdminRequest) {
    return this.comments.resolve(id, parse(ResolveInput, body).resolved, auditWho(r.adminSession));
  }
}
