/**
 * Fetch an arbitrary user URL safely.
 *
 * Every hop is (1) shape-checked, (2) resolved ONCE to its IPs, (3) proven to
 * land only on public addresses, and (4) connected with the socket PINNED to
 * those addresses (see ./pinnedFetch). That closes the DNS-rebinding / TOCTOU
 * gap of calling `fetch(url)`, which would re-resolve the hostname at connect
 * time and could be steered to a private/metadata IP after validation.
 * Redirects are followed manually so each new target repeats the full check.
 */
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { resolveFetchTarget, BlockedUrlError, type FetchTarget } from './ssrf';
import { pinnedRequest, type PinnedResponse } from './pinnedFetch';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 RoastGlowupBot/0.1 (+https://github.com/charles161/roast)';

const REQUEST_HEADERS: Record<string, string> = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  // We do our own cap on the DECODED stream; ask for identity so a compliant
  // server doesn't hand back bytes we then have to inflate inside the cap.
  'accept-encoding': 'identity',
};

export const FETCH_TIMEOUT_MS = 8_000;
export const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_REDIRECTS = 4;

export class FetchPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchPageError';
  }
}

export type FetchedPage = { finalUrl: string; html: string; truncated: boolean };

/** Injectable seams (tests drive these without real DNS or sockets). */
export type ResolveTarget = (urlStr: string) => Promise<FetchTarget>;
export type Transport = (
  target: FetchTarget,
  opts: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<PinnedResponse>;

/** If a server ignores `accept-encoding: identity`, decode anyway (cap applies after). */
function decoded(body: AsyncIterable<Buffer>, encoding: string | undefined): AsyncIterable<Buffer> {
  const enc = (encoding ?? '').toLowerCase().trim();
  if (!enc || enc === 'identity') return body;
  const src = Readable.from(body as AsyncIterable<Uint8Array>);
  if (enc === 'gzip' || enc === 'x-gzip') return src.pipe(zlib.createGunzip());
  if (enc === 'deflate') return src.pipe(zlib.createInflate());
  if (enc === 'br') return src.pipe(zlib.createBrotliDecompress());
  return body;
}

/** Read a body up to a hard byte cap (on decoded bytes), then stop the stream. */
async function readCapped(
  body: AsyncIterable<Buffer>,
  cap: number,
): Promise<{ text: string; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  for await (const value of body) {
    const b = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += b.byteLength;
    if (total > cap) {
      chunks.push(b.subarray(0, Math.max(0, b.byteLength - (total - cap))));
      truncated = true;
      break;
    }
    chunks.push(b);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), truncated };
}

export async function fetchPage(
  normalizedUrl: string,
  deps: { resolveTarget?: ResolveTarget; transport?: Transport } = {},
): Promise<FetchedPage> {
  const resolveTarget: ResolveTarget = deps.resolveTarget ?? ((u) => resolveFetchTarget(u));
  const transport: Transport = deps.transport ?? pinnedRequest;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let current = normalizedUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Resolve + validate + collect the IPs to pin. A BlockedUrlError here
      // (bad scheme/port, or any resolved IP being private) propagates as-is so
      // the API maps it to a clean 400 — including redirect targets.
      const target = await resolveTarget(current);

      let res: PinnedResponse;
      try {
        res = await transport(target, { headers: REQUEST_HEADERS, signal: controller.signal });
      } catch (err) {
        if (controller.signal.aborted) throw new FetchPageError('That site took too long to respond.');
        if (err instanceof BlockedUrlError) throw err;
        throw new FetchPageError("We couldn't reach that site.");
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.getHeader('location');
        res.destroy();
        if (!loc) throw new FetchPageError('That site redirected us nowhere.');
        if (hop === MAX_REDIRECTS) throw new FetchPageError('That site redirects too many times.');
        current = new URL(loc, current).toString();
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        res.destroy();
        throw new FetchPageError('That site is blocking bots, so we never saw it.');
      }
      if (res.status < 200 || res.status >= 300) {
        res.destroy();
        throw new FetchPageError(`That site returned ${res.status}.`);
      }

      const ctype = (res.getHeader('content-type') ?? '').toLowerCase();
      if (ctype && !/text\/html|application\/xhtml|text\/plain|^$/.test(ctype)) {
        res.destroy();
        throw new FetchPageError('That URL is not a web page.');
      }

      const declared = Number(res.getHeader('content-length') ?? '0');
      if (declared > MAX_BODY_BYTES * 4) {
        res.destroy();
        throw new FetchPageError('That page is enormous.');
      }

      try {
        const stream = decoded(res.body, res.getHeader('content-encoding'));
        const { text, truncated } = await readCapped(stream, MAX_BODY_BYTES);
        if (!text.trim()) throw new FetchPageError('That page came back empty.');
        return { finalUrl: current, html: text, truncated };
      } finally {
        res.destroy();
      }
    }

    throw new FetchPageError('That site redirects too many times.');
  } finally {
    clearTimeout(timer);
  }
}
