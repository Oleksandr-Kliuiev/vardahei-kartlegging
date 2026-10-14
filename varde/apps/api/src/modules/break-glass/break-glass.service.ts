// Break-glass lifecycle in the main app (0.8): checks the switch at start, writes AuditLog,
// serves the second app instance on a Unix socket (never TCP), closes it at UNTIL and revokes
// every break-glass session.
import { chmodSync, lstatSync, rmSync } from 'node:fs';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { configureApp } from '../../configure-app.js';
import { readBreakGlassConfig, socketPath } from '../../config/break-glass-config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import { SessionStore } from '../auth/session.store.js';
import { BreakGlassAppModule } from './break-glass-app.module.js';

export const SOCKET_MODE = 0o660;

/** A socket left behind by a crash or OOM (the directory is not tmpfs) is removed; other files are not. */
export function removeStaleSocket(path: string): void {
  try {
    if (lstatSync(path).isSocket()) rmSync(path);
    else throw new Error(`${path} exists and is not a socket`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

@Injectable()
export class BreakGlassService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('break-glass');
  private app: NestFastifyApplication | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly store: SessionStore,
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  get listening(): boolean {
    return this.app !== undefined;
  }

  async onApplicationBootstrap(): Promise<void> {
    const config = readBreakGlassConfig();
    if (config.state !== 'on') {
      // A socket left by an earlier window (crash, OOM) must not survive a restart in off mode.
      try {
        removeStaleSocket(socketPath());
      } catch (error) {
        this.logger.warn(`stale socket not removed: ${(error as Error).message}`);
      }
    }
    if (config.state === 'off') return;
    const who = `break-glass:${config.operator}`;
    if (config.state === 'rejected') {
      this.logger.warn(`not enabled: ${JSON.stringify(config.details)}`);
      await this.store
        .audit({ who, what: 'break_glass.rejected', details: config.details })
        .catch((e: unknown) => this.logger.error(`audit failed: ${(e as Error).message}`));
      return;
    }
    removeStaleSocket(config.socket);
    const app = await NestFactory.create<NestFastifyApplication>(
      BreakGlassAppModule.create({ prisma: this.prisma, store: this.store, config }),
      new FastifyAdapter(),
      { logger: ['error', 'warn'] },
    );
    app.get(EventsService).shareWith(this.events);
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().listen({ path: config.socket });
    // Node creates the socket by umask (0755); connect needs group write. setgid dir → group docker.
    chmodSync(config.socket, SOCKET_MODE);
    this.app = app;
    await this.store.audit({
      who,
      what: 'break_glass.enabled',
      details: { until: config.until.toISOString(), operator: config.operator },
    });
    this.logger.warn(`listening on ${config.socket} until ${config.until.toISOString()}`);
    this.timer = setTimeout(() => void this.close(who), config.until.getTime() - Date.now());
  }

  private async close(who: string): Promise<void> {
    const app = this.app;
    this.app = undefined;
    if (app !== undefined) await app.close();
    const revoked = await this.store.revokeVia('break_glass', new Date());
    await this.store.audit({ who, what: 'break_glass.closed', details: { revoked } });
    this.logger.warn('window closed');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer !== undefined) clearTimeout(this.timer);
    const app = this.app;
    this.app = undefined;
    if (app !== undefined) await app.close();
  }
}
