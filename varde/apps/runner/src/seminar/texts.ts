// Texts of the seminar page (3.2, 3.3): nynorsk first, English when the seminar has it.
// The consent text comes from the server with its version (apps/api …/seminars/consent.ts).
export type SemLang = 'nn' | 'en';

const nn = {
  sprak: 'Språk',
  eyebrow: 'Seminar frå Vardahei IT',
  nar: 'Når',
  kvar: 'Kvar',
  digitalt: 'Digitalt',
  forKundar: 'For',
  og: 'og',
  meldPa: 'Meld deg på',
  namn: 'Namn',
  bedrift: 'Bedrift',
  annaBedrift: 'Anna bedrift',
  namnBedrift: 'Namnet på bedrifta',
  epost: 'E-post',
  samtykke: 'Samtykke',
  valfritt: 'valfritt',
  lesMeir: 'Les meir om korleis vi handsamar opplysningane',
  visMindre: 'Vis mindre',
  meldMegPa: 'Meld meg på',
  sender: 'Sender …',
  feilNamn: 'Skriv namnet ditt.',
  feilEpost: 'Skriv ei gyldig e-postadresse.',
  feilBedrift: 'Vel bedrift, eller skriv namnet på bedrifta.',
  feilSamtykke: 'Kryss av for at vi kan lagre opplysningane for påmeldinga, så kan du melde deg på.',
  feilSjekk: 'Sjekk det du har skrive, og prøv igjen.',
  feilStengd: 'Påmeldinga er stengd.',
  feilEndra: 'Teksten om personvern er endra. Last sida på nytt og prøv igjen.',
  feilForMange: 'For mange påmeldingar akkurat no. Prøv igjen om litt.',
  feilNett: 'Påmeldinga kom ikkje fram. Sjekk nettet og prøv igjen.',
  pameldTittel: 'Du er påmeld',
  pameldTekst: 'Takk! Vi gler oss til å sjå deg.',
  kalender: 'Legg i kalenderen',
  kalenderFeil: 'Kalenderfila kom ikkje. Prøv igjen.',
  taVare:
    'Ta vare på lenkja til denne sida. Etter seminaret finn du lysark og lenkjer her.',
  overEyebrow: 'Seminaret er over',
  materiell: 'Materiell frå seminaret',
  ingenMateriell: 'Materiellet er ikkje lagt ut enno. Kom gjerne tilbake seinare.',
  stengd: 'Påmeldinga er stengd.',
  opnarNy: 'Opnar i ei ny fane',
  ugyldigTittel: 'Denne lenkja verkar ikkje',
  ugyldigTekst:
    'Sjekk at du har heile lenkja frå invitasjonen, med alle teikna på slutten. Spør den som sende deg ho, eller ta kontakt med oss.',
  byttTittel: 'Lenkja er bytt ut',
  byttTekst:
    'Det er laga ei ny lenkje til dette seminaret. Spør den som sende deg invitasjonen om den nye, eller ta kontakt med oss.',
  nettTittel: 'Ingen kontakt med Varde',
  nettTekst: 'Sjekk nettet og last sida på nytt.',
  hentar: 'Hentar seminaret …',
};
export type SemKey = keyof typeof nn;

const en: Record<SemKey, string> = {
  sprak: 'Language',
  eyebrow: 'Seminar from Vardahei IT',
  nar: 'When',
  kvar: 'Where',
  digitalt: 'Online',
  forKundar: 'For',
  og: 'and',
  meldPa: 'Register',
  namn: 'Name',
  bedrift: 'Company',
  annaBedrift: 'Another company',
  namnBedrift: 'Name of the company',
  epost: 'Email',
  samtykke: 'Consent',
  valfritt: 'optional',
  lesMeir: 'Read more about how we handle your details',
  visMindre: 'Show less',
  meldMegPa: 'Register me',
  sender: 'Sending …',
  feilNamn: 'Enter your name.',
  feilEpost: 'Enter a valid email address.',
  feilBedrift: 'Choose a company, or enter the name of yours.',
  feilSamtykke: 'Tick the box that lets us store your details for the registration, then you can register.',
  feilSjekk: 'Check what you entered and try again.',
  feilStengd: 'Registration is closed.',
  feilEndra: 'The privacy text has changed. Reload the page and try again.',
  feilForMange: 'Too many registrations right now. Please try again in a moment.',
  feilNett: 'Your registration did not get through. Check your connection and try again.',
  pameldTittel: 'You are registered',
  pameldTekst: 'Thank you! We look forward to seeing you.',
  kalender: 'Add to calendar',
  kalenderFeil: 'The calendar file did not arrive. Try again.',
  taVare: 'Keep the link to this page. After the seminar you will find slides and links here.',
  overEyebrow: 'The seminar is over',
  materiell: 'Material from the seminar',
  ingenMateriell: 'The material is not out yet. Please come back later.',
  stengd: 'Registration is closed.',
  opnarNy: 'Opens in a new tab',
  ugyldigTittel: 'This link does not work',
  ugyldigTekst:
    'Check that you have the whole link from the invitation, with all the characters at the end. Ask the person who sent it to you, or get in touch with us.',
  byttTittel: 'This link has been replaced',
  byttTekst:
    'A new link has been made for this seminar. Ask the person who sent you the invitation for the new one, or get in touch with us.',
  nettTittel: 'No connection to Varde',
  nettTekst: 'Check your connection and reload the page.',
  hentar: 'Loading the seminar …',
};

export const TEXTS: Record<SemLang, Record<SemKey, string>> = { nn, en };

export function st(lang: SemLang, key: SemKey): string {
  return TEXTS[lang][key];
}

/** «Gasta og Daco», «Gasta, Daco og Tharaso». */
export function list(names: readonly string[], lang: SemLang): string {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${st(lang, 'og')} ${names.at(-1)}`;
}
