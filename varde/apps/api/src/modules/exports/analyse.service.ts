import { Injectable } from '@nestjs/common';
import { DashboardContext } from '../dashboard/dashboard-context.js';
import { RowsView } from '../dashboard/rows-view.js';
import { NotFoundError, PrivacyService, type PrivacySession } from '../privacy/privacy.service.js';
import { analyseCsv, analyseRows } from './analyse.js';
import { csv } from './csv.js';

@Injectable()
export class AnalyseService {
  constructor(
    private readonly context: DashboardContext,
    private readonly privacy: PrivacyService,
    private readonly view: RowsView,
  ) {}
  async analyse(round: string, template: string | undefined, session: PrivacySession | undefined) {
    const scope = await this.context.load(round);
    if (template && template !== scope.content.key) throw new NotFoundError();
    const data = await this.privacy.masterAnalyseExport({ round }, session);
    return analyseCsv(
      analyseRows(scope.content, data.rows, new Map(scope.clients.map((c) => [c.slug, c.name]))),
    );
  }
  async people(round: string, session: PrivacySession | undefined) {
    const scope = await this.context.load(round);
    if (scope.content.key !== 'tryggleik') throw new NotFoundError();
    // Master audit is committed with the underlying response read, including previous rows.
    const model = await this.view.perEmployee(round, undefined, session, 'exports.master_analyse');
    return csv(
      ['Initialar', 'Kunde', 'Rolle', 'Snittscore', 'Sone', 'Sone førre runde'],
      model.rows.map((r) => [
        r.respondent_key,
        r.client_name,
        r.role,
        r.mean === null ? '' : r.mean.toFixed(2).replace('.', ','),
        r.zone === null ? '' : ['Grøn', 'Gul', 'Oransje', 'Raud'][r.zone],
        r.previous?.zone == null ? '' : ['Grøn', 'Gul', 'Oransje', 'Raud'][r.previous.zone],
      ]),
    );
  }
}
