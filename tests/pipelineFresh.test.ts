import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeKv } from './helpers/fakeKv';
import type { RoastResult } from '@/lib/types';

/**
 * roastUrl(url, { fresh }) — the explicit re-roast.
 *
 * The share-link id IS the URL hash, so one cache entry serves both /r/<id> and
 * de-dup. Default stays "cache hit wins" (cost protection under the viral
 * blast); `fresh` skips ONLY that short-circuit. The spend cap still applies,
 * and the new result overwrites the SAME id so the share link updates.
 */

const URL_ = 'https://stripe.com/';

const HTML = `<!doctype html><html><head>
<title>Stripe | Financial Infrastructure to Grow Your Revenue</title>
<meta name="description" content="Millions of companies of all sizes use Stripe to accept payments and manage their businesses online.">
</head><body><h1>Financial infrastructure to grow your revenue</h1>
<p>Millions of companies use Stripe to accept payments, grow revenue, and accelerate new business opportunities online.</p>
<a href="/start">Start now</a></body></html>`;

function stale(id: string): RoastResult {
  return {
    id,
    url: URL_,
    displayUrl: 'stripe.com',
    siteName: 'Stripe',
    favicon: '',
    createdAt: 1000,
    score: { overall: 41, subs: [{ key: 'hero', label: 'Hero', score: 40, reason: 'old' }] },
    roast: ['STALE roast line.'],
    verdict: 'STALE verdict.',
    before: { headline: 'old', subhead: 'old', cta: 'old' },
    after: { headline: 'old after', subhead: 'old after', cta: 'old after' },
    fixes: ['one', 'two', 'three'],
  };
}

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roast-fresh-'));
  process.env.ROAST_CACHE_DIR = dir;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.ROAST_CACHE_DIR;
  vi.restoreAllMocks();
});

/** Fresh module graph with the LLM/network edges mocked; cache/counter/showcase are real. */
async function load(opts: { budget?: boolean; kv?: FakeKv | null } = {}) {
  vi.resetModules();
  const fetchPage = vi.fn(async () => ({ finalUrl: URL_, html: HTML, truncated: false }));
  const writeRoast = vi.fn(async () => ({
    roast: ['FRESH roast line.'],
    glowup: { headline: 'fresh h', subhead: 'fresh s', cta: 'fresh c' },
    fixes: ['f1', 'f2', 'f3'],
    reasons: { hero: 'r', specificity: 'r', trust: 'r', craft: 'r', cta: 'r' },
    verdict: 'FRESH verdict.',
    fixPrompt: 'Do the thing.',
  }));
  const scorePage = vi.fn(async () => ({
    overall: 77,
    subs: { hero: 70, specificity: 70, trust: 80, craft: 80, cta: 70 },
    audience: 'devs',
    buzzwordy: 0,
  }));
  const hasBudget = vi.fn(async () => opts.budget ?? true);

  vi.doMock('@/lib/fetchPage', async () => ({
    ...(await vi.importActual<typeof import('@/lib/fetchPage')>('@/lib/fetchPage')),
    fetchPage,
  }));
  vi.doMock('@/lib/roast', async () => ({
    ...(await vi.importActual<typeof import('@/lib/roast')>('@/lib/roast')),
    writeRoast,
  }));
  vi.doMock('@/lib/score', async () => ({
    ...(await vi.importActual<typeof import('@/lib/score')>('@/lib/score')),
    scorePage,
  }));
  vi.doMock('@/lib/spend', async () => ({
    ...(await vi.importActual<typeof import('@/lib/spend')>('@/lib/spend')),
    hasBudget,
  }));

  if (opts.kv) (await import('@/lib/kv')).__setKvForTests(opts.kv);

  const pipeline = await import('@/lib/pipeline');
  const cache = await import('@/lib/cache');
  return { pipeline, cache, fetchPage, writeRoast, scorePage, hasBudget };
}

describe('roastUrl default (no fresh) — unchanged', () => {
  it('returns the cached roast with cached:true and does no work', async () => {
    const { pipeline, cache, fetchPage, writeRoast, scorePage, hasBudget } = await load();
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, stale(id));

    const out = await pipeline.roastUrl(URL_);

    expect(out.cached).toBe(true);
    expect(out.costUsd).toBe(0);
    expect(out.result.verdict).toBe('STALE verdict.');
    expect(fetchPage).not.toHaveBeenCalled();
    expect(scorePage).not.toHaveBeenCalled();
    expect(writeRoast).not.toHaveBeenCalled();
    expect(hasBudget).not.toHaveBeenCalled();
  });

  it.each([[undefined], [{}], [{ fresh: false }]])(
    'treats opts=%j exactly like no opts',
    async (opts) => {
      const { pipeline, cache, fetchPage } = await load();
      const id = cache.idForUrl(URL_);
      await cache.cacheSet(id, stale(id));

      const out = await pipeline.roastUrl(URL_, opts);

      expect(out.cached).toBe(true);
      expect(out.result.verdict).toBe('STALE verdict.');
      expect(fetchPage).not.toHaveBeenCalled();
    },
  );

  it('still generates and caches on a miss', async () => {
    const { pipeline, cache, fetchPage, writeRoast } = await load();
    const id = cache.idForUrl(URL_);

    const out = await pipeline.roastUrl(URL_);

    expect(out.cached).toBe(false);
    expect(out.result.id).toBe(id);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(writeRoast).toHaveBeenCalledTimes(1);
    expect((await cache.cacheGet<RoastResult>(id))?.verdict).toBe('FRESH verdict.');
  });
});

describe('roastUrl({ fresh: true })', () => {
  it('bypasses a seeded cache entry, regenerates, overwrites the same id, returns cached:false', async () => {
    const { pipeline, cache, fetchPage, writeRoast } = await load();
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, stale(id));

    const out = await pipeline.roastUrl(URL_, { fresh: true });

    expect(out.cached).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(writeRoast).toHaveBeenCalledTimes(1);
    expect(out.result.id).toBe(id); // same id => the existing /r/<id> link updates
    expect(out.result.verdict).toBe('FRESH verdict.');
    expect(out.result.score.overall).toBe(77);

    // The cache entry behind the share link now holds the fresh roast.
    const stored = await cache.cacheGet<RoastResult>(id);
    expect(stored?.verdict).toBe('FRESH verdict.');
    expect(stored?.roast).toEqual(['FRESH roast line.']);
    expect(stored?.createdAt).toBeGreaterThan(1000);

    // ...and the overwrite is what a later default roast / share view sees.
    const again = await pipeline.roastUrl(URL_);
    expect(again.cached).toBe(true);
    expect(again.result.verdict).toBe('FRESH verdict.');
    expect((await pipeline.getCached(id))?.verdict).toBe('FRESH verdict.');
  });

  it('survives a cold in-memory LRU (overwrites what is on disk, not just in memory)', async () => {
    const first = await load();
    const id = first.cache.idForUrl(URL_);
    await first.cache.cacheSet(id, stale(id));
    await first.pipeline.roastUrl(URL_, { fresh: true });

    // New "process": empty LRU, so this can only be answered from disk.
    const second = await load();
    expect((await second.cache.cacheGet<RoastResult>(id))?.verdict).toBe('FRESH verdict.');
  });

  it('does NOT bypass the spend cap: throws CappedError, touches nothing', async () => {
    const { pipeline, cache, fetchPage, writeRoast, hasBudget } = await load({ budget: false });
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, stale(id));

    await expect(pipeline.roastUrl(URL_, { fresh: true })).rejects.toBeInstanceOf(
      pipeline.CappedError,
    );

    expect(hasBudget).toHaveBeenCalledTimes(1);
    expect(fetchPage).not.toHaveBeenCalled();
    expect(writeRoast).not.toHaveBeenCalled();
    // The old roast is still there: a capped re-roast must never destroy the share link.
    expect((await cache.cacheGet<RoastResult>(id))?.verdict).toBe('STALE verdict.');
  });

  it('keeps the old roast if the regeneration fails midway', async () => {
    const { pipeline, cache, writeRoast } = await load();
    const id = cache.idForUrl(URL_);
    await cache.cacheSet(id, stale(id));
    writeRoast.mockRejectedValueOnce(new Error('llm down'));

    await expect(pipeline.roastUrl(URL_, { fresh: true })).rejects.toThrow('llm down');
    expect((await cache.cacheGet<RoastResult>(id))?.verdict).toBe('STALE verdict.');
  });

  it('is a normal generate when nothing is cached yet', async () => {
    const { pipeline, cache } = await load();
    const id = cache.idForUrl(URL_);
    const out = await pipeline.roastUrl(URL_, { fresh: true });
    expect(out.cached).toBe(false);
    expect((await cache.cacheGet<RoastResult>(id))?.verdict).toBe('FRESH verdict.');
  });
});

describe('roastUrl({ fresh: true }) — counters (KV mode)', () => {
  it('re-adding the same id to the 24h index / showcase refreshes it, never double-counts', async () => {
    const kv = new FakeKv();
    const { pipeline, cache } = await load({ kv });
    const counter = await import('@/lib/counter');
    const id = cache.idForUrl(URL_);

    await pipeline.roastUrl(URL_); // first-ever roast: indexed once
    await pipeline.roastUrl(URL_, { fresh: true }); // re-roast: same member, new score
    await pipeline.roastUrl(URL_, { fresh: true });

    expect(await counter.roastCount()).toBe(1);
    expect(await kv.zrange('roast:idx', 0, -1)).toEqual([id]);
    // stripe.com is a showcase domain: still exactly one member after re-roasts.
    expect(await kv.zrange('roast:showcase', 0, -1)).toEqual([id]);
  });
});

describe('result.url round-trips through the normalizer (the Re-roast button re-submits it)', () => {
  it.each([
    'https://stripe.com/',
    'https://www.linear.app/changelog?x=1',
    'http://example.com/a/b/',
    'https://sub.example.co.uk/path#frag',
  ])('idForUrl(normalizeUrl(%s)) is stable', async (u) => {
    const { normalizeUrl } = await import('@/lib/url');
    const { idForUrl } = await import('@/lib/cache');
    const once = normalizeUrl(u);
    expect(normalizeUrl(once)).toBe(once);
    expect(idForUrl(normalizeUrl(once))).toBe(idForUrl(once));
  });
});

describe('durable URL pointer (self-healing share links)', () => {
  it('a normal miss leaves a pointer behind', async () => {
    const { pipeline, cache } = await load();
    const id = cache.idForUrl(URL_);
    expect(await cache.urlForId(id)).toBeNull();
    await pipeline.roastUrl(URL_);
    expect(await cache.urlForId(id)).toBe(URL_);
  });

  it('a fresh re-roast writes the pointer too', async () => {
    const { pipeline, cache } = await load();
    const id = cache.idForUrl(URL_);
    await pipeline.roastUrl(URL_, { fresh: true });
    expect(await cache.urlForId(id)).toBe(URL_);
  });

  it('heals after real eviction: normal roast of the pointer URL regenerates and re-caches the id', async () => {
    const { pipeline, cache } = await load();
    const id = cache.idForUrl(URL_);
    await pipeline.roastUrl(URL_);
    // Evict only the result, as the TTL does; keep the pointer. A new load() is
    // a cold process: empty LRU, its own LLM/network mocks.
    fs.rmSync(path.join(dir, 'results'), { recursive: true, force: true });
    const cold = await load();
    expect(await cold.pipeline.getCached(id)).toBeNull();

    const url = await cold.cache.urlForId(id);
    expect(url).toBe(URL_);
    const out = await cold.pipeline.roastUrl(url!);
    expect(out.cached).toBe(false);
    expect(out.result.id).toBe(id);
    expect((await cold.pipeline.getCached(id))?.verdict).toBe('FRESH verdict.');
    expect(cold.fetchPage).toHaveBeenCalledTimes(1);
    expect(cold.writeRoast).toHaveBeenCalledTimes(1);
  });

  it('a cache HIT backfills the pointer for a legacy result (once)', async () => {
    const kv = new FakeKv();
    const { pipeline, cache } = await load({ kv });
    const id = cache.idForUrl(URL_);
    // A result cached before pointers existed: write the result key directly.
    await kv.set(`roast:r:${id}`, { value: stale(id), expires: Date.now() + 1e9 });
    expect(await cache.urlForId(id)).toBeNull();

    await pipeline.roastUrl(URL_);
    expect(await cache.urlForId(id)).toBe(URL_);

    await pipeline.roastUrl(URL_);
    await pipeline.getCached(id);
    expect(kv.calls.filter((c) => c === `set roast:u:${id}`)).toHaveLength(1);
  });

  it('getCached on a legacy result backfills the pointer (the /r/<id> and OG paths)', async () => {
    const kv = new FakeKv();
    const { pipeline, cache } = await load({ kv });
    const id = cache.idForUrl(URL_);
    await kv.set(`roast:r:${id}`, { value: stale(id), expires: Date.now() + 1e9 });
    await pipeline.getCached(id);
    expect(await cache.urlForId(id)).toBe(URL_);
  });

  it('getCached on a miss does nothing and returns null', async () => {
    const kv = new FakeKv();
    const { pipeline } = await load({ kv });
    expect(await pipeline.getCached('abcdefghijkl')).toBeNull();
    expect(kv.calls.some((c) => c.startsWith('set '))).toBe(false);
  });
});
