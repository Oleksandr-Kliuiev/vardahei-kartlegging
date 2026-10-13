# Kartlegging hos kundane

To spørjeskjema (IT-sikkerheit i kvardagen og Arbeidsdagen og KI), eit dashboard med resultat og eit adminpanel som viser framdrifta i sanntid. Éin liten Node-server utan avhengnader.

## Sider

| Adresse | Kven | Kva |
| --- | --- | --- |
| `/?s=<skjema>&k=<kunde>&t=<kode>` | Tilsette hos kunden | Sjølve skjemaet. Utan rett kode tek serveren ikkje imot svar. |
| `/admin` | Vardahei | Framdrift: svarprosent, kven som svarar no, kvar folk stoppar, opne/stenge, send ut |
| `/dashboard` | Vardahei | Resultat: funn, svar per spørsmål, leiarsvar, samanlikning med runde 1 |
| `/logg-inn` | Vardahei | Innlogging med e-post og passord |
| `/plakat?k=<kunde>&s=<skjema>` | Vardahei | A4-plakat med QR-kode til utskrift |

## Kontoar

Tre kontoar ligg klare i `data/brukarar.json` (passorda er lagra som scrypt-hash, ikkje i klartekst):
oleksandr@vardahei.no, asbjorn@vardahei.no og bjarte@vardahei.no.

Alle startar med det felles passordet de avtalte, og må velje sitt eige ved første innlogging.
Ny konto eller nullstilt passord:

```bash
node server.js --brukar namn@vardahei.no
```

Innlogging: 8 timars økt (cookie, HttpOnly, Secure bak HTTPS). Etter 5 feil forsøk på same konto, eller 10 frå same IP, blir det sperra i eit kvarter.

## Lenkjer til kundane

Kvar kunde har sin eigen kode i lenkja (`&t=...`). Koden seier kva bedrift svaret høyrer til.
Kodane blir laga første gong serveren startar (`data/tilgang.json`). Lenkjer, ferdig tekst og plakat finn du under «Send ut» i adminpanelet, eller:

```bash
node server.js --lenkjer
```

«Ny kode» i adminpanelet gjer at gamle lenkjer sluttar å verke. «Stengd» eller passert frist gjer at skjemaet seier at kartlegginga er avslutta.

Nye kundar: legg dei til i `KUNDAR` i `public/sporsmal.js` og start serveren på nytt.

## Køyre på VPS-en

```bash
cd /opt/kartlegging
PORT=3070 BASE_URL=https://kartlegging.vardahei.tech node server.js
```

Serveren lyttar berre på 127.0.0.1. Nginx framfor, med HTTPS (certbot):

```nginx
server {
  server_name kartlegging.vardahei.tech;
  location / {
    proxy_pass http://127.0.0.1:3070;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  # Sanntid til adminpanelet
  location /api/admin/straum {
    proxy_pass http://127.0.0.1:3070;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 1h;
  }
}
```

Systemd: `ExecStart=/usr/bin/node /opt/kartlegging/server.js`, `Environment=BASE_URL=https://kartlegging.vardahei.tech`, `Restart=always`.

## Filer

- `public/index.html`, `public/sporsmal.js`: skjemaet og spørsmålsbanken (rediger spørsmål og råd her)
- `private/dashboard.html`, `private/admin.html`: dashboard og adminpanel
- `private/runde1.js`: tal frå Forms-runden, for samanlikning
- `lib/qrcode.js`: QR-generator (MIT, Kazuhiko Arase)
- `data/`: alt som blir lagra. Ta backup av denne mappa.

## Tryggleiksskjemaet og runde 1

Spørsmåla i tryggleiksskjemaet (`F1`–`F22`) er dei same som i Forms-runden i januar 2026, i same rekkjefølgje og med same svarval. Alle 57 svara frå runde 1 ligg i `private/runde1.js` (henta frå Master_Analyse.xlsx), så dashbordet reknar runde 1 og runde 2 på same måte.

Soner, same modell som Master_Analyse.xlsx:
- Kvart svarval har ein `farge` i `sporsmal.js`: grøn 0, gul 1, oransje 2, raud 3 poeng. Fargane er dei same som i reknearket.
- Snittscore = snittet av poenga (0–3). Kritisk andel = delen av svara som er oransje eller raude.
- Éin tilsett: grøn under 1,0, gul frå 1,0 (som i reknearket). Oransje frå 2,0 og raud frå 2,5 er vårt forslag; ingen i runde 1 kom over 1,63.
- Spørsmål, rolle og bedrift: grøn til 0,5, gul til 1,5, oransje til 2,5, raud over (formelen i arket Tilsett_visning).
- Grensene ligg i `SONER` nedst i `sporsmal.js`.

Tre små skilnader frå reknearket: «Skjelden» på PC-lås tel som oransje (reknearket hoppa over det), og fritekstsvar som «nei» tel ikkje. Det flyttar tre personar i runde 1 éi sone.

## Eksport til Master_Analyse

«Til Master_Analyse (CSV)» i dashbordet (eller `/api/analyse.csv`, `?s=tryggleik` eller `?s=ki` for eitt skjema) gir éi rad per person og spørsmål for begge skjema. Dei seks første kolonnene er som arket `PQ_Detalj_Risiko`: Initialar, Kunde, Spørsmål, Svar, Risiko, Rang. Risiko og rang (Grøn 1 … Raud 4) kjem frå fargane i `sporsmal.js` og er berre fylte ut for spørsmål med farge. Etter dei kjem Rolle, Skjema, Del, Spørsmål-ID, Svar-ID, Dato og Svar-nr. Fila er UTF-8 med BOM og semikolon, så ho opnar rett i Excel og i Power Query. Kvar nedlasting blir loggført med e-post i `hendingar.jsonl` og i loggen i adminpanelet.

## Personvern

- Tryggleiksskjemaet spør om initialar (`F1`), som i Forms-runden, for å kunne sjå svar per tilsett og endring frå førre runde. `private/runde1.js` har initialane frå runde 1 og ligg berre bak innlogginga. Initialar er personopplysningar: ta det med i oversikta over behandlingar, og slett svara når kartlegginga er ferdig og rapportert.
- KI-skjemaet spør òg om initialar (`K0`), i same format som `F1` (avgjerd 13.10). Svara per person ser berre Vardahei IT; bedrifta får eit samla bilete utan initialar. Skjemaet og teksten under «Send ut» seier det same.
- Ingen IP-adresser blir lagra med svara.
- Framdrifta i adminpanelet er anonym: berre kva spørsmål ei økt er på, aldri svara.
- Dashbordet viser ikkje rolle når ei rolle har færre enn 3 svar (`minGruppe` i `sporsmal.js`).
- Leiardelen: det er lett å sjå kven som har svart, og skjemaet seier det rett ut.
