### 1. Прошлые блокеры

| Пункт | закрыто / не закрыто | причина (`file:line`) |
| --- | --- | --- |
| K5/K9 | не закрыто | F12×B13 вынесен из snapshots, но запрет любых leader-derived метрик противоречит сохранённому `leaders_all`: [ADR-020:11](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-020-metric-contract.md:11), [ADR-020:13](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-020-metric-contract.md:13). |
| K7 (включая удаление ↔ import/restore) | не закрыто | Области удаления расширены, отдельный ledger для restore добавлен. Однако anonymous leader без `source_id` и раунд 1 не покрыты rollback полностью: [ADR-017:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:12), [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10), [ADR-024:25](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:25). |
| K8 | закрыто | Исключения `frozen` перенесены в автопроверки и eval: [ADR-018:11](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-018-tests-and-live-eval.md:11), [ADR-010:11](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-010-model-provider.md:11). |
| K11 | закрыто | Внутренний Master_Analyse export явно разрешён; запрет ограничен внешними каналами: [PRINCIPLES:17](/Users/oleksandr/vardahei-kartlegging/docs/varde/PRINCIPLES.md:17). |
| K13 (включая схему текстов ADR-005) | закрыто | `nn/en` обязательны для клиентских опросов, `nb` опционален; схема согласована: [ADR-005:9](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-005-template-format.md:9), [ADR-019:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-019-languages-and-translation-gate.md:12). |
| O5 | закрыто | Преждевременный запрет возврата заменён conditional rule и повторным architecture gate. Сам O5 остаётся открытым: [ADR-017:35](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:35). |
| non-blocking Contact | закрыто | Утверждение об исключительности Contact удалено: [ARCHITECTURE:50](/Users/oleksandr/vardahei-kartlegging/docs/varde/ARCHITECTURE.md:50). |

### 2. K1–K13, итог

| K | закрыто / не закрыто | причина (`file:line`) |
| --- | --- | --- |
| K1 | закрыто | Режим идентификации и границы `aggregate/person` определены: [ADR-025:9](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-025-identification-and-person-channel.md:9). |
| K2 | не закрыто | Добавлен `suppressed`, но сверка раунда 1 по-прежнему требует «записей источника = common Response»: [ADR-024:14](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:14). |
| K3 | закрыто | Сравнение по людям зависит от raw; полнота snapshots ограничена агрегатами: [STAGES:94](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:94). |
| K4 | закрыто | Баллы, версии метрик и разные операторы границ зон соответствуют продукту: [ADR-026:9](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-026-zone-model-and-findings-inventory.md:9). |
| K5 | не закрыто | Schema одновременно предусматривает `leaders_all` и отклоняет его необходимые входы: [STAGES:64](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:64). |
| K6 | закрыто | Советы и scenario оставлены только в KI, с проверкой паритета: [STAGES:103](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:103). |
| K7 | не закрыто | Бессрочность согласована; защита от возврата удалённого неполна: [ADR-017:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:12), [ADR-024:25](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:25). |
| K8 | закрыто | `frozen`, разрешённые изменения anchor и исключения quality gates согласованы: [ADR-005:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-005-template-format.md:12). |
| K9 | не закрыто | Запреты person действуют, но контракт leader-derived snapshots остаётся противоречивым: [ADR-020:11](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-020-metric-contract.md:11), [ADR-020:13](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-020-metric-contract.md:13). |
| K10 | закрыто | Части разделены на submission-уровне; выбор (a)/(b) остаётся за Oleksandr: [ADR-021:17](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-021-privacy-contract.md:17). |
| K11 | закрыто | Внутренний export и клиентский отчёт имеют отдельные контракты: [STAGES:126](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:126), [STAGES:196](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:196). |
| K12 | закрыто | Лимиты/VPS обновлены, расположение кода оставлено решением Oleksandr: [ADR-009:6](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-009-respondent-access-codes.md:6), [ADR-016:6](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-016-hosting-and-backup.md:6), [STAGES:41](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:41). |
| K13 | закрыто | Переключатель, publication gate и состав языков согласованы: [ADR-019:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-019-languages-and-translation-gate.md:12). |

### 3. Новые противоречия

- **Snapshots ↔ `leaders_all`.** Новый запрет любых величин из leader делает невозможными сохранённые snapshots `leaders_all` и паритет фильтра «alle». Нужно согласовать исключение и разрешённые каналы: [STAGES:93](/Users/oleksandr/vardahei-kartlegging/docs/varde/STAGES.md:93), [ADR-020:13](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-020-metric-contract.md:13).
- **Удаление отдельной anonymous leader-части ↔ rollback.** Её tombstone не содержит `source_id` или `respondent_key`; rollback фильтрует исходные строки только по hash. Удалённая часть вернётся вместе с исходной строкой. Нужен определённый способ сопоставления для обеих частей: [ADR-017:12](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-017-retention-by-data-class.md:12), [ADR-024:10](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:10), [ADR-024:25](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:25).
- **Удаление раунда 1 ↔ rollback.** Процедура очищает только `svar.jsonl`, тогда как старый сервер продолжает выдавать исходный `runde1.js`. Учёт внешней копии не предотвращает её повторную выдачу: [ADR-024:25](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:25), [server.js:529](/Users/oleksandr/vardahei-kartlegging/kartlegging/server.js:529).
- **`suppressed` ↔ сверка импорта раунда 1.** После хотя бы одного удаления число Response меньше числа исходных записей. Требуемое равенство и безусловный паритет со старым dashboard должны учитывать suppression: [ADR-024:14](/Users/oleksandr/vardahei-kartlegging/docs/varde/adr/ADR-024-provable-import-and-cutover.md:14).

### 4. Вердикт

**Reject: K5/K9 — конфликт snapshots и `leaders_all`; K7 — неполная защита удаления при rollback; K2 — несовместимая с `suppressed` сверка импорта.**