// Test controller of 0.15 (real dashboard routes are 1.27/1.27b): mounts PrivacyService behind
// AdminSessionGuard of 0.7, so 401 and 404 are checked over HTTP.
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  type AdminRequest,
  AdminSessionGuard,
} from '../../src/modules/auth/admin-session.guard.js';
import { PrivacyService, type RowsResult } from '../../src/modules/privacy/privacy.service.js';

@Controller('test')
@UseGuards(AdminSessionGuard)
export class PrivacyTestController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('rows')
  rows(@Req() request: AdminRequest, @Query('round') round: string): Promise<RowsResult> {
    return this.privacy.rows({ round }, request.adminSession);
  }

  @Get('per-employee')
  perEmployee(@Req() request: AdminRequest, @Query('round') round: string): Promise<RowsResult> {
    return this.privacy.perEmployee({ round }, request.adminSession);
  }
}
