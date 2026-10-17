import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { auditWho } from '../auth/audit-who.js';
import { parse } from './editor-contract.js';
import { DefaultsInput, SettingsService } from './settings.service.js';

/** «Innstillingar» (2.16): defaults that new surveys take. */
@Controller('/api/admin/settings')
@UseGuards(AdminSessionGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}
  @Get()
  get() {
    return this.settings.defaults();
  }
  @Put()
  put(@Body() body: unknown, @Req() r: AdminRequest) {
    return this.settings.save(parse(DefaultsInput, body), auditWho(r.adminSession));
  }
}
