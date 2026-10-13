// Switch of the load-stand stub (task 0.12): on only with VARDE_STUB_SUBMIT=1, a non-empty
// VARDE_STUB_TOKEN and VARDE_STUB_UNTIL in the future, at most 4 h ahead. Listed in .env.example.
export const STUB_MAX_HOURS = 4;

export type StubConfig = { enabled: false } | { enabled: true; token: string; until: Date };

const value = (env: NodeJS.ProcessEnv, key: string): string => (env[key] ?? '').trim();

export function readStubConfig(env: NodeJS.ProcessEnv = process.env, now = Date.now()): StubConfig {
  const token = value(env, 'VARDE_STUB_TOKEN');
  const until = new Date(value(env, 'VARDE_STUB_UNTIL'));
  if (value(env, 'VARDE_STUB_SUBMIT') !== '1' || token === '' || Number.isNaN(until.getTime())) {
    return { enabled: false };
  }
  if (until.getTime() <= now || until.getTime() > now + STUB_MAX_HOURS * 3600_000) {
    return { enabled: false };
  }
  return { enabled: true, token, until };
}

/** Token the demo.hold-connection job sends to GET /stub/slow (same variable). */
export function stubToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const token = value(env, 'VARDE_STUB_TOKEN');
  return token === '' ? undefined : token;
}
