/**
 * Server-only HTTP(S) transport that PINS the TCP connection to IP addresses
 * already validated by the SSRF guard, while leaving the Host header and TLS
 * SNI set to the original hostname.
 *
 * Why not `fetch(url)`? The global fetch re-resolves the hostname through DNS
 * at connect time. An attacker's hostname can pass the SSRF check on the first
 * lookup and then resolve to 169.254.169.254 / 10.x on the connection
 * (TOCTOU / DNS rebinding). Here we never let the socket re-resolve: we hand
 * `node:net`/`node:tls` a custom `lookup` that only ever yields the addresses
 * we already proved public. Because the request's `hostname` stays the real
 * host, the `Host` header and (for TLS) `servername`/SNI remain correct, so
 * virtual-hosted sites and certificate validation keep working — only the IP
 * the socket dials is forced.
 *
 * Node core http/https is used instead of undici's dispatcher because undici is
 * not a dependency of this project (and adding deps is out of scope); the
 * `lookup`-pinning technique gives the identical guarantee and runs on the
 * Vercel `nodejs` runtime with zero extra packages.
 */
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { IncomingMessage } from 'node:http';
import type { LookupFunction } from 'node:net';

export type PinnedResponse = {
  status: number;
  /** Case-insensitive single-value header accessor. */
  getHeader(name: string): string | undefined;
  /** The response body as an async-iterable of Buffers (a Node Readable). */
  body: AsyncIterable<Buffer>;
  /** Tear down the socket (stop the download). */
  destroy(): void;
};

/**
 * A `net`/`dns`-style lookup that resolves ANY hostname to the pre-validated
 * pinned addresses. It holds no DNS state, so however many times a socket calls
 * it (now or on a rebind attempt) it can only ever return the validated set.
 */
export function buildPinnedLookup(addresses: string[]): LookupFunction {
  const entries = addresses.map((address) => ({
    address,
    family: (net.isIPv6(address) ? 6 : 4) as 4 | 6,
  }));

  const lookup = (hostname: string, options: unknown, callback?: unknown) => {
    const cb = (typeof options === 'function' ? options : callback) as (
      err: NodeJS.ErrnoException | null,
      address?: string | { address: string; family: number }[],
      family?: number,
    ) => void;
    const opts = (typeof options === 'function' ? {} : (options ?? {})) as {
      all?: boolean;
      family?: number;
    };

    if (!entries.length) {
      cb(Object.assign(new Error('No pinned address available'), { code: 'ENOTFOUND' }));
      return;
    }
    if (opts.all) {
      cb(null, entries.map((e) => ({ address: e.address, family: e.family })));
      return;
    }
    const fam = opts.family === 4 || opts.family === 6 ? opts.family : null;
    const pick = fam ? entries.find((e) => e.family === fam) : entries[0];
    if (!pick) {
      cb(Object.assign(new Error(`No pinned address for family ${fam}`), { code: 'ENOTFOUND' }));
      return;
    }
    cb(null, pick.address, pick.family);
  };

  return lookup as unknown as LookupFunction;
}

function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * Perform a single GET to `target.url`, connecting only to `target.addresses`.
 * No redirects are followed (the caller re-validates and re-pins each hop).
 */
export function pinnedRequest(
  target: { url: URL; addresses: string[] },
  opts: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<PinnedResponse> {
  const { url, addresses } = target;
  const isHttps = url.protocol === 'https:';
  const mod = isHttps ? https : http;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const lookup = buildPinnedLookup(addresses);
  // SNI only makes sense for a real hostname, not a bare IP literal.
  const useSni = isHttps && !net.isIP(host);

  return new Promise<PinnedResponse>((resolve, reject) => {
    const signal = opts.signal;
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const req = mod.request(
      {
        protocol: url.protocol,
        hostname: host, // -> Host header + (https) default servername
        port: url.port ? Number(url.port) : isHttps ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: opts.headers,
        lookup, // -> socket dials ONLY the pinned IP
        agent: false, // one-off socket so our lookup is always honoured
        ...(useSni ? { servername: host } : {}),
      },
      (res: IncomingMessage) => {
        resolve({
          status: res.statusCode ?? 0,
          getHeader: (name) => {
            const v = res.headers[name.toLowerCase()];
            return Array.isArray(v) ? v[0] : v;
          },
          body: res,
          destroy: () => {
            try {
              res.destroy();
            } catch {
              /* already closed */
            }
            try {
              req.destroy();
            } catch {
              /* already closed */
            }
          },
        });
      },
    );

    const onAbort = () => req.destroy(abortError());
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    req.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(err);
    });
    req.end();
  });
}
