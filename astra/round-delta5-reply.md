### 1. Блокеры прошлой проверки

| Пункт | закрыто / не закрыто | причина (`file:line`) |
| --- | --- | --- |
| K7 — возврат удалённой leader-части после restore | закрыто | Импорт проверяет leader-tombstone независимо от common; сценарий включён в 1.31b. Синтетическая модель подтверждает подавление. [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10), [STAGES:127](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:127) |

### 2. K1–K13, итог

Артефакт соответствует `adff125`, манифест `17eb96db283fb7d2…` подтверждён. O3–O5 отражены как принятые решения; `[On]` и `[21]` отсутствуют.

| K | закрыто / не закрыто | причина (`file:line`) |
| --- | --- | --- |
| K1 | закрыто | O3: режим фиксируется до открытия; админам доступны строки обоих режимов. [ADR-025:9](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-025-identification-and-person-channel.md:9) |
| K2 | не закрыто | Новый `existing` по content hash теряет разные leader-отправки при последовательном импорте — ниже. [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10) |
| K3 | закрыто | Сравнение по людям зависит от raw; полнота snapshots ограничена агрегатами. [ADR-025:14](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-025-identification-and-person-channel.md:14) |
| K4 | закрыто | Баллы, версии метрик и операторы границ соответствуют продукту. [ADR-026:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-026-zone-model-and-findings-inventory.md:10) |
| K5 | закрыто | FUNN разделены по каналам; `leaders_all` ограничен админ-дашбордом. [ADR-020:13](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-020-metric-contract.md:13) |
| K6 | закрыто | Советы и scenario сохранены только в KI. [STAGES:102](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:102) |
| K7 | не закрыто | Прошлый сценарий исправлен, но отсутствует защита от replay POST после удаления. [ADR-006:15](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-006-runner-draft-and-submission.md:15) |
| K8 | закрыто | `frozen` согласован с автопроверками, переводами и eval. [ADR-005:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-005-template-format.md:12) |
| K9 | закрыто | Запреты внешних каналов и отрицательные тесты сохранены. [ADR-021:24](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-021-privacy-contract.md:24) |
| K10 | закрыто | O4: leader вне k, по клиенту, админ-сессия и AuditLog. [ADR-021:29](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-021-privacy-contract.md:29) |
| K11 | закрыто | O5: ручной `handover` определён; конфликт с прежним уведомлением назван явно. [ADR-017:13](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:13), [ADR-017:34](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:34) |
| K12 | закрыто | Контекст обновлён; размещение кода оставлено Oleksandr. [ADR-009:6](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-009-respondent-access-codes.md:6), [STAGES:40](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:40) |
| K13 | закрыто | `nn/en` обязательны; `nb` включается переключателем с publication gate. [ADR-019:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-019-languages-and-translation-gate.md:12) |

### 3. Новые противоречия

- **blocking — K2: результат импорта зависит от разбиения на проходы.** Две разные строки A и B одного клиента/раунда имеют одинаковую leader-часть. Импорт A, затем A+B оставляет **одну** leader Response: обе получают `existing` по тройке. Импорт A+B в пустую базу создаёт **две**. Синтетическая модель воспроизводит расхождение; равенство счётчиков при этом выполняется (`existing = 2`). Это потеря неудалённых данных, а не оговорённое подавление по tombstone. Нужны сохранение кратности разных отправок и тест последовательного импорта. [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10), [ADR-024:11](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:11)

- **blocking — K7: таблица путей возврата неполна.** Сценарий: `POST(s) → forget(s) → повторный POST(s)` при открытом раунде. Response удалена, unique index больше не удерживает `submission_id`; контракт Submission API не требует проверки DeletionLedger. Поэтому он допускает повторную вставку удалённого ответа — воспроизведено синтетической моделью спецификации. Нужны проверка tombstone на этом пути, определённый ответ без вставки и соответствующий тест. [ADR-006:15](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-006-runner-draft-and-submission.md:15), [ADR-017:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:12), [ADR-024:29](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:29)

- **non-blocking — уточнение сверки:** для rejected строки с `leiardel=true` не определён учёт в leader-счётчике: в его формуле нет `rejected`. Следует явно исключить такие строки из знаменателя либо добавить категорию. [ADR-024:11](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:11)

### 4. Вердикт

**Reject: K2 — потеря разных leader-отправок при последовательном импорте; K7 — возврат удалённого через replay Submission API.**