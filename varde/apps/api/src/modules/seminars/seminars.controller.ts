// Admin routes of seminars (3.1): admin session only. The participant list, the contacts to check
// and the contacts of one client (the client page, 2.17) are personal data: each read is written to
// AuditLog by privacy. The client page also reads how many contacts a client has (no names) and the
// status of its findings.
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { auditWho } from '../auth/audit-who.js';
import { FindingStatusService } from './finding-status.service.js';
import {
  ActionInput,
  ContactInput,
  FindingStatusInput,
  parseWith,
  SeminarInput,
} from './seminar-input.js';
import { SeminarsService } from './seminars.service.js';

const Attach = z.strictObject({ findings: z.array(z.uuid()).min(1).max(100) });
const Link = z.strictObject({ action: z.uuid().nullable() });

@Controller('api/admin')
@UseGuards(AdminSessionGuard)
export class SeminarsController {
  constructor(
    private readonly seminars: SeminarsService,
    private readonly findings: FindingStatusService,
  ) {}

  @Get('seminars')
  list() {
    return this.seminars.list();
  }
  @Post('seminars')
  async create(@Body() body: unknown, @Req() req: AdminRequest) {
    const input = parseWith(SeminarInput, body);
    return { id: await this.seminars.create(input, auditWho(req.adminSession, true)) };
  }
  @Get('seminars/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.seminars.get(id);
  }
  @Put('seminars/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    const input = parseWith(SeminarInput, body);
    return { id: await this.seminars.update(id, input, auditWho(req.adminSession, true)) };
  }
  @Post('seminars/:id/reissue')
  reissue(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.seminars.reissue(id, auditWho(req.adminSession, true));
  }
  @Get('seminars/:id/registrations')
  registrations(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.seminars.participants(id, req.adminSession);
  }
  @Delete('seminars/:id/registrations/:registration')
  removeRegistration(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('registration', ParseUUIDPipe) registration: string,
    @Req() req: AdminRequest,
  ) {
    return this.seminars.removeRegistration(id, registration, req.adminSession);
  }
  @Post('seminars/:id/findings')
  attach(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AdminRequest) {
    const q = parseWith(Attach, body);
    return this.findings.attach(id, q.findings, auditWho(req.adminSession, true));
  }
  @Put('findings/:id/status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AdminRequest) {
    return this.findings.set(
      id,
      parseWith(FindingStatusInput, body),
      auditWho(req.adminSession, true),
    );
  }
  @Get('contacts/review')
  review(@Req() req: AdminRequest) {
    return this.seminars.contactsToReview(req.adminSession);
  }
  @Put('contacts/:id')
  updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: AdminRequest,
  ) {
    return this.seminars.updateContact(id, parseWith(ContactInput, body), req.adminSession);
  }
  @Post('contacts/:id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.seminars.confirmContact(id, req.adminSession);
  }
  @Get('clients/:id/contacts/count')
  clientContactCount(@Param('id', ParseUUIDPipe) id: string) {
    return this.seminars.clientContactCount(id);
  }
  @Get('clients/:id/contacts')
  clientContacts(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.seminars.clientContacts(id, req.adminSession);
  }
  @Get('clients/:id/finding-status')
  clientFindings(@Param('id', ParseUUIDPipe) id: string) {
    return this.findings.ofClient(id);
  }
  @Get('actions')
  actions() {
    return this.findings.actions();
  }
  @Post('actions')
  createAction(@Body() body: unknown, @Req() req: AdminRequest) {
    return this.findings.createAction(
      parseWith(ActionInput, body),
      auditWho(req.adminSession, true),
    );
  }
  @Put('finding-rules/:key/action')
  link(@Param('key') key: string, @Body() body: unknown, @Req() req: AdminRequest) {
    const q = parseWith(Link, body);
    return this.findings.linkRule(key, q.action, auditWho(req.adminSession, true));
  }
}
