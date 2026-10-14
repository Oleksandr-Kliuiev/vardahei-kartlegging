import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { ArchiveService } from './archive.service.js';

@Controller('api/admin/cutover')
@UseGuards(AdminSessionGuard)
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}
  @Get('reminder') reminder() {
    return this.archive.reminder();
  }
}
