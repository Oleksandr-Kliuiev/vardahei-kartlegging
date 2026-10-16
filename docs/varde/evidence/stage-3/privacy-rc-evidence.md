# privacy: куда уходят числа одного клиента (`round_client`) — решение 16.10.2026

Ветка `varde/privacy-rc` от `varde/3c` (b67361e), в неё влит `main` 484b6f4 (3c в проде). Закрывает пункт BACKLOG «до этапа 4 (приёмка 1c, I1, important)», который приёмка 3c нашла снова (3c, решение 2). Кодер — Claude Opus 5.5. Миграций нет, данные не меняются, экраны не меняются.

## Путь

Две population подавляются каждая сама по себе: `round_client` — в блоке одного клиента (итог и роли), `all_clients` — два независимых разбиения итога (`client:*` и `role:*`). Связь 1.32 (`listLinked*`) сравнивает с историей только пару `round_client all` ↔ `all_clients client:X` и не согласует дополнительное подавление между популяциями.

Пример приёмки 3c, синтетика: клиенты A4, B3, C1, D3. В «alle» C ниже k, и вместе с ним скрыт B — наименьший видимый. Но B виден в своём `round_client` (n = 3 ≥ k), поэтому C = 11 − 4 − 3 − 3 = 1, и с numerator — ответ этого одного человека. Скрыть B в «alle» бесполезно: он уже опубликован в другой population. Варианты закрытия:
1. числа B уходят только в его собственный канал и в дашборд админа, остальные каналы берут числа по клиентам из «alle»;
2. то же плюс прочерки у B во всех видах дашборда — путь через роли при этом остаётся;
3. скрыть B везде, включая его отчёт.

Скрыть итог раунда вместо B — значит потерять «Alle kundar» в любом раунде с одним маленьким клиентом. Против ADR-021 («малые клиенты видны только суммарно») и не закрывает путь через итоги ролей.

**Решение Oleksandr 16.10 — вариант 1** (BESLUTNINGER, ADR-021). Отчёт 5.1, клиентский CSV и handover остаются с числами клиента. Дашборд админа не меняется: доверенный круг, у админов есть строки. Privacy гарантирует lint'ом и тестами, что ячейки `round_client` уходят только туда. Любой будущий канал (Atlas, ассистент, тренды, сводки по нескольким клиентам) берёт числа по клиентам только из `all_clients`.

## Коммиты

| Что | Коммит | Содержание |
| --- | --- | --- |
| API | `0dfd888` | `PrivacyService.viewCells` отдаёт только `all_clients` и `leaders_all` (`round_client` → `PrivacyViolation`); ячейки клиента — через `ownCells` (только released, и в открытом раунде; отчёт 5.1, клиентский CSV, findings release для отчёта) и `adminClientCells` (дашборд: клиент, сравнение, правило-превью, кросс-ячейка F12). Внутренние `cohortCells`, `roleClientCells`, `clientGroup` — через приватный `cells()`. Поведение экранов не меняется |
| lint | `0bcd612` | Правило `varde/round-client-exits` (type-aware) и его подключение в `eslint.config.js` для `apps/api/src/**` вне privacy; RuleTester, тесты на настоящем конфиге и настоящем `PrivacyService` (`boundaries.test.ts`), фикстура `pnpm lint:privacy:selfcheck` в модуле seminars |
| lint, raw SQL | `87ad19d` | То же правило: raw SQL по таблице `finding` вне allow-list |
| тесты атаки | `8dcd574` | `apps/api/test/privacy/subtraction-attack.test.ts`, генератор и решатель `test/support/subtraction-attack.ts`, `LinkedMemorySnapshotStore` (эквивалентность 1.32 для двух population в памяти) |
| документы | `9ba89c5` | BESLUTNINGER, ADR-021 (дополнение 16.10), REVIEW-CHECKLIST (раздел «куда уходят числа одного клиента»), AI_CONTEXT_MAP, BACKLOG (I1 закрыт; новый пункт про 2D-разбиения внутри `all_clients`) |

## Guard: `varde/round-client-exits`

Вне `modules/privacy` правило отклоняет:
- **методы, выпускающие ячейки клиента**, вне своих allow-list (зафиксированы тестом):
  - `ownCells` — `reports/**`, `exports/csv.service.ts`, `metrics/metrics.service.ts`;
  - `handover` — `retention/**`;
  - `adminClientCells` — `dashboard/**`, `findings/rule-preview.service.ts`;
  - `roleClientCells`, `cohortCells` — `dashboard/**`;
  - `computeCells` (ячейки до подавления) — `metrics/metrics.service.ts`;
  - `archiveSnapshots` (все population раунда) — `exports/round-archive.service.ts`;
  - `aggregate` (живой класс `aggregate`) — нигде вне privacy.

  Ловится и вызов, и деструктуризация, и computed-доступ строкой. Получатель с типом `any` или `unknown` тоже считается privacy. Computed-доступ переменной и rest-деструктуризация `PrivacyService` — ошибка `dynamic`.
- **общие виды в собственном канале**: `viewCells` и `clientGroup` в `reports/**`, `exports/csv.service.ts`, `retention/handover.ts`. В раунде из двух клиентов итог − свои = второй клиент, поэтому свой канал не получает рядом общих чисел — например, «бенчмарк по всем клиентам» в отчёте.
- **сохранённые Finding** (`numbers` — n и count одного клиента): модель `finding` у Prisma вне `findings/**`, `reports/**`, `exports/round-archive.service.ts`, связь `finding`/`findings` в include/select, если вложенный `select` не исключает `numbers`, и raw SQL по таблице `finding` (`$queryRaw*`, `$executeRaw*`, `Prisma.sql`). `count` разрешён везде (seminars считает Finding по id).

Текущий код проходит правило без исключений. Пробные файлы в `seminars/` дали ошибку правила на каждом обходе — вызов, деструктуризация, computed-доступ строкой и переменной, rest, получатель `any`, Finding через модель, include, select с `numbers` и raw SQL — и ни одной на `viewCells`, `clientGroup`, `finding.count` и select без `numbers`.

## Тесты атаки (`subtraction-attack.test.ts`, линейный ранг)

Неизвестные — группы клиент × роль, включая ответы без роли. Каждая видимая ячейка — известная сумма групп. Утечка — набор групп с 0 < n < k, индикатор которого лежит в пространстве строк видимых ячеек; при n ≥ 1 у каждой группы и k = 3 достаточно одиночек и пар. Раунды выпускаются настоящим `privacy.release()` в порядке `MetricsService.releaseRound` (сначала `round_client`, потом `all_clients`, с эквивалентностью 1.32) и читаются через `PrivacyService`. Каждое число ячейки сверяется с правдой.
- **Путь (пример 3c A4/B3/C1/D3):** свой канал B + «alle» → `c n=1 ja=1`. Без канала B тот же вид C не выдаёт.
- **Что получает любой читатель (400 случайных раундов: 2–7 клиентов по 1–8 ответов, 1–3 роли, 8 % ответов без роли; в >100 раундов есть клиент с n ≥ k, скрытый дополнительно):** «alle» и суммы `clientGroup` по всем поднаборам клиентов не выдают ни одного набора клиентов < k (одна неизвестная на клиента, как в тесте приёмки 3c). По группам клиент × роль они не добавляют ни одной утечки к самому «alle».
- **Почему свой канал — только этому клиенту (200 раундов):** свой канал клиента, скрытого в «alle», рядом с «alle» выдаёт набор клиентов < k больше чем в 50 случаях.
- **Свой канал отдельно (400 раундов, каждый клиент):** не выдаёт групп < k.
- **Объём:** разовый прогон тех же свойств на 3 × 1700 раундов (seed 11, 22, 33; копия теста вне коммита) — зелёный.
- **Две двери:** `viewCells` с `round_client` → `PrivacyViolation`. `ownCells` в открытом раунде отдаёт released (3/2), `adminClientCells` — живые ячейки (6/5 после трёх новых ответов).

## Проверки (локально, Node 25.8.1)

- `pnpm --filter @varde/api test` — 27 файлов, 194 теста (было 188, +6). `lint` и `build` api — exit 0. `tsc -p tsconfig.json` с тестами — те же 12 ошибок в 8 старых файлах, что и в базе 3c: новых нет; CI тесты не типизирует.
- `tools/eslint-rules`: `round-client-exits.test.ts` — 46 зелёных, `boundaries.test.ts` — 38 зелёных (+6 с настоящим `PrivacyService`), `lint` и `tsc` пакета — exit 0. `pnpm lint:privacy:selfcheck` — «bypass rejected (…, round_client exits, saved findings)».
- `tools/docs` — 23 зелёных (+1 skipped).
- Мутации (одна правка → тест → откат из git, `git status` после — чистый): 16 из 17 убиты, M2 эквивалентный.

| Мутант | Чем убит |
| --- | --- |
| M1 `ownCells` читает живой вид | `subtraction-attack.test.ts` (две двери) |
| M2 `viewCells` без своей проверки `round_client` | эквивалентный: приватный `cells()` всё равно требует клиента, а у `viewCells` нет параметра клиента — остаётся как защита в глубину |
| M3 `ownCells` разрешён в seminars | `round-client-exits.test.ts`, selfcheck |
| M4 деструктуризация не проверяется | `round-client-exits.test.ts` |
| M5 получатель `any` считается не privacy | `round-client-exits.test.ts` |
| M6 свой канал читает общие виды | `round-client-exits.test.ts` |
| M7 `finding.findMany` разрешён везде | `round-client-exits.test.ts`, selfcheck |
| M8 select с `numbers` проходит | `round-client-exits.test.ts` |
| M9 правило не включено в `eslint.config.js` | тест конфига, selfcheck, `boundaries.test.ts` |
| M10 `clientGroup` берёт клиентов из `round_client` (мутант M2 приёмки 3c) | `subtraction-attack.test.ts` («k1/– n=1») |
| M11 решатель атаки ничего не находит | `subtraction-attack.test.ts` (путь и контроль) |
| M12 `computeCells` не считается выходом | `round-client-exits.test.ts`, `boundaries.test.ts` |
| M13 отчёт 5.1 читает живой вид админа | `pnpm lint` (api) |
| M14 клиентский CSV добавляет итог «alle» | `pnpm lint` (api) |
| M15 findings release читают вид админа | `pnpm lint` (api) |
| M16 raw SQL шаблоном по `finding` не проверяется | `round-client-exits.test.ts` |
| M17 raw SQL вызовом (`$queryRawUnsafe`) по `finding` не проверяется | `round-client-exits.test.ts` |

- **Полный локальный прогон шагов CI** на `b3e00ef` (GitHub Actions заблокирован лимитом; скрипт по образцу local-ci оркестратора: свежие базы `varde_prc_*` в `varde-dev-postgres-1`, `VARDE_RESTORE_DOCKER=1` в job integration, как в CI, integration и браузерные прогоны под `lockf -k /private/tmp/varde-e2e.lock`): **30/30 ok**.
  - check: install, `pnpm -r lint`, `pnpm -r test`, `pnpm -r build`, budget, budget:selfcheck, lint:privacy:selfcheck;
  - integration: migrate; `test:integration` — 68 файлов зелёные, 1 пропущен (`cutover/rehearsal`, нужна `VARDE_REHEARSAL_DATABASE`), 445 тестов, 8 пропущено;
  - invariants 0a, 0b, 0c, 1a, 1b:runner, 1b, 1c, 1e, 5, 2a, 3a, 3b, 3c (7/7); lesemodus, caddy-legacy;
  - e2e: admin 40/40, runner 66/66; golden старого дашборда;
  - secrets: утечек нет, secrets:selfcheck;
  - образ linux/amd64 собран.
  Первый прогон (на `d31b45d`) я остановил после `inv-0a`: в правило добавилась проверка raw SQL по `finding`, и полный прогон повторён на финальном коммите.

## Решения и отклонения

1. **Две именованные двери вместо флага у `viewCells`.** `ownCells` и `adminClientCells` — отдельные методы, а `viewCells` больше не принимает клиента. Lint проверяет имена методов, а не значения аргументов, поэтому переменная population правило не обходит.
2. **Сохранённые Finding — тоже выход.** В `numbers` лежат n и count клиента, то есть те же числа его `round_client`. Без этого пункта будущий канал прочитал бы их мимо privacy.
3. **Свой канал без общих чисел.** Это не было в формулировке решения, но вытекает из него: в раунде из двух клиентов итог рядом со своими числами выдаёт второго клиента.
4. **Findings release для клиента** читаются из `ownCells`. Раунд в этот момент закрыт, результат тот же, что был; это канал отчёта клиента.
5. **Дашборд админа** (`adminClientCells`, `roleClientCells`, `cohortCells`) не меняется. Путь «фильтр клиента + alle» для админов остаётся, как решено: админы видят строки (ADR-021, вариант B).

## Приватность и остаточные риски

- **2D-разбиения внутри `all_clients` (новый пункт BACKLOG, найден при закрытии I1, существовал и раньше).** Разбиения по клиентам и по ролям подавляются независимо. При известной структуре — у какого клиента какие роли — итог роли минус видимый клиент, целиком лежащий в этой роли, изредка выдаёт группу < k. Пример на настоящем коде: k0 (1 ответ, r1), k1 (4, все r1), k2 (1), k3 (1) и k4 (3) — все в r0; видны `all` 10, `role:r1` 5, `client:k1` 4 → k0 = 1. Генератор теста, 3000 раундов: 33 раунда с такой группой, 2 — целый клиент. Касается «alle» в любом канале, включая сводки по нескольким клиентам. Нужна совместная проверка двух разбиений при release `all_clients` и в живом виде. Решение 16.10 опирается на «alle», поэтому закрыть до этапа 4.
- **Итог «alle» перед клиентами.** Правило не пускает итог в собственный канал, но любой экран с числами «alle», показанный клиентам, вместе с отчётом клиента работает так же. Пример — «Før og etter» на проекторе семинара: `clientGroup` отдаёт итог раунда, когда группа — все ответившие клиенты, даже если кто-то из них скрыт. В раунде из двух клиентов B (5) и C (1) — а «Etter» из мастера бывает только с клиентами семинара — участники от B видят итог 6, а их руководитель знает из отчёта B = 5, значит C = 1. При трёх и больше клиентах нужен сговор всех остальных. Пока дашборд — канал админа, это вопрос показа; если «Før og etter» будут показывать участникам, итог группы со скрытым клиентом надо скрывать (BACKLOG, тот же пункт).
- **Класс `rows`** (строки ответов) — вне этого правила: его держат админ-сессия и AuditLog (ADR-021, ADR-025).
- **Живой вид** админа — как раньше: без истории выдач, принятый остаточный риск ADR-021.

## Выкатка

Миграций и изменений данных нет; меняются только код API (без изменений ответов эндпоинтов) и lint. Откат — `VARDE_SHA=f56f36dd32fa` (3c, в проде с 16.10), `up -d`; down-миграций нет. Выкатка — по полному локальному прогону шагов CI (GitHub Actions заблокирован лимитом) и только с разрешения Oleksandr.

## Выкатка 16.10

Влито `d0310ef`, выкачено `888668e3e400` (HEAD `888668e`) по полному локальному прогону 31/31 (2490 с, включая `ops-deploy`) с разрешения Oleksandr 16.10. Миграций нет («No pending migrations»). Первая выкатка скриптами `infra/ops/`: копия данных `/root/deploy-20261016-1946` (57 ответов, 5429 снимков), `/health` с версией, prod-check 27/27, ошибок в журнале 0, админский API без входа — 401. Откат: `rollback.sh f56f36dd32fa` (миграций нет).
