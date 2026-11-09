// Campaign «Haust 2026» for Vardahei's IT clients and the BIO participants: builds three template
// contents for Varde from the seeded tryggleik version.
//  1. tryggleik, version «Haust 2026»: employees (F1–F22 unchanged + T1–T5). The leader part (B1–B19)
//     is the seed's, unchanged — 04.11: plans changed, the R1–R23 leader block was dropped again.
//  2. it-kartlegging: a new survey for whoever runs IT at the company.
//  3. nokkelpersonar-intervju: a free-text interview for a key person (owner/manager), built from the
//     questions of the old «Kartlegging nøkkelpersoner» interview sheet. No choice questions apart from
//     the one role question every Varde survey needs (decision 5, 17.10).
// Usage: node kampanje.mjs <seed tryggleik json> <out dir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [seedPath, outDir] = process.argv.slice(2);
const seed = JSON.parse(readFileSync(seedPath, 'utf8')).content;
const byId = new Map(seed.questions.map((q) => [q.id, q]));
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------- helpers ----------
const w = (nn, en) => ({ nn, en });
const o = (id, nn, en) => ({ id, texts: { text: w(nn, en) } });
const vk = o('vk', 'Veit ikkje', 'Not sure');
const ja = o('ja', 'Ja', 'Yes');
const nei = o('nei', 'Nei', 'No');
const delvis = o('delvis', 'Delvis', 'Partly');
const usikker = o('usikker', 'Usikker', 'Not sure');
const tick = w('Kryss av alt som passar.', 'Tick everything that applies.');
const optional = w('Valfritt.', 'Optional.');
const section = (q, nn, en) => ({ ...q, texts: { ...q.texts, section_title: w(nn, en) } });
const single = (id, part, nn, en, options, extra = {}) => ({
  id, type: 'single', part, texts: { text: w(nn, en), ...(extra.texts ?? {}) },
  options, ...omit(extra, 'texts'),
});
const multi = (id, part, nn, en, options, extra = {}) => ({
  id, type: 'multi', part, texts: { text: w(nn, en), help: tick, ...(extra.texts ?? {}) },
  options, ...omit(extra, 'texts'),
});
const text = (id, part, nn, en, extra = {}) => ({
  id, type: 'text', part, texts: { text: w(nn, en), ...(extra.texts ?? {}) }, ...omit(extra, 'texts'),
});
function omit(obj, key) {
  const { [key]: _, ...rest } = obj;
  return rest;
}
const help = (nn, en) => ({ texts: { help: w(nn, en) } });

// The texts suit both Vardahei's clients and the BIO participants (most of them not clients).

// ---------- 1. tryggleik, version «Haust 2026» ----------
const F = seed.questions.filter((q) => q.id.startsWith('F')).map(clone);
// F1 is frozen: only its help text changes (there is no previous round for these companies);
// publish it as an orthographic change so the anchor and the comparison stay.
const f1 = F.find((q) => q.id === 'F1');
f1.texts.help = w(
  'Initialane gjer at vi kan sjå svar og score per rolle og per tilsett, og samanlikne når vi spør att seinare.',
  'Your initials let us see answers and scores per role and per employee, and compare when we ask again later.',
);

const T = [
  section(
    multi('T1', 'common',
      'Brukar du eigen mobil eller PC til jobb-e-post, Teams eller jobbfiler?',
      'Do you use your own phone or computer for work email, Teams or work files?',
      [
        o('mobil', 'Ja, privat mobil', 'Yes, my own phone'),
        o('pc', 'Ja, privat PC eller nettbrett', 'Yes, my own computer or tablet'),
        o('nei', 'Nei, berre utstyr frå jobben', 'No, only equipment from work'),
        usikker,
      ],
      { exclusive_options: ['nei', 'usikker'] }),
    'Kvardagen din', 'Your everyday work'),
  single('T2', 'common',
    'Deler du innlogging (brukarnamn og passord) med kollegaer til nokon system?',
    'Do you share a login (username and password) with colleagues for any system?',
    [ja, nei, usikker],
    help('Til dømes ein felles konto til nettbutikk, bookingsystem, sosiale medium eller ein leverandørportal.',
      'For example a shared account for an online shop, booking system, social media or a supplier portal.')),
  single('T3', 'common',
    'Då du byrja i jobben, fekk du ein gjennomgang av IT-rutinane (passord, e-post og kven du seier frå til om noko er mistenkeleg)?',
    'When you started your job, did you get an introduction to the IT routines (passwords, email and who to tell if something looks suspicious)?',
    [ja, o('litt', 'Litt', 'A little'), nei, o('hugsar', 'Hugsar ikkje', "Don't remember")]),
  single('T4', 'common',
    'Tenk deg at du har klikka på ei mistenkeleg lenke. Ville du sagt frå med ein gong?',
    "Imagine you've clicked a suspicious link. Would you tell someone straight away?",
    [
      o('ja', 'Ja, med ein gong', 'Yes, straight away'),
      o('nola', 'Ja, men eg ville nøla', "Yes, but I'd hesitate"),
      o('nei', 'Truleg ikkje', 'Probably not'),
      usikker,
    ],
    help('Svar ærleg. Det fortel oss om det er lett å seie frå hos dykk.',
      "Answer honestly. It tells us whether it's easy to speak up at your workplace.")),
];
// T5: the approved situation K21 of «Arbeidsdagen og KI», word for word (the answer is explained at the end).
const kiSeed = JSON.parse(readFileSync(seedPath.replace('tryggleik.2026-10-13', 'ki.2026-10-13'), 'utf8')).content;
const k21 = clone(kiSeed.questions.find((q) => q.id === 'K21'));
T.push({ ...k21, id: 'T5' });

// The leader part: plans changed 04.11 — the R1–R23 block is dropped again, so the leader part is
// exactly the seed's (B1–B19), unmodified. The old interview content lives in nokkelpersonar-intervju
// instead (see below).
const leader = seed.questions.filter((q) => q.part === 'leader').map(clone);

const tryggleik = {
  ...clone(seed),
  intro: {
    ...clone(seed.intro),
    minutes: 6,
    letter: [
      w('Vardahei IT kartlegg IT-sikkerheit og beredskap i bedrifta di. Første steg er å finne ut korleis det står til i kvardagen hos dykk: kva rutinar som finst, korleis de held styr på passord og innlogging, og kva de gjer om noko går gale.',
        'Vardahei IT is assessing IT security and preparedness in your company. The first step is to find out how things stand in your everyday work: which routines exist, how you keep track of passwords and sign-ins, and what you do if something goes wrong.'),
      w('Svara blir ein del av kartlegginga, og vi brukar dei til å finne ut kva bedrifta bør ta tak i først.',
        'The answers become part of the assessment, and we use them to find out what the company should tackle first.'),
    ],
    facts: [
      w('Vi spør om initialane dine, slik at vi kan sjå kva som har endra seg når vi spør att seinare. Svara per person ser berre Vardahei IT. Bedrifta får eit samla bilete utan initialar.',
        'We ask for your initials so we can see what has changed when we ask again later. Only Vardahei IT sees answers per person. Your company gets an overall picture without initials.'),
      clone(seed.intro.facts[1]),
      w('Vi går gjennom det vi fann saman med leiinga i bedrifta, og det blir grunnlaget for kva de gjer vidare.',
        'We go through what we found with the management of your company, and it becomes the basis for what you do next.'),
    ],
  },
  leader_intro: clone(seed.leader_intro),
  invitation: {
    letter: w(
      'Hei alle!\n\nVi kartlegg IT-sikkerheita vår saman med Vardahei IT. Første steg er ei kort undersøking om korleis IT-sikkerheita er i kvardagen vår: kva rutinar vi har, korleis vi held styr på passord og innlogging, og kva vi gjer om noko går gale.\n\nDu skriv inn initialane dine først, elles er det ingen namn. Svara per person ser berre Vardahei IT, og bedrifta får eit samla bilete. Det tek om lag {minutt} minutt, og «usikker» er eit heilt greitt svar.\n\n{lenkje}\n\nLenkja går til {host}, så du kan trygt opne ho.{frist}\n\nTakk!',
      "Hi everyone,\n\nWe're assessing our IT security together with Vardahei IT. The first step is a short survey about what IT security looks like in our everyday work: which routines we have, how we keep track of passwords and sign-ins, and what we do if something goes wrong.\n\nYou enter your initials first; apart from that there are no names. Only Vardahei IT sees answers per person, and the company gets an overall picture. It takes about {minutt} minutes, and “not sure” is a perfectly fine answer.\n\n{lenkje}\n\nThe link goes to {host}, so it's safe to open.{frist}\n\nThanks!"),
    poster: clone(seed.invitation.poster),
  },
  questions: [...F.filter((q) => +q.id.slice(1) <= 19), ...T, ...F.filter((q) => +q.id.slice(1) >= 20), ...leader],
};

// ---------- 2. it-kartlegging ----------
const I = 'common';
const it = {
  key: 'it-kartlegging',
  audience: 'client_survey',
  identification: 'initials',
  required_languages: ['nn', 'en'],
  leader_roles: [],
  intro: {
    title: w('Teknisk kartlegging', 'Technical assessment'),
    short: w('Teknisk kartlegging', 'Technical assessment'),
    minutes: 15,
    letter: [
      w('Vardahei IT kartlegg IT-sikkerheit og beredskap i bedrifta. Denne delen er for den som kjenner IT-oppsettet best, anten det er ein tilsett eller ein IT-leverandør.',
        "Vardahei IT is assessing IT security and preparedness in the company. This part is for whoever knows the IT setup best, whether that's an employee or an IT provider."),
      w('Spørsmåla handlar om brukarkontoar, utstyr, nettverk, e-post, backup og overvaking. Svara gir oss eit bilete av infrastrukturen, så vi kan bruke tida på det som betyr mest når vi går gjennom kartlegginga med bedrifta.',
        'The questions cover user accounts, devices, network, email, backup and monitoring. The answers give us a picture of the infrastructure, so we can spend the time on what matters most when we go through the assessment with the company.'),
    ],
    sender: clone(seed.intro.sender),
    facts: [
      w('Ikkje skriv passord, nøklar eller andre hemmelege opplysningar i skjemaet. Vi spør korleis ting er ordna, ikkje etter sjølve tilgangane.',
        "Don't write passwords, keys or other secrets in the form. We ask how things are set up, not for the credentials themselves."),
      w('«Veit ikkje» er eit nyttig svar. Det fortel oss kva vi bør sjå nærare på saman.',
        '“Not sure” is a useful answer. It tells us what we should look at together.'),
      w('Svara ser berre Vardahei IT. Vi går gjennom dei saman med bedrifta.',
        'Only Vardahei IT sees the answers. We go through them with the company.'),
    ],
    contact: clone(seed.intro.contact),
  },
  leader_intro: {
    title: w('Nokre spørsmål til deg som leiar', 'A few questions for you as a manager'),
    text: w('Sidan du har ansvar i bedrifta, har vi nokre spørsmål til.', 'Since you have responsibility in the company, we have a few more questions.'),
  },
  tips: [],
  max_tips: 0,
  invitation: {
    letter: w(
      'Hei!\n\nVi kartlegg IT-sikkerheita vår saman med Vardahei IT. Som ein del av kartlegginga vil Vardahei IT ha ei oversikt over IT-oppsettet vårt: brukarkontoar, utstyr, nettverk, e-post, backup og overvaking.\n\nKan du som kjenner IT-en vår best fylle ut skjemaet? Det tek om lag {minutt} minutt. Ikkje skriv passord eller andre hemmelege opplysningar i skjemaet.\n\n{lenkje}\n\nLenkja går til {host}, så du kan trygt opne ho.{frist}\n\nTakk!',
      "Hi,\n\nWe're assessing our IT security together with Vardahei IT. As part of the assessment, Vardahei IT would like an overview of our IT setup: user accounts, devices, network, email, backup and monitoring.\n\nCould you, as the person who knows our IT best, fill in the form? It takes about {minutt} minutes. Please don't write passwords or other secrets in the form.\n\n{lenkje}\n\nThe link goes to {host}, so it's safe to open.{frist}\n\nThanks!"),
    poster: {
      title: w('Teknisk kartlegging', 'Technical assessment'),
      text: w('For den som kjenner IT-oppsettet best. Det tek om lag {minutt} minutt.', 'For whoever knows the IT setup best. It takes about {minutt} minutes.'),
      footer: w('Ikkje skriv passord eller andre hemmelege opplysningar i skjemaet. Svara ser berre Vardahei IT.',
        "Don't write passwords or other secrets in the form. Only Vardahei IT sees the answers."),
    },
  },
  questions: [
    section({
      ...clone(byId.get('F1')), id: 'I1', anchor_key: undefined, frozen: undefined,
      texts: {
        text: clone(byId.get('F1').texts.text),
        help: w('Initialane gjer at vi veit kven vi kan spørje om noko er uklart. Svara ser berre Vardahei IT.',
          'Your initials tell us who to ask if something is unclear. Only Vardahei IT sees the answers.'),
        placeholder: w('OLNOR', 'OLNOR'),
      },
    }, 'Om deg', 'About you'),
    single('I2', I, 'Kva er rolla di i IT-arbeidet for bedrifta?', "What is your role in the company's IT?", [
      o('intern', 'Eg er tilsett og har IT som hovudoppgåve', "I'm employed and IT is my main job"),
      o('deltid', 'Eg er tilsett og tek IT ved sida av anna arbeid', "I'm employed and handle IT alongside other work"),
      o('ekstern', 'Eg er ekstern IT-leverandør', "I'm an external IT provider"),
      o('leiar', 'Eg er dagleg leiar', "I'm the managing director"),
      o('anna', 'Anna', 'Other'),
    ], { role: true, required: true }),

    section(single('I3', I, 'Kven driftar IT-en hos dykk i dag?', 'Who runs IT in your company today?', [
      o('intern', 'Ein eigen IT-tilsett', 'A dedicated IT employee'),
      o('deltid', 'Ein tilsett ved sida av anna arbeid', 'An employee, alongside other work'),
      o('ekstern', 'Ein ekstern IT-leverandør', 'An external IT provider'),
      o('delt', 'Delt mellom oss og ein ekstern leverandør', 'Shared between us and an external provider'),
      o('ingen', 'Ingen fast ordning', 'No fixed arrangement'),
    ], { free_text: { texts: { text: w('Kva leverandør? (valfritt)', 'Which provider? (optional)') }, when: ['ekstern', 'delt'] } }),
    'IT-ansvar og dokumentasjon', 'IT responsibility and documentation'),
    single('I4', I, 'Står det i ein skriftleg avtale kva IT-leverandøren har ansvar for (til dømes backup, oppdateringar og overvaking)?',
      'Is there a written agreement on what the IT provider is responsible for (for example backup, updates and monitoring)?',
      [ja, delvis, nei, vk], { visible_if: { in: [{ var: 'I3' }, ['ekstern', 'delt']] } }),
    single('I5', I, 'Finst det dokumentasjon av IT-oppsettet (brukarar, utstyr, nettverk og leverandørar)?',
      'Is the IT setup documented (users, devices, network and suppliers)?', [
        o('oppdatert', 'Ja, oppdatert det siste året', 'Yes, updated in the last year'),
        o('gammal', 'Ja, men gammal eller ufullstendig', 'Yes, but old or incomplete'),
        nei, vk,
      ]),
    single('I6', I, 'Kvar blir administratorpassord og andre tilgangar lagra?', 'Where are admin passwords and other credentials stored?', [
      o('vault', 'I ein passordhandterar eller eit dokumentasjonsverktøy med tilgangsstyring', 'In a password manager or documentation tool with access control'),
      o('dokument', 'I eit dokument, ein wiki eller eit rekneark', 'In a document, a wiki or a spreadsheet'),
      o('papir', 'På papir', 'On paper'),
      o('hovudet', 'Berre i hovudet til nokon', "Only in someone's head"),
      vk,
    ], help('Ikkje skriv sjølve passorda her.', "Don't write the passwords themselves here.")),
    single('I7', I, 'Kjem de inn i alle systema om den som har administratortilgangen blir sjuk eller sluttar?',
      'Can you get into all systems if the person with admin access falls ill or leaves?', [
        o('dokumentert', 'Ja, minst to har tilgang, og det er dokumentert', 'Yes, at least two people have access, and it is documented'),
        o('truleg', 'Truleg, men det er ikkje dokumentert', "Probably, but it isn't documented"),
        o('ein', 'Nei, berre éin person har tilgang', 'No, only one person has access'),
        vk,
      ]),

    section(single('I8', I, 'Kva brukar de til e-post og kontorprogram?', 'What do you use for email and office software?', [
      o('m365', 'Microsoft 365', 'Microsoft 365'),
      o('google', 'Google Workspace', 'Google Workspace'),
      o('web', 'E-post frå eit webhotell eller ein internettleverandør', 'Email from a web host or an internet provider'),
      o('anna', 'Anna eller blanda', 'Other or mixed'),
      vk,
    ]), 'Brukarkontoar og pålogging', 'User accounts and sign-in'),
    single('I9', I, 'Er tofaktorpålogging (MFA) slått på for alle brukarane i e-postsystemet?',
      'Is two-factor sign-in (MFA) turned on for all users in the email system?', [
        o('alle', 'Ja, for alle', 'Yes, for everyone'),
        o('fleste', 'For dei fleste', 'For most'),
        o('nokre', 'Berre for nokre', 'Only for some'),
        nei, vk,
      ]),
    single('I10', I, 'Blir MFA kravd med ein sentral regel, slik at ingen kan skru det av for seg sjølv?',
      "Is MFA enforced by a central policy, so users can't turn it off for themselves?", [
        o('ja', 'Ja (til dømes Conditional Access eller standard sikkerheitsinnstillingar)', 'Yes (for example Conditional Access or security defaults)'),
        o('nei', 'Nei, det er slått på per brukar', "No, it's turned on per user"),
        vk,
      ], { visible_if: { in: [{ var: 'I9' }, ['alle', 'fleste', 'nokre']] } }),
    single('I11', I, 'Har dei som administrerer systema eigne admin-kontoar som ikkje blir brukte til e-post og vanleg arbeid?',
      'Do the people who administer the systems have separate admin accounts that are not used for email and everyday work?',
      [ja, delvis, nei, vk]),
    single('I12', I, 'Kor mange har full administratortilgang til e-post- og skysystemet?',
      'How many people have full admin access to the email and cloud system?', [
        o('ein', '1', '1'), o('to', '2–4', '2–4'), o('fem', '5 eller fleire', '5 or more'), vk,
      ]),
    single('I13', I, 'Finst det kontoar som fleire loggar på med same brukarnamn og passord (til dømes ein felles resepsjonskonto eller ein felles PC-brukar)?',
      'Are there accounts that several people sign in to with the same username and password (for example a shared reception account or a shared computer user)?', [
        o('fleire', 'Ja, fleire', 'Yes, several'),
        o('nokre', 'Ja, ein eller to', 'Yes, one or two'),
        nei, vk,
      ]),
    single('I14', I, 'Kva skjer med kontoane når nokon sluttar?', 'What happens to the accounts when someone leaves?', [
      o('rutine', 'Dei blir stengde same dag etter ei fast rutine', 'They are closed the same day, following a set routine'),
      o('utan', 'Dei blir stengde, men utan fast rutine', 'They are closed, but without a set routine'),
      o('opne', 'Det hender at kontoar står opne lenge', 'Accounts sometimes stay open for a long time'),
      vk,
    ]),
    single('I15', I, 'Har vanlege brukarar administratorrettar på PC-en sin (kan installere kva som helst)?',
      'Do ordinary users have admin rights on their computers (can install anything)?', [
        o('fleste', 'Ja, dei fleste', 'Yes, most of them'),
        o('nokre', 'Nokre få', 'A few'),
        nei, vk,
      ]),
    single('I16', I, 'Er tilgangen til mapper og filer styrt etter kva kvar tilsett treng?',
      'Is access to folders and files based on what each employee needs?', [
        o('ja', 'Ja, med grupper eller roller', 'Yes, with groups or roles'),
        delvis,
        o('nei', 'Nei, alle har tilgang til alt', 'No, everyone has access to everything'),
        vk,
      ]),

    section(single('I17', I, 'Omtrent kor mange PC-ar og Mac-ar har bedrifta?', 'Roughly how many PCs and Macs does the company have?', [
      o('u5', 'Under 5', 'Fewer than 5'), o('5', '5–10', '5–10'), o('11', '11–20', '11–20'),
      o('21', '21–50', '21–50'), o('o50', 'Over 50', 'More than 50'),
    ]), 'PC-ar og mobilar', 'Computers and phones'),
    multi('I18', I, 'Kva operativsystem har PC-ane?', 'Which operating systems do the computers run?', [
      o('w11', 'Windows 11', 'Windows 11'),
      o('w10', 'Windows 10', 'Windows 10'),
      o('eldre', 'Eldre Windows-versjonar', 'Older Windows versions'),
      o('mac', 'macOS', 'macOS'),
      o('anna', 'Anna (til dømes Linux eller Chromebook)', 'Other (for example Linux or Chromebook)'),
      vk,
    ], {
      exclusive_options: ['vk'],
      texts: { help: w('Kryss av alt som passar. Windows 10 får ikkje lenger sikkerheitsoppdateringar utan ein betalt tilleggsavtale.',
        'Tick everything that applies. Windows 10 no longer gets security updates without a paid extended support agreement.') },
    }),
    single('I19', I, 'Blir PC-ane styrte sentralt (til dømes med Intune, eit RMM-verktøy eller eit domene)?',
      'Are the computers managed centrally (for example with Intune, an RMM tool or a domain)?', [
        o('alle', 'Ja, alle', 'Yes, all of them'),
        o('fleste', 'Dei fleste', 'Most of them'),
        o('nokre', 'Nokre få', 'A few'),
        nei, vk,
      ], help('Sentral styring betyr at nokon kan sjå status og rulle ut oppdateringar og innstillingar på alle maskinene frå éin stad.',
        'Central management means someone can see the status of every machine and roll out updates and settings from one place.')),
    single('I20', I, 'Korleis blir Windows og programma oppdaterte?', 'How are Windows and the programs kept up to date?', [
      o('overvaka', 'Automatisk, og nokon følgjer med på at det skjer', 'Automatically, and someone checks that it happens'),
      o('auto', 'Automatisk, men ingen sjekkar', 'Automatically, but nobody checks'),
      o('sjolv', 'Kvar brukar gjer det sjølv', 'Each user does it themselves'),
      vk,
    ]),
    single('I21', I, 'Kva vern har PC-ane mot skadevare?', 'What protection do the computers have against malware?', [
      o('edr', 'EDR som nokon overvakar (IT-leverandør eller SOC)', 'EDR that someone monitors (an IT provider or a SOC)'),
      o('av', 'Antivirus med sentral oversikt', 'Antivirus with central oversight'),
      o('defender', 'Berre innebygd Microsoft Defender utan sentral oversikt', 'Only built-in Microsoft Defender without central oversight'),
      o('ingen', 'Ikkje noko', 'None'),
      vk,
    ], { free_text: { texts: { text: w('Kva produkt? (valfritt)', 'Which product? (optional)') }, when: ['edr', 'av'] } }),
    single('I22', I, 'Er harddisken på berbare PC-ar kryptert (BitLocker eller FileVault)?',
      'Are laptop hard drives encrypted (BitLocker or FileVault)?', [
        o('alle', 'Ja, på alle', 'Yes, on all of them'),
        o('nokre', 'På nokre', 'On some'),
        nei, vk,
      ]),
    single('I23', I, 'Kan de låse eller slette ein jobbmobil eller PC frå sentralt hald om han blir borte?',
      'Can you lock or wipe a work phone or computer remotely if it gets lost?', [
        ja, o('nokre', 'Berre for nokre einingar', 'Only for some devices'), nei, vk,
      ]),
    single('I24', I, 'Kan tilsette nå jobb-e-post og filer frå private einingar?',
      'Can employees reach work email and files from their own devices?', [
        o('fritt', 'Ja, utan avgrensingar', 'Yes, without restrictions'),
        o('avgrensa', 'Ja, men med avgrensingar (til dømes appvern eller berre nettlesar)', 'Yes, but with restrictions (for example app protection or browser only)'),
        o('nei', 'Nei, berre frå utstyr bedrifta eig', 'No, only from company-owned devices'),
        vk,
      ]),

    section(single('I25', I, 'Har de lokale serverar?', 'Do you have on-premises servers?', [
      o('nei', 'Nei, alt ligg i skyen', 'No, everything is in the cloud'),
      o('ein', 'Ja, ein', 'Yes, one'),
      o('fleire', 'Ja, fleire', 'Yes, several'),
      vk,
    ]), 'Server, nettverk og internett', 'Servers, network and internet'),
    multi('I26', I, 'Kva blir serverane brukte til?', 'What are the servers used for?', [
      o('ad', 'Domenekontrollar (Active Directory)', 'Domain controller (Active Directory)'),
      o('fil', 'Filserver', 'File server'),
      o('fag', 'Fagsystem eller database', 'Business system or database'),
      o('print', 'Utskrift', 'Printing'),
      o('kamera', 'Kamera eller adgangskontroll', 'Cameras or access control'),
      o('anna', 'Anna', 'Other'),
    ], { visible_if: { in: [{ var: 'I25' }, ['ein', 'fleire']] } }),
    single('I27', I, 'Får serverane framleis sikkerheitsoppdateringar frå produsenten?', 'Do the servers still get security updates from the vendor?', [
      ja, o('nokre', 'Nokre er for gamle', 'Some are too old'), nei, vk,
    ], {
      visible_if: { in: [{ var: 'I25' }, ['ein', 'fleire']] },
      texts: { help: w('Windows Server 2012 R2 og eldre får ikkje lenger oppdateringar, og Windows Server 2016 mistar støtta i januar 2027.',
        'Windows Server 2012 R2 and older no longer get updates, and Windows Server 2016 loses support in January 2027.') },
    }),
    single('I28', I, 'Kven har ansvar for brannmuren eller ruteren mot internett?', 'Who is responsible for the firewall or router facing the internet?', [
      o('oss', 'Vi eller IT-leverandøren, og han blir halden oppdatert', 'We or our IT provider, and it is kept up to date'),
      o('isp', 'Internettleverandøren (ruteren følgde med abonnementet)', 'The internet provider (the router came with the subscription)'),
      o('ingen', 'Ingen har eigentleg ansvaret', 'Nobody is really responsible'),
      vk,
    ]),
    single('I29', I, 'Er det trådlause nettet for gjester skilt frå nettet der jobbutstyret er?',
      'Is the guest wireless network separated from the network your work equipment is on?', [
        ja,
        o('ikkje', 'Vi har ikkje gjestenett', "We don't have a guest network"),
        o('nei', 'Nei, gjester brukar same nett', 'No, guests use the same network'),
        vk,
      ]),
    single('I30', I, 'Er skrivarar, kamera, kassasystem, betalingsterminalar eller produksjonsutstyr på eit eige nett?',
      'Are printers, cameras, point-of-sale systems, payment terminals or production equipment on a separate network?', [
        o('ja', 'Ja, på eigne nett (til dømes VLAN)', 'Yes, on separate networks (for example VLANs)'),
        delvis,
        o('nei', 'Nei, alt er på same nett', 'No, everything is on the same network'),
        o('ikkje', 'Vi har ikkje slikt utstyr', "We don't have such equipment"),
        vk,
      ]),
    single('I31', I, 'Er standardpassorda bytte på skrivarar, ruterar, kamera og anna nettverksutstyr?',
      'Have the default passwords been changed on printers, routers, cameras and other network equipment?', [
        o('alt', 'Ja, på alt', 'Yes, on everything'),
        o('noko', 'På noko', 'On some of it'),
        nei, vk,
      ]),
    multi('I32', I, 'Korleis kjem tilsette og leverandørar inn i systema utanfrå?', 'How do employees and suppliers reach the systems from outside?', [
      o('vpn', 'VPN', 'VPN'),
      o('rdpgw', 'Fjernskrivebord (RDP) via VPN eller gateway', 'Remote desktop (RDP) through a VPN or gateway'),
      o('rdpope', 'Fjernskrivebord (RDP) ope mot internett', 'Remote desktop (RDP) open to the internet'),
      o('fjernhjelp', 'Fjernhjelpverktøy (TeamViewer, AnyDesk, ScreenConnect eller liknande)', 'Remote support tools (TeamViewer, AnyDesk, ScreenConnect or similar)'),
      o('sky', 'Alt ligg i skyen, så det trengst ikkje', "Everything is in the cloud, so it isn't needed"),
      vk,
    ], { exclusive_options: ['vk'] }),
    single('I33', I, 'Har leverandørar (fagsystem, kasse, IT) fast fjerntilgang til maskinene eller nettverket dykkar?',
      'Do suppliers (business systems, point of sale, IT) have standing remote access to your machines or network?', [
        o('alltid', 'Ja, tilgangen står alltid open', 'Yes, access is always open'),
        o('ved', 'Ja, men berre når vi opnar for det', 'Yes, but only when we open it'),
        nei, vk,
      ]),
    single('I34', I, 'Har de reservesamband om internett fell ut (til dømes ein 4G- eller 5G-ruter)?',
      'Do you have a backup connection if the internet goes down (for example a 4G or 5G router)?', [ja, nei, vk]),

    section(single('I35', I, 'Kven administrerer domenet og DNS-oppsettet (til dømes firma.no)?', 'Who manages the domain and DNS (for example company.no)?', [
      o('oss', 'Vi sjølve', 'We do'),
      o('it', 'IT-leverandøren vår', 'Our IT provider'),
      o('web', 'Eit webbyrå eller ein domeneleverandør', 'A web agency or a domain provider'),
      vk,
    ]), 'E-post og domene', 'Email and domain'),
    single('I36', I, 'Er SPF, DKIM og DMARC sett opp for e-postdomenet?', 'Are SPF, DKIM and DMARC set up for the email domain?', [
      o('full', 'Ja, alle tre, og DMARC står på quarantine eller reject', 'Yes, all three, and DMARC is set to quarantine or reject'),
      o('none', 'Ja, men DMARC står på none', 'Yes, but DMARC is set to none'),
      o('delvis', 'Berre nokre av dei', 'Only some of them'),
      nei, vk,
    ]),
    multi('I37', I, 'Kva vern mot phishing og skadeleg e-post har de i tillegg til standardfilteret?',
      'What protection against phishing and malicious email do you have beyond the standard filter?', [
        o('mdo', 'Microsoft Defender for Office 365 eller tilsvarande', 'Microsoft Defender for Office 365 or similar'),
        o('vedlegg', 'Reglar som stoppar farlege vedlegg', 'Rules that stop dangerous attachments'),
        o('ekstern', 'Åtvaring på e-post frå eksterne avsendarar', 'A warning on email from external senders'),
        o('vidaresending', 'Blokkering av automatisk vidaresending til eksterne adresser', 'Blocking automatic forwarding to external addresses'),
        o('ingen', 'Ikkje noko ekstra vern', 'No extra protection'),
        vk,
      ], { exclusive_options: ['ingen', 'vk'] }),

    section(multi('I38', I, 'Kvar ligg dei viktigaste filene dykkar?', 'Where are your most important files kept?', [
      o('sharepoint', 'SharePoint eller Teams', 'SharePoint or Teams'),
      o('onedrive', 'OneDrive', 'OneDrive'),
      o('filserver', 'Lokal filserver', 'Local file server'),
      o('annasky', 'Dropbox, Google Drive eller liknande', 'Dropbox, Google Drive or similar'),
      o('lokalt', 'Lokalt på PC-ane', 'Locally on the computers'),
      o('fag', 'I fagsystemet', 'In the business system'),
      vk,
    ], { exclusive_options: ['vk'] }), 'Data og backup', 'Data and backup'),
    single('I39', I, 'Kan tilsette dele filer med «alle som har lenka», utan pålogging?',
      'Can employees share files with “anyone with the link”, without sign-in?', [
        o('av', 'Nei, det er slått av', "No, it's turned off"),
        o('utlop', 'Ja, men lenkene går ut etter ei tid', 'Yes, but the links expire after a while'),
        o('fritt', 'Ja, utan avgrensingar', 'Yes, without restrictions'),
        vk,
      ]),
    text('I40', I, 'Kva fagsystem og skytenester er viktigast for drifta? Skriv gjerne kven som er leverandør.',
      'Which business systems and cloud services matter most for operations? Feel free to name the supplier.', {
        texts: { placeholder: w('Til dømes økonomisystem, booking, kasse og lønn', 'For example accounting, booking, point of sale and payroll') },
      }),
    multi('I41', I, 'Kva blir det teke backup av?', 'What is backed up?', [
      o('server', 'Serverar', 'Servers'),
      o('m365', 'E-post og filer i Microsoft 365 eller Google', 'Email and files in Microsoft 365 or Google'),
      o('pc', 'PC-ar', 'Computers'),
      o('fag', 'Fagsystem i skyen (eksport eller avtale med leverandøren)', 'Cloud business systems (export or agreement with the supplier)'),
      o('ingen', 'Ingenting fast', 'Nothing on a regular basis'),
      vk,
    ], {
      exclusive_options: ['ingen', 'vk'],
      texts: { help: w('Kryss av alt som passar. Microsoft og Google tek ikkje vare på dataa dykkar på same måte som ein eigen backup gjer.',
        "Tick everything that applies. Microsoft and Google don't protect your data the way a backup of your own does.") },
    }),
    single('I42', I, 'Finst det ein kopi av backupen som ikkje kan slettast eller krypterast frå nettverket dykkar (til dømes offline eller med slettevern)?',
      "Is there a copy of the backup that can't be deleted or encrypted from your network (for example offline or with deletion protection)?",
      [ja, nei, vk], help('Løysepengevirus prøver ofte å slette backupen først.', 'Ransomware often tries to delete the backup first.')),
    single('I43', I, 'Når vart backupen sist testa ved at de henta tilbake data?', 'When was the backup last tested by restoring data?', [
      o('mnd', 'Den siste månaden', 'In the last month'),
      o('ar', 'Det siste året', 'In the last year'),
      o('eldre', 'Meir enn eitt år sidan', 'More than a year ago'),
      o('aldri', 'Aldri', 'Never'),
      vk,
    ]),
    single('I44', I, 'Kva skjer om ein backup feilar?', 'What happens if a backup fails?', [
      o('oppfolg', 'Nokon får varsel og følgjer det opp', 'Someone gets an alert and follows it up'),
      o('varsel', 'Det kjem varsel, men ingen følgjer fast med', 'An alert is sent, but nobody checks regularly'),
      o('ingen', 'Ingen får beskjed', 'Nobody is told'),
      vk,
    ]),
    single('I45', I, 'Om serveren eller hovudsystemet blir utilgjengeleg, kor lang tid trur du det tek å få drifta i gang att?',
      'If the server or main system becomes unavailable, how long do you think it takes to get operations running again?', [
        o('timar', 'Nokre timar', 'A few hours'),
        o('dag', 'Ein arbeidsdag', 'One working day'),
        o('dagar', 'Fleire dagar', 'Several days'),
        o('veke', 'Over ei veke', 'More than a week'),
        vk,
      ]),

    section(single('I46', I, 'Får nokon varsel om mistenkeleg aktivitet, til dømes innlogging frå utlandet eller mange feil passord på rad?',
      'Does anyone get alerts about suspicious activity, for example sign-ins from abroad or many wrong passwords in a row?', [
        o('dogn', 'Ja, og nokon følgjer opp døgnet rundt', 'Yes, and someone responds around the clock'),
        o('arbeidstid', 'Ja, i arbeidstida', 'Yes, during working hours'),
        nei, vk,
      ]), 'Overvaking og beredskap', 'Monitoring and preparedness'),
    single('I47', I, 'Finst det ein skriven plan for korleis IT-en skal setjast i drift att etter eit dataangrep (kven gjer kva, og i kva rekkjefølgje)?',
      'Is there a written plan for getting IT running again after a cyberattack (who does what, and in what order)?', [
        o('testa', 'Ja, og han er testa', 'Yes, and it has been tested'),
        o('utesta', 'Ja, men han er ikkje testa', "Yes, but it hasn't been tested"),
        nei, vk,
      ]),

    section(text('I48', I, 'Kva er dei tre største IT-svakheitene hos dykk, slik du ser det?',
      'What are the three biggest IT weaknesses in your company, as you see it?'), 'Til slutt', 'Finally'),
    text('I49', I, 'Er det noko anna vi bør vite før vi går gjennom kartlegginga?', 'Is there anything else we should know before we go through the assessment?', { texts: { help: optional } }),
  ],
};
// drop the undefined keys left by the copied initials question
it.questions = it.questions.map((q) => JSON.parse(JSON.stringify(q)));

// ---------- 3. nokkelpersonar-intervju ----------
// Free-text interview for a key person (owner/manager), from the old «Kartlegging nøkkelpersoner»
// interview sheet (16.02.2025). Every content question is open text — the only choice question is
// N1, the role question every Varde survey needs (decision 5, 17.10); its text and options are the
// system's standard ones (packages/schema/src/template/structure.ts).
const N = 'common';
const noklepersonar = {
  key: 'nokkelpersonar-intervju',
  audience: 'client_survey',
  identification: 'none',
  required_languages: ['nn', 'en'],
  leader_roles: [],
  intro: {
    title: w('Samtale med nøkkelpersonar', 'Conversation with key people'),
    short: w('Nøkkelpersonar', 'Key people'),
    minutes: 20,
    letter: [
      w('Vardahei IT kartlegg IT-tryggleik og beredskap i bedrifta. Denne samtalen er for deg som kjenner drifta og rutinane best — gjerne dagleg leiar eller ein annan nøkkelperson.',
        "Vardahei IT is assessing IT security and preparedness in the company. This conversation is for whoever knows the business and its routines best — typically the managing director or another key person."),
      w('Spørsmåla handlar om ansvar, rutinar, tilgangar og beredskap. Skriv svara med eigne ord; det finst ikkje fasitsvar, og «veit ikkje» er eit heilt greitt svar.',
        'The questions cover responsibility, routines, access and preparedness. Write your answers in your own words; there are no model answers, and "not sure" is a perfectly fine answer.'),
    ],
    sender: clone(seed.intro.sender),
    facts: [
      w('Svara ser berre Vardahei IT. Vi går gjennom dei saman med bedrifta.',
        'Only Vardahei IT sees the answers. We go through them with the company.'),
      w('Ikkje skriv passord, nøklar eller andre hemmelege opplysningar i svara.',
        "Don't write passwords, keys or other secrets in your answers."),
      w('«Veit ikkje» er eit nyttig svar. Det fortel oss kva vi bør sjå nærare på saman.',
        '“Not sure” is a useful answer. It tells us what we should look at together.'),
    ],
    contact: clone(seed.intro.contact),
  },
  leader_intro: {
    title: w('Nokre spørsmål til deg som leiar', 'A few questions for you as a manager'),
    text: w('Sidan du har ansvar i bedrifta, har vi nokre spørsmål til.', 'Since you have responsibility in the company, we have a few more questions.'),
  },
  tips: [],
  max_tips: 0,
  invitation: {
    letter: w(
      'Hei!\n\nVi kartlegg IT-tryggleiken vår saman med Vardahei IT. Som ein del av kartlegginga vil Vardahei IT gjerne høyre korleis du som kjenner drifta og rutinane best, vil skildre ansvar, rutinar, tilgangar og beredskap i bedrifta.\n\nDet er ingen fasitsvar, og «veit ikkje» er eit heilt greitt svar. Det tek om lag {minutt} minutt. Ikkje skriv passord eller andre hemmelege opplysningar i svara.\n\n{lenkje}\n\nLenkja går til {host}, så du kan trygt opne ho.{frist}\n\nTakk!',
      "Hi,\n\nWe're assessing our IT security together with Vardahei IT. As part of the assessment, Vardahei IT would like to hear, in your own words as the person who knows the business and its routines best, how you'd describe responsibility, routines, access and preparedness in the company.\n\nThere are no model answers, and \"not sure\" is a perfectly fine answer. It takes about {minutt} minutes. Please don't write passwords or other secrets in your answers.\n\n{lenkje}\n\nThe link goes to {host}, so it's safe to open.{frist}\n\nThanks!"),
    poster: {
      title: w('Samtale med nøkkelpersonar', 'Conversation with key people'),
      text: w('For deg som kjenner drifta og rutinane best. Det tek om lag {minutt} minutt.', 'For whoever knows the business and its routines best. It takes about {minutt} minutes.'),
      footer: w('Ikkje skriv passord eller andre hemmelege opplysningar i svara. Svara ser berre Vardahei IT.',
        "Don't write passwords or other secrets in your answers. Only Vardahei IT sees the answers."),
    },
  },
  questions: [
    // The standard role question (structure.ts, decision 5, 17.10) — the one choice question every
    // Varde survey needs. leader_roles is empty: this survey has no leader-only part.
    section(single('N1', N, 'Kva rolle har du i bedrifta?', 'What is your role at work?', [
      o('leiar', 'Leiar', 'Manager'),
      o('kontor', 'Administrasjon/kontor', 'Administration/office'),
      o('prod', 'Produksjon/drift', 'Production/operations'),
      o('sal', 'Sal / Kundeservice', 'Sales / customer service'),
      o('it', 'IT / superbrukar', 'IT / super user'),
      o('anna', 'Anna', 'Other'),
    ], { role: true, required: true }), 'Om deg', 'About you'),

    section(text('N2', N, 'Er det definert kven som har ansvaret for IT hos dykk, eller «flyt» det litt rundt? Veit til dømes ein tilsett kven han skal gå til om han oppdagar eit IT-tryggleiksproblem?',
      'Is it clearly defined who is responsible for IT in your company, or does it "float" around a bit? For example, does an employee know who to go to if they discover an IT security problem?'),
      'Ansvar og rolle', 'Responsibility and role'),
    text('N3', N, 'Dersom de gjer endringar som gjeld tryggleik, blir dei tilsette informerte om dette? Korleis?',
      'If you make changes related to security, are employees informed about this? How?'),

    section(text('N4', N, 'Brukar tilsette privat e-post saman med jobb-e-post?',
      'Do employees use private email alongside work email?'),
      'E-post, deling og tilgangar', 'Email, sharing and access'),
    text('N5', N, 'Korleis blir filer delte internt og eksternt? (Eigne område for deling, passord, utløpsdato og liknande.)',
      'How are files shared internally and externally? (Dedicated sharing areas, passwords, expiry dates and so on.)'),
    text('N6', N, 'Korleis blir tilgangar handterte for ferievikarar, sesongarbeidarar og liknande? Får dei eigne profilar?',
      'How is access handled for holiday temps, seasonal workers and similar? Do they get their own profiles?'),

    section(text('N7', N, 'Har de rutinar for jamleg oppdatering av PC-ar, telefonar og programvare?',
      'Do you have routines for regularly updating computers, phones and software?'),
      'Utstyr og programvare', 'Devices and software'),

    section(text('N8', N, 'Er de kjende med kva opplysningar de har lov til å lagre om forretningsforbindelsane dykkar?',
      'Are you aware of what information you are allowed to store about your business contacts?'),
      'Personvern og informasjon', 'Privacy and information'),
    text('N9', N, 'Har de kontroll på kva system bedriftsinformasjon eller personopplysningar blir lagra i?',
      'Do you have control over which systems company information or personal data is stored in?'),
    text('N10', N, 'Har tilsette lov til å installere jobbsystem eller e-post på private einingar? Og har tilsette lov til å installere private program på jobb-PC-en?',
      'Are employees allowed to install work systems or email on private devices? And are employees allowed to install private programs on their work computer?'),
    text('N11', N, 'Har de oversikt over kvar alle interne personopplysningar ligg, slik at de veit at eit datainnbrot kan meldast til Datatilsynet?',
      'Do you have an overview of where all internal personal data is kept, so you know a data breach can be reported to the Norwegian Data Protection Authority?'),
    text('N12', N, 'I system med bedriftsinformasjon eller personopplysningar: er det etablert 2-faktorpålogging?',
      'In systems with company information or personal data: is two-factor sign-in in place?'),

    section(text('N13', N, 'Brukar de delte passord for pålogging til ulike tenester?',
      'Do you use shared passwords for signing in to different services?'),
      'Passord og pålogging', 'Passwords and sign-in'),
    text('N14', N, 'Brukar de gode/sterke passord, utan gjenbruk av passord?',
      'Do you use good, strong passwords, without reusing passwords?'),
    text('N15', N, 'Har de reglar for bruk av PC på reise (til dømes Wi-Fi)?',
      'Do you have rules for using your computer when travelling (for example Wi-Fi)?'),

    section(text('N16', N, 'Har de differensiert tilgang til filer og mapper?',
      'Do you have differentiated access to files and folders?'),
      'Tilgangsstyring og rutinar', 'Access control and routines'),
    text('N17', N, 'Har de rutinar for onboarding og offboarding av tilsette? (Gjeld både system og rutinar.)',
      'Do you have routines for onboarding and offboarding employees? (Covers both systems and procedures.)'),

    section(text('N18', N, 'Er IT-tryggleik ein del av det leiinga fokuserer på, til dømes på styremøte og i den daglege oppfølginga av tilsette?',
      "Is IT security part of what management focuses on, for example at board meetings and in day-to-day follow-up of employees?"),
      'Leiing, øving og beredskap', 'Management, practice and preparedness'),
    text('N19', N, 'Har de testa ei større tilbakeføring av data (eit simulert dataangrep)? Viss ikkje: trur de det hadde vore nyttig?',
      'Have you tested a major data restore (a simulated cyberattack)? If not, do you think it would be useful?'),
    text('N20', N, 'Har de backup på fleire lokasjonar?',
      'Do you have backups in several locations?'),
    text('N21', N, 'Har de sett opp reglar i M365 for å førebyggje phishing?',
      'Have you set up rules in M365 to prevent phishing?'),
    text('N22', N, 'Trener de på å avsløre phishing?',
      'Do you practise spotting phishing?'),
    text('N23', N, 'Har de passordverktøy (ein passordhandterar)?',
      'Do you have a password tool (a password manager)?'),
    text('N24', N, 'Gjennomfører de ein årleg tryggleikssjekk?',
      'Do you carry out an annual security check?'),

    section(text('N25', N, 'Korleis handterer de bruk av og tilgang til mobilar i forhold til bedriftsdata?',
      'How do you handle the use of, and access to, mobile phones in relation to company data?'),
      'Mobil og opplæring', 'Mobile and training'),
    text('N26', N, 'Får tilsette opplæring i tryggleik? (Til dømes testing av e-postar, rutinar og liknande.)',
      'Do employees get security training? (For example email testing, routines and similar.)'),

    section(text('N27', N, 'Har de ein beredskapsplan ved IT-tryggleikshendingar?',
      'Do you have a contingency plan for IT security incidents?'),
      'Beredskap ved hending', 'Incident preparedness'),
    text('N28', N, 'Veit tilsette kven dei skal kontakte ved mistenkjeleg aktivitet?',
      'Do employees know who to contact in case of suspicious activity?'),
  ],
};

// ---------- review metadata ----------
// 04.11: plans changed — the R1–R23 leader block is dropped; tryggleik's leader part is the seed's,
// unchanged. The old interview's 27 questions now live as free text in nokkelpersonar-intervju.
const mal = [
  ['Roller for IT-ansvar; veit tilsette kven dei går til', 'N2'],
  ['Blir tilsette informerte om endringar i tryggleik', 'N3'],
  ['Privat e-post saman med jobb-e-post', 'N4'],
  ['Deling av filer internt og eksternt (område, passord, utløp)', 'N5'],
  ['Tilgangar for ferievikarar og sesongarbeidarar', 'N6'],
  ['Jamleg oppdatering av PC, telefon og programvare', 'N7'],
  ['Kva opplysningar de har lov å lagre om forretningsforbindelsar', 'N8'],
  ['Kva system bedrifts- og personopplysningar ligg i', 'N9'],
  ['Jobbsystem og e-post på private einingar; private program på jobb-PC', 'N10'],
  ['Oversikt over personopplysningar for melding til Datatilsynet', 'N11'],
  ['2-faktor i system med bedrifts- og personopplysningar', 'N12'],
  ['Delte passord til tenester', 'N13'],
  ['Sterke passord, ikkje gjenbruk', 'N14'],
  ['Reglar for PC på reise (wifi)', 'N15'],
  ['Differensiert tilgang til filer og mapper', 'N16'],
  ['Onboarding og offboarding (system og rutinar)', 'N17'],
  ['IT-tryggleik i leiinga og på styremøte', 'N18'],
  ['Testa tilbakelegging av data / simulert angrep', 'N19'],
  ['Backup på fleire lokasjonar', 'N20'],
  ['Reglar i M365 mot phishing', 'N21'],
  ['Trening i å avsløre phishing', 'N22'],
  ['Passordverktøy', 'N23'],
  ['Årleg tryggleikssjekk', 'N24'],
  ['Mobil og tilgang til bedriftsdata', 'N25'],
  ['Trening i tryggleik (testar av e-post, rutinar)', 'N26'],
  ['Beredskapsplan ved IT-hendingar', 'N27'],
  ['Veit tilsette kven dei kontaktar ved mistenkeleg aktivitet', 'N28'],
];

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'tryggleik-haust-2026.json'), JSON.stringify(tryggleik, null, 2) + '\n');
writeFileSync(join(outDir, 'it-kartlegging.json'), JSON.stringify(it, null, 2) + '\n');
writeFileSync(join(outDir, 'nokkelpersonar-intervju.json'), JSON.stringify(noklepersonar, null, 2) + '\n');
writeFileSync(join(outDir, 'review-meta.json'), JSON.stringify({ mal }, null, 2) + '\n');
console.log(`tryggleik: ${tryggleik.questions.length} questions (${tryggleik.questions.filter((q) => q.part === 'leader').length} leader, seed unchanged); it: ${it.questions.length}; nokkelpersonar-intervju: ${noklepersonar.questions.length} (1 role + ${noklepersonar.questions.length - 1} text)`);
