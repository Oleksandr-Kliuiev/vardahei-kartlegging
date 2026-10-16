// Request log of the api (task 0.6, ADR-009 "codes are not logged", stage-0 §9 p. 8):
// method, path without query, status, duration. No IP, no headers, no query string.
// Runner paths (/r/*, /api/runner/*; used from 1.12) are written only on status ≥ 400,
// so successful submissions leave no trace (neither time nor path). The same holds for the
// seminar page and its API (/s, /api/public/*; 3.2): a registration leaves no log line.
import type { FastifyInstance } from 'fastify';

export const RUNNER_PREFIXES = ['/r/', '/api/runner/', '/s/', '/api/public/'] as const;

export type LogSink = (line: string) => void;

const stdout: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

/** Path part of a request URL: everything from `?` or `#` is dropped. */
export function pathOnly(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export function isRunnerPath(path: string): boolean {
  return path === '/r' || path === '/s' || RUNNER_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** One JSON line per response, written from Fastify's onResponse hook. */
export function registerRequestLog(fastify: FastifyInstance, sink: LogSink = stdout): void {
  fastify.addHook('onResponse', (request, reply, done) => {
    const path = pathOnly(request.url);
    const status = reply.statusCode;
    if (!(isRunnerPath(path) && status < 400)) {
      sink(
        JSON.stringify({
          at: new Date().toISOString(),
          method: request.method,
          path,
          status,
          ms: Math.round(reply.elapsedTime),
        }),
      );
    }
    done();
  });
}

/** Removes query strings from any text that may contain a URL (error messages, stacks). */
export function stripQueries(text: string): string {
  return text.replace(/\?[^\s'")]*/g, '');
}
