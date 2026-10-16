// Invitation to a seminar (3.10), for a person to send by hand: the letter (nynorsk, and English
// when the seminar has it), the registration link, the calendar file and an A4 poster with a QR
// code made here (qrcode-generator, no outside service). Nothing is sent by Varde.
import { LOGO_PNG_BASE64 } from '../../home/logo.js';
import { escapeHtml, qrSvg } from '../rounds/poster.js';
import { topicOf } from './seminars.service.js';
import { whenText, type WhenLang } from './when.js';

/** The contact of Vardahei IT, as on the finish and error screens (test: equals the seed templates). */
export const VARDAHEI_CONTACT = {
  name: 'Vardahei IT',
  phone: '+47 930 94 567',
  email: 'post@vardahei.no',
};

export interface InvitationSeminar {
  topic_nn: string;
  topic_en: string | null;
  starts_at: Date;
  ends_at: Date;
  place: string;
  format: string;
  clients: string[];
}

const join = (names: readonly string[], and: string) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${and} ${names.at(-1)}`;

const LETTER: Record<WhenLang, (v: Record<string, string>) => string> = {
  nn: (v) =>
    [
      'Hei!',
      `Vardahei IT inviterer til seminaret «${v.topic}».`,
      [`Når: ${v.when}`, `Kvar: ${v.place}`, ...(v.clients ? [`For: ${v.clients}`] : [])].join(
        '\n',
      ),
      `Meld deg på her, det tek eitt minutt:\n${v.link}`,
      `Lenkja går til ${v.host}, så du kan trygt opne ho. Når du har meldt deg på, kan du leggje seminaret inn i kalenderen. Etter seminaret finn du lysark og lenkjer på same sida.`,
      'Velkomen!',
    ].join('\n\n'),
  en: (v) =>
    [
      'Hi,',
      `Vardahei IT invites you to the seminar “${v.topic}”.`,
      [`When: ${v.when}`, `Where: ${v.place}`, ...(v.clients ? [`For: ${v.clients}`] : [])].join(
        '\n',
      ),
      `Register here, it takes a minute:\n${v.link}`,
      `The link goes to ${v.host}, so it is safe to open. Once you have registered, you can add the seminar to your calendar. After the seminar, you will find slides and links on the same page.`,
      'Welcome!',
    ].join('\n\n'),
};

const placeText = (s: InvitationSeminar, lang: WhenLang) =>
  s.format === 'digital' ? `${lang === 'en' ? 'Online' : 'Digitalt'}, ${s.place}` : s.place;

/** The letter to copy or send from one's own e-mail. */
export function invitationText(
  s: InvitationSeminar,
  lang: WhenLang,
  link: string,
  host: string,
): string {
  return LETTER[lang]({
    topic: topicOf(s, lang),
    when: whenText(s.starts_at, s.ends_at, lang),
    place: placeText(s, lang),
    clients: join(s.clients, lang === 'en' ? 'and' : 'og'),
    link,
    host,
  });
}

const POSTER: Record<WhenLang, Record<string, string>> = {
  nn: {
    eyebrow: 'Seminar frå Vardahei IT',
    when: 'Når',
    where: 'Kvar',
    step1: 'Opne kameraet på mobilen',
    step2: 'Sikt på ruta',
    step3: 'Meld deg på, det tek eitt minutt',
    for: 'Seminar for',
    questions: 'Spørsmål?',
  },
  en: {
    eyebrow: 'Seminar from Vardahei IT',
    when: 'When',
    where: 'Where',
    step1: 'Open your phone camera',
    step2: 'Point it at the code',
    step3: 'Register, it takes a minute',
    for: 'Seminar for',
    questions: 'Questions?',
  },
};

/** A4 poster with the QR code of the registration link; inline styles, the logo as data URI. */
export function seminarPoster(s: InvitationSeminar, lang: WhenLang, link: string): string {
  const t = POSTER[lang];
  const e = (x: string) => escapeHtml(x);
  const topic = e(topicOf(s, lang));
  const clients = join(s.clients, lang === 'en' ? 'and' : 'og');
  return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${topic}</title>
<style>
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; background: #fff; color: #1e2a31; font-family: "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif; }
.ark { width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 18mm 20mm 60mm; margin: 0 auto; position: relative; }
.logo { height: 11mm; } .eyebrow { margin: 14mm 0 0; font-size: 11pt; letter-spacing: .12em; text-transform: uppercase; color: #176e91; font-weight: 700; }
h1 { font-size: 34pt; line-height: 1.08; margin: 4mm 0 8mm; letter-spacing: -.01em; max-width: 165mm; overflow-wrap: anywhere; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 2mm 6mm; margin: 0 0 10mm; font-size: 14pt; } dt { color: #5d6a71; } dd { margin: 0; font-weight: 700; }
.qr { display: flex; gap: 10mm; align-items: center; } .qr svg { width: 72mm; height: 72mm; flex-shrink: 0; }
.steg { font-size: 13pt; line-height: 1.5; padding: 0; margin: 0; list-style: none; } .steg li { margin-bottom: 4mm; } .steg b { color: #176e91; }
.lenkje { font-size: 9.5pt; color: #5d6a71; word-break: break-all; margin-top: 6mm; }
.fjell { position: absolute; left: 0; bottom: 0; width: 100%; height: 52mm; }
.botn { position: absolute; left: 20mm; right: 20mm; bottom: 9mm; display: flex; justify-content: space-between; gap: 8mm; font-size: 10pt; color: #fff; }
@media screen { body { background: #eef2f4; } .ark { background: #fff; } }
</style><body><main class="ark"><img class="logo" alt="Vardahei IT" src="data:image/png;base64,${LOGO_PNG_BASE64}">
<p class="eyebrow">${e(t.eyebrow!)}</p><h1>${topic}</h1>
<dl><dt>${e(t.when!)}</dt><dd>${e(whenText(s.starts_at, s.ends_at, lang))}</dd><dt>${e(t.where!)}</dt><dd>${e(placeText(s, lang))}</dd></dl>
<div class="qr">${qrSvg(link)}<ol class="steg"><li><b>1.</b> ${e(t.step1!)}</li><li><b>2.</b> ${e(t.step2!)}</li><li><b>3.</b> ${e(t.step3!)}</li></ol></div>
<p class="lenkje">${e(link)}</p>
<svg class="fjell" viewBox="0 0 210 52" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,52 0,30 18,24 28,28 48,16 60,22 82,10 96,18 118,6 130,13 150,2 164,9 184,14 210,8 210,52" fill="#dcebf2"/><polygon points="0,52 0,40 22,34 34,38 56,27 70,32 92,22 108,28 130,18 146,24 168,15 186,22 210,18 210,52" fill="#176e91"/></svg>
<div class="botn"><span>${clients ? `${e(t.for!)} ${e(clients)}` : e(t.eyebrow!)}</span><span>${e(t.questions!)} ${e(VARDAHEI_CONTACT.name)}, ${e(VARDAHEI_CONTACT.phone)}</span></div></main></body></html>`;
}

/** What is in the downloaded package (nynorsk; the files themselves in each language). */
export function readme(languages: readonly WhenLang[]): string {
  const en = languages.includes('en');
  return [
    'Invitasjon til seminar frå Varde. Varde sender ingenting sjølv: du sender invitasjonen frå din eigen e-post, i Teams eller på papir.',
    '',
    `invitasjon.txt – teksten på nynorsk${en ? ' (invitation-en.txt på engelsk)' : ''}. Kopier han inn i ein e-post.`,
    'lenkje-til-pamelding.txt – lenkja til påmeldinga. Alle som har lenkja, kan melde seg på.',
    `seminar.ics – kalenderfil${en ? ' (seminar-en.ics på engelsk)' : ''}. Legg ho ved e-posten, så kan mottakarane leggje seminaret i kalenderen.`,
    `plakat.html – A4-plakat med QR-kode${en ? ' (plakat-en.html på engelsk)' : ''}. Opne han i nettlesaren og skriv ut.`,
    '',
  ].join('\r\n');
}
