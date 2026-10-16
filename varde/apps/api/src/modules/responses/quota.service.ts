import { HttpException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ResolvedRoundClient } from '../rounds/codes.js';
import { readQuotaConfig } from '../../config/quota-config.js';
import { PrivacyService } from '../privacy/privacy.service.js';
import { QUOTA_MESSAGE, SlidingWindow } from './sliding-window.js';

/** Insertion-only quota. Caller serializes replay before reaching this method. */
@Injectable()
export class QuotaService {
  readonly limits = readQuotaConfig();
  private readonly window = new SlidingWindow();
  constructor(private readonly privacy: PrivacyService) {}

  async consume(
    roundClient: ResolvedRoundClient,
    tx: Prisma.TransactionClient,
    ip: string,
  ): Promise<() => void> {
    await tx.$queryRaw`SELECT id FROM round_client WHERE id = ${roundClient.id}::uuid FOR UPDATE`;
    const max = Math.max(
      this.limits.round_client_min,
      (roundClient.population_snapshot ?? 0) * this.limits.round_client_factor,
    );
    if ((await this.privacy.store.count(tx, roundClient.id)) >= max)
      throw new HttpException(QUOTA_MESSAGE, 429);
    return this.window.reserve([
      { key: 'global', max: this.limits.global_per_10min },
      { key: `ip:${ip}`, max: this.limits.per_ip_per_10min },
    ]);
  }

  /** Seminar live poll (3.4, ADR-009): at most `live_participants_max` answers per question, and
   * 10-minute windows of its own, so a hall behind one NAT never meets the limits of surveys. */
  async consumeLive(
    roundClient: ResolvedRoundClient,
    tx: Prisma.TransactionClient,
    ip: string,
    question: string,
  ): Promise<() => void> {
    await tx.$queryRaw`SELECT id FROM round_client WHERE id = ${roundClient.id}::uuid FOR UPDATE`;
    if (
      (await this.privacy.live.answered(tx, roundClient.round_id, question)) >=
      this.limits.live_participants_max
    )
      throw new HttpException(QUOTA_MESSAGE, 429);
    return this.window.reserve([
      { key: 'live:global', max: this.limits.live_global_per_10min },
      { key: `live:ip:${ip}`, max: this.limits.live_per_ip_per_10min },
    ]);
  }
}
