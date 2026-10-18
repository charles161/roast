import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoastResult } from '@/lib/types';

/**
 * POST /api/roast — the optional `fresh` flag. Only the JSON boolean `true`
 * counts; everything else (missing, "yes", 1, "true", {}) is a normal roast.
 * The rate limiter runs BEFORE the pipeline, so fresh cannot be used to get
 * past 10/min.
 */

function result(): RoastResult {
  return {
    id: 'abcdefghijkl',
    url: 'https://stripe.com/',
    displayUrl: 'stripe.com',
    siteName: 'Stripe',
    favicon: '',
    createdAt: 2000,
    score: { overall: 77, subs: [{ key: 'hero', label: 'Hero', score: 70, reason: 'r' }] },
    roast: ['A line.'],
    verdict: 'A verdict.',
    before: { headline: 'b', subhead: 'b', cta: 'b' },
    after: { headline: 'a', subhead: 'a', cta: 'a' },
    fixes: ['one', 'two', 'three'],
  };
}

const roastUrl = vi.fn();
const getCached = vi.fn();
const rateLimit = vi.fn();
const captureServer = vi.fn(async () => {});

async function post(body: unknown, raw?: string) {
  const { POST } = await import('@/app/api/roast/route');
  return POST(
    new Request('http://localhost/api/roast', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.resetModules();
  roastUrl.mockReset().mockResolvedValue({ result: result(), cached: false, costUsd: 0.01 });
  getCached.mockReset();
  rateLimit.mockReset().mockResolvedValue({ ok: true, retryAfterSec: 0, remaining: 9 });
  captureServer.mockClear();
  vi.doMock('@/lib/pipeline', async () => ({
    ...(await vi.importActual<typeof import('@/lib/pipeline')>('@/lib/pipeline')),
    roastUrl,
    getCached,
  }));
  vi.doMock('@/lib/ratelimit', async () => ({
    ...(await vi.importActual<typeof import('@/lib/ratelimit')>('@/lib/ratelimit')),
    rateLimit,
  }));
  vi.doMock('@/lib/analytics', () => ({ captureServer }));
});

function freshArg(): unknown {
  const call = roastUrl.mock.calls[0] as [string, { fresh?: boolean } | undefined];
  return call[1]?.fresh;
}

describe('POST /api/roast fresh flag', () => {
  it('passes fresh:true through to the pipeline', async () => {
    const res = await post({ url: 'stripe.com', fresh: true });
    expect(res.status).toBe(200);
    expect(roastUrl).toHaveBeenCalledTimes(1);
    expect(roastUrl.mock.calls[0]![0]).toBe('https://stripe.com/');
    expect(freshArg()).toBe(true);
    expect(res.headers.get('x-roast-cache')).toBe('miss');
  });

  it('a plain { url } is NOT fresh', async () => {
    const res = await post({ url: 'stripe.com' });
    expect(res.status).toBe(200);
    expect(roastUrl).toHaveBeenCalledTimes(1);
    expect(freshArg()).not.toBe(true);
    expect(Boolean(freshArg())).toBe(false);
  });

  it.each([
    ['"yes"', 'yes'],
    ['1', 1],
    ['"true"', 'true'],
    ['"1"', '1'],
    ['{}', {}],
    ['[]', []],
    ['null', null],
    ['false', false],
    ['0', 0],
  ])('fresh: %s is NOT fresh (only boolean true counts)', async (_label, value) => {
    const res = await post({ url: 'stripe.com', fresh: value });
    expect(res.status).toBe(200);
    expect(roastUrl).toHaveBeenCalledTimes(1);
    expect(Boolean(freshArg())).toBe(false);
  });

  it('rate limiter runs first: a limited fresh request 429s and never reaches the pipeline', async () => {
    rateLimit.mockResolvedValue({ ok: false, retryAfterSec: 42, remaining: 0 });
    const res = await post({ url: 'stripe.com', fresh: true });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
    expect(((await res.json()) as { code: string }).code).toBe('rate');
    expect(rateLimit).toHaveBeenCalledTimes(1);
    expect(roastUrl).not.toHaveBeenCalled();
  });

  it('a fresh request spends one rate-limit hit, same as any other', async () => {
    await post({ url: 'stripe.com', fresh: true });
    await post({ url: 'stripe.com' });
    expect(rateLimit).toHaveBeenCalledTimes(2);
  });

  it('a capped fresh re-roast surfaces the normal capped error (503)', async () => {
    const { CappedError } = await import('@/lib/pipeline');
    roastUrl.mockRejectedValue(new CappedError());
    const res = await post({ url: 'stripe.com', fresh: true });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe('capped');
  });

  it('bad input is still rejected before anything else, fresh or not', async () => {
    const res = await post({ url: 'not a url!!', fresh: true });
    expect(res.status).toBe(400);
    expect(rateLimit).not.toHaveBeenCalled();
    expect(roastUrl).not.toHaveBeenCalled();
  });

  it('a body that is not JSON still 400s', async () => {
    const res = await post(undefined, 'nope');
    expect(res.status).toBe(400);
    expect(roastUrl).not.toHaveBeenCalled();
  });
});

describe('GET /api/roast?id= is untouched', () => {
  it('hydrates from cache without ever calling the pipeline', async () => {
    getCached.mockResolvedValue(result());
    const { GET } = await import('@/app/api/roast/route');
    const res = await GET(new Request('http://localhost/api/roast?id=abcdefghijkl&fresh=true'));
    expect(res.status).toBe(200);
    expect(roastUrl).not.toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=3600');
  });
});
