import { HttpException } from '@nestjs/common';

export const QUOTA_MESSAGE = 'For mange innsendingar. Prøv igjen om litt.';
const WINDOW_MS = 10 * 60_000;

/** One process only. Peers/session IDs are ephemeral and never written or logged. */
export class SlidingWindow {
  private readonly hits = new Map<string, { at: number }[]>();

  reserve(limits: readonly { key: string; max: number }[], now = Date.now()): () => void {
    // Bounded lifetime for every key, including IPs that never return.
    for (const [key, hits] of this.hits) {
      const fresh = hits.filter((h) => h.at > now - WINDOW_MS);
      if (fresh.length) this.hits.set(key, fresh);
      else this.hits.delete(key);
    }
    if (limits.some(({ key, max }) => (this.hits.get(key)?.length ?? 0) >= max))
      throw new HttpException(QUOTA_MESSAGE, 429);
    const token = { at: now };
    for (const { key } of limits) {
      const hits = this.hits.get(key) ?? [];
      hits.push(token);
      this.hits.set(key, hits);
    }
    return () => {
      for (const { key } of limits) {
        const left = (this.hits.get(key) ?? []).filter((h) => h !== token);
        if (left.length) this.hits.set(key, left);
        else this.hits.delete(key);
      }
    };
  }
}
