# Vardahei: kartlegging и Varde — правила для кодера

Oleksandr (безопасность и ИТ, Vardahei IT — MSP в Согндале). Команда: Oleksandr, Asbjørn (шеф), Bjarte. Клиенты: Daco, Gasta, Kviknes, Maskinsenteret, SFHS, Tharaso.

В репо два продукта:
- `kartlegging/` — работающие опросники, дашборд и админка (Node 22, один `server.js`). Живёт на https://kartlegging.vardahei.tech. Правки только по прямому заданию.
- `varde/` — новая платформа (pnpm workspace: `apps/api`, `apps/admin`, `apps/runner`, `packages/*`, `tools/*`). Живёт на https://varde.vardahei.tech. Сюда идёт основная разработка.

## Что читать

1. Задание оркестратора (короткое).
2. `docs/varde/stages/stage-1.md` и `stage-1/<checkpoint>.md` — задачи, тесты, команды приёмки; `docs/varde/STAGES.md` — строки задач.
3. `docs/varde/PRINCIPLES.md` и нужные `docs/varde/adr/ADR-*.md` — по ссылкам из задачи.
4. `docs/BESLUTNINGER.md` — решения Oleksandr; они сильнее текста ADR, если расходятся.
5. `docs/varde/AI_CONTEXT_MAP.md` — какие файлы читать под какую задачу.

Не читай остальное «на всякий случай»: большие файлы — диапазонами строк.

## Жёсткие правила

- Не читать и не менять `kartlegging/data/`, `kjelder/` и содержимое `kartlegging/private/runde1.js` (персональные данные). Формат — по `tools/runde1_fra_excel.py`. Все fixtures синтетические, без реальных инициалов и ответов.
- Никаких секретов в коде, тестах, логах и документах. Тестовые ключи генерируй в тестах.
- Нет доступа к VPS: не использовать `ssh`, не деплоить. Хостинг делает оркестратор.
- Не править артефакт плана: `docs/varde/ARCHITECTURE.md`, `PRINCIPLES.md`, `STAGES.md`, `adr/`, `stages/`. Нашёл противоречие — выбери самое простое решение, совместимое с ADR, и запиши отклонение в evidence.
- В задачах Varde не трогать `kartlegging/` и корневые `package.json`, `package-lock.json` (это npm для тестов kartlegging).
- Любая выдача агрегатов и строк — только через модуль `privacy` (lint это проверяет). Не добавлять обходы и реэкспорт хранилищ ответов наружу.
- Всё, что видят клиенты и респонденты, — на нюношке (nynorsk, не букмол), тон человеческий. Вопросы F1–F22 опросника по безопасности — дословно, не менять.
- Файлы ≤ 700 строк (целевое ≤ 500); CI это проверяет.
- Работай только в выданном worktree и ветке. Не переключай ветки, не трогай чужие checkout'ы, не делай `git push --force` и `merge` в `main`.

## Как работать

- Одна задача — один коммит с тестами. Перед коммитом из `varde/`: `pnpm check`, тесты задачи, `pnpm invariants:<checkpoint>`.
- Integration-тесты нужны Postgres: Docker и `DATABASE_URL` (как в `.github/workflows/varde.yml`); порт 5433 может быть занят — `VARDE_DEV_PG_PORT`. Не перезапускай Docker.
- Коммиты — коротко, по-английски. Push ветки — только если задание это разрешает; иначе остановись после коммитов, push делает оркестратор.
- CI — главная проверка: зелёный CI на последнем коммите обязателен.
- После двух неудачных попыток починки — остановись и верни диагноз, не продолжай по кругу.

## Команды kartlegging (только если задание касается его)

```bash
cd kartlegging && node server.js          # http://127.0.0.1:3070
node --check server.js
PORT=3099 DATA_DIR=/tmp/kdata node server.js   # тестовый экземпляр
```

Тесты Playwright — `tools/test/*.test.js` (запуск и переменные — `CLAUDE.md`, раздел «Команды»).

## Отчёт

До 15 строк: коммиты по задачам, команды проверки и результат, CI, отклонения, риски. Без полных логов и diff.
