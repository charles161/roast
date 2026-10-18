import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeKv } from './helpers/fakeKv';
import type { RoastResult } from '@/lib/types';

/**
 * Durable id -> URL pointer. `idForUrl` is a one-way hash and the result has a
 * 90-day TTL, so without this a shared /r/<id> link dies the day the result
 * expires. The pointer is a tiny string with NO expiry, written whenever a
 * result is cached, and is what lets /r/<id> regenerate the roast on a miss.
 */

const URL_ = 'https://stripe.com/';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roast-ptr-'));
  process.env.ROAST_CACHE_DIR = dir;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.ROAST_CACHE_DIR;
  vi.restoreAllMocks();
});

/** Fresh module instance == a fresh process / serverless instance. */
async function load(kv?: FakeKv | null) {
  vi.resetModules();
  if (kv !== undefined) (await import('@/lib/kv')).__setKvForTests(kv);
  return import('@/lib/cache');
}

function result(url = URL_, id?: string): RoastResult {
  return {
    id: id ?? 'will-be-set',
    url,
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
  };
}

describe('urlForId (disk mode)', () => {
  it('returns the normalized URL after a result is cached', async () => {
    const cache = await load();
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, result(URL_, id));
    expect(await cache.urlForId(id)).toBe(URL_);
  });

  it('returns null for an unknown id', async () => {
    const cache = await load();
    expect(await cache.urlForId('abcdefghijkl')).toBeNull();
  });

  it.each(['', 'short', '../../etc/passwd', 'abc/def/ghij', 'a'.repeat(13)])(
    'returns null for the malformed id %j without touching disk',
    async (bad) => {
      const cache = await load();
      expect(await cache.urlForId(bad)).toBeNull();
    },
  );

  it('outlives the result: the pointer still resolves after the result expires', async () => {
    const cache = await load();
    const id = cache.idForUrl(URL_);
    const t0 = 1_000_000;
    await cache.cacheSet(id, result(URL_, id), t0);

    expect(await cache.cacheGet(id, t0 + 1000)).not.toBeNull();
    // Past the TTL: the result is gone (and its file is reaped)...
    expect(await cache.cacheGet(id, t0 + cache.TTL_MS + 1000)).toBeNull();
    // ...but the link can still be healed.
    expect(await cache.urlForId(id)).toBe(URL_);
  });

  it('outlives the result being evicted outright', async () => {
    const cache = await load();
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, result(URL_, id));
    fs.rmSync(path.join(dir, 'results'), { recursive: true, force: true });
    vi.resetModules(); // empty LRU too
    const cold = await import('@/lib/cache');
    expect(await cold.cacheGet(id)).toBeNull();
    expect(await cold.urlForId(id)).toBe(URL_);
  });

  it('survives a restart (new process, same cache dir)', async () => {
    const first = await load();
    const id = first.idForUrl(URL_);
    await first.cacheSet(id, result(URL_, id));
    const second = await load();
    expect(await second.urlForId(id)).toBe(URL_);
  });

  it('is rewritten on a fresh re-roast of the same URL (cacheSet again)', async () => {
    const cache = await load();
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, result(URL_, id));
    await cache.cacheSet(id, { ...result(URL_, id), verdict: 'newer' });
    expect(await cache.urlForId(id)).toBe(URL_);
  });

  it('writes no pointer for a value that is not a result (no url)', async () => {
    const cache = await load();
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, { hello: 'world' });
    expect(await cache.cacheGet(id)).toEqual({ hello: 'world' });
    expect(await cache.urlForId(id)).toBeNull();
  });

  it('refuses a pointer whose URL does not hash to the id (a healed link must keep its id)', async () => {
    const cache = await load();
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, result('https://evil.example/', id));
    expect(await cache.urlForId(id)).toBeNull();
    await cache.rememberUrl(id, 'https://evil.example/');
    expect(await cache.urlForId(id)).toBeNull();
  });

  it('refuses non-http(s) URLs', async () => {
    const cache = await load();
    const bad = 'javascript:alert(1)';
    const id = cache.idForUrl(bad);
    await cache.rememberUrl(id, bad);
    expect(await cache.urlForId(id)).toBeNull();
  });

  it('ignores a corrupt or tampered pointer file', async () => {
    const cache = await load();
    const id = cache.idForUrl(URL_);
    await cache.rememberUrl(id, URL_);
    const files = fs.readdirSync(path.join(dir, 'urls'));
    expect(files).toHaveLength(1);
    fs.writeFileSync(path.join(dir, 'urls', files[0]!), 'https://evil.example/', 'utf8');
    expect(await cache.urlForId(id)).toBeNull();
    fs.writeFileSync(path.join(dir, 'urls', files[0]!), '', 'utf8');
    expect(await cache.urlForId(id)).toBeNull();
  });

  it('__clearCache resets the pointers too (test isolation)', async () => {
    const cache = await load();
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, result(URL_, id));
    await cache.__clearCache();
    expect(await cache.urlForId(id)).toBeNull();
  });

  it('a pointer I/O failure never breaks caching the result', async () => {
    const cache = await load();
    const id = cache.idForUrl(URL_);
    // A FILE where the pointer directory should be: every pointer write fails.
    fs.writeFileSync(path.join(dir, 'urls'), 'not a directory', 'utf8');
    await expect(cache.cacheSet(id, result(URL_, id))).resolves.toBeUndefined();
    expect((await cache.cacheGet<RoastResult>(id))?.verdict).toBe('A verdict.');
    expect(await cache.urlForId(id)).toBeNull();
  });
});

describe('urlForId (KV mode)', () => {
  it('stores roast:u:<id> with NO expiry, while the result keeps its TTL', async () => {
    const kv = new FakeKv();
    const cache = await load(kv);
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, result(URL_, id));

    expect(kv.setOpts.has(`roast:u:${id}`)).toBe(true);
    expect(kv.setOpts.get(`roast:u:${id}`)).toBeUndefined(); // no `ex` => permanent
    expect(kv.setOpts.get(`roast:r:${id}`)?.ex).toBe(Math.ceil(cache.TTL_MS / 1000));
    expect(await kv.get(`roast:u:${id}`)).toBe(URL_); // a tiny plain string
  });

  it('is visible to a second instance sharing the same Redis', async () => {
    const kv = new FakeKv();
    const a = await load(kv);
    const id = a.idForUrl(URL_);
    await a.cacheSet(id, result(URL_, id));
    const b = await load(kv);
    expect(await b.urlForId(id)).toBe(URL_);
  });

  it('outlives the result key (simulated Redis expiry of roast:r:<id>)', async () => {
    const kv = new FakeKv();
    const cache = await load(kv);
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, result(URL_, id));
    await kv.del(`roast:r:${id}`); // what the TTL does after 90 days

    const cold = await load(kv);
    expect(await cold.cacheGet(id)).toBeNull();
    expect(await cold.urlForId(id)).toBe(URL_);
  });

  it('returns null for an unknown id, and for a mismatching stored value', async () => {
    const kv = new FakeKv();
    const cache = await load(kv);
    expect(await cache.urlForId('abcdefghijkl')).toBeNull();
    await kv.set('roast:u:abcdefghijkl', 'https://evil.example/');
    expect(await cache.urlForId('abcdefghijkl')).toBeNull();
    await kv.set('roast:u:abcdefghijkl', { not: 'a string' });
    expect(await cache.urlForId('abcdefghijkl')).toBeNull();
  });

  it('a KV failure on the pointer never breaks caching the result', async () => {
    const kv = new FakeKv();
    const realSet = kv.set.bind(kv);
    kv.set = async (key, value, opts) => {
      if (key.startsWith('roast:u:')) throw new Error('kv blip');
      return realSet(key, value, opts);
    };
    const cache = await load(kv);
    const id = cache.idForUrl(URL_);
    await expect(cache.cacheSet(id, result(URL_, id))).resolves.toBeUndefined();
    expect((await cache.cacheGet<RoastResult>(id))?.verdict).toBe('A verdict.');
  });

  it('a KV failure on the lookup is a clean null, not a throw', async () => {
    const kv = new FakeKv();
    const cache = await load(kv);
    kv.get = async () => {
      throw new Error('kv blip');
    };
    await expect(cache.urlForId('abcdefghijkl')).resolves.toBeNull();
  });

  it('__clearCache purges the pointers this instance wrote', async () => {
    const kv = new FakeKv();
    const cache = await load(kv);
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, result(URL_, id));
    await cache.__clearCache();
    expect(await kv.get(`roast:u:${id}`)).toBeNull();
  });
});

describe('backfillUrl (results cached before pointers existed)', () => {
  it('writes the pointer for a legacy result, once per instance', async () => {
    const kv = new FakeKv();
    const cache = await load(kv);
    const id = cache.idForUrl(URL_);
    await kv.set(`roast:r:${id}`, { value: result(URL_, id), expires: Date.now() + 1e9 });
    expect(await cache.urlForId(id)).toBeNull();

    await cache.backfillUrl(result(URL_, id));
    expect(await cache.urlForId(id)).toBe(URL_);

    const writes = () => kv.calls.filter((c) => c === `set roast:u:${id}`).length;
    expect(writes()).toBe(1);
    await cache.backfillUrl(result(URL_, id));
    await cache.backfillUrl(result(URL_, id));
    expect(writes()).toBe(1); // deduped: a cache-hit storm is not a write storm
  });

  it('never throws, even for a junk value', async () => {
    const cache = await load();
    await expect(cache.backfillUrl(null)).resolves.toBeUndefined();
    await expect(cache.backfillUrl({ url: 5 })).resolves.toBeUndefined();
    await expect(cache.backfillUrl({ url: 'https://x.test/' })).resolves.toBeUndefined();
  });
});
