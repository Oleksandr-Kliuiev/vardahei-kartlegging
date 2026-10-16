// The «Live» tab of a seminar (3.5): the poll's snapshot (the same the big screen gets), the
// published versions that can become a live poll (with the reason when one cannot), and the state
// of the presenter key — never the key itself.
import { Injectable, NotFoundException } from '@nestjs/common';
import { TemplateVersionContent } from '@varde/schema/template/validate';
import { PrismaService } from '../../prisma/prisma.service.js';
import { liveProblem } from './live-template.js';
import { LiveView } from './live-view.js';
import { PresenterTokenService } from './presenter-token.service.js';

@Injectable()
export class LiveAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly view: LiveView,
    private readonly keys: PresenterTokenService,
  ) {}

  async roundOf(seminar: string): Promise<string> {
    const s = await this.prisma.seminar.findUnique({ where: { id: seminar } });
    if (!s) throw new NotFoundException('Seminaret finst ikkje.');
    if (s.round_live_id === null) throw new NotFoundException('Seminaret har ingen live-spørsmål.');
    return s.round_live_id;
  }

  async panel(seminar: string) {
    const s = await this.prisma.seminar.findUnique({ where: { id: seminar } });
    if (!s) throw new NotFoundException('Seminaret finst ikkje.');
    const versions = await this.prisma.templateVersion.findMany({
      where: { status: 'published', template: { audience: 'seminar_live' } },
      include: { template: { select: { key: true } } },
      orderBy: [{ template: { key: 'asc' } }, { version_no: 'desc' }],
    });
    return {
      poll: s.round_live_id === null ? null : await this.view.snapshot(s.round_live_id),
      versions: versions.map((v) => {
        const parsed = TemplateVersionContent.safeParse(v.content);
        return {
          id: v.id,
          key: v.template.key,
          label: v.label,
          questions: parsed.success ? parsed.data.questions.length : 0,
          problem: parsed.success ? liveProblem(parsed.data) : 'Versjonen er ikkje gyldig.',
        };
      }),
      presenter: await this.keys.status(seminar),
    };
  }
}
