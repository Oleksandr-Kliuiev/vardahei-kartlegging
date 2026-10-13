# infra/sql — база `varde` на общем `atlas-db-1` (runbook хостинг-оператора, 0.5/0.5b)

**Все superuser-шаги к `varde` — только через unix-socket внутри контейнера: `docker exec … psql` без `-h`.** `docker inspect` контейнеров Atlas и чтение их env запрещены; содержимое `/etc/varde/*.env` не выводится.

Файлы: `varde-roles.sql` (роли и база, уровень инстанса), `varde-db.sql` (права backup, схема `varde_audit`, login-триггер, `prune()`), `bootstrap.sh` (оба файла + env-файлы), `varde-teardown.sql` (откат до появления данных), `pg_hba.varde.conf` (три строки изоляции). На VPS каталог лежит в `/opt/varde/sql/` (rsync `varde/infra/` → `/opt/varde/`, `infra/README.md`).

Superuser-сессия в примерах:

```bash
SU() { docker exec -i atlas-db-1 sh -c 'exec psql -X -U "${POSTGRES_USER:-postgres}" -v ON_ERROR_STOP=1 "$@"' psql "$@"; }
SU -d postgres -tAc 'select 1'          # должно вернуть 1
```

`SU` — функция shell (не переменная: кавычки в раскрытой переменной не работают). Имя роли раскрывается внутри контейнера. В `atlas-db-1` переменная `POSTGRES_USER` не задана (проверено 13.10), поэтому везде `${POSTGRES_USER:-postgres}` — суперпользователь официального образа. Если `local` в pg_hba не `trust` (psql спрашивает пароль), добавить `PGPASSWORD="$POSTGRES_PASSWORD"` перед `exec psql` в том же `sh -c` — значение не выводится. Тест (`test/bootstrap.test.sh`) подставляет свою команду через `VARDE_PSQL_CMD`.

## (а) Read-only проверки до bootstrap

```bash
# rolsuper роли приложения Atlas (только для записи остаточного риска §9 п. 5, на процедуру не влияет)
SU -d postgres -tAc "select distinct usename, rolsuper from pg_stat_activity join pg_roles on rolname = usename where backend_type = 'client backend' and pid <> pg_backend_pid()"
# действующий pg_hba (может быть не $PGDATA/pg_hba.conf)
SU -d postgres -tAc 'show hba_file'
# запас соединений под 20 (varde_app) + 3 (varde_backup)
SU -d postgres -tAc 'show max_connections'
SU -d postgres -tAc 'select count(*) from pg_stat_activity'
# версия сервера: login event trigger требует 17
SU -d postgres -tAc 'show server_version'
```

Если `max_connections − count` меньше 23 с запасом — остановиться: кодер снижает `role_connection_limit` в `config/db-budget.json` коммитом до bootstrap. Всё — в evidence.

## (б) bootstrap

```bash
ssh -T vardahei-vps
install -d -m 0700 -o root -g root /etc/varde
bash /opt/varde/sql/bootstrap.sh            # → bootstrap ok
stat -c '%a %U' /etc/varde/app.env /etc/varde/backup.env   # → 600 root (оба)
cut -d= -f1 /etc/varde/app.env /etc/varde/backup.env       # только имена ключей
```

Что делает: preflight (роль `varde_app`/`varde_backup` уже есть → exit 2 `run varde-teardown.sql first`, файлы не трогаются); `role_connection_limit` из `/opt/varde/config/db-budget.json` (через `node:22-alpine`, `jq` не нужен); пароли `openssl rand -hex 32` и `SESSION_SECRET` (`openssl rand -hex 48`, только если его ещё нет) — в памяти; `varde-roles.sql` в базе `postgres`, `varde-db.sql` в базе `varde`; только после успеха обоих — `DATABASE_URL` (без `connection_limit`) и `SESSION_SECRET` в `app.env`, `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` в `backup.env`; остальные ключи не трогаются. Печатает только `bootstrap ok` или `bootstrap failed: <шаг>`.

Сбой после `varde-roles.sql` (роли созданы, файлы не записаны) → откат ниже → повтор.

## (в) pg_hba

```bash
HBA=$(SU -d postgres -tAc 'show hba_file')
TS=$(date -u +%Y%m%dT%H%M%SZ)
docker exec atlas-db-1 sh -c "test -w '$HBA'" || echo 'READ-ONLY: стоп, вопрос в evidence'
docker exec atlas-db-1 cp -p "$HBA" "$HBA.bak-$TS"
docker exec atlas-db-1 grep -n '^host' "$HBA"            # номер первой общей host-строки = N
```

Если файл — read-only bind-mount с хоста (`test -w` не прошёл), остановиться и вынести вопрос в evidence: путь на хосте без `docker inspect` не определяется. Иначе вставить три строки `pg_hba.varde.conf` перед строкой N (файл в томе данных переживает передеплой Atlas — initdb на существующем томе его не перезаписывает):

```bash
N=<номер первой общей host-строки>
W=$(mktemp -d)
docker exec atlas-db-1 cat "$HBA" > "$W/old"
{ head -n $((N - 1)) "$W/old"; grep -v '^#' /opt/varde/sql/pg_hba.varde.conf; tail -n +"$N" "$W/old"; } > "$W/new"
diff "$W/old" "$W/new"                                    # ровно три добавленные строки
docker exec -i atlas-db-1 sh -c "cat > '$HBA'" < "$W/new"  # тот же файл (inode, владелец, режим)
docker exec atlas-db-1 grep -n -B1 -A3 'varde' "$HBA"   # три строки стоят перед общими host-строками
SU -d postgres -tAc 'select pg_reload_conf()'
SU -d postgres -tAc 'select count(*) from pg_hba_file_rules where error is not null'   # → 0
```

Четыре проверки (повторяются в `0b-vps-evidence.md` и перед cutover 1.35):

```bash
SU -d varde -tAc 'select 1'                                         # 1) socket superuser → 1
docker exec atlas-db-1 sh -c 'psql -X -h 127.0.0.1 -U "${POSTGRES_USER:-postgres}" -d varde -c "select 1"' \
  # 2) → FATAL: pg_hba.conf rejects connection (reject до аутентификации, пароль не нужен)
# после первого деплоя (0.6; контейнер backup — 0.10, отложен 13.10 → пока pending):
docker compose -f /opt/varde/compose.yml run --rm backup psql -c 'select 1'              # 3) → 1
docker compose -f /opt/varde/compose.yml run --rm backup psql -d postgres -c 'select 1'  # 4) → rejects connection
```

Пока образа `backup` нет (0.10 отложен 13.10), проверки 3–4 делаются тем же образом `postgres:17.6-bookworm` с `--env-file /etc/varde/backup.env` в сети `atlas_internal` — пароль остаётся в файле:

```bash
docker run --rm --network atlas_internal --env-file /etc/varde/backup.env postgres:17.6-bookworm psql -X -c 'select 1'
docker run --rm --network atlas_internal --env-file /etc/varde/backup.env postgres:17.6-bookworm psql -X -d postgres -c 'select 1'
```

Откат pg_hba: `docker exec atlas-db-1 sh -c "cat '$HBA.bak-$TS' > '$HBA'"`, `select pg_reload_conf()`, снова `pg_hba_file_rules` → 0.

## (г) Проверки журнала после первого деплоя

`PGDATABASE=varde` в `backup.env`. Пока нет образа `backup` — та же замена `docker run … --env-file /etc/varde/backup.env postgres:17.6-bookworm psql -X` вместо `docker compose … run --rm backup psql`.

```bash
B='docker run --rm --network atlas_internal --env-file /etc/varde/backup.env postgres:17.6-bookworm psql -X'
$B -c "insert into varde_audit.connection_log default values"   # → permission denied for table connection_log
$B -c "select varde_audit.prune()"                              # → permission denied for function prune
SU -d varde -tAc "select count(*) from varde_audit.connection_log where role_name = 'varde_backup'"   # = K
$B -c 'select 1'
SU -d varde -tAc "select count(*) from varde_audit.connection_log where role_name = 'varde_backup'"   # = K + 1
```

## (д) Сбой триггера, запасной журнал

- Вход не блокируется: ошибка вставки — `WARNING varde_audit: …` в `docker logs atlas-db-1`.
- Отключить триггер: `SU -d varde -c 'ALTER EVENT TRIGGER varde_login DISABLE'` (включить — `ENABLE`); аварийно для одной сессии — `PGOPTIONS='-c event_triggers=false'` у superuser.
- Если event trigger не создаётся (сервер по факту < 17): `ALTER ROLE varde_app SET log_connections = on; ALTER ROLE varde_backup SET log_connections = on;` — записи в `docker logs atlas-db-1`; evidence называет действующий вариант.

## Откат bootstrap (только до появления данных Varde)

```bash
docker compose -f /opt/varde/compose.yml stop app 2>/dev/null || true   # открытые сессии мешают DROP DATABASE
SU -d postgres < /opt/varde/sql/varde-teardown.sql
sed -i '/^DATABASE_URL=/d' /etc/varde/app.env
sed -i '/^PG\(HOST\|PORT\|USER\|PASSWORD\|DATABASE\)=/d' /etc/varde/backup.env
```

pg_hba — вернуть `.bak` (выше).
