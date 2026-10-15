/* Eksempeldata for admin-prototypen. Ikkje ekte svar.
   Frå prosjektet: kundenamna, talet på svar per kunde i runde 1 (importen 15.10), at alle seks var gule i runde 1,
   tekstane i funn-reglane (config/seed/findings) og kortnamna på spørsmåla. Alt anna er døme. */
window.VARDE_ADMIN_DATA = {
  idag: '2026-10-15',
  runde: { id: 'r2', namn: 'Runde 2 · IT-sikkerheit · haust 2026', mal: 'tryggleik · 2026-10-13', opna: '2026-10-08', status: 'open' },
  kundar: [
    { id: 'daco', namn: 'Daco', tilsette: 12, svar: 7, aktive: 0, avbrot: 1, frist: '2026-10-31', median: 6, r1: { n: 4, snitt: 1.21, kritisk: 0.29 }, lang: 'nn', status: 'open' },
    { id: 'gasta', namn: 'Gasta', tilsette: 18, svar: 11, aktive: 3, avbrot: 3, frist: '2026-10-31', median: 5, r1: { n: 9, snitt: 1.18, kritisk: 0.27 }, lang: 'nn', status: 'open' },
    { id: 'kviknes', namn: 'Kviknes', tilsette: 34, svar: 15, aktive: 4, avbrot: 2, frist: '2026-10-24', median: 7, r1: { n: 12, snitt: 1.31, kritisk: 0.33 }, lang: 'en', status: 'open' },
    { id: 'maskinsenteret', namn: 'Maskinsenteret', tilsette: 26, svar: 19, aktive: 0, avbrot: 1, frist: '2026-10-31', median: 5, r1: { n: 14, snitt: 1.09, kritisk: 0.24 }, lang: 'nn', status: 'open' },
    { id: 'sfhs', namn: 'SFHS', tilsette: 22, svar: 10, aktive: 3, avbrot: 0, frist: '2026-10-31', median: 6, r1: { n: 12, snitt: 1.15, kritisk: 0.26 }, lang: 'nn', status: 'open' },
    { id: 'tharaso', namn: 'Tharaso', tilsette: 9, svar: 2, aktive: 0, avbrot: 0, frist: '2026-11-07', median: null, r1: { n: 6, snitt: 1.27, kritisk: 0.31 }, lang: 'nn', status: 'open' },
  ],
  /* 16 spørsmål med score (F3–F14, F16–F19), kortnamn frå malen */
  sporsmal: [
    ['F3', 'Fokus på sikkerheit', 0.9], ['F4', 'Opplevd svindelforsøk', 1.55], ['F5', 'Rutine: stoppe hending', 1.3], ['F6', 'Rutine: starte opp att', 1.62],
    ['F7', 'Passordvanar', 0.8], ['F8', 'Same passord', 1.25], ['F9', 'Passordhandterar', 1.72], ['F10', 'Låser PC-en', 0.9],
    ['F11', 'Phishing-opplæring', 1.5], ['F12', 'Veit kor dei skal melde frå', 0.85], ['F13', 'Mistenkt klikk', 0.62], ['F14', 'Brukar MFA', 0.45],
    ['F16', 'Veit kvar filer skal lagrast', 0.78], ['F17', 'Lagrar lokalt', 1.42], ['F18', 'PC oppdatert', 0.5], ['F19', 'Antivirus/EDR aktiv', 1.02],
  ],
  kundeskjeiv: { daco: -0.12, gasta: 0.04, kviknes: 0.2, maskinsenteret: -0.22, sfhs: 0.09, tharaso: 0 },
  funn: [
    { niva: 'hog', del: 0.46, tekst: 'har ikkje passordhandterar', tiltak: 'Pilot med Bitwarden for 2–3 personar, så resten.' },
    { niva: 'hog', del: 0.38, tekst: 'kjenner ingen rutine for å starte opp att etter ei alvorleg hending', tiltak: 'Beredskapsplan på éi side saman med leiaren: kven gjer kva, i kva rekkjefølgje.' },
    { niva: 'hog', del: 0.31, tekst: 'har ikkje fått opplæring i å avsløre phishing', tiltak: 'Kort gjennomgang på eit møte, så ein test med falske e-postar nokre veker etter.' },
    { niva: 'middels', del: 0.24, tekst: 'lagrar viktige filer lokalt på PC-en', tiltak: 'Flytt skrivebord og Dokument til OneDrive, så blir det backup utan at folk må tenkje på det.' },
    { niva: 'middels', del: 0.18, tekst: 'veit ikkje korleis eller til kven dei skal melde frå om mistenkelege e-postar', tiltak: 'Éi side på veggen og i Teams: kven du ringjer, kva du gjer med e-posten. Leiaren seier det høgt på neste møte.' },
  ],
  /* Nøkkelspørsmål: delar per svar og risikoscore (0 grøn, 1 gul, 2 oransje, 3 raud) */
  nokkel: [
    { id: 'F12', namn: 'Veit kor dei skal melde frå', delar: [['Ja', 0.58, 0], ['Delvis', 0.22, 1], ['Usikker', 0.08, 1], ['Nei', 0.12, 2]] },
    { id: 'F5', namn: 'Rutine: stoppe hending', delar: [['Ja', 0.34, 0], ['Delvis', 0.28, 1], ['Usikker', 0.14, 1], ['Nei', 0.24, 2]] },
    { id: 'F14', namn: 'Brukar MFA', delar: [['Ja', 0.82, 0], ['Usikker', 0.11, 1], ['Nei', 0.07, 2]] },
    { id: 'F9', namn: 'Passordhandterar', delar: [['Ja', 0.31, 0], ['Usikker', 0.23, 1], ['Nei', 0.46, 2]] },
    { id: 'F8', namn: 'Same passord', delar: [['Nei', 0.49, 0], ['Usikker', 0.06, 1], ['Delvis', 0.27, 2], ['Ja', 0.18, 3]] },
    { id: 'F11', namn: 'Phishing-opplæring', delar: [['Ja', 0.52, 0], ['Usikker', 0.17, 1], ['Nei', 0.31, 2]] },
    { id: 'F16', namn: 'Veit kvar filer skal lagrast', delar: [['Ja', 0.61, 0], ['Delvis', 0.21, 1], ['Usikker', 0.09, 1], ['Nei', 0.09, 2]] },
    { id: 'F19', namn: 'Antivirus/EDR aktiv', delar: [['Ja', 0.47, 0], ['Delvis', 0.12, 1], ['Usikker', 0.36, 1], ['Nei', 0.05, 2]] },
  ],
  tilsette: [
    ['OLNOR', 'Administrasjon/kontor', 'Kviknes', 1.25, 1.44, ['F9', 'F11', 'F17']],
    ['KAHAU', 'Produksjon/drift', 'Maskinsenteret', 0.75, 1.06, ['F9']],
    ['SIBER', 'Sal / Kundeservice', 'Gasta', 1.56, 1.38, ['F6', 'F8', 'F9', 'F11', 'F17', 'F19']],
    ['TOVIK', 'IT / superbrukar', 'SFHS', 0.38, 0.56, []],
    ['MAHAN', 'Produksjon/drift', 'Kviknes', 1.19, 1.25, ['F6', 'F9', 'F17']],
    ['JOLUN', 'Administrasjon/kontor', 'Daco', 0.94, 1.31, ['F6', 'F11']],
    ['ANSOL', 'Leiar', 'Maskinsenteret', 0.69, 0.81, ['F17']],
    ['ERFJE', 'Sal / Kundeservice', 'SFHS', 1.31, 1.13, ['F4', 'F9', 'F11', 'F17']],
  ],
  sitat: [
    ['Fleire korte påminningar om svindel-e-post, gjerne med døme frå kvardagen vår.', 'Administrasjon/kontor'],
    ['Ein felles stad der det står kven vi ringjer når noko skjer.', null],
    ['Passordhandterar til alle, ikkje berre til nokre få.', 'Produksjon/drift'],
  ],
  hendingar: [
    ['svar', 'Nytt svar frå <b>Maskinsenteret</b>', null, 'for 4 min sidan'],
    ['nokkel', 'Ny kode for <b>Gasta</b>. Gamle lenkjer verkar ikkje lenger.', 'Bjarte', '09:41'],
    ['flagg', 'Runde opna for <b>Tharaso</b>', 'Asbjørn', '09:12'],
    ['kalender', 'Frist endra for <b>Kviknes</b> til 24. okt.', 'Oleksandr', 'i går'],
    ['auge', 'Svar per tilsett opna for <b>Daco</b> (logga)', 'Oleksandr', 'i går'],
    ['flagg', 'Runde 2 starta for 6 kundar', 'Oleksandr', '8. okt.'],
  ],
  forslag: [
    { id: 'p1', tittel: 'Utkast: Spørjeskjema om backup på hotellet', status: 'ny', kjelde: 'Brief frå Oleksandr: «backup på hotellet»', tid: 'i dag 10:14', type: 'Nytt skjema' },
    { id: 'p2', tittel: 'Omsetjing til English: tre nye spørsmål i «Arbeidsdagen og KI»', status: 'ny', kjelde: 'Utkast 2026-11 · v2', tid: 'i dag 09:02', type: 'Omsetjing' },
    { id: 'p3', tittel: 'Forklaring av funn: MFA hos Gasta', status: 'utdatert', kjelde: 'Snapshot r2 · gasta · 14. okt.', tid: 'i går', type: 'Forklar funn' },
    { id: 'p4', tittel: 'Spørsmålsvask: B3 spør om to ting', status: 'godteke', kjelde: 'tryggleik · utkast v4', tid: '12. okt.', type: 'Spørsmålsvask' },
  ],
  seminar: {
    tittel: 'Phishing og svindel i kvardagen', dato: '12. november 2026', stad: 'Sogndal', kundar: ['Gasta', 'Daco'], pamelde: 18,
    sp: 'Kor trygg er du på å kjenne att ein svindel-e-post?', alt: ['Heilt trygg', 'Ganske trygg', 'Usikker', 'Ikkje trygg'], start: [2, 5, 4, 1],
  },
};
