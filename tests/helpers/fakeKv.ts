/**
 * In-memory Redis stub implementing the exact slice of the API the state layer
 * uses (see KvClient). Shared by all KV-path tests. One instance simulates a
 * single shared Redis; injecting it into two freshly-loaded module instances
 * simulates two serverless instances talking to the same backend.
 */
import type { KvClient } from '@/lib/kv';

type Bound = { value: number; inclusive: boolean };

function parseBound(b: number | string): Bound {
  if (typeof b === 'number') return { value: b, inclusive: true };
  const s = b.trim().toLowerCase();
  if (s === '+inf' || s === 'inf') return { value: Infinity, inclusive: true };
  if (s === '-inf') return { value: -Infinity, inclusive: true };
  if (s.startsWith('(')) return { value: Number(s.slice(1)), inclusive: false };
  const n = Number(s);
  return { value: Number.isFinite(n) ? n : 0, inclusive: true };
}

export class FakeKv implements KvClient {
  private strings = new Map<string, string>();
  private zsets = new Map<string, Map<string, number>>();
  /** Every call, in order — lets tests assert which ops ran (e.g. atomicity). */
  readonly calls: string[] = [];

  private z(key: string): Map<string, number> {
    let m = this.zsets.get(key);
    if (!m) {
      m = new Map();
      this.zsets.set(key, m);
    }
    return m;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    this.calls.push(`get ${key}`);
    const raw = this.strings.get(key);
    if (raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(key: string, value: unknown, _opts?: { ex?: number }): Promise<unknown> {
    this.calls.push(`set ${key}`);
    this.strings.set(key, JSON.stringify(value));
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    this.calls.push(`incr ${key}`);
    const n = Number(this.strings.get(key) ?? 0) + 1;
    this.strings.set(key, String(n));
    return n;
  }

  async incrbyfloat(key: string, increment: number): Promise<number> {
    this.calls.push(`incrbyfloat ${key}`);
    const n = Number(this.strings.get(key) ?? 0) + increment;
    this.strings.set(key, String(n));
    return n;
  }

  async expire(key: string, _seconds: number): Promise<unknown> {
    this.calls.push(`expire ${key}`);
    return this.strings.has(key) || this.zsets.has(key) ? 1 : 0;
  }

  async del(...keys: string[]): Promise<number> {
    this.calls.push(`del ${keys.join(',')}`);
    let n = 0;
    for (const key of keys) {
      if (this.strings.delete(key)) n++;
      if (this.zsets.delete(key)) n++;
    }
    return n;
  }

  async zadd(key: string, member: { score: number; member: string }): Promise<number | null> {
    this.calls.push(`zadd ${key}`);
    const z = this.z(key);
    const existed = z.has(member.member);
    z.set(member.member, member.score);
    return existed ? 0 : 1;
  }

  async zcount(key: string, min: number | string, max: number | string): Promise<number> {
    this.calls.push(`zcount ${key}`);
    const lo = parseBound(min);
    const hi = parseBound(max);
    let n = 0;
    for (const s of this.z(key).values()) {
      if ((lo.inclusive ? s >= lo.value : s > lo.value) && (hi.inclusive ? s <= hi.value : s < hi.value)) n++;
    }
    return n;
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
    this.calls.push(`zremrangebyscore ${key}`);
    const lo = parseBound(min);
    const hi = parseBound(max);
    const z = this.z(key);
    let n = 0;
    for (const [m, s] of [...z.entries()]) {
      if ((lo.inclusive ? s >= lo.value : s > lo.value) && (hi.inclusive ? s <= hi.value : s < hi.value)) {
        z.delete(m);
        n++;
      }
    }
    return n;
  }

  async zrange(
    key: string,
    start: number | string,
    stop: number | string,
    opts?: { rev?: boolean; byScore?: boolean },
  ): Promise<string[]> {
    this.calls.push(`zrange ${key}`);
    const asc = [...this.z(key).entries()].sort((a, b) => a[1] - b[1]);

    if (opts?.byScore) {
      const lo = parseBound(start);
      const hi = parseBound(stop);
      return asc
        .filter(([, s]) => (lo.inclusive ? s >= lo.value : s > lo.value) && (hi.inclusive ? s <= hi.value : s < hi.value))
        .map(([m]) => m);
    }

    const ordered = opts?.rev ? asc.slice().reverse() : asc;
    const n = ordered.length;
    const s = Number(start) < 0 ? Math.max(0, n + Number(start)) : Number(start);
    const e = Number(stop) < 0 ? n + Number(stop) : Number(stop);
    return ordered.slice(s, e + 1).map(([m]) => m);
  }
}
