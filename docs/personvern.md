# Персональные данные в kartlegging

Собрано 12.10.2026. Что собираем, где лежит, кто отвечает, что ещё сделать.

## Что считается персональными данными

| Данные | Где | Почему персональные |
| --- | --- | --- |
| Инициалы (F1) + фирма + роль + ответы, опросник по безопасности | `data/svar.jsonl` на VPS | В фирме на 6–14 человек инициалы с ролью однозначно указывают на человека |
| Ответы руководителей (блок B) | там же | Руководитель в фирме обычно один-два, опросник говорит об этом прямо |
| Инициалы и ответы 57 человек раунда 1 | `private/runde1.js` (в git), исходник `kjelder/Master_Analyse.xlsx` (не в git) | То же |
| Почта трёх сотрудников Vardahei, входы, действия в админке | `data/brukarar.json`, `data/hendingar.jsonl` | Учётки и журнал |
| Инициалы (K0) + фирма + роль + ответы, KI-опросник | `data/svar.jsonl` | С 13.10 KI-опросник тоже с инициалами, как F1. Свободный текст может выдать больше |

Не сохраняем: IP-адреса (ни в ответах, ни в журнале), прогресс в админке привязан к случайной сессии.

## Роли

Vardahei работает как MSP: опрос проводится для клиента и про сотрудников клиента. Отсюда по умолчанию **клиент — behandlingsansvarleg, Vardahei — databehandlar**. Надо проверить, что действующий databehandleravtale с каждым клиентом покрывает «kartlegging av tilsette», а не только IT-обслуживание. Если не покрывает, нужно добавить пункт.

## Где хранится

- VPS Hostinger srv2003058 (KVM 2), дата-центр **Düsseldorf, Германия** (Hostinger API, `data_center_id` 25). Данные в ЕЭЗ, передачи в третьи страны нет.
- Копии: `runde1.js` в git (локально; при push — ещё и в удалённом репозитории), бэкапы `/opt/kartlegging/data`, если их делают.

## Срок хранения

Решение Oleksandr: удалять по расписанию не нужно. По GDPR (ст. 5(1)(e)) совсем без срока нельзя, но достаточно привязать срок к критерию, который на практике почти ничего не ограничивает:

> Svara blir lagra så lenge kundeforholdet varer, slik at vi kan samanlikne frå runde til runde. Når avtalen med kunden sluttar, slettar vi svara frå den kunden innan tre månader.

На удаление по клиенту нужна команда (сейчас её нет): `node server.js --slett-kunde <slug>`, в бэклог.

## Запись в реестр обработки (протокол, ст. 30)

Для вставки в протокол Vardahei как есть:

> **Kartlegging av IT-tryggleik og KI-bruk hos kundar**
> - **Rolle:** Vardahei IT er databehandlar for kunden (behandlingsansvarleg).
> - **Føremål:** Finne kva IT-tryggleiken i kvardagen manglar hos kunden, sjå utviklinga frå runde til runde og føreslå tiltak. KI-skjemaet skal finne arbeidsoppgåver der KI kan hjelpe.
> - **Kven det gjeld:** Tilsette hos kundane.
> - **Opplysningar:** Initialar (2 første og 3 siste bokstavar), bedrift, rolle og svar på 22 spørsmål om IT-vanar. Leiarar svarar i tillegg på spørsmål om rutinar i bedrifta. KI-skjemaet: initialar, bedrift, rolle og svar om arbeidsoppgåver og KI-bruk. Ingen IP-adresser.
> - **Kven ser opplysningane:** Tre tilsette i Vardahei IT med eiga innlogging. Bedrifta får eit samla bilete utan initialar.
> - **Lagring:** Eigen server hos Hostinger i Düsseldorf (EU). Kryptert overføring (HTTPS), passord lagra som scrypt-hash, datamappa er berre lesbar for tenesta.
> - **Sletting:** Så lenge kundeforholdet varer. Innan tre månader etter at avtalen med kunden sluttar.
> - **Overføring til tredjeland:** Nei.

## Что не так в текстах для сотрудников

Статья 13 требует честно сказать, кто видит данные. Сейчас:

| Где | Сейчас | Проблема |
| --- | --- | --- |
| Опросник, вводный экран (`fakta2`) | «Vi spør om initialane dine, slik at vi kan sjå endringa frå førre runde. Ingen får karakterar.» | Дашборд считает каждому snittscore и зону, по сути оценку |
| Текст рассылки (`admin.html`) | «Du skriv inn initialane dine først, elles er det ingen namn. Svara blir brukte samla for bedrifta.» | Vardahei видит ответы по каждому человеку |

Исправлено 12.10.2026: «Svara per person ser berre Vardahei IT. Bedrifta får eit samla bilete utan initialar.» (опросник) и «Svara per person ser berre Vardahei IT, og bedrifta får eit samla bilete.» (рассылка), en — так же.

## Что ещё сделать

1. Проверить databehandleravtale с шестью клиентами (Asbjørn).
2. Добавить запись выше в протокол.
3. ~~Поправить два текста для сотрудников~~ — сделано 12.10.2026.
4. Команда удаления по клиенту (бэклог P2).
5. ~~Решить, оставлять ли `runde1.js` в git~~ — оставляем, репозиторий приватный (O, 12.10). При создании репозитория: доступ только у троих.
