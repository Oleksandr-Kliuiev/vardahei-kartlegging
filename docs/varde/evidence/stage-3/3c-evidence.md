# Checkpoint 3c — раунды семинара и «до/после»: 3.8, 3.9 и сценарий приёмки этапа 3 (16.10.2026)

Ветка `varde/3c` от `main` 4cca51e (3a и 3b в проде). Ворота G1 для этапа 3 сняты решением Oleksandr 16.10. Кодер — Claude Opus 5.5. Push, merge, выкатка и строка `invariants:3c` в `.github/workflows/varde.yml` — за оркестратором.

## Коммиты

| Задача | Коммит | Что |
| --- | --- | --- |
| 3.8 | `f03ba64` | Миграция `20261016160000_seminar_rounds` (down.sql): триггер `seminar_round_before_after_type` («Før» — `regular`, «Etter» — `post_seminar`), частичный уникальный индекс `seminar_round_after_once`; `seminars/seminar-rounds.service.ts` и `.controller.ts` (карточка, привязки, AuditLog); мастер запуска (`POST /api/admin/rounds/launch` с `seminar`) создаёт `post_seminar` и привязывает его в той же транзакции; карточка «Rundar» в админке, мастер с клиентами семинара; ссылка в дашборд `?round=`; метка «Etter seminar» на «Kundar og rundar»; тесты |
| 3.9 | `7a3172b` | `privacy/cohort.ts` (`clientGroup`; туда же без изменений перенесён `cohortCells`), `dashboard/before-after-view.ts`, `dashboard/round-pair.ts` (общие помощники со сравнением с раундом 1), `GET /api/admin/seminars/:id/before-after`; вкладка «Før og etter» по эталону; тесты |
| закрытие | `e6a8638` | `run-3c.sh` и `invariants:3c`; e2e «весь семинар» (`apps/admin/e2e/seminar-day.spec.ts`, фикстура «Før» в `e2e/server.cjs`); правки формулировок карточки по скриншотам; строки REVIEW-CHECKLIST и AI_CONTEXT_MAP; этот evidence, скриншоты |
| CI (оркестратор) | `8ea2f03` | `pnpm invariants:3c` в job `integration` |
| решение 16.10 | `6f318b5` | «Предыдущий раунд» шаблона — только `regular` или `external_import` (`PREVIOUS_TYPES`): `DashboardContext.previous()` и `ReportService.previous()`; тест `reports/previous-round.test.ts`, блок в `run-3c.sh` (решение 13) |
| приёмка, minor | `3d71d19` | Два семинара одновременно привязывают один «Etter»: оба проходят проверку, вторая запись упирается в уникальный индекс `seminar_round_after_once` — теперь 409 «Undersøkinga høyrer alt til eit anna seminar.» (P2002), а не 503; тест держит первую привязку незакоммиченной, пока идёт вторая; без перевода P2002 тест падает (503) |
| приёмка, evidence | `d76e0a5` | Решение 2: путь восстановления скрытого клиента через разницу `round_client` и `all_clients` в дашборде админа, задача в бэклог privacy |

## Что сделано

**3.8 Раунды до, во время, после.**
- У семинара три связи: `round_before_id` («Før»), `round_live_id` («Live», из 3b), `round_after_id` («Etter»). Колонки были с 3a; 3c добавляет проверки и интерфейс.
- «Før» — обычный раунд (`type = regular`), открытый, закрытый или архивный (не черновик), хотя бы с одним клиентом семинара. Один раунд может быть «Før» нескольких семинаров (текущий раунд 2 — для всех семинаров осени).
- «Etter» — только `post_seminar`, один семинар на раунд (индекс). Два пути: мастер запуска на вкладке («Start undersøking etter seminaret» — тот же `LaunchForm`, что на «Kundar og rundar»: версия, клиенты семинара отмечены, сроки, «Opne med ein gong», коды по клиентам, тексты приглашений и плакаты); или привязка готового `post_seminar` из списка. Мастер с `seminar` под блокировкой строки семинара проверяет: у семинара ещё нет «Etter» (иначе 409), все выбранные клиенты — с семинара, версия не для live; раунд, клиенты, коды и привязка — одна транзакция.
- Отказы на нюношке, ничего не меняют и не пишут в журнал: «Vel ei vanleg undersøking hos kundane som «Før».», «Vel ei undersøking etter seminaret som «Etter», eller start ei ny.», «Undersøkinga er ikkje opna enno. …», «Ingen av kundane på seminaret er med i denne undersøkinga.», «Seminaret har ingen kundar. …», «Undersøkinga høyrer alt til eit anna seminar.» (409). БД отказывает так же без API (триггер, индекс). Live-раунд и технический клиент нигде не предлагаются и не принимаются.
- Каждая смена привязки — AuditLog `seminars.rounds.before` / `seminars.rounds.after`, `target seminar:<id>`, `details {round, previous}`; запуск «Etter» мастером — ещё `rounds.launch` и `launched: true`. Повтор той же привязки — без записи.
- Карточка «Rundar» (эталон `semKropp`, «Oppfølging»): три шага «Før seminaret / Under seminaret / Etter seminaret» с иконкой, названием, версией шаблона, состоянием (Ikkje opna / Open / Avslutta / Arkivert; у live — Ikkje laga / Ikkje starta / Ope no / I gang / Ferdig и «N av M spørsmål viste»), сроком открытого раунда («Open til 1. juni», как «Open til 26. nov.» в эталоне; месяцы написаны по-нюношкски вручную — у браузера нет `nn-NO` в Intl), ответами клиентов семинара («7 svar av 18 · Gasta 4 av 12 · Daco 3 av 6») из существующего прогресса раунда и ссылками «Sjå i dashbordet» (новое: `/admin/dashboard?round=<id>` открывает дашборд на этом раунде) и «Sjå under «Kundar og rundar»»; «Opne Live» переключает вкладку. Если в раунде есть клиенты не с семинара — «Runden har òg N kundar som ikkje er på seminaret.» без их имён и чисел.

**3.9 «Før og etter».**
- Вкладка по эталону `semTab === 'etter'`: слева (s7) — сравнение, справа (s5) — «Rundar», ниже (s12) — таблица «Per kunde».
- Наверху всегда, и до выбора раундов, — блок «Les dette før du les tala» с четырьмя оговорками (ниже). Затем фильтр «Alle / клиент», легенда «Før seminaret: 7 svar (publiserte tal). Etter: 6 svar (levande tal).», строка по всем вопросам с баллами («Alle spørsmål med poeng: snittscore 0,86 → 0,17 (−0,69, betre) · Kritisk andel 36 % → 0 % (−36 poeng, betre)») и основание сравнимости из `comparability` («Same spørsmål og same utrekning i begge undersøkingane.»).
- По вопросам: текст вопроса, по каждому варианту две полосы — серая «до», синяя «после» (как в эталоне), справа обе доли (до — мелко, после — жирно), строка «Før: 7 svar. Etter: 6 svar.», у вопросов с баллами — «Snittscore 1,14 → 0,33 (−0,81, betre) · Kritisk andel 43 % → 0 % (−43 poeng, betre)». Вопросы без чисел с обеих сторон (никто или меньше трёх ответили) — одной строкой «For få svar til å vise tal: …». Скрытая сторона — «–» и пустая полоса, с пояснением.
- «Per kunde»: «Alle kundane på seminaret» и каждый клиент — ответы до и после, snittscore и kritisk andel до → после с изменением; скрытое — «–».
- Сравниваются только клиенты семинара, ответившие в обоих раундах («Ikkje med i samanlikninga: Kviknes (svarte berre før).»), и вопросы, которые есть в обоих (совпадение по id или `anchor_key`; остальные — «Berre i undersøkinga før/etter: …»).
- Сравнимость: изменённый вопрос (новый `anchor_key` — «semantic» по ADR-005, другой тип, другие варианты или баллы, без якоря — другая формулировка) → «Kan ikkje samanliknast. <причина>» без чисел и без изменения. Метрика: одна и та же версия определения в обоих раундах → сравнимо; иначе запись `comparability` одного из определений на `key@version` другого: `comparable` — как есть, `approximate` — числа с пометкой «Omtrent samanliknbart. <note из определения>», `incomparable` или записи нет — без чисел («Utrekninga er ulik i dei to undersøkingane, og det er ikkje avtalt at dei kan samanliknast.»). Итог по всем вопросам — только при одном контракте `mean_score`/`critical_share` и том же наборе вопросов без изменённых.
- Метрики: распределения по вариантам (вопросы с одним или несколькими вариантами; шкалы, NPS и свободный текст не сравниваются), `mean_score` и `critical_share` там, где у вариантов есть баллы. Зон нет (зона — уровень, а не счётчик; её нельзя честно сложить по клиентам; в эталоне её тоже нет).

**Только через privacy.** `PrivacyService.clientGroup(round, defs, clients)` (`privacy/cohort.ts`) читает вид `all_clients` раунда через `viewCells`: закрытый раунд — released-снимки, открытый — живые ячейки с k = 3 и дополнительным подавлением, как дашборд. Возвращает ячейки `client:<slug>` клиентов группы и группу `all`: итог раунда, если группа — все ответившие клиенты раунда; иначе сумму ячеек клиентов группы, и только если видна каждая (скрытая или отсутствующая часть скрывает сумму, нулём не считается). Новой population нет. Остальной код видит только эти ячейки.

## Сценарий приёмки этапа 3 (e2e, синтетические данные)

`apps/admin/e2e/seminar-day.spec.ts`: семинар сегодняшнего дня для двух синтетических клиентов → регистрация на `/s` (счётчик «Påmelde» = 1) → «Live»: опрос, «Opne spørsmålet», три телефона 360 px отвечают, «3 har svart», «Steng», «Vis» → полосы 67/33/0 % → «Før og etter»: оговорки сразу, «Rundar» с тремя шагами («1 av 3 spørsmål viste», «I gang») → «Før» = закрытый раунд обоих клиентов (фикстура: 4 + 3 синтетических ответа, released) → «Start undersøking etter seminaret»: версия, сроки, «Opne med ein gong» → две ссылки, ссылка открывает обычную анкету на телефоне → по три ответа от каждого клиента через Submission API → «Før seminaret: 7 svar (publiserte tal). Etter: 6 svar (levande tal).», F12 «Ja: før 29 %, etter 67 %», «Snittscore 1,14 → 0,33», таблица по клиентам → фильтр одного клиента («4 svar … 3 svar») → 1280 и 360 px, светлая и тёмная тема, без горизонтальной прокрутки → «Sjå i dashbordet» открывает дашборд на раунде «Før».

## Проверки (локально, Node 25.8.1, Postgres `varde-dev-postgres-1`, базы `varde_3c`, `varde_e2e_3c`, `varde_e2e_admin_3c`)

Код API — коммит `7a3172b` (после него менялись только админка, e2e и документы); админка и e2e — финальный код этого коммита.

- `pnpm check` — exit 0: api 188, admin 53, runner 111, eslint-rules 70, schema 59, rules 81, ui 18, docs 23 (+1 skipped), invariants 16, parity 17, eval 50 (+2 skipped), convert 13, context-budget 6; lint и build всех пакетов.
- `pnpm budget` — 619 файлов, 0 больше 700; одно предупреждение, как в 3b: `apps/api/prisma/schema.prisma` 569 строк. `pnpm budget:selfcheck`, `pnpm lint:privacy:selfcheck` — ok; `pnpm secrets` — утечек нет (каталог и история, 182 коммита).
- Integration целиком на свежей `varde_3c` с `VARDE_RESTORE_DOCKER=1` (как в CI), под `lockf -k /private/tmp/varde-e2e.lock`: 68 файлов — 67 зелёных, пропущен только `cutover/rehearsal` (нужна `VARDE_REHEARSAL_DATABASE`); 448 тестов — 440 зелёных, 8 пропущено. Новые: `seminars/seminar-rounds.test.ts` (9), `seminars/before-after.test.ts` (10). Миграция вперёд и назад — `migrations.test.ts`; `live/migration-rollback.test.ts` (down → up миграции 3b при уже применённой 3c) — зелёный.
- На той же базе, как в CI: `pnpm invariants:3c` — 6/6 ok; `invariants:3b` — 7/7; `invariants:3a` — 7/7; `invariants:5` — 5/5; `invariants:2a` — 5/5.
- e2e admin — 40/40 на свежей `varde_e2e_admin_3c` (новый `seminar-day.spec.ts` — весь сценарий выше; остальные 39 — без изменений, с новой фикстурой «Før» в `server.cjs`); e2e runner — 66/66 на свежей `varde_e2e_3c`. Оба под `lockf`.
- Unit админки: `seminar-rounds.test.tsx` (4: шаги и состояния, ответы клиентов семинара из прогресса, «Open til 26. november», выбор «Før» и отказ сервера как есть, мастер «Etter» с клиентами семинара и `seminar` в запросе), `seminar-before-after.test.tsx` (5: оговорки до выбора раундов и точный текст «что выбрать», полосы и подписи, итог, скрытая сторона «–», несравнимый вопрос без цифр, свёрнутые вопросы, фильтр клиента); стоп-лист букмола на отрисованном тексте.
- Мутации (прогон: правка одного файла → тест → откат из git): против `before-after.test.ts` убиты все 7 — скрытая часть суммы считается нулём; итог раунда вместо суммы клиентов семинара; изменённый вопрос не замечается; любая пара метрик «сравнима»; закрытый раунд читается живым; когорта без раунда «после»; оговорки пропадают до выбора раундов. Против `seminar-rounds.test.ts` убиты 5 из 6 — нет проверки общего клиента; привязка без AuditLog; мастер берёт клиента не с семинара; мастер делает `regular`; черновик можно взять в «Før». Шестой («live в кандидатах») эквивалентен: live-раунд отсекает ещё фильтр типа и то, что его единственный клиент — технический, а он не бывает клиентом семинара.
- CI не запускался: GitHub Actions заблокирован лимитом расходов (BESLUTNINGER 16.10), push не делался.
- После решения 16.10 и замечаний приёмки (`6f318b5`, `3d71d19`): `pnpm check` — exit 0 (api 188, admin 53, runner 111, остальные как выше), `pnpm budget` — 620 файлов, 0 больше 700; на свежей `varde_3c` под `lockf`: integration `test/reports`, `test/dashboard`, `test/exports` — 11 файлов, 61 тест зелёные (с `reports/previous-round.test.ts`); `invariants:3c` — 7/7 (с гонкой привязки «Etter» и «предыдущим раундом»), `:5` — 5/5, `:2a` — 5/5, `:3a` — 7/7, `:3b` — 7/7. Мутанты: «без фильтра» в `DashboardContext.previous()` и в `ReportService.previous()` — каждый роняет `previous-round.test.ts`; без перевода P2002 гонка отвечает 503 — тест падает.

## Решения и отклонения

1. **Ответы в «Rundar» — из существующего прогресса раунда** (`GET /api/admin/rounds/:id/progress`, ключ запроса тот же, что на «Kundar og rundar»): `responses_total` — точный счётчик на RoundClient, принятое исключение ADR-021 п. 6, ровно как его показывают карточки клиентов раунда; сумма по клиентам семинара не раскрывает ничего сверх этих карточек. Остальные счётчики прогресса (с k) карточка не показывает. У live — только состояние и число показанных вопросов; «N har svart» с k = 3 остаётся во вкладке «Live».
2. **Сводка по клиентам семинара без новой population** — `clientGroup` из вида `all_clients` (не из `round_client`): дополнительное подавление между клиентами там уже применено, поэтому сумма видимых клиентов не даёт вычесть скрытую группу из итога раунда (тест: «Før» с клиентом из двух ответов → его сосед тоже скрыт → сумма по семинару скрыта). Строки по клиентам — из того же вида, как сетка «alle» дашборда: клиент, скрытый дополнительным подавлением, здесь «–», даже если в виде одного клиента в дашборде он виден. Консервативнее; отдельного решения не требует.
   **Существующий путь восстановления (замечание приёмки 3c).** Разница между `round_client` и `all_clients` — уже существующий путь восстановить скрытого клиента вычитанием в дашборде админа: в виде «alle» клиент C скрыт дополнительным подавлением вместе с соседом B, но вид одного клиента B (`round_client`, только порог k) показывает B, и C = итог − видимые клиенты. 3c этот путь сознательно обходит: и сумма по семинару, и строки по клиентам берутся только из `all_clients`; мутация M2 приёмки это ловит (и мутант «ячейки клиентов из `round_client`» роняет два теста `before-after.test.ts` — проверено прогоном). Сам путь в дашборде админа остаётся (админы — доверенный круг ADR-021, живой вид без истории выдач — принятый остаточный риск). **Задача в бэклог privacy:** закрыть эту разницу (согласовать подавление `round_client` с `all_clients` — общий набор скрытых клиентов или проверка разностей между популяциями) до любого внешнего канала — отчёт, Atlas, ассистент, клиентский CSV, — который смешает ячейки этих двух популяций.
3. **Когорта — клиенты семинара, ответившие в обоих раундах** (как сравнение с раундом 1: «Berre kundar som har svart i begge rundane»); иначе «до» и «после» считали бы разные компании.
4. **«Før» — только `regular`**, не `external_import` (раунд 1 из Forms) и не `post_seminar`; не черновик. Если «Før» ещё открыт (раунд 2 сейчас открыт), числа «до» живые и подписаны «levande tal».
5. **«Etter» из мастера — только клиенты семинара** (строже, чем «хотя бы пересечение»: мастер не добавляет чужих). Привязка готового `post_seminar` — по пересечению, как «Før». Замена «Etter» — через «Ta bort koplinga» (иначе 409), чтобы раунд с кодами не потерялся молча.
6. **Сравнимость между разными шаблонами.** Шаблон, сделанный в редакторе (например, «Etter seminar»), получает свои метрики версии без заявления сравнимости (ADR-020, `editor-metrics.ts`) — с «Før» на tryggleik такие вопросы честно «Kan ikkje samanliknast». Сравнимо, когда «Etter» запущен на той же версии шаблона, что «Før» (подсказка есть в мастере); объявлять `comparability` для метрик редактора пока негде — это вне 3c.
7. **Вопросы без чисел свёрнуты в одну строку** — у tryggleik 18 вопросов с вариантами; без этого вкладка была бы шесть экранов «–».
8. **Подпись источника** — «publiserte tal» / «levande tal», те же слова, что у дашборда; в эталоне подписи нет.
9. **Вкладка в эталоне названа «Etter»**, в админке с 3a — «Før og etter»; оставлено «Før og etter».
10. **Рефакторинг без изменения поведения:** `cohortCells` перенесён из `privacy.service.ts` в `privacy/cohort.ts` (файл сервиса 500 → 445 строк); `change()` и расчёт snittscore/kritisk andel сравнения с раундом 1 — в `dashboard/round-pair.ts` (отчёт 5.1 импортирует `change` оттуда). Тесты 1.29 (`comparison.test.ts`) и 5.1 зелёные.
11. **`schema.prisma`** — 569 строк, как было: изменён только комментарий модели Seminar (предупреждение `pnpm budget` то же, что в 3b).
12. **AuditLog `who`:** привязки в карточке пишут `entra:<oid>`, как остальные записи семинаров; запуск «Etter» мастером пишет `seminars.rounds.after` с `who` модуля раундов (`<oid>` без префикса), как его `rounds.launch`.
13. **«Предыдущий раунд» шаблона — только `regular` или `external_import`** (решение Oleksandr 16.10 по риску приёмки): опрос после семинара (`post_seminar`) и живой опрос (`live`) им не бывают. Фильтр `PREVIOUS_TYPES` (`dashboard/dashboard-context.ts`) — в `DashboardContext.previous()` («Svar per tilsett», его экспорт Master_Analyse «Sone førre runde», цепочка сравнения с раундом 1) и в `ReportService.previous()` («Samanlikna med …» в отчёте клиенту 5.1); импортированный раунд 1 остаётся кандидатом. Других мест, где ищется прошлый раунд того же шаблона, нет (grep: архив, дашборд, экспорт, отчёт). «Før og etter» по-прежнему сравнивает с `post_seminar`. Тест `test/reports/previous-round.test.ts` (обычный раунд → закрытый `post_seminar` того же шаблона → live-раунд той же версии, записанный прямо в БД → следующий обычный раунд): отчёт и «Svar per tilsett» берут первый обычный раунд, «Før og etter» — `post_seminar`; мутанты «без фильтра» в каждом из двух мест роняют тест.

## Приватность и риски

- Новый эндпоинт `GET /api/admin/seminars/:id/before-after` — только админ-сессия, класс `aggregate`, числа только из `PrivacyService.viewCells` через `clientGroup`; в ответе нет `answers`, `respondent_key`, `submission_id`, инициалов (тест), live-раунд и технический клиент не участвуют (ответы телефонов ничего не меняют — тест).
- Живой вид открытого раунда — без истории выдач, как живой дашборд (принятый остаточный риск ADR-021: differencing самими админами). Фильтр «один клиент» и смена клиентов семинара дают только суммы видимых ячеек `all_clients` — новых чисел не раскрывают.
- `post_seminar`-раунды видны везде, где обычные (дашборд, отчёт клиенту, экспорт, архив), с меткой «Etter seminar» на «Kundar og rundar».
- CI не запускался: GitHub Actions заблокирован лимитом расходов (BESLUTNINGER 16.10), push не делался.

## Приёмка, merge и выкатка (оркестратор, 16.10)

- Приёмка приватности (чистая сессия Opus 5.5 xhigh) на `8ea2f03`: «принято с замечаниями», утечек нет.
  - Атака вычитанием на 2000 случайных раундов по всем поднаборам клиентов не дала ни одного ранга сверх вида `all_clients`.
  - Убиты 9 мутаций из 9.
  - Important про «прошлый раунд» решён Oleksandr 16.10 (`post_seminar` и `live` не бывают прошлым раундом), реализован в `6f318b5` с тестом. Minor 409 вместо 503 — в `3d71d19`.
  - Старый путь восстановления скрытого клиента через `round_client` вынесен в отдельную задачу privacy. Решение Oleksandr 16.10 — вариант 1: свои каналы клиента и дашборд админа без изменений, остальные каналы — только из `all_clients`.
- Полный локальный прогон шагов CI на `b67361e` — **30/30**.
- Merge → `main` `f56f36d`. Выкатка `varde-api:f56f36dd32fa` в 19:58 по Норвегии:
  - копия базы `/root/deploy-20261016-1758/varde-pre.dump` (397 436 байт, `0600`; 57 ответов, 5429 снимков);
  - миграция `20261016160000_seminar_rounds` применена; healthy через 7 с.
- Проверка после:
  - раунды: external_import 1, regular 2;
  - `/api/admin/seminars` и `/api/admin/dashboard` без входа → 401;
  - `prod-check` 27/27; ошибок в журнале нет; ответов 57.
- Откат: `VARDE_SHA=8d9dddd522f0`, `up -d`, затем `down.sql` миграции `seminar_rounds`.

## Новые строки на нюношке (на проверку Oleksandr)

Оговорки (`dashboard/before-after-view.ts`, всегда на экране):
1. «Det er ikkje nødvendigvis dei same personane som svarte før og etter, og heller ikkje like mange.»
2. «Dei som vel å svare, kan skilje seg frå dei som ikkje svarar (sjølvval).»
3. «Vi samanliknar berre spørsmål som er med i begge undersøkingane og blir rekna ut på same måten. Er spørsmålet eller utrekninga endra, står det ved spørsmålet, og vi viser inga endring.»
4. «Vi ser endringa, men kan ikkje seie at seminaret gjorde det.» (дословно из задания)

Вкладка «Før og etter»: «Les dette før du les tala» · «Før seminaret: N svar (publiserte tal / levande tal). Etter: …» · «Alle spørsmål med poeng: snittscore … · Kritisk andel …» · «Snittscore … · Kritisk andel …» · «Før: N svar. Etter: talet er skjult.» · «Grupper med færre enn tre svar, og grupper som kan røpe ei lita gruppe, blir ikkje viste.» · «For få svar til å vise tal: …» · «Kan samanliknast» / «Omtrent samanliknbart» / «Kan ikkje samanliknast» · «Ikkje med i samanlikninga: X (svarte berre før / svarte berre etter / har ikkje svart).» · «Berre i undersøkinga før: …» · «Vel ei undersøking før og ei etter seminaret / Vel ei undersøking før seminaret / Start eller vel ei undersøking etter seminaret under «Rundar», så kjem samanlikninga her.» · «Ingen av kundane på seminaret har svart i begge undersøkingane enno.» · «Per kunde» · «Alle kundane på seminaret» · «Svar før» · «Svar etter» · «Då står det «–».»

Пометки сравнимости (`dashboard/round-pair.ts`): «Same spørsmål og same utrekning i begge undersøkingane.» · «Spørsmålet har fått nytt innhald sidan undersøkinga før.» · «Spørsmålet har fått ein annan type svar.» · «Svaralternativa er endra.» · «Poenga for svara er endra.» · «Ordlyden i spørsmålet er endra.» · «Utrekninga finst berre i den eine undersøkinga.» · «Utrekninga er ulik i dei to undersøkingane, og det er ikkje avtalt at dei kan samanliknast.» · «Det finst inga utrekning for dette spørsmålet.» · «Snittscoren byggjer på ulike spørsmål i dei to undersøkingane.» · «Spørsmål … kan ikkje samanliknast, så heller ikkje snittscoren for alle.»

Карточка «Rundar» и мастер: «Rundar» · «Før seminaret» · «Under seminaret» · «Etter seminaret» · «Inga undersøking er kopla til» · «Inga undersøking enno» · «Ikkje kopla» · «Open til 1. juni» · «Ikkje laga enno» · «N av M spørsmål viste» · «Ikkje laga / Ikkje starta / Ope no / I gang / Ferdig» · «Runden har òg éin kunde / N kundar som ikkje er på seminaret.» · «Sjå i dashbordet» · «Sjå under «Kundar og rundar»» · «Opne Live» · «Vel undersøking før» · «Eller vel ei som finst» · «Kople til som «Før» / «Etter»» · «Ta bort koplinga» · «Ingen opna undersøkingar hos kundane på seminaret enno. Undersøkinga før må ha minst éin av kundane.» · «Start undersøking etter seminaret» · «Vel kundane på seminaret under «Endre» først.» · «Undersøking etter seminaret» · «Undersøkinga går til kundane på seminaret, med eiga lenkje for kvar kunde, og blir kopla til seminaret som «Etter». Vel same skjema som undersøkinga før, så kan svara samanliknast.» · «Kundar på seminaret» · «Start undersøkinga» · «Etter seminaret: <tema>» (имя раунда по умолчанию) · «Lukk» · «Etter seminar» (метка на «Kundar og rundar»).

Ответы сервера: «Vel ei vanleg undersøking hos kundane som «Før».» · «Vel ei undersøking etter seminaret som «Etter», eller start ei ny.» · «Undersøkinga er ikkje opna enno. Vel ei som er open eller avslutta.» · «Seminaret har ingen kundar. Vel kundane på seminaret først.» · «Ingen av kundane på seminaret er med i denne undersøkinga.» · «Undersøkinga høyrer alt til eit anna seminar.» · «Koplinga kunne ikkje lagrast. Prøv igjen.» · «Seminaret har alt ei undersøking etter. Ta bort koplinga først.» · «Vel berre kundar som er med på seminaret.» · «Vel eit skjema for kundane, ikkje eit for live-spørsmål.» · «Kunden har ikkje svart i begge undersøkingane.» · «Rundane til seminaret finst ikkje.»

Все строки проверены стоп-листом букмола (тест поймал «svarer» → «svarar»).

## Как провести тестовый семинар с командой (для Oleksandr)

Цель — критерий приёмки этапа 3: регистрация, живой опрос с ≥3 телефонов, опрос после, «до/после» с оговорками. Нагрузочный тест сделан в 3b (`bash tools/invariants/run-3b.sh --load`, 60 телефонов, p95 44 мс) — повторять с командой не нужно. Нужны 3–4 человека с телефонами и ноутбук с проектором или вторым экраном. Чтобы не смешивать тест с ответами клиентов, всё делается на тестовом клиенте.

1. **За день.** «Kundar og rundar» → «Legg til eller endre kunde»: клиент «Vardahei (test)», 4 сотрудника. Мастером «Start ein runde»: «Test før», версия `tryggleik · 2026-10-13`, только этот клиент, срок, «Opne med ein gong» → разослать ссылку команде; ответить должны минимум трое (иначе вместо чисел будет «–»). Потом «Avslutt heile runden» — тогда «Før» берётся из опубликованных снимков. В «Skjema» должен быть опубликованный шаблон для live («Under seminar») — он есть с 3b.
2. **Семинар.** «Seminar» → «Nytt seminar»: сегодняшняя дата, время вокруг теста, клиент «Vardahei (test)».
3. **Регистрация.** «Opne påmeldingssida» → ссылку открыть на телефонах; трое регистрируются (первая галочка обязательна, вторая — по желанию). В админке «Påmelde» = 3, «Vis namnelista» показывает их.
4. **Live.** Вкладка «Live» → «Lag live-spørsmål» → «Lag lenkje til storskjermen» → открыть на проекторе. Телефоны сканируют QR. «Opne spørsmålet» → после одного-двух ответов на экране «Færre enn tre har svart», после третьего — «3 har svart» → «Steng spørsmålet» → «Vis resultatet» (полосы). Можно второй вопрос провести с самого большого экрана.
5. **«Før og etter» → «Rundar».** «Vel undersøking før» → «Test før» → «Kople til som «Før»». Потом «Start undersøking etter seminaret»: та же версия `tryggleik · 2026-10-13` (иначе вопросы будут «Kan ikkje samanliknast»), срок, «Opne med ein gong» → «Start undersøkinga» → скопировать ссылку → те же трое отвечают (можно иначе, чем «до»).
6. **Проверить на вкладке:** оговорки видны всегда (и до выбора раундов); легенда «Før seminaret: N svar (publiserte tal). Etter: M svar (levande tal).»; серые и синие полосы; если после ответили меньше трёх — «–», а не числа; «Per kunde»; «Sjå i dashbordet» открывает раунд в дашборде. Затем закрыть «Etter» на «Kundar og rundar» — подпись сменится на «publiserte tal».
7. **После теста.** Регистрации удалятся сами через 90 дней после семинара (или «Fjern påmelding»); тестовые ответы при желании — «Sletting» по клиенту «Vardahei (test)». Раунды и семинар остаются (удаления раундов в админке нет) — назовите их явно «Test …».

Что записать в итог приёмки: удалось ли ≥3 телефона, видны ли оговорки, понятны ли строки на нюношке (список выше), и решения по открытым вопросам ниже.

## Открытые вопросы для Oleksandr

1. Строки на нюношке выше, особенно четыре оговорки и пометки сравнимости.
2. Нужно ли объявлять сравнимость для шаблонов из редактора (короткая анкета «Etter seminar» против tryggleik) — сейчас такие вопросы честно несравнимы.

## Скриншоты

`docs/varde/evidence/stage-3/3c/` (e2e, синтетические данные):
- `admin-rundar-1280-light-tom.png` — вкладка до выбора раундов: оговорки, «Rundar» с тремя шагами (live «1 av 3 spørsmål viste», «I gang»);
- `admin-for-etter-1280-light.png`, `admin-for-etter-1280-dark.png` — полное сравнение: легенда, итог, полосы до/после, «For få svar til å vise tal», «Per kunde»;
- `admin-for-etter-360-light.png`, `admin-for-etter-360-dark.png` — то же на телефоне (вариант над полосами);
- `admin-rundar-360-light.png` — карточка «Rundar» на телефоне с привязанными «Før» и «Etter».
