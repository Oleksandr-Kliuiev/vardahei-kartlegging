#!/usr/bin/env bash
# Test of infra/compose.yml (task 0.6): config is valid without /etc/varde files, app has its
# bind mounts in the long form without create_host_path, backup has no entrypoint.
set -euo pipefail
infra=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
json=$(docker compose -f "$infra/compose.yml" --env-file "$infra/ci.env" --profile backup config --format json)
printf '%s' "$json" | node -e '
const c = JSON.parse(require("fs").readFileSync(0, "utf8"));
const fail = (m) => { console.error("compose test FAILED: " + m); process.exit(1); };
const app = c.services.app, backup = c.services.backup;
if (!app || !backup) fail("services app and backup expected");
if (app.container_name !== "varde-app") fail("container_name");
if (app.ports && app.ports.length) fail("app must not publish ports");
const binds = (app.volumes || []).filter((v) => v.type === "bind");
const need = { "/run/varde": "/var/lib/varde/run", "/var/lib/varde/ledger-out": "/var/lib/varde/ledger-out", "/etc/varde/recipients.txt": "/etc/varde/recipients.txt" };
for (const [target, source] of Object.entries(need)) {
  const b = binds.find((v) => v.target === target);
  if (!b || b.source !== source) fail("bind " + target);
  if (!b.bind || b.bind.create_host_path !== false) fail("create_host_path on " + target);
}
for (const b of binds) if (!b.bind || b.bind.create_host_path !== false) fail("create_host_path on " + b.target);
if (!binds.find((v) => v.target === "/etc/varde/recipients.txt").read_only) fail("recipients.txt must be ro");
if (JSON.stringify(Object.keys(app.networks).sort()) !== JSON.stringify(["atlas_edge", "atlas_internal"])) fail("app networks");
for (const n of ["atlas_edge", "atlas_internal"]) if (!c.networks[n].external) fail(n + " must be external");
if (app.logging.driver !== "json-file" || app.logging.options["max-size"] !== "10m" || app.logging.options["max-file"] !== "3") fail("logging");
if (backup.entrypoint != null) fail("backup must not set entrypoint");
if (JSON.stringify(backup.profiles) !== JSON.stringify(["backup"])) fail("backup profile");
'
echo "compose ok"
