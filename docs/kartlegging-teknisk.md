# kartlegging: как устроено

Один процесс Node 22, без npm-зависимостей. Хранилище — файлы JSON/JSONL в `DATA_DIR`. Фронтенд — чистый JS без сборки.

## Файлы

| Файл | Роль |
| --- | --- |
| `server.js` | HTTP-сервер, валидация ответов, сессии, админ-API, SSE, CSV, плакат с QR, CLI |
| `public/sporsmal.js` | `window.KARTLEGGING`: контакты, клиенты, оба опросника, советы, цвета ответов, `SONER`, `minGruppe`, `leiarRoller`. Сервер грузит его через `vm` для валидации |
| `public/index.html` | Опросник: язык nn/en, профиль высоты, черновик в localStorage, анонимный прогресс в админку |
| `private/dashboard.html` | Дашборд: зоны, выводы, круговые, по сотрудникам, сравнение с раундом 1, по вопросам, руководители. Без сервера — демоданные |
| `private/admin.html` | Админка: процент ответов, кто отвечает сейчас, где бросают, открыть/закрыть, срок, новый код, тексты рассылки, плакат |
| `private/runde1.js` | 57 ответов раунда 1 с инициалами. Генерируется `tools/runde1_fra_excel.py` |
| `private/ki-tilsett.js` | Таблица «Svar per tilsett» для KI в дашборде (`window.KiTilsett`). Столбец «Førre runde» появится, если будет `window.KI_FORRIGE.svar` с прошлым KI-раундом |
| `lib/analyse-eksport.js` | CSV для Master_Analyse: строка на человека и вопрос, первые шесть столбцов как `PQ_Detalj_Risiko` |
| `private/logo.b64` | Логотип для плаката |
| `lib/qrcode.js` | qrcode-generator 1.4.4 (MIT, Kazuhiko Arase) |
| `deploy/` | `compose.yaml`, `installer.sh`, `brukarar.seed.json` |

## Маршруты

Открытые:
- `GET /` — опросник, `?s=<tryggleik|ki>&k=<kunde>&t=<kode>`
- `GET /sporsmal.js`, `/logo.png`, `/healthz`
- `GET /api/sjekk?k&t` — 403 неверный код, 410 клиент закрыт или срок прошёл
- `POST /api/svar` — ответ; сервер чистит его по банку вопросов (`valider`)
- `POST /api/framdrift` — анонимный прогресс сессии (`okt`, номер вопроса, без ответов)
- `GET/POST /logg-inn`, `POST /logg-ut`, `GET/POST /byt-passord`

После входа:
- `/dashboard`, `/admin`, `/runde1.js`, `/ki-tilsett.js`, `/plakat?k&s`
- `GET /api/meg`, `/api/svar`, `/api/svar.csv?s=`, `/api/analyse.csv[?s=]` (Master_Analyse, событие `eksport_analyse`), `/api/lenkjer`, `/api/admin/status`
- `GET /api/admin/straum` — SSE, событие `oppdatert`
- `POST /api/admin/kunde {k, tilsette, open, frist}`, `POST /api/admin/nykode {k}`

Защита: cookie `kl_okt` (HttpOnly, SameSite=Lax, Secure за HTTPS), сессия 8 ч; проверка same-origin (Sec-Fetch-Site, затем Origin); блокировка после 5 ошибок на учётку или 10 с IP на 15 минут; лимиты на открытые API за 10 минут (`GRENSE` в `server.js`): `/api/sjekk` 300 с IP, `/api/svar` 100 с IP, `/api/framdrift` 3000 с IP и 300 на сессию (`okt`), а после 20 неверных кодов с IP `sjekk` и `svar` отвечают 429. Лимиты на IP рассчитаны на то, что весь офис клиента выходит в интернет с одного адреса. IP берётся из **последнего** элемента `X-Forwarded-For`: его добавляет Caddy, а первый клиент может подставить сам; `maaByte` заставляет сменить пароль, и до смены API отвечает 403.

## Данные (`DATA_DIR`)

| Файл | Содержимое |
| --- | --- |
| `svar.jsonl` | `{id, tid, skjema, k, lang, versjon, leiardel, sekund, svar:{id: значение}, fri:{id: текст}}`. Без IP. Инициалы в обоих опросниках: `F1` (безопасность), `K0` (KI); id вопроса с инициалами — `skjema.<id>.initialar` в `sporsmal.js` |
| `framdrift.json` | Где сейчас каждая сессия (анонимно) |
| `tilgang.json` | Код в ссылке для каждого клиента |
| `kundar.json` | Число сотрудников, открыт/закрыт, срок |
| `brukarar.json` | Учётки: scrypt (N=16384) хеш, соль, `maaByte` |
| `hendingar.jsonl` | Входы, ошибки входа, смены пароля, действия в админке |

## Банк вопросов (`sporsmal.js`)

Типы: `single`, `multi`, `text`, `scale`, `nps`. Поля вопроса:
`id`, `del` (A — все, B — руководитель/IT), `tekst {nn,en}`, `hjelp`, `ingress` (заголовок раздела), `val` (варианты `{id,nn,en,aleine?}`), `vis(svar)` (условие показа), `valFraa` (варианты из ответа на другой вопрос), `maks`, `minst`, `fritekst`, `fritekstNaar`, `valfri`, `paakravd`, `einlinje`, `stor` (верхний регистр), `maksLengd`, `rolle` (вопрос о роли), `anker` (якорный вопрос для сравнения раундов), `kort` (короткое имя для дашборда), `farge` (цвет ответа 0–3, см. `sonemodell.md`), `scenario`/`rett`/`fasit` (только KI-опросник).

Если поменять id вопроса или варианта, старые ответы пропадут с дашборда. Новые клиенты — в `KUNDAR` и перезапуск.

## Запуск и проверка

```bash
cd kartlegging
node server.js                                  # 127.0.0.1:3070
PORT=3099 DATA_DIR=/tmp/kdata node server.js    # отдельные тестовые данные
node server.js --lenkjer
```

Playwright-тесты (`npm i -D playwright` в корне, браузер `npx playwright install chromium`):

```bash
T=$(DATA_DIR=/tmp/kdata node kartlegging/server.js --lenkjer | grep -m1 "k=daco" | sed 's/.*t=//')
BASE=http://127.0.0.1:3099 T=$T K=daco node tools/test/skjema.test.js
BASE=http://127.0.0.1:3099 PW1='<стартовый>' PW2='<новый>' node tools/test/dashboard.test.js
BASE=http://127.0.0.1:3099 PW1='<текущий>' K=gasta node tools/test/admin.test.js
BASE=http://127.0.0.1:3099 T=<код gasta> K=gasta node tools/test/grenser.test.js   # на свежезапущенном сервере
BASE=http://127.0.0.1:3099 T=<код kviknes> K=kviknes PW1='<текущий>' node tools/test/ki.test.js
BASE=http://127.0.0.1:3099 PW1='<текущий>' node tools/test/eksport.test.js   # после skjema и ki
```

`ki.test.js`: KI-опросник с инициалами (интро nn/en без обещания анонимности, K0 первым и обязательным, верхний регистр и обрезка до 8 знаков на сервере), таблица KI «Svar per tilsett» в дашборде. `eksport.test.js`: `/api/analyse.csv` — 401 без входа, BOM, `;`, столбцы `PQ_Detalj_Risiko`, цвет и ранг, KI с инициалами, защита от формул, запись в журнал. Общие помощники тестов — `tools/test/stotte.js`.

`skjema.test.js` проходит опросник за четырёх людей (один — руководитель) и проверяет, что всё дошло. `dashboard.test.js` входит, при необходимости меняет пароль, проверяет дашборд на реальных и на демоданных и снимает скриншоты. `admin.test.js` проходит админку на клиенте `K`: число сотрудников, тексты «Send ut» (nn/en, копирование), плакат, срок (в т.ч. просроченный → 410 и «avslutta» в опроснике), закрыть/открыть, «Ny kode» (старая ссылка → 403), обновление «I gang no» через SSE и лог событий. Падает с кодом 1 при любой ошибке, в конце возвращает настройки клиента. Код ссылки вернуть нельзя, поэтому тест запускается только против localhost. `grenser.test.js` без браузера: 30 человек за одним IP проходят опросник одновременно (всё должно дойти), 20 неверных кодов с подменённым `X-Forwarded-For` (21-й → 429), лимит на сессию. Он пишет 30 тестовых ответов и выбирает лимиты на 10 минут, поэтому его запускают на свежем сервере первым, а остальные тесты — после него.

## Деплой (VPS)

VPS: Hostinger srv2003058.hstgr.cloud (179.198.210.22), ssh-алиас `vardahei-vps`. Там же Atlas и общий Caddy `atlas-edge` (сеть `atlas_edge`, Caddyfile `/etc/atlas-edge/Caddyfile`). DNS kartlegging.vardahei.tech заведён.

```bash
rsync -av --exclude data/ kartlegging/ vardahei-vps:/opt/kartlegging/
ssh vardahei-vps 'bash /opt/kartlegging/deploy/installer.sh'
```

`installer.sh`: создаёт `data/` (700), кладёт стартовые учётки, если их нет; поднимает контейнер `node:22-alpine` (read-only код, `data` отдельным томом, cap_drop ALL, 256 МБ); добавляет домен в Caddyfile (с HSTS, `max-age=31536000`) с бэкапом и проверкой, перезагружает Caddy; печатает ссылки. На проде HSTS добавлен 12.10.2026 вручную тем же способом.

Обновление кода: тот же `rsync` и `docker compose -f /opt/kartlegging/deploy/compose.yaml restart`.

Бэкап: папка `/opt/kartlegging/data`.
