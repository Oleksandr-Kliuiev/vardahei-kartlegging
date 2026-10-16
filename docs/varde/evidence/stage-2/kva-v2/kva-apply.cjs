// One-off operator command (16.10.2026): new versions of the 25 aggregate FUNN rules with the
// client texts of «Kva vi føreslår» approved by Oleksandr (docs/varde/texts/funn-forslag-klient.md).
// Uses the Funn editor's own service (RuleVersions.create: schema, identity fields, advisory lock,
// base_version, AuditLog `findings.rule_version`), so it does exactly what a save in «Funn» does.
// All drafts are checked before anything is written; a rule already at the approved text is skipped.
// Usage (inside the api image): APP_DIR=/out TEXTS=/tmp/kva-texts.json node kva-apply.cjs [--check]
const { readFileSync } = require('node:fs');
const base = process.env.APP_DIR || '/out';
const req = (id) => require(require.resolve(id, { paths: [base] }));
const { Module } = req('@nestjs/common');
const { withContext } = require(`${base}/dist/cli/context.js`);
const { PrismaModule } = require(`${base}/dist/prisma/prisma.module.js`);
const { RuleVersions } = require(`${base}/dist/modules/findings/rule-versions.service.js`);

const texts = JSON.parse(readFileSync(process.env.TEXTS || '/tmp/kva-texts.json', 'utf8'));
const WHO = 'cli:orchestrator (godkjent av Oleksandr 16.10.2026)';
const checkOnly = process.argv.includes('--check');

class KvaModule {}
Module({ imports: [PrismaModule], providers: [RuleVersions] })(KvaModule);

withContext(async (get) => {
  const versions = get(RuleVersions);
  const plan = [];
  for (const [key, t] of Object.entries(texts)) {
    const { rule, context } = await versions.current(key);
    if (rule.action_text.nn === t.nn && rule.action_text.en === t.en) {
      plan.push({ key, skip: true, version: rule.version });
      continue;
    }
    if (rule.version !== 1) throw new Error(`${key}: version ${rule.version} in the database, expected 1`);
    const { version, ...fields } = rule;
    const draft = { ...fields, action_text: { nn: t.nn, en: t.en } };
    versions.draft(rule, draft, context); // throws on any schema, identity or option problem
    plan.push({ key, skip: false, base: version, draft });
  }
  const out = { checked: plan.length, skipped: plan.filter((p) => p.skip).length, created: [] };
  if (checkOnly) return out;
  for (const p of plan.filter((p) => !p.skip)) {
    const r = await versions.create(p.key, { base_version: p.base, rule: p.draft }, WHO);
    out.created.push(`${r.key}@${r.version}`);
  }
  return out;
}, KvaModule).then(
  (out) => {
    process.stdout.write(`${JSON.stringify(out)}\n`);
  },
  (e) => {
    process.stderr.write(`${e && e.message ? e.message : String(e)}\n`);
    process.exit(1);
  },
);
