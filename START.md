# Vardahei kartlegging — Development Pack

Пакет для продолжения разработки в Claude Code. Собран 12.10.2026 из чата, где делались опросники, дашборд, админка и архитектура платформы Varde.

## Что внутри

| Путь | Что это |
| --- | --- |
| `CLAUDE.md` | Память проекта для Claude Code: контекст, правила, команды. Читается автоматически |
| `START.md` | Этот файл |
| `docs/SAMMENDRAG.md` | Саммари всего диалога: что сделано, в каком порядке, почему |
| `docs/BESLUTNINGER.md` | Журнал решений с датами и причинами |
| `docs/kartlegging-teknisk.md` | Как устроено текущее приложение: файлы, маршруты, данные, запуск, деплой |
| `docs/sonemodell.md` | Модель зон из Master_Analyse.xlsx и как она реализована |
| `docs/sporsmal.md` | Обзор обоих опросников и банка вопросов |
| `docs/BACKLOG.md` | Что не доделано, с приоритетами |
| `docs/varde/` | Архитектура платформы Varde (rev 33) и поправки после неё |
| `kartlegging/` | Рабочее приложение (Node 22, без зависимостей) |
| `astra/` | Пакет для brainstorm с GPT-6 Astra через Codex CLI |
| `tools/` | Импорт раунда 1 из Excel, Playwright-тесты |
| `kjelder/` | Сюда положить `Master_Analyse.xlsx` (в git не попадает) |

## Как начать

```bash
cd "/Users/vardahei/Documents/вопросы_клиенты"   # или куда распаковали
unzip vardahei-kartlegging-devpack.zip
cd vardahei-kartlegging
git init && git add . && git commit -m "Development pack frå chat 12.10.2026"
claude
```

Первое сообщение в Claude Code:

```
Прочитай START.md, docs/SAMMENDRAG.md и docs/BACKLOG.md. Подними kartlegging локально,
прогони тесты из tools/test и скажи, что из BACKLOG берём первым.
```

## Запустить локально

```bash
cd kartlegging
node server.js                    # http://127.0.0.1:3070
node server.js --lenkjer          # ссылки с кодами клиентов
```

Вход: `/logg-inn`, три учётки (oleksandr@, asbjorn@, bjarte@vardahei.no) с общим стартовым паролем, который договорились в чате; при первом входе каждый задаёт свой. Ответы и коды пишутся в `kartlegging/data/`.

## Важно

- `kartlegging/data/` и `kjelder/` в `.gitignore`: там ответы, коды доступа и персональные данные.
- `kartlegging/private/runde1.js` содержит инициалы и ответы 57 человек из раунда 1. Отдаётся только после входа. В публичные места не выкладывать.
- Всё, что видят клиенты, — на нюношке. Документы и общение — по-русски.
