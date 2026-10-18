import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __clearFaviconMemo, faviconDataUri } from '@/lib/favicon';
import { BlockedUrlError, type FetchTarget } from '@/lib/ssrf';
import type { PinnedResponse } from '@/lib/pinnedFetch';

type Hop = { status?: number; headers?: Record<string, string>; body?: Buffer };

function fakeResponse({ status = 200, headers = {}, body = Buffer.alloc(0) }: Hop): PinnedResponse {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;
  async function* gen() {
    if (body.byteLength) yield body;
  }
  return {
    status,
    getHeader: (name: string) => h[name.toLowerCase()],
    body: gen() as any,
    destroy: () => {},
  };
}

const pinningResolver = (ip = '93.184.216.34', block?: RegExp) =>
  vi.fn(async (urlStr: string): Promise<FetchTarget> => {
    if (block && block.test(urlStr)) throw new BlockedUrlError('That address is not a public website.');
    return { url: new URL(urlStr), addresses: [ip] };
  });

beforeEach(() => __clearFaviconMemo());

describe('faviconDataUri (pinned, SSRF-guarded)', () => {
  it('returns a base64 data URI for an allowed image, pinned to the validated IP', async () => {
    const resolveTarget = pinningResolver('93.184.216.34');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const transport = vi.fn(async (_t: FetchTarget) =>
      fakeResponse({ headers: { 'content-type': 'image/png' }, body: png }),
    );
    const uri = await faviconDataUri('https://site.test/favicon.png', { resolveTarget, transport });
    expect(uri).toBe(`data:image/png;base64,${png.toString('base64')}`);
    expect(transport.mock.calls[0]![0].addresses).toEqual(['93.184.216.34']);
  });

  it('returns null for a disallowed content-type (e.g. SVG/HTML)', async () => {
    const resolveTarget = pinningResolver();
    const transport = vi.fn(async () =>
      fakeResponse({ headers: { 'content-type': 'image/svg+xml' }, body: Buffer.from('<svg/>') }),
    );
    expect(await faviconDataUri('https://site.test/icon.svg', { resolveTarget, transport })).toBeNull();
  });

  it('returns null on a redirect (favicons are never followed across hops)', async () => {
    const resolveTarget = pinningResolver();
    const transport = vi.fn(async () =>
      fakeResponse({ status: 302, headers: { location: 'https://cdn.test/icon.png' } }),
    );
    expect(await faviconDataUri('https://site.test/favicon.ico', { resolveTarget, transport })).toBeNull();
  });

  it('returns null when the image exceeds the size cap', async () => {
    const resolveTarget = pinningResolver();
    const huge = Buffer.alloc(192 * 1024 + 1, 0x41);
    const transport = vi.fn(async () =>
      fakeResponse({ headers: { 'content-type': 'image/png' }, body: huge }),
    );
    expect(await faviconDataUri('https://site.test/huge.png', { resolveTarget, transport })).toBeNull();
  });

  it('returns null (never throws) when the host is SSRF-blocked', async () => {
    const resolveTarget = pinningResolver('93.184.216.34', /internal|169\.254/);
    const transport = vi.fn();
    expect(
      await faviconDataUri('https://metadata.internal/favicon.png', { resolveTarget, transport }),
    ).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });
});
