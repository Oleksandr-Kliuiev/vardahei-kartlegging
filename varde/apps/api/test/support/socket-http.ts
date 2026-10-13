// HTTP over a Unix socket (break-glass listener, 0.8).
import { request } from 'node:http';

export interface SocketResponse {
  status: number;
  body: string;
  setCookie: string[];
}

export function socketRequest(
  socketPath: string,
  method: 'GET' | 'POST',
  path: string,
  options: { json?: unknown; cookie?: string } = {},
): Promise<SocketResponse> {
  return new Promise((resolve, reject) => {
    const body = options.json === undefined ? undefined : JSON.stringify(options.json);
    const headers: Record<string, string> = { host: 'localhost:3001' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (options.cookie !== undefined) headers.cookie = options.cookie;
    // agent: false — a pooled keep-alive socket would outlive the listener between tests.
    const req = request({ socketPath, method, path, headers, agent: false }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          body: data,
          setCookie: res.headers['set-cookie'] ?? [],
        }),
      );
    });
    req.on('error', reject);
    req.end(body);
  });
}

/** `name=value` of a Set-Cookie header list, as a browser would send it back. */
export function cookiePair(setCookie: string[], name: string): string {
  const line = setCookie.find((c) => c.startsWith(`${name}=`)) ?? '';
  return line.split(';')[0] ?? '';
}
