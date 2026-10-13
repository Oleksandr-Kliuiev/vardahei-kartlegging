# Evidence 0a — 2026-10-13
- Commit: `1755fbb7d01f45565497e4131745f3485a47bcdc` (ветка `varde/0a`, последний коммит кода; этот файл добавлен следующим коммитом и только он); образ на VPS: не применимо (VPS с 0b)
- Манифест одобренного пакета этапа: значение одобрения в репозитории не найдено (в `astra/` есть только `delta-12-10-approval.md` прежнего артефакта) — **pending, сообщает оркестратор**; вычислен на commit командой §10: `872d7702b0c3cec578ef94cd1a28c733294f6bd64aed50f7c7c61b9e676ea1d9` — совпадает: не проверено (нет эталона)
- `git diff 2ee5524 --stat -- docs/varde/ARCHITECTURE.md docs/varde/PRINCIPLES.md docs/varde/STAGES.md docs/varde/adr docs/varde/stages` → пусто (база ветки `2ee5524`); `kartlegging/`, корневые `package.json`/`package-lock.json` не изменены
- Модель и усилие кодера: claude-opus-5-5, medium; fallback/несоответствие: нет
- CI: https://github.com/Oleksandr-Kliuiev/vardahei-kartlegging/actions/runs/38388094618 — success на `1755fbb`, jobs `check`, `integration`, `image`, `secrets` зелёные. Ветка запушена один раз в конце, поэтому промежуточные коммиты задач отдельного run не имеют.

Коммиты задач: 0.1 `05d02f5`, 0.2 `5e86209`, 0.2b `a9ddf4e`, 0.3 `072ffdc`, 0.4 `6055c15`, 0.4b `1755fbb`.

## Команды проверки (из пакета) и фактический выход

Локально: macOS arm64, Node 25.8.1, pnpm 11.11.0, Docker 29.5.3; Postgres из `infra/compose.dev.yml` (порт 5434 через `VARDE_DEV_PG_PORT`, см. отступления). CI: ubuntu-24.04, Node 22.

| Команда | Ожидалось | Получено |
| --- | --- | --- |
| `pnpm install --frozen-lockfile && pnpm check` | exit 0, все пакеты в выводе | exit 0; lint/test/build `Done` у apps/admin, apps/api, apps/runner, packages/rules, packages/schema, tools/context-budget, tools/docs, tools/eslint-rules, tools/invariants |
| `(cd packages/rules && node -e "import('@varde/rules')…")` | `ERR_PACKAGE_PATH_NOT_EXPORTED` | `ERR_PACKAGE_PATH_NOT_EXPORTED` |
| `pnpm secrets` | exit 0, оба прогона «no leaks found» | exit 0; dir: `no leaks found`; git: `no leaks found` |
| `pnpm secrets:selfcheck` | exit 0, `selfcheck: planted secret rejected` | exit 0, `selfcheck: planted secret rejected` (5 прогонов подряд стабильно) |
| `pnpm --filter @varde/tools-invariants test -- workflow` | зелёный | зелёный, 11 tests (фильтр `-- workflow` vitest не применил — прогнаны оба файла пакета) |
| `docker buildx build --platform linux/amd64 -f infra/Dockerfile . -t varde-api:0a --load` | exit 0 | exit 0 (на HEAD); контейнер жив через 5 с без базы; `test -f /out/config/db-budget.json` → 0; uid 1000 |
| `pnpm budget` | exit 0, «0 files over 700» | exit 0, `53 files scanned, 0 files over 700` |
| `pnpm budget:selfcheck` | exit 0, `selfcheck: 701-line file rejected` | то же |
| `pnpm lint:privacy:selfcheck` | exit 0, `selfcheck: bypass rejected` | то же |
| `pnpm --filter @varde/tools-eslint-rules test` | 2 файла, зелёные | 2 files, 33 tests passed |
| `pnpm --filter @varde/tools-docs test` | 3 файла, зелёные | 3 files, 9 tests passed |
| `ls ../docs/varde/REVIEW-CHECKLIST.md ../docs/varde/AI_CONTEXT_MAP.md ../docs/varde/WORKFLOW.md ../docs/AI_CONTEXT_MAP.md` | все есть | все есть |
| `docker compose -f infra/compose.dev.yml up -d` | Postgres поднят | healthy (с `VARDE_DEV_PG_PORT=5434`) |
| `DATABASE_URL=<dev> pnpm --filter @varde/api db:migrate` | «1 migration applied» при первом запуске | первый запуск: `20261013120000_audit_log` applied, `All migrations have been successfully applied.` |
| `DATABASE_URL=<dev> pnpm --filter @varde/api test:integration` | 4 файла, зелёные | 4 files, 6 tests passed (локально и в CI) |
| `pnpm invariants:0a` | exit 0, шесть блоков с «ok» | exit 0: `[1/6] context-budget: ok` … `[6/6] no secrets in .env examples: ok`, `invariants 0a: 6/6 ok` (локально и в job `integration`) |
| job `image`: `migrate deploy` из образа против service Postgres | миграции применены | success |

## Fixtures
| Файл | sha256 |
| --- | --- |
| `varde/tools/eslint-rules/fixtures/bypass.ts` | `47344d26759af7535a16aa9e0b05665f7b71266ad73c6ef36c8471b00c4598a9` |
| `varde/apps/api/prisma/migrations/20261013120000_audit_log/down.sql` | `9c36d59923f70550a4fe10df82348190ca168cc18c49ca799fbc890dba6f50f4` |
| `varde/apps/api/prisma/migrations/20261013120000_audit_log/migration.sql` | `87198428e4df8c3d3e799c8e7eb9c48ff3f5c0277128c7e144aeee37050cfc44` |

## Отклонения паритета / принятые отступления
1. **Путь evidence.** Бриф оркестратора назвал `docs/varde/stages/stage-0/0a-evidence.md`; пакет (0a.md §0.4b, stage-0.md §2, §6, §10) — `docs/varde/evidence/stage-0/0a-evidence.md`. Взят путь пакета: `stages/` входит в манифест, файл там изменил бы его значение.
2. **Evidence отдельным коммитом** после зелёного CI: в evidence нужен URL run того коммита, на который он ссылается.
3. **Ложное срабатывание gitleaks в истории.** `generic-api-key` на прозе таблицы модели данных в старой ревизии `docs/varde/ARCHITECTURE.md` (commit `161b7c1`, строка 57, «key, kind (…)»), секрета нет. Подавлено точным fingerprint в `varde/.gitleaksignore`; флаг `--gitleaks-ignore-path /repo/varde/.gitleaksignore` добавлен во все прогоны одинаково (CI и локально). Правила и пути не ослаблены.
4. **Монтирование git worktree.** `tools/secrets/lib.sh` при работе из worktree дополнительно монтирует общий `.git` read-only по его абсолютному пути и задаёт `safe.directory` через `GIT_CONFIG_*` (контейнер с другим uid). В CI (обычный checkout) это не используется.
5. **Порт dev-Postgres.** На машине кодера `127.0.0.1:5433` занят чужим контейнером; в `compose.dev.yml` порт стал `${VARDE_DEV_PG_PORT:-5433}` — по умолчанию 5433, как в пакете.
6. **Версии зависимостей.** pnpm 11 (`minimumReleaseAge`) отклонил свежие typescript-eslint 8.71.2 и zod 4.6.7 — взяты 8.71.1 и 4.6.5 вместо добавления исключений. NestJS — 11.2.7 (dist-tag `legacy`, как требует пакет; latest — 12). TypeScript 5.9.3 (typescript-eslint не поддерживает 7.x), ESLint 9.39.5 (eslint-plugin-import не поддерживает 10), jsdom 26.1.0 (30.x не ставится на Node 25 у кодера), Preact 10.29.8.
7. **`allowBuilds: esbuild: false`** в `pnpm-workspace.yaml`: tsx (запуск `db:seed`) тянет esbuild, и pnpm 11 падает на неразрешённом build-скрипте; его postinstall только проверяет бинарник.
8. **`apps/api` — `postinstall: prisma generate`**, чтобы lint/test/build видели сгенерированный client сразу после `pnpm install`; в образе generate выполняется явно в `/out` (0.2 п. 3).
9. **Exports `@varde/rules` и `@varde/schema` указывают на `src/*.ts`** (потребители в этапе 0 — vite/vitest); `build` пакетов эмитит `dist`, но exports на него не смотрят. Когда api начнёт импортировать `@varde/rules` в рантайме Node, exports нужно перевести на `dist` (или condition) — решение следующего потребителя.
10. **Область `varde/privacy-only-release`:** пакеты с зависимостью `@prisma/client` (сейчас `apps/api`) плюс `apps/api` всегда (там живёт selfcheck). Тип распознаётся по имени символа/alias, по базовым классам (для `PrismaService extends PrismaClient`) и по тексту типа (для `Omit<PrismaClient, …>` у настоящего `TransactionClient`).
11. **`--log-opts` git-скана** по путям Varde также захватывает `.github`, как в пакете; в job `integration` checkout с `fetch-depth: 0`, чтобы блок секретов в `invariants:0a` видел историю.

## Внешние входы (§5a)
| Вход | Статус | Где доказательство |
| --- | --- | --- |
| GitHub Actions включены в приватном репозитории | готово | run 38388094618 |
| Факты о VPS (`atlas-db-1` 17.6, Caddy, сети, compose) | не требуется в 0a; подтверждает хостинг-оператор к 0.6 | — |

## Инварианты, проверенные в этом checkpoint
| Инвариант | Тест (файл::имя) |
| --- | --- |
| Context-budget | `varde/tools/context-budget/check.test.ts::rejects a 701-line file`; `pnpm budget:selfcheck` |
| Обход privacy (заглушка) | `varde/tools/eslint-rules/test/privacy-only-release.test.ts::privacy-only-release` (8 valid, 12 invalid); `pnpm lint:privacy:selfcheck` |
| Границы импорта, нет barrel | `varde/tools/eslint-rules/test/boundaries.test.ts::import boundaries`; `varde/packages/rules/test/entrypoints.test.ts::has no root export (no barrel)` |
| Миграции вперёд/назад | `varde/apps/api/test/migrations.test.ts::deploy → down.sql in reverse → empty → deploy → matches schema` |
| Секреты в рабочем дереве и истории Varde | `pnpm secrets`, `pnpm secrets:selfcheck` |
| `.env.example` без значений | `varde/tools/invariants/test/no-secrets-in-examples.test.ts::.env examples contain names only` |
| CI без `secrets.`, `contents: read`, actions по SHA | `varde/tools/invariants/test/workflow.test.ts` |
| Приложение стартует без базы, слушает `0.0.0.0` | `varde/apps/api/test/prisma-lazy.test.ts`, `varde/apps/api/test/main-listen.test.ts`; job `image` |

## Шаги хостинг-оператора на VPS (§5b): runbook-шаг, вывод команд без секретов, тег образа, выполненный откат (если был)
В 0a шагов на VPS нет.

## Держатели доступа (0.5b/0.8/0.10d/0.12b): SSH/root и группа docker на VPS; superuser atlas-db-1 (по имени); app.env и backup.env; приватные ключи age (где лежат: зашифрованный диск, без пароля); временные секреты проверок уничтожены (дата)
Не применимо в 0a. Кодер не получал доступа к VPS и секретам; тестовые пароли — литералы локального dev/CI Postgres (`varde-dev`, `varde-ci`), синтетический ключ selfcheck генерируется при запуске и удаляется.
