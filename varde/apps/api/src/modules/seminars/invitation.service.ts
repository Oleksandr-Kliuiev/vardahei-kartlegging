// «Last ned invitasjon» (3.10): the letter, the link, the calendar file and the A4 poster of one
// seminar, one by one or together in a zip. Admin session only; nothing is sent from here. The
// download is in AuditLog with the hash prefix of the code, never the code itself (ADR-009).
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { codeHash } from '../rounds/codes.js';
import { invitationText, readme, seminarPoster, type InvitationSeminar } from './invitation.js';
import { seminarCalendar } from './public-seminar.service.js';
import { publicOrigin, registrationLink, SeminarsService, type SeminarRow } from './seminars.service.js';
import type { WhenLang } from './when.js';

@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seminars: SeminarsService,
  ) {}

  private async load(id: string, lang?: string) {
    const s = await this.seminars.row(id);
    const link = registrationLink(s.code),
      origin = publicOrigin();
    if (!link || !origin) throw new ServiceUnavailableException('Adressa til Varde (PUBLIC_URL) er ikkje sett opp.');
    const l = (lang ?? 'nn') as WhenLang;
    if (!s.required_languages.includes(l)) throw new BadRequestException('Språket er ikkje tilgjengeleg.');
    return { s, link, host: origin.host, lang: l };
  }

  private static seminar(s: SeminarRow): InvitationSeminar {
    return {
      ...s,
      clients: s.clients.map((c) => c.client.name).sort((a, b) => a.localeCompare(b, 'nb')),
    };
  }

  async text(id: string, lang?: string) {
    const d = await this.load(id, lang);
    return {
      lang: d.lang,
      languages: d.s.required_languages,
      text: invitationText(InvitationService.seminar(d.s), d.lang, d.link, d.host),
      link: d.link,
    };
  }

  async poster(id: string, lang?: string) {
    const d = await this.load(id, lang);
    return seminarPoster(InvitationService.seminar(d.s), d.lang, d.link);
  }

  async calendar(id: string, lang?: string) {
    const d = await this.load(id, lang);
    return seminarCalendar(d.s, d.lang, 'invitation');
  }

  /** The whole package; every language of the seminar. */
  async zip(id: string, who: string): Promise<Uint8Array> {
    const d = await this.load(id);
    const seminar = InvitationService.seminar(d.s);
    const langs = d.s.required_languages as WhenLang[];
    const suffix = (l: WhenLang) => (l === 'nn' ? '' : `-${l}`);
    const files: [string, string][] = [['LES-MEG.txt', readme(langs)]];
    for (const l of langs) {
      files.push([
        l === 'nn' ? 'invitasjon.txt' : `invitation${suffix(l)}.txt`,
        invitationText(seminar, l, d.link, d.host).replace(/\n/g, '\r\n'),
      ]);
      files.push([`seminar${suffix(l)}.ics`, seminarCalendar(d.s, l, 'invitation')]);
      files.push([`plakat${suffix(l)}.html`, seminarPoster(seminar, l, d.link)]);
    }
    files.push(['lenkje-til-pamelding.txt', `${d.link}\r\n`]);
    const zip = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
    for (const [name, text] of files) await zip.add(name, new TextReader(text));
    const bytes = await zip.close();
    await this.prisma.auditLog.create({
      data: {
        who,
        what: 'seminars.invitation',
        target: `seminar:${id}`,
        details: { hash: codeHash(d.s.code).slice(0, 12), files: files.length },
      },
    });
    return bytes;
  }
}
