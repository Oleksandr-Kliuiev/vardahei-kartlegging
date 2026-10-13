### 1. Блокеры прошлой проверки

| Пункт | закрыто / не закрыто | причина (`file:line`) |
| --- | --- | --- |
| K7 — изменение identity при rollback | закрыто | `source_id` теперь равен постоянному `id`; очистка leader-части сохраняет его, повторный импорт получает `existing`. Synthetic probe подтверждает этот сценарий. [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10) |

### 2. K1–K13, итог

Артефакт `34f421f`, манифест `746b804993130403…` подтверждён. `[On]` и `[21]` отсутствуют. O3–O5 отражены как принятые решения.

| K | закрыто / не закрыто | причина (`file:line`) |
| --- | --- | --- |
| K1 | закрыто | Режим фиксируется до открытия; `rows` доступны админам в обоих режимах. [ADR-025:9](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-025-identification-and-person-channel.md:9) |
| K2 | закрыто | Раунд 1 импортируется как Response; identity и сверка учитывают `existing`/`suppressed`. [ADR-024:14](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:14) |
| K3 | закрыто | Сравнение по людям зависит от raw; полнота snapshots ограничена агрегатами. [STAGES:93](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:93) |
| K4 | закрыто | Баллы, версии метрик и операторы границ соответствуют продукту. [ADR-026:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-026-zone-model-and-findings-inventory.md:10) |
| K5 | закрыто | `leaders_all` ограничен админ-дашбордом; F12×B13 остаётся вне snapshots. [ADR-020:13](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-020-metric-contract.md:13) |
| K6 | закрыто | Советы и scenario сохранены только в KI. [STAGES:102](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:102) |
| K7 | не закрыто | Осталась дыра при сочетании restore и импорта — ниже. [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10) |
| K8 | закрыто | `frozen` согласован с автопроверками, переводами и eval. [ADR-005:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-005-template-format.md:12) |
| K9 | закрыто | Запреты внешних каналов и отрицательные тесты сохранены. [ADR-021:24](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-021-privacy-contract.md:24) |
| K10 | закрыто | O4 закреплён: leader вне k, по клиенту, админ-сессия и AuditLog. [ADR-021:29](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-021-privacy-contract.md:29) |
| K11 | закрыто | Внутренний экспорт отделён от обычной клиентской выдачи; O5 реализован ручным `handover`. [ADR-017:13](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:13) |
| K12 | закрыто | Контекст лимитов/VPS обновлён; размещение кода оставлено Oleksandr. [ADR-009:6](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-009-respondent-access-codes.md:6), [STAGES:40](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:40) |
| K13 | закрыто | `nn/en` обязательны; `nb` включается переключателем с publication gate. [ADR-019:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-019-languages-and-translation-gate.md:12) |

### 3. Новые противоречия

- **blocking — K7: restore → import может вернуть удалённую leader-часть.** Сценарий: дамп до импорта строки → импорт common+leader → удаление только anonymous leader → restore того дампа с последним ledger → повторный импорт исходного файла. Common уже отсутствует, а leader-tombstone не содержит `source_id`. Importer проверяет только `source_id`, поэтому контракт допускает создание обеих частей заново. Проверка leader по `content_hash` предусмотрена только для rollback. Синтетическая модель контракта воспроизводит возврат. Нужна проверка leader-tombstone при импорте независимо от наличия common и соответствующий тест. [ADR-017:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:12), [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10), [ADR-024:25](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:25)

### 4. Вердикт

**Reject: K7 — подавление удалённой leader-части при импорте после restore не определено.**