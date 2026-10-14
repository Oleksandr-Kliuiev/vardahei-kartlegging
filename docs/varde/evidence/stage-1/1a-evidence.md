# Evidence 1a — 2026-10-13

- Ветка `varde/1a` от `main` = `18153c3`; commit checkpoint — HEAD ветки (коммит 1.11 и этот файл). Образ на VPS — после merge (хостинг-оператор, `1a-vps-evidence.md`).
- Манифест пакета (команда §11 из `docs/varde/`): `efe92e4e08a4b8bba1c8aa34b16c7132410d6b5b7559b36f8122bbfe7756ebdc`. `evidence/stage-1/package-approval.md` в репо нет (пакет принят оркестратором 13.10 без файла) — сравнение pending у оркестратора.
- `git diff 18153c3 --stat -- docs/varde/{ARCHITECTURE,PRINCIPLES,STAGES}.md docs/varde/adr docs/varde/stages` → пусто.
- Модель и усилие кодера: claude-opus-5-5, medium; fallback нет.
- CI: зелёный run на HEAD `varde/1a` (URL — в отчёте кодера).

## Коммиты по задачам

| Задача | Commit |
| --- | --- |
| (docs) WORKFLOW.md = PRINCIPLES §20 (тест `workflow-matches-principles` падал на `main`) | `7b1642c` |
| 1.0 | `59fd413` |
| 1.1 | `40864c1` |
| 1.6 | `1b4f14f` |
| 1.2 | `11e7030` |
| 1.2b | `e076f99`, fix `039dfb8` (детерминированный shuffle: `sort` со случайным компаратором зависел от версии V8) |
| 1.2c | `13a56e5` |
| 1.4a | `1560af0` |
| 1.5 | `3438002` |
| 1.4b | `c79b296`, fix `e6c0efb` (invariants 0b собирает `@varde/api...`) |
| 1.4c | `95c66a6`, fix `0091154` (gitleaks: имя метрики константой + fingerprint) |
| 1.7 | `8a09416` |
| 1.8 | `50b38c1` |
| 1.9 | `420a6fa` |
| 1.10 | `7e89ba6` |
| 1.10b | `2d35d3e` |
| 1.11 | HEAD |

## Команды проверки и выход (локально, Postgres 17.6 в Docker, `VARDE_DEV_PG_PORT=5436`)

| Команда | Получено |
| --- | --- |
| `pnpm check` | зелёный |
| `pnpm budget` | 0 files over 700 |
| `pnpm invariants:0a` / `0b` / `0c` | 6/6 ok; 6/7 ok, 1 deferred; 8/9 ok, 1 deferred |
| `pnpm invariants:1a` | `invariants 1a: 8/8 ok` |
| `pnpm --filter @varde/api test:integration` | все файлы passed |
| `grep -rln -e VARDE_STUB -e modules/stub -e stub-config -e demo.hold-connection apps/api/src apps/api/.env.example config tools infra` | пусто |
| `pnpm --filter @varde/tools-convert convert --check --from ../kartlegging/public/sporsmal.js` | `diff-report: 0 differences` |
| `pnpm parity:fixtures --check` | `fixtures identical` |
| `pnpm parity:golden --check` | `golden: 21 files identical` |
| `node apps/api/dist/cli.js import svar --file tools/parity/fixtures/svar.synthetic.jsonl --dry-run` | счётчики = `fixtures/README.md` (tryggleik 78/11, KI 61/9, KI 2026-10-12 5/3, rejected 6/2) |
| `node apps/api/dist/cli.js import runde1 … --dry-run` | `accepted 40` |
| `docker run varde-api node -e "import('@varde/schema/metrics/populations')…"` | `schema ok` (локальная сборка образа; в CI — шаг job `image`) |
| `pnpm secrets` | no leaks found |

## Fixtures и golden

| Файл | sha256 |
| --- | --- |
| `svar.synthetic.jsonl` | `9ca00bcb8d3d282b1ca2032409d35d6e67fca93c302764e0a64f0cb92a9a6aba` |
| `runde1.synthetic.js` | `f0eb8f166bd594898bf0695e7a6f2356e0f8d8049cb5347ffe0d855df20f03a4` |
| `tilgang.json` | `87725896e43875673b44364dfb78d5fae1f8ae5173b53a5840068e533e58a4f6` |
| `kundar.json` | `713e58cf49791cdee75d41196dc1e6e2f344af4842eed94012feb9e3d8db7b40` |
| `README.md` | `e01f30117067765f30853d9ef6a89aadaae8fe787e16fae0895012361c8fe8c7` |

Tree-hash `kartlegging/` в `golden/manifest.json`: `153ba0c55a8633f99072fd13d36f5376b0d125e1`; 21 файл golden (14 видов прогона (а) + `analyse.csv`, 5 видов прогона (б), manifest).

## Отклонения паритета §6, затронутые в 1a

- п. 1 — подавление малых групп сверх `minGruppe` (tharaso n = 2; роли с дополнительным подавлением; leader-вопросы и KI 2026-10-12 с n < 3) — в `parity.test.ts` с номером.
- п. 2 — часть руководителя при «alle» только из `leaders_all`, без имён клиентов.
- п. 9 — путь показа при импорте не пересчитывается; `dropped_answers = 0` на fixtures.
- п. 11 — golden двумя прогонами старого сервера (а)/(б).

## Отступления от пакета (что, почему)

1. Языковые ворота: `short_label` (`kort`) и подписи уровней зон — только nn (в kartlegging это админ-подписи без en); остальные тексты — `nn` и `en`.
2. 1.5: решение по замороженному вопросу хранится в новой колонке `template_version.frozen_changes` (отдельная миграция); `SurveysModule` смонтирован в `AppModule` в 1.7 — до сборки `dist` (1.4b) образ не грузил `.ts` из `node_modules`.
3. Golden — универсальный снимок каждого вида по секциям (заголовок, таблицы, строки текста); `parity.test.ts` разбирает нужные числа. Округление как в старом `des()` (`toFixed`).
4. `persons_per_zone` раунда 1 сверяется с расчётом по fixture (порог `≥ [1, 2, 3]`): старый дашборд гистограмму раунда 1 не показывает.
5. Снимки: распределение — подметрика на вариант `<key>.<bucket>`; `mean_score`/`critical_share`/`zone` — подметрики `all` и по вопросу; ячейка `zone` хранит индекс уровня. Файлы `config/seed/metrics/*.json` — объект «ключ → определение» (строка `"key": "<имя.с.точками>"` ловилась gitleaks как API-ключ).
6. `PrismaSnapshotStore.listReleased` восстанавливает `ReleasedSnapshot` из базы приведением внутри `modules/privacy` (lint разрешает); `markReleased` остаётся единственным путём создания.
7. Раунды импорта сидятся сразу в статусе `closed`; `rounds close --imported` ставит `closed_at` и выпускает снимки; повторный запуск делает новый release с теми же значениями (`|Δn| = 0`).
8. Причины отклонения строк в manifest — коды (`no_id`, `duplicate_id`, `unknown_versjon`, `unknown_client`, `leader_empty`, …); в `fixtures/README.md` — описания.
9. CI: job `check` с `fetch-depth: 0` (конвертер читает `sporsmal.js` из `f26ee21`), `paths += kartlegging/**`, job `e2e` собирает `@varde/api...` и запускает `parity:golden --check`, job `integration` — `invariants:1a`.

## Внешние входы (§5a)

| Вход | Статус | Где доказательство |
| --- | --- | --- |
| Решения §10 | по умолчанию пакета | — |
| Подтверждение манифеста (`package-approval.md`) | pending | — |

## Инварианты 1a

| Инвариант | Тест |
| --- | --- |
| Миграции этапа 1 вперёд/назад | `apps/api/test/migrations.test.ts` |
| Неизменяемость опубликованной версии и released-снимка | `test/surveys/template-version.test.ts`, `test/privacy/prisma-snapshot-store.test.ts` |
| Повторный импорт `svar`/`runde1` — 0 новых | `test/imports/svar-import.test.ts`, `test/imports/runde1-import.test.ts` |
| `respondent_key` только в идентифицированных раундах; identifier не в `answers` | `test/response-constraints.test.ts`, `packages/rules/test/runner-normalize.test.ts` |
| Stub удалён | `test/stub-removed.test.ts` |
| Ужесточение 1.10b | `test/privacy/release.test.ts`, `test/privacy/rows.test.ts`, `packages/schema/test/metric-definition.test.ts`, selfcheck |
| Паритет снимков с golden | `test/metrics/parity.test.ts` |
| Полнота снимков (TRUNCATE response) | `test/invariants/1a-completeness.test.ts` |

## Новые зависимости

- `@playwright/test` 1.64.0 в `tools/parity` (та же версия, что `apps/admin`): golden старого дашборда.
- `tsx` 4.23.15 в `tools/convert` (уже в lockfile у api): CLI конвертера.
- `@varde/rules` в `apps/api` и `apps/runner`, `@varde/schema` в `packages/rules` (workspace).

## Исправления после приёмки (14.10.2026)

Приёмка 1a вернула Reject (blocking: восстановимые малые клиенты и роли в снимках `all_clients`; important: реэкспорт хранилищ ответов из фасада privacy; minor: живые мутанты, `normalizeFree`, manifest `failed` в импорте раунда 1). Исправления написал Codex (`gpt-6.1-sol`, effort high, песочница `workspace-write`, 146 тыс. токенов) — пилот; коммит и проверки на Docker/Chromium выполнил оркестратор. Подавление теперь считается отдельно по каждому разбиению (`client:*`, `role:*`), остаток «итог − видимые» учитывается как скрытая часть; `new PrismaResponseSource/ResponseStore` запрещены вне `modules/privacy` правилом lint. Проверки: `pnpm check`, integration 117/117, `invariants:1a` 8/8, `parity:golden --check` 21 files identical.
