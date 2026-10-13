# ADR-022: RoundClient — явная сущность с жизненным циклом

Статус: Accepted (новое решение Astra принято). Изменено delta 12.10: вместе с версией шаблона при открытии фиксируется `Round.identification` (ADR-025).

## Контекст
В модели Fable код доступа и срок висели на Round; численность бралась из `Client.employee_count`. Изменение численности переписывало бы исторический отклик; у клиентов бывают разные сроки; живой опрос на семинаре и обычный раунд живут по-разному.

## Решение
- `RoundClient`: round, client, code (ADR-009), `population_snapshot` (численность на момент открытия), deadline, status (`draft → open → closed → archived`), reminders sent (руками, отметка).
- Версия шаблона фиксируется на Round при открытии первого RoundClient; после этого Round нельзя перевести на другую версию. Изменено delta 12.10: вместе с версией фиксируется `Round.identification` (ADR-025).
- Отклик = ответов общей части / `population_snapshot`.
- Live poll (этап 3) — Round типа `live` с одним RoundClient на семинар и отдельным состоянием вопросов (`LivePollQuestionState`: open/closed/released), которое ведёт ведущий; renderer в runner общий.

## Альтернативы
Код и срок на Round (один срок на всех); численность из Client (история меняется задним числом).

## Последствия
`tilgang.json` и `kundar.json` переезжают в RoundClient и Client. Цена: в этапе 1.
