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
