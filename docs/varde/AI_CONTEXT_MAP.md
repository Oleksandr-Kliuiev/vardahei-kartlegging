# Карта контекста Varde

Задача → минимальный набор файлов входа. Пути — от корня репозитория. Путь с пометкой «(появится в …)» ещё не существует. Всегда: `docs/varde/PRINCIPLES.md`, `varde/CLAUDE.md`, пакет своего этапа в `docs/varde/stages/`. Карта обновляется в каждом checkpoint (последнее обновление — 0a).

| Задача | Файлы входа |
| --- | --- |
| Добавить модуль api | `varde/apps/api/src/app.module.ts`, `varde/apps/api/src/bootstrap.ts`, `varde/apps/api/src/modules/` (появится в 0.7), `docs/varde/ARCHITECTURE.md` §2 |
| Изменить схему шаблона | `varde/packages/schema/src/version.ts`, `varde/packages/schema/src/template/` (появится в этапе 1), `docs/varde/adr/ADR-005-template-format.md`, `docs/varde/adr/ADR-019-languages-and-translation-gate.md` |
| Добавить метрику | `varde/packages/rules/src/findings/index.ts`, `varde/packages/schema/src/metrics/` (появится в 0.16), `docs/varde/adr/ADR-020-metric-contract.md`, `docs/varde/adr/ADR-026-zone-model-and-findings-inventory.md` |
| Изменить privacy | `varde/apps/api/src/modules/privacy/` (появится в 0.15), `varde/tools/eslint-rules/rules/privacy-only-release.js`, `varde/tools/eslint-rules/boundaries.js`, `docs/varde/adr/ADR-021-privacy-contract.md`, `docs/varde/adr/ADR-025-identification-and-person-channel.md`, `docs/varde/REVIEW-CHECKLIST.md` |
| Добавить миграцию | `varde/apps/api/prisma/schema.prisma`, `varde/apps/api/prisma/migrations/CLAUDE.md`, `varde/apps/api/src/prisma/prisma.service.ts`, `varde/infra/compose.dev.yml`, `docs/varde/adr/ADR-018-tests-and-live-eval.md` |
| Изменить runner | `varde/apps/runner/src/app.ts`, `varde/apps/runner/src/main.ts`, `varde/packages/rules/src/runner/index.ts`, `docs/varde/adr/ADR-006-runner-draft-and-submission.md` |
| Изменить CI | `.github/workflows/varde.yml`, `varde/tools/invariants/test/workflow.test.ts`, `varde/tools/secrets/run.sh`, `varde/.gitleaks.toml`, `varde/infra/Dockerfile` |
| Context-budget, lint, границы импорта | `varde/tools/context-budget/check.mjs`, `varde/tools/eslint-rules/boundaries.js`, `varde/eslint.config.js` |
| Бэкап / restore | `varde/infra/backup/` (появится в 0.10), `docs/varde/runbooks/` (появится в 0.10d), `docs/varde/adr/ADR-016-hosting-and-backup.md`, `docs/varde/adr/ADR-017-retention-by-data-class.md` |
| Добавить ADR | `docs/varde/adr/`, `docs/varde/ARCHITECTURE.md` §13 (индекс ADR), `docs/varde/WORKFLOW.md` (одобрение через Fable) |
| Checkpoint: evidence и приёмка | `docs/varde/WORKFLOW.md`, `docs/varde/REVIEW-CHECKLIST.md`, `docs/varde/evidence/stage-0/0a-evidence.md`, `docs/varde/stages/stage-0.md` §6, §10 |

## Не читать

- `kartlegging/data/` — ответы респондентов, коды, учётки.
- `kjelder/` — исходные файлы клиентов и шефа.
- `kartlegging/private/runde1.js` — все ответы раунда 1.
- `astra/*-log.txt` — логи brainstorm.
- `varde/apps/api/prisma/migrations/**` целиком — сгенерированный SQL (свой `CLAUDE.md`).

## История (не для кода)

- `docs/varde/varde-arkitektura.md` — исходный документ rev 33.
- `docs/varde/ENDRINGAR-etter-rev33.md` — изменения после rev 33.
- `astra/` — brainstorm архитектуры с Astra и Fable.
