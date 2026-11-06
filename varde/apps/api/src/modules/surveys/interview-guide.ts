// The standard guide of «Kartlegging nøkkelpersonar» (2.20, decision 06.11): the 27 questions of the
// interview with key people (campaign draft N2–N28 of 04.11, reviewed Nynorsk), the short names the
// question list and the overview show, the themes and a few hints for the one who asks. «Nytt skjema →
// Samtale» starts from it; the guide is then edited and published in the workshop like any survey.
import type { TemplateContent } from '@varde/schema/template/template';

type Question = TemplateContent['questions'][number];

/** [id, theme (on the first question of a theme), short name, question, hint for the one who asks] */
const GUIDE: [string, string | null, string, string, string?][] = [
  [
    'N2',
    'Ansvar og rolle',
    'Kven har IT-ansvaret',
    'Er det definert kven som har ansvaret for IT hos dykk, eller «flyt» det litt rundt? Veit til dømes ein tilsett kven han skal gå til om han oppdagar eit IT-tryggleiksproblem?',
    'Lytt etter eit namn og ein stadfortredar, og om dei tilsette veit det. Ivaretatt: éin ansvarleg som alle kjenner. Forbetringspotensial: «det blir vel dagleg leiar». Manglar: ingen veit.',
  ],
  [
    'N3',
    null,
    'Informasjon om endringar',
    'Dersom de gjer endringar som gjeld tryggleik, blir dei tilsette informerte om dette? Korleis?',
  ],
  [
    'N4',
    'E-post, deling og tilgangar',
    'Privat e-post',
    'Brukar tilsette privat e-post saman med jobb-e-post?',
  ],
  [
    'N5',
    null,
    'Deling av filer',
    'Korleis blir filer delte internt og eksternt? (Eigne område for deling, passord, utløpsdato og liknande.)',
  ],
  [
    'N6',
    null,
    'Tilgang for vikarar',
    'Korleis blir tilgangar handterte for ferievikarar, sesongarbeidarar og liknande? Får dei eigne profilar?',
  ],
  [
    'N7',
    'Utstyr og programvare',
    'Oppdatering av PC og mobil',
    'Har de rutinar for jamleg oppdatering av PC-ar, telefonar og programvare?',
  ],
  [
    'N8',
    'Personvern og informasjon',
    'Opplysningar om kundar',
    'Er de kjende med kva opplysningar de har lov til å lagre om forretningsforbindelsane dykkar?',
  ],
  [
    'N9',
    null,
    'Kvar data ligg',
    'Har de kontroll på kva system bedriftsinformasjon eller personopplysningar blir lagra i?',
  ],
  [
    'N10',
    null,
    'Private einingar og program',
    'Har tilsette lov til å installere jobbsystem eller e-post på private einingar? Og har tilsette lov til å installere private program på jobb-PC-en?',
  ],
  [
    'N11',
    null,
    'Oversikt for Datatilsynet',
    'Har de oversikt over kvar alle interne personopplysningar ligg, slik at de veit at eit datainnbrot kan meldast til Datatilsynet?',
  ],
  [
    'N12',
    null,
    '2-faktorpålogging',
    'I system med bedriftsinformasjon eller personopplysningar: er det etablert 2-faktorpålogging?',
    'Spør system for system: e-post, rekneskap, filer, bank. Ivaretatt: 2-faktor overalt der det ligg bedrifts- eller personopplysningar.',
  ],
  [
    'N13',
    'Passord og pålogging',
    'Delte passord',
    'Brukar de delte passord for pålogging til ulike tenester?',
  ],
  ['N14', null, 'Sterke passord', 'Brukar de gode/sterke passord, utan gjenbruk av passord?'],
  ['N15', null, 'PC på reise', 'Har de reglar for bruk av PC på reise (til dømes Wi-Fi)?'],
  [
    'N16',
    'Tilgangsstyring og rutinar',
    'Tilgang til mapper',
    'Har de differensiert tilgang til filer og mapper?',
  ],
  [
    'N17',
    null,
    'Onboarding og offboarding',
    'Har de rutinar for onboarding og offboarding av tilsette? (Gjeld både system og rutinar.)',
  ],
  [
    'N18',
    'Leiing, øving og beredskap',
    'IT-tryggleik i leiinga',
    'Er IT-tryggleik ein del av det leiinga fokuserer på, til dømes på styremøte og i den daglege oppfølginga av tilsette?',
  ],
  [
    'N19',
    null,
    'Test av tilbakeføring',
    'Har de testa ei større tilbakeføring av data (eit simulert dataangrep)? Viss ikkje: trur de det hadde vore nyttig?',
    'Har dei prøvd å hente tilbake ei heil mappe eller ein heil maskin? Kor lang tid tok det, og kven gjorde det?',
  ],
  ['N20', null, 'Backup fleire stader', 'Har de backup på fleire lokasjonar?'],
  [
    'N21',
    null,
    'Phishing-reglar i M365',
    'Har de sett opp reglar i M365 for å førebyggje phishing?',
  ],
  ['N22', null, 'Phishing-trening', 'Trener de på å avsløre phishing?'],
  ['N23', null, 'Passordverktøy', 'Har de passordverktøy (ein passordhandterar)?'],
  ['N24', null, 'Årleg tryggleikssjekk', 'Gjennomfører de ein årleg tryggleikssjekk?'],
  [
    'N25',
    'Mobil og opplæring',
    'Mobil og bedriftsdata',
    'Korleis handterer de bruk av og tilgang til mobilar i forhold til bedriftsdata?',
  ],
  [
    'N26',
    null,
    'Opplæring i tryggleik',
    'Får tilsette opplæring i tryggleik? (Til dømes testing av e-postar, rutinar og liknande.)',
    'Døme: phishing-test, kurs, gjennomgang på personalmøtet. Kor ofte? Er nye tilsette med?',
  ],
  [
    'N27',
    'Beredskap ved hending',
    'Beredskapsplan',
    'Har de ein beredskapsplan ved IT-tryggleikshendingar?',
    'Kven gjer kva den første timen? Finst det ei kontaktliste på papir? Ivaretatt: skriftleg plan som er øvd. Forbetringspotensial: noko finst, men ikkje skrive ned. Manglar: ingen plan.',
  ],
  [
    'N28',
    null,
    'Kven ein kontaktar',
    'Veit tilsette kven dei skal kontakte ved mistenkjeleg aktivitet?',
  ],
];

/** The 27 questions as free-text questions of the common part, Nynorsk only. */
export function interviewGuideQuestions(): Question[] {
  return GUIDE.map(([id, theme, short, text, help]) => ({
    id,
    type: 'text' as const,
    part: 'common' as const,
    texts: {
      text: { nn: text },
      short_label: { nn: short },
      ...(theme === null ? {} : { section_title: { nn: theme } }),
      ...(help === undefined ? {} : { help: { nn: help } }),
    },
  }));
}
