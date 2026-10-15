# Переключение kartlegging → Varde

Исполнитель — хостинг-оператор. Oleksandr назначает день после закрытия кампании, сверяет данные и подписывает go/no-go. Кодер на VPS не ходит. Приёмка кода 1c не означает выполненный cutover: статус **pending** до подписи в `docs/varde/evidence/stage-1/cutover.md`.
Основание: ADR-024; решения пакета stage-1 §10 (Caddy вместо DNS; ключ VPS + ключ Oleksandr; архив вне VPS; сбор после rollback только в Varde). Экспорт DeletionLedger после каждой записи отложен вместе с 0.10e; до появления экспорта оператор сохраняет актуальный журнал отдельно перед восстановлением.

> **Упрощение 15.10.2026 (решение Oleksandr, `BESLUTNINGER.md`).** Опросники ещё не проводились; в Varde переносится только раунд 1 (Master_Analyse, `private/runde1.js`). Поэтому: T−1 п. 3 (ключи age) и шаг (6) (архив вне VPS) **не выполняются**; шаг (3) — `seed` и `import runde1` **без** `import svar` (2 строки `svar.jsonl` — пилот); `register-archive` не вызывается; старые копии (`/root/kartlegging-backup-*`, `svar.jsonl*`, `muligheter.tgz` не трогать) и пилотные ответы удаляются оператором без копирования; rollback из архива не предусмотрен — откат шага (7) это возврат блока Caddy на `kartlegging-old.caddy` и запуск старого контейнера (данных для сохранения нет). Остальные проверки (pg_hba, read-only, сверка раунда 1, маршруты, логи) остаются.

## T−1: входы и проверки

1. Образ последнего принятого `main` на VPS; artifact hash, зелёный CI с `invariants:1a`, `1b`, `1b:runner`, `1c` и репетицией записаны в чек-листе. Деплой — `varde/infra/README.md`, без изменения учётных данных Atlas. Скопировать `varde/infra/caddy/` в `/opt/varde/caddy/`, `varde/tools/cutover/` в `/opt/varde/tools/cutover/` и общий модуль `varde/apps/api/src/modules/imports/runde1-source-id.mjs` в `/opt/varde/apps/api/src/modules/imports/runde1-source-id.mjs` (сохранить относительные пути для CLI очистки).
2. Повторить **четыре проверки pg_hba** из `varde/infra/sql/README.md`:

```bash
SU() { docker exec -i atlas-db-1 sh -c 'exec psql -X -U "${POSTGRES_USER:-postgres}" -v ON_ERROR_STOP=1 "$@"' psql "$@"; }
SU -d varde -tAc 'select 1' # 1
# TCP superuser должен быть отклонён до аутентификации
 docker exec atlas-db-1 sh -c 'psql -X -h 127.0.0.1 -U "${POSTGRES_USER:-postgres}" -d varde -c "select 1"'
# До появления backup-образа используются эти два эквивалентных теста
 docker run --rm --network atlas_internal --env-file /etc/varde/backup.env postgres:17.6-bookworm psql -X -c 'select 1' # 1
 docker run --rm --network atlas_internal --env-file /etc/varde/backup.env postgres:17.6-bookworm psql -X -d postgres -c 'select 1' # rejects connection
```

Проверка: результаты 1, reject, 1, reject; при расхождении стоп. Откат pg_hba — только по SQL runbook, не менять его в процессе cutover. Отметка Oleksandr о риске stage-0 §9 п. 5 обязательна.
3. Получить публичный ключ age Oleksandr. Создать второй recipient — ключ VPS (не escrow):

```bash
install -d -m 0700 -o root -g root /etc/varde/cutover
umask 077
# Если ключ уже существует, не перезаписывать его
 test -e /etc/varde/cutover/age.key || age-keygen -o /etc/varde/cutover/age.key
chmod 0600 /etc/varde/cutover/age.key
age-keygen -y /etc/varde/cutover/age.key > /etc/varde/cutover/recipient.txt
stat -c '%a %U' /etc/varde/cutover/age.key # 600 root
```

Проверка: оба публичных recipient получены, приватный ключ не выводится. Откат до архива: удаление нового ключа, если он ещё ничего не шифровал.
4. Действующий блок должен дословно совпасть с `kartlegging-old.caddy`:

```bash
CF=/etc/atlas-edge/Caddyfile
sed -n '/^kartlegging\.vardahei\.tech {/,/^}/p' "$CF" > /etc/varde/cutover/old-site.caddy
diff -u /opt/varde/caddy/kartlegging-old.caddy /etc/varde/cutover/old-site.caddy
```

Расхождение → стоп, сначала исправление файла в репо. Проверка: `diff` пуст. Откат: исходный Caddy пока не менялся.

## День cutover

### (1) Закрытие и технический read-only

Oleksandr закрывает всех клиентов в админке kartlegging. Оператор записывает `KARTLEGGING_LESEMODUS=1` в `/opt/kartlegging/deploy/.env` (без вывода остальных значений), затем:

```bash
docker compose -f /opt/kartlegging/deploy/compose.yaml up -d --force-recreate
docker compose -f /opt/kartlegging/deploy/compose.yaml exec -T app printenv KARTLEGGING_LESEMODUS # 1
curl -s -o /dev/null -w '%{http_code}' -X POST https://kartlegging.vardahei.tech/api/framdrift -d '{}' # 410
```

Третья проверка: Oleksandr пробует открыть одного клиента в админке → 409 «Lesemodus: kartlegginga kan ikkje opnast att.». Все три результата — в чек-лист. Без флага `/api/framdrift` с `{}` → 204; `/api/svar` закрытого клиента даёт 410 и без флага, поэтому одного этого теста недостаточно. `restart` не перечитывает environment. Откат шага: `0` в `.env` и тот же `up -d --force-recreate`, только по решению Oleksandr.

### (2) Финальные копии и (2a) дамп до импорта

```bash
umask 077
W="/root/cutover-$(date -u +%Y%m%d)"
install -d -m 0700 "$W" "$W/data" "$W/private" "$W/old-copies"
cp /opt/kartlegging/data/tilgang.json /opt/kartlegging/data/kundar.json /opt/kartlegging/data/svar.jsonl "$W/data/"
cp /opt/kartlegging/private/runde1.js "$W/private/"
(cd "$W" && sha256sum data/tilgang.json data/kundar.json data/svar.jsonl private/runde1.js > SHA256SUMS)
# Unix socket внутри atlas-db-1; env Atlas не читается
 docker exec -i atlas-db-1 sh -c 'pg_dump -U "${POSTGRES_USER:-postgres}" -d varde -Fc' > "$W/varde-pre.dump"
chmod 0600 "$W/varde-pre.dump"
test -s "$W/varde-pre.dump"
SU() { docker exec -i atlas-db-1 sh -c 'exec psql -X -U "${POSTGRES_USER:-postgres}" -v ON_ERROR_STOP=1 "$@"' psql "$@"; }
SU -d varde -tAc 'select count(*) from response; select count(*) from aggregate_snapshot' # 0, 0
```

До go **retention.forget не выполняется**. Оператор перечисляет старые копии (например `/root/kartlegging-backup-*`, `svar.jsonl*`); по умолчанию копирует их в `old-copies/`, Oleksandr может назначить удаление. Список и sha256 файлов — в evidence, без содержимого. Если Varde не пуст до импорта — стоп. Откат копирования: убрать рабочий каталог; оригиналы пока остаются.

### (3) Seed, импорт и release

```bash
CLI() { docker compose -f /opt/varde/compose.yml run --rm -T -v "$W:/import:ro" app node dist/cli.js "$@"; }
CLI seed --clients /out/config/seed/clients.json --kundar /import/data/kundar.json --tilgang /import/data/tilgang.json
CLI import runde1 --file /import/private/runde1.js
CLI import svar --file /import/data/svar.jsonl
CLI rounds close --imported
```

Проверка: все manifest `ok`, сверка по common/leader сходится; evidence содержит только счётчики. Ошибка на (3)–(5) → no-go ниже, не удалять released-снимки вручную.

### (4) Сверка и (5) go/no-go

Счётчики исходного файла получить **без вывода строк**:

```bash
jq -s 'group_by([.skjema,.k,.leiardel]) | map({skjema:.[0].skjema,k:.[0].k,leiardel:.[0].leiardel,n:length})' "$W/data/svar.jsonl"
```

Сравнить с ImportManifest, включая rejected, existing и suppressed по частям; учесть журнал удалений. Oleksandr сравнивает Soner старого дашборда и Varde: раунды 1 и 2, по каждому клиенту snittscore, kritisk andel, люди по четырём зонам. В чек-листе — таблица чисел; только отклонения stage-1 §6 допустимы (п. 11: отдельные числа rejected и KI 2026-10-12). Подпись Oleksandr go/no-go обязательна. До подписи старый host не переключается.

**No-go или сбой (3)–(5):**

```bash
docker compose -f /opt/varde/compose.yml stop app
docker exec -i atlas-db-1 sh -c 'pg_restore -U "${POSTGRES_USER:-postgres}" -d varde --clean --if-exists --single-transaction' < "$W/varde-pre.dump"
docker compose -f /opt/varde/compose.yml up -d
SU() { docker exec -i atlas-db-1 sh -c 'exec psql -X -U "${POSTGRES_USER:-postgres}" -v ON_ERROR_STOP=1 "$@"' psql "$@"; }
SU -d varde -tAc 'select count(*) from response; select count(*) from aggregate_snapshot' # 0, 0
# Только после проверки восстановления
rm -r "$W"
```

Это откат **к дампу до импорта**, а не forget импортированных ответов: released DELETE запрещён триггером, tombstones подавили бы новую попытку. Теряются только admin_session и AuditLog после дампа. Флаг read-only остаётся до следующей попытки; выключение — решение Oleksandr.

### (6) Проверенный архив вне VPS

```bash
ARCHIVE="$W.tar.age"
# OLEKSANDR_RECIPIENT — полученный публичный ключ, не приватный ключ
VPS_RECIPIENT="$(cat /etc/varde/cutover/recipient.txt)"
tar -C "$W" -cf - data private old-copies SHA256SUMS | age -r "$OLEKSANDR_RECIPIENT" -r "$VPS_RECIPIENT" -o "$ARCHIVE"
sha256sum "$ARCHIVE"
```

Oleksandr копирует `scp` на Mac в `~/Vardahei-arkiv/`; sha256 файла на Mac должен совпасть с VPS. Проверить **расшифровкой ключом VPS**, а не только наличием файла:

```bash
VERIFY=$(mktemp -d /root/cutover-verify-XXXXXX)
chmod 0700 "$VERIFY"
age -d -i /etc/varde/cutover/age.key "$ARCHIVE" | tar -xf - -C "$VERIFY"
(cd "$VERIFY" && sha256sum -c SHA256SUMS)
rm -r "$VERIFY"
# После двух проверок (Mac hash и расшифровка) убрать шифротекст на VPS
rm "$ARCHIVE"
test ! -e "$ARCHIVE"
```

Удалить открытые `/opt/kartlegging/data/svar.jsonl`, `/opt/kartlegging/private/runde1.js`, перечисленные старые копии и `$W` вместе с дампом. Не удалять каталоги приложения или учётные файлы. Проверка: `ls -d /opt/kartlegging/data/svar.jsonl* /opt/kartlegging/private/runde1.js /root/kartlegging-backup-* /root/cutover-* 2>/dev/null` → пусто. Откат после удаления — только восстановление архива с Mac по процедуре rollback.

### (7) Caddy и остановка старого контейнера

```bash
CF=/etc/atlas-edge/Caddyfile
TS=$(date -u +%Y%m%dT%H%M%SZ)
cp -p "$CF" "$CF.bak-$TS"
docker run --rm -v /etc/atlas-edge:/edge -v /opt/varde:/varde:ro node:22-alpine node /varde/tools/cutover/update-caddy.mjs /edge/Caddyfile /varde/caddy/kartlegging-legacy.caddy
docker exec atlas-edge-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec atlas-edge-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose -f /opt/kartlegging/deploy/compose.yaml stop app
```

Имя Caddy-контейнера сверить с `infra/README.md` до команды. Меняется только блок kartlegging, запись в **тот же inode**. `validate` перед `reload`; при неудаче перейти к rollback. С этого шага любой rsync kartlegging использует `--exclude private/runde1.js`. Код старого приложения остаётся; DNS не меняется.

### (8) Проверки маршрутов и логов; (9) регистрация срока

Старую ссылку Oleksandr открывает вручную → 200 «avslutta», код не помещать в evidence/командную историю. `/runde1.js`, `/auth/login`, `/api/runner/round`, `/r`, `/health` на старом host → 404; `/dashboard` и `/admin` → 302 на Varde `/admin`; Varde `/admin` работает. Пример проверки:

```bash
for path in runde1.js auth/login api/runner/round r health; do curl -s -o /dev/null -w '%{http_code}' "https://kartlegging.vardahei.tech/$path"; done
curl -s -o /dev/null -w '%{http_code}' https://kartlegging.vardahei.tech/dashboard # 302
```

`grep -c` кода по логам Caddy и приложения → 0, без печати совпавших строк; успешный runner не логируется. Откат — процедура ниже.
CLI `cutover register-archive --sha256 <hash файла на Mac> --cutover-date <YYYY-MM-DD> [--report-date <YYYY-MM-DD>]`. Срок = min(отчёт, cutover + 90 дней). После отчёта `cutover set-report-date <YYYY-MM-DD>`. За 14 дней и после срока «Oversikt» напоминает. В день удаления Oleksandr удаляет архив на Mac и подтверждает; оператор удаляет `/etc/varde/cutover/age.key`, проверяет `test ! -e`, пишет `cutover archive-deleted`. Записи cutover.* остаются в AuditLog; процедура — RETENTION.md.

## Rollback в пределах семи дней

(r1) Только оператор копирует архив с Mac (`scp`) в временный каталог `0700` на VPS, расшифровывает ключом VPS и проверяет SHA256SUMS. Ответы Varde не откатываются.
(r2) Выгрузить **актуальный** журнал; очистить архив перед размещением файлов:

```bash
R=$(mktemp -d /root/varde-rollback-XXXXXX)
chmod 0700 "$R"
# После копирования и расшифровки архива в $R/restored
 docker compose -f /opt/varde/compose.yml run --rm -T app node dist/cli.js ledger tombstones --format kartlegging > "$R/tombstones.json"
docker run --rm -v "$R:/rollback" -v /opt/varde:/varde:ro node:22-alpine node /varde/tools/cutover/clean-archive.mjs --tombstones /rollback/tombstones.json --svar /rollback/restored/data/svar.jsonl --runde1 /rollback/restored/private/runde1.js --out /rollback/clean
install -m 0600 "$R/clean/svar.jsonl" /opt/kartlegging/data/svar.jsonl
install -m 0600 "$R/clean/runde1.js" /opt/kartlegging/private/runde1.js
```

(r3) `KARTLEGGING_LESEMODUS=1` в `.env`, `up -d --force-recreate`; повторить три проверки шага (1). **Приём в kartlegging после rollback не открывается**; для сбора в окне используется новый раунд Varde.
(r4) Caddy: заменить **только блок kartlegging** на `kartlegging-old.caddy` через `update-caddy.mjs`, тот же inode, `validate`, `reload`. Весь `.bak` допускается вернуть только при неудаче validate и подтверждении, что Atlas после создания `.bak` Caddyfile не менял; иначе только блок.
(r5) Удалить временный каталог (шифротекст и расшифровку), выполнить CLI `cutover archive-restored`; записать результат в чек-лист. Проверка: удалённые строки и части отсутствуют, старые POST → 410, новые Varde-ответы на месте. Повторный cutover начинается с (2) **на очищенных файлах**, импорт применяет ledger сам, 0 новых частей; снимки и ответы «в окне» сохраняются. Откат rollback — повторный cutover по тем же проверкам, без открытия старого приёма.
