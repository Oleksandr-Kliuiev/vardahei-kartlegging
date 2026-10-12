### 1. Блокеры прошлой проверки

| Пункт | закрыто / не закрыто | причина (`file:line`) |
| --- | --- | --- |
| K5/K9 — `leaders_all` | закрыто | Исключение согласовано: только все клиенты вместе, под k, только админ-дашборд; внешние каналы запрещены. [ADR-020:13](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-020-metric-contract.md:13) |
| K7 — удалённая leader-часть | не закрыто | Сопоставление через `content_hash` добавлено, но очистка строки ломает identity при повторном import — см. §3. [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10), [ADR-024:25](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:25) |
| K7 — `runde1.js` | закрыто | Файл включён в архив и очистку при rollback; после cutover его выдача запрещена. [ADR-024:24](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:24) |
| K2 — `suppressed` | закрыто | Сверка учитывает `common + suppressed`; baseline старого dashboard очищается по ledger. [ADR-024:14](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:14) |
| O5 — преждевременное решение | закрыто | Conditional rule сохранён; сам O5 открыт, возврат person-данных требует нового architecture gate. [ADR-017:35](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:35) |

### 2. K1–K13, итог

| K | закрыто / не закрыто | причина (`file:line`) |
| --- | --- | --- |
| K1 | закрыто | Режим идентификации закреплён в версии; границы `aggregate/person` определены. [ADR-025:9](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-025-identification-and-person-channel.md:9) |
| K2 | закрыто | Импорт раунда 1 и сверка с `suppressed` согласованы. [STAGES:92](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:92) |
| K3 | закрыто | Person-сравнение зависит от raw; полнота snapshots ограничена агрегатами. [STAGES:94](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:94) |
| K4 | закрыто | Баллы, версии метрик и операторы границ зон соответствуют продукту. [ADR-026:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-026-zone-model-and-findings-inventory.md:10) |
| K5 | закрыто | `leaders_all` разрешён; F12×B13 остаётся в leader-канале, включая «alle». [ADR-026:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-026-zone-model-and-findings-inventory.md:12) |
| K6 | закрыто | Советы и scenario сохранены только в KI. [STAGES:103](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:103) |
| K7 | не закрыто | Цикл rollback → повторный cutover не сохраняет import identity очищенной строки. [ADR-024:25](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:25) |
| K8 | закрыто | Исключения `frozen` согласованы с quality gates и eval. [ADR-005:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-005-template-format.md:12) |
| K9 | закрыто | Запреты person/leader и `leaders_all` во внешних каналах подкреплены отрицательными тестами. [STAGES:129](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:129) |
| K10 | закрыто | Разделение частей сохранено; O3/O4 остаются условиями выбора, а не принятыми решениями. [ADR-021:18](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-021-privacy-contract.md:18), [ADR-021:58](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-021-privacy-contract.md:58) |
| K11 | закрыто | Внутренний Master_Analyse export отделён от клиентского отчёта. [STAGES:126](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:126), [STAGES:196](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:196) |
| K12 | закрыто | Контекст лимитов/VPS обновлён; расположение кода оставлено Oleksandr. [ADR-009:6](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-009-respondent-access-codes.md:6), [STAGES:41](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:41) |
| K13 | закрыто | `nn/en` обязательны, `nb` включается переключателем; publication gate согласован. [ADR-019:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-019-languages-and-translation-gate.md:12) |

### 3. Новые противоречия

- **blocking — rollback меняет import identity.** После удаления только leader-части common остаётся с `source_id = H(исходной строки)`. Rollback меняет `leiardel` и удаляет ответы, поэтому `H(очищенной строки)` другой — подтверждено synthetic probe без чтения данных. Повторный import проверяет новый hash, которого нет у существующего common; механизм допускает дубль или срыв сверки. Tombstone исходного common также не покрывает изменённую строку. Нужен контракт сохранения identity при очистке и проверка полного цикла delete → rollback → повторный cutover. [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10), [ADR-024:25](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:25)

### 4. Вердикт

**Reject: K7 — изменение source hash при rollback нарушает контракт повторного import и suppression.**