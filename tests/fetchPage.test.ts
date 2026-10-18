import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPage, FetchPageError, MAX_BODY_BYTES } from '@/lib/fetchPage';
import { BlockedUrlError } from '@/lib/ssrf';
import type { FetchTarget } from '@/lib/ssrf';
import type { PinnedResponse } from '@/lib/pinnedFetch';

/**
 * fetchPage is driven entirely through injected deps so tests never touch real
 * DNS or the network. `resolveTarget` stands in for the SSRF resolve+validate
 * step (returning the already-validated, pinned IPs); `transport` stands in for
 * the pinned HTTP(S) connection.
 */

type Hop = { status?: number; headers?: Record<string, string>; body?: string };

function fakeResponse({ status = 200, headers = {}, body = '' }: Hop): PinnedResponse {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;
  async function* gen() {
    if (body) yield Buffer.from(body);
  }
  return {
    status,
    getHeader: (name: string) => h[name.toLowerCase()],
    body: gen() as any,
    destroy: () => {},
  };
}

/** A resolver that pins every host to one public IP (unless `block` matches). */
function resolverPinning(ip = '93.184.216.34', block?: RegExp) {
  return vi.fn(async (urlStr: string): Promise<FetchTarget> => {
    if (block && block.test(urlStr)) {
      throw new BlockedUrlError('That address is not a public website.');
    }
    return { url: new URL(urlStr), addresses: [ip] };
  });
}

afterEach(() => vi.useRealTimers());

describe('fetchPage error handling', () => {
  it('reads an HTML page and pins the connection to the validated IP', async () => {
    const resolveTarget = resolverPinning('93.184.216.34');
    const transport = vi.fn(async (t: FetchTarget) =>
      fakeResponse({ headers: { 'content-type': 'text/html' }, body: '<html><body>hello there, lots of words here</body></html>' }),
    );
    const page = await fetchPage('https://site.test/', { resolveTarget, transport });
    expect(page.html).toContain('hello there');
    expect(page.truncated).toBe(false);
    // The connection was handed exactly the validated address — not the hostname.
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![0].addresses).toEqual(['93.184.216.34']);
    expect(resolveTarget).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-HTML content-type (PDF/JSON/image) with a friendly error', async () => {
    const resolveTarget = resolverPinning();
    const transport = vi.fn(async () =>
      fakeResponse({ headers: { 'content-type': 'application/json' }, body: '{"a":1}' }),
    );
    await expect(fetchPage('https://site.test/', { resolveTarget, transport })).rejects.toBeInstanceOf(
      FetchPageError,
    );
    await expect(fetchPage('https://site.test/', { resolveTarget, transport })).rejects.toThrow(
      /not a web page/,
    );
  });

  it('rejects an oversized declared content-length', async () => {
    const resolveTarget = resolverPinning();
    const transport = vi.fn(async () =>
      fakeResponse({
        headers: { 'content-type': 'text/html', 'content-length': String(MAX_BODY_BYTES * 4 + 1) },
        body: '<html>small</html>',
      }),
    );
    await expect(fetchPage('https://site.test/', { resolveTarget, transport })).rejects.toThrow(
      /enormous/,
    );
  });

  it('truncates a body that exceeds the 2MB cap and flags it', async () => {
    const resolveTarget = resolverPinning();
    const big = 'a'.repeat(MAX_BODY_BYTES + 500);
    const transport = vi.fn(async () =>
      fakeResponse({ headers: { 'content-type': 'text/html' }, body: big }),
    );
    const page = await fetchPage('https://site.test/', { resolveTarget, transport });
    expect(page.truncated).toBe(true);
    expect(page.html.length).toBe(MAX_BODY_BYTES);
  });

  it('surfaces a bot-block (403) as a friendly "blocking bots" error, not a crash', async () => {
    const resolveTarget = resolverPinning();
    const transport = vi.fn(async () => fakeResponse({ status: 403, body: 'nope' }));
    await expect(fetchPage('https://bigsite.test/', { resolveTarget, transport })).rejects.toBeInstanceOf(
      FetchPageError,
    );
    await expect(fetchPage('https://bigsite.test/', { resolveTarget, transport })).rejects.toThrow(
      /blocking bots/,
    );
  });

  it('rejects an empty body', async () => {
    const resolveTarget = resolverPinning();
    const transport = vi.fn(async () =>
      fakeResponse({ headers: { 'content-type': 'text/html' }, body: '   ' }),
    );
    await expect(fetchPage('https://site.test/', { resolveTarget, transport })).rejects.toThrow(/empty/);
  });

  it('follows a redirect to another public host and reads it', async () => {
    const resolveTarget = resolverPinning();
    const transport = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({ status: 302, headers: { location: 'https://other.test/x' } }))
      .mockResolvedValueOnce(
        fakeResponse({ headers: { 'content-type': 'text/html' }, body: '<html>landed here safely</html>' }),
      );
    const page = await fetchPage('https://start.test/', { resolveTarget, transport });
    expect(page.html).toContain('landed here safely');
    expect(page.finalUrl).toBe('https://other.test/x');
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('BLOCKS a redirect whose Location resolves to a private/metadata host', async () => {
    // start.test is fine; any "internal" host is rejected at resolve time,
    // exactly as a 169.254.169.254 / 10.x redirect target would be.
    const resolveTarget = resolverPinning('93.184.216.34', /internal|169\.254|10\./);
    const transport = vi.fn(async () =>
      fakeResponse({ status: 302, headers: { location: 'https://blocked.internal/' } }),
    );
    await expect(fetchPage('https://start.test/', { resolveTarget, transport })).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
  });

  it('enforces the redirect-hop cap instead of looping forever', async () => {
    const resolveTarget = resolverPinning();
    const transport = vi.fn(async (t: FetchTarget) =>
      fakeResponse({ status: 302, headers: { location: `https://hop-${Math.random()}.test/` } }),
    );
    await expect(fetchPage('https://start.test/', { resolveTarget, transport })).rejects.toThrow(
      /redirects too many times/,
    );
    // Bounded: one initial hop + the capped number of redirects, never unbounded.
    expect(transport.mock.calls.length).toBeLessThanOrEqual(6);
    expect(transport.mock.calls.length).toBeGreaterThan(1);
  });

  it('maps a network failure to a friendly error', async () => {
    const resolveTarget = resolverPinning();
    const transport = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(fetchPage('https://site.test/', { resolveTarget, transport })).rejects.toThrow(
      /couldn't reach that site/,
    );
  });

  it('maps a timeout/abort to a friendly "took too long"', async () => {
    vi.useFakeTimers();
    const resolveTarget = resolverPinning();
    const transport = vi.fn(
      (_t: FetchTarget, opts: { signal: AbortSignal }) =>
        new Promise<PinnedResponse>((_resolve, reject) => {
          opts.signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );
    const p = fetchPage('https://slow.test/', { resolveTarget, transport });
    const assertion = expect(p).rejects.toThrow(/took too long/);
    await vi.advanceTimersByTimeAsync(8_001);
    await assertion;
  });

  it('propagates a BlockedUrlError from the very first resolve as-is', async () => {
    const resolveTarget = resolverPinning('93.184.216.34', /start/);
    const transport = vi.fn();
    await expect(fetchPage('https://start.test/', { resolveTarget, transport })).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
    expect(transport).not.toHaveBeenCalled();
  });
});
