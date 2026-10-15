# Чек-лист production cutover

Статус: **pending**. Дата: ____. Artifact hash / image: ____. Исполнитель: ____.
Это шаблон; незаполненные пункты не являются evidence выполнения.

- [ ] Последний main; зелёный CI; invariants 1a, 1b, 1b:runner, 1c; репетиция 8 шагов.
- [ ] Четыре проверки pg_hba: 1 / reject / 1 / reject.
- [ ] Oleksandr принял остаточный риск stage-0 §9 п. 5: подпись ____.
- [ ] Публичный age Oleksandr и ключ VPS 0600 root; старый блок Caddy совпадает с репо.
- [ ] Все клиенты закрыты Oleksandr.
- [ ] Флаг read-only проверен тремя проверками: printenv=1, framdrift {}=410, попытка открыть=409.
- [ ] Четыре финальных файла скопированы; sha256: ____; старые копии перечислены: ____.
- [ ] Дамп до импорта снят; no-go предусматривает восстановление дампа и проверки response=0, aggregate_snapshot=0.
- [ ] До go retention.forget не выполнялся.
- [ ] Seed, оба импорта, close --imported; manifest ok; accepted/existing/suppressed/rejected: ____.
- [ ] KI 2026-10-12 и rejected сверены численно; только отклонения stage-1 §6.

| Раунд | Клиент | Показатель (snittscore / kritisk andel / люди по зонам) | kartlegging | Varde | Отклонение §6 |
| --- | --- | --- | --- | --- | --- |
| 1 | ____ | ____ | ____ | ____ | ____ |
| 2 | ____ | ____ | ____ | ____ | ____ |

Go/no-go: ____. Подпись Oleksandr: ____. Время: ____.

- [ ] Архив проверен расшифровкой ключом VPS; sha256 содержимого совпадают.
- [ ] Архив на Mac; sha256 шифротекста Mac = VPS: ____.
- [ ] Шифротекст на VPS удалён; открытые файлы и старые копии удалены; ls пусто.
- [ ] Caddy заменён только блоком kartlegging в том же inode; validate и reload прошли.
- [ ] Контейнер kartlegging остановлен; rsync исключает private/runde1.js.
- [ ] Старые ссылки → 200 «avslutta»; /runde1.js → 404; /auth/login и /api/runner/round → 404.
- [ ] /r и /health на старом host → 404; /dashboard, /admin → 302; Varde /admin работает.
- [ ] grep -c кода по логам Caddy и приложения = 0.
- [ ] cutover register-archive записан; delete_by ____; report_date ____.

## Если выполнен rollback (до семи дней)

- [ ] Архив с Mac восстановлен во временный каталог 0700 и очищен актуальными tombstones.
- [ ] Флаг read-only kartlegging включён при rollback; три проверки шага (1) прошли.
- [ ] Приём в kartlegging после rollback не открывается; ответы «в окне» в Varde сохранены.
- [ ] Только блок Caddy возвращён; validate/reload; временные копии удалены.
- [ ] cutover archive-restored записан; повторный импорт очищенного архива создал 0 частей.
- [ ] Удалённые common/leader/runde1 не вернулись; released-снимки не изменились.

## После отчёта / срока

- [ ] Oleksandr подтвердил удаление архива на Mac: дата/подпись ____.
- [ ] Ключ VPS удалён; test ! -e прошёл; cutover archive-deleted записан.

## Выполнено 15.10.2026 (упрощённый cutover, решение 15.10)

- Образ `varde-api:cbe82f7b3240` (main после merge 1c), миграции применены, `/health` ok. pg_hba: 1 / reject / 1 / reject. До импорта response=0, snapshot=0.
- Seed: 6 клиентов, 4 шаблона, 3 раунда. `import runde1`: 57 записей (daco 4, gasta 9, kviknes 12, maskinsenteret 14, sfhs 12, tharaso 6), rejected 0, suppressed 0. `rounds close --imported`: выдано 5429 снимков. `import svar` не выполнялся (пилот).
- Caddy: блок kartlegging заменён на `kartlegging-legacy.caddy` (бэкап `Caddyfile.bak-<ts>`, validate ok, reload ok). Маршруты `/`, `/runde1.js`, `/auth/login`, `/api/runner/round`, `/health` → 404; `/dashboard` → 302.
- Старый контейнер `kartlegging-app-1` остановлен. Удалены: `data/svar.jsonl*`, `private/runde1.js` на VPS, `/root/kartlegging-backup-*.tgz`, рабочая папка cutover с дампом. Архив и ключи age не создавались (решение 15.10).
- Не выполнено: ручная сверка Oleksandr цифр раунда 1 со старым дашбордом; проверка Asbjørn формата Master_Analyse; проверка кода по логам Caddy.
