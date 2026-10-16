import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { TemplateContent } from '@varde/schema/template/template';
import type { Lang, LocalizedText } from '@varde/schema/template/texts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { posterHtml } from './poster.js';

@Injectable()
export class InvitationService {
  constructor(private readonly prisma: PrismaService) {}
  private async data(id: string, requested?: string) {
    const rc = await this.prisma.roundClient.findUnique({
      where: { id },
      include: { round: { include: { template_version: true } }, client: true },
    });
    // A seminar live poll (3.4) has no invitation or poster of a survey.
    if (!rc?.round.template_version || rc.round.type === 'live')
      throw new NotFoundException('Kartlegginga finst ikkje.');
    if (!rc.code || rc.code_revoked_at)
      throw new ConflictException('Opne kartlegginga og lag ei gyldig lenkje først.');
    const version = rc.round.template_version.content as unknown as TemplateContent;
    const languages = rc.round.template_version.required_languages;
    const lang =
      requested ?? (languages.includes(rc.client.default_lang) ? rc.client.default_lang : 'nn');
    if (!languages.includes(lang) || !['nn', 'en', 'nb'].includes(lang))
      throw new BadRequestException('Språket er ikkje tilgjengeleg.');
    if (!version.invitation)
      throw new ConflictException('Denne versjonen har ikkje invitasjonstekst.');
    let origin: URL;
    try {
      origin = new URL(process.env.PUBLIC_URL ?? '');
    } catch {
      throw new ServiceUnavailableException('Adressa til kartlegginga er ikkje sett opp.');
    }
    if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password)
      throw new ServiceUnavailableException('Adressa til kartlegginga er ikkje sett opp.');
    const link = `${origin.origin}/r?c=${rc.code}`;
    const day = rc.deadline
      ? new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'nn-NO', {
          day: 'numeric',
          month: 'long',
          weekday: 'long',
          timeZone: 'Europe/Oslo',
        }).format(new Date(`${rc.deadline.toISOString().slice(0, 10)}T12:00:00Z`))
      : '';
    const deadline = day
      ? lang === 'en'
        ? `Please answer by ${day}.`
        : `Svar gjerne innan ${day}.`
      : '';
    const fill = (t: LocalizedText) => {
      const source = t[lang as Lang];
      if (source === undefined) throw new BadRequestException('Omsetjinga manglar.');
      const replacements: Record<string, string> = {
        minutt: String(version.intro.minutes),
        lenkje: link,
        frist: deadline ? `\n\n${deadline}` : '',
        host: origin.host,
      };
      return source.replace(/\{(minutt|lenkje|frist|host)\}/g, (_, k: string) => replacements[k]!);
    };
    return { rc, version, lang, link, deadline, fill };
  }
  async invitation(id: string, lang?: string) {
    const d = await this.data(id, lang);
    return {
      lang: d.lang,
      languages: d.version.required_languages,
      text: d.fill(d.version.invitation!.letter),
      link: d.link,
    };
  }
  async poster(id: string, lang?: string) {
    const d = await this.data(id, lang),
      p = d.version.invitation!.poster;
    return posterHtml({
      lang: d.lang,
      client: d.rc.client.name,
      link: d.link,
      title: d.fill(p.title),
      text: d.fill(p.text),
      footer: d.fill(p.footer),
      deadline: d.deadline,
      phone: d.version.intro.contact.phone,
    });
  }
}
