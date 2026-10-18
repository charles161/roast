import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeKv } from './helpers/fakeKv';
import type { RoastResult } from '@/lib/types';

/**
 * KV-path coverage for all five state modules. One FakeKv instance = one shared
 * Redis; loading the modules twice against the same stub = two serverless
 * instances talking to the same backend.
 */
async function loadWith(stub: FakeKv) {
  vi.resetModules();
  const kvmod = await import('@/lib/kv');
  kvmod.__setKvForTests(stub);
  return {
    kvmod,
    cache: await import('@/lib/cache'),
    spend: await import('@/lib/spend'),
    counter: await import('@/lib/counter'),
    showcase: await import('@/lib/showcase'),
    ratelimit: await import('@/lib/ratelimit'),
  };
}

function result(over: Partial<RoastResult> = {}): RoastResult {
  return {
    id: 'abcdefghijkl',
    url: 'https://stripe.com/',
    displayUrl: 'stripe.com',
    siteName: 'Stripe',
    favicon: '',
    createdAt: 1000,
    score: { overall: 73, subs: [{ key: 'hero', label: 'Hero', score: 60, reason: 'r' }] },
    roast: ['A line.'],
    verdict: 'A verdict.',
    before: { headline: 'b', subhead: 'b', cta: 'b' },
    after: { headline: 'a', subhead: 'a', cta: 'a' },
    fixes: ['one', 'two', 'three'],
    ...over,
  };
}

describe('cache (KV path)', () => {
  it('round-trips a result across two instances via shared Redis', async () => {
    const kv = new FakeKv();
    const a = await loadWith(kv);
    const id = a.cache.idForUrl('https://stripe.com/');
    await a.cache.cacheSet(id, { hello: 'world' });

    // A second instance has an empty in-memory LRU: this can only hit KV.
    const b = await loadWith(kv);
    expect(await b.cache.cacheGet(id)).toEqual({ hello: 'world' });
  });

  it('sets the Redis expiry to the 90-day TTL so KV matches the in-process window', async () => {
    class SpyKv extends FakeKv {
      lastEx: number | undefined;
      async set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown> {
        this.lastEx = opts?.ex;
        return super.set(key, value, opts);
      }
    }
    const kv = new SpyKv();
    const a = await loadWith(kv);
    await a.cache.cacheSet(a.cache.idForUrl('https://stripe.com/'), { v: 1 });
    expect(kv.lastEx).toBe(90 * 24 * 60 * 60);
  });

  it('honours the TTL window on the KV read', async () => {
    const kv = new FakeKv();
    const a = await loadWith(kv);
    const id = a.cache.idForUrl('https://stripe.com/');
    const t0 = 1_000_000;
    await a.cache.cacheSet(id, { v: 1 }, t0);

    const b = await loadWith(kv); // empty LRU -> forced to read KV
    expect(await b.cache.cacheGet(id, t0 + a.cache.TTL_MS - 1000)).toEqual({ v: 1 });
    expect(await b.cache.cacheGet(id, t0 + a.cache.TTL_MS + 1000)).toBeNull();
  });

  it('stores under the roast: namespace with an EX ttl', async () => {
    const kv = new FakeKv();
    const a = await loadWith(kv);
    const id = a.cache.idForUrl('https://stripe.com/');
    await a.cache.cacheSet(id, { v: 1 });
    expect(kv.calls.some((c) => c === `set roast:r:${id}`)).toBe(true);
  });
});

describe('spend cap (KV path) — the money guard', () => {
  beforeEach(() => {
    process.env.DAILY_LLM_USD_CAP = '1';
  });
  afterEach(() => {
    delete process.env.DAILY_LLM_USD_CAP;
  });

  it('enforces one global cap across simulated instances', async () => {
    const kv = new FakeKv();
    const a = await loadWith(kv);
    const b = await loadWith(kv); // second "instance", same backend

    await a.spend.recordSpend(0.6);
    expect(await b.spend.hasBudget()).toBe(true); // 0.6 < 1, seen from the other instance

    await b.spend.recordSpend(0.6); // crosses the cap from the OTHER instance
    expect(await a.spend.hasBudget()).toBe(false);
    expect((await a.spend.spentToday()).usd).toBeCloseTo(1.2, 5);
    expect((await a.spend.spentToday()).calls).toBe(2);
  });

  it('increments atomically — recordSpend never read-modify-writes', async () => {
    const kv = new FakeKv();
    const a = await loadWith(kv);
    const before = kv.calls.length;
    await a.spend.recordSpend(0.4);
    const during = kv.calls.slice(before);
    expect(during.some((c) => c.startsWith('incrbyfloat '))).toBe(true);
    // No GET on the spend key during a write -> the cap can't be raced open.
    expect(during.some((c) => c.startsWith('get '))).toBe(false);
  });

  it('ignores junk amounts but still counts the call', async () => {
    const kv = new FakeKv();
    const a = await loadWith(kv);
    await a.spend.recordSpend(NaN);
    await a.spend.recordSpend(-10);
    await a.spend.recordSpend(Infinity);
    expect((await a.spend.spentToday()).usd).toBe(0);
    expect((await a.spend.spentToday()).calls).toBe(3);
  });
});

describe('counter (KV path)', () => {
  it('counts members inside the TTL window via the index', async () => {
    const kv = new FakeKv();
    const { counter } = await loadWith(kv);
    const now = 10_000_000;
    await counter.recordRoast('aaaaaaaaaaaa', now - 1000);
    await counter.recordRoast('bbbbbbbbbbbb', now - 2000);
    expect(await counter.roastCount(now)).toBe(2);
  });

  it('excludes (and prunes) entries older than the 24h count window', async () => {
    const kv = new FakeKv();
    const { counter } = await loadWith(kv);
    const now = 10_000_000_000;
    await counter.recordRoast('aaaaaaaaaaaa', now - 1000);
    await counter.recordRoast('cccccccccccc', now - (counter.COUNT_WINDOW_MS + 5000));
    expect(await counter.roastCount(now)).toBe(1);
  });

  it('still excludes a roast that is cached (inside the 90-day TTL) but older than 24h', async () => {
    const kv = new FakeKv();
    const { counter } = await loadWith(kv);
    const now = 10_000_000_000;
    await counter.recordRoast('aaaaaaaaaaaa', now - 1000);
    await counter.recordRoast('dddddddddddd', now - 3 * 24 * 60 * 60 * 1000);
    expect(await counter.roastCount(now)).toBe(1);
  });
});

describe('showcase (KV path)', () => {
  it('returns a real well-known roast from the showcase index', async () => {
    const kv = new FakeKv();
    const { showcase, cache } = await loadWith(kv);
    const id = 'aaaaaaaaaaaa';
    const r = result({ id, displayUrl: 'stripe.com', createdAt: 1000 });
    await cache.cacheSet(id, r);
    await showcase.recordShowcase(r);
    expect((await showcase.showcaseRoast())?.displayUrl).toBe('stripe.com');
  });

  it('never indexes a non-well-known site', async () => {
    const kv = new FakeKv();
    const { showcase, cache } = await loadWith(kv);
    const id = 'bbbbbbbbbbbb';
    const r = result({ id, displayUrl: 'bobs-blog.dev', url: 'https://bobs-blog.dev/' });
    await cache.cacheSet(id, r);
    await showcase.recordShowcase(r);
    expect(await showcase.showcaseRoast()).toBeNull();
  });

  it('prefers the freshest well-known roast', async () => {
    const kv = new FakeKv();
    const { showcase, cache } = await loadWith(kv);
    const older = result({ id: 'aaaaaaaaaaaa', displayUrl: 'stripe.com', createdAt: 100 });
    const newer = result({ id: 'bbbbbbbbbbbb', displayUrl: 'linear.app', createdAt: 900 });
    await cache.cacheSet(older.id, older);
    await cache.cacheSet(newer.id, newer);
    await showcase.recordShowcase(older);
    await showcase.recordShowcase(newer);
    expect((await showcase.showcaseRoast())?.id).toBe('bbbbbbbbbbbb');
  });

  it('skips an indexed roast that is no longer usable', async () => {
    const kv = new FakeKv();
    const { showcase, cache } = await loadWith(kv);
    const id = 'aaaaaaaaaaaa';
    const r = result({ id, displayUrl: 'stripe.com', verdict: '' }); // unusable
    await cache.cacheSet(id, r);
    await showcase.recordShowcase({ id, displayUrl: 'stripe.com', createdAt: r.createdAt });
    expect(await showcase.showcaseRoast()).toBeNull();
  });
});

describe('ratelimit (KV path)', () => {
  it('allows up to the per-minute limit then blocks', async () => {
    const kv = new FakeKv();
    const { ratelimit } = await loadWith(kv);
    const { PER_MINUTE } = ratelimit;
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) {
      expect((await ratelimit.rateLimit('1.2.3.4', [PER_MINUTE], t)).ok).toBe(true);
    }
    const blocked = await ratelimit.rateLimit('1.2.3.4', [PER_MINUTE], t);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('lets the window slide so the client recovers', async () => {
    const kv = new FakeKv();
    const { ratelimit } = await loadWith(kv);
    const { PER_MINUTE } = ratelimit;
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) await ratelimit.rateLimit('ip', [PER_MINUTE], t);
    expect((await ratelimit.rateLimit('ip', [PER_MINUTE], t)).ok).toBe(false);
    expect((await ratelimit.rateLimit('ip', [PER_MINUTE], t + PER_MINUTE.windowMs + 1)).ok).toBe(true);
  });

  it('enforces the hourly cap across several minute windows', async () => {
    const kv = new FakeKv();
    const { ratelimit } = await loadWith(kv);
    const { PER_MINUTE, PER_HOUR } = ratelimit;
    let t = 1_000_000;
    let allowed = 0;
    for (let i = 0; i < 100; i++) {
      if ((await ratelimit.rateLimit('ip', [PER_MINUTE, PER_HOUR], t)).ok) allowed++;
      t += 20_000;
    }
    expect(allowed).toBe(PER_HOUR.limit);
  });

  it('tracks each IP independently', async () => {
    const kv = new FakeKv();
    const { ratelimit } = await loadWith(kv);
    const { PER_MINUTE } = ratelimit;
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) await ratelimit.rateLimit('a', [PER_MINUTE], t);
    expect((await ratelimit.rateLimit('a', [PER_MINUTE], t)).ok).toBe(false);
    expect((await ratelimit.rateLimit('b', [PER_MINUTE], t)).ok).toBe(true);
  });

  it('reports remaining against the tightest rule', async () => {
    const kv = new FakeKv();
    const { ratelimit } = await loadWith(kv);
    const { PER_MINUTE, PER_HOUR } = ratelimit;
    const first = await ratelimit.rateLimit('ip', [PER_MINUTE, PER_HOUR], 1_000_000);
    expect(first.remaining).toBe(PER_MINUTE.limit - 1);
  });
});
