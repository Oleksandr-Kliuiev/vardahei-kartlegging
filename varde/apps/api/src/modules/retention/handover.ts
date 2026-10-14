import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ZipWriter, TextReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { PrivacyService, type PrivacySession } from '../privacy/privacy.service.js';
import { analyseRows, analyseCsv } from '../exports/analyse.js';
import { csv } from '../exports/csv.js';

const TTL = 10 * 60_000;
@Injectable()
export class HandoverService implements OnModuleDestroy {
  private readonly files = new Map<
    string,
    { bytes: Uint8Array; expires: number; timer: NodeJS.Timeout }
  >();
  constructor(private readonly privacy: PrivacyService) {}
  async create(
    client: string,
    reason: string,
    recipient: string,
    session: PrivacySession | undefined,
  ) {
    if (!reason.trim() || !recipient.trim())
      throw new BadRequestException('Skriv inn grunngjeving og mottakar.');
    const data = await this.privacy.handover(client, reason, recipient, session);
    const names = new Map([[data.client.slug, data.client.name]]);
    const details = (part: 'common' | 'leader') =>
      analyseCsv(
        data.bundles.flatMap((b) =>
          b.rows
            .filter((r) => r.part === part)
            .flatMap((r) => {
              const rows = analyseRows(b.content, [r], names);
              if (rows.length) return rows;
              const role = b.content.questions.find((q) => q.role);
              const label =
                role && 'options' in role
                  ? (role.options.find((o) => o.id === r.role)?.texts.text.nn ?? r.role)
                  : r.role;
              // Skipping every question is valid. Still return that submission's identity and day.
              return [
                [
                  r.respondent_key ?? '',
                  data.client.name,
                  'Innsending utan svar',
                  '',
                  '',
                  '',
                  label,
                  b.content.intro.title.nn,
                  part === 'leader' ? 'B' : 'A',
                  '',
                  '',
                  r.submitted_day,
                  r.source_id ?? r.submission_id,
                ],
              ];
            }),
        ),
      );
    const password = randomBytes(18).toString('base64url');
    const zip = new ZipWriter(new Uint8ArrayWriter(), {
      password,
      encryptionStrength: 3,
      useWebWorkers: false,
      level: 0,
    });
    const files = {
      'svar.csv': details('common'),
      'leiar.csv': details('leader'),
      'samla.csv': csv(
        ['Runde', 'Population', 'Metric', 'Gruppe', 'n', 'Teljar', 'Nemnar', 'Manglar', 'Utdatert'],
        data.snapshots.map((s) => [
          s.round,
          s.population,
          s.metric,
          s.group,
          s.n,
          s.numerator,
          s.denominator,
          s.missing,
          s.stale,
        ]),
      ),
      'LES-MEG.txt':
        'Data frå Vardahei IT til ' +
        data.client.name +
        '.\r\nSvar frå alle rundar er i svar.csv; svar frå leiarane er i leiar.csv. Initialar er tomme i anonyme rundar.\r\nInnsending utan svar tyder at ingen spørsmålsvar vart sende inn.\r\nSamla publiserte tal for dykkar verksemd er i samla.csv. Tomme felt er undertrykte av omsyn til personvern.\r\nFila er kryptert med AES-256. Opne med 7-Zip og passordet som vart vist ved utleveringa.\r\nOppbevar data trygt og del dei berre med den godkjende mottakaren.\r\n',
    };
    for (const [name, text] of Object.entries(files)) await zip.add(name, new TextReader(text));
    const bytes = await zip.close();
    const id = randomUUID();
    const timer = setTimeout(() => {
      this.files.delete(id);
    }, TTL);
    timer.unref();
    this.files.set(id, { bytes, expires: Date.now() + TTL, timer });
    return { handover_id: id, password };
  }
  take(id: string, now = Date.now()): Uint8Array {
    const file = this.files.get(id);
    if (!file) throw new NotFoundException('Fila finst ikkje lenger.');
    this.files.delete(id);
    clearTimeout(file.timer);
    if (file.expires <= now) throw new NotFoundException('Fila har gått ut på tid.');
    return file.bytes;
  }
  onModuleDestroy() {
    for (const f of this.files.values()) clearTimeout(f.timer);
    this.files.clear();
  }
}
