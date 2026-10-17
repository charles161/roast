/**
 * Per-IP rate limiting with two sliding windows.
 *   - No KV env: in-memory (one node; a restart losing counters is cheaper
 *     than a dependency). UNCHANGED.
 *   - KV env present: the same two windows via a per-IP sorted set in Redis,
 *     so the limit holds across serverless instances.
 */
import { k, kv, kvEnabled } from './kv';

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
export async function rateLimit(
  key: string,
  rules: RateRule[] = [PER_MINUTE, PER_HOUR],
  now = Date.now(),
): Promise<RateResult> {
  if (kvEnabled()) return kvRateLimit(key, rules, now);

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

let seq = 0;

/** The same two-window policy, backed by a Redis sorted set per IP. */
async function kvRateLimit(key: string, rules: RateRule[], now: number): Promise<RateResult> {
  const r = kv()!;
  const rlKey = k(`rl:${key}`);
  const longest = Math.max(...rules.map((x) => x.windowMs));

  try {
    await r.zremrangebyscore(rlKey, 0, now - longest);

    const counts: number[] = [];
    for (const rule of rules) {
      const inWindow = await r.zcount(rlKey, `(${now - rule.windowMs}`, '+inf');
      counts.push(inWindow);
      if (inWindow >= rule.limit) {
        const members = await r.zrange(rlKey, `(${now - rule.windowMs}`, '+inf', { byScore: true });
        const oldest = members.length ? Number(String(members[0]).split('-')[0]) : now;
        const retryAfterSec = Math.max(1, Math.ceil((rule.windowMs - (now - oldest)) / 1000));
        return { ok: false, retryAfterSec, remaining: 0 };
      }
    }

    await r.zadd(rlKey, { score: now, member: `${now}-${seq++}` });
    await r.expire(rlKey, Math.ceil(longest / 1000) + 1);

    const remaining = Math.min(...rules.map((rule, i) => rule.limit - (counts[i]! + 1)));
    return { ok: true, retryAfterSec: 0, remaining: Math.max(0, remaining) };
  } catch {
    // A KV blip must not wedge the public tool; let the request through.
    return { ok: true, retryAfterSec: 0, remaining: 0 };
  }
}

function sweep(now: number, longest: number): void {
  for (const [key, v] of buckets) {
    const live = v.filter((t) => now - t < longest);
    if (live.length === 0) buckets.delete(key);
    else buckets.set(key, live);
  }
}

/** Best-effort client IP from proxy headers, falling back to a shared bucket. */
export function clientIp(headers: Headers): string {
  // Only trust headers the hosting platform sets itself. On Vercel there is no
  // Cloudflare in front, so `cf-connecting-ip` is attacker-controlled and must
  // NOT be trusted (trusting it let anyone mint a fresh rate-limit bucket per
  // request). Vercel sets x-vercel-forwarded-for / x-real-ip / x-forwarded-for
  // from the real edge connection; a VPS behind Cloudflare also sets
  // x-forwarded-for, so this is correct on both.
  const vercel = headers.get('x-vercel-forwarded-for');
  if (vercel) {
    const first = vercel.split(',')[0]?.trim();
    if (first) return first;
  }
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
