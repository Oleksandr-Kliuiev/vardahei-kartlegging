# infra — деплой Varde на общий VPS (runbook хостинг-оператора, 0b)

Читатель — хостинг-оператор (Claude Opus 5.5 с `ssh vardahei-vps`). Кодер на VPS не ходит. Каждый шаг: команды → проверка → откат; вывод без секретов — в evidence (`docs/varde/evidence/stage-0/0b-evidence.md`, после DNS/Entra — `0b-vps-evidence.md`) с тегом образа.

Запреты: `docker inspect` контейнеров Atlas и чтение их env; вывод содержимого `/etc/varde/*.env`; superuser к Postgres — только `docker exec atlas-db-1 … psql` без `-h` (unix-socket, `sql/README.md`). Команды на VPS — через `ssh -T vardahei-vps` (без TTY: иначе compose выделит TTY и в вывод попадёт CRLF).

| Шаг пакета                                                             | Где                                                   | Нужны входы Oleksandr                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| 0.5b bootstrap базы, pg_hba, проверки журнала                          | `sql/README.md` (а)–(д)                               | нет (отметка о риске §9 п. 5 — Oleksandr)                      |
| 0.6 образ, каталоги, миграции, `up -d`, `/health` из сети Docker, логи | §1–§4 ниже                                            | нет; Caddy и HTTPS — после DNS (§5)                            |
| 0.7 Entra в `app.env`, редирект, сессия                                | §6                                                    | ID уже в `/etc/varde/entra.env`; проверка по HTTPS — после DNS |
| 0.8 break-glass на 30 минут                                            | §7 и `docs/varde/runbooks/break-glass.md`             | нет; `404` по HTTPS — после DNS                                |
| 0.12 неделя метрик (стенд удалён в 1.0)                                | §8, `tools/metrics/README.md` | DNS, решение о swap                                            |
| 0.10, 0.10e, 0.10c, 0.10d, 0.11                                        | отложены 13.10                                        | —                                                              |

Пути на VPS: `/opt/varde` = rsync `varde/infra/`; `/opt/varde/config/` = `varde/config/`; `/opt/varde/metrics/` = `varde/tools/metrics/`; `/opt/varde/compose.yml`; `/opt/varde/.env` (`VARDE_SHA=<sha>` — тег обоих образов для compose); `/opt/varde/VERSION` (sha развёрнутого образа); `/opt/varde/images/`; env — `/etc/varde/app.env`, `/etc/varde/backup.env` (`0600 root`); Entra — `/etc/varde/entra/key.pem`, `cert.pem`.

## 1. Один раз: каталоги и файлы (переживают перезагрузку)

```bash
install -d -m 0755 /opt/varde /opt/varde/images
install -d -m 0700 /etc/varde
# uid 1000 — пользователь процесса в образе; кому он соответствует на хосте (держатель доступа к
# каталогам ниже и к ключу Entra) — в evidence
getent passwd 1000 || echo 'uid 1000: нет пользователя на хосте'
# socket break-glass (0.8): uid 1000 — пользователь образа; setgid — socket получает группу docker
install -d -m 2770 /var/lib/varde/run && chown 1000:docker /var/lib/varde/run && chmod 2770 /var/lib/varde/run   # install -o не принимает uid без пользователя на хосте
# экспорт журнала удалений из приложения (0.10e, не используется: журнал выгружает backup.sh ledger, §9)
install -d -m 0750 /var/lib/varde/ledger-out && chown 1000:0 /var/lib/varde/ledger-out
# публичные ключи age (0.10, отложен): до получения ключей — заглушка без ключей
test -e /etc/varde/recipients.txt || printf '# age recipients: pending (backup deferred 13.10)\n' > /etc/varde/recipients.txt
chmod 0644 /etc/varde/recipients.txt
stat -c '%a %u:%g %n' /var/lib/varde/run /var/lib/varde/ledger-out /etc/varde/recipients.txt
# → 2770 1000:<gid docker> …run; 750 1000:0 …ledger-out; 644 0:0 …recipients.txt
```

Откат: `rm -rf /var/lib/varde /etc/varde/recipients.txt` (только до появления данных).

## 2. Образ коммита (на Mac оператора) и перенос

**Готовые скрипты (с 16.10): `infra/ops/`.** Образ и перенос — `bash infra/ops/ship-image.sh <sha12>`; деплой (проверка чистого checkout, копия данных, rsync, миграции, переключение версии, ожидание healthy и версии в `/health`) — `bash infra/ops/deploy.sh <sha12>`; откат — `bash infra/ops/rollback.sh <прежний sha12> [<миграция> …]`. Любая ошибка останавливает скрипт; `.env` и `VERSION` на VPS пишутся только после успешных миграций. Тест без VPS: `bash infra/ops/test/deploy.test.sh`. Ручные команды ниже — то, что скрипты делают по шагам.

```bash
cd <checkout>/varde
SHA=$(git rev-parse --short=12 HEAD)
docker buildx build --platform linux/amd64 -f infra/Dockerfile . \
  --build-arg VARDE_VERSION=$SHA -t varde-api:$SHA --load
docker save varde-api:$SHA | gzip | ssh vardahei-vps "cat > /opt/varde/images/varde-api-$SHA.tar.gz"
ssh -T vardahei-vps "gunzip -c /opt/varde/images/varde-api-$SHA.tar.gz | docker load"
# varde-backup не переносится с Mac: образ инструментов собирается на VPS (§9.2)
rsync -a infra/ vardahei-vps:/opt/varde/                  # всё ещё из <checkout>/varde
rsync -a config/ vardahei-vps:/opt/varde/config/
rsync -a tools/metrics/ vardahei-vps:/opt/varde/metrics/
ssh -T vardahei-vps "printf 'VARDE_SHA=%s\n' $SHA > /opt/varde/.env && echo $SHA > /opt/varde/VERSION"
ssh -T vardahei-vps 'docker compose -f /opt/varde/compose.yml config --images'   # → varde-api:<sha>, varde-backup:pg17-1
```

`rsync` без `--delete`: `.env` и `VERSION` на VPS остаются.

## 3. База, миграции, запуск

1. Первый деплой: `sql/README.md` (а) → (б) → (в) — bootstrap, pg_hba. После него в `app.env` есть `DATABASE_URL` и `SESSION_SECRET`.
2. Миграции — перед `up -d`, каждым деплоем:

```bash
docker compose -f /opt/varde/compose.yml run --rm -T app node node_modules/prisma/build/index.js migrate deploy
# → All migrations have been successfully applied. / No pending migrations to apply.
docker compose -f /opt/varde/compose.yml up -d
docker compose -f /opt/varde/compose.yml ps    # varde-app  Up … (healthy) через ~30 с
```

3. Проверки журнала `sql/README.md` (г).

## 4. Проверки без DNS (0.6)

```bash
docker run --rm --network atlas_edge curlimages/curl:8.17.0 -s -o /dev/null -w '%{http_code}\n' http://varde-app:3000/health   # → 200
docker run --rm --network atlas_edge curlimages/curl:8.17.0 -s http://varde-app:3000/health    # → {"status":"ok","version":"<sha>","db":"ok"}
docker run --rm --network atlas_edge curlimages/curl:8.17.0 -s -o /dev/null "http://varde-app:3000/r/x?c=TESTQUERY"
docker logs varde-app 2>&1 | grep -c TESTQUERY       # → 0
docker logs varde-app 2>&1 | grep '"path":"/r/x"'    # одна строка (404), без query и IP — образец в evidence
```

Адрес VPS — Oleksandr-у для DNS-записи `varde.vardahei.tech`.

## 5. Caddy (только после DNS-записи — иначе Caddy безуспешно запрашивает сертификат)

Две разные правки `/etc/atlas-edge/Caddyfile`; запись в тот же файл (`cat >`, не `mv`), как в `kartlegging/deploy/installer.sh`.

```bash
CF=/etc/atlas-edge/Caddyfile
TS=$(date -u +%Y%m%dT%H%M%SZ)
cp -p $CF $CF.bak-$TS
# (1) глобальный фильтр error-лога
grep -n 'log default' $CF && echo 'СТОП: log default уже есть — вопрос слияния в evidence'
head -c1 $CF    # '{' → глобальный блок есть
```

- Файл начинается с `{`: вставить содержимое `/opt/varde/caddy/global-log.caddy` (без строк-комментариев) **внутрь** существующего глобального блока перед его закрывающей `}` — номер строки этой `}` смотреть `grep -n '^}' $CF | head -1`:

```bash
END=$(grep -n '^}' $CF | head -1 | cut -d: -f1)
W=$(mktemp)
{ head -n $((END - 1)) $CF; grep -v '^#' /opt/varde/caddy/global-log.caddy; tail -n +$END $CF; } > $W
diff $CF $W; cat $W > $CF; rm $W
```

- Файл не начинается с `{`: добавить глобальный блок в начало:

```bash
W=$(mktemp)
{ echo '{'; grep -v '^#' /opt/varde/caddy/global-log.caddy; echo '}'; echo; cat $CF; } > $W
cat $W > $CF; rm $W
```

```bash
# (2) блок сайта — в конец файла
{ echo; cat /opt/varde/caddy/varde.caddy; } >> $CF
docker exec atlas-edge-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile   # → Valid configuration
docker exec atlas-edge-caddy-1 caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile > /tmp/caddy.json
node -e 'const c=require("/tmp/caddy.json");for(const[s,v]of Object.entries(c.apps.http.servers))console.log(s,JSON.stringify(v.logs||null))'
# хост varde.vardahei.tech не должен быть в logger_names файлового логгера; иначе — добавить его в skip_hosts
docker exec atlas-edge-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Если на VPS нет `node`, то же самое: `docker run --rm -i node:22-alpine node -e '…' < /tmp/caddy.json` с `require("/dev/stdin")`.

Проверки после DNS (в `0b-vps-evidence.md`):

```bash
curl -sSi https://varde.vardahei.tech/health | head -1          # → HTTP/2 200; version = <sha>
curl -s "https://varde.vardahei.tech/r/x?c=TESTQUERY" > /dev/null
docker logs atlas-edge-caddy-1 2>&1 | grep -c TESTQUERY        # → 0 (и 0 по файловым output, если adapt их показал)
docker stop varde-app
curl -s "https://varde.vardahei.tech/r/x?c=TESTQUERY2" > /dev/null   # → 502
docker logs atlas-edge-caddy-1 2>&1 | grep -c TESTQUERY2       # → 0
docker logs atlas-edge-caddy-1 2>&1 | grep '"uri":"/r/x"' | tail -1   # образец: json, uri без query, IP …0
docker start varde-app
```

Откат Caddy: `cat $CF.bak-$TS > $CF`, `caddy reload`.

### 5.1 Замена блока сайта (сжатие и HSTS, план улучшений 0.5, 19.10)

`deploy.sh` копирует `infra/caddy/` в `/opt/varde/caddy/` (rsync `infra/`), но общий `/etc/atlas-edge/Caddyfile` не трогает: блок `varde.vardahei.tech { … }` в нём меняется руками после деплоя. Новый файл до записи проверяется `docker cp $W atlas-edge-caddy-1:/tmp/Caddyfile.new` и `caddy validate --config /tmp/Caddyfile.new`. Сделано так 19.10:

```bash
CF=/etc/atlas-edge/Caddyfile
TS=$(date -u +%Y%m%dT%H%M%SZ)
cp -p $CF $CF.bak-$TS
grep -c '^varde.vardahei.tech {$' $CF          # → 1, иначе СТОП
W=$(mktemp)
# старый блок (от строки сайта до первой '}' в начале строки) вырезается, новый — в конец
awk '/^varde\.vardahei\.tech \{$/{skip=1} !skip{print} skip&&/^}$/{skip=0}' $CF > $W
{ echo; grep -v '^#' /opt/varde/caddy/varde.caddy; } >> $W
diff $CF $W; cat $W > $CF; rm $W
docker exec atlas-edge-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile   # → Valid configuration
docker exec atlas-edge-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Проверки:

```bash
curl -sI https://varde.vardahei.tech/health | grep -i strict-transport   # → max-age=31536000 (без includeSubDomains)
curl -s -o /dev/null -D - -H 'Accept-Encoding: zstd, gzip' https://varde.vardahei.tech/r/ | grep -i content-encoding   # → zstd
# SSE (/api/admin/events, /api/presenter/stream) — под входом: в DevTools у ответа text/event-stream нет content-encoding, «I dag» обновляется сам
```

Откат — как выше: `cat $CF.bak-$TS > $CF`, `caddy reload`.

## 6. Entra (0.7)

ID лежат в `/etc/varde/entra.env` (их вписал хостинг-оператор 13.10; это идентификаторы, не секреты). Ключ и сертификат — `/etc/varde/entra/key.pem`, `cert.pem`; в контейнер монтируются read-only (`compose.yml`), процесс в контейнере — uid 1000:

```bash
chgrp 1000 /etc/varde/entra /etc/varde/entra/key.pem /etc/varde/entra/cert.pem
chmod 0750 /etc/varde/entra; chmod 0640 /etc/varde/entra/key.pem; chmod 0644 /etc/varde/entra/cert.pem
stat -c '%a %U:%G %n' /etc/varde /etc/varde/entra /etc/varde/entra/key.pem /etc/varde/entra/cert.pem
# → 700 root:root /etc/varde (bind монтирует сам каталог entra, родитель uid 1000 не проходит);
#   750 root:<группа uid 1000> …/entra; 640 root:<…> key.pem; 644 root:<…> cert.pem
getent passwd 1000; getent group 1000   # кто ещё на хосте читает key.pem — в список держателей
```

В `/etc/varde/app.env` дописать (значения ID — из `entra.env`; файл не выводить):

```
ENTRA_TENANT_ID=<tenant id>
ENTRA_CLIENT_ID=<client id>
ENTRA_CLIENT_KEY_FILE=/etc/varde/entra/key.pem
ENTRA_CLIENT_CERT_FILE=/etc/varde/entra/cert.pem
VARDE_ADMIN_GROUP_ID=<object id группы «Varde admins»>
PUBLIC_URL=https://varde.vardahei.tech
SESSION_TTL_SECONDS=28800
```

`SESSION_SECRET` уже записал `bootstrap.sh`. Затем `docker compose -f /opt/varde/compose.yml up -d`.

`SESSION_IDLE_SECONDS` (по умолчанию 3600) — сколько Entra-сессия живёт без запросов; `SESSION_TTL_SECONDS` остаётся абсолютным пределом. Cookie сессии называется `__Host-varde_session` (1.3): при первой выкатке с ним все администраторы входят заново один раз. `VARDE_OIDC_ISSUER` при `NODE_ENV=production` приложение не принимает.

Проверки: без DNS — `docker run --rm --network atlas_edge curlimages/curl:8.17.0 -sI http://varde-app:3000/auth/login` → `302`, `Location: https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize?…`; после DNS — `curl -sI https://varde.vardahei.tech/auth/login` → то же; после реального входа Oleksandr-а — `docker exec -i atlas-db-1 sh -c 'psql -X -U "${POSTGRES_USER:-postgres}" -d varde -tAc "select via, count(*) from admin_session group by 1"'` → `entra|1` (без имён).

Откат: удалить строки `ENTRA_*` из `app.env`, `up -d` → `/auth/login` отвечает `503 auth not configured`, `/health` — 200.

## 7. Break-glass (0.8)

Процедура — `docs/varde/runbooks/break-glass.md`. Проверка на VPS по пакету: включить на 30 минут, режим socket `660`, вход через туннель, из соседнего контейнера `http://varde-app:3001/` → connection refused, `ss -lntp | grep -c 3001` → 0, после DNS `curl -sI https://varde.vardahei.tech/break-glass/login` → 404, выключить.

## 8. Метрики (0.12)

Неделя метрик — `tools/metrics/README.md` (cron на 7 дней, сводка `sort`/`awk`). Стенд нагрузки и stub удалены в 1.0 (решение 13.10: нагрузочных тестов нет); после деплоя 1a `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://varde.vardahei.tech/stub/submit` → `404`, `to_regclass('stub_submission')` → пусто.

## 9. Бэкап (план улучшений 0.1, ADR-016)

Ночная копия базы `varde` и экспорт журнала удалений — в SharePoint-сайт `VardeBackup` (вариант A, решение Oleksandr 27.10). Скрипты, образ инструментов, systemd-юниты и тест — `infra/backup/` (на VPS — `/opt/varde/backup`, приходит rsync деплоя). Runbook восстановления для Oleksandr, Asbjørn и Bjarte — `infra/backup/RESTORE.nn.md` (лежит и в каждой копии, в `kit.tar.gz`). Тест без VPS и SharePoint: `bash infra/backup/test/backup.test.sh`.

Что лежит в SharePoint (`<remote>` — `VARDE_BACKUP_REMOTE`):
- `nightly/<UTC-время>/` — `varde.dump.age` (`pg_dump -Fc` ролью `varde_backup`, age на все ключи `recipients.txt`), `canary.age`, `kit.tar.gz` (скрипты и runbook, без секретов), `meta.json` (образ, последняя миграция, sha256 дампа, число строк каждой таблицы из того же snapshot). `meta.json` пишется последним: каталог без него — незаконченный прогон. Ротация — 35 дней, но не меньше 7 последних законченных копий;
- `images/varde-api-<sha>.tar.gz` — образ api каждой версии, которую называет хотя бы одна копия;
- `ledger/<UTC-время>.tar.age` — `deletion_request`, `deletion_tombstone`, `participant_tombstone` (CSV, один snapshot). Раз в 15 минут, только если журнал изменился. Не ротируется (ADR-017).

### 9.1 Шаги Oleksandr (админ тенанта; секрет в чат не попадает)

1. Сайт SharePoint `VardeBackup`, приватный. Участники с чтением — Oleksandr, Asbjørn, Bjarte.
2. Регистрация приложения в Entra `varde-backup`: Microsoft Graph, Application, `Sites.Selected`, admin consent. Право `write` только на сайт `VardeBackup` — Graph `POST /sites/{site-id}/permissions` (`roles: ["write"]`, `grantedToIdentities` с app id) или PnP `Grant-PnPAzureADAppSitePermission`. Client secret на 12 месяцев, дату окончания — в evidence (её проверяет ежемесячный ритм §8 плана).
3. Каждый держатель ключа (Oleksandr, Asbjørn, Bjarte) на своём устройстве с шифрованным диском: `age-keygen -o ~/varde-age.key`. Публичный ключ (`age1…`, строка `Public key` в выводе) присылает оркестратору. Приватный ключ никуда не копируется.
4. На VPS сам создаёт `/etc/varde/rclone/rclone.conf` (после шага 9.2.1):

   ```ini
   [vardebackup]
   type = onedrive
   client_id = <app id varde-backup>
   client_secret = <secret>
   tenant = <tenant id>
   client_credentials = true
   drive_type = documentLibrary
   drive_id = <id библиотеки «Documents» сайта VardeBackup: Graph GET /sites/{site-id}/drive → id>
   ```

   `chmod 0600 /etc/varde/rclone/rclone.conf`.

### 9.2 Шаги хостинг-оператора

```bash
# 1. каталоги и файлы; recipients.txt — три строки age1… (Oleksandr, Asbjørn, Bjarte), без секретов
install -d -m 0700 /etc/varde/rclone /var/lib/varde/backup-state
printf '%s\n' '# Oleksandr' 'age1…' '# Asbjørn' 'age1…' '# Bjarte' 'age1…' > /etc/varde/recipients.txt && chmod 0644 /etc/varde/recipients.txt
grep -c '^age1' /etc/varde/recipients.txt            # → 3
grep -q '^VARDE_BACKUP_REMOTE=' /etc/varde/backup.env || echo 'VARDE_BACKUP_REMOTE=vardebackup:varde' >> /etc/varde/backup.env
# 2. образ инструментов (после деплоя с infra/backup); новый тег — при изменении infra/backup/Dockerfile
docker build -t varde-backup:pg17-1 /opt/varde/backup
# 3. доступ к SharePoint (после 9.1.4): листинг, запись, удаление тестового файла
C="docker compose -f /opt/varde/compose.yml --profile backup run --rm -T backup"
$C rclone lsd vardebackup:
echo probe | $C sh -c 'rclone rcat vardebackup:varde/probe.txt && rclone lsf vardebackup:varde && rclone deletefile vardebackup:varde/probe.txt'
# 4. первый прогон вручную
install -m 0644 /opt/varde/backup/systemd/varde-backup.* /opt/varde/backup/systemd/varde-ledger.* /etc/systemd/system/
systemctl daemon-reload
systemctl start varde-backup.service varde-ledger.service
journalctl -u varde-backup -u varde-ledger --since '-15 min' --no-pager | tail -20   # → done: nightly/<ts> …; ledger: …
$C rclone lsf -R vardebackup:varde | head -20
# 5. таймеры
systemctl enable --now varde-backup.timer varde-ledger.timer
systemctl list-timers 'varde-*' --no-pager
```

Проверка восстановления (первая — сразу после шага 4, дальше после каждой выкатки с миграцией или раз в месяц): на Mac держателя ключа скачать последний каталог `nightly/<ts>/` и каталог `ledger/` из SharePoint, затем

```bash
docker build -t varde-backup:pg17-1 varde/infra/backup
docker run --rm -v <каталог nightly>:/in:ro -v ~/varde-age.key:/key:ro -v <каталог ledger>:/ledger:ro \
  -v "$PWD/varde/infra/backup:/kit:ro" varde-backup:pg17-1 /kit/restore-check.sh /in /key /ledger
# → ok … restore check passed: copy is N h old, check took N s
```

Вывод (без ключа и данных) — в evidence. Расхождение числа строк, sha256 или canary — копия не годится: разобраться до следующей ночи.

Миграции и выкатки — не между 03:15 и 04:00 по Осло: ночной дамп держит AccessShare на всех таблицах, `ALTER TABLE` миграции ждёт его. Дамп ждёт блокировку не больше 60 с (`lock_timeout`, `--lock-wait-timeout`) и тогда падает с `/fail`, а не вешает приложение за собой. Прогоны `nightly` и `ledger` идут по одному (flock в `/var/lib/varde/backup-state`), так что у `varde_backup` (CONNECTION LIMIT 3) от бэкапа не больше двух подключений.

Восстановление — `RESTORE.nn.md` §4–§5: `restore.sh` в образе бэкапа с примонтированным docker socket и `VARDE_RESTORE_CONTAINER=atlas-db-1`, суперпользователем через socket внутри контейнера (TCP суперпользователя к `varde` отвергает pg_hba). Таймеры на время восстановления останавливаются.

Откат: `systemctl disable --now varde-backup.timer varde-ledger.timer`, удалить юниты из `/etc/systemd/system/`, `daemon-reload`. Копии в SharePoint остаются до решения Oleksandr.

## Откат деплоя

```bash
printf 'VARDE_SHA=%s\n' <предыдущий sha> > /opt/varde/.env && echo <предыдущий sha> > /opt/varde/VERSION
docker compose -f /opt/varde/compose.yml up -d
# миграция назад — down.sql задачи (socket):
docker exec -i atlas-db-1 sh -c 'psql -X -U "${POSTGRES_USER:-postgres}" -d varde -v ON_ERROR_STOP=1' < /opt/varde/<down.sql из репо>
```

`down.sql` лежит в `varde/apps/api/prisma/migrations/<имя>/down.sql` репозитория (в `/opt/varde` его нет — скопировать `scp`). Caddyfile — вернуть `.bak` и reload.
