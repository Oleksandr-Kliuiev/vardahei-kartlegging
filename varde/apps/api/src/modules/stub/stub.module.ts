import { Module } from '@nestjs/common';
import { readStubConfig } from '../../config/stub-config.js';
import { StubController } from './stub.controller.js';
import { StubService } from './stub.service.js';
import { STUB_CONFIG } from './stub.tokens.js';

/** Load stand of 0.12; the switch is read once at start (UNTIL is also checked per request). */
@Module({
  controllers: [StubController],
  providers: [StubService, { provide: STUB_CONFIG, useFactory: () => readStubConfig() }],
})
export class StubModule {}
