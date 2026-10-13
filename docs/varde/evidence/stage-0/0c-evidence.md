# Evidence 0c — 2026-10-13

- Commit: `20c2b0d` (ветка `varde/0c` от `main` = `390f374`; HEAD кода, этот файл добавлен следующим коммитом, и только он); образ на VPS: деплой не входит в задачу (кодер на VPS не ходит); privacy и release в 0c в `AppModule` не смонтированы, на VPS меняется только `GET /` (заглушка главной)
- Манифест пакета этапа: вычислен на commit командой §10: `a3b224512214e8f5a12ddfeaeec4c3e6c1c20d77df3df061ac3d8b1c5c74dfe0`. С одобренным значением 0a/0b (`872d7702…ea1d9`) **не совпадает**: `stages/` изменены в `390f374` (решения 13.10, 0.17 → этап 4, правка оркестратора на `main`, не кодера); на базе ветки `390f374` значение то же, что на HEAD
- `git diff 390f374 --stat -- docs/varde/ARCHITECTURE.md docs/varde/PRINCIPLES.md docs/varde/STAGES.md docs/varde/adr docs/varde/stages` → пусто; `kartlegging/`, корневые `package.json`/`package-lock.json` не изменены
- Модель и усилие кодера: claude-opus-5-5, medium; fallback/несоответствие: нет
- CI для HEAD кода `20c2b0d` (jobs `check`, `integration`, `e2e`, `image`, `secrets` — success): https://github.com/Oleksandr-Kliuiev/vardahei-kartlegging/actions/runs/38443480617

Коммиты задач: 0.16 `93ea57f`; 0.15 `7cafa49`; 0.15b `07cc715`; 0.19 `ac5de05`; 0.18 `95814d4` (тексты — **pending (Oleksandr)**); 0.19b `81989ca`; fix gitleaks `89acd8e`; заглушка главной (решение 13.10) `20c2b0d`. **Не выполнялась:** 0.17 — перенесена в этап 4 (решение Oleksandr 13.10).

## Команды проверки (из пакета) и фактический выход

Локально: macOS arm64, Node 25.8.1, pnpm 11.11.0, Docker; Postgres `infra/compose.dev.yml` проектом `varde-dev-0c` на порту 5435 (`VARDE_DEV_PG_PORT`). Фильтры `pnpm --filter … test -- <имя>` не фильтруют (как в 0a/0b) — команды выполнены прямым `vitest run <файл>`.

| Команда | Ожидалось | Получено |
| --- | --- | --- |
| `pnpm --filter @varde/schema test` (0.16) | 2 файла, ≥ 13 тестов | `metric-definition.test.ts` 18 + `aggregate-snapshot.test.ts` 8 (+ прежний `nn-stoplist` 4) = 30 passed |
| `ls packages/schema/fixtures/metrics/*.json` | 4 файла | 4 |
| `vitest run test/privacy` + `--config vitest.integration.config.mts test/privacy/rows.test.ts` (0.15) | ≥ 17 | aggregate 11 + http 2 + rows 8 = 21 passed |
| `pnpm lint` с ужесточённым правилом (0.15) | зелёный | exit 0 |
| `vitest run test/privacy/release.test.ts` (0.15b) | ≥ 9 | 11 passed |
| `vitest run test/retention.config.test.ts` + `@varde/tools-docs vitest run test/retention-doc.test.ts` (0.19) | зелёные | 8 + 4 passed |
| `@varde/runner vitest run test/notice-v2.test.ts` (0.18) | зелёный | 10 passed; утверждение — pending (Oleksandr) |
| `pnpm invariants:0c` (0.19b) | exit 0 | `invariants 0c: 8/9 ok, 1 deferred 13.10 (0.17 → stage 4)`, exit 0 |
| `pnpm invariants:0a` | 6/6 ok | `invariants 0a: 6/6 ok` |
| `pnpm invariants:0b` | как в 0b | CI: `6/7 ok, 1 deferred`; локально блок 3 FAILED: TCP 3001 занят чужим процессом на Mac (`node`, не Varde) — тест «nothing on TCP 3001» получает `connected` |
| `pnpm check` | exit 0 | lint, build зелёные; test — единственный сбой тот же `break-glass.test.ts` (порт 3001 локально), остальное зелёное |
| `vitest run test/home.test.ts`; `pnpm --filter @varde/admin e2e` (главная) | зелёные | 5 passed; e2e 4 passed (3 прежних + `home.spec.ts`) |
| `pnpm budget` | 0 файлов > 700 | `146 files scanned, 0 files over 700` |
| `pnpm secrets`, `pnpm secrets:selfcheck` | no leaks | dir и git: `no leaks found`; selfcheck `planted secret rejected` |

### CI

Прогон `20c2b0d`: https://github.com/Oleksandr-Kliuiev/vardahei-kartlegging/actions/runs/38443480617 — все пять jobs success. Job `integration`: `invariants 0a: 6/6 ok`; `invariants 0b: 6/7 ok, 1 deferred 13.10 (block 8 roundtrip in job image: deferred, 0.10c)` (блок break-glass, красный локально из-за порта 3001, в CI зелёный); `invariants 0c: 8/9 ok, 1 deferred 13.10 (0.17 → stage 4)`. Job `e2e`: 4 passed (с `home.spec.ts`). Красный прогон `7cafa49` (38441282739): `secrets` — gitleaks на имена метрик, исправлено `89acd8e`; промежуточные прогоны `81989ca`, `89acd8e` отменены concurrency.

## Fixtures

| Файл | sha256 |
| --- | --- |
| `varde/packages/schema/fixtures/metrics/comparability-f-anchors.v1.json` | `44185332f21b8fa3aa964b0a9384c40c5d9525a501110e89a8be9477382b1140` |
| `varde/packages/schema/fixtures/metrics/k7xk8.v1.json` | `e970b2bc21cae4bf537fecfa0af381189a321aa4a444c09296ee3bfc877deac4` |
| `varde/packages/schema/fixtures/metrics/leaders-distribution.v1.json` | `41488d92460c1c6144e4b53c69353bcbed26df391587ead7c0f94ab4f3db4c98` |
| `varde/packages/schema/fixtures/metrics/zone.v1.json` | `4abfb5affd043be8071faf066f62dd2b7da3667c7a849c4e6e0c4769d52914e8` |
| `varde/apps/api/test/support/fixture-source.ts` (fixture-source privacy) | `1da404a2ce496c1318fb3475c25fee00ac29b09499bfec8dfe45781fc3d87813` |
| `varde/apps/runner/src/i18n/notice-v2.nn.json` (не утверждено) | `f67c26530a91c5617f63ef6a550076afd821353276873d4465dc011631e33d88` |
| `varde/apps/runner/src/i18n/notice-v2.en.json` (не утверждено) | `dcbecbecdab92896dd9e9e58b89008d01285288494d6b904220f7d49c4b90d81` |
| `varde/apps/runner/src/i18n/notice-v2.nb.json` | `ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356` |

Инициалы в fixture-source выдуманы (`AAXYZ` …); реальных ответов и `runde1.js` кодер не читал.

## Отклонения паритета / принятые отступления

1. **0.17 не выполнена** — перенесена в этап 4 (решение 13.10). Блок 6 `invariants:0c` помечен `deferred`, не `ok`.
2. **0.16, comparability F-якорей.** `comparability-f-anchors.v1.json` — отдельный объект пояснения (схема `ComparabilityNote`), не MetricDefinition; четыре метрики зон ссылаются на него через `comparability[].to = tryggleik.runde1_f_anchors@1` (`degree: comparable`). Текст пояснения — на нюношке, проверен `findBokmal`. Метрики K7×K8 и B13 — первая версия (`first_version: true`, пустая `comparability`). Пороги зон заданы как `{bounds, compare}` (`>=` для person, `>` для aggregate). Ключи вопросов — `F3`…, варианты — ключи `sporsmal.js` (`ja`, `sjeldan`, `avogtil` …; для K7/K8 и B13 взяты из `sporsmal.js`, т.к. в сводке `docs/sporsmal.md` только подписи).
3. **0.16, переход `computed → released`.** В `@varde/schema` его нет; объект `ReleasedSnapshot` строит только module-private `markReleased` в `release.ts`. Тип — `Readonly`, объект заморожен (`Object.freeze`); триггер БД — 1.4c.
4. **0.15, `rows`.** Порядок в транзакции: `auditLog.create` (round, client, view) → чтение → `auditLog.update` с `count` (число известно только после чтения; обе записи в той же транзакции). `perEmployee` / `masterAnalyseExport`: проверка сессии (401) → режим раунда (404 в `none`, до транзакции и без AuditLog) → `rows` с `view` в details. `PrivacyViolation` → 403 (наследует `ForbiddenException`).
5. **0.15, модуль Nest.** `PrivacyService` и `privacyProviders(source)` — в `privacy.service.ts`; отдельного `privacy.module.ts` нет (правило границ 0.2b разрешает снаружи только `privacy.service`). В `AppModule` privacy не смонтирован: реального `ResponseSource` нет до таблицы Response (1.4b).
6. **0.15, lint.** `DEFAULT_ALLOW` сужен до `modules/privacy/privacy.service.ts`, `modules/privacy/source.ts` и `apps/api/prisma/**`; тест «другие файлы privacy не читают `response`» добавлен.
7. **0.15, зависимость `@varde/schema` в api.** Пакет экспортирует `.ts`-исходники; vitest и `tsc` их принимают, но в `dist` api runtime-импорт `@varde/schema/...` не загрузится в Node. В 0c это не срабатывает: privacy не подключён к `AppModule`, образ и `/health` в CI зелёные. Перед подключением privacy к приложению (1.4b) нужна сборка `@varde/schema` в `dist` и `exports` на неё — риск записан.
8. **0.15b.** `release()` получает AuditLog-синк через `PrivacyService.release()` (`prisma.auditLog.create`); `release(round, population, cells, store, actor)` на сервисе, deps (config, audit) — шестой аргумент внутренней функции. Блок без группы `all` (например, обрыв по вопросу) не имеет отношения «итог − роль»: каждая группа проверяется отдельно. Подавленная ячейка хранится с нулями (`n = numerator = denominator = missing = 0`, `suppressed: true`); ячейка, не предложенная в новом release, переносится как есть со `stale` (выданное не «развыдаётся»). Атомарность save + AuditLog — Prisma-store 1.4c.
9. **0.19.** Тексты процедур внешних копий — по-русски (читатели — Oleksandr и хостинг-оператор). Строки бэкапа и `restore-kopi` описывают правило на будущее: бэкап (0.10) и restore (0.10d) отложены 13.10.
10. **0.18.** Хранение и право клиента в анонимном режиме записаны в `notice.anonymous.client_gets` (в пакете нет отдельных ключей) — вопрос 2 к Oleksandr в `docs/varde/texts/notice-v2.md`. Формулировка `who_sees` — дословно по пакету (вопрос 1).
11. **0.19b.** Fixture selfcheck теперь — обход из `modules/dashboard` (`tx.response.findMany` и `include: { responses: true }`); selfcheck требует оба нарушения. `pnpm invariants:0c` добавлен в job `integration` (`.github/workflows/varde.yml`, одна строка). В `0c-no-leak-keys.test.ts` снимки release (тип с обязательными числами) проверяются так: подавленные — все числа 0, `stale` — ровно прежнее released значение; ячейки `aggregate()` — без ключей чисел.
12. **gitleaks.** `generic-api-key` срабатывал на имена метрик (`key`/`metric_key` + точечное имя). В тестах — константы; для двух fixtures и трёх уже запушенных коммитов — точные fingerprints в `varde/.gitleaksignore` с пояснением (правило «только fingerprints, не пути и не правила» соблюдено).
13. **Заглушка главной (решение 13.10, вне пакета 0c).** `GET /` — `src/home/` (HTML на сервере, без SPA и зависимостей); сессия — через `SessionService.resolve` (те же правила, что `AdminSessionGuard`); `ENTRA_SETTINGS` добавлен в exports `AuthModule` (origin issuer для `form-action`, logout редиректит на end-session Entra). Заголовки: CSP `default-src 'none'; style-src 'sha256-…'; img-src data:; base-uri 'none'; form-action 'self' <issuer>; frame-ancestors 'none'`, `cache-control: no-store`, `nosniff`, `referrer-policy: no-referrer`, `x-frame-options: DENY`. Раньше заголовков безопасности не было ни в api, ни в блоке Caddy — ничего не ослаблено. Шрифт: `"Atkinson Hyperlegible"` по имени (если установлен) + системный fallback, без CDN. Логотип — `kartlegging/private/logo.b64`, встроен (`src/home/logo.ts`). Решения о главной в `docs/BESLUTNINGER.md` нет — бриф оркестратора ссылается на решение 13.10.
14. **Локальная среда.** Docker Desktop остановился во время работы (≈ 19:42) и был запущен снова (`open -a Docker`); контейнеры с restart-policy поднялись, остальные (в т. ч. `varde-dev-postgres-1`, `customers-crm-*`, `atlas-pilot-pg`, `vardahei-atlas-stage1-v11-postgres-1`) могли остаться остановленными — кодер их не запускал. Свой Postgres — `varde-dev-0c` (5435).

## Внешние входы (§5a)

| Вход | Статус | Где доказательство |
| --- | --- | --- |
| OpenAPI Atlas и пример observation (0.17) | отложено: 0.17 → этап 4 (решение 13.10) | — |
| Утверждение текстов уведомления v2 (0.18, G2) | **pending (Oleksandr)**, нужно к 1.13d | `docs/varde/texts/notice-v2.md` (вопросы 1–3, hash текущей версии); после утверждения — `0.18-approval.md` |

## Инварианты, проверенные в этом checkpoint

| Инвариант | Тест (файл::имя) |
| --- | --- |
| k = 3, подавленная ячейка без чисел, «итог − роль», малые клиенты только в сумме | `varde/apps/api/test/privacy/aggregate.test.ts::privacy aggregate (0.15)` |
| part × population: leader только `leaders_all`, common не в `leaders_all` | `aggregate.test.ts`; `varde/packages/schema/test/metric-definition.test.ts::MetricDefinition refinements (0.16)` |
| `rows`: 401 без сессии, AuditLog в одной транзакции (сбой AuditLog → нет строк, сбой чтения → нет записи), `respondent_key` только в `initials`, leader нет, details без ответов | `varde/apps/api/test/privacy/rows.test.ts::privacy rows (0.15)` |
| HTTP: `/test/rows` без cookie → 401, `/test/per-employee` в анонимном → 404 | `varde/apps/api/test/privacy/privacy-http.test.ts` |
| История выдач, `ReleaseRejected`, superseded с reason, `responses_total` точный, без actor → отклонено, `markReleased` не экспортируется, `aggregate()` не пишет в store | `varde/apps/api/test/privacy/release.test.ts::privacy.release (0.15b)` |
| released неизменяем, переходы, нет экспорта перехода в released | `varde/packages/schema/test/aggregate-snapshot.test.ts::AggregateSnapshot (0.16)` |
| Вывод privacy (кроме `rows`) без `respondent_key`, `answers`, `submission_id`, инициалов; подавленные/`stale` без лишних чисел; нет `leaders_all` в `round_client`/`all_clients` | `varde/apps/api/test/invariants/0c-no-leak-keys.test.ts` |
| Обход privacy из `modules/dashboard` | `pnpm lint:privacy:selfcheck`; `varde/tools/eslint-rules/test/privacy-only-release.test.ts` |
| Retention: у ответов нет таймера, 128 = 35 + 93, реестр = конфиг | `varde/apps/api/test/retention.config.test.ts`, `varde/tools/docs/test/retention-doc.test.ts` |
| Тексты v2: ключи nn = en, нет букмола, нет `anonym` в identified, нет обещаний срока и «aldri/never» рядом с клиентом | `varde/apps/runner/test/notice-v2.test.ts::notice v2 (0.18)` |
| Всё одним прогоном | `pnpm invariants:0c` (`varde/tools/invariants/run-0c.sh`) |
| Главная: без сессии — ссылка на `/auth/login`; с сессией — имя (экранировано) и logout; строгая CSP, без внешних URL | `varde/apps/api/test/home.test.ts`; `varde/apps/admin/e2e/home.spec.ts` |

## Шаги хостинг-оператора на VPS (§5b)

В 0c шагов на VPS нет. Деплой заглушки главной — по решению оркестратора (кодер не деплоит).

## Держатели доступа

Без изменений относительно 0b (`0b-evidence.md`, `0b-vps-evidence.md`); кодер доступа к VPS и секретам не получал.
