// Break-glass switch (task 0.8, ADR-008): local admin login on a Unix socket for a bounded
// window. Every variable is listed in apps/api/.env.example.
export const DEFAULT_SOCKET = '/run/varde/break-glass.sock';
export const DEFAULT_MAX_HOURS = 4;
/** Lifetime of one break-glass session (capped by UNTIL). */
export const SESSION_MAX_MS = 3600_000;

export type BreakGlassConfig =
  | { state: 'off' }
  | { state: 'rejected'; operator: string; details: Record<string, string> }
  | { state: 'on'; until: Date; hash: string; operator: string; socket: string };

const value = (env: NodeJS.ProcessEnv, key: string): string => (env[key] ?? '').trim();

export function readBreakGlassConfig(
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): BreakGlassConfig {
  const rawUntil = value(env, 'VARDE_BREAK_GLASS_UNTIL');
  const hash = value(env, 'VARDE_BREAK_GLASS_PASSWORD_HASH');
  const operator = value(env, 'VARDE_BREAK_GLASS_OPERATOR') || 'unknown';
  if (rawUntil === '' || hash === '') return { state: 'off' };
  const until = new Date(rawUntil);
  if (Number.isNaN(until.getTime())) {
    return { state: 'rejected', operator, details: { reason: 'bad_until' } };
  }
  if (until.getTime() <= now) return { state: 'off' };
  const rawMax = value(env, 'BREAK_GLASS_MAX_HOURS');
  const maxHours = rawMax === '' ? DEFAULT_MAX_HOURS : Number(rawMax);
  // "4h", "abc", 0 or anything above the ADR limit must not open an unbounded window.
  if (!Number.isFinite(maxHours) || maxHours <= 0 || maxHours > DEFAULT_MAX_HOURS) {
    return { state: 'rejected', operator, details: { reason: 'bad_max_hours' } };
  }
  if (until.getTime() > now + maxHours * 3600_000) {
    return { state: 'rejected', operator, details: { until: until.toISOString() } };
  }
  // A PHC string written without single quotes is mangled by Compose interpolation ($VAR).
  if (!hash.startsWith('$argon2id$')) {
    return { state: 'rejected', operator, details: { reason: 'bad_hash' } };
  }
  return {
    state: 'on',
    until,
    hash,
    operator,
    socket: value(env, 'VARDE_BREAK_GLASS_SOCKET') || DEFAULT_SOCKET,
  };
}

export function socketPath(env: NodeJS.ProcessEnv = process.env): string {
  return value(env, 'VARDE_BREAK_GLASS_SOCKET') || DEFAULT_SOCKET;
}
