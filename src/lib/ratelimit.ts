/**
 * Per-IP rate limiting with two sliding windows. In-memory by design: one
 * node, and a restart losing counters is cheaper than a dependency.
 */
export type RateRule = { limit: number; windowMs: number };

export const PER_MINUTE: RateRule = { limit: 10, windowMs: 60_000 };
export const PER_HOUR: RateRule = { limit: 60, windowMs: 60 * 60_000 };

type Bucket = number[]; // request timestamps, ascending

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 20_000;

export type RateResult = { ok: boolean; retryAfterSec: number; remaining: number };

/**
 * Record a hit for `key` and report whether it is allowed.
 * Rejected requests are NOT recorded, so a hammering client can't
 * extend its own penalty window indefinitely.
 */
export function rateLimit(
  key: string,
  rules: RateRule[] = [PER_MINUTE, PER_HOUR],
  now = Date.now(),
): RateResult {
  const longest = Math.max(...rules.map((r) => r.windowMs));
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < longest);

  for (const rule of rules) {
    const inWindow = hits.filter((t) => now - t < rule.windowMs);
    if (inWindow.length >= rule.limit) {
      const oldest = inWindow[0]!;
      const retryAfterSec = Math.max(1, Math.ceil((rule.windowMs - (now - oldest)) / 1000));
      buckets.set(key, hits);
      return { ok: false, retryAfterSec, remaining: 0 };
    }
  }

  hits.push(now);
  buckets.set(key, hits);

  if (buckets.size > MAX_KEYS) sweep(now, longest);

  // Report the budget that runs out first, across every rule.
  const remaining = Math.min(
    ...rules.map((r) => r.limit - hits.filter((t) => now - t < r.windowMs).length),
  );
  return { ok: true, retryAfterSec: 0, remaining: Math.max(0, remaining) };
}

function sweep(now: number, longest: number): void {
  for (const [k, v] of buckets) {
    const live = v.filter((t) => now - t < longest);
    if (live.length === 0) buckets.delete(k);
    else buckets.set(k, live);
  }
}

/** Best-effort client IP from proxy headers, falling back to a shared bucket. */
export function clientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

/** Test seam. */
export function __resetRateLimit(): void {
  buckets.clear();
}
