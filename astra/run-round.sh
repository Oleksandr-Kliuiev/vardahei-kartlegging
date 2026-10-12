#!/usr/bin/env bash
# Один раунд brainstorm с Astra через Codex CLI.
#   ./run-round.sh 1          -> читает round-1-prompt.md, пишет round-1-reply.md
#   MODEL=gpt-6-astra ./run-round.sh 2
#
# Запускать из папки, где лежат kartlegging/ и astra/:
#   cd <корень vardahei-kartlegging> && bash astra/run-round.sh 1
#
# Codex работает в режиме read-only: читает код kartlegging, ничего не меняет.
# Модель и усилие можно поменять через переменные MODEL и EFFORT.

set -euo pipefail

ROUND="${1:?Укажи номер раунда: ./run-round.sh 1}"
MODEL="${MODEL:-gpt-6-astra}"
EFFORT="${EFFORT:-xhigh}"
DIR="$(cd "$(dirname "$0")" && pwd)"
PROMPT="$DIR/round-$ROUND-prompt.md"
REPLY="$DIR/round-$ROUND-reply.md"
LOG="$DIR/round-$ROUND-log.txt"

[ -f "$PROMPT" ] || { echo "Нет файла $PROMPT"; exit 1; }
command -v codex >/dev/null || { echo "Codex CLI не найден: npm install -g @openai/codex"; exit 1; }

echo "Astra ($MODEL, effort=$EFFORT), раунд $ROUND. Это займёт несколько минут..."
codex exec \
  --model "$MODEL" \
  -c model_reasoning_effort="$EFFORT" \
  --sandbox read-only \
  --cd "$DIR/.." \
  --skip-git-repo-check \
  --output-last-message "$REPLY" \
  - < "$PROMPT" | tee "$LOG"

echo
echo "Готово: $REPLY ($(wc -w < "$REPLY") слов)."
echo "Положи этот файл в чат с Fable или оставь в папке, если она подключена."
