### 1. Блокеры прошлой проверки

| Пункт | закрыто / не закрыто | причина (`file:line`) |
| --- | --- | --- |
| K7 — replay старого POST после rollback | закрыто | Переоткрытие kartlegging запрещено, добавлен тест полного цикла. Проверка реальных обработчиков на синтетических данных: `410`, новых UUID и записей нет. [ADR-024:25](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:25), [STAGES:130](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:130) |

### 2. K1–K13, итог

Артефакт соответствует `5057fc6`, манифест `c59190de51b7da28…` подтверждён. O3–O5 отражены как решённые; `[On]` и `[21]` отсутствуют.

| K | закрыто / не закрыто | причина (`file:line`) |
| --- | --- | --- |
| K1 | закрыто | O3: режим фиксируется до открытия; админы видят строки обоих режимов. [ADR-025:9](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-025-identification-and-person-channel.md:9) |
| K2 | закрыто | Identity `(source_id, part)` сохраняет кратность; `existing` и `suppressed` учитываются отдельно. [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10) |
| K3 | закрыто | Сравнение по людям зависит от raw; полнота snapshots ограничена агрегатами. [ADR-025:14](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-025-identification-and-person-channel.md:14) |
| K4 | закрыто | Баллы, версии метрик и операторы границ соответствуют продукту. [ADR-026:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-026-zone-model-and-findings-inventory.md:10) |
| K5 | закрыто | FUNN разделены по каналам; `leaders_all` ограничен админ-дашбордом. [ADR-020:13](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-020-metric-contract.md:13) |
| K6 | закрыто | Советы и scenario сохранены только в KI. [STAGES:102](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:102) |
| K7 | закрыто | Таблица покрывает import, restore, оба replay и rollback; внешние копии честно выделены как остаточный риск. [ADR-024:29](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:29) |
| K8 | закрыто | `frozen` согласован с переводами, автопроверками и eval. [ADR-005:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-005-template-format.md:12) |
| K9 | закрыто | Ограничения внешних каналов и отрицательные тесты сохранены. [ADR-021:24](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-021-privacy-contract.md:24) |
| K10 | закрыто | O4: leader по клиенту вне k, только админ, каждое чтение в AuditLog. [ADR-021:29](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-021-privacy-contract.md:29) |
| K11 | закрыто | O5: ручной `handover` определён; конфликт с прежним уведомлением назван явно. [ADR-017:13](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:13), [ADR-017:34](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:34) |
| K12 | закрыто | Контекст обновлён; расположение кода оставлено Oleksandr. [STAGES:40](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:40) |
| K13 | закрыто | `nn/en` обязательны; `nb` включается переключателем с publication gate. [ADR-019:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-019-languages-and-translation-gate.md:12) |

### 3. Новые противоречия

- **non-blocking:** задача 1.8 сохранила «rejected в обоих счётчиках». Нужно перенести уточнение ADR-024: leader-счётчик — только при `leiardel = true`. [STAGES:90](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:90), [ADR-024:11](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:11).
- **non-blocking:** ADR-024 обещает `410` также для `/api/framdrift`; текущий сервер возвращает `204` без записи. Запрет приёма сохраняется, но описание HTTP-статуса неточно. [ADR-024:25](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:25), [server.js:444](/Users/oleksandr/vardahei-kartlegging/kartlegging/server.js:444).

### 4. Вердикт

**Approve**.