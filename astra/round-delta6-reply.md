### 1. Блокеры прошлой проверки

| Пункт | закрыто / не закрыто | причина (`file:line`) |
| --- | --- | --- |
| K2 — потеря одинаковых leader-отправок | закрыто | Identity — `(source_id, part)`. Импорт A, затем A+B сохраняет обе отправки; синтетическая проверка прошла. [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10) |
| K7 — replay Submission API после forget | закрыто | Проверка tombstone по `submission_id`: тот же hash → успех без вставки, другой → 409. Проверка предусмотрена в 1.22. [ADR-006:15](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-006-runner-draft-and-submission.md:15), [STAGES:111](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:111) |

### 2. K1–K13, итог

Артефакт соответствует `df4028e`, манифест `e72cd052bb41c924…` подтверждён. `[On]` и `[21]` отсутствуют. O3–O5 отражены как принятые решения.

| K | закрыто / не закрыто | причина (`file:line`) |
| --- | --- | --- |
| K1 | закрыто | O3: режим фиксируется до открытия; админы видят строки обоих режимов. [ADR-025:9](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-025-identification-and-person-channel.md:9) |
| K2 | закрыто | Импорт сохраняет кратность отправок, учитывает `existing` и `suppressed`. [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10) |
| K3 | закрыто | Сравнение по людям зависит от raw; полнота snapshots ограничена агрегатами. [ADR-025:14](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-025-identification-and-person-channel.md:14) |
| K4 | закрыто | Баллы, версии метрик и операторы границ соответствуют продукту. [ADR-026:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-026-zone-model-and-findings-inventory.md:10) |
| K5 | закрыто | FUNN разделены по каналам; `leaders_all` ограничен админ-дашбордом. [ADR-020:13](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-020-metric-contract.md:13) |
| K6 | закрыто | Советы и scenario сохранены только в KI. [STAGES:102](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:102) |
| K7 | не закрыто | Таблица не покрывает replay старого POST после переоткрытия kartlegging при rollback — ниже. [ADR-024:42](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:42) |
| K8 | закрыто | `frozen` согласован с переводами, автопроверками и eval. [ADR-005:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-005-template-format.md:12) |
| K9 | закрыто | Запреты внешних каналов и отрицательные тесты сохранены. [ADR-021:24](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-021-privacy-contract.md:24) |
| K10 | закрыто | O4: leader вне k, по клиенту, админ-сессия и AuditLog; связь импортированных частей остаётся внутри доверенной границы O3. [ADR-021:28](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-021-privacy-contract.md:28) |
| K11 | закрыто | O5: ручной `handover` определён; конфликт с прежним уведомлением указан явно. [ADR-017:13](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:13), [ADR-017:34](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:34) |
| K12 | закрыто | Контекст обновлён; размещение кода оставлено Oleksandr. [ADR-009:6](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-009-respondent-access-codes.md:6), [STAGES:40](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:40) |
| K13 | закрыто | `nn/en` обязательны; `nb` включается переключателем с publication gate. [ADR-019:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-019-languages-and-translation-gate.md:12) |

### 3. Новые противоречия

- **blocking — K7: replay через kartlegging в окне rollback.** Сценарий: старый POST → импорт → `forget` → rollback с очисткой архива → разрешённое переоткрытие приёма → повтор **того же старого POST** → повторный cutover. Переоткрытие не меняет код доступа, а `valider()` присваивает повтору новый UUID. Tombstone прежнего `source_id` его не подавляет. Синтетическая проверка реального `valider()` и модели импортера дала две восстановленные части, `suppressed = 0`. Поэтому утверждение таблицы «новые id удалённого не касаются» неверно. Нужен контракт безопасного переоткрытия старого приёма и тест этого цикла. [ADR-024:25](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:25), [ADR-024:42](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:42), [server.js:192](/Users/oleksandr/vardahei-kartlegging/kartlegging/server.js:192), [server.js:558](/Users/oleksandr/vardahei-kartlegging/kartlegging/server.js:558).

- **non-blocking — уточнение `rejected`.** Формулировка «отклонённая строка считается в обоих счётчиках» должна ограничивать leader-счётчик строками с `leiardel = true`. Иначе единственная rejected-строка без leader даёт для него `0 = 1`. [ADR-024:11](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:11).

### 4. Вердикт

**Reject: K7 — возврат удалённого через replay старого POST в переоткрытый kartlegging после rollback.**