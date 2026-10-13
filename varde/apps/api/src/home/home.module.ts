// Placeholder home page (decision of 13.10). Uses SessionService and ENTRA_SETTINGS of the
// global AuthModule of the main listener.
import { Module } from '@nestjs/common';
import { HomeController } from './home.controller.js';

@Module({ controllers: [HomeController] })
export class HomeModule {}
