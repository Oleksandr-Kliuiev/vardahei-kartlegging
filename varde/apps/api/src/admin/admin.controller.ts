import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminSessionGuard, type AdminRequest } from '../modules/auth/admin-session.guard.js';
import { auditWho } from '../modules/auth/audit-who.js';
import { ClientsService } from './clients.service.js';
import { AdminService } from './admin.service.js';

@Controller('/api/admin')
@UseGuards(AdminSessionGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly clientService: ClientsService,
  ) {}
  @Get('/clients')
  clients() {
    return this.admin.clients();
  }
  @Patch('/clients/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() request: AdminRequest,
  ) {
    return this.clientService.save(id, body, auditWho(request.adminSession), true);
  }
  @Post('/clients')
  createClient(@Body() body: unknown, @Req() r: AdminRequest) {
    return this.clientService.save(null, body, auditWho(r.adminSession));
  }
  @Put('/clients/:id')
  editClient(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() r: AdminRequest,
  ) {
    return this.clientService.save(id, body, auditWho(r.adminSession));
  }
  @Get('/versions')
  versions() {
    return this.admin.versions();
  }
  @Get('/rounds')
  rounds() {
    return this.admin.rounds();
  }
  @Get('/audit')
  audit(@Query('limit') limit?: string) {
    return this.admin.audit(limit);
  }
}
