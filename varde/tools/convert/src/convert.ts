// sporsmal.js → TemplateContent (1.2): the mapping table of 1a.md 1.2 step 1. The result is
// parsed with the 1.1 schema (`TemplateVersionContent`), so a converted template is valid.
import type { TemplateContent } from '@varde/schema/template/template';
import type { LocalizedText } from '@varde/schema/template/texts';
import { TemplateVersionContent } from '@varde/schema/template/validate';
import { expressionFor } from './expressions.js';
import type { Kartlegging, Skjema, Sporsmal, Tekst, Val } from './kartlegging.js';

const text = (t: Tekst): LocalizedText => ({ nn: t.nn, en: t.en });
const nnOnly = (s: string): LocalizedText => ({ nn: s });

/** Identifier question of a survey: `initialar`, or F1 for tryggleik (mandatory since 12.10). */
export function identifierOf(skjema: Skjema): string | undefined {
  return skjema.initialar ?? (skjema.id === 'tryggleik' ? 'F1' : undefined);
}

function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as T;
}

function option(q: Sporsmal, o: Val): Record<string, unknown> {
  return compact({
    id: o.id,
    texts: { text: text(o) },
    score: q.farge?.[o.id],
    visible_if: o.vis === undefined ? undefined : expressionFor(`vis:${q.id}:${o.id}`, o.vis),
  });
}

function question(skjema: Skjema, q: Sporsmal): Record<string, unknown> {
  const frozen = skjema.id === 'tryggleik' && /^F([1-9]|1\d|2[0-2])$/.test(q.id);
  const anchored = frozen || q.anker === true;
  const isChoice = q.type === 'single' || q.type === 'multi';
  const base = compact({
    id: q.id,
    part: q.del === 'A' ? 'common' : 'leader',
    type: q.type,
    texts: compact({
      text: text(q.tekst),
      help: q.hjelp && text(q.hjelp),
      section_title: q.ingress && text(q.ingress),
      placeholder: q.plasshaldar && text(q.plasshaldar),
      short_label: q.kort === undefined ? undefined : nnOnly(q.kort),
    }),
    visible_if:
      q.vis === undefined ? undefined : (expressionFor(`vis:${q.id}`, q.vis)),
    optional: q.valfri ? true : undefined,
    required: q.paakravd ? true : undefined,
    role: q.rolle ? true : undefined,
    anchor_key: anchored ? q.id : undefined,
    frozen: frozen ? true : undefined,
    identifier: identifierOf(skjema) === q.id ? true : undefined,
  });
  const free = q.fritekst && compact({ texts: { text: text(q.fritekst) }, when: q.fritekstNaar });
  const scale = q.skala && {
    min: q.skala.min,
    max: q.skala.max,
    low: text(q.skala.lav),
    high: text(q.skala.hog),
  };
  if (isChoice) {
    const exclusive = (q.val ?? []).filter((o) => o.aleine).map((o) => o.id);
    return compact({
      ...base,
      options: (q.val ?? []).map((o) => option(q, o)),
      choices_from: q.valFraa,
      exclusive_options: exclusive.length > 0 ? exclusive : undefined,
      max_choices: q.type === 'multi' ? q.maks : undefined,
      min_choices: q.type === 'multi' ? q.minst : undefined,
      free_text: free,
      scenario:
        q.scenario && q.rett && q.fasit
          ? {
              correct_options: q.rett,
              explanation: {
                title: text(q.fasit.tittel),
                text: { nn: q.fasit.nn, en: q.fasit.en },
              },
            }
          : undefined,
    });
  }
  if (q.type === 'text') {
    return compact({
      ...base,
      single_line: q.einlinje ? true : undefined,
      uppercase: q.stor ? true : undefined,
      max_length: q.maksLengd,
    });
  }
  if (q.type === 'scale') {
    return compact({
      ...base,
      rows: (q.rader ?? []).map((r) => ({ id: r.id, texts: { text: text(r) } })),
      scale,
      free_text: free,
    });
  }
  return compact({ ...base, scale, free_text: free });
}

export function convertSkjema(k: Kartlegging, id: string): TemplateContent {
  const skjema = k.skjema[id];
  if (skjema === undefined) throw new Error(`converter: no skjema ${id}`);
  const scored = skjema.sporsmal.some((q) => q.farge !== undefined);
  const raw = compact({
    key: skjema.id,
    audience: 'client_survey',
    identification: identifierOf(skjema) === undefined ? 'none' : 'initials',
    required_languages: ['nn', 'en'],
    score_scale: scored
      ? { key: 'risk-0-3', levels: k.soner.nivaa.map((n) => ({ id: n.id, label: nnOnly(n.namn) })) }
      : undefined,
    leader_roles: k.leiarRoller,
    intro: {
      title: text(skjema.namn),
      short: text(skjema.kort),
      minutes: skjema.minutt,
      letter: skjema.brev.nn.map((nn, i) => ({ nn, en: skjema.brev.en[i] ?? '' })),
      sender: text(k.avsendar),
      facts: [skjema.fakta2, skjema.fakta3, skjema.fakta4].filter((f) => f !== undefined).map(text),
      contact: {
        name: k.kontakt.namn,
        phone: k.kontakt.telefon,
        email: k.kontakt.epost,
        hours: text(k.kontakt.tider),
      },
    },
    leader_intro: { title: text(skjema.leiar.tittel), text: text(skjema.leiar.tekst) },
    tips: skjema.tips.map((t) =>
      compact({
        id: t.id,
        when: expressionFor(`naar:${t.id}`, t.naar),
        title: text(t.tittel),
        text: { nn: t.nn, en: t.en },
        closing: t.avslutning ? true : undefined,
        reserve: t.reserve ? true : undefined,
      }),
    ),
    max_tips: k.maksTips,
    questions: skjema.sporsmal.map((q) => question(skjema, q)),
  });
  const parsed = TemplateVersionContent.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `converter: ${id} does not pass the schema: ${JSON.stringify(parsed.error.issues.slice(0, 5))}`,
    );
  }
  return parsed.data;
}
