// Texts of the big screen (3.5): nynorsk, English when the live questions have it. The presenter
// may switch; the hall reads the screen, so the words are short and large.
export type ScreenLang = 'nn' | 'en';

const nn = {
  tittel: 'Storskjerm',
  eyebrow: 'Live-spørsmål',
  svarPaMobilen: 'Svar på mobilen',
  skann: 'Skann koden for å svare',
  elle: 'eller gå til',
  forste: 'Det første spørsmålet kjem straks.',
  sporsmal: 'Spørsmål {i} av {n}',
  ope: 'Ope',
  stengt: 'Stengt',
  vist: 'Vist',
  ventar: 'Ventar',
  harSvart: 'har svart',
  faerre: 'Færre enn tre har svart',
  stengtTekst: 'Spørsmålet er stengt. Resultatet kjem når det blir vist.',
  forFa: 'For få svar til å vise tal',
  forFaTekst: 'Når færre enn tre har svart, viser vi ingen tal.',
  fleireVal: 'Kvar person kunne velje fleire svar.',
  tilkopla: 'Tilkopla',
  koplar: 'Koplar til …',
  borte: 'Mista sambandet. Prøver igjen …',
  opne: 'Opne',
  steng: 'Steng',
  vis: 'Vis',
  opneNr: 'Opne spørsmål {i}',
  stengNr: 'Steng spørsmål {i}',
  visNr: 'Vis resultatet av spørsmål {i}',
  velSporsmal: 'Vel spørsmål',
  styring: 'Styring',
  ingenNokkel: 'Lenkja til storskjermen manglar nøkkelen. Opne lenkja du fekk på nytt.',
  feil: 'Det gjekk ikkje. Prøv igjen.',
  sprak: 'Språk',
};
const en: typeof nn = {
  tittel: 'Big screen',
  eyebrow: 'Live questions',
  svarPaMobilen: 'Answer on your phone',
  skann: 'Scan the code to answer',
  elle: 'or go to',
  forste: 'The first question is coming up.',
  sporsmal: 'Question {i} of {n}',
  ope: 'Open',
  stengt: 'Closed',
  vist: 'Shown',
  ventar: 'Waiting',
  harSvart: 'have answered',
  faerre: 'Fewer than three have answered',
  stengtTekst: 'The question is closed. The result comes when it is shown.',
  forFa: 'Too few answers to show numbers',
  forFaTekst: 'When fewer than three have answered, we show no numbers.',
  fleireVal: 'Each person could choose more than one answer.',
  tilkopla: 'Connected',
  koplar: 'Connecting …',
  borte: 'Connection lost. Trying again …',
  opne: 'Open',
  steng: 'Close',
  vis: 'Show',
  opneNr: 'Open question {i}',
  stengNr: 'Close question {i}',
  visNr: 'Show the result of question {i}',
  velSporsmal: 'Choose a question',
  styring: 'Controls',
  ingenNokkel: 'The big screen link is missing its key. Open the link you got again.',
  feil: 'That did not work. Try again.',
  sprak: 'Language',
};
export type ScreenKey = keyof typeof nn;

export function st(
  lang: ScreenLang,
  key: ScreenKey,
  vars: Record<string, string | number> = {},
): string {
  return (lang === 'en' ? en : nn)[key].replace(/\{(\w)\}/g, (all, k: string) =>
    k in vars ? String(vars[k]) : all,
  );
}

/** A localized text of the poll in the screen's language, nynorsk when it lacks one. */
export const pick = (
  t: { nn: string; en?: string; nb?: string } | undefined,
  lang: ScreenLang,
): string => (lang === 'en' ? t?.en : undefined) ?? t?.nn ?? '';
