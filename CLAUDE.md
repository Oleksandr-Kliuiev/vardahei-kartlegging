# Vardahei kartlegging

Oleksandr (безопасность и ИТ, Vardahei IT — MSP в Согндале, Норвегия). Команда: Oleksandr, Asbjørn (шеф), Bjarte.
Клиенты: Daco, Gasta, Kviknes, Maskinsenteret, SFHS, Tharaso.

Проект: опросники для сотрудников клиентов, дашборд с результатами, админка с прогрессом в реальном времени. Дальше — платформа Varde (опросы + семинары + AI-ассистент), см. `docs/varde/`: `ARCHITECTURE.md`, `PRINCIPLES.md`, `STAGES.md`, `adr/` — план Varde (одобрен Astra и Fable 11.10, delta 12.10 одобрена 13.10). Код Varde — в `varde/` (этап 0 закрыт и выкачен на https://varde.vardahei.tech; этап 1 в работе). Актуальные решения — `docs/BESLUTNINGER.md`; правила для кодера — `AGENTS.md`; процесс облегчённый, без отдельных пакетов этапов.

Перед работой прочитай `docs/SAMMENDRAG.md` (история и контекст) и `docs/BACKLOG.md` (что дальше).

## Структура

- `kartlegging/server.js` — весь сервер: Node 22, без зависимостей, JSONL-хранилище. Подробно: `docs/kartlegging-teknisk.md`.
- `kartlegging/public/sporsmal.js` — банк вопросов обоих опросников, цвета ответов, пороги зон. Его читают опросник, дашборд и сервер (валидация).
- `kartlegging/public/index.html` — опросник (раннер) с профилем высоты.
- `kartlegging/private/dashboard.html`, `admin.html` — дашборд и админка (только после входа).
- `kartlegging/private/runde1.js` — все ответы раунда 1 (Forms, январь 2026). Генерируется `tools/runde1_fra_excel.py`.
- `kartlegging/data/` — ответы, коды, события, учётки. Не коммитить, не читать без нужды.

## Команды

```bash
cd kartlegging && node server.js                 # http://127.0.0.1:3070
PORT=3099 DATA_DIR=/tmp/kdata node server.js     # тестовый экземпляр с отдельными данными
node server.js --lenkjer                         # ссылки с кодами
node server.js --brukar namn@vardahei.no         # новая учётка / сброс пароля
node --check server.js
T=<kode> K=daco node ../tools/test/skjema.test.js     # прогон опросника (Playwright)
PW1=<pw> PW2=<pw> node ../tools/test/dashboard.test.js
PW1=<pw> K=gasta node ../tools/test/admin.test.js     # админка; меняет код ссылки, только localhost
T=<kode> K=gasta node ../tools/test/grenser.test.js   # лимиты; на свежем сервере, первым
python3 tools/runde1_fra_excel.py kjelder/Master_Analyse.xlsx
```

## Правила

- Язык: с Oleksandr и в документах — русский, технические термины по-английски. Всё для клиентов и сотрудников клиентов — нюношк (nynorsk), не букмол. Тон человеческий, без канцелярита и «ИИшности».
- Вопросы опросника по безопасности (F1–F22) — дословно из Forms-раунда. Не менять формулировки и id без решения шефа: на них держится сравнение с раундом 1.
- Модель зон — как в Master_Analyse.xlsx шефа (`docs/sonemodell.md`). Пороги меняются только в `SONER` в `sporsmal.js`.
- AI-вопросы нейтральны: никаких продуктов (Copilot и т.п.) в тексте вопросов и выводов.
- Оба опросника не анонимные: инициалы первым вопросом (F1 в безопасности, как в Forms; K0 в KI, решение O 13.10). Ответы по человеку видит только Vardahei IT, клиент получает сводку без инициалов. Тексты для сотрудников должны говорить именно это.
- Никаких секретов в коде, логах и документах. Пароли только как scrypt-хеши.
- Деплой на VPS (kartlegging и Varde) делает оркестратор в роли хостинг-оператора (решение 13.10): копия данных до выкатки, проверка после, откат при сбое (`docs/kartlegging-teknisk.md`, `varde/infra/README.md`). Кодеры к VPS не допускаются.
- Перед тем как сказать «готово»: `node --check server.js`, прогнать тесты (опросник, дашборд, админка), посмотреть скриншоты.

## Коммиты

Сообщения коммитов — коротко, по-норвежски или по-английски. Одна задача — один коммит.
