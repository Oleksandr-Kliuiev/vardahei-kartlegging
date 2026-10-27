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

/** The eight 16-bit groups of an IPv6 address, or null when it is not one. */
function hextets(ip: string): number[] | null {
  let s = (ip.split('%')[0] ?? '').toLowerCase();
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number];
    if ([a, b, c, d].some((n) => n > 255)) return null;
    s = `${s.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (halves.length === 2 && fill < 1) return null;
  const all = [...head, ...Array<string>(fill).fill('0'), ...rest];
  if (all.length !== 8 || all.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => parseInt(h, 16));
}

/**
 * The key a peer is counted under (1.4). IPv4 as it is; an IPv4-mapped IPv6 address as its IPv4; any other
 * IPv6 address by its /64, because one subscriber holds a whole /64 and can take any address in it.
 */
export function ipKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  const h = hextets(ip);
  if (h === null) return ip;
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff)
    return `${h[6]! >> 8}.${h[6]! & 255}.${h[7]! >> 8}.${h[7]! & 255}`;
  return `${h
    .slice(0, 4)
    .map((x) => x.toString(16))
    .join(':')}::/64`;
}
