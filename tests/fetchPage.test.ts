import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the SSRF layer so fetchPage can be driven without real DNS. Defined via
// vi.hoisted so the mock factory (which is hoisted above imports) can see them.
// The BlockedUrlError here is the exact class fetchPage will `instanceof`.
const { assertFetchableUrl, BlockedUrlError } = vi.hoisted(() => {
  class BlockedUrlError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BlockedUrlError';
    }
  }
  return { assertFetchableUrl: vi.fn(async (u: string) => new URL(u)), BlockedUrlError };
});
vi.mock('@/lib/ssrf', () => ({ assertFetchableUrl, BlockedUrlError }));

import { fetchPage, FetchPageError, MAX_BODY_BYTES } from '@/lib/fetchPage';

const fetchMock = vi.fn();

beforeEach(() => {
  assertFetchableUrl.mockReset();
  assertFetchableUrl.mockImplementation(async (u: string) => new URL(u));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchPage error handling', () => {
  it('reads an HTML page', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html><body>hello there, lots of words here</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    const page = await fetchPage('https://site.test/');
    expect(page.html).toContain('hello there');
    expect(page.truncated).toBe(false);
  });

  it('rejects a non-HTML content-type (PDF/JSON/image) with a friendly error', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await expect(fetchPage('https://site.test/')).rejects.toBeInstanceOf(FetchPageError);
    await expect(fetchPage('https://site.test/')).rejects.toThrow(/not a web page/);
  });

  it('rejects an oversized declared content-length', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>small</html>', {
        status: 200,
        headers: { 'content-type': 'text/html', 'content-length': String(MAX_BODY_BYTES * 4 + 1) },
      }),
    );
    await expect(fetchPage('https://site.test/')).rejects.toThrow(/enormous/);
  });

  it('surfaces a bot-block (403) as a friendly "couldn\'t read that site", not a crash', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
    await expect(fetchPage('https://bigsite.test/')).rejects.toBeInstanceOf(FetchPageError);
    await expect(fetchPage('https://bigsite.test/')).rejects.toThrow(/blocking bots/);
  });

  it('rejects an empty body', async () => {
    fetchMock.mockResolvedValue(
      new Response('   ', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    await expect(fetchPage('https://site.test/')).rejects.toThrow(/empty/);
  });

  it('rejects a redirect that lands on an SSRF-blocked host', async () => {
    assertFetchableUrl.mockImplementation(async (u: string) => {
      if (u.includes('blocked')) throw new BlockedUrlError('That address is not a public website.');
      return new URL(u);
    });
    fetchMock.mockResolvedValue(
      new Response(null, { status: 301, headers: { location: 'https://blocked.internal/' } }),
    );
    await expect(fetchPage('https://start.test/')).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it('maps a network failure to a friendly error', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(fetchPage('https://site.test/')).rejects.toThrow(/couldn't reach that site/);
  });

  it('maps a timeout/abort to a friendly "took too long"', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_u: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );
    const p = fetchPage('https://slow.test/');
    const assertion = expect(p).rejects.toThrow(/took too long/);
    await vi.advanceTimersByTimeAsync(8_001);
    await assertion;
  });
});
