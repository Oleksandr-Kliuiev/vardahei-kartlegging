import { Module } from '@nestjs/common';
import { FindingsService } from './findings.service.js';

@Module({ providers: [FindingsService], exports: [FindingsService] })
export class FindingsModule {}
