/**
 * Shared KV backend (Upstash Redis), auto-selected when KV env is present.
 *
 * Roast runs two ways:
 *   - VPC (today): no KV env -> the existing disk/in-memory state layer. UNCHANGED.
 *   - Vercel (serverless): KV env present -> shared Redis, because the
 *     per-invocation filesystem is ephemeral and the daily spend cap MUST be
 *     global, not per-instance.
 *
 * This is the one place that decides which world we are in. Every state module
 * asks `kvEnabled()` and routes through `kv()`; when it returns null they keep
 * their disk path verbatim.
 */
import { Redis } from '@upstash/redis';

/**
 * The narrow slice of the Redis API the state layer uses. A real client is
 * cast to this; tests inject an in-memory stub that implements exactly these.
 * Signatures mirror @upstash/redis (auto JSON-(de)serialisation on get/set).
 */
export interface KvClient {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  incr(key: string): Promise<number>;
  incrbyfloat(key: string, increment: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  zadd(key: string, member: { score: number; member: string }): Promise<number | null>;
  zcount(key: string, min: number | string, max: number | string): Promise<number>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  zrange(
    key: string,
    start: number | string,
    stop: number | string,
    opts?: { rev?: boolean; byScore?: boolean },
  ): Promise<string[]>;
}

/** All keys share this prefix so one Redis can host more than this app. */
export const NS = 'roast:';
export const k = (suffix: string): string => NS + suffix;

function envPair(): { url?: string; token?: string } {
  // Vercel Marketplace and a hand-wired Upstash integration inject different
  // names for the same pair; support both so the deploy "just works".
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

// Test seam: when set (including to null) it overrides env detection entirely.
let injected: KvClient | null | undefined;
let real: KvClient | null = null;

/** True when a shared KV backend is configured (or injected in tests). */
export function kvEnabled(): boolean {
  if (injected !== undefined) return injected !== null;
  const { url, token } = envPair();
  return Boolean(url && token);
}

/** The shared client, or null when running on the disk/in-memory path. */
export function kv(): KvClient | null {
  if (injected !== undefined) return injected;
  if (!kvEnabled()) return null;
  if (!real) {
    const { url, token } = envPair();
    real = new Redis({ url: url!, token: token! }) as unknown as KvClient;
  }
  return real;
}

/** Test seam: inject an in-memory stub, null to force disk mode, undefined to reset. */
export function __setKvForTests(client: KvClient | null | undefined): void {
  injected = client;
  real = null;
}
