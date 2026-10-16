// Captures everything the process writes to stdout/stderr (Nest logger, request log). Vitest
// takes console.* over in its workers, so a console call does not reach process.stdout here;
// `{ console: true }` captures console.log/info/warn/error/debug as well (3b: no presenter key in
// any output).
import { format } from 'node:util';
import { vi } from 'vitest';

export interface Captured {
  text: () => string;
  lines: () => string[];
  restore: () => void;
}

const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'] as const;

export function captureOutput(opts: { console?: boolean } = {}): Captured {
  const chunks: string[] = [];
  const grab = (chunk: unknown): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString());
    return true;
  };
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(grab);
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(grab);
  const consoles = opts.console
    ? CONSOLE.map((m) =>
        vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
          chunks.push(`${format(...args)}\n`);
        }),
      )
    : [];
  return {
    text: () => chunks.join(''),
    lines: () => chunks.join('').split('\n').filter(Boolean),
    restore: () => {
      out.mockRestore();
      err.mockRestore();
      for (const spy of consoles) spy.mockRestore();
    },
  };
}
