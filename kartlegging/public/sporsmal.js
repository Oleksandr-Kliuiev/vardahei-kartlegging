/* Spørsmålsbank for kartlegginga. Både skjemaet og dashbordet les denne fila.
   Endrar du ein svar-id, blir gamle svar på det spørsmålet borte frå dashbordet.
   Tekstar: nn = nynorsk, en = engelsk. */
(function () {
  "use strict";

  var KONTAKT = {
    namn: "Vardahei IT",
    telefon: "+47 930 94 567",
    epost: "post@vardahei.no",
    tider: { nn: "Måndag til fredag 08–16", en: "Monday to Friday 08–16" }
  };

  // Kven som skriv helsinga i starten av skjemaet.
  var AVSENDAR = { nn: "Asbjørn og resten av gjengen i Vardahei IT", en: "Asbjørn and the rest of the team at Vardahei IT" };

  // Kundar: slug i lenkja -> namn som blir vist. Lenkje til kunden: https://<domene>/?k=maskinsenteret
  var KUNDAR = {
    daco: "Daco",
    gasta: "Gasta",
    kviknes: "Kviknes",
    maskinsenteret: "Maskinsenteret",
    sfhs: "SFHS",
    tharaso: "Tharaso"
  };

  function o(id, nn, en, ekstra) {
    var v = { id: id, nn: nn, en: en };
    if (ekstra) for (var k in ekstra) v[k] = ekstra[k];
    return v;
  }

  // Rollene er felles for begge skjema. Dei to første får leiardelen (sjå leiarRoller nedst).
  var ROLLER = [
    o("leiar", "Leiar", "Manager"),
    o("kontor", "Administrasjon/kontor", "Administration/office"),
    o("prod", "Produksjon/drift", "Production/operations"),
    o("sal", "Sal / Kundeservice", "Sales / customer service"),
    o("it", "IT / superbrukar", "IT / super user"),
    o("anna", "Anna", "Other")
  ];

  // Faste svarsett frå Forms-runden
  var JDNU = [o("ja", "Ja", "Yes"), o("delvis", "Delvis", "Partly"), o("nei", "Nei", "No"), o("usikker", "Usikker", "Not sure")];
  var JNU = [o("ja", "Ja", "Yes"), o("nei", "Nei", "No"), o("usikker", "Usikker", "Not sure")];

  /* Skjema 1: IT-tryggleik. Spørsmåla er dei same som i Forms-runden (januar 2026), i same rekkjefølgje
     og med same svarval, slik at runde 1 og runde 2 kan samanliknast direkte.
     farge: kva sone kvart svar gir, same som i Master_Analyse.xlsx: 0 = grøn, 1 = gul, 2 = oransje, 3 = raud.
     Spørsmål utan farge er berre informasjon. Sonegrensene ligg i SONER nedst. */
  var TRYGG_SP = [
    /* ---------- Del A: alle ---------- */
    {
      id: "F1", del: "A", type: "text", einlinje: true, stor: true, paakravd: true, maksLengd: 8,
      ingress: { nn: "Identifikasjon", en: "Identification" },
      tekst: { nn: "Skriv inn initialane dine: 2 første og 3 siste. Eksempel: Ola Nordman = OLNOR", en: "Enter your initials: first 2 and last 3 letters. Example: Ola Nordman = OLNOR" },
      hjelp: { nn: "Initialane gjer at vi kan sjå svar og score per rolle og per tilsett, og samanlikne med førre runde.", en: "Your initials let us see answers and scores per role and per employee, and compare with the previous round." },
      plasshaldar: { nn: "OLNOR", en: "OLNOR" }
    },
    {
      id: "F2", del: "A", type: "single", rolle: true, anker: true, paakravd: true,
      tekst: { nn: "Kva rolle beskriv deg best?", en: "Which role describes you best?" },
      val: ROLLER
    },
    {
      id: "F3", kort: "Fokus på sikkerheit", del: "A", type: "single", anker: true,
      tekst: { nn: "Opplever du at verksemda har eit tydeleg fokus på IT-sikkerheit i det daglege arbeidet?", en: "Do you feel the company has a clear focus on IT security in everyday work?" },
      val: JDNU,
      farge: { ja: 0, delvis: 1, nei: 2, usikker: 1 }
    },

    {
      id: "F4", kort: "Opplevd svindelforsøk", del: "A", type: "single", anker: true,
      ingress: { nn: "IT-sikkerheitskultur og erfaring", en: "IT security culture and experience" },
      tekst: { nn: "Har du via e-post, telefon (t.d. svindelanrop) eller SMS opplevd forsøk på svindel eller hacking?", en: "Have you experienced attempts at fraud or hacking by email, phone (e.g. scam calls) or SMS?" },
      val: JNU,
      farge: { ja: 3, nei: 0, usikker: 1 }
    },
    {
      id: "F5", kort: "Rutine: stoppe hending", del: "A", type: "single", anker: true,
      tekst: { nn: "Finst det etablerte rutinar for kva du skal gjere for å hindre at ei IT-hending spreier seg vidare (t.d. kople frå nett, varsle rett person)?", en: "Are there established routines for what to do to stop an IT incident from spreading (e.g. disconnect from the network, alert the right person)?" },
      val: JDNU,
      farge: { ja: 0, delvis: 1, nei: 2, usikker: 1 }
    },
    {
      id: "F6", kort: "Rutine: starte opp att", del: "A", type: "single", anker: true,
      tekst: { nn: "Finst det rutinar for korleis verksemda skal starte opp att etter ei alvorleg IT-hending (kven gjer kva, rekkjefølgje, kommunikasjon)?", en: "Are there routines for how the company gets going again after a serious IT incident (who does what, in which order, communication)?" },
      val: JDNU,
      farge: { ja: 0, delvis: 1, nei: 2, usikker: 1 }
    },
    {
      id: "F7", kort: "Passordvanar", del: "A", type: "single", anker: true,
      tekst: { nn: "Opplever du at du har gode rutinar for passord (ikkje dele, sterke passord, ikkje skrive dei ned synleg)?", en: "Do you feel you have good password habits (not sharing, strong passwords, not writing them down where they can be seen)?" },
      val: JDNU,
      farge: { ja: 0, delvis: 1, nei: 2, usikker: 1 }
    },

    {
      id: "F8", kort: "Same passord", del: "A", type: "single", anker: true,
      ingress: { nn: "Passord og tilgang", en: "Passwords and access" },
      tekst: { nn: "Brukar du same passord på fleire tenester (jobb og/eller privat)?", en: "Do you use the same password for several services (work and/or private)?" },
      val: JDNU,
      farge: { ja: 3, delvis: 2, nei: 0, usikker: 1 }
    },
    {
      id: "F9", kort: "Passordhandterar", del: "A", type: "single", anker: true,
      tekst: { nn: "Brukar du ein passordhandterar (t.d. Bitwarden, 1Password eller liknande)?", en: "Do you use a password manager (e.g. Bitwarden, 1Password or similar)?" },
      val: JNU,
      farge: { ja: 0, nei: 2, usikker: 1 }
    },
    {
      id: "F10", kort: "Låser PC-en", del: "A", type: "single", anker: true,
      tekst: { nn: "Låser du PC-en (Win + L) når du går frå arbeidsplassen din?", en: "Do you lock your computer (Win + L) when you leave your desk?" },
      val: [o("ja", "Ja", "Yes"), o("oftast", "Oftast", "Usually"), o("sjeldan", "Sjeldan", "Rarely"), o("nei", "Nei", "No")],
      farge: { ja: 0, oftast: 1, sjeldan: 2, nei: 2 }
    },

    {
      id: "F11", kort: "Phishing-opplæring", del: "A", type: "single", anker: true,
      ingress: { nn: "Phishing og opplæring", en: "Phishing and training" },
      tekst: { nn: "Har du fått opplæring i korleis du kan avsløre phishing eller svindelforsøk?", en: "Have you had training in how to spot phishing or fraud attempts?" },
      val: JNU,
      farge: { ja: 0, nei: 2, usikker: 1 }
    },
    {
      id: "F12", kort: "Veit kor dei skal melde frå", del: "A", type: "single", anker: true,
      tekst: { nn: "Veit du korleis og til kven du skal rapportere mistenkelege e-postar eller meldingar?", en: "Do you know how, and to whom, to report suspicious emails or messages?" },
      val: JDNU,
      farge: { ja: 0, delvis: 1, nei: 2, usikker: 1 }
    },
    {
      id: "F13", kort: "Mistenkt klikk", del: "A", type: "single", anker: true,
      tekst: { nn: "Har du nokon gong i ettertid mistenkt at du kan ha klikka på ei lenke eller vedlegg som var svindel?", en: "Have you ever suspected afterwards that you may have clicked a link or attachment that was a scam?" },
      val: JNU,
      farge: { ja: 3, nei: 0, usikker: 1 }
    },

    {
      id: "F14", kort: "Brukar MFA", del: "A", type: "single", anker: true,
      ingress: { nn: "Tofaktorautentisering (MFA)", en: "Two-factor authentication (MFA)" },
      tekst: { nn: "Brukar du tofaktorautentisering (MFA) når du loggar på jobb-system?", en: "Do you use two-factor authentication (MFA) when logging in to work systems?" },
      val: JNU,
      farge: { ja: 0, nei: 2, usikker: 1 }
    },
    {
      id: "F15", kort: "MFA kvar", del: "A", type: "multi", anker: true,
      tekst: { nn: "Kvar av desse brukar du MFA i?", en: "Which of these do you use MFA in?" },
      hjelp: { nn: "Kryss av alt som passar.", en: "Tick everything that applies." },
      val: [
        o("m365", "Microsoft 365/e-post", "Microsoft 365/email"),
        o("vpn", "VPN", "VPN"),
        o("erp", "Økonomi/ERP", "Finance/ERP"),
        o("crm", "CRM", "CRM"),
        o("andre", "Andre system", "Other systems"),
        o("usikker", "Usikker", "Not sure", { aleine: true })
      ]
    },

    {
      id: "F16", kort: "Veit kvar filer skal lagrast", del: "A", type: "single", anker: true,
      ingress: { nn: "Data og backup", en: "Data and backup" },
      tekst: { nn: "Veit du kor arbeidsdata skal lagrast for å vere sikker på at dei blir tekne backup av?", en: "Do you know where work data should be saved to be sure it is backed up?" },
      val: JDNU,
      farge: { ja: 0, delvis: 1, nei: 2, usikker: 1 }
    },
    {
      id: "F17", kort: "Lagrar lokalt", del: "A", type: "single", anker: true,
      tekst: { nn: "Lagrar du ofte viktige arbeidsfiler lokalt på PC (Skrivebord/Dokument) i staden for OneDrive/SharePoint?", en: "Do you often save important work files locally on the PC (Desktop/Documents) instead of OneDrive/SharePoint?" },
      val: [o("ja", "Ja", "Yes"), o("avogtil", "Av og til", "Sometimes"), o("sjeldan", "Sjeldan", "Rarely"), o("nei", "Nei", "No"), o("usikker", "Usikker", "Not sure")],
      farge: { ja: 3, avogtil: 2, sjeldan: 1, nei: 0, usikker: 1 }
    },

    {
      id: "F18", kort: "PC oppdatert", del: "A", type: "single", anker: true,
      ingress: { nn: "Oppdateringar og tryggleik", en: "Updates and security" },
      tekst: { nn: "Opplever du at PC-en din jamleg blir oppdatert med siste sikkerheits- og programvareoppdateringar?", en: "Do you feel your PC is regularly updated with the latest security and software updates?" },
      val: JDNU,
      farge: { ja: 0, delvis: 1, nei: 2, usikker: 1 }
    },
    {
      id: "F19", kort: "Antivirus/EDR aktiv", del: "A", type: "single", anker: true,
      tekst: { nn: "Veit du om PC-en din har antivirus/EDR eller annan sikkerheitsprogramvare installert og aktiv?", en: "Do you know whether your PC has antivirus/EDR or other security software installed and active?" },
      val: JDNU,
      farge: { ja: 0, delvis: 1, nei: 2, usikker: 1 }
    },

    {
      id: "F20", del: "A", type: "text",
      ingress: { nn: "Vurdering og forbetring", en: "Assessment and improvement" },
      tekst: { nn: "Ei verksemd med 10–30 tilsette kan tape 100 000–200 000 kr per dag ved eit alvorleg IT-angrep. Trur du dette er realistisk for dykk? Eventuelt kva meiner du er ein realistisk kostnad?", en: "A business with 10–30 employees can lose NOK 100,000–200,000 per day in a serious IT attack. Do you think this is realistic for you? If not, what do you think a realistic cost would be?" }
    },
    {
      id: "F21", del: "A", type: "text",
      tekst: { nn: "Kva meiner du er det viktigaste tiltaket for å betre IT-sikkerheita i verksemda?", en: "What do you think is the most important measure to improve IT security in the company?" }
    },
    {
      id: "F22", del: "A", type: "text", valfri: true,
      tekst: { nn: "Andre kommentarar eller innspel knytt til IT-sikkerheit?", en: "Any other comments or input on IT security?" },
      hjelp: { nn: "Valfritt.", en: "Optional." }
    },

    /* ---------- Del B: leiar eller IT-ansvarleg ---------- */
    {
      id: "B1", del: "B", type: "text",
      tekst: { nn: "Kva er dei tre systema eller verktøya de ikkje klarar dykk utan?", en: "Which three systems or tools can't you manage without?" },
      plasshaldar: { nn: "Til dømes e-post, PowerOffice, bookingsystemet", en: "For example email, PowerOffice, the booking system" }
    },
    {
      id: "B2", del: "B", type: "single",
      tekst: { nn: "Tenk deg at e-post, filer og fagsystem stoppar i morgon tidleg. Kor lenge kan de halde fram før det blir alvorleg?", en: "Imagine email, files and your core systems stop tomorrow morning. How long can you keep going before it gets serious?" },
      val: [
        o("t2", "Under to timar", "Less than two hours"),
        o("dag", "Ein arbeidsdag", "One working day"),
        o("d23", "2–3 dagar", "2–3 days"),
        o("veke", "Ei veke eller meir", "A week or more"),
        o("vk", "Veit ikkje", "Not sure")
      ]
    },
    {
      id: "B3", del: "B", type: "text", valfri: true,
      tekst: { nn: "Er det periodar der ein IT-stans ville vore ekstra ille?", en: "Are there periods when an IT outage would be especially bad?" },
      hjelp: { nn: "Til dømes høgsesong, anbodsfristar, lønnskøyring eller eksamen.", en: "For example peak season, tender deadlines, payroll or exams." }
    },
    {
      id: "B4", del: "B", type: "multi", maks: 2, minst: 1,
      tekst: { nn: "Kva ville vore verst for dykk?", en: "What would hurt you the most?" },
      hjelp: { nn: "Vel dei to som tyngjer mest.", en: "Pick the two that weigh the most." },
      val: [
        o("stans", "At vi ikkje får jobba", "Not being able to work"),
        o("tap", "At data blir borte for godt", "Losing data for good"),
        o("lekkasje", "At kundeopplysningar kjem på avvegar", "Customer information getting out"),
        o("svindel", "At pengar blir betalte til svindlarar", "Money being paid to fraudsters"),
        o("omdome", "At ryktet vårt tek skade", "Damage to our reputation")
      ]
    },
    {
      id: "B17", del: "B", type: "multi",
      tekst: { nn: "Kva slags opplysningar har de som ikkje må kome på avvegar?", en: "What kinds of information do you hold that must not get out?" },
      hjelp: { nn: "Kryss av alt som passar. Vi spør om kva slag, ikkje om innhaldet.", en: "Tick everything that applies. We're asking about the kind, not the content." },
      val: [
        o("kunde", "Kontaktopplysningar om kundar", "Customer contact details"),
        o("id", "Personnummer eller kopi av legitimasjon", "National ID numbers or copies of ID"),
        o("helse", "Helseopplysningar", "Health information"),
        o("tilsette", "Opplysningar om tilsette: lønn, sjukefråvær, personalsaker", "Staff records: pay, sick leave, HR matters"),
        o("barn", "Opplysningar om elevar eller mindreårige", "Information about students or minors"),
        o("betaling", "Kort- eller kontoopplysningar", "Card or bank account details"),
        o("andre", "Data eller innloggingar vi tek vare på for kundane våre", "Data or logins we keep on behalf of our customers"),
        o("forretning", "Prisar, tilbod, kontraktar eller teikningar", "Prices, quotes, contracts or drawings"),
        o("vk", "Veit ikkje", "Not sure", { aleine: true })
      ]
    },
    {
      id: "B5", del: "B", type: "single",
      tekst: { nn: "Kven har ansvar for IT hos dykk i dag?", en: "Who is responsible for IT in your company today?" },
      val: [
        o("dagleg", "Dagleg leiar", "The managing director"),
        o("tilsett", "Ein tilsett, ved sida av anna arbeid", "An employee, alongside other work"),
        o("vardahei", "I praksis Vardahei", "In practice, Vardahei"),
        o("ingen", "Ingen bestemt", "Nobody in particular")
      ]
    },
    {
      id: "B19", del: "B", type: "multi",
      tekst: { nn: "Har de system som nokon andre enn Vardahei har ansvaret for?", en: "Do you have systems that someone other than Vardahei is responsible for?" },
      hjelp: { nn: "Kryss av alt som passar.", en: "Tick everything that applies." },
      val: [
        o("fag", "Fagsystem eller bransjesystem", "Industry-specific or core system"),
        o("nett", "Nettside eller nettbutikk", "Website or online shop"),
        o("okonomi", "Rekneskap, lønn eller faktura", "Accounting, payroll or invoicing"),
        o("booking", "Kasse- eller bookingsystem", "Point-of-sale or booking system"),
        o("some", "Sosiale medium", "Social media"),
        o("anna", "Anna", "Other"),
        o("ingen", "Nei, Vardahei har alt", "No, Vardahei handles everything", { aleine: true }),
        o("vk", "Veit ikkje", "Not sure", { aleine: true })
      ],
      fritekst: { nn: "Kven har ansvaret for dei? (valfritt)", en: "Who is responsible for them? (optional)" }
    },
    {
      id: "B7", del: "B", type: "single",
      tekst: { nn: "Har kundar, forsikringsselskap, bank eller offentlege oppdragsgjevarar spurt om IT-tryggleiken dykkar?", en: "Have customers, your insurer, bank or public clients asked about your IT security?" },
      val: [
        o("ja", "Ja", "Yes"),
        o("ventar", "Nei, men vi trur det kjem", "No, but we expect it"),
        o("nei", "Nei", "No"),
        o("vk", "Veit ikkje", "Not sure")
      ]
    },
    {
      id: "B8", del: "B", type: "single",
      tekst: { nn: "Kor ofte får de nye tilsette, vikarar eller sesongarbeidarar?", en: "How often do you get new staff, temps or seasonal workers?" },
      val: [
        o("ofte", "Fleire gonger i månaden", "Several times a month"),
        o("ar", "Nokre gonger i året", "A few times a year"),
        o("sjeldan", "Sjeldan", "Rarely")
      ]
    },
    {
      id: "B9", del: "B", type: "single",
      tekst: { nn: "Når nokon sluttar, korleis blir tilgangane deira stengde?", en: "When someone leaves, how are their accounts closed?" },
      val: [
        o("vardahei", "Vi seier frå til Vardahei same dag", "We tell Vardahei the same day"),
        o("sjolv", "Vi gjer det sjølve", "We do it ourselves"),
        o("etter", "Det skjer etter kvart", "It happens eventually"),
        o("vk", "Veit ikkje", "Not sure")
      ]
    },
    {
      id: "B10", del: "B", type: "single",
      tekst: { nn: "Kan dei tilsette bruke jobb-e-post og Teams på private mobilar?", en: "Can employees use work email and Teams on their private phones?" },
      val: [
        o("reglar", "Ja, og vi har reglar for det", "Yes, and we have rules for it"),
        o("utan", "Ja, men utan særlege reglar", "Yes, but without any real rules"),
        o("nei", "Nei", "No"),
        o("ikkje", "Det har vi ikkje tenkt på", "We haven't thought about it")
      ]
    },
    {
      id: "B11", del: "B", type: "single",
      tekst: { nn: "Omtrent kor mange innloggingar deler fleire av dykk?", en: "Roughly how many logins are shared by several of you?" },
      hjelp: { nn: "Til dømes leverandørportalar, sosiale medium eller kundekontoar.", en: "For example supplier portals, social media or customer accounts." },
      val: [
        o("ingen", "Ingen", "None"),
        o("1-10", "1–10", "1–10"),
        o("11-50", "11–50", "11–50"),
        o("o50", "Fleire enn 50", "More than 50"),
        o("vk", "Veit ikkje", "Not sure")
      ]
    },
    {
      id: "B12", del: "B", type: "single",
      tekst: { nn: "Har de nokon gong prøvd å hente tilbake data frå backup, berre for å sjå at det verkar?", en: "Have you ever tried restoring data from backup, just to check that it works?" },
      val: [
        o("siste", "Ja, det siste året", "Yes, in the last year"),
        o("lenge", "Ja, men det er lenge sidan", "Yes, but it was a long time ago"),
        o("nei", "Nei", "No"),
        o("vk", "Veit ikkje", "Not sure")
      ]
    },
    {
      id: "B13", del: "B", type: "single",
      tekst: { nn: "Om de blir ramma av eit dataangrep i morgon: veit de kven som gjer kva dei første timane?", en: "If you were hit by a cyberattack tomorrow, do you know who does what in the first hours?" },
      val: [
        o("skrive", "Ja, det står skrive ned", "Yes, it's written down"),
        o("ide", "Vi har ein idé, men ingenting skrive ned", "We have an idea, but nothing written down"),
        o("nei", "Nei", "No"),
        o("vardahei", "Vi reknar med at Vardahei tek det", "We assume Vardahei handles it")
      ]
    },
    {
      id: "B18", del: "B", type: "multi",
      tekst: { nn: "Ein leverandør skriv i ein e-post at dei har fått nytt kontonummer. Kva gjer de før de betaler?", en: "A supplier emails to say they have a new bank account number. What do you do before paying?" },
      hjelp: { nn: "Kryss av det de faktisk gjer i dag.", en: "Tick what you actually do today." },
      val: [
        o("ring", "Ringjer leverandøren på eit nummer vi har frå før", "Call the supplier on a number we already have"),
        o("svar", "Svarar på e-posten og ber om stadfesting", "Reply to the email and ask for confirmation"),
        o("to", "To personar godkjenner betalinga", "Two people approve the payment"),
        o("endrar", "Endrar kontonummeret og betaler", "Update the account number and pay"),
        o("rekneskap", "Rekneskapsføraren tek seg av det, og vi veit ikkje korleis", "Our accountant handles it, and we don't know how"),
        o("vk", "Veit ikkje", "Not sure", { aleine: true })
      ]
    },
    {
      id: "B14", del: "B", type: "scale",
      tekst: { nn: "Kor godt kjenner du til kva Vardahei gjer for dykk i dag?", en: "How well do you know what Vardahei does for you today?" },
      hjelp: { nn: "Til dømes overvaking, oppdateringar og backup.", en: "For example monitoring, updates and backup." },
      skala: { min: 1, max: 5, lav: { nn: "Lite", en: "Not much" }, hog: { nn: "Godt", en: "Well" } },
      rader: [o("kjenner", "", "")]
    },
    {
      id: "B15", del: "B", type: "multi",
      tekst: { nn: "Kva vil de ha meir av frå oss?", en: "What would you like more of from us?" },
      hjelp: { nn: "Kryss av alt som passar.", en: "Tick everything that applies." },
      val: [
        o("mote", "Faste statusmøte", "Regular status meetings"),
        o("rapport", "Ein kort rapport kvar månad eller kvartal", "A short monthly or quarterly report"),
        o("opplaering", "Opplæring for dei tilsette", "Training for staff"),
        o("rad", "Råd om nye løysingar, til dømes KI og automatisering", "Advice on new solutions, like AI and automation"),
        o("raskare", "Raskare svar når vi tek kontakt", "Faster replies when we get in touch"),
        o("avtale", "Klarare avtalar og prisar", "Clearer agreements and prices"),
        o("fungerer", "Ingenting, det fungerer bra", "Nothing, it works well", { aleine: true })
      ]
    },
    {
      id: "B16", del: "B", type: "nps",
      tekst: { nn: "Kor sannsynleg er det at du vil tilrå Vardahei til ei anna bedrift?", en: "How likely are you to recommend Vardahei to another business?" },
      skala: { min: 0, max: 10, lav: { nn: "Lite sannsynleg", en: "Not likely" }, hog: { nn: "Svært sannsynleg", en: "Very likely" } },
      fritekst: { nn: "Kva er grunnen? (valfritt)", en: "What's the reason? (optional)" }
    }
  ];

  /* Råd på sluttskjermen. Dei første fire som slår til, blir viste, i rekkjefølgja under. */
  function har(s, id, v) { var x = s[id]; return Array.isArray(x) ? x.indexOf(v) > -1 : x === v; }
  function lav(s, id, rad) { return s[id] && s[id][rad] != null && s[id][rad] <= 2; }

  // Tryggleiksskjemaet har ingen råd på sluttskjermen: spørsmåla er dei same som i Forms-runden, og svara blir brukte samla.
  var TRYGG_TIPS = [];

  /* =====================================================================
     Skjema 2: Arbeidsdagen og KI
     ===================================================================== */
  var KI_FREKVENS = [
    o("aldri", "Aldri", "Never"),
    o("provd", "Har prøvd ein gong eller to", "Tried it once or twice"),
    o("avogtil", "Av og til", "Now and then"),
    o("veke", "Kvar veke", "Every week"),
    o("dag", "Kvar dag", "Every day")
  ];
  function rutine(s) { return (s.K3 || []).filter(function (x) { return x !== "ingen"; }); }
  function praktisk(s) { return s.K1 === "prod" || (!!s.K2 && s.K2.indexOf("praktisk") > -1); }

  // Rutineoppgåver. Dei fire siste blir berre viste til dei som jobbar praktisk.
  var RUTINE = [
    o("epost", "Svare på dei same spørsmåla og e-postane om att og om att", "Answering the same questions and emails again and again"),
    o("referat", "Skrive referat, notat eller rapportar", "Writing minutes, notes or reports"),
    o("tilbod", "Lage tilbod eller ordrar", "Making quotes or orders"),
    o("kopiere", "Kopiere informasjon frå eitt system til eit anna", "Copying information from one system to another"),
    o("leite", "Leite etter dokument eller informasjon", "Looking for documents or information"),
    o("faktura", "Fakturering, bilag og purringar", "Invoicing, receipts and reminders"),
    o("plan", "Setje opp vakter, ruter eller timeplanar", "Setting up shifts, routes or schedules"),
    o("omsetje", "Omsetje tekst", "Translating text"),
    o("timar", "Føre timar eller timelister", "Logging hours or timesheets", { vis: praktisk }),
    o("sjekkliste", "Fylle ut sjekklister og skjema, til dømes HMS", "Filling in checklists and forms, like HSE", { vis: praktisk }),
    o("dokumentere", "Dokumentere utført arbeid med tekst eller bilete", "Documenting finished work with text or photos", { vis: praktisk }),
    o("delar", "Bestille delar eller varer", "Ordering parts or supplies", { vis: praktisk })
  ];

  function brukarKI(s) {
    var j = s.K7, p = s.K8;
    return (j && j !== "aldri") || (p && p !== "aldri");
  }

  var KI_SP = [
    {
      id: "K1", del: "A", type: "single", rolle: true, anker: true,
      tekst: { nn: "Kva rolle har du i bedrifta?", en: "What is your role at work?" },
      val: ROLLER
    },
    {
      id: "K2", del: "A", type: "multi", maks: 3,
      tekst: { nn: "Kva går mesteparten av arbeidsdagen din til?", en: "What does most of your working day go to?" },
      hjelp: { nn: "Vel inntil tre.", en: "Choose up to three." },
      val: [
        o("kundar", "Kundar, telefon og e-post", "Customers, phone and email"),
        o("tekst", "Skrive tilbod, rapportar eller andre tekstar", "Writing quotes, reports or other texts"),
        o("tal", "Tal, rekneskap og fakturaer", "Numbers, accounts and invoices"),
        o("planlegging", "Planlegging, vakter og bemanning", "Planning, shifts and staffing"),
        o("registrering", "Registrere informasjon i system", "Entering information into systems"),
        o("mote", "Møte og samordning", "Meetings and coordination"),
        o("praktisk", "Praktisk arbeid: produksjon, verkstad, service eller reinhald", "Hands-on work: production, workshop, service or cleaning"),
        o("undervisning", "Undervisning eller oppfølging av elevar og deltakarar", "Teaching or following up students"),
        o("anna", "Anna", "Something else")
      ]
    },
    {
      id: "K3", del: "A", type: "multi",
      tekst: { nn: "Kva oppgåver tek tid, men kjennest som rutine?", en: "Which tasks take time but feel like routine?" },
      hjelp: { nn: "Kryss av alt som passar.", en: "Tick everything that applies." },
      val: RUTINE.concat([o("ingen", "Eg har lite slikt arbeid", "I don't have much of that", { aleine: true })]),
      fritekst: { nn: "Beskriv gjerne éi slik oppgåve: kva gjer du, og kor ofte? (valfritt)", en: "Feel free to describe one such task: what do you do, and how often? (optional)" }
    },
    {
      id: "K16", del: "A", type: "single", valFraa: "K3",
      vis: function (s) { return rutine(s).length >= 2; },
      tekst: { nn: "Kva for ei av desse tek mest tid?", en: "Which of these takes the most time?" },
      val: RUTINE
    },
    {
      id: "K17", del: "A", type: "single",
      vis: function (s) { return rutine(s).length >= 1; },
      tekst: { nn: "Tenk på rutineoppgåva som tek mest tid. Kor ofte gjer du ho?", en: "Think of the routine task that takes the most time. How often do you do it?" },
      val: [
        o("fleiredag", "Fleire gonger om dagen", "Several times a day"),
        o("dag", "Omtrent kvar dag", "About once a day"),
        o("veke", "Nokre gonger i veka", "A few times a week"),
        o("sjeldnare", "Sjeldnare", "Less often")
      ]
    },
    {
      id: "K18", del: "A", type: "single",
      vis: function (s) { return rutine(s).length >= 1; },
      tekst: { nn: "Og kor lang tid tek ho kvar gong?", en: "And how long does it take each time?" },
      val: [
        o("u5", "Under 5 minutt", "Less than 5 minutes"),
        o("5-15", "5–15 minutt", "5–15 minutes"),
        o("15-30", "15–30 minutt", "15–30 minutes"),
        o("30-60", "30–60 minutt", "30–60 minutes"),
        o("o60", "Meir enn ein time", "More than an hour"),
        o("vk", "Veit ikkje", "Not sure")
      ]
    },
    {
      id: "K4", del: "A", type: "single",
      vis: function (s) { return !(s.K3 && s.K3.length === 1 && s.K3[0] === "ingen"); },
      tekst: { nn: "Omtrent kor mykje tid i veka går til slike rutineoppgåver?", en: "Roughly how much time a week goes to routine tasks like these?" },
      val: [
        o("u1", "Under ein time", "Less than an hour"),
        o("1-3", "1–3 timar", "1–3 hours"),
        o("3-5", "3–5 timar", "3–5 hours"),
        o("5-10", "5–10 timar", "5–10 hours"),
        o("o10", "Meir enn 10 timar", "More than 10 hours"),
        o("vk", "Veit ikkje", "Not sure")
      ]
    },
    {
      id: "K5", del: "A", type: "multi",
      tekst: { nn: "Kva program og nettstader brukar du kvar veke i jobben?", en: "Which programs and websites do you use every week at work?" },
      hjelp: { nn: "Kryss av alt som passar.", en: "Tick everything that applies." },
      val: [
        o("m365", "E-post, Teams og Office", "Email, Teams and Office"),
        o("okonomi", "PowerOffice eller anna økonomisystem", "PowerOffice or another accounting system"),
        o("crm", "Kunde- eller bookingsystem", "Customer or booking system"),
        o("bransje", "Bransjesystem eller fagprogram", "Industry-specific systems"),
        o("rekneark", "Rekneark som vi har laga sjølve", "Spreadsheets we made ourselves"),
        o("some", "Sosiale medium for bedrifta", "Social media for the company"),
        o("portal", "Nettsider hos leverandørar eller kundar", "Supplier or customer portals"),
        o("anna", "Anna", "Other")
      ],
      fritekst: { nn: "Skriv gjerne namnet på systema (valfritt)", en: "Feel free to name the systems (optional)" }
    },
    {
      id: "K6", del: "A", type: "single",
      tekst: { nn: "Kor ofte leitar du etter informasjon som du veit finst ein stad hos dykk?", en: "How often do you search for information you know exists somewhere at your workplace?" },
      hjelp: { nn: "Til dømes ein gamal e-post, eit dokument, ein pris eller korleis noko vart gjort sist.", en: "For example an old email, a document, a price, or how something was done last time." },
      val: [
        o("fleiredag", "Fleire gonger om dagen", "Several times a day"),
        o("dag", "Omtrent kvar dag", "About once a day"),
        o("veke", "Nokre gonger i veka", "A few times a week"),
        o("sjeldan", "Sjeldan", "Rarely")
      ]
    },
    {
      id: "K20", del: "A", type: "multi", maks: 2,
      vis: function (s) { return !!s.K6 && s.K6 !== "sjeldan"; },
      tekst: { nn: "Kvar leitar du oftast?", en: "Where do you usually look?" },
      hjelp: { nn: "Vel inntil to.", en: "Choose up to two." },
      val: [
        o("epost", "I e-posten", "In my email"),
        o("filer", "I mapper på PC-en, i OneDrive eller i Teams", "In folders on my computer, in OneDrive or in Teams"),
        o("system", "I fagsystemet eller økonomisystemet", "In our core or accounting system"),
        o("kollega", "Eg spør ein kollega", "I ask a colleague"),
        o("papir", "I permar eller på papir", "In binders or on paper")
      ]
    },
    {
      id: "K7", del: "A", type: "single", anker: true,
      ingress: { nn: "Litt om KI", en: "A bit about AI" },
      tekst: { nn: "Kor ofte brukar du KI-verktøy, til dømes ChatGPT, Copilot, Gemini eller Claude, i jobben?", en: "How often do you use AI tools, such as ChatGPT, Copilot, Gemini or Claude, at work?" },
      val: KI_FREKVENS
    },
    {
      id: "K8", del: "A", type: "single", anker: true,
      tekst: { nn: "Og privat, utanom jobben?", en: "And privately, outside work?" },
      val: KI_FREKVENS
    },
    {
      id: "K9", del: "A", type: "single", anker: true,
      tekst: { nn: "Kva passar best på deg?", en: "Which fits you best?" },
      val: [
        o("n0", "Eg har ikkje brukt KI", "I haven't used AI"),
        o("n1", "Eg har prøvd, men veit ikkje heilt kva eg skal bruke det til", "I've tried it but don't quite know what to use it for"),
        o("n2", "Eg brukar det til enkle ting, som å skrive om ein tekst eller spørje om noko", "I use it for simple things, like rewriting a text or asking a question"),
        o("n3", "Eg brukar det fast og veit kva det er godt og dårleg til", "I use it regularly and know what it's good and bad at"),
        o("n4", "Eg har laga eigne oppsett, malar eller automatiseringar", "I've built my own setups, templates or automations")
      ]
    },
    {
      id: "K11", del: "A", type: "multi", vis: brukarKI,
      tekst: { nn: "Kva har du brukt KI til?", en: "What have you used AI for?" },
      hjelp: { nn: "Både i jobben og privat. Kryss av alt som passar.", en: "At work and privately. Tick everything that applies." },
      val: [
        o("skrive", "Skrive eller forbetre tekst", "Writing or improving text"),
        o("epost", "Svare på e-post", "Answering email"),
        o("samandrag", "Samandrag av dokument eller møte", "Summarising documents or meetings"),
        o("omsetje", "Omsetje", "Translating"),
        o("idear", "Idear og planlegging", "Ideas and planning"),
        o("tal", "Rekneark, formlar og tal", "Spreadsheets, formulas and numbers"),
        o("sok", "Søkje etter informasjon", "Looking things up"),
        o("bilete", "Bilete eller presentasjonar", "Images or presentations"),
        o("laere", "Lære noko nytt", "Learning something new"),
        o("anna", "Anna", "Something else")
      ]
    },
    {
      id: "K21", del: "A", type: "single", scenario: true,
      ingress: { nn: "Ein liten situasjon", en: "A quick situation" },
      tekst: {
        nn: "Du skal svare ein kunde og vil ha hjelp av KI. Du har kontrakten deira open, og du har ein privat KI-konto på mobilen. Kva gjer du?",
        en: "You need to reply to a customer and want help from AI. You have their contract open, and you have a private AI account on your phone. What do you do?"
      },
      val: [
        o("lim", "Limer inn kontrakten. Det går fortast.", "Paste in the contract. It's quickest."),
        o("fjern", "Fjernar namn og tal først, og limer inn resten", "Remove names and figures first, then paste the rest"),
        o("jobb", "Brukar eit verktøy bedrifta har godkjent, eller spør kva som er lov", "Use a tool the company has approved, or ask what's allowed"),
        o("utan", "Skriv svaret utan KI", "Write the reply without AI"),
        o("vk", "Veit ikkje", "Not sure")
      ],
      rett: ["jobb"],
      fasit: {
        tittel: { nn: "Kontrakten og den private KI-kontoen", en: "The contract and the private AI account" },
        nn: "Bruk eit verktøy bedrifta har godkjent, og logg inn med jobbkontoen. Å fjerne namn og tal hjelper, men det er lett å gløyme noko. Har de ingen reglar enno, spør leiaren. Vi hjelper gjerne med å lage dei.",
        en: "Use a tool the company has approved, signed in with your work account. Removing names and figures helps, but it's easy to miss something. If there are no rules yet, ask your manager. We're happy to help write them."
      }
    },
    {
      id: "K19", del: "A", type: "single", vis: brukarKI,
      tekst: { nn: "Har du lagt jobbdokument eller kundeopplysningar inn i eit KI-verktøy dei siste tre månadene?", en: "In the last three months, have you put work documents or customer details into an AI tool?" },
      hjelp: { nn: "Ingen feil svar. Vi spør for å finne ut kva verktøy de treng.", en: "No wrong answers. We ask to find out which tools you need." },
      val: [
        o("jobb", "Ja, med jobbkontoen", "Yes, signed in with my work account"),
        o("privat", "Ja, med privat konto eller utan å logge inn", "Yes, with a private account or without signing in"),
        o("begge", "Ja, begge delar", "Yes, both"),
        o("nei", "Nei", "No"),
        o("vk", "Hugsar ikkje", "Don't remember")
      ]
    },
    {
      id: "K12", del: "A", type: "scale", vis: brukarKI,
      tekst: { nn: "Kor godt stemmer dette for deg?", en: "How well does this fit you?" },
      hjelp: { nn: "1 betyr stemmer ikkje, 5 betyr stemmer heilt.", en: "1 means not at all, 5 means completely." },
      skala: { min: 1, max: 5, lav: { nn: "Stemmer ikkje", en: "Not at all" }, hog: { nn: "Stemmer heilt", en: "Completely" } },
      rader: [
        o("sporje", "Eg veit korleis eg skal spørje for å få eit godt svar", "I know how to ask to get a good answer"),
        o("vurdere", "Eg merkar når svaret er feil eller oppdikta", "I notice when the answer is wrong or made up"),
        o("spart", "Eg har spart tid med KI den siste månaden", "AI has saved me time in the last month")
      ]
    },
    {
      id: "K13", del: "A", type: "multi", maks: 3,
      tekst: { nn: "Kva held deg tilbake frå å bruke KI meir i jobben?", en: "What holds you back from using AI more at work?" },
      hjelp: { nn: "Vel inntil tre.", en: "Choose up to three." },
      val: [
        o("kva", "Veit ikkje kva eg skal bruke det til", "I don't know what to use it for"),
        o("lov", "Usikker på om det er lov hos oss", "Not sure if it's allowed here"),
        o("data", "Redd for å dele opplysningar eg ikkje burde", "Worried about sharing information I shouldn't"),
        o("stolar", "Stolar ikkje heilt på svara", "I don't fully trust the answers"),
        o("tid", "Har ikkje tid til å lære det", "No time to learn it"),
        o("tilgang", "Har ikkje tilgang til gode verktøy", "No access to good tools"),
        o("passar", "Det passar ikkje til arbeidet mitt", "It doesn't fit my work"),
        o("ingenting", "Ingenting held meg tilbake", "Nothing is holding me back", { aleine: true })
      ]
    },
    {
      id: "K14", del: "A", type: "single",
      tekst: { nn: "Korleis kjennest det å tenkje på meir KI i jobben?", en: "How does it feel to think about more AI at work?" },
      val: [
        o("gler", "Eg gler meg", "I'm looking forward to it"),
        o("nysgjerrig", "Nysgjerrig", "Curious"),
        o("noytral", "Nøytralt", "Neutral"),
        o("skeptisk", "Litt skeptisk", "A bit sceptical"),
        o("uroa", "Eg er uroa", "Worried")
      ],
      fritekst: { nn: "Vil du seie meir? (valfritt)", en: "Want to say more? (optional)" }
    },
    {
      id: "K15", del: "A", type: "text", valfri: true,
      tekst: { nn: "Om du fekk ein assistent som kunne ta éi oppgåve frå deg kvar veke, kva skulle det vore?", en: "If you got an assistant who could take one task off your hands every week, what would it be?" },
      plasshaldar: { nn: "Til dømes: setje opp vaktlista, skrive referat frå måndagsmøtet", en: "For example: making the shift plan, writing the Monday meeting notes" }
    },

    /* ---------- Del B: leiar ---------- */
    {
      id: "L2", del: "B", type: "multi", maks: 3,
      tekst: { nn: "Frå kunden tek kontakt til jobben er fakturert: kvar stoppar det oftast opp?", en: "From the customer's first contact to the invoice: where does it most often get stuck?" },
      hjelp: { nn: "Vel inntil tre.", en: "Choose up to three." },
      val: [
        o("forespurnad", "Førespurnader og tilbod", "Enquiries and quotes"),
        o("planlegging", "Planlegging og bemanning", "Planning and staffing"),
        o("innkjop", "Innkjøp og lager", "Purchasing and stock"),
        o("gjennomforing", "Sjølve gjennomføringa", "Doing the actual work"),
        o("faktura", "Fakturering og oppfølging", "Invoicing and follow-up"),
        o("rapport", "Rapportering og oversikt", "Reporting and overview"),
        o("opplaering", "Opplæring av nye", "Training new people"),
        o("kundeservice", "Kundeservice etter levering", "Customer service after delivery")
      ]
    },
    {
      id: "L11", del: "B", type: "single",
      tekst: { nn: "Omtrent kor mange førespurnader får de frå kundar i veka?", en: "Roughly how many customer enquiries do you get a week?" },
      hjelp: { nn: "E-post, telefon og skjema til saman.", en: "Email, phone and forms combined." },
      val: [
        o("u10", "Under 10", "Fewer than 10"),
        o("10-30", "10–30", "10–30"),
        o("31-100", "31–100", "31–100"),
        o("o100", "Meir enn 100", "More than 100"),
        o("vk", "Veit ikkje", "Not sure")
      ]
    },
    {
      id: "L1", del: "B", type: "text", valfri: true,
      tekst: { nn: "Korleis går ein typisk jobb hos dykk, steg for steg?", en: "How does a typical job go at your company, step by step?" },
      hjelp: { nn: "Valfritt. Stikkord er nok. Vi vil forstå kjeda, ikkje detaljane.", en: "Optional. Keywords are enough. We want to understand the chain, not the details." },
      plasshaldar: { nn: "Førespurnad på e-post → synfaring → tilbod → …", en: "Email enquiry → site visit → quote → …" }
    },
    {
      id: "L3", del: "B", type: "text", valfri: true,
      tekst: { nn: "Kva rapport eller oversikt skulle de ønskje de hadde, men som tek for lang tid å lage i dag?", en: "Which report or overview do you wish you had, but takes too long to make today?" }
    },
    {
      id: "L4", del: "B", type: "single",
      tekst: { nn: "Har bedrifta reglar for korleis de tilsette kan bruke KI?", en: "Does the company have rules for how employees can use AI?" },
      val: [
        o("skrive", "Ja, skrivne reglar", "Yes, written rules"),
        o("uformelt", "Berre uformelt", "Only informally"),
        o("nei", "Nei", "No"),
        o("vk", "Veit ikkje", "Not sure")
      ]
    },
    {
      id: "L5", del: "B", type: "single",
      tekst: { nn: "Betaler bedrifta for KI-verktøy i dag?", en: "Does the company pay for AI tools today?" },
      val: [
        o("alle", "Ja, for alle eller dei fleste", "Yes, for everyone or most people"),
        o("nokre", "Ja, for nokre få", "Yes, for a few"),
        o("gratis", "Nei, men nokre brukar gratisversjonar", "No, but some use free versions"),
        o("nei", "Nei", "No"),
        o("vk", "Veit ikkje", "Not sure")
      ]
    },
    {
      id: "L6", del: "B", type: "multi",
      tekst: { nn: "Kva planar har de det neste året?", en: "What are your plans for the next year?" },
      hjelp: { nn: "Kryss av alt som passar.", en: "Tick everything that applies." },
      val: [
        o("tilsetje", "Tilsetje fleire", "Hire more people"),
        o("lokale", "Nye lokale eller ny avdeling", "New premises or a new department"),
        o("system", "Nytt fagsystem eller nettbutikk", "A new core system or online shop"),
        o("utstyr", "Byte PC-ar eller anna utstyr", "Replace computers or other equipment"),
        o("farten", "Meir heimekontor eller arbeid på farten", "More remote or mobile work"),
        o("ki", "Ta i bruk KI eller meir automatisering", "Start using AI or more automation"),
        o("ingen", "Ingen store endringar", "No big changes", { aleine: true })
      ]
    },
    {
      id: "L7", del: "B", type: "single",
      tekst: { nn: "Kva ville vore den beste første gevinsten av KI for dykk?", en: "What would be the best first gain from AI for you?" },
      val: [
        o("tid", "Mindre tid på rutinearbeid", "Less time on routine work"),
        o("kundar", "Raskare svar til kundane", "Faster replies to customers"),
        o("oversikt", "Betre oversikt og rapportar", "Better overview and reports"),
        o("feil", "Færre feil", "Fewer mistakes"),
        o("opplaering", "Lettare opplæring av nye tilsette", "Easier training of new staff"),
        o("vk", "Veit ikkje enno", "Don't know yet")
      ]
    },
    {
      id: "L8", del: "B", type: "single",
      tekst: { nn: "Når kunne det vore aktuelt å prøve ei KI-løysing i drifta?", en: "When might it be relevant to try an AI solution in your operations?" },
      val: [
        o("no", "Så snart som mogleg", "As soon as possible"),
        o("halvar", "I løpet av eit halvår", "Within six months"),
        o("ar", "Om eitt år eller meir", "In a year or more"),
        o("ikkje", "Ikkje aktuelt no", "Not relevant right now")
      ]
    },
    {
      id: "L9", del: "B", type: "text", valfri: true,
      tekst: { nn: "Er det noko de absolutt ikkje vil at KI skal røre?", en: "Is there anything you definitely don't want AI to touch?" },
      plasshaldar: { nn: "Til dømes lønn, personalsaker eller kontakt med enkelte kundar", en: "For example payroll, HR matters or contact with certain customers" }
    },
    {
      id: "L10", del: "B", type: "single",
      tekst: { nn: "Vil de at vi tek ein prat om det de har svart?", en: "Would you like us to have a chat about your answers?" },
      val: [
        o("ja", "Ja, gjerne", "Yes, please"),
        o("seinare", "Kanskje seinare", "Maybe later"),
        o("nei", "Nei takk", "No thanks")
      ]
    }
  ];

  var KI_TIPS = [
    {
      id: "start",
      naar: function (s) { return s.K9 === "n0" || s.K9 === "n1" || s.K7 === "aldri" || s.K7 === "provd"; },
      tittel: { nn: "Ein enkel stad å starte", en: "An easy place to start" },
      nn: "Neste gong du skal skrive ein e-post du gruar deg til, be KI om eit utkast og rett det etterpå. Du bestemmer innhaldet, KI skriv første versjon. Det er heile trikset.",
      en: "Next time you need to write an email you're dreading, ask AI for a draft and edit it afterwards. You decide the content, AI writes the first version. That's the whole trick."
    },
    {
      id: "lov",
      naar: function (s) { return har(s, "K13", "lov"); },
      tittel: { nn: "Usikker på kva som er lov?", en: "Not sure what's allowed?" },
      nn: "Spør leiaren din. Har bedrifta ingen reglar enno, hjelper vi gjerne med å lage nokre enkle, så alle veit kva som gjeld.",
      en: "Ask your manager. If the company has no rules yet, we're happy to help write a few simple ones so everyone knows where they stand."
    },
    {
      id: "data",
      naar: function (s) { return har(s, "K13", "data") || s.K19 === "privat" || s.K19 === "begge" || s.K21 === "lim" || s.K21 === "vk"; },
      tittel: { nn: "Kva du ikkje bør lime inn", en: "What not to paste in" },
      nn: "Personnummer, kundeopplysningar, passord og interne tal høyrer ikkje heime i KI-verktøy du brukar med privat konto. Bruk verktøy bedrifta har godkjent, og logg inn med jobbkontoen. Då er det avtalane til bedrifta som gjeld. Er du usikker på om eit dokument kan delast, spør først.",
      en: "National ID numbers, customer details, passwords and internal figures don't belong in AI tools you use with a private account. Use tools your company has approved, signed in with your work account. Then your company's agreements apply. If you're not sure a document can be shared, ask first."
    },
    {
      id: "stolar", reserve: true,
      naar: function (s) { return har(s, "K13", "stolar") || lav(s, "K12", "vurdere"); },
      tittel: { nn: "KI kan ta feil, og seier det sjeldan sjølv", en: "AI can be wrong, and rarely says so" },
      nn: "Bruk det til utkast, idear og samandrag. Sjekk alltid tal, namn og fakta før du sender noko vidare. Spør gjerne: «Kvar har du dette frå?»",
      en: "Use it for drafts, ideas and summaries. Always check numbers, names and facts before passing anything on. It helps to ask: “Where did you get this from?”"
    },
    {
      id: "kva",
      naar: function (s) { return har(s, "K13", "kva") || har(s, "K13", "passar"); },
      tittel: { nn: "Tre ting KI er god på i kvardagen", en: "Three everyday things AI is good at" },
      nn: "Lage samandrag av lange dokument. Skrive om ein tekst slik at han blir kortare eller enklare. Omsetje. Prøv éin av dei denne veka, med ei ekte oppgåve frå jobben.",
      en: "Summarising long documents. Rewriting a text to make it shorter or simpler. Translating. Try one of these this week, with a real task from work."
    },
    {
      id: "tid",
      naar: function (s) { return har(s, "K13", "tid") || lav(s, "K12", "sporje"); },
      tittel: { nn: "Fem minutt er nok", en: "Five minutes is enough" },
      nn: "Du treng ikkje kurs for å starte. Fortel KI kven du er, kva du skal ha, og kven det er til. «Eg jobbar på eit hotell. Skriv eit kort, venleg svar til ein gjest som klagar på støy.» Jo meir du fortel, jo betre svar.",
      en: "You don't need a course to start. Tell the AI who you are, what you need and who it's for. “I work at a hotel. Write a short, friendly reply to a guest complaining about noise.” The more you tell it, the better the answer."
    },
    {
      id: "framme",
      naar: function (s) { return (s.K9 === "n3" || s.K9 === "n4") && s.K21 === "jobb" && !lav(s, "K12", "vurdere"); },
      tittel: { nn: "Du er langt framme", en: "You're well ahead" },
      nn: "Kanskje du kan vise ein kollega korleis du brukar det? Fem minutt ved pulten er ofte betre opplæring enn eit heilt kurs.",
      en: "Maybe you could show a colleague how you use it? Five minutes at the desk is often better training than a whole course."
    },
    {
      id: "oppgave", avslutning: true,
      naar: function (s) { return !!(s.K15 || (s.K3 && s.K3.length && s.K3[0] !== "ingen")); },
      tittel: { nn: "Oppgåvene du nemnde, ser vi på", en: "We'll look at the tasks you mentioned" },
      nn: "Mykje av det som kjennest som rutine, kan gå raskare eller av seg sjølv. Vi samlar svara frå alle hos dykk og kjem tilbake med konkrete forslag.",
      en: "A lot of what feels like routine can go faster or run by itself. We'll gather everyone's answers at your company and come back with concrete suggestions."
    }
  ];

  var SKJEMA = {
    tryggleik: {
      id: "tryggleik",
      namn: { nn: "IT-sikkerheit i kvardagen", en: "IT security in everyday work" },
      kort: { nn: "IT-sikkerheit", en: "IT security" },
      minutt: 5,
      brev: {
        nn: ["Vi i Vardahei IT vil gjerne vite korleis IT-sikkerheita er i kvardagen hos dykk: kva rutinar som finst, korleis de held styr på passord og innlogging, og kva de gjer om noko går gale.",
             "Spørsmåla er dei same som i førre runde, slik at vi kan sjå kva som har endra seg. Svara blir brukte til å finne ut kva vi bør gjere betre i verksemda."],
        en: ["We at Vardahei IT would like to know what IT security looks like in your everyday work: which routines exist, how you keep track of passwords and sign-ins, and what you do if something goes wrong.",
             "The questions are the same as in the previous round, so we can see what has changed. The answers are used to find out what we should improve in the company."]
      },
      fakta2: { nn: "Vi spør om initialane dine, slik at vi kan sjå endringa frå førre runde. Svara per person ser berre Vardahei IT. Bedrifta får eit samla bilete utan initialar.", en: "We ask for your initials so we can see the change since the previous round. Only Vardahei IT sees answers per person. Your company gets an overall picture without initials." },
      fakta3: { nn: "Ingen feil svar. «Usikker» er eit heilt greitt svar, og nyttig for oss å vite.", en: "No wrong answers. “Not sure” is a perfectly fine answer, and useful for us to know." },
      fakta4: { nn: "Vi kjem tilbake til bedrifta med det vi fann, og kva vi føreslår å gjere.", en: "We'll get back to your company with what we found and what we suggest doing." },
      leiar: {
        tittel: { nn: "Nokre spørsmål til deg som leiar", en: "A few questions for you as a manager" },
        tekst: { nn: "Sidan du har ansvar i bedrifta, har vi nokre spørsmål til. Dei handlar meir om drifta enn om teknikk, og tek om lag 8 minutt.", en: "Since you have responsibility in the company, we have a few more questions. They're about running the business more than technology, and take about 8 minutes." }
      },
      sporsmal: TRYGG_SP,
      tips: TRYGG_TIPS
    },
    ki: {
      id: "ki",
      namn: { nn: "Arbeidsdagen og KI", en: "Your working day and AI" },
      kort: { nn: "Arbeidsdag og KI", en: "Work and AI" },
      minutt: 7,
      brev: {
        nn: ["Vi vil gjerne forstå korleis arbeidsdagen din ser ut: kva som tek tid, kva som går av seg sjølv, og korleis du brukar KI i dag. Om du brukar det i det heile.",
             "Svara hjelper oss å finne ut kvar KI faktisk kan gjere jobben lettare hos dykk, og kvar det ikkje gir meining."],
        en: ["We'd like to understand what your working day looks like: what takes time, what runs smoothly, and how you use AI today. If you use it at all.",
             "Your answers help us find where AI can actually make work easier at your company, and where it makes no sense."]
      },
      fakta3: { nn: "Ingen feil svar. Har du aldri brukt KI, er det like nyttig å vite.", en: "No wrong answers. If you've never used AI, that's just as useful to know." },
      fakta4: { nn: "Til slutt får du nokre KI-tips som passar for deg.", en: "At the end you get a few AI tips that suit you." },
      leiar: {
        tittel: { nn: "Nokre spørsmål til deg som leiar", en: "A few questions for you as a manager" },
        tekst: { nn: "Sidan du har ansvar i bedrifta, har vi nokre spørsmål om korleis jobben flyt hos dykk. Dei tek om lag 6 minutt.", en: "Since you have responsibility in the company, we have a few questions about how work flows at your company. They take about 6 minutes." }
      },
      sporsmal: KI_SP,
      tips: KI_TIPS
    }
  };

  /* Soner for tryggleiksskjemaet, same modell som Master_Analyse.xlsx (runde 1).
     Kvart svar gir 0–3 poeng (grøn 0, gul 1, oransje 2, raud 3). Snittscore = snittet av poenga.
     person: grensene for éin tilsett. Grøn under 1,0 og gul frå 1,0 er henta frå reknearket;
       ingen i runde 1 kom over 1,63, så grensa for oransje (2,0) og raud (2,5) er vårt forslag.
     samla: grensene for eit spørsmål, ei rolle eller ei bedrift: snittet av alle svara.
       Same som formelen i arket Tilsett_visning (snitt risikorang ≤ 1,5 grøn, ≤ 2,5 gul, ≤ 3,5 oransje). */
  var SONER = {
    nivaa: [{ id: "gron", namn: "Grøn" }, { id: "gul", namn: "Gul" }, { id: "oransje", namn: "Oransje" }, { id: "raud", namn: "Raud" }],
    person: [1, 2, 3], // som Risikonivå i Spørring2_v2 i Master_Analyse.xlsx
    samla: [0.5, 1.5, 2.5]
  };

  window.KARTLEGGING = {
    versjon: "2026-10-12",
    soner: SONER,
    // Dashbordet skal ikkje vise svar delt på rolle når ei rolle har færre svar enn dette
    minGruppe: 3,
    kontakt: KONTAKT,
    avsendar: AVSENDAR,
    kundar: KUNDAR,
    skjema: SKJEMA,
    maksTips: 4,
    // Desse rollene får leiardelen etter fellesdelen
    leiarRoller: ["leiar", "it"]
  };
})();
