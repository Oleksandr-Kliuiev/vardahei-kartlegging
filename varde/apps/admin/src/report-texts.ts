// Texts of the client report (5.1) in the report languages: nynorsk is the source, English
// and bokmål follow it. The admin controls around the sheet are nynorsk only (ADR-019).
export type ReportLang = 'nn' | 'en' | 'nb';
type Change = { delta: number; kind: string } | null;
type Stats = { mean: number | null; critical: number | null; zone: number | null };

export interface ClientReport {
  class: 'aggregate';
  round_client: string;
  round: { id: string; name: string; type: string; opened: string | null; closed: string | null };
  client: { name: string };
  template: string;
  lang: ReportLang;
  languages: ReportLang[];
  generated: string;
  contact: { name: string; phone: string; email: string; hours: Partial<Record<ReportLang, string>> };
  respondents: number | null;
  zone: Stats | null;
  findings: {
    key: string;
    level: 'medium' | 'high';
    severity: 'risk' | 'opportunity';
    lang: 'nn' | 'en';
    tal: string;
    text: string;
    action: string;
  }[];
  questions: (Stats & { id: string; label: string; before: Stats | null })[];
  comparison: {
    round: { name: string; type: string };
    degree: 'comparable' | 'approximate';
    before: Stats & { respondents: number | null };
    now: Stats & { respondents: number | null };
    change: { mean: Change; critical: Change };
  } | null;
}

export const LANGUAGE_NAMES: Record<ReportLang, string> = {
  nn: 'Nynorsk',
  en: 'English',
  nb: 'Bokmål',
};

const nn = {
  kicker: { tryggleik: 'IT-tryggleik hos', ki: 'KI i kvardagen hos', other: 'Kartlegging hos' },
  made: 'Laga',
  closed: 'avslutta',
  zone: 'Sone',
  mean: 'Snittscore',
  of3: 'av 3',
  critical: 'Kritisk andel',
  respondents: 'Svar',
  scale:
    'Kvart svar gir 0–3 poeng: grøn 0, gul 1, oransje 2 og raud 3. Snittscoren er gjennomsnittet av poenga, og kritisk andel er delen av svara som er oransje eller raude. Lågare er betre.',
  tooFew:
    'Det kom inn for få svar til at vi kan vise tal. Vi viser berre tal som byggjer på minst tre svar.',
  findings: { tryggleik: 'Dette bør de ta tak i', other: 'Det viktigaste vi fann' },
  noFindings: 'Vi fann ingen tydelege problem i svara.',
  level: {
    risk: { high: 'Høg', medium: 'Middels' },
    opportunity: { high: 'Stor', medium: 'Verdt' },
  },
  suggest: 'Kva vi føreslår',
  compare: (name: string) => `Samanlikna med ${name}`,
  before: 'Før',
  now: 'No',
  change: 'Endring',
  kinds: { betre: 'betre', verre: 'verre', likt: 'likt' } as Record<string, string>,
  points: 'prosentpoeng',
  caveat: {
    comparable: (b: string, n: string) =>
      `Spørsmåla og svaralternativa er dei same, men samanlikninga er omtrentleg: det er ikkje nødvendigvis dei same personane som har svart, og talet på svar er ulikt (${b} før, ${n} no).`,
    approximate: (b: string, n: string) =>
      `Nokre spørsmål eller svaralternativ er endra sidan sist, så samanlikninga er berre omtrentleg. Det er heller ikkje nødvendigvis dei same personane som har svart (${b} svar før, ${n} no).`,
  },
  questions: 'Spørsmål for spørsmål',
  question: 'Spørsmål',
  previous: 'Førre runde',
  dash: '– tyder at det er for få svar til å vise talet.',
  method: 'Om tala',
  methodText:
    'Tala er samla frå svara til dei tilsette. Vi viser berre tal som byggjer på minst tre svar, og vi skjuler grupper som kunne avsløre svara til færre enn tre personar. Rapporten har ingen namn eller initialar og ingen enkeltsvar, og svara frå leiarane er ikkje med.',
  contact: 'Kontakt',
  contactLead: 'Spørsmål om rapporten? Ta kontakt med oss.',
  zones: ['Grøn', 'Gul', 'Oransje', 'Raud'],
};
export type ReportTexts = typeof nn;

const en: ReportTexts = {
  kicker: { tryggleik: 'IT security at', ki: 'AI in everyday work at', other: 'Survey at' },
  made: 'Made',
  closed: 'closed',
  zone: 'Zone',
  mean: 'Average score',
  of3: 'of 3',
  critical: 'Critical share',
  respondents: 'Responses',
  scale:
    'Each answer scores 0–3: green 0, yellow 1, orange 2 and red 3. The average score is the mean of these points, and the critical share is the share of answers that are orange or red. Lower is better.',
  tooFew:
    'Too few people answered for us to show numbers. We only show numbers based on at least three answers.',
  findings: { tryggleik: 'What you should address', other: 'Our main findings' },
  noFindings: 'We found no clear problems in the answers.',
  level: {
    risk: { high: 'High', medium: 'Medium' },
    opportunity: { high: 'Large', medium: 'Worth a look' },
  },
  suggest: 'What we suggest',
  compare: (name) => `Compared with ${name}`,
  before: 'Before',
  now: 'Now',
  change: 'Change',
  kinds: { betre: 'better', verre: 'worse', likt: 'unchanged' },
  points: 'percentage points',
  caveat: {
    comparable: (b, n) =>
      `The questions and answer options are the same, but the comparison is approximate: the people who answered are not necessarily the same, and the number of answers differs (${b} before, ${n} now).`,
    approximate: (b, n) =>
      `Some questions or answer options have changed since last time, so the comparison is only approximate. The people who answered are not necessarily the same either (${b} answers before, ${n} now).`,
  },
  questions: 'Question by question',
  question: 'Question',
  previous: 'Previous round',
  dash: '– means there are too few answers to show the number.',
  method: 'About the numbers',
  methodText:
    "The numbers combine the employees' answers. We only show numbers based on at least three answers, and we hide groups that could reveal the answers of fewer than three people. The report contains no names or initials and no individual answers, and the leaders' answers are not included.",
  contact: 'Contact',
  contactLead: 'Questions about the report? Get in touch.',
  zones: ['Green', 'Yellow', 'Orange', 'Red'],
};

const nb: ReportTexts = {
  kicker: { tryggleik: 'IT-sikkerhet hos', ki: 'KI i hverdagen hos', other: 'Kartlegging hos' },
  made: 'Laget',
  closed: 'avsluttet',
  zone: 'Sone',
  mean: 'Snittscore',
  of3: 'av 3',
  critical: 'Kritisk andel',
  respondents: 'Svar',
  scale:
    'Hvert svar gir 0–3 poeng: grønn 0, gul 1, oransje 2 og rød 3. Snittscoren er gjennomsnittet av poengene, og kritisk andel er andelen av svarene som er oransje eller røde. Lavere er bedre.',
  tooFew:
    'Det kom inn for få svar til at vi kan vise tall. Vi viser bare tall som bygger på minst tre svar.',
  findings: { tryggleik: 'Dette bør dere ta tak i', other: 'Det viktigste vi fant' },
  noFindings: 'Vi fant ingen tydelige problemer i svarene.',
  level: {
    risk: { high: 'Høy', medium: 'Middels' },
    opportunity: { high: 'Stor', medium: 'Verdt' },
  },
  suggest: 'Hva vi foreslår',
  compare: (name) => `Sammenlignet med ${name}`,
  before: 'Før',
  now: 'Nå',
  change: 'Endring',
  kinds: { betre: 'bedre', verre: 'verre', likt: 'likt' },
  points: 'prosentpoeng',
  caveat: {
    comparable: (b, n) =>
      `Spørsmålene og svaralternativene er de samme, men sammenligningen er omtrentlig: det er ikke nødvendigvis de samme personene som har svart, og antall svar er ulikt (${b} før, ${n} nå).`,
    approximate: (b, n) =>
      `Noen spørsmål eller svaralternativer er endret siden sist, så sammenligningen er bare omtrentlig. Det er heller ikke nødvendigvis de samme personene som har svart (${b} svar før, ${n} nå).`,
  },
  questions: 'Spørsmål for spørsmål',
  question: 'Spørsmål',
  previous: 'Forrige runde',
  dash: '– betyr at det er for få svar til å vise tallet.',
  method: 'Om tallene',
  methodText:
    'Tallene er samlet fra svarene til de ansatte. Vi viser bare tall som bygger på minst tre svar, og vi skjuler grupper som kunne avsløre svarene til færre enn tre personer. Rapporten har ingen navn eller initialer og ingen enkeltsvar, og svarene fra lederne er ikke med.',
  contact: 'Kontakt',
  contactLead: 'Spørsmål om rapporten? Ta kontakt med oss.',
  zones: ['Grønn', 'Gul', 'Oransje', 'Rød'],
};

export const TEXTS: Record<ReportLang, ReportTexts> = { nn, en, nb };

/** 1,23 in nn/nb, 1.23 in en; hidden (null) is «–», never zero. */
export function decimal(x: number | null | undefined, lang: ReportLang): string {
  if (x == null) return '–';
  const s = x.toFixed(2);
  return lang === 'en' ? s : s.replace('.', ',');
}
export function percent(x: number | null | undefined, lang: ReportLang): string {
  if (x == null) return '–';
  return `${Math.round(x * 100)}${lang === 'en' ? '%' : ' %'}`;
}
const MONTHS: Record<ReportLang, readonly string[]> = {
  nn: [
    'januar',
    'februar',
    'mars',
    'april',
    'mai',
    'juni',
    'juli',
    'august',
    'september',
    'oktober',
    'november',
    'desember',
  ],
  nb: [
    'januar',
    'februar',
    'mars',
    'april',
    'mai',
    'juni',
    'juli',
    'august',
    'september',
    'oktober',
    'november',
    'desember',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
};
/** Written out by hand: browsers do not all carry nynorsk month names (Intl falls back to en). */
function parts(iso: string, lang: ReportLang) {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return { y, m, d: lang === 'en' ? `${d}` : `${d}.`, month: MONTHS[lang][m - 1] ?? '' };
}
/** «16. oktober 2026», «16 October 2026». */
export function dayText(iso: string, lang: ReportLang): string {
  const p = parts(iso, lang);
  return `${p.d} ${p.month} ${p.y}`;
}
/** «1.–14. oktober 2026», «28. september – 14. oktober 2026», or «avslutta 15. oktober 2026». */
export function periodText(opened: string | null, closed: string | null, lang: ReportLang) {
  if (opened && closed && opened !== closed) {
    const a = parts(opened, lang),
      b = parts(closed, lang);
    if (a.y !== b.y) return `${dayText(opened, lang)} – ${dayText(closed, lang)}`;
    if (a.m !== b.m) return `${a.d} ${a.month} – ${b.d} ${b.month} ${b.y}`;
    return `${a.d}–${b.d} ${b.month} ${b.y}`;
  }
  if (closed) return `${TEXTS[lang].closed} ${dayText(closed, lang)}`;
  return opened ? dayText(opened, lang) : '';
}
export function changeText(c: Change, lang: ReportLang, points = false): string {
  if (!c) return '–';
  const t = TEXTS[lang];
  if (c.kind === 'likt') return t.kinds.likt ?? 'likt';
  const size = points ? `${Math.abs(c.delta)} ${t.points}` : decimal(Math.abs(c.delta), lang);
  return `${c.delta > 0 ? '+' : '−'}${size}, ${t.kinds[c.kind] ?? c.kind}`;
}
export const ZONE_IDS = ['gron', 'gul', 'oransje', 'raud'];
