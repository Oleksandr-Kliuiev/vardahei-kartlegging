// Environment of the Entra login (task 0.7, ADR-008; decision 13.10: certificate,
// private_key_jwt, no client secret). Every variable is listed in apps/api/.env.example.
import { readFileSync } from 'node:fs';

export interface EntraSettings {
  tenantId: string;
  clientId: string;
  /** PEM (PKCS#8) of the client key; /etc/varde/entra/key.pem on the VPS, mounted read-only. */
  keyPem: string;
  /** PEM of the certificate uploaded to Entra; its SHA-256 thumbprint goes to `x5t#S256`. */
  certPem: string;
  adminGroupId: string;
  issuer: string;
  publicUrl: string;
}

export const DEFAULT_SESSION_TTL_SECONDS = 8 * 3600;

const value = (env: NodeJS.ProcessEnv, key: string): string => (env[key] ?? '').trim();

/** Entra issuer of the tenant; VARDE_OIDC_ISSUER replaces it only for the mock issuer in tests. */
export function issuerUrl(env: NodeJS.ProcessEnv, tenantId: string): string {
  const override = value(env, 'VARDE_OIDC_ISSUER');
  // A mock issuer in production would let whoever runs it sign in as an administrator (1.3).
  if (override !== '' && value(env, 'NODE_ENV') === 'production')
    throw new Error('VARDE_OIDC_ISSUER is for tests and must not be set when NODE_ENV=production');
  return override !== '' ? override : `https://login.microsoftonline.com/${tenantId}/v2.0`;
}

/**
 * null when any ENTRA_* (or SESSION_SECRET, PUBLIC_URL) is empty: the app still starts,
 * /auth/login and /auth/callback answer 503 (restore on a machine without Entra, 0.10c).
 */
export function readEntraSettings(env: NodeJS.ProcessEnv = process.env): EntraSettings | null {
  const keys = [
    'ENTRA_TENANT_ID',
    'ENTRA_CLIENT_ID',
    'ENTRA_CLIENT_KEY_FILE',
    'ENTRA_CLIENT_CERT_FILE',
    'VARDE_ADMIN_GROUP_ID',
    'SESSION_SECRET',
    'PUBLIC_URL',
  ];
  if (keys.some((k) => value(env, k) === '')) return null;
  const tenantId = value(env, 'ENTRA_TENANT_ID');
  return {
    tenantId,
    clientId: value(env, 'ENTRA_CLIENT_ID'),
    keyPem: readFileSync(value(env, 'ENTRA_CLIENT_KEY_FILE'), 'utf8'),
    certPem: readFileSync(value(env, 'ENTRA_CLIENT_CERT_FILE'), 'utf8'),
    adminGroupId: value(env, 'VARDE_ADMIN_GROUP_ID'),
    issuer: issuerUrl(env, tenantId),
    publicUrl: value(env, 'PUBLIC_URL').replace(/\/+$/, ''),
  };
}

/** SESSION_SECRET signs the cookies; without it a random per-process secret is used. */
export function sessionSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const secret = value(env, 'SESSION_SECRET');
  return secret === '' ? undefined : secret;
}

/** An Entra session ends after this long without a request (SESSION_IDLE_SECONDS, default 1 h; 1.3). */
export const DEFAULT_SESSION_IDLE_SECONDS = 3600;
export function sessionIdleSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = value(env, 'SESSION_IDLE_SECONDS');
  if (raw === '') return DEFAULT_SESSION_IDLE_SECONDS;
  const idle = Number(raw);
  if (!Number.isInteger(idle) || idle <= 0)
    throw new Error('SESSION_IDLE_SECONDS must be a positive integer');
  return idle;
}

/** Absolute session lifetime (SESSION_TTL_SECONDS, default 8 h). */
export function sessionTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = value(env, 'SESSION_TTL_SECONDS');
  if (raw === '') return DEFAULT_SESSION_TTL_SECONDS;
  const ttl = Number(raw);
  if (!Number.isInteger(ttl) || ttl <= 0)
    throw new Error('SESSION_TTL_SECONDS must be a positive integer');
  return ttl;
}
