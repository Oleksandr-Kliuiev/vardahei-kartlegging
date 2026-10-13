# tools/parity

Синтетические fixtures (1.2b) и golden старого дашборда (1.2c) — общий источник паритета Varde ↔ kartlegging.

- `fixtures/` и `golden/` сгенерированы, руками не править: `pnpm parity:fixtures` / `pnpm parity:golden` (с `--check` — сравнить). Что где и ожидаемые счётчики — `fixtures/README.md`.
- Настоящих данных нет и не должно быть: не читать и не копировать `kartlegging/data/`, `kartlegging/private/runde1.js`, `kjelder/`.
- `svar.synthetic.jsonl` большой: читать через `jq`/`sed -n`, не целиком.
