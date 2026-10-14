# Checkpoint 1c — исправления условий приёмки

14.10.2026, Codex. Без коммитов и push. Исходные изменения `docs/BACKLOG.md` и `varde/tools/invariants/test/workflow.test.ts` сохранены. Production cutover и CI на новом коммите — **pending**.

Исправления: I2 — общая `runde1SourceId` с сырым `(k, init)` для импорта и rollback; I3 — normalizeRespondentKey и лимит 8 вместо ASCII-regex, HTTP-тесты на норвежскую букву, длины 1/8, нормализацию и отклонение пустого/длинного ключа; I4 — точный состав клиентского CSV и снимков handover, живой дашборд с n=2 и дополнительным подавлением n=3. Мутации M8, M14 и M7 воспроизведены по отдельности: каждый новый тест падает с AssertionError, после проверки исходники восстановлены. На старой очистке I2 падают все три новых случая.

m1: rsync исключает `private/runde1.js`, compose использует `up -d --force-recreate`; `SU()` определена также в блоках дня cutover (2) и no-go. Общий модуль ключа включён в инструкции копирования CLI с сохранением относительных путей. Репетиция печатает каждый из восьми шагов; [результат](1.34-rehearsal.md).

Проверки из `varde/`, Node 22.22.2, `pnpm_config_verify_deps_before_run=false`:

| Команда | Результат |
| --- | --- |
| `pnpm check` | lint, 562 unit-теста, build — passed |
| `pnpm --filter @varde/api exec vitest run --config vitest.integration.config.mts test/imports/runde1-import.test.ts test/retention/forget.test.ts test/retention/handover.test.ts test/exports/csv.test.ts test/dashboard/privacy-filters.test.ts` | 5 файлов, 50 passed |
| `pnpm invariants:1c` | 9/9 ok; integration 109 passed, 1 skipped; также privacy-lint, legacy read-only, инструменты и runbook |
| `pnpm parity:golden --refresh-manifest` | existing SHA256 файлов verified; manifest не изменился |
| `bash -n tools/cutover/rehearsal.sh`, `git diff --check` | passed |

Причина прежней правки `tools/parity/golden/manifest.json`: в `f5b8c8b` tree-hash kartlegging изменён с `153ba0c55a8633f99072fd13d36f5376b0d125e1` на `128e03629e958bc37871a4a2b66d44305925b7aa` вслед за read-only правками `kartlegging/server.js` и `deploy/compose.yaml` (1.34). Это идентичность дерева исходников, не пересчёт golden-значений или fixtures. Текущий `HEAD:kartlegging` совпадает с manifest; команда refresh ничего не изменила. Браузерный паритет заново в этом задании не запускался.

Отклонение среды: первый integration-прогон на заданной `varde_ci` остановлен — в ней уже около 1,95 млн снимков, проверки замедлились и существующий сценарий отправки получил 409. Успешные прогоны выполнены в отдельной временной базе на том же разрешённом localhost Postgres; база удалена после проверки. Единственный skip — существующий `forget-restore.test.ts`, требующий `VARDE_RESTORE_DOCKER=1`; Docker dump/restore и CI остаются непроверенными в этом запуске. VPS, деплой и реальные данные не затрагивались.
