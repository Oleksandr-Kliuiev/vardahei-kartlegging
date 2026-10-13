// Mock Entra issuer for tests (0.7): discovery, JWKS, auto-approving /authorize, and a token
// endpoint that verifies the private_key_jwt client assertion (signature by the client
// certificate, x5t#S256, iss/sub/aud) and PKCE before it issues an ID token for the scenario.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CryptoKey } from 'jose';

// jose is ESM-only; a dynamic import keeps this file loadable from CommonJS transforms
// (Playwright's loader on Node 22 cannot require() it: "module not been linked").
type Jose = typeof import('jose');
let josePromise: Promise<Jose> | undefined;
const jose = (): Promise<Jose> => (josePromise ??= import('jose'));

export interface Scenario {
  groups?: string[] | null;
  claimNames?: boolean;
  nonce?: string;
  aud?: string;
  iss?: string;
  expired?: boolean;
  foreignKey?: boolean;
  name?: string;
}

/** Test client key + self-signed certificate generated on the fly (never committed). */
export function clientCertificate(): { dir: string; keyFile: string; certFile: string } {
  const dir = mkdtempSync(join(tmpdir(), 'varde-entra-'));
  const keyFile = join(dir, 'key.pem');
  const certFile = join(dir, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyFile,
      '-out',
      certFile,
      '-days',
      '1',
      '-subj',
      '/CN=varde-test',
    ],
    { stdio: 'ignore' },
  );
  return { dir, keyFile, certFile };
}

interface Grant {
  nonce: string;
  challenge: string;
  redirectUri: string;
  scenario: Scenario;
}

export class MockOidc {
  readonly tenant = 'test-tenant';
  readonly clientId = 'varde-test-client';
  scenario: Scenario = {};
  /** Verified client assertions (header + payload) in order. */
  readonly assertions: { header: Record<string, unknown>; payload: Record<string, unknown> }[] = [];
  private server: Server | undefined;
  private base = '';
  private signing!: CryptoKey;
  private foreign!: CryptoKey;
  private jwks: object = {};
  private readonly grants = new Map<string, Grant>();

  constructor(private readonly certFile: string) {}

  get issuer(): string {
    return `${this.base}/${this.tenant}/v2.0`;
  }

  /** Origin of the mock; POST /__scenario (JSON Scenario) switches the scenario (e2e). */
  get origin(): string {
    return this.base;
  }

  get tokenEndpoint(): string {
    return `${this.base}/${this.tenant}/oauth2/v2.0/token`;
  }

  async start(): Promise<void> {
    const { exportJWK, generateKeyPair } = await jose();
    const kp = await generateKeyPair('RS256');
    this.signing = kp.privateKey;
    this.foreign = (await generateKeyPair('RS256')).privateKey;
    this.jwks = {
      keys: [{ ...(await exportJWK(kp.publicKey)), kid: 'k1', use: 'sig', alg: 'RS256' }],
    };
    this.server = createServer((req, res) => {
      this.handle(req.method ?? 'GET', req.url ?? '/', req).then(
        ({ status, body, location }) => {
          const headers: Record<string, string> = { 'content-type': 'application/json' };
          if (location !== undefined) headers.location = location;
          res.writeHead(status, headers).end(body === undefined ? '' : JSON.stringify(body));
        },
        (error: unknown) => res.writeHead(500).end(String(error)),
      );
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private async handle(
    method: string,
    rawUrl: string,
    req: NodeJS.ReadableStream,
  ): Promise<{ status: number; body?: unknown; location?: string }> {
    const url = new URL(rawUrl, this.base);
    const prefix = `/${this.tenant}`;
    if (url.pathname === '/__scenario' && method === 'POST') {
      this.scenario = JSON.parse(await readBody(req)) as Scenario;
      return { status: 204 };
    }
    if (url.pathname === `${prefix}/v2.0/.well-known/openid-configuration`) {
      return {
        status: 200,
        body: {
          issuer: this.issuer,
          authorization_endpoint: `${this.base}${prefix}/oauth2/v2.0/authorize`,
          token_endpoint: this.tokenEndpoint,
          end_session_endpoint: `${this.base}${prefix}/oauth2/v2.0/logout`,
          jwks_uri: `${this.base}${prefix}/discovery/v2.0/keys`,
          response_types_supported: ['code'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['private_key_jwt'],
          code_challenge_methods_supported: ['S256'],
        },
      };
    }
    if (url.pathname === `${prefix}/discovery/v2.0/keys`) return { status: 200, body: this.jwks };
    if (url.pathname === `${prefix}/oauth2/v2.0/authorize`) return this.authorize(url);
    if (url.pathname === `${prefix}/oauth2/v2.0/token` && method === 'POST') {
      return this.token(new URLSearchParams(await readBody(req)));
    }
    return { status: 404 };
  }

  private authorize(url: URL): { status: number; location?: string } {
    const p = url.searchParams;
    if (p.get('client_id') !== this.clientId || p.get('code_challenge_method') !== 'S256') {
      return { status: 400 };
    }
    const code = randomUUID();
    this.grants.set(code, {
      nonce: p.get('nonce') ?? '',
      challenge: p.get('code_challenge') ?? '',
      redirectUri: p.get('redirect_uri') ?? '',
      scenario: { ...this.scenario },
    });
    const back = new URL(p.get('redirect_uri') ?? '');
    back.searchParams.set('code', code);
    back.searchParams.set('state', p.get('state') ?? '');
    return { status: 302, location: back.href };
  }

  private async token(form: URLSearchParams): Promise<{ status: number; body?: unknown }> {
    const fail = (error: string) => ({ status: 400, body: { error } });
    const grant = this.grants.get(form.get('code') ?? '');
    this.grants.delete(form.get('code') ?? '');
    if (grant === undefined || form.get('redirect_uri') !== grant.redirectUri)
      return fail('invalid_grant');
    const verifier = form.get('code_verifier') ?? '';
    if (createHash('sha256').update(verifier).digest('base64url') !== grant.challenge)
      return fail('invalid_grant');
    if (
      form.get('client_assertion_type') !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
    ) {
      return fail('invalid_client');
    }
    const { decodeProtectedHeader, importX509, jwtVerify } = await jose();
    const assertion = form.get('client_assertion') ?? '';
    const certPem = readFileSync(this.certFile, 'utf8');
    try {
      const { payload } = await jwtVerify(assertion, await importX509(certPem, 'RS256'), {
        issuer: this.clientId,
        subject: this.clientId,
        audience: this.tokenEndpoint,
      });
      const header = decodeProtectedHeader(assertion) as Record<string, unknown>;
      const x5t = createHash('sha256').update(new X509Certificate(certPem).raw).digest('base64url');
      if (header['x5t#S256'] !== x5t) return fail('invalid_client');
      this.assertions.push({ header, payload });
    } catch {
      return fail('invalid_client');
    }
    return {
      status: 200,
      body: {
        access_token: 'mock',
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: await this.idToken(grant),
      },
    };
  }

  private async idToken(grant: Grant): Promise<string> {
    const s = grant.scenario;
    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {
      oid: 'oid-1',
      name: s.name ?? 'Test Admin',
      nonce: s.nonce ?? grant.nonce,
    };
    if (s.groups !== null) claims.groups = s.groups ?? [];
    if (s.claimNames === true) {
      delete claims.groups;
      claims._claim_names = { groups: 'src1' };
      claims._claim_sources = { src1: { endpoint: 'https://graph.microsoft.com/v1.0/x' } };
    }
    const { SignJWT } = await jose();
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1', typ: 'JWT' })
      .setIssuer(s.iss ?? this.issuer)
      .setAudience(s.aud ?? this.clientId)
      .setSubject('sub-1')
      .setIssuedAt(s.expired === true ? now - 7200 : now)
      .setExpirationTime(s.expired === true ? now - 3600 : now + 3600)
      .sign(s.foreignKey === true ? this.foreign : this.signing);
  }
}

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c: Buffer) => (data += c.toString()));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
