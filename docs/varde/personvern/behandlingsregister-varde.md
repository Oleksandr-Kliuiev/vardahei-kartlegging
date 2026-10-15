# Behandlingsprotokoll: KI-assistenten i Varde

Utkast 16.10.2026 (sjekkpunkt 0d, oppgåve 0.13). Ikkje godkjent. Gjeld frå den dagen KI-assistenten i Varde blir teken i bruk, og tidlegast når porten G0 er open. Opplysningane om Anthropic kjem frå sjekklista `docs/varde/evidence/stage-0/0.13-anthropic-checklist.md` og er ikkje stadfeste før Oleksandr har godkjent kvar rad der.

Til protokollen til Vardahei, som eiga oppføring ved sida av «Kartlegging av IT-tryggleik og KI-bruk hos kundar»:

> **KI-assistent i Varde: utkast og forklaringar for Vardahei IT**
>
> - **Rolle:** Kunden er behandlingsansvarleg. Vardahei IT er databehandlar for kunden. Anthropic, som leverer KI-modellen, er underdatabehandlar for Vardahei IT.
> - **Føremål:** Hjelpe dei tre tilsette i Vardahei IT med utkast til spørjeundersøkingar, forklaringar av samla resultat og førebuing av seminar. Eit menneske les og godkjenner alt modellen føreslår. Modellen publiserer og sender ingenting sjølv.
> - **Kven det gjeld:** Tilsette hos kundane som har svart på kartleggingane.
> - **Opplysningar modellen får:** Samla tal og funn frå Varde for grupper på minst tre personar. Utdrag av fritekstsvar som ein tilsett i Vardahei IT har lese og godkjent, utan kunde og rolle i same utdrag. Stilrettleiing, ordliste og spørsmålsbank.
> - **Opplysningar modellen aldri får:** Initialar, respondentnøkkel, svar frå éin person og svara frå leiarane hos ein kunde.
> - **Mottakar:** Anthropic gjennom Claude API. Kontraktspart for kundar i EØS er Anthropic Ireland, Limited. Modellen køyrer på serverane til Anthropic, og data blir lagra i USA.
> - **Lagring hos leverandøren:** Det som blir sendt til modellen, og svaret frå modellen, blir sletta innan 30 dagar. Innhald som tryggleikssystema til Anthropic flaggar, kan bli lagra i inntil 2 år. Anthropic trenar ikkje modellane sine på dette innhaldet.
> - **Overføring til tredjeland:** Ja, til USA. Grunnlaget er EU sine standardavtalar (SCC) i databehandlaravtalen med Anthropic.
> - **Tiltak:** Modellen får berre det personvernmodulen i Varde slepper ut: samla tal for grupper på minst tre og ingen svar per person. Varde avviser alt som inneheld initialar, respondentnøkkel eller svar frå éin person før noko blir sendt. Fritekst blir aldri sendt automatisk; berre utdrag som eit menneske har godkjent. Alt frå modellen er eit forslag som eit menneske må godkjenne. API-nøkkelen ligg berre på serveren til Varde. Varde har eige arbeidsområde hos Anthropic med utgiftsgrense og varsel. Berre dei tre tilsette i Vardahei IT har tilgang. All trafikk er kryptert (HTTPS).
> - **Sletting hos Vardahei:** Forslag frå modellen blir sletta i Varde etter 12 månader.

## Пометки для Oleksandr

- Черновик, не утверждён. Каждый факт об Anthropic — из чек-листа 0.13 (`docs/varde/evidence/stage-0/0.13-anthropic-checklist.md`, ссылки проверены 16.10.2026); пока там `pending`, запись не вносится в протокол.
- «Overføring til tredjeland: Ja» — потому что `inference_geo` бывает только `global` или `us`, варианта ЕС нет, а хранение at rest — в США (строка `location`). Основание — SCC модули 2/3 в DPA Anthropic (строка `dpa`); EU–US DPF в DPA не упоминается. В `docs/personvern.md` сейчас «Overføring til tredjeland: Nei» — это про kartlegging без ИИ; для Varde с ассистентом нужна правка там же (по 0d.md это делает Oleksandr).
- «Innan 30 dagar» — Privacy Center Anthropic; на docs-странице есть расходящаяся фраза «not retained by default» (строка `retention`). Если в Console будет другая настройка — поправить строку «Lagring hos leverandøren».
- ZDR не заложена: по ADR-011 модель видит только агрегаты через `privacy` (k = 3, ADR-021) и выдержки, проверенные человеком. Если Oleksandr решит запросить ZDR (строка `zdr`), строка «Lagring hos leverandøren» меняется на «ingen lagring utover det lova krev; flagga innhald inntil 2 år».
- Роль Anthropic — underdatabehandlar: databehandleravtalar с клиентами должны разрешать Vardahei привлекать субподрядчиков (GDPR ст. 28(2)); проверить вместе с Asbjørn (пункт 1 раздела «Что ещё сделать» в `docs/personvern.md`).
- «Berre dei tre tilsette i Vardahei IT har tilgang» — подтвердить строкой `access` (роли в Console). «Forslag … etter 12 månader» — класс `proposal` в `varde/config/retention.json`.
- Уведомление респондентам v2 (`notice.common.ai_processing`, 0.18) уже говорит, что модель получает только сводные цифры; передачу в США оно не называет — решить, нужна ли правка текста уведомления.
