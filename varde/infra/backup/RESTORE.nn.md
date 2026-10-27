# Gjenoppretting av Varde frå tryggingskopi

For Oleksandr, Asbjørn og Bjarte. Grunnlag: ADR-016 og IMPROVEMENT-PLAN 0.1. Denne fila ligg òg i kvar kopi, i `kit.tar.gz`.

## Kva som finst

Kvar natt tek Varde ein kopi av databasen og legg han i SharePoint-området **VardeBackup**:

- `nightly/<tid>/` – éin mappe per natt. Tida er UTC, til dømes `20261028T021503Z`. Mappa inneheld:
  - `varde.dump.age` – sjølve databasen, kryptert;
  - `canary.age` – ei lita fil til å prøve nøkkelen med;
  - `kit.tar.gz` – skripta og denne rettleiinga;
  - `meta.json` – kva versjon kopien er frå og kor mange rader kvar tabell har.

  Ei mappe utan `meta.json` vart ikkje ferdig. Bruk ho ikkje.
- `ledger/` – lista over det som er sletta på førespurnad. Ho vert lasta opp kvart kvarter når ho har endra seg. Den nyaste fila må alltid vere med når du gjenopprettar. Elles kan svar som er sletta etter siste nattkopi, kome attende.
- `images/` – programmet Varde, éi fil per versjon.

Kopiane er krypterte med age til tre nøklar: Oleksandr, Asbjørn og Bjarte. Kvar av dykk har sin private nøkkel, `varde-age.key`, på ein kryptert disk. Utan ein av dei tre nøklane kan ingen lese kopiane, heller ikkje Vardahei.

Det finst ikkje noko mål for kor fort ei gjenoppretting skal gå (avgjerd 13.10). Kopien er frå sist natt, så det som kom inn etter det, er tapt.

## Du treng

- ein Mac eller ei Linux-maskin med Docker;
- din eigen `varde-age.key`;
- lesetilgang til SharePoint-området VardeBackup.

## 1. Hent filene

Opne VardeBackup i nettlesaren og last ned:
- den nyaste mappa under `nightly/` som har `meta.json`;
- heile `ledger/`-mappa;
- for gjenoppretting (avsnitt 4 og 5): fila `images/varde-api-<image>.tar.gz`. `<image>` står i `meta.json`.

Pakk ut kit-fila i mappa du lasta ned: `tar -xzf kit.tar.gz -C kit` (lag mappa `kit` først).

## 2. Lag verktøyet

```bash
docker build -t varde-backup:pg17-1 kit
```

## 3. Prøv kopien (endrar ingenting)

```bash
docker run --rm -v "$PWD/<nattmappa>:/in:ro" -v ~/varde-age.key:/key:ro -v "$PWD/ledger:/ledger:ro" \
  -v "$PWD/kit:/kit:ro" varde-backup:pg17-1 /kit/restore-check.sh /in /key /ledger
```

Kvar linje som byrjar med `ok`, er ein kontroll som gjekk bra. Siste linje skal vere `restore check passed`.

Viss du får `FAIL`:
- `does not open canary` – nøkkelen din er ikkje ein av dei tre. Kontroller at du brukar rett fil.
- `sha256 differs` eller `row counts differ` – kopien er skadd eller ufullstendig. Prøv natta før, og sei frå til Oleksandr.

## 4. Gjenopprett til ein ny server

Dette steget gjer Oleksandr eller den som driv serveren (hosting-operatøren), ikkje ein av dei andre åleine. Nye løyndomar vert laga på nytt (avgjerd 13.10). Ein ny klientløyndom i Entra lagar administratoren av tenanten.

1. Set opp serveren etter `infra/README.md` §1–§3, men utan migreringar: `bootstrap.sh` lagar rollene og ein tom database.
2. Stopp appen og tryggingskopieringa, viss dei køyrer:

   ```bash
   docker compose -f /opt/varde/compose.yml stop app
   systemctl stop varde-backup.timer varde-ledger.timer
   ```

   Elles kan nattkopien ta ein kopi av ein halvferdig database.
3. Køyr gjenopprettinga som superbrukar. Det skjer gjennom `docker exec` i PostgreSQL-containeren, over sokkelen i containeren. På den delte serveren er det den einaste vegen ein superbrukar slepp inn i `varde` (ADR-016). `atlas-db-1` er namnet på containeren; på ein ny server er det namnet på den nye.

   ```bash
   docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -e VARDE_RESTORE_CONTAINER=atlas-db-1 \
     -v "$PWD/<nattmappa>:/in:ro" -v ~/varde-age.key:/key:ro -v "$PWD/ledger:/ledger:ro" -v "$PWD/kit:/kit:ro" \
     varde-backup:pg17-1 /kit/restore.sh /in /key /ledger
   ```

   Skriptet nektar å skrive over ein database som allereie har data. Alt skjer i éin transaksjon: viss noko går gale, er databasen som før, og du kan prøve på nytt. Den private nøkkelen er berre på serveren medan kommandoen køyrer. Han vert ikkje kopiert dit.
4. Last inn programmet frå kopien. Versjonen står i `meta.json` som `image`:
   `gunzip -c images/varde-api-<image>.tar.gz | docker load`. Skriv versjonen i `/opt/varde/.env` (`VARDE_SHA=<image>`) og i `/opt/varde/VERSION`.
5. Start appen: `docker compose -f /opt/varde/compose.yml up -d app`.
6. Fjern det som er sletta, og det som har gått ut på tid:

   ```bash
   docker exec varde-app node dist/cli.js ledger apply-db
   docker exec varde-app node dist/cli.js retention run
   ```

7. Kontroller: `curl -s https://varde.vardahei.tech/health` skal vise `"status":"ok"` og versjonen frå `meta.json`. Logg inn i admin og sjå at rundane og svartala stemmer.
8. Start tryggingskopieringa att: `systemctl start varde-backup.timer varde-ledger.timer`.

## 5. Gjenopprett på same server (til dømes etter ei mislukka migrering)

Vanlegvis er det nok å rulle attende utan kopien: `infra/ops/rollback.sh`, sjå `infra/README.md` («Откат деплоя»). Kopien er for tilfelle der data er øydelagde.

1. Stopp appen og tidtakarane, som i steg 2 i avsnitt 4.
2. Gje den gamle databasen eit nytt namn, så han kan granskast etterpå: `ALTER DATABASE varde RENAME TO varde_old_<dato>;`
3. Lag ein ny, tom database:

   ```sql
   CREATE DATABASE varde OWNER varde_app;
   REVOKE CONNECT ON DATABASE varde FROM PUBLIC;
   GRANT CONNECT ON DATABASE varde TO varde_app, varde_backup;
   ```

   Køyr så `infra/sql/varde-db.sql` i den nye databasen.
4. Gjer steg 3–8 i avsnitt 4.
5. Slett `varde_old_<dato>` når alt er kontrollert, og seinast etter 7 dagar. Han inneheld personopplysningar.
