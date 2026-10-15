import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AdminSessionGuard, type AdminRequest } from '../auth/admin-session.guard.js';
import { dashboardQuery, parseInput } from '../dashboard/dashboard.controller.js';
import { AnalyseService } from './analyse.service.js';
import { z } from 'zod';
import { CsvService } from './csv.service.js';
import { RoundArchiveService } from './round-archive.service.js';

export function sendCsv(reply: FastifyReply, name: string, body: string) {
  return reply
    .header('Cache-Control', 'no-store')
    .header('Content-Disposition', `attachment; filename="${name}.csv"`)
    .type('text/csv; charset=utf-8')
    .send(body);
}
const query = dashboardQuery.omit({ role: true });
@Controller('api/admin/exports')
@UseGuards(AdminSessionGuard)
export class ExportsController {
  constructor(
    private readonly csv: CsvService,
    private readonly analyse: AnalyseService,
    private readonly archives: RoundArchiveService,
  ) {}
  /** Archive of a closed round (5.2): aggregates and definitions only, AuditLog per download. */
  @Get('archive.json')
  async archive(@Query() input: unknown, @Req() req: AdminRequest, @Res() reply: FastifyReply) {
    const q = parseInput(query.omit({ client: true }), input);
    const archive = await this.archives.export(q.round, req.adminSession);
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="varde-arkiv-${q.round}.json"`)
      .type('application/json; charset=utf-8')
      .send(JSON.stringify(archive));
  }
  @Get('analyse.csv')
  async master(@Query() input: unknown, @Req() req: AdminRequest, @Res() reply: FastifyReply) {
    const q = parseInput(
      query.omit({ client: true }).extend({ template: z.string().optional() }),
      input,
    );
    return sendCsv(
      reply,
      'analyse',
      await this.analyse.analyse(q.round, q.template, req.adminSession),
    );
  }
  @Get('analyse-personar.csv')
  async people(@Query() input: unknown, @Req() req: AdminRequest, @Res() reply: FastifyReply) {
    const q = parseInput(query.omit({ client: true }), input);
    return sendCsv(reply, 'analyse-personar', await this.analyse.people(q.round, req.adminSession));
  }
  @Get('client.csv')
  async client(@Query() input: unknown, @Res() reply: FastifyReply) {
    const q = parseInput(query.required({ client: true }), input);
    return sendCsv(reply, 'samla', await this.csv.client(q.round, q.client));
  }
  @Get('rows.csv')
  async rows(@Query() input: unknown, @Req() req: AdminRequest, @Res() reply: FastifyReply) {
    const q = parseInput(query, input);
    return sendCsv(reply, 'svar', await this.csv.rows(q.round, q.client, req.adminSession));
  }
}
