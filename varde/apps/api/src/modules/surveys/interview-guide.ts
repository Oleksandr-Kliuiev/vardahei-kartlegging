// The standard guide of «Kartlegging nøkkelpersonar» (2.20, decision 06.11): the 27 questions of the
// interview with key people (campaign draft N2–N28 of 04.11, reviewed Nynorsk), the short names the
// question list and the overview show, the themes and a few hints for the one who asks. «Nytt skjema →
// Samtale» starts from it; the guide is then edited and published in the workshop like any survey.
// Each question says when it is Ivaretatt, Forbetringspotensial or Manglar (3.1, decision 07.11; the
// texts of 07.11, read and corrected before the first publication on 08.11).
import { criterionEntries } from '@varde/schema/template/criteria';
import type { TemplateContent } from '@varde/schema/template/template';

type Question = TemplateContent['questions'][number];

/** [id, theme (on the first question of a theme), short name, question, hint for the one who asks] */
const GUIDE: [string, string | null, string, string, string?][] = [
  [
    'N2',
    'Ansvar og rolle',
    'Kven har IT-ansvaret',
    'Er det definert kven som har ansvaret for IT hos dykk, eller «flyt» det litt rundt? Veit til dømes ein tilsett kven han skal gå til om han oppdagar eit IT-tryggleiksproblem?',
    'Lytt etter eit namn og ein stadfortredar, og om dei tilsette veit det.',
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
    'Er de kjende med kva opplysningar de har lov til å lagre om forretningspartnarane dykkar?',
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
    'Spør system for system: e-post, rekneskap, filer, bank.',
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
    'Kven gjer kva den første timen? Finst det ei kontaktliste på papir?',
  ],
  [
    'N28',
    null,
    'Kven ein kontaktar',
    'Veit tilsette kven dei skal kontakte ved mistenkjeleg aktivitet?',
  ],
];

/** When a question is [Ivaretatt, Forbetringspotensial, Manglar]: one or two lines under each button. */
const CRITERIA: Record<string, [string, string, string]> = {
  N2: [
    'Éin namngitt ansvarleg med stadfortredar, og dei tilsette veit kven det er.',
    'Nokon tek det i praksis, til dømes dagleg leiar, men det er ikkje avklart eller kjent for alle.',
    'Ingen har ansvaret, eller ingen veit kven som har det.',
  ],
  N3: [
    'Dei tilsette får alltid vite om endringar som gjeld tryggleik, med kva dei skal gjere og kvifor.',
    'Dei tilsette får vite om det av og til, eller berre munnleg utan fast måte.',
    'Dei tilsette får ikkje vite om endringar.',
  ],
  N4: [
    'Jobb-e-post og privat e-post er skilde, og det er sagt tydeleg at privat e-post ikkje skal brukast til jobb.',
    'Det skjer av og til, eller det finst ingen klar regel.',
    'Privat e-post blir brukt fast til jobb.',
  ],
  N5: [
    'Filer blir delte frå jobbområde med tilgangsstyring, og lenkjer ut av huset har utløpsdato eller passord.',
    'Deling skjer mest frå jobbområde, men utan faste reglar for lenkjer ut eller for å avslutte deling.',
    'Filer blir delte via privat e-post, minnepinne eller private skytenester utan kontroll.',
  ],
  N6: [
    'Kvar vikar får eigen brukar med berre det han treng, og tilgangen blir stengd når han sluttar.',
    'Vikarar får eigen brukar, men tilgangen blir ikkje alltid avgrensa eller stengd i tide.',
    'Vikarar brukar brukarane til andre eller delte innloggingar.',
  ],
  N7: [
    'PC-ar, mobilar og program blir oppdaterte automatisk eller etter fast rutine, og nokon følgjer med på at det skjer.',
    'Oppdateringar skjer, men utan fast rutine eller kontroll.',
    'Oppdateringar blir utsette eller ikkje gjorde.',
  ],
  N8: [
    'Dei veit kva dei kan lagre om kundar og forretningspartnarar og kor lenge, og følgjer det.',
    'Dei har ei viss formeining, men ingen skrivne reglar eller sletterutinar.',
    'Dei kjenner ikkje til reglane.',
  ],
  N9: [
    'Dei har ei skriven oversikt over kva system bedriftsinformasjon og personopplysningar ligg i.',
    'Dei veit det stort sett, men oversikta er ikkje skriven ned eller er ufullstendig.',
    'Dei veit ikkje kvar data ligg.',
  ],
  N10: [
    'Klare reglar for jobbsystem på private einingar og for private program på jobb-PC, og dei blir følgde.',
    'Det er lov i praksis utan klare reglar, eller reglane er ikkje kjende.',
    'Alt er lov, og ingen har oversikt.',
  ],
  N11: [
    'Oversikt over personopplysningane, og dei veit at eit avvik skal meldast til Datatilsynet innan 72 timar og av kven.',
    'Noko oversikt finst, men dei er usikre på meldeplikta eller kven som melder.',
    'Inga oversikt og ingen kjennskap til meldeplikta.',
  ],
  N12: [
    '2-faktor er på i alle system med bedrifts- eller personopplysningar: e-post, rekneskap, filer, bank.',
    '2-faktor i nokre system, til dømes e-post, men ikkje i alle.',
    'Ingen 2-faktor.',
  ],
  N13: [
    'Kvar har sin eigen brukar; delte passord finst ikkje, eller ligg berre i ein delt passordhandterar.',
    'Nokre få delte passord, til dømes til ei felles teneste, utan rutine for å byte dei.',
    'Delte passord er vanleg, til dømes på lappar eller i e-post.',
  ],
  N14: [
    'Lange og unike passord overalt, ofte med passordhandterar; ingen gjenbruk.',
    'Passorda er stort sett gode, men noko gjenbruk skjer.',
    'Korte passord eller same passord fleire stader.',
  ],
  N15: [
    'Reglar for PC på reise (VPN eller mobildeling, ikkje opne nett, PC-en låst og med seg), og dei tilsette kjenner dei.',
    'Det blir sagt munnleg, men utan reglar.',
    'Ingen reglar.',
  ],
  N16: [
    'Tilgang til filer og mapper er styrt etter rolle, og nokon går gjennom tilgangane jamleg.',
    'Noko er skilt ut, til dømes løn eller leiing, elles har alle tilgang til alt.',
    'Alle har tilgang til alt.',
  ],
  N17: [
    'Skriven sjekkliste for nye og for dei som sluttar (brukarar, utstyr, tilgangar), og ho blir følgd.',
    'Det blir gjort, men utan sjekkliste, så noko kan bli gløymt.',
    'Inga rutine; tilgangar blir ståande etter at folk har slutta.',
  ],
  N18: [
    'IT-tryggleik står fast på dagsordenen til leiinga eller styret, med ansvar og oppfølging.',
    'Det blir teke opp av og til, gjerne etter ei hending.',
    'Leiinga tek ikkje opp IT-tryggleik.',
  ],
  N19: [
    'Dei har prøvd å hente tilbake ei heil mappe eller maskin det siste året og veit kor lang tid det tek.',
    'Små tilbakeføringar har vore gjorde, men aldri ei større.',
    'Aldri testa.',
  ],
  N20: [
    'Backup ligg minst to stader, og minst éin kopi ligg utanfor kontoret eller kan ikkje endrast.',
    'Backup finst, men berre éin stad eller utan kopi utanfor.',
    'Ingen backup, eller dei veit ikkje.',
  ],
  N21: [
    'Vern mot phishing og skadeleg innhald er sett opp i M365, og nokon følgjer med på det.',
    'Standardoppsettet er på, men ingenting er tilpassa.',
    'Dei veit ikkje, eller ingenting er sett opp.',
  ],
  N22: [
    'Fast trening for alle, til dømes phishing-test eller kurs minst éin gong i året.',
    'Trening har vore, men ikkje fast eller ikkje for alle.',
    'Inga trening.',
  ],
  N23: [
    'Alle brukar ein felles passordhandterar.',
    'Nokon brukar passordhandterar, men ikkje alle, eller berre den i nettlesaren.',
    'Ingen passordhandterar.',
  ],
  N24: [
    'Fast årleg gjennomgang av IT-tryggleiken, med tiltak som blir følgde opp.',
    'Det har vore gjort, men ikkje fast.',
    'Aldri gjort.',
  ],
  N25: [
    'Mobilar med bedriftsdata er styrte (til dømes Intune), med kode og fjernsletting, og det er klart kva som er lov.',
    'Kode på mobilen er kravd, men mobilane er ikkje styrte.',
    'Ingen kontroll med mobilar som har bedriftsdata.',
  ],
  N26: [
    'Alle, også nye tilsette, får fast opplæring i tryggleik, og det blir følgt opp.',
    'Opplæring av og til, eller berre for nokre.',
    'Inga opplæring.',
  ],
  N27: [
    'Skriven plan som er øvd: kven gjer kva den første timen, og kontaktliste på papir.',
    'Noko finst, men det er ikkje skrive ned eller ikkje øvd.',
    'Ingen plan.',
  ],
  N28: [
    'Alle tilsette veit kven dei skal kontakte ved mistenkjeleg aktivitet, og det står der dei finn det.',
    'Dei fleste veit det, men det står ingen stad.',
    'Dei tilsette veit ikkje kven dei skal kontakte.',
  ],
};

/** The 27 questions as free-text questions of the common part, Nynorsk only. */
export function interviewGuideQuestions(): Question[] {
  return GUIDE.map(([id, theme, short, text, help]) => {
    const criteria = CRITERIA[id];
    return {
      id,
      type: 'text' as const,
      part: 'common' as const,
      texts: {
        text: { nn: text },
        short_label: { nn: short },
        ...(theme === null ? {} : { section_title: { nn: theme } }),
        ...(help === undefined ? {} : { help: { nn: help } }),
        ...(criteria === undefined
          ? {}
          : {
              criteria_ivaretatt: { nn: criteria[0] },
              criteria_forbetring: { nn: criteria[1] },
              criteria_manglar: { nn: criteria[2] },
            }),
      },
    };
  });
}

/** The next draft of a guide made before 3.1 (none of its questions has a criterion) takes the standard
 * criteria for the questions it shares with the standard guide, by id, so the guide in use gets them to
 * read and correct in the workshop and, once published, in its running rounds. A guide that has any
 * criterion keeps exactly what it has: a criterion removed on purpose stays removed. */
export function withStandardCriteria(content: TemplateContent): TemplateContent {
  const entries = criterionEntries();
  const has = content.questions.some((q) => entries.some(([, key]) => q.texts[key] !== undefined));
  if (content.audience !== 'interview' || has) return content;
  return {
    ...content,
    questions: content.questions.map((q) => {
      const criteria = CRITERIA[q.id];
      if (criteria === undefined) return q;
      const texts = { ...q.texts };
      entries.forEach(([, key], n) => (texts[key] = { nn: criteria[n]! }));
      return { ...q, texts };
    }),
  };
}
