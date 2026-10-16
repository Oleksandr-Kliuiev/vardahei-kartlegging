import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { parseInput } from '../dashboard/dashboard.controller.js';
import { ReportService } from './report.service.js';

const query = z.strictObject({ lang: z.enum(['nn', 'en', 'nb']).optional() });

/** Preview of the client report (5.1): admin only; the admin saves the PDF and sends it. */
@Controller('api/admin')
@UseGuards(AdminSessionGuard)
export class ReportController {
  constructor(private readonly reports: ReportService) {}
  @Get('round-clients/:id/report')
  report(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() input: unknown,
    @Req() req: AdminRequest,
  ) {
    return this.reports.build(id, parseInput(query, input).lang, req.adminSession);
  }
}
