import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { dashboardQuery, parseInput } from './dashboard.controller.js';
import { RowsView } from './rows-view.js';

const querySchema = dashboardQuery.omit({ role: true });
@Controller('api/admin/rows')
@UseGuards(AdminSessionGuard)
export class RowsController {
  constructor(private readonly view: RowsView) {}
  @Get('per-employee')
  perEmployee(@Query() query: unknown, @Req() req: AdminRequest) {
    const q = parseInput(querySchema, query);
    return this.view.perEmployee(q.round, q.client, req.adminSession);
  }
  @Get('quotes')
  quotes(@Query() query: unknown, @Req() req: AdminRequest) {
    const q = parseInput(querySchema, query);
    return this.view.quotes(q.round, q.client, req.adminSession);
  }
}
