import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Email capture — the OPTIONAL, non-blocking add-on after a roast result.
 * Two layers:
 *   - recordSubscriber (storage): KV hash path (injected stub) + disk fallback.
 *   - POST /api/subscribe (route): validation, dedupe, abuse guard, no leaks.
 * Nothing here touches the /api/roast pipeline or its guards.
 */

/** Minimal in-memory stand-in for the HASH ops of the real Upstash client. */
class FakeHashKv {
  hashes = new Map<string, Map<string, unknown>>();
  strings = new Map<string, number>();
  readonly calls: string[] = [];

  private h(key: string): Map<string, unknown> {
    let m = this.hashes.get(key);
    if (!m) {
      m = new Map();
      this.hashes.set(key, m);
    }
    return m;
  }

  async hsetnx(key: string, field: string, value: unknown): Promise<number> {
    this.calls.push(`hsetnx ${key} ${field}`);
    const m = this.h(key);
    if (m.has(field)) return 0;
    m.set(field, value);
    return 1;
  }

  async incr(key: string): Promise<number> {
    this.calls.push(`incr ${key}`);
    const n = (this.strings.get(key) ?? 0) + 1;
    this.strings.set(key, n);
    return n;
  }
}

let tmpDir: string;

async function freshSubscribers(stub?: FakeHashKv) {
  vi.resetModules();
  const kv = await import('@/lib/kv');
  // undefined stub -> force disk mode (kvEnabled() === false).
  kv.__setKvForTests(stub ? (stub as unknown as import('@/lib/kv').KvClient) : null);
  const subs = await import('@/lib/subscribers');
  return { subs, kv };
}

function subRequest(body: unknown, raw?: string, headers?: Record<string, string>) {
  return new Request('http://localhost/api/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw ?? JSON.stringify(body),
  });
}

/** Load the route ONCE (disk mode, fresh rate limiter). Reuse `POST` across
 *  calls so the in-memory rate-limit bucket actually accumulates. */
async function loadRouteOnce() {
  vi.resetModules();
  const kv = await import('@/lib/kv');
  kv.__setKvForTests(null);
  const rl = await import('@/lib/ratelimit');
  rl.__resetRateLimit();
  const { POST } = await import('@/app/api/subscribe/route');
  return POST;
}

async function postSubscribe(body: unknown, raw?: string, headers?: Record<string, string>) {
  // Disk mode for the route: no KV injected, temp cache dir set in beforeEach.
  const POST = await loadRouteOnce();
  return POST(subRequest(body, raw, headers));
}

function readAllSubscribers(): Array<{ email: string; roastId: unknown; source: unknown; ts: number }> {
  const dir = path.join(tmpDir, 'subscribers');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roast-subs-'));
  process.env.ROAST_CACHE_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.ROAST_CACHE_DIR;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('recordSubscriber — disk fallback (no KV env)', () => {
  it('stores a new subscriber and reports dup:false', async () => {
    const { subs } = await freshSubscribers();
    const out = await subs.recordSubscriber({ email: 'Alice@Example.com', roastId: 'abcdefghijkl', source: 'result' }, 1000);
    expect(out.dup).toBe(false);
    const all = readAllSubscribers();
    expect(all).toHaveLength(1);
    expect(all[0]!.email).toBe('alice@example.com'); // lowercased for the key
    expect(all[0]!.roastId).toBe('abcdefghijkl');
    expect(all[0]!.source).toBe('result');
  });

  it('dedupes case-insensitively and reports dup:true the second time', async () => {
    const { subs } = await freshSubscribers();
    expect((await subs.recordSubscriber({ email: 'bob@example.com' })).dup).toBe(false);
    expect((await subs.recordSubscriber({ email: 'BOB@EXAMPLE.COM' })).dup).toBe(true);
    expect(readAllSubscribers()).toHaveLength(1);
  });

  it('never writes the raw email as the filename', async () => {
    const { subs } = await freshSubscribers();
    await subs.recordSubscriber({ email: 'secret@example.com' });
    const names = fs.readdirSync(path.join(tmpDir, 'subscribers'));
    expect(names.some((n) => n.includes('secret'))).toBe(false);
  });
});

describe('recordSubscriber — KV hash path', () => {
  it('writes to the roast:subscribers hash and bumps the count on a new email', async () => {
    const stub = new FakeHashKv();
    const { subs } = await freshSubscribers(stub);
    const out = await subs.recordSubscriber({ email: 'New@Co.com', roastId: 'abcdefghijkl', source: 'result' });
    expect(out.dup).toBe(false);
    expect(stub.calls).toContain('hsetnx roast:subscribers new@co.com');
    expect(stub.calls).toContain('incr roast:subscribers:count');
    expect(stub.strings.get('roast:subscribers:count')).toBe(1);
    expect(stub.hashes.get('roast:subscribers')!.get('new@co.com')).toEqual({
      ts: expect.any(Number),
      roastId: 'abcdefghijkl',
      source: 'result',
    });
  });

  it('dedupes atomically via HSETNX and does NOT bump the count again', async () => {
    const stub = new FakeHashKv();
    const { subs } = await freshSubscribers(stub);
    await subs.recordSubscriber({ email: 'dup@co.com' });
    const out = await subs.recordSubscriber({ email: 'dup@co.com' });
    expect(out.dup).toBe(true);
    expect(stub.strings.get('roast:subscribers:count')).toBe(1); // still 1
    expect(stub.calls.filter((c) => c.startsWith('incr')).length).toBe(1);
  });
});

describe('POST /api/subscribe', () => {
  it('accepts a valid email -> 200 {ok:true} and lands it in storage', async () => {
    const res = await postSubscribe({ email: 'founder@startup.io', roastId: 'abcdefghijkl', source: 'result' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const all = readAllSubscribers();
    expect(all).toHaveLength(1);
    expect(all[0]!.email).toBe('founder@startup.io');
    expect(all[0]!.roastId).toBe('abcdefghijkl');
  });

  it.each(['', 'notanemail', 'a@b', 'a @b.com', 'two@@at.com', 'spaces in@x.com'])(
    'rejects an invalid email %j -> 400 {ok:false}',
    async (email) => {
      const res = await postSubscribe({ email });
      expect(res.status).toBe(400);
      expect((await res.json()).ok).toBe(false);
    },
  );

  it('rejects a non-JSON body -> 400', async () => {
    const res = await postSubscribe(undefined, 'not json');
    expect(res.status).toBe(400);
  });

  it('treats a repeat email as success with dup:true (idempotent)', async () => {
    await postSubscribe({ email: 'again@co.com' });
    const res = await postSubscribe({ email: 'again@co.com' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dup: true });
  });

  it('drops an invalid roastId instead of storing junk', async () => {
    await postSubscribe({ email: 'x@y.com', roastId: 'not-a-valid-id!!' });
    expect(readAllSubscribers()[0]!.roastId).toBeNull();
  });

  it('drops a junk source but keeps a clean one', async () => {
    await postSubscribe({ email: 'a@b.com', source: 'result' });
    await postSubscribe({ email: 'c@d.com', source: '<script>' });
    const byEmail = Object.fromEntries(readAllSubscribers().map((s) => [s.email, s.source]));
    expect(byEmail['a@b.com']).toBe('result');
    expect(byEmail['c@d.com']).toBeNull();
  });

  it('never echoes the email back in the response', async () => {
    const res = await postSubscribe({ email: 'private@secret.com' });
    expect(JSON.stringify(await res.json())).not.toContain('private@secret.com');
  });

  it('applies a light abuse guard on its own bucket -> 429 after the limit', async () => {
    const POST = await loadRouteOnce(); // one instance, so the bucket accumulates
    let last: Response | undefined;
    // 10/min allowed, the 11th on the same (header-less => "unknown") bucket trips.
    for (let i = 0; i < 11; i++) last = await POST(subRequest({ email: `u${i}@co.com` }));
    expect(last!.status).toBe(429);
  });
});
