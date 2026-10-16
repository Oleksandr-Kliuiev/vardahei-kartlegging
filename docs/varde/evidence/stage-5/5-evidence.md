# Этап 5 — отчёт клиенту (5.1) и архив агрегатов (5.2), evidence (16.10.2026)

Статус: 5.1 и 5.2 сделаны на ветке `varde/5` (от `main` a67d244, с дизайном Vardestien 1e). 5.3 отложена решением Oleksandr 13.10 и не делалась. Кодер — Claude Opus 5.5. Push, merge и выкатка — за оркестратором; строку `pnpm invariants:5` в `.github/workflows/varde.yml` добавляет оркестратор.

## Коммиты

| Задача | Коммит | Что |
| --- | --- | --- |
| 5.1 | `1379519` | `GET /api/admin/round-clients/:id/report`, раздел «Rapportar» в админке (макет Vardestien), A4-страницы и печать в PDF, ссылка с карточки клиента |
| 5.2 | `92097ce` | `GET /api/admin/exports/archive.json?round=`, CLI `archive restore --file`, запись снимков через privacy, «Last ned arkiv» на «Eksport» |
| закрытие | `b84c095` | `invariants:5`, этот evidence, строки в REVIEW-CHECKLIST и AI_CONTEXT_MAP, скриншоты и PDF |
| CI (оркестратор) | `3cd5ca9` | `pnpm invariants:5` в job `integration` |
| 5.2, после приёмки | `3bf436e` | restore проверяет Finding по ячейкам архива; новые версии только для новых ключей; `--sha256` |
| 5.1, после приёмки | `9844644` | отрицательные тесты ловят leader-Finding и открытый раунд |
| evidence после приёмки | см. `git log` | этот раздел, строки в REVIEW-CHECKLIST |
| minor приёмки (оркестратор) | см. `git log` | count у правил по людям сравнивается точно (подделка `count + 5e-10` давала в отчёте «2.0000000005 av 6»); новый ключ в известном семействе — отказ; тесты и мутации на оба |

## 5.1 Отчёт клиенту

- API: только закрытый раунд (иначе 409 «Rapporten kan lagast når runden er avslutta.»), только released-снимки `round_client` через `PrivacyService.viewCells(…, releasedOnly)` (часть common), Finding канала `aggregate` с `release_id` этих снимков. По решению оркестратора (согласование с 2.5): на каждый `rule_key` берётся строка с наименьшей `rule_version` — версия, действовавшая при release, тексты — из definition этой версии. Нет Response, класса `rows`, leader-эндпоинта и `leaders_all`. Каждый отчёт — AuditLog `report.client` (кто, раунд, клиент, язык).
- Содержимое: зона фирмы (snittscore → зона по `thresholds.aggregate`), kritisk andel, число ответивших (n + missing видимой ячейки, как в дашборде), период раунда, топ-3 вывода в порядке дашборда, «Kva vi føreslår» из `action_text`, вопросы по одному с зоной («–» для подавленных), сравнение с последним закрытым раундом этого клиента того же семейства шаблона (только released; степень из `comparability` определений; при `incomparable` сравнения нет), строка о методе.
- Язык: `nn` по умолчанию (язык клиента, если он есть у версии), `en`; `nb` — только если в `required_languages` версии включён букмол (ADR-019), иначе 400.
- Админка: раздел «Rapportar» (группа «Innhald», иконка `dok`, как `admin.js:72`), заголовок «Rapport til kunden». Слева карточка «Innhald» (раунд, клиент, язык, что вошло в отчёт, «Eg har lese gjennom rapporten», «Lagre som PDF»), справа A4-предпросмотр (масштабируется под колонку). Плашка «Førehandsvising» сверху: проверить перед отправкой, ничего не отправляется само. Вход также с карточки клиента в закрытом раунде, когда есть released-снимки (`/api/admin/rounds` отдаёт `released` по RoundClient через privacy).
- Печать: `@page` A4, при печати всегда светлый лист, стр. 1 — сводка, стр. 2 — вопросы; меню, кнопки, плашка и карточка «Innhald» не печатаются (проверено `emulateMedia({ media: 'print' })` в тёмной теме).

## 5.2 Архив агрегатов

- Формат `varde.round-archive` v1 (`apps/api/src/modules/exports/round-archive.ts`): метаданные раунда без кодов ссылок, опубликованная версия шаблона, клиенты (slug, имя) и RoundClient (статус, срок, численность), released и superseded снимки с причинами (подавленные — без чисел), используемые MetricDefinition, FindingRule семейства шаблона, Finding, RoundMetricSet, история release (из строк снимков), sha256 канонического содержимого. Экспорт сам проверяет файл той же схемой, что restore. AuditLog `exports.archive`.
- Restore: `node dist/cli.js archive restore --file <путь> [--sha256 <hex>]` в базу из `DATABASE_URL`. Сначала строгая схема и sha256; `--sha256` сверяет с хэшем из записи AuditLog выгрузки (`exports.archive`). **Без опции sha256 файла защищает только от порчи, не от подделки:** любой может пересчитать хэш изменённого файла.
- Каждый Finding архива должен следовать из самого архива, иначе отказ всего архива до любой записи: правило канала `aggregate` (по definition архива и по базе, если правило там есть), `release_id` — release того же раунда и той же области (`round_client` этого клиента или `all_clients`), `numbers.n` ≥ k, и `evaluate()` на ячейках этого release даёт те же n, count (у правил по людям — точно; до 1e-9 только у вычисляемых правил с часами), share (до 1e-9: jsonb хранит около 16 знаков), level и release.
- Затем одна транзакция с теми же id: шаблон и версия, клиенты, раунд, RoundClient, определения, набор метрик, снимки, Finding, AuditLog `archive.restore`. Определения неизменяемы: тот же key@version с другим содержимым — ошибка. Новую версию restore добавляет, только если в базе нет ни одной версии этого ключа: действует последняя версия (`FindingsService.rules`), и новая версия известного ключа изменила бы расчёты других раундов; иначе отказ всего архива. Так же отказ, если ключ новый, а семейство шаблона в базе уже есть: `definitionsFor()` и `FindingsService.rules()` читают все ключи семейства. **Несколько раундов одного семейства восстанавливаются от нового архива к старому:** в старом архиве — подмножество определений нового. Порядок restore (пустая мигрированная база до seed, от нового к старому, `--sha256`, что делать при отказе) — `docs/varde/runbooks/archive-restore.md`. Повтор того же архива — `unchanged`; другое содержимое под тем же id — явная ошибка, ничего не меняется.
- Запись снимков — только в privacy: новая точка `PrivacyService.restoreSnapshots` → `PrismaSnapshotStore.restore` (оба файла уже в allow-list `privacy-only-release`, allow-list не менялся). Только INSERT и только в раунд без единого снимка; триггер `aggregate_snapshot_released` не трогали (он ограничивает UPDATE/DELETE, restore их не делает). Перед записью privacy отклоняет видимую ячейку с n < k (кроме точного счётчика `responses_total` × `round_client` × `all`), метрику части leader вне `leaders_all`, ячейку без определения в архиве и RoundClient чужого клиента.
- Проверка вручную на собранном CLI: архив раунда тестовой базы (85 245 снимков, 1 320 Finding, 43 МБ — раунд много раз перевыпущен тестами) восстановлен в пустую базу за 14 с, повтор — `unchanged`, Response в новой базе 0. После приёмки — тот же раунд, уже 261 418 снимков и 4 048 Finding: все Finding проходят новую проверку, restore с `--sha256` за 38 с, повтор — `unchanged`.

## Проверки (локально, Node 25, Postgres `varde-dev-postgres-1`, свои базы `varde_5`, `varde_e2e_5`, `varde_e2e_admin_5`)

- `pnpm check` — exit 0: api 135, admin 23, runner 81, rules 81, schema 50, ui 18 и остальные пакеты зелёные.
- `pnpm budget` — 0 файлов больше 700 строк; `pnpm lint:privacy:selfcheck` — обход отклонён.
- `pnpm invariants:5` — 5/5 ok.
- Integration (`pnpm --filter @varde/api test:integration`, база `varde_5`): 49 файлов, 320 тестов зелёные; 2 файла пропущены по окружению, как и до этапа 5 (`forget-restore` ждёт `VARDE_RESTORE_DOCKER=1`, `rehearsal` — `VARDE_REHEARSAL_DATABASE`).
- e2e admin 34/34 (было 31: плюс `report.spec.ts` ×2 и `archive.spec.ts`), e2e runner 58/58; оба под `lockf /private/tmp/varde-e2e.lock` на своих базах.
- `pnpm secrets` — утечек нет (каталог и история путей Varde).
- Мутации: без выбора наименьшей `rule_version` тест «rule v2» падает; без проверок privacy при restore «visible cell below k» принимается и тест падает; с числами в подавленных ячейках экспорт не проходит схему. После приёмки: без проверки Finding при restore leader-Finding восстанавливается и тест падает; без фильтра канала в отчёте подложенный leader-Finding виден и тест падает; без проверки закрытого раунда (с live-ячейками или без) открытый раунд с ответами и release даёт отчёт и тест падает.
- CI не запускался: push не делался.

## Отклонения и решения

1. **«PDF» в STAGES 5.1** — страница A4 в админке и «Lagre som PDF» (`window.print()`); PDF сохраняет браузер. Серверного PDF-движка нет (решение оркестратора; BACKLOG п. 8 допускает «PDF или страница»). Что печать даёт PDF, проверяет `page.pdf()` в e2e. Кнопка названа «Lagre som PDF» (задание), в макете было «Lag PDF».
2. **Архив включает опубликованную версию шаблона** (SurveyTemplate + TemplateVersion: вопросы, варианты, баллы). Без неё восстановленный раунд не читается: `DashboardContext` и `MetricsService.definitionsFor` требуют версию. Это текст опросника, не ответы.
3. **Restore сохраняет id** записей. В базу, где тот же ключ шаблона или slug клиента уже есть с другим id, restore явно отказывает и ничего не пишет. Для «пустой мигрированной базы» это не мешает.
4. **История release** — из строк снимков (release, population, даты, причина, число ячеек, подавленных и stale). Кто сделал ручной release, есть только в AuditLog (12 месяцев) и в архив не попадает: идентичность админа не храним ≥ 3 лет вместе со снимками.
5. **Разбивки по ролям в отчёте нет**: фирма в целом и вопросы по одному («samla bilete»). Группы < k не показываются вовсе.
6. **nb**: тексты выводов и предложений правил FUNN есть только на nn и en (схема FindingRule), поэтому в nb-отчёте эти строки на нюношке (помечены `lang="nn"`). Сейчас ни одна версия букмол не включает.
7. **Даты** — день по Осло; названия месяцев написаны в коде: в Chromium нет данных `nn` для `Intl` (выходило «October 16, 2026»).
8. **Период раунда** — `opened_at`–`closed_at`; у импортированных раундов без `opened_at` — «avslutta <дата закрытия>» (для «Runde 2» из импорта это дата закрытия в Varde, а не период ответов).
9. По сообщению оркестратора страница сделана по макету «Rapportar» (`admin.js` ~713–740, `admin.css` «Rapport (A4)»), раздел добавлен в меню. Тест оболочки обновлён: семь разделов, у «Rapportar» заголовок «Rapport til kunden».
10. Код дашборда не менялся (по договорённости с 2.5); отчёт только импортирует из него чистые функции `cellAt`, `valueOf`, `change`.

## Приватность и риски

- Отчёт: только released `round_client` класса `aggregate` и сохранённые Finding канала `aggregate`; отрицательный тест по всем клиентам синтетического идентифицированного раунда (инициалы, ответы руководителя, малые группы, клиент ниже k) на nn и en — нет инициалов, `respondent_key`, строк, leader-метрик и leader-правил, чисел скрытых ячеек. «X av Y» в выводах — числители видимых ячеек (как в дашборде и клиентском CSV). Число ответивших — n + missing видимой ячейки-маркера этого release (вопрос о роли, иначе snittscore), как в дашборде; если ячейка скрыта (n < k), в отчёте «–».
- Отчёт уходит клиенту только руками; проверка человеком — переключатель «Eg har lese gjennom rapporten» перед кнопкой и плашка (ADR-025). Переключатель сбрасывается при смене клиента или языка.
- Архив: только агрегаты и определения; uuid клиентов и RoundClient, slug и имя клиента — метаданные. Restore — действие хостинг-оператора из CLI; sha256 без `--sha256` — защита от порчи, не подпись.
- Принятый остаточный риск: restore не перепроверяет дополнительное подавление и разности между release. Проверка безопасности в `privacy/release.ts` встроена в расчёт нового release (решает подавление и carry-forward для предлагаемых ячеек против истории) и не вызывается на готовом наборе: отдельного верификатора нет, есть только тестовый `test/support/release-safety.ts`. Риск принят: архив делает сам Varde, restore — действие оператора через CLI, админы и так видят класс `rows`; restore при этом отклоняет видимые ячейки с n < k, leader-метрики вне `leaders_all`, ячейки без определения и Finding, которые не следуют из ячеек.
- Маршрут-обходчик `1c-no-leak-routes` автоматически проверяет новые маршруты (отчёт и архив).
- Остаточный риск: архив раунда, который много раз перевыпускали, большой (в тестовой базе 67 МБ на 125 тыс. снимков); в проде 1–3 release на раунд.

## Новые строки на нюношке (на проверку Oleksandr)

Отчёт (уходит клиенту): «IT-tryggleik hos», «KI i kvardagen hos», «Kartlegging hos», «Laga {dato}», «avslutta {dato}», «Sone», «Snittscore», «av 3», «Kritisk andel», «Svar», «Kvart svar gir 0–3 poeng: grøn 0, gul 1, oransje 2 og raud 3. Snittscoren er gjennomsnittet av poenga, og kritisk andel er delen av svara som er oransje eller raude. Lågare er betre.», «Det kom inn for få svar til at vi kan vise tal. Vi viser berre tal som byggjer på minst tre svar.», «Dette bør de ta tak i», «Det viktigaste vi fann», «Vi fann ingen tydelege problem i svara.», «Høg», «Middels», «Stor», «Verdt», «Kva vi føreslår», «Samanlikna med {runde}», «Før», «No», «Endring», «betre», «verre», «likt», «prosentpoeng», «Spørsmåla og svaralternativa er dei same, men samanlikninga er omtrentleg: det er ikkje nødvendigvis dei same personane som har svart, og talet på svar er ulikt ({b} før, {n} no).», «Nokre spørsmål eller svaralternativ er endra sidan sist, så samanlikninga er berre omtrentleg. Det er heller ikkje nødvendigvis dei same personane som har svart ({b} svar før, {n} no).», «Spørsmål for spørsmål», «Spørsmål», «Førre runde», «– tyder at det er for få svar til å vise talet.», «Om tala», «Tala er samla frå svara til dei tilsette. Vi viser berre tal som byggjer på minst tre svar, og vi skjuler grupper som kunne avsløre svara til færre enn tre personar. Rapporten har ingen namn eller initialar og ingen enkeltsvar, og svara frå leiarane er ikkje med.» Английский и букмол — в `varde/apps/admin/src/report-texts.ts`, нужен взгляд носителя.

Админка: «Rapportar», «Rapport til kunden», «Ein PDF frå publiserte tal, på språket til kunden. Eit menneske sjekkar og sender han sjølv.» (из макета), «Førehandsvising», «Les gjennom rapporten før du sender han. Varde sender ingenting sjølv: du lagrar PDF-en og sender han til kunden. Aldri med i rapporten: initialar, leiarsvar og grupper under tre personar.», «Innhald», «Vel kunde», «Språk», «Sone for bedrifta og kritisk andel», «Skjemaet har ingen soner», «Ingen sone: for få svar», «Det viktigaste funnet», «Dei to viktigaste funna», «Dei tre viktigaste funna», «Ingen tydelege funn», «Samanlikning med {runde}, med atterhald», «Inga samanlikning med ein tidlegare runde», «Kva Vardahei føreslår», «Eg har lese gjennom rapporten», «Lagre som PDF», «I utskriftsvindauget vel du «Lagre som PDF». Menyen og denne delen kjem ikkje med.», «Hentar rapporten …», «Vel ein kunde for å sjå rapporten.», «Ingen avslutta rundar har publiserte tal enno.», «Last ned arkiv», «Arkivet har dei publiserte samla tala for heile runden, med definisjonane bak dei. Ingen svar, initialar eller fritekst. Det kan lesast inn att i ein tom database.»; ошибки API: «Rapporten kan lagast når runden er avslutta.», «Runden har ingen publiserte tal for denne kunden enno.», «Rapporten finst ikkje på dette språket.», «Arkivet kan lagast når runden er avslutta.»

## Открытые вопросы для Oleksandr

1. Показывать ли в отчёте видимые роли (группы ≥ 3), или оставить фирму в целом и вопросы?
2. KI: `action_text` правил `ki.routine_hours` и `ki.heaviest_task` ссылаются на «sitata under» и «fritekstane», которых в отчёте нет. Нужны тексты для клиента (новые версии правил) или скрывать эти предложения в отчёте.
3. Подпись и контакт Vardahei в отчёте (кто сделал, кому звонить) — сейчас только логотип и дата.
4. Тексты отчёта на английском и букмоле — проверка носителем.

## Скриншоты и PDF

`docs/varde/evidence/stage-5/5.1/`: `rapport-light.png`, `rapport-dark.png` (1280 px, страница «Rapport til kunden»), `rapport.pdf` (nn), `rapport-en.pdf` (en) — из `page.pdf()` в admin e2e на синтетическом раунде.
