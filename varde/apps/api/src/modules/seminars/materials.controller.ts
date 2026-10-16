// Admin routes of the material of a seminar (3.3): titles and links, no uploads. Admin session.
import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { auditWho } from '../auth/audit-who.js';
import { MaterialInput, MaterialsService } from './materials.service.js';
import { parseWith } from './seminar-input.js';

@Controller('api/admin/seminars/:id/materials')
@UseGuards(AdminSessionGuard)
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Post()
  add(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @Req() req: AdminRequest) {
    return this.materials.add(id, parseWith(MaterialInput, body), auditWho(req.adminSession, true));
  }

  @Delete(':material')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('material', ParseUUIDPipe) material: string,
    @Req() req: AdminRequest,
  ) {
    return this.materials.remove(id, material, auditWho(req.adminSession, true));
  }
}
