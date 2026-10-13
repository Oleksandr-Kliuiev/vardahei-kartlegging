# Одобрение delta 12.10 (13.10.2026)

Артефакт: `docs/varde/` (ARCHITECTURE, PRINCIPLES, STAGES, adr/) на коммите `5057fc6`, манифест `c59190de51b7da28caa50281d800b90303671dedd7d5bb8f3ec0e60aea5aaac8`:

```bash
cd docs/varde && find ARCHITECTURE.md PRINCIPLES.md STAGES.md adr -type f | sort | xargs shasum -a 256 | shasum -a 256
```

| Ревьюер | Модель / effort | Вердикт | Где |
| --- | --- | --- | --- |
| GPT-6 Astra | `gpt-6-astra`, xhigh, Codex read-only | Approve | `astra/round-delta7-reply.md` |
| Claude Fable 5.1, чистая сессия (не автор, без переписки и чужих вердиктов) | `claude-fable-5-1`, xhigh | Approve | отчёт в сессии оркестратора, ниже — non-blocking |

Путь: автор — Claude Fable 5.1 (xhigh), шесть итераций по замечаниям Astra (`round-delta*-reply.md`, Reject → Approve); решения Oleksandr 12–13.10 — `docs/BESLUTNINGER.md` и бриф §3, п. 1–16. Правило «после rollback kartlegging только на чтение» (ADR-024) — решение оркестратора 13.10, Oleksandr может отменить.

## Non-blocking — в пакет этапа

Astra:
1. STAGES 1.8: «rejected в обоих счётчиках» → leader-счётчик только при `leiardel = true` (как ADR-024:11).
2. ADR-024:25 обещает `410` для `/api/framdrift`, текущий сервер отвечает `204` без записи.

Fable:
3. ADR-017:13: handover «released-снимки» — только population `round_client` этого клиента; отрицательные тесты в 1.30b/1.32.
4. ADR-017:12: forget `client` — правило для ObservationOutbox `withdraw` (этап 4).
5. ADR-026:12 / STAGES 1.10: F12×B13 в открытом раунде — агрегат под k через `privacy` (computed), не только released.
6. STAGES 1.9: «TemplateVersion F2–F19» → «F1–F22, F1 identifier, F20–F22 без ответов», как ADR-024:14.
7. ADR-024:25: read-only после rollback держится на статусе и чек-листе — добавить техническую гарантию (флаг окружения, отключённые write-маршруты).
8. Косметика: статусы 016/018/022 в индексе ARCHITECTURE:128–134; самопротиворечивая фраза в ADR-006:14; `texts{nn,en,nb?}` в ARCHITECTURE:52 без `{nn}` для семинарных; «Черновик после раунда 2» в STAGES:3.
