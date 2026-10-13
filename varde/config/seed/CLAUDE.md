# config/seed

Сгенерировано, руками не править: `templates/*.json`, `metrics/*.json`, `clients.json`, `import-map.json` создаёт конвертер 1.2 из `kartlegging/public/sporsmal.js` (KI 2026-10-12 — из `git show f26ee21:kartlegging/public/sporsmal.js`).

```bash
pnpm --filter @varde/tools-convert convert --from ../kartlegging/public/sporsmal.js --out config/seed
pnpm --filter @varde/tools-convert convert --check --from ../kartlegging/public/sporsmal.js   # diff-report: 0 differences
```

Шаблоны большие — читать через `jq` (`jq '.content.questions[].id' templates/ki.2026-10-13.json`), не целиком. `metrics/<шаблон>.json` — MetricDefinitions (1.10), объект «ключ метрики → определение»; распределения по всем вопросам, набор зон и K7×K8 из fixtures 0.16, часы рутины и самая тяжёлая задача KI.
