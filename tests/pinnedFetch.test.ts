import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPinnedLookup, pinnedRequest } from '@/lib/pinnedFetch';

/**
 * These tests prove the core anti-rebinding property: the connection is pinned
 * to addresses we already validated, and a hostname is never re-resolved
 * through real DNS at connect time.
 */

describe('buildPinnedLookup', () => {
  it('returns the single pinned IPv4 via the (hostname, callback) form', async () => {
    const lookup = buildPinnedLookup(['93.184.216.34']);
    const out = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      // Node may call lookup with just (hostname, callback).
      (lookup as any)('evil.example', (err: Error | null, address: string, family: number) =>
        err ? reject(err) : resolve({ address, family }),
      );
    });
    expect(out).toEqual({ address: '93.184.216.34', family: 4 });
  });

  it('returns the pinned IP via the (hostname, options, callback) form', async () => {
    const lookup = buildPinnedLookup(['8.8.8.8']);
    const out = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      lookup('evil.example', {}, (err, address, family) =>
        err ? reject(err) : resolve({ address: address as string, family: family as number }),
      );
    });
    expect(out).toEqual({ address: '8.8.8.8', family: 4 });
  });

  it('returns ALL pinned addresses (with families) when options.all is set', async () => {
    const lookup = buildPinnedLookup(['93.184.216.34', '2606:4700:4700::1111']);
    const out = await new Promise<any>((resolve, reject) => {
      lookup('evil.example', { all: true } as any, (err, addresses) =>
        err ? reject(err) : resolve(addresses),
      );
    });
    expect(out).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]);
  });

  it('honours an explicit family request', async () => {
    const lookup = buildPinnedLookup(['93.184.216.34', '2606:4700:4700::1111']);
    const out = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      lookup('evil.example', { family: 6 } as any, (err, address, family) =>
        err ? reject(err) : resolve({ address: address as string, family: family as number }),
      );
    });
    expect(out).toEqual({ address: '2606:4700:4700::1111', family: 6 });
  });

  it('NEVER yields an address outside the validated set, however often it is called (anti-rebind)', async () => {
    const lookup = buildPinnedLookup(['93.184.216.34']);
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      // A rebinding attacker would want a second lookup to return a private IP;
      // this function is seeded from the one-time validation and holds no DNS.
      // eslint-disable-next-line no-await-in-loop
      const addr = await new Promise<string>((resolve) =>
        lookup('evil.example', {}, (_e, address) => resolve(address as string)),
      );
      seen.add(addr);
    }
    expect([...seen]).toEqual(['93.184.216.34']);
  });
});

describe('pinnedRequest (real loopback, no external network)', () => {
  const servers: http.Server[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  });

  async function startServer(handler: http.RequestListener): Promise<number> {
    const server = http.createServer(handler);
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    return (server.address() as net.AddressInfo).port;
  }

  it('connects to the PINNED ip while keeping the Host header = original hostname', async () => {
    const port = await startServer((req, res) => res.end(`HOST=${req.headers.host}`));

    // The hostname "pinned.invalid" does not resolve in real DNS. If the socket
    // were resolved normally this would fail with ENOTFOUND; it succeeds only
    // because we pin the connection to 127.0.0.1.
    const res = await pinnedRequest(
      { url: new URL(`http://pinned.invalid:${port}/`), addresses: ['127.0.0.1'] },
      { headers: { accept: '*/*' } },
    );
    expect(res.status).toBe(200);

    const chunks: Buffer[] = [];
    for await (const c of res.body as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
    res.destroy();
    expect(Buffer.concat(chunks).toString()).toBe(`HOST=pinned.invalid:${port}`);
  });

  it('exposes response headers via getHeader (case-insensitive)', async () => {
    const port = await startServer((req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<html>ok</html>');
    });
    const res = await pinnedRequest(
      { url: new URL(`http://pinned.invalid:${port}/`), addresses: ['127.0.0.1'] },
      {},
    );
    expect(res.getHeader('content-type')).toMatch(/text\/html/);
    res.destroy();
  });

  it('rejects when the signal is already aborted', async () => {
    const port = await startServer((_req, res) => res.end('x'));
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      pinnedRequest(
        { url: new URL(`http://pinned.invalid:${port}/`), addresses: ['127.0.0.1'] },
        { signal: ctrl.signal },
      ),
    ).rejects.toBeTruthy();
  });
});
