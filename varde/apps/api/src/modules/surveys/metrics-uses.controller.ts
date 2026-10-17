import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { MetricsService } from '../metrics/metrics.service.js';

/** What the template's definitions read in a version (2.18, the workshop's «Brukt i»). */
@Controller('/api/admin/surveys')
@UseGuards(AdminSessionGuard)
export class MetricsUsesController {
  constructor(private readonly metrics: MetricsService) {}
  @Get('/versions/:id/metrics')
  uses(@Param('id', ParseUUIDPipe) id: string) {
    return this.metrics.templateUses(id);
  }
}
