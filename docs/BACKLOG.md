# Backlog

Порядок — предлагаемый. P1 — до рассылки клиентам, P2 — скоро, P3 — Varde.

## P1. До рассылки раунда 2

1. **Ответы шефа** (`BESLUTNINGER.md`, «Открытые вопросы»). Пороги и F4 решены по Master_Analyse.xlsx (12.10.2026). Правописание (исправленное нюношк) и блок B (оставляем) решил Oleksandr. Осталось только сказать шефу, что Raud у сотрудника недостижим.
2. ~~**Пройти опросник глазами шефа** на телефоне~~ — принято Oleksandr 12.10.2026.
3. ~~**Админка после 12.10.**~~ Сделано 12.10.2026: `tools/test/admin.test.js`, 31 проверка, всё зелёное.
4. **Деплой** — выкачено 12.10.2026 (коммит `fe694e2`): rsync кода, restart контейнера. Бэкап до выкатки: `/root/kartlegging-backup-20261012-2017.tgz` на VPS. Три ответа старой схемы перенесены в `data/svar.jsonl.2026-10-06`. Проверено снаружи: новые `sporsmal.js`, приватные страницы и `runde1.js` без входа закрыты (303/401), рабочая ссылка Daco даёт 200. Пароли все трое сменили (06–07.10). Тестовый ответ Oleksandr (12.10) убран в `data/svar.jsonl.test-2026-10-12`. **Готово к рассылке.** Файлы `svar.jsonl.2026-10-06` и `svar.jsonl.test-2026-10-12` можно удалить вручную.
5. **Персональные данные** → `docs/personvern.md`. VPS в Düsseldorf (ЕС). Осталось: проверить databehandleravtale с клиентами, внести запись в протокол, поправить два текста для сотрудников. Срок хранения: решение O 12.10 — бессрочно (`BESLUTNINGER.md`). Строку «Sletting» в записи для протокола (`personvern.md`) нужно переписать под это решение; рамки GDPR — в `astra/delta-12-10-brief.md`, §4, O2.
6. ~~**Git.**~~ Сделано 12.10.2026: приватный репозиторий https://github.com/Oleksandr-Kliuiev/vardahei-kartlegging (ветка `main`). `runde1.js` в git (решение O). Push из этой папки идёт от аккаунта Oleksandr-Kliuiev через локальный credential helper в `.git/config`, даже если активный аккаунт в gh другой. Доступ — дать Asbjørn и Bjarte при необходимости.

## P2. Улучшения kartlegging

7. **Экспорт для шефа:** Excel/CSV с зонами по человеку и вопросу в формате его Master_Analyse, чтобы он мог продолжать работать в Excel.
8. **Отчёт клиенту** (PDF или страница): зона фирмы, топ-3 проблемы, сравнение с раундом 1, что предлагаем. Без инициалов.
9. **Дашборд, KI-опросник:** не трогали после 06.10. Проверить на реальных ответах, когда появятся.
10. **Тесты:** превратить `tools/test/*.js` в `npm test` (Playwright test runner), запуск сервера внутри теста на временной `DATA_DIR`.
11. **Устаревшие страницы:** обновить или удалить документ «Опросник клиентов: вопросы и логика» и превью админки в claude.ai (`SAMMENDRAG.md`, таблица ссылок).

## P3. Платформа Varde

12. **Delta архитектуры под изменения 12.10** (неанонимный опросник, модель зон, импорт раунда 1 по людям, сравнение по людям, хранение): бриф `astra/delta-12-10-brief.md`. Пишет Fable, проверяет Astra, обе модели одобряют один артефакт. Решения O1–O5 из брифа — за Oleksandr.
13. ~~**Brainstorm с Astra, раунд 1**~~ — проведён 11.10 в локальной сессии Claude Code по rev 33 и коду kartlegging на 11.10: три раунда и три прохода одобрения. Итог — `docs/varde/` и `astra/final-summary.md`, перенесён в репо 12.10.
14. Пакет этапа 0 (`stages/stage-0.md`) — после одобрения delta и ответов Oleksandr по воротам G2 и G3 (`docs/varde/STAGES.md`).

## Varde: условия к задачам этапа 1 (из приёмки 0c, 13.10.2026)

Источник — приёмка checkpoint 0c (Opus 5.5 xhigh), minor; закрыть в указанной задаче.

- **1.4b** `@varde/schema` и `@varde/rules` отдают `.ts`: собрать в `dist` до подключения privacy к `AppModule`.
- **1.4c** `release()` неатомарен (supersede → save): хранилище снимков в одной транзакции с AuditLog; история ячейки — со всеми прежними released, набор метрик — на уровне раунда (ADR-021 п. 2, 4).
- **1.10** `release.ts`: проверять форму ячеек по population (`leaders_all` без client/role, `client` только в `round_client`); исключение точного счётчика — только `responses_total` × `round_client` × `all`.
- **1.10** `rows.ts`: тест с `respondent_key` у анонимных строк (модуль обязан срезать); `who` для break-glass — оператор, а не `break_glass:<sid>`.
- **1.10** `ReleasedSnapshot`: brand-тип и lint на приведение вне privacy; refine `first_version ⇒ version === 1` в MetricDefinition.
- **1.32** связь `round_client` X ↔ `all_clients client:X` в истории выдач.
- **этап 1** удалить stub `/stub/submit` (0.12 не планируется).
- **1.32 (lint privacy, minor из приёмки 1a):** `privacy-internals.js:16-17` проверяет только Literal в `import()` — шаблонная строка `` await import(`../privacy/prisma-source.js`) `` проходит; `new PrivacyService(prisma, src, {k:1, …})` вне privacy проходит lint — добавить `PrivacyService` в `PRIVATE_STORAGE` (`boundaries.js`).
- **1.22/1.32 (минор из приёмки 1b, дыры в тестах; код верный):** квота считает обе части (тест с leader-строками); код только из `Authorization`, не из `?c=` (тест); CSP целиком (`unsafe-inline`/`unsafe-eval`, `frame-ancestors`, `object-src`), а не только `default-src`; identifier под чужим ключом в `answers`; медиана прогресса без leader; свободный текст скрытого вопроса; гонки close/submit и между RoundClient; окно 24 ч в прогрессе; корень статики `dist/assets`.
- **1.23 (минор):** закодированный traversal (`/r/assets/..%2findex.html`) даёт 500 и полный stack `ForbiddenError` в логе (`query-safe-exception.filter.ts:38`) — отдавать 404 без stack; единый helper `auditWho` (`rounds.controller.ts:14` пишет `oid ?? sid`, break-glass должен писать оператора).
- **1.31b (условие):** `retention.forget` берёт тот же advisory lock на `submission_id`, что Submission API, иначе гонка forget и replay.
- **до этапа 4 (приёмка 1c, I1, important):** released-снимки `round_client` и `all_clients` вычитаются друг из друга: клиенты A=3, B=3, C=2 — видны `all` 8/5 и `client:B` 3/2 в `all_clients`, `A` в `round_client` → C (n=2) восстанавливается. Видимые `round_client all` считать опубликованными частями разбиения `all_clients` и наоборот (`privacy/release.ts:258-276`), тест на оба порядка выдач. В этапе 1 CSV/handover их не соединяют, читатели — админы; обязательно до отчётов и Atlas.
- **минор 1c (m1–m4):** runbook `SU()` определён в T−1, а нужен в день cutover; `docs/kartlegging-teknisk.md:87,93` rsync без `--exclude private/runde1.js` и `restart` вместо `up -d --force-recreate`; команды экспорта/загрузки журнала удалений для restore нет (`ledger apply-db` читает tombstones из восстановленной БД); `deletionTombstone`/`deletionRequest` не в `privacy-only-release`; `import()` с выражением проходит `privacy-internals`; GET `/api/admin/dashboard` пишет Finding; транзакции rows/handover с таймаутом 5 с; REVIEW-CHECKLIST указывает не тот файл (`release-http-history.test.ts`).
