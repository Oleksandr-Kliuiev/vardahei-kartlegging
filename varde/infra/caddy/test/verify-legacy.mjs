// Check adapted route behavior, including negative routes; do not just grep the source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const server = Object.values(config.apps.http.servers)[0];
function inspect(routes, path, query = 'synthetic=1') {
  const state = { path, query, status: undefined, proxy: undefined, location: undefined };
  const match = (m) =>
    !m.path ||
    m.path.some((p) =>
      p.endsWith('*') ? state.path.startsWith(p.slice(0, -1)) : state.path === p,
    );
  function walk(list) {
    for (const r of list) {
      if (r.match && !r.match.some(match)) continue;
      for (const h of r.handle ?? []) {
        if (h.handler === 'subroute') walk(h.routes);
        if (h.handler === 'rewrite') {
          const uri = h.uri.replace('{http.request.uri.query}', state.query);
          const [p, q] = uri.split('?');
          state.path = p;
          state.query = q ?? '';
        }
        if (h.handler === 'static_response') {
          state.status = Number(h.status_code);
          state.location = h.headers?.Location?.[0];
        }
        if (h.handler === 'reverse_proxy') state.proxy = h.upstreams[0].dial;
      }
      if (r.terminal || state.status || state.proxy) return;
    }
  }
  walk(routes);
  return state;
}
const root = inspect(server.routes, '/');
assert.equal(root.path, '/r/legacy');
assert.equal(root.query, 'synthetic=1');
assert.equal(root.proxy, 'varde-app:3000');
for (const path of ['/admin', '/admin/rounds', '/dashboard']) {
  const r = inspect(server.routes, path);
  assert.equal(r.status, 302);
  assert.equal(r.location, 'https://varde.vardahei.tech/admin');
  assert.equal(r.proxy, undefined);
}
for (const path of ['/auth/login', '/api/runner/round', '/r', '/health', '/runde1.js']) {
  const r = inspect(server.routes, path);
  assert.equal(r.status, 404);
  assert.equal(r.proxy, undefined);
}
