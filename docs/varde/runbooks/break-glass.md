# Break-glass: аварийный вход в админку Varde

Читатели — держатели SSH на VPS (сегодня Oleksandr и хостинг-оператор). У заместителей SSH нет (решение 13.10 «Escrow прод-секретов … не делаем»). Основание — ADR-008, `stage-0.md` §9 п. 9, задача 0.8.

Когда: Entra недоступен (сбой регистрации, сертификата, тенанта), а админке нужен доступ. Это не обычный вход.

## Как устроено

- Выключено по умолчанию. Включается тремя переменными в `/etc/varde/app.env` на время не больше 4 ч (`BREAK_GLASS_MAX_HOURS`).
- Второй экземпляр приложения слушает **Unix socket** `/run/varde/break-glass.sock` в контейнере = `/var/lib/varde/run/break-glass.sock` на хосте (каталог `2770`, setgid, владелец uid 1000, группа docker). TCP-порта нет: соседние контейнеры в сетях Atlas его не видят. С публичного адреса `/break-glass/*` → `404` всегда.
- Вход паролем (argon2id) даёт сессию `via = break_glass` на `min(UNTIL, сейчас + 1 ч)`; её принимает только socket-listener. Сессии Entra там не принимаются.
- В момент `UNTIL` socket закрывается, все break-glass-сессии отзываются.
- AuditLog: `break_glass.enabled` (при старте, `until`, `operator`), `break_glass.rejected` (окно > 4 ч или битый hash), `break_glass.login`, `break_glass.login_failed`, `break_glass.closed`. Вход и создание сессии — одна транзакция: не записался AuditLog — сессии нет.

## Включить

```bash
ssh -T vardahei-vps     # без TTY: иначе compose выделит TTY и в вывод попадёт CRLF
# 1) строка hash уходит прямо в app.env; пароль печатается один раз в stderr — запомнить, нигде не сохранять
grep -q '^VARDE_BREAK_GLASS_PASSWORD_HASH=' /etc/varde/app.env || \
  docker compose -f /opt/varde/compose.yml run --rm -T app node dist/cli.js break-glass-hash >> /etc/varde/app.env
# 2) окно и оператор (пример — 30 минут)
echo "VARDE_BREAK_GLASS_UNTIL=$(date -u -d '+30 min' +%Y-%m-%dT%H:%M:%SZ)" >> /etc/varde/app.env
echo "VARDE_BREAK_GLASS_OPERATOR=<кто включил>" >> /etc/varde/app.env
docker compose -f /opt/varde/compose.yml up -d
stat -c %a /var/lib/varde/run/break-glass.sock      # → 660
stat -c '%a %U:%G' /var/lib/varde/run              # → 2770 <uid 1000>:docker
getent passwd 1000; getent group docker            # uid 1000 и члены docker — держатели доступа к socket
docker logs varde-app 2>&1 | grep 'break-glass' | tail -2   # listening on /run/varde/break-glass.sock until …
```

Строка hash — **в одинарных кавычках** (так её печатает CLI): `app.env` читается Compose как `env_file`, и `$argon2id$…` без кавычек превратился бы в мусор; приложение тогда не включает функцию и пишет `break_glass.rejected` с `bad_hash`. Руками строку не править.

## Туннель и вход (с Mac держателя)

```bash
ssh -N -L 3001:/var/lib/varde/run/break-glass.sock vardahei-vps
```

sshd открывает socket от имени SSH-пользователя: нужен root или член группы `docker` на VPS. Затем в другом терминале:

```bash
curl -s -c /tmp/bg.cookies -H 'content-type: application/json' \
  -d '{"password":"<пароль из stderr>"}' http://localhost:3001/break-glass/login   # → {"via":"break_glass",…}
curl -s -b /tmp/bg.cookies http://localhost:3001/auth/me                          # → 200
```

В браузере — `http://localhost:3001/…` через тот же туннель (cookie выдан на `localhost`). После работы — `rm /tmp/bg.cookies`.

## Выключить

```bash
sed -i '/^VARDE_BREAK_GLASS_\(UNTIL\|PASSWORD_HASH\|OPERATOR\)=/d' /etc/varde/app.env
docker compose -f /opt/varde/compose.yml up -d
test -e /var/lib/varde/run/break-glass.sock && echo 'socket остался' || echo 'socket закрыт'   # → socket закрыт
```

Приложение при старте в выключенном режиме удаляет оставшийся socket (после падения или OOM), поэтому ожидается `socket закрыт`; `socket остался` — сбой, смотреть `docker logs varde-app | grep break-glass`. Без перезапуска окно закрывается само в `UNTIL`, но переменные всё равно удалить. Пароль одноразовый: при следующем включении CLI выпускает новый.

## Что смотреть в AuditLog

Superuser через socket (`infra/sql/README.md`):

```bash
docker exec -i atlas-db-1 sh -c 'psql -X -U "$POSTGRES_USER" -d varde -c "select what, who, at from audit_log where who like '"'"'break-glass%'"'"' order by at"'
```

Ожидается: один `break_glass.enabled` на каждое включение, `login` / `login_failed` по попыткам, `closed` в конце окна (если процесс дожил до `UNTIL`). Неожиданный `login_failed` — повод сменить пароль (выключить, удалить строку hash, включить заново).

## Проверка на VPS (0.8, хостинг-оператор)

Включить на 30 минут (выше); `stat` → `660`; вход через туннель; из соседнего контейнера `docker run --rm --network atlas_edge curlimages/curl:8.17.0 -m 3 http://varde-app:3001/` → connection refused; на хосте `ss -lntp | grep -c 3001` → `0`; после DNS — `curl -sI https://varde.vardahei.tech/break-glass/login` → `404`; выключить. В evidence: записи AuditLog (запрос выше), режим socket, держатели SSH/root и группы docker, отметка «пароль и строки удалены <дата>».

## Машина восстановления (0.10c, отложено 13.10)

На Docker Desktop Unix socket из bind-тома хоста недоступен с Mac. Там данные смотрят локальным `psql` или изнутри контейнера: `docker compose -f infra/compose.restore.yml exec app sh -c 'wget -qO- …'` — в образе нет curl; для socket — `node -e` с `http.request({ socketPath: '/run/varde/break-glass.sock', … })`.
