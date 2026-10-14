import { Module } from '@nestjs/common';
import { EventsCoreModule } from './events-core.module.js';
import { EventsController } from './events.controller.js';

@Module({ imports: [EventsCoreModule], controllers: [EventsController] })
export class EventsModule {}
