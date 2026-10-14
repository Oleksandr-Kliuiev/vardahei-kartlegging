import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { ComparisonView } from './comparison-view.js';
import { AggregateView } from './aggregate-view.js';

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException('Kontroller opplysningane.');
  return result.data;
}

export const dashboardQuery = z.strictObject({
  round: z.uuid(),
  client: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
});
@Controller('api/admin')
@UseGuards(AdminSessionGuard)
export class DashboardController {
  constructor(
    private readonly view: AggregateView,
    private readonly comparison: ComparisonView,
  ) {}
  @Get('dashboard/comparison')
  comparisonView(@Query() query: unknown) {
    const q = parseInput(dashboardQuery, query);
    return this.comparison.load(q.round, q.client, q.role);
  }
  @Get('dashboard')
  dashboard(@Query() query: unknown) {
    const q = parseInput(dashboardQuery, query);
    return this.view.load(q.round, q.client, q.role);
  }
}
