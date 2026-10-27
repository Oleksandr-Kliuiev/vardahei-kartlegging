#!/usr/bin/env bash
# Test of infra/compose.yml (task 0.6, backup binds 0.1): config is valid without /etc/varde files, app and
# backup have their bind mounts in the long form without create_host_path, backup has no entrypoint.
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
const need = { "/run/varde": "/var/lib/varde/run", "/var/lib/varde/ledger-out": "/var/lib/varde/ledger-out", "/etc/varde/recipients.txt": "/etc/varde/recipients.txt", "/etc/varde/entra": "/etc/varde/entra" };
for (const [target, source] of Object.entries(need)) {
  const b = binds.find((v) => v.target === target);
  if (!b || b.source !== source) fail("bind " + target);
  // Long syntax: create_host_path defaults to false; some compose versions omit false in JSON.
  if (b.bind && b.bind.create_host_path === true) fail("create_host_path on " + target);
}
for (const b of binds) if (b.bind && b.bind.create_host_path === true) fail("create_host_path on " + b.target);
for (const t of ["/etc/varde/recipients.txt", "/etc/varde/entra"]) if (!binds.find((v) => v.target === t).read_only) fail(t + " must be ro");
if (JSON.stringify(Object.keys(app.networks).sort()) !== JSON.stringify(["atlas_edge", "atlas_internal"])) fail("app networks");
for (const n of ["atlas_edge", "atlas_internal"]) if (!c.networks[n].external) fail(n + " must be external");
if (app.logging.driver !== "json-file" || app.logging.options["max-size"] !== "10m" || app.logging.options["max-file"] !== "3") fail("logging");
if (backup.entrypoint != null) fail("backup must not set entrypoint");
if (JSON.stringify(backup.profiles) !== JSON.stringify(["backup"])) fail("backup profile");
if (JSON.stringify(backup.networks ? Object.keys(backup.networks) : []) !== JSON.stringify(["atlas_internal"])) fail("backup networks");
const bb = (backup.volumes || []).filter((v) => v.type === "bind");
const bneed = { "/kit": ["/opt/varde/backup", true], "/run/varde/recipients.txt": ["/etc/varde/recipients.txt", true], "/run/varde/rclone": ["/etc/varde/rclone", false], "/run/varde/VERSION": ["/opt/varde/VERSION", true], "/run/varde/images": ["/opt/varde/images", true], "/var/lib/varde-backup": ["/var/lib/varde/backup-state", false] };
for (const [target, [source, ro]] of Object.entries(bneed)) {
  const b = bb.find((v) => v.target === target);
  if (!b || b.source !== source) fail("backup bind " + target);
  if (!!b.read_only !== ro) fail("backup bind " + target + (ro ? " must be ro" : " must be rw"));
}
if (bb.length !== Object.keys(bneed).length) fail("backup has unexpected binds");
for (const b of bb) if (b.bind && b.bind.create_host_path === true) fail("create_host_path on backup " + b.target);
'
# The source states it explicitly for every app bind (a missing directory is a loud error).
[[ $(grep -c 'create_host_path: false' "$infra/compose.yml") -ge 4 ]] || { echo "compose test FAILED: create_host_path: false not explicit" >&2; exit 1; }
if grep -Eq '^\s+- /[^:]+:/' "$infra/compose.yml"; then echo "compose test FAILED: short bind syntax" >&2; exit 1; fi
echo "compose ok"
