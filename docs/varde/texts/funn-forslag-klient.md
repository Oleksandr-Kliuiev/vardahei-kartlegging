# «Kva vi føreslår» для отчёта клиенту — черновик на утверждение

Черновик оркестратора, 16.10.2026. **Утверждён Oleksandr 16.10.2026 «как есть» и применён в тот же день: версии `@2` всех 25 правил (способ — сервис редактора «Funn» командой оператора, см. `evidence/stage-2/2a-evidence.md`).**

**Зачем.** Отчёт клиенту (5.1) показывает в блоке «Kva vi føreslår» поле `action_text` правил FUNN. Сейчас там внутренние подсказки для Vardahei из старого дашборда:
- бренды — Teams, Entra, Bitwarden, OneDrive, Win + L;
- сокращения для своих — «Sjekk … for kunden», «Pilot med …»;
- отсылки к «sitata under» и «fritekstane», которых в отчёте нет.

Ниже — версии для клиента:
- обращение к компании («de», «dykk»), предложение от Vardahei IT;
- 1–2 фразы, без брендов (оборудование называется по сути: «passordhandterar», «tofaktorinnlogging», «skylagring»).

Если хочешь оставить конкретный продукт, впиши его сам.

**Как применить после утверждения** (один из двух способов, не оба):
1. «Funn» в админке: правка «Kva vi gjer» → «Lagre som versjon 2» по каждому правилу.
2. Новые версии `@2` в `varde/config/seed/findings/*.json` и `seed` на проде (делаю я одной командой). Этот способ нельзя, если какое-то из этих правил уже правилось в «Funn»: тогда `@2` в базе уже есть с другим текстом, и seed остановится.

**Когда.** До закрытия раунда 2. Отчёт берёт версию правила, действующую на момент публикации (release); закрытые раунды не меняются.

## IT-tryggleik (15 правил канала aggregate)

| Правило | Сейчас (nn) | Предлагаю (nn) | Предлагаю (en) |
| --- | --- | --- | --- |
| f12 — не знают, куда сообщать о подозрительной почте | Éi side på veggen og i Teams: kven du ringjer, kva du gjer med e-posten. Leiaren seier det høgt på neste møte. | Lag ei kort oversikt over kven de ringjer og kva de gjer med ein mistenkjeleg e-post, og heng ho opp der alle ser ho. Gå gjennom ho på neste personalmøte. | Make a short overview of whom to call and what to do with a suspicious email, and put it where everyone can see it. Go through it at the next staff meeting. |
| f5 — нет рутины остановить инцидент | Kort rutine: kople frå nettet, ring Vardahei, la PC-en stå på. Gå gjennom henne på eit møte. | Ein kort rutine for når noko er gale: kople PC-en frå nettet, ring Vardahei IT og la maskina stå på. Vi går gjennom rutinen saman med dykk. | A short routine for when something is wrong: disconnect the PC from the network, call Vardahei IT and leave the computer on. We go through it with you. |
| f14 — нет MFA или не знают | Sjekk i Entra kven som manglar MFA, og slå det på for alle. Vis korleis godkjenninga ser ut. | Vi sjekkar kven som manglar tofaktorinnlogging, slår det på for alle og viser korleis godkjenninga ser ut. | We check who lacks two-factor sign-in, turn it on for everyone and show what the approval looks like. |
| f8 — один пароль на много сервисов | Passordhandterar og nytt, unikt passord på jobb-e-posten først. | Ein passordhandterar gjer det enkelt å ha eit unikt passord overalt. Start med eit nytt, unikt passord på jobb-e-posten. | A password manager makes it easy to have a unique password everywhere. Start with a new, unique password for work email. |
| f9 — нет менеджера паролей | Pilot med Bitwarden for 2–3 personar, så resten. | Prøv ut ein passordhandterar med to–tre personar først, og ta han i bruk for alle når det fungerer. | Try a password manager with two or three people first, and roll it out to everyone once it works. |
| f6 — нет рутины восстановления | Beredskapsplan på éi side saman med leiaren: kven gjer kva, i kva rekkjefølgje. | Ein beredskapsplan på éi side, laga saman med leiinga: kven gjer kva, og i kva rekkjefølgje. | A one-page contingency plan made with the management: who does what, and in which order. |
| f11 — не обучены распознавать фишинг | Kort gjennomgang på eit møte, så ein test med falske e-postar nokre veker etter. | Ein kort gjennomgang på eit møte om korleis ein kjenner att svindel-e-post, og ein øvingstest med falske e-postar nokre veker etter. | A short session at a meeting on how to recognise scam emails, followed by a practice test with fake emails a few weeks later. |
| f16 — не знают, где хранить для бэкапа | Vis kvar felles filer skal liggje (OneDrive og Teams), og flytt skrivebord og Dokument dit. | Vi viser kvar felles filer skal liggje, og flyttar skrivebordet og Dokument-mappa til lagring med backup. | We show where shared files belong and move the desktop and the Documents folder to storage with backup. |
| f17 — хранят важное локально | Flytt skrivebord og Dokument til OneDrive, så blir det backup utan at folk må tenkje på det. | Flytt skrivebordet og Dokument-mappa til skylagringa de alt har, så får filene backup utan at nokon må hugse det. | Move the desktop and the Documents folder to the cloud storage you already have, so files are backed up without anyone having to remember. |
| f18 — не уверены в обновлениях | Sjekk oppdateringsstatus for kunden, og fortel folk at det skjer automatisk. | Vi sjekkar at oppdateringane går som dei skal, og fortel dei tilsette at dette skjer automatisk. | We check that updates run as they should and tell employees that this happens automatically. |
| f19 — не знают про антивирус/EDR | Vis ikonet og forklar kva det gjer. Tryggleik folk ikkje veit om, gir ikkje tryggleikskjensle. | Vis dei tilsette korleis dei ser at vernet er på, og kva det gjer. Tryggleik folk ikkje veit om, gir ikkje tryggleikskjensle. | Show employees how to see that protection is on and what it does. Protection that people do not know about does not make them feel safe. |
| f10 — редко блокируют ПК | Automatisk lås etter fem minutt, og ei påminning om Win + L. | Automatisk skjermlås etter fem minutt, og ei påminning om snarvegen for å låse PC-en når ein går frå han. | Automatic screen lock after five minutes, and a reminder of the shortcut to lock the PC when leaving it. |
| f7 — сами считают пароли слабыми | Dei er klare for hjelp. Passordhandterar og ein kort gjennomgang. | Dei tilsette er klare for hjelp: ein passordhandterar og ein kort gjennomgang av korleis han blir brukt. | Employees are ready for help: a password manager and a short walkthrough of how to use it. |
| f3 — нет фокуса на ИБ | Leiaren tek det opp på eit møte, og det blir fast tema ein gong i kvartalet. | La leiinga ta opp IT-tryggleik på eit møte, og gjer det til eit fast tema ein gong i kvartalet. | Let the management raise IT security at a meeting and make it a regular topic once a quarter. |
| f13 — подозревают, что кликнули на мошенничество | Sjekk innloggingslogg for kontoane, og køyr phishing-trening. | Vi går gjennom innloggingane på kontoane i bedrifta for teikn på misbruk, og set i gang øving i å kjenne att svindel. | We review sign-ins on the company's accounts for signs of misuse and start training in recognising scams. |

## KI i kvardagen (10 правил канала aggregate)

| Правило | Сейчас (nn) | Предлагаю (nn) | Предлагаю (en) |
| --- | --- | --- | --- |
| k8 — ИИ лично, но не на работе | Dei er klare. Gi dei eit godkjent KI-verktøy med jobbkonto og enkle reglar, så tek dei det i bruk. | Dei tilsette er klare. Gi dei eit godkjent KI-verktøy med jobbkonto og nokre enkle reglar, så kjem bruken i gang. | Employees are ready. Give them an approved AI tool with a work account and a few simple rules, and they will start using it. |
| k6 — ищут информацию каждый день | Ein assistent som søkjer i eigne dokument, e-post og system. | Ein KI-assistent som søkjer i bedrifta sine eigne dokument, e-postar og system, kan spare tid kvar dag. | An AI assistant that searches the company's own documents, emails and systems can save time every day. |
| k9 — не начали с ИИ | Praktisk demo på arbeidsplassen med deira eigne oppgåver, ikkje kurs. | Ein praktisk demonstrasjon på arbeidsplassen med dykkar eigne oppgåver, i staden for eit kurs. | A practical demonstration at your workplace using your own tasks, instead of a course. |
| k13_lov — не уверены, можно ли | KI-reglar på éi side. Vi kan lage utkast saman med leiaren. | KI-reglar på éi side gjer det klart kva som er lov. Vi kan lage eit utkast saman med leiinga. | One page of AI rules makes it clear what is allowed. We can draft it together with the management. |
| k19 — рабочие данные в личный ИИ | Avklar kva verktøy som er godkjende, og gi tilgang med jobbkonto. Forbod utan alternativ verkar sjeldan. | Avklar kva KI-verktøy som er godkjende, og gi tilgang med jobbkonto. Forbod utan eit alternativ verkar sjeldan. | Clarify which AI tools are approved and provide access with work accounts. A ban without an alternative rarely works. |
| k21 — вставили бы договор в личный ИИ | Kort opplæring om kva som kan delast med KI, og eit godkjent verktøy å bruke i staden. | Kort opplæring i kva som kan delast med KI, og eit godkjent verktøy å bruke i staden. | Short training on what can be shared with AI, and an approved tool to use instead. |
| k13_data — боятся поделиться лишним | Enkle reglar for kva som kan delast, og eit godkjent verktøy med jobbkonto. | Enkle reglar for kva som kan delast og eit godkjent verktøy med jobbkonto gjer det tryggare å bruke KI. | Simple rules on what can be shared and an approved tool with a work account make AI safer to use. |
| k14 — скептичны | Start med dei nysgjerrige. Vis konkret kva som blir lettare, og kva som ikkje endrar seg. | Start med dei som er nysgjerrige. Vis konkret kva som blir lettare, og kva som ikkje endrar seg. | Start with those who are curious. Show concretely what becomes easier and what stays the same. |
| routine_hours — часы на рутину | Start med den vanlegaste oppgåva. Sjå sitata under for kva folk faktisk gjer. | Start med den vanlegaste rutineoppgåva. Vi kan sjå på korleis ho blir gjort i dag, og kva som kan automatiserast. | Start with the most common routine task. We can look at how it is done today and what can be automated. |
| heaviest_task — самая тяжёлая задача | Ein konkret kandidat for automatisering. Sjå fritekstane for korleis oppgåva faktisk går føre seg. | Ein konkret kandidat for automatisering. Vi kan gå gjennom oppgåva saman med dei som gjer henne, og finne ut kva som kan forenklast. | A concrete candidate for automation. We can go through the task with those who do it and find out what can be simplified. |

Тексты самих выводов (поле «Funnet») не трогаю: они уже нейтральные.
