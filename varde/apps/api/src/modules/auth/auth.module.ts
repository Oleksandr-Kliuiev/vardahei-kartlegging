// Admin login (0.7): Entra OIDC on the public listener, server-side sessions, AdminSessionGuard.
import { Module } from '@nestjs/common';
import { readEntraSettings } from '../../config/auth-config.js';
import { AdminSessionGuard } from './admin-session.guard.js';
import { AuthController } from './auth.controller.js';
import { ENTRA_SETTINGS, OIDC_CLIENT } from './auth.tokens.js';
import { LISTENER } from './listener.js';
import { OidcClient } from './oidc.client.js';
import { SessionService } from './session.service.js';
import { PrismaSessionStore, SessionStore } from './session.store.js';
import type { EntraSettings } from '../../config/auth-config.js';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: ENTRA_SETTINGS, useFactory: () => readEntraSettings() },
    {
      provide: OIDC_CLIENT,
      inject: [ENTRA_SETTINGS],
      useFactory: (s: EntraSettings | null) => (s === null ? null : new OidcClient(s)),
    },
    { provide: SessionStore, useClass: PrismaSessionStore },
    { provide: LISTENER, useValue: 'main' },
    SessionService,
    AdminSessionGuard,
  ],
  exports: [SessionService, SessionStore, AdminSessionGuard, LISTENER],
})
export class AuthModule {}
