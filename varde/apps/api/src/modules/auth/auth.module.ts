// Admin login (0.7): Entra OIDC, server-side sessions, AdminSessionGuard. One instance per
// listener: `main` (public, Entra sessions) and `break_glass` (Unix socket, 0.8).
import { type DynamicModule, Module } from '@nestjs/common';
import { type EntraSettings, readEntraSettings } from '../../config/auth-config.js';
import { AdminSessionGuard } from './admin-session.guard.js';
import { AuthController } from './auth.controller.js';
import { ENTRA_SETTINGS, OIDC_CLIENT } from './auth.tokens.js';
import { LISTENER, type Listener } from './listener.js';
import { OidcClient } from './oidc.client.js';
import { SessionService } from './session.service.js';
import { PrismaSessionStore, SessionStore } from './session.store.js';

@Module({})
export class AuthModule {
  /** `store` shares the session store of the main app with the break-glass listener. */
  static register(listener: Listener, store?: SessionStore): DynamicModule {
    return {
      module: AuthModule,
      // Global within its app: BreakGlassModule and later admin modules use the guard and store.
      global: true,
      controllers: [AuthController],
      providers: [
        { provide: ENTRA_SETTINGS, useFactory: () => readEntraSettings() },
        {
          provide: OIDC_CLIENT,
          inject: [ENTRA_SETTINGS],
          useFactory: (s: EntraSettings | null) => (s === null ? null : new OidcClient(s)),
        },
        store === undefined
          ? { provide: SessionStore, useClass: PrismaSessionStore }
          : { provide: SessionStore, useValue: store },
        { provide: LISTENER, useValue: listener },
        SessionService,
        AdminSessionGuard,
      ],
      exports: [SessionService, SessionStore, AdminSessionGuard, LISTENER],
    };
  }
}
