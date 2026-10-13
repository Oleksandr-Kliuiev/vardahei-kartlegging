# varde/ — код платформы Varde

- Карта контекста: `../docs/varde/AI_CONTEXT_MAP.md` (задача → файлы входа). Пакет этапа: `../docs/varde/stages/`.
- Свой pnpm workspace (pnpm 11, Node 22). Настройки pnpm — только в `pnpm-workspace.yaml`; `.npmrc` нет.
- Проверка перед коммитом: `pnpm check` (lint, test, build во всех пакетах).
- Не читать: `../kartlegging/data/`, `../kjelder/`, `../kartlegging/private/runde1.js`, `prisma/migrations/**` целиком.
- Файлы ≤ 500 строк, потолок 700 (`pnpm budget`). Barrel-файлов и `export *` нет.
- Никаких секретов: `.env.example` — только имена переменных.
