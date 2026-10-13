// Entra OIDC client (0.7): discovery, Authorization Code + PKCE, private_key_jwt with the
// certificate thumbprint in `x5t#S256` (decision 13.10, no client secret), ID token signature
// checked against the issuer JWKS, then iss/aud/exp/nonce.
import { createHash, X509Certificate } from 'node:crypto';
import { importPKCS8 } from 'jose';
import * as client from 'openid-client';
import type { EntraSettings } from '../../config/auth-config.js';
import type { OidcTransaction } from './oidc-transaction.js';

export const REDIRECT_PATH = '/auth/callback';

export type IdClaims = Record<string, unknown>;

/** base64url(SHA-256(DER)) of the certificate: the `x5t#S256` JOSE header Entra expects. */
export function certThumbprint(certPem: string): string {
  return createHash('sha256').update(new X509Certificate(certPem).raw).digest('base64url');
}

function isLocalHttp(url: string): boolean {
  const u = new URL(url);
  return u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
}

export class OidcClient {
  private config: Promise<client.Configuration> | undefined;
  private tokenEndpoint = '';

  constructor(private readonly settings: EntraSettings) {}

  get redirectUri(): string {
    return `${this.settings.publicUrl}${REDIRECT_PATH}`;
  }

  private configuration(): Promise<client.Configuration> {
    this.config ??= this.discover().catch((error: unknown) => {
      this.config = undefined;
      throw error;
    });
    return this.config;
  }

  private async discover(): Promise<client.Configuration> {
    const key = await importPKCS8(this.settings.keyPem, 'RS256');
    const x5t = certThumbprint(this.settings.certPem);
    const auth = client.PrivateKeyJwt(key, {
      [client.modifyAssertion]: (header, payload) => {
        header['x5t#S256'] = x5t;
        payload.aud = this.tokenEndpoint;
      },
    });
    const insecure = isLocalHttp(this.settings.issuer);
    const config = await client.discovery(
      new URL(this.settings.issuer),
      this.settings.clientId,
      { id_token_signed_response_alg: 'RS256' },
      auth,
      insecure ? { execute: [client.allowInsecureRequests] } : undefined,
    );
    this.tokenEndpoint = config.serverMetadata().token_endpoint ?? '';
    client.enableNonRepudiationChecks(config);
    return config;
  }

  async loginUrl(t: OidcTransaction): Promise<URL> {
    const config = await this.configuration();
    return client.buildAuthorizationUrl(config, {
      redirect_uri: this.redirectUri,
      scope: 'openid profile',
      response_type: 'code',
      code_challenge: await client.calculatePKCECodeChallenge(t.verifier),
      code_challenge_method: 'S256',
      state: t.state,
      nonce: t.nonce,
    });
  }

  /** Code exchange and ID token validation; throws on any check failure. */
  async exchange(callbackPathAndQuery: string, t: OidcTransaction): Promise<IdClaims> {
    const config = await this.configuration();
    const tokens = await client.authorizationCodeGrant(
      config,
      new URL(callbackPathAndQuery, this.settings.publicUrl),
      {
        pkceCodeVerifier: t.verifier,
        expectedState: t.state,
        expectedNonce: t.nonce,
        idTokenExpected: true,
      },
    );
    const claims = tokens.claims();
    if (claims === undefined) throw new Error('no ID token');
    return claims;
  }

  async logoutUrl(): Promise<URL | null> {
    const config = await this.configuration();
    if (config.serverMetadata().end_session_endpoint === undefined) return null;
    return client.buildEndSessionUrl(config, {
      client_id: this.settings.clientId,
      post_logout_redirect_uri: this.settings.publicUrl,
    });
  }
}

/**
 * Admission by group membership (ADR-008). Without a `groups` array (overage: `_claim_names`)
 * the answer is no — fail closed.
 */
export function isAdmin(claims: IdClaims, groupId: string): boolean {
  const groups = claims.groups;
  if (!Array.isArray(groups) || '_claim_names' in claims) return false;
  return groups.includes(groupId);
}
