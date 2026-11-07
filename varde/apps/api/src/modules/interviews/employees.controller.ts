// «Leiar vs tilsette» (2.22c): the employees' released numbers beside the questions of one
// conversation. Admin session only, like every route of Samtalar.
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { EmployeeView } from './employee-view.js';

@Controller('api/admin')
@UseGuards(AdminSessionGuard)
export class EmployeesController {
  constructor(private readonly view: EmployeeView) {}

  @Get('interviews/:id/employees')
  employees(@Param('id', ParseUUIDPipe) id: string) {
    return this.view.load(id);
  }
}
