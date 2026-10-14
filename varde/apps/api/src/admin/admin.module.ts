import { Module } from '@nestjs/common';
import { EventsCoreModule } from '../modules/events/events-core.module.js';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';

@Module({ imports: [EventsCoreModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
