# Checkpoint 0b — шаги хостинг-оператора на VPS (13.10.2026)

Хостинг-оператор: Claude Opus 5.5 (`ssh vardahei-vps`), по `varde/infra/README.md`, `varde/infra/sql/README.md`, `docs/varde/runbooks/break-glass.md`. Развёрнут образ `varde-api:f37712c14515` (commit `f37712c` = `main` после приёмки 0b, собран из чистого дерева, linux/amd64). Секреты не выводились; env-файлы показаны только именами ключей.

## Отклонения от runbook (исправлены в этом же коммите)

1. В `atlas-db-1` переменная `POSTGRES_USER` не задана: `psql -U "$POSTGRES_USER"` уходил ролью `root`. Везде → `${POSTGRES_USER:-postgres}` (`infra/sql/README.md`, `bootstrap.sh`, `infra/README.md`, `break-glass.md`, `tools/metrics/vps-sample.sh`). Bootstrap выполнен через `VARDE_PSQL_CMD` с тем же значением.
2. `install -d -o 1000` не принимает uid без пользователя на хосте (`invalid user`). Заменено на `install -d` + `chown 1000:…`.

## 0.5b База, роли, pg_hba

- (а) `server_version` 17.6; `max_connections` 100, занято 6 (нужно 23); `hba_file` = `/var/lib/postgresql/data/pg_hba.conf` (том данных, доступен на запись); ролей и базы Varde не было. Клиентских сессий приложения Atlas в момент проверки не было — `rolsuper` его роли не определён (остаточный риск §9 п. 5 без изменений).
- (б) `bootstrap ok`. Роли: `varde_app` (connlimit 20), `varde_backup` (3), `varde_audit_owner`; все `rolsuper = f`. База `varde`, event trigger `varde_login` включён. `/etc/varde/app.env`, `backup.env` — `600 root`, ключи: `DATABASE_URL`, `SESSION_SECRET`, `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.
- (в) Три строки `pg_hba.varde.conf` вставлены перед первой общей `host`-строкой (строки 119–121); копия `pg_hba.conf.bak-20261013T135508Z`; `pg_reload_conf()` → `t`; ошибок в `pg_hba_file_rules` — 0. Проверки: 1) socket superuser → `varde` = 1; 2) superuser по TCP 127.0.0.1 → `pg_hba.conf rejects connection`; 3) `varde_backup` → `varde` = `varde_backup|varde`; 4) `varde_backup` → `postgres` → `rejects connection`.
- (г) `varde_backup`: insert в `connection_log` → `permission denied`, `prune()` → `permission denied`; вход `varde_backup` увеличил журнал 3 → 4; входы `varde_app` пишутся.
- Atlas после правок: `atera.vardahei.tech/api/health` 200, в логах `atlas-api-1` за 10 мин ошибок подключения 0; kartlegging `/healthz` 200.

## 0.6 Образ, запуск, Caddy, DNS

- Каталоги: `/var/lib/varde/run` `2770 1000:docker`, `/var/lib/varde/ledger-out` `750 1000:0`, `/etc/varde/recipients.txt` `644` (заглушка, бэкап отложен 13.10). uid 1000 и gid 1000 на хосте отсутствуют.
- `migrate deploy` → `All migrations have been successfully applied`; `varde-app` healthy.
- Без DNS: `/health` 200 `{"status":"ok","version":"f37712c14515","db":"ok"}`; `TESTQUERY` в логах приложения — 0; строка лога `{"method":"GET","path":"/r/x","status":404}` (без query и IP).
- DNS (Hostinger API, `overwrite=false`): `varde` A `179.198.210.22`, AAAA `2a02:4780:7e:808a::1`, TTL 300 — как у `kartlegging`.
- Caddy: добавлен только блок `varde.vardahei.tech { reverse_proxy varde-app:3000 }`; копия `Caddyfile.bak-20261013T135818Z`; `validate` → `Valid configuration`; reload; сертификат Let's Encrypt получен. По HTTPS: `/health` 200, `TESTQUERY` в логах Caddy — 0.
- **Pending (решение Oleksandr):** глобальный фильтр логов `caddy/global-log.caddy` не установлен — он меняет логгер ошибок всех сайтов VPS (Atlas, kartlegging).

## 0.7 Entra

- `/etc/varde/entra` `750 root:1000`, `key.pem` `640 root:1000`, `cert.pem` `644`; держатели ключа — root и процесс контейнера (uid 1000).
- В `app.env` добавлены `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_KEY_FILE`, `ENTRA_CLIENT_CERT_FILE`, `VARDE_ADMIN_GROUP_ID`, `PUBLIC_URL`, `SESSION_TTL_SECONDS` (значения из `/etc/varde/entra.env`).
- `/auth/login` → 302 на `login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize` с `redirect_uri=https://varde.vardahei.tech/auth/callback`.
- Реальный вход Oleksandr 13.10 14:14 UTC: `/auth/callback` → 302 → `/` (404 — интерфейса админки ещё нет, 1.23); `admin_session`: `entra|1`, активна. Вход по сертификату (`private_key_jwt`) против настоящего Entra подтверждён.

## 0.8 Break-glass

- Включён на 30 минут (оператор `hosting-operator-claude-0.8-check`); пароль из CLI не сохранялся (stderr → `/dev/null`), успешный вход не выполнялся.
- socket `660 1000:docker`, каталог `2770`; лог `listening on /run/varde/break-glass.sock until …`.
- Из соседнего контейнера `http://varde-app:3001/` → curl exit 7 (connection refused); на хосте слушателей `:3001` — 0; публично `/break-glass/login` → 404; неверный пароль через socket → 401; `/auth/me` без сессии → 401.
- AuditLog: `break_glass.enabled`, `break_glass.login_failed`. Выключен: строки удалены (0 осталось), `socket закрыт`, break-glass-сессий 0. `closed` не записан — окно закрыто перезапуском до `UNTIL` (так и описано в runbook).
- **Pending:** успешный вход держателем SSH (учебная проверка) — по желанию Oleksandr.

## 0.12 Стенд нагрузки и неделя метрик

**Pending до начала 1.33** (решение 13.10 «Шаги 0b … могут быть pending»): нужно решение о swap на VPS (7.9 GB, swap нет) и окно для стенда рядом с Atlas.

## Отложено 13.10

0.10, 0.10e, 0.10c, 0.10d, 0.11 — бэкап, ключи age, uptime-monitor. Остаточный риск: данные Varde только на VPS.
