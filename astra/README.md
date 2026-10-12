# Brainstorm с Astra через Codex CLI

Папка `astra/` лежит в корне Development Pack, рядом с `kartlegging/`:

    /Users/vardahei/Documents/вопросы_клиенты/
      kartlegging/
      astra/

Раунд:

    cd "/Users/vardahei/Documents/вопросы_клиенты"
    bash astra/run-round.sh 1

Что происходит: Codex в режиме read-only читает `kartlegging/` и `astra/round-1-prompt.md`,
отвечает в формате из промпта и пишет ответ в `astra/round-1-reply.md`.
Полный лог сессии — в `astra/round-1-log.txt`.

Модель по умолчанию `gpt-6-astra`, усилие `xhigh`. Если у модели другое имя
(посмотри `codex` → `/model`), запусти так:

    MODEL=<имя> bash astra/run-round.sh 1

Ответ Astra (`round-1-reply.md`) — в чат с Fable. Fable сводит раунд 2 и готовит
`round-2-prompt.md`; команда та же, только номер раунда 2. Больше трёх раундов не бывает.
