// Captures everything the process writes to stdout/stderr (Nest logger, request log, console).
import { vi } from 'vitest';

export interface Captured {
  text: () => string;
  lines: () => string[];
  restore: () => void;
}

export function captureOutput(): Captured {
  const chunks: string[] = [];
  const grab = (chunk: unknown): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString());
    return true;
  };
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(grab);
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(grab);
  return {
    text: () => chunks.join(''),
    lines: () => chunks.join('').split('\n').filter(Boolean),
    restore: () => {
      out.mockRestore();
      err.mockRestore();
    },
  };
}
