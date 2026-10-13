import { type DynamicModule, Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

const LIFECYCLE = new Set<PropertyKey>([
  'onModuleInit',
  'onModuleDestroy',
  'onApplicationShutdown',
  'beforeApplicationShutdown',
]);

/**
 * The same client without Nest lifecycle hooks: closing the break-glass app must not call
 * `$disconnect()` on the client of the main app.
 */
export function withoutLifecycle(prisma: PrismaService): PrismaService {
  return new Proxy(prisma, {
    get: (target, key, receiver) =>
      LIFECYCLE.has(key) ? undefined : (Reflect.get(target, key, receiver) as unknown),
    has: (target, key) => !LIFECYCLE.has(key) && Reflect.has(target, key),
  });
}

/** The break-glass listener reuses the main client: one pool within the db budget (0.8). */
@Module({})
export class SharedPrismaModule {
  static with(prisma: PrismaService): DynamicModule {
    return {
      module: SharedPrismaModule,
      global: true,
      providers: [{ provide: PrismaService, useValue: withoutLifecycle(prisma) }],
      exports: [PrismaService],
    };
  }
}
