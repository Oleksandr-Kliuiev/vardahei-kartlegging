import { type DynamicModule, Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

/** The break-glass listener reuses the main client: one pool within the db budget (0.8). */
@Module({})
export class SharedPrismaModule {
  static with(prisma: PrismaService): DynamicModule {
    return {
      module: SharedPrismaModule,
      global: true,
      providers: [{ provide: PrismaService, useValue: prisma }],
      exports: [PrismaService],
    };
  }
}
