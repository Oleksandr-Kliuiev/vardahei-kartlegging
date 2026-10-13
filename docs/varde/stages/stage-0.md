# Этап 0. Фундамент — пакет этапа

Автор: Claude Fable 5.1 (xhigh), 13.10.2026; исправлено по замечаниям ревьюеров пакета (coverage, executability, security, feasibility, consistency) и финального критика 13.10, затем приведено к решениям 13.10 (`docs/BESLUTNINGER.md`, все строки 13.10: целевых RPO/RTO нет, restore-drill отложен, действия на хостинге выполняет хостинг-оператор (Claude), Atlas — внутренняя платформа Vardahei, escrow нет, языки runbook, изоляция `varde` тремя строками pg_hba, ключи age без пароля, pending-правило для 0b) и упрощено для приложения на троих пользователей (вторая итерация 13.10). Источник задач — `STAGES.md`, раздел «Этап 0»; пакет уточняет задачи и критерии (все уточнения внесены и в `STAGES.md`, одно правило в обоих файлах), добавляет кодеру минимальный контекст, шаги, обязательные тесты и команды приёмки. Детали по задачам — `stage-0/0a.md`, `0b.md`, `0c.md`, `0d.md`. Пакет входит в одобряемый артефакт (манифест — §10) и перед началом кода проходит независимое одобрение GPT-6 Astra (xhigh) и чистой сессии Fable (xhigh), как любой новый этап (PRINCIPLES §20).

## 1. Цель и состав

Репозиторий, CI, инфраструктура, вход и контракты, на которых этап 1 заменяет kartlegging. Приёмка этапа 0 = checkpoints 0a–0c; 0d (AI-допуск, ворота G0) не блокирует этапы 1 и 2a.

| Checkpoint | Задачи (в порядке выполнения) | Ветка | Часы кодера |
| --- | --- | --- | --- |
| 0a Репозиторий и CI | 0.1, 0.2, 0.2b, 0.3, 0.4, 0.4b (инварианты) | `varde/0a` | 11 |
| 0b Инфраструктура и вход | 0.5, 0.5b, 0.9, 0.6, 0.7, 0.7b, 0.8, 0.10, 0.10e, 0.10c, 0.10d, 0.11, 0.12, 0.12b (инварианты) | `varde/0b` | 27 |
| 0c Контракты | 0.16, 0.15, 0.15b, 0.17, 0.19, 0.18, 0.19b (инварианты) | `varde/0c` | 14 |
| 0d AI-допуск | 0.13, 0.14 | `varde/0d` | 5 |

Задачи 0.4b, 0.12b и 0.19b добавлены пакетом по протоколу checkpoint (STAGES «Протокол checkpoint», последний пункт): последняя задача каждого checkpoint — его тесты инвариантов. Задачи 0.2b, 0.5b, 0.7b, 0.10c, 0.10d, 0.10e — разбиение 0.2, 0.5, 0.7 и 0.10 по правилу «одна задача — 1–3 часа, один коммит» (замечания ревью). 0.10b (WAL-архивирование или частые дампы) **не планируется** — решение Oleksandr 13.10: целевых RPO/RTO нет; имя остаётся в STAGES и ADR-016 как история. Для 0d тесты инвариантов входят в 0.14.

## 2. Раскладка кода, роли и процесс (решения 13.10, `docs/BESLUTNINGER.md`)

- Код Varde живёт в этом репозитории в папке `varde/` на `main`. Свой pnpm workspace: `varde/package.json`, `varde/pnpm-workspace.yaml`, `varde/pnpm-lock.yaml`. Корневой `package.json` (npm, тесты kartlegging) не трогается и workspaces не объявляет — конфликта нет.
- `kartlegging/` и его деплой (rsync папки на VPS) в этапе 0 не затрагиваются; единственная правка kartlegging до cutover — флаг окружения read-only в 1.34 (ADR-024). `kartlegging/` — legacy вне context-budget: тест бюджета (0.2b) проверяет только `varde/**`; secret-scan (0.2) тоже ограничен областью Varde.
- Node 22 (как прод-контейнеры `node:22-alpine`): `varde/.node-version` = `22`, `engines.node` = `>=22 <26` (локально у Oleksandr Node 25 без corepack — допустимо, ворота — CI). pnpm закреплён точной версией `packageManager: pnpm@11.11.0` (как локально); в CI — `pnpm/action-setup` с `package_json_file: varde/package.json`, не corepack. Решения пакета о библиотеках: NestJS 11 на адаптере Fastify (`@nestjs/platform-fastify`; 0.1), Prisma мажорной версии 6 (0.4), cookie через `@fastify/cookie` с подписью (0.7).
- Ветка на checkpoint: `varde/0a`, `varde/0b`, `varde/0c`, `varde/0d` от `main`. Одна задача — один коммит с тестами (сообщение: `varde 0.N: <что сделано>`, по-английски или по-норвежски); CI на коммите задачи зелёный. Evidence checkpoint ссылается на последний commit hash ветки. Merge в `main` — после двух approvals приёмки (Sol xhigh, Opus xhigh); merge делает оркестратор (Sol), не кодер. Зависимый checkpoint ветвится от `main` после merge предыдущего. 0d не требует 0b/0c: его ведёт тот же кодер последовательно, в паузах ожидания внешних входов 0b/0c, переключая ветку (один писатель на checkout, PRINCIPLES §20); отдельный исполнитель для 0d — только по явному назначению оркестратора (Sol) с отдельным worktree и областью `varde/tools/eval`, `packages/schema/src/survey-draft.ts`.
- CI — GitHub Actions в приватном репозитории (личный аккаунт Oleksandr; Free-план ≈ 2000 мин/мес на приватные репо — при приближении к лимиту оркестратор (Sol) сообщает), workflow `.github/workflows/varde.yml` с фильтром `paths: [varde/**, docs/varde/**, .github/workflows/varde.yml]`, `permissions: contents: read`, actions закреплены на commit SHA; Postgres service `postgres:17.6-bookworm`; сборка образа `--platform linux/amd64` (VPS x86_64, Mac кодера arm64). Тесты kartlegging в CI не запускаются (их нет и сегодня).
- Факты о VPS, на которых держатся пины (`atlas-db-1` с PostgreSQL 17.6 → `postgres:17.6-bookworm`; `atlas-edge-caddy-1` с `caddy:2.10.2-alpine`; сети `atlas_edge`, `atlas_internal`; версия Docker Compose ≥ 2.24 для `env_file … required: false`), — по разведке 13.10; хостинг-оператор (Claude) подтверждает их на VPS к 0.2/0.6 (`docker ps --format '{{.Names}} {{.Image}}'`, `docker network ls`, `docker network inspect -f '{{.Name}} {{.Internal}}' atlas_internal atlas_edge` — контейнеру `backup` нужен выход в Graph/SharePoint и на `HEARTBEAT_URL`, в сети с `Internal: true` он не работает и тогда подключается ещё к `atlas_edge` (0.10), `docker compose version`, `docker exec atlas-db-1 postgres --version`), вывод — в evidence. При расхождении кодер меняет пин в одном коммите.
- **Роли в задачах с инфраструктурой (решение 13.10 «Действия на хостинге … делает Claude-оркестратор», `docs/BESLUTNINGER.md`):** *кодер* — Claude Opus 5.5 (`medium`), работает только в репо, CI и локально, не получает доступа к VPS, Entra, SharePoint, Anthropic Console и credentials; *хостинг-оператор (Claude)* — Claude Opus 5.5 с доступом `ssh vardahei-vps` (в `docs/BESLUTNINGER.md` назван «Claude-оркестратор»), выполняет все действия на хостинге (VPS, superuser-шаги на общем `atlas-db-1` только через unix-socket — `docker exec atlas-db-1 … psql` внутри контейнера без чтения env Atlas, Caddy, сети Docker, cron бэкапа, деплой, uptime-monitor) по runbook-шагам задачи — у каждого шага команды, проверка и откат, результат — вывод без секретов в evidence с тегом образа; *оркестратор (Sol)* — GPT-6.1 Sol: пины моделей и усилий, коммуникация, merge; на VPS не ходит и секретов не видит; *Oleksandr* — только регистрация приложений в Entra и доступ/consent к библиотеке SharePoint (админ тенанта), DNS-запись хоста Varde, генерация собственной пары age (как и у Asbjørn и Bjarte) с передачей публичного ключа; вне хостинга — утверждения (тексты 0.18, брифы 0.14) и Anthropic API (0.13).
- Секреты: только в окружении на VPS (`/etc/varde/app.env`, `/etc/varde/backup.env`, `0600 root`); GitHub secrets в этапе 0 не используются (e2e на mock-OIDC) — тест проверяет, что в `varde.yml` нет `secrets.`; в репо — `.env.example` без значений; secret-scan в CI (0.2). Пароли ролей базы и `SESSION_SECRET` генерирует `infra/sql/bootstrap.sh` прямо на VPS — хостинг-оператор их не видит. Секреты, которые выпускает Oleksandr (client secret регистрации Entra для входа, client secret регистрации для rclone), он вписывает в env-файлы на VPS сам (по ssh) — через чат хостинг-оператора секреты не проходят (PRINCIPLES §10); это уточнение пакета к решению «Действия на хостинге» — §9 п. 14, Oleksandr может отменить; идентификаторы (tenant id, client id, group id, `drive_id`) и публичные ключи age передаются хостинг-оператору и вписываются им. Временные секреты стенда и проверок (токен stub ≤ 4 ч, одноразовый пароль break-glass на 30 мин) хостинг-оператор видит и уничтожает после проверки — отметка в evidence.
- Один писатель на checkout (`/Users/oleksandr/vardahei-kartlegging`; worktree `vardahei-kartlegging-ki` — другой писатель, не трогать). Не читать: `kartlegging/data/`, `kjelder/`, `kartlegging/private/runde1.js`. Внешние инструменты (gitleaks, age, rclone, pg_dump 17, k6, caddy) локально не установлены — все scripts запускают их Docker-образами с закреплённым тегом.
- Выходы кодера, не входящие в одобренный артефакт: evidence, отчёты, чек-листы и скриншоты — в `docs/varde/evidence/stage-0/` (§6, §10); runbooks — `docs/varde/runbooks/`; контракты, тексты, реестр — `docs/varde/contracts/`, `texts/`, `RETENTION.md`, `REVIEW-CHECKLIST.md`, `AI_CONTEXT_MAP.md`, `WORKFLOW.md`, `personvern/`.

## 3. Ворота — статус на 13.10

| Ворота | Условие | Статус | Блокирует |
| --- | --- | --- | --- |
| G0 AI-допуск | 0d закрыт: чек-лист Anthropic подтверждён (строгий режим теста), eval прошёл пороги (ADR-010) | open — ждёт 0.13/0.14 | 2b, этап 4 |
| G2 Решения Oleksandr | Расположение кода — решено 13.10 (`varde/` в этом репо). Осталось: утверждение текстов уведомления v2 (0.18). Правило (одно в STAGES и здесь): checkpoint 0c закрывается при зелёных тестах с 0.18 в статусе `pending`; задача 0.18 принимается после утверждения отдельным evidence; утверждение нужно к 1.13d | частично open — только 0.18 | приёмка 0.18, 1.13d |
| G3 Заместители | Заместители Oleksandr для восстановления — Asbjørn и Bjarte (решение 13.10); целевых RPO/RTO нет, условие снято (решение 13.10) | **закрыто** | — (0.10, 0.10d и checkpoint 0b от RPO/RTO и drill не зависят) |

## 4. G3: заместители — что это значит в этапе 0; остаточный риск

Заместители Oleksandr для восстановления — Asbjørn и Bjarte (решение 13.10). В этапе 0:
- приватный ключ age — у Oleksandr, Asbjørn и Bjarte: три отдельные пары, каждый генерирует свою на своём устройстве (`age-keygen`), identity-файл **без пароля** лежит на зашифрованном диске держателя (FileVault, BitLocker, LUKS) и не покидает его — решение 13.10 «Ключи age без пароля» (restore без TTY, меньше движущихся частей); на VPS — только публичные ключи (`/etc/varde/recipients.txt`, пишет хостинг-оператор), в репо — `infra/backup/recipients.txt.example`; дамп, экспорт журнала и canary шифруются на три recipient; подлинность публичных ключей каждый держатель сверяет вне канала передачи, работоспособность своего ключа — расшифровкой canary-файла (0.10d);
- runbook restore (0.10d) написан так, чтобы заместитель выполнил его без Oleksandr; язык runbook — нюношк (его читают Asbjørn и Bjarte) — решение 13.10 «Runbook восстановления и оповещений — на нюношке», Oleksandr может отменить (PRINCIPLES §19, §9 п. 1); русское резюме — в evidence;
- escrow прод-секретов **не делается** (решение 13.10 «Escrow прод-секретов заместителям не делаем»: круг держателей не расширяется сверх ключа age и runbook): при восстановлении на новой площадке пароли ролей и `SESSION_SECRET` генерируются заново (`bootstrap.sh`, `restore.sh`), новый client secret Entra выпускает админ тенанта; runbook называет эти зависимости по имени;
- целевых RPO/RTO нет (решение 13.10): `restore.sh` печатает возраст копии и затраченное время только для сведения, порогов и условий приёмки на них нет;
- restore-drill на чистой машине и ежеквартальный drill (5.3) — **отложено решением Oleksandr 13.10**. `restore.sh` проверяется только автоматически: roundtrip в CI (настоящий `backup.sh` → настоящий `restore.sh` в чистый кластер Postgres из `compose.restore.yml`, включая роль-владельца event trigger, журнал через stdin, `/health` 200 и `/auth/login` 503 без Entra).

**Остаточный риск (принят Oleksandr 13.10, записан в ADR-016):** бэкап не проверен восстановлением на чистой машине человеком. Ошибка, которую CI не ловит, — в runbook, в доступе заместителей к библиотеке `VardeBackup`, в tar образов или в расшифровке реальным ключом, — обнаружится только при настоящем восстановлении. Что остаётся как защита: roundtrip в CI на каждом коммите; проверка ключей canary-файлом (0.10d); heartbeat ночного бэкапа (0.11); листинг библиотеки и `meta.json` с версией образа и последней миграцией в evidence (0.10). Пересмотр решения — перед этапом 3 (live poll требует восстановления в минутах) или раньше по решению Oleksandr.

## 5. Внешние входы этапа 0

Кодер не ждёт входов молча: задача с отсутствующим входом выполняется до «готово к шагу на VPS / к внешнему шагу», тесты на коммите зелёные в режиме `pending`, а evidence помечает вход `pending`.

**5a. От Oleksandr (и держателей ключей)**

| Вход | К задаче | Статус 13.10 |
| --- | --- | --- |
| Имя хоста Varde (предложение: `varde.vardahei.tech`) и DNS-запись на адрес VPS (адрес сообщает хостинг-оператор); без неё блок Caddy и все проверки по HTTPS — pending | 0.6, 0.7, 0.8, 0.11, 0.12 | pending |
| Регистрация приложения Varde в Entra: redirect URI `https://<host>/auth/callback`; groups claim в ID token в режиме «Groups assigned to the application» (без overage); enterprise app с «Assignment required = Yes», назначена только группа из трёх админов; группа role-assignable или с ограниченными owners. Tenant id, client id, object id группы → хостинг-оператору; вместо client secret — сертификат, ключ только на VPS (§9 п. 14); один реальный вход после деплоя | 0.7 | готово 13.10: приложение Varde, группа «Varde admins» назначена, вход по сертификату (ключ `/etc/varde/entra/key.pem` только на VPS), ID в `/etc/varde/entra.env` |
| SharePoint: **отдельный сайт** только для `VardeBackup` (библиотека с папками `db/`, `ledger/`, `images/`, `kit/`), доступ к сайту — три админа (заместителям нужен для восстановления). Регистрация приложения для rclone: app-only с **client secret** (OneDrive-backend rclone не поддерживает сертификат; срок secret ≤ 12 мес, дата истечения → хостинг-оператору для напоминания), `Sites.Selected` с ролью `write` только на этот сайт (grant через Graph `POST /sites/{id}/permissions`). Tenant id, client id, `drive_id` → хостинг-оператору; client secret → в `/etc/varde/backup.env` Oleksandr вписывает сам (§9 п. 14) | 0.10 | отложено 13.10 |
| Своя пара age у Oleksandr, Asbjørn и Bjarte (`age-keygen`, **без пароля**, на зашифрованном диске — решение 13.10); публичный ключ — хостинг-оператору (публичные ключи не секрет; `/etc/varde/recipients.txt` пишет он); после первого бэкапа — сверка своей строки и расшифровка canary; подтверждение, что приватный ключ лежит на зашифрованном диске | 0.10, 0.10d | отложено 13.10 |
| Утверждение текстов уведомления v2 (оба режима, nn/en) — ворота G2 | 0.18 (приёмка задачи), 1.13d | pending |
| Anthropic API: организация Vardahei, доступ к Console, DPA, место обработки; скриншоты без ключей, id и e-mail | 0.13 | pending — DPA неизвестен (BESLUTNINGER 11.10) |
| 10 брифов для eval (нюношк; кодер даёт черновики, утверждает Oleksandr) и носители для слепой оценки (Asbjørn, Bjarte, ≈ 2 ч каждый) | 0.14 | pending |
| Решение о swap на VPS до стенда 0.12 (17 контейнеров без swap; риск OOM и порога ≥ 25 % RAM); выполняет хостинг-оператор | 0.12 | pending |
| Аккаунт внешнего uptime-monitor, если выбранный сервис требует регистрации или оплаты человеком; канал оповещения (e-mail/Teams трёх админов) | 0.11 | pending — сервис выбирает хостинг-оператор |
| Отметка о принятии остаточного риска §9 п. 5 (superuser-сессии инстанса имеют доступ к `varde`) — одна строка в evidence 0.5b | 0.5b | pending |
| Go/no-go размещения Varde на общем VPS по отчёту 0.12 (ADR-016) | до начала 1.33 | pending — после стенда |

**5b. Закрывает хостинг-оператор (Claude)** (шаги задач, не входы; статус и вывод — в evidence)

| Шаг | К задаче |
| --- | --- |
| Подтверждение фактов о VPS (§2), включая `Internal` у сетей `atlas_internal`/`atlas_edge` | 0.2, 0.6 |
| Superuser-шаги на `atlas-db-1` (только через unix-socket, `docker exec … psql` без `-h`): read-only проверка `rolsuper` роли приложения Atlas, `hba_file`, `max_connections` и число соединений; `bootstrap.sh`; три строки pg_hba (`pg_hba.varde.conf`) и четыре проверки — `0b.md` 0.5b | 0.5b |
| Каталоги socket и ledger-out, заглушка `/etc/varde/recipients.txt`, сети, перенос обоих образов, `config/` и `metrics/`, миграции, `up -d`, `/health` из сети Docker, проверки, откат; после DNS — Caddyfile (блок Varde и глобальный фильтр — процедура слияния) и проверки по HTTPS — `infra/README.md` | 0.6, 0.8 |
| `app.env` (идентификаторы Entra, `PUBLIC_URL`, `VARDE_LEDGER_OUT`, `VARDE_AGE_RECIPIENTS`; пароли и `SESSION_SECRET` — `bootstrap.sh`), перезапуск, проверка редиректа на Entra | 0.7, 0.10e |
| `/etc/varde/recipients.txt` (три публичных ключа от держателей), `backup.env` (кроме client secret), однократный `ledger export`, первый прогон, листинг библиотеки, heartbeat, cron, проверка гранта на `--onedrive-hard-delete` | 0.10, 0.10e, 0.11 |
| Неделя метрик (cron `/opt/varde/metrics/vps-sample.sh`), окно стенда (Atlas — внутренняя платформа Vardahei, отдельного согласования нет), эталонный эндпоинт Atlas, k6 с Mac, выключение stub и очистка таблицы | не планируется 13.10 |
| OpenAPI Atlas и пример observation — из репозитория Atlas; если недоступно к началу 0.17 — `draft` | перенесено в этап 4, 13.10 |
| Списки держателей для evidence: SSH/root и группа docker на VPS; `app.env`, `backup.env`; superuser `atlas-db-1` (поимённо: Vardahei — Oleksandr и хостинг-оператор); приватные ключи age (где лежат: зашифрованный диск держателя, без пароля) | 0.5b, 0.8, 0.10d |

## 6. Протокол checkpoint и шаблон evidence

Протокол — `STAGES.md`, раздел «Протокол checkpoint». Evidence кодера и все его отчёты лежат вне манифеста одобренного пакета: `docs/varde/evidence/stage-0/<cp>-evidence.md`, там же `0.12-report.md`, `0.13-anthropic-checklist.md`, `0.13/` (скриншоты), `0.14-report.md`. Выводы шагов хостинг-оператора на VPS кодер вставляет в evidence как получены (без секретов). Шаблон evidence:

```markdown
# Evidence <cp> — <дата>
- Commit: <hash> (ветка varde/<cp>); образ на VPS: varde-api:<hash> (с 0b; проверки на VPS повторены на нём)
- Манифест одобренного пакета этапа: <sha256 из одобрения>; вычислен на commit командой §10: <sha256> — совпадает: да | нет (причина)
- `git diff <commit одобрения> --stat -- docs/varde/ARCHITECTURE.md docs/varde/PRINCIPLES.md docs/varde/STAGES.md docs/varde/adr docs/varde/stages` → пусто
- Модель и усилие кодера: claude-opus-5-5, medium; fallback/несоответствие: нет | <описание>
## Команды проверки (из пакета) и фактический выход
| Команда | Ожидалось | Получено |
## Fixtures
| Файл | sha256 |
## Отклонения паритета / принятые отступления
## Внешние входы (§5a)
| Вход | Статус | Где доказательство |
## Инварианты, проверенные в этом checkpoint
| Инвариант | Тест (файл::имя) |
## Шаги хостинг-оператора на VPS (§5b): runbook-шаг, вывод команд без секретов, тег образа, выполненный откат (если был)
## Держатели доступа (0.5b/0.8/0.10d/0.12b): SSH/root и группа docker на VPS; superuser atlas-db-1 (по имени); app.env и backup.env; приватные ключи age (где лежат: зашифрованный диск, без пароля); временные секреты проверок уничтожены (дата)
```

Приёмка (решение Oleksandr 13.10): одна чистая сессия Claude Opus 5.5 (xhigh) по commit hash плюс зелёный CI; вход — репозиторий, `docs/varde/` и этот пакет; отчёт кодера читается последним. GPT-6.1 Sol не используется; Fable и Astra — только в крайнем случае (спор по архитектуре или блокер, который иначе не закрыть). Checkpoint закрыт при отсутствии blocking и important; закрываются и blocking, и important; после двух попыток починки без прогресса — возврат с диагнозом. Ревьюер сверяет манифест §10 на commit с манифестом одобрения.

## 7. Назначение моделей (политика 11.10.2026, PRINCIPLES §20; решение 13.10 о хостинге)

| Роль | Модель | Усилие |
| --- | --- | --- |
| Оркестрация, коммуникация, merge (решение 13.10; Sol не используется) | Claude Opus 5.5 | по сессии |
| Пакет этапа и правки архитектуры; Fable и Astra — только в крайнем случае (решение 13.10) | Claude Opus 5.5 | по сессии |
| Код: одна задача — один коммит с тестами (репо, CI, локально; без VPS и секретов) | Claude Opus 5.5 | medium |
| Приёмка checkpoint: одна чистая сессия + зелёный CI (решение 13.10) | Claude Opus 5.5 | xhigh |
| Хостинг-оператор (Claude): VPS, `atlas-db-1`, Caddy, cron, деплой, uptime-monitor — по runbook-шагам пакета с проверкой и откатом (в `docs/BESLUTNINGER.md` — «Claude-оркестратор») | Claude Opus 5.5 с `ssh vardahei-vps` | по пину оркестратора |

Оркестратор пинит модель и усилие на каждый запуск; исполнитель сообщает фактические модель, усилие, fallback или несоответствие в evidence; при подмене именованные ворота остаются pending. Никто не меняет provider routing, глобальные настройки моделей, billing или credentials ради задачи.

## 8. Что читать кодеру (минимальный контекст)

Всегда: `docs/varde/PRINCIPLES.md`, этот файл (разделы 2, 5, 6, 10), файл checkpoint `stage-0/<cp>.md` и строки своих задач в `STAGES.md`. По задаче — ADR и файлы, перечисленные в пункте «Читать» задачи; ничего сверх. `ARCHITECTURE.md` — только разделы, названные в задаче. История, не читать для кода: `docs/varde/varde-arkitektura.md` (rev 33), `docs/varde/ENDRINGAR-etter-rev33.md`, `astra/*`.

## 9. Решения пакета и решения C из `docs/BESLUTNINGER.md`, которые Oleksandr может отменить

1. Runbooks `restore` и `alerting` — на нюношке (читают заместители Asbjørn и Bjarte), русское резюме в evidence; `break-glass` — по-русски (читают держатели SSH на VPS: Oleksandr и хостинг-оператор; у заместителей SSH нет и не планируется) — решение 13.10 «Runbook восстановления и оповещений — на нюношке … break-glass — на русском» (`docs/BESLUTNINGER.md`; PRINCIPLES §19).
2. Имя хоста `varde.vardahei.tech`, подключение контейнера к существующим сетям `atlas_edge` и `atlas_internal` (0.6).
3. Лимит соединений роли `varde_app` = 20 и разбиение бюджета (Prisma 8, pg-boss 4, резерв 8) — конфиг, 0.5/0.9.
4. Инструменты: k6 в Docker только с внешней машины (0.12); gitleaks закреплённой версии в Docker (0.2); Fastify-адаптер, Prisma 6, `@fastify/cookie` (0.1, 0.4, 0.7); Node 22 с `engines >=22 <26`.
5. Изоляция от Atlas (решение 13.10 «Изоляция базы `varde`», `docs/BESLUTNINGER.md`): три строки в `pg_hba.conf` перед общими `host`-строками — `host varde varde_app,varde_backup all scram-sha-256`, `host all varde_app,varde_backup all reject`, `host varde all all reject`; одна процедура при любом результате проверки `rolsuper` роли Atlas — пакет свёл два варианта ADR-016 (REVOKE / reject) к ней: строка `host varde all all reject` обязательна в обоих по решению 13.10 и сама закрывает TCP-вход в `varde` любой не-Varde роли, включая superuser-роли инстанса, а TCP-доступ ролей Varde к базам Atlas закрывает вторая строка; REVOKE/GRANT CONNECT на базах Atlas не делается (`0b.md` 0.5b); unix-socket внутри контейнера не закрывается — единственный канал superuser-обслуживания хостинг-оператора (`docker exec … psql` без `-h`). Остаточные риски (ADR-021): (а) superuser может переписать `pg_hba.conf` и войти с `event_triggers=false` мимо журнала — держатели superuser `atlas-db-1` поимённо (Vardahei: Oleksandr, хостинг-оператор) в ADR-021 и evidence; (б) любая superuser-сессия инстанса, открытая в другой базе, остаётся всесильной независимо от pg_hba (`ALTER ROLE varde_app PASSWORD`, `COPY … TO PROGRAM`, dblink через local socket): если роль приложения Atlas — superuser, то само приложение Atlas и держатели его DB credentials (env Atlas, его деплой и CI), а в любом случае держатели пароля `$POSTGRES_USER`, технически имеют полный доступ к данным `varde`; компрометация Atlas = компрометация данных Varde; принятие — отметка Oleksandr в evidence 0.5b. Перевод приложения Atlas на роль без `SUPERUSER`/`CREATEROLE` или свой Postgres-контейнер для Varde (альтернатива ADR-016) — предложения, этап 0 не блокируют; триггер пересмотра — до cutover 1.35, когда в `varde` появятся персональные данные; четыре проверки pg_hba повторяются в `0b-vps-evidence.md` и перед 1.35.
6. Ротация бэкапов: `backup.sh` удаляет копии старше 35 дней обычным удалением (в корзину SharePoint); purge корзины drill-ом не подтверждается (drill отложен), поэтому реестр 0.19 и ADR-017 записывают эффективный максимум 35 + 93 = 128 дней при работающем ночном бэкапе (ротация идёт после успешного дампа: при сбое бэкапа старые копии живут дольше — до восстановления по оповещению heartbeat плюс 128). Альтернатива — `--onedrive-hard-delete` в rclone (минуя корзину, максимум 35 дней). Это флаг клиента, а не свойство гранта: root на VPS читает `backup.env` (client secret, `Sites.Selected write`) и сам может вызвать удаление с этим флагом (Graph `permanentDelete`), что бы ни стояло в `backup.sh`; защищённость копий от root определяется тем, разрешает ли грант `permanentDelete`, — хостинг-оператор проверяет это на тестовом файле в 0.10 и пишет результат в evidence. Если удаление проходит — root на VPS может безвозвратно удалить все копии в **обоих** вариантах, и развилка для Oleksandr сводится к сроку хранения (35 против 128 дней), а защита от root (retention policy или preservation hold на сайте) — отдельный открытый вопрос, не этап 0; если не проходит — альтернатива с `Sites.Selected write` неисполнима. Решение за Oleksandr после проверки; по умолчанию флаг не включён.
7. Доступ rclone к SharePoint — app-only с client secret (срок ≤ 12 мес, напоминание о сроке в runbook alerting): OneDrive-backend rclone не поддерживает аутентификацию сертификатом. Альтернатива — свой uploader (MSAL с сертификатом + Graph upload session) вместо rclone — не планируется (больше кода и движущихся частей).
8. Логи: Caddy **не ведёт** access-log Varde (файловый лог с `roll_size` не даёт срока по времени; у Caddy 2.10 нет `roll_interval`), глобальный фильтр `log default` закрывает error-лог; логи приложения — метод, путь без query, статус, без IP; пути runner (`/r/*`, `/api/runner/*`) только при статусе ≥ 400 (успешные отправки в логах не фиксируются); docker `json-file` 3 × 10 MiB — ограничение по объёму, не по времени (ADR-017, 0.19).
9. Break-glass слушает Unix socket (`/run/varde/break-glass.sock` в контейнере, каталог хоста `/var/lib/varde/run`, не tmpfs), не TCP-порт; доступ `ssh -L` на socket; окно не длиннее `BREAK_GLASS_MAX_HOURS` = 4 (0.8).
10. Стенд 0.12: `POST /stub/submit` защищён токеном и сроком (≤ 4 ч), нагрузка идёт с внешней машины через публичный хост; профиль — 100 VU с паузами 20–60 с плюс burst 100 отправок за 10 с; модуль stub и таблица удаляются миграцией в 1.33.
11. Образы и скрипты для восстановления заместителем — в библиотеке бэкапа (`images/varde-api-<sha>.tar.gz`, `images/varde-backup-<sha>.tar.gz`, `kit/varde-infra-<sha>.tar.gz`, кладёт `backup.sh`); запасной путь — клон репо.
12. Escrow прод-секретов не делается (решение 13.10 «Escrow прод-секретов заместителям не делаем»); если Oleksandr захочет — отдельный вопрос с перечнем держателей (ADR-021), не этап 0.
13. Legacy kartlegging вне secret-scan: хеши учёток в `kartlegging/deploy/brukarar.seed.json` лежат в истории git — задача Oleksandr вне этапа 0 (перезапись истории или смена паролей), срок не назначен; в `.gitleaks.toml` записана как причина allowlist.
14. Вход в Entra — сертификат, а не client secret (решение 13.10): пара ключей создана хостинг-оператором на VPS, в Entra загружен только публичный сертификат; секретов в чате и у Oleksandr нет. Client secret для rclone — вместе с бэкапом отложен.
15. Ветки `varde/*` в `origin` пушит кодер из checkout через уже настроенные git-credentials репозитория (это доступ к приватному репо, не к VPS и не секрет Varde; CI на каждом коммите задачи иначе не получить); merge в `main` — по-прежнему оркестратор (Sol). Oleksandr может отменить; тогда push делает оркестратор (Sol) по сообщению кодера с hash.

## 10. Манифест

Команда (из `docs/varde/`):

```
find ARCHITECTURE.md PRINCIPLES.md STAGES.md adr stages -type f | sort | xargs shasum -a 256 | shasum -a 256
```

В манифест входят только документы артефакта: ARCHITECTURE, PRINCIPLES, STAGES, `adr/`, `stages/` (пакеты этапов). Всё, что пишет кодер (`evidence/`, `runbooks/`, `contracts/`, `texts/`, `personvern/`, `RETENTION.md`, `REVIEW-CHECKLIST.md`, `AI_CONTEXT_MAP.md`, `WORKFLOW.md`), лежит вне этих путей, поэтому значение манифеста не меняется от checkpoint к checkpoint. Одобренное значение фиксирует одобрение Astra/Fable (файл в `astra/`); кодер и ревьюеры сравнивают с ним вычисленное на commit (шаблон §6). Изменение любого файла из манифеста — только через Fable и повторное одобрение (PRINCIPLES §20).
