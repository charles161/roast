/**
 * Inline a site's favicon for the OG image. Satori cannot fetch a remote
 * image itself, so we hand it a data URI.
 *
 * The URL comes off a page we were asked to roast, i.e. it is attacker
 * controlled, so it goes through the same SSRF guard as the page fetch —
 * resolved once and connected with the socket PINNED to the validated IPs, so
 * it cannot be DNS-rebound to a private/metadata host. Two extra rules on top:
 * no redirects at all (nothing to re-validate that way), and every failure
 * returns null so the card falls back to a monogram rather than a broken image.
 */
import { resolveFetchTarget, type FetchTarget } from './ssrf';
import { pinnedRequest, type PinnedResponse } from './pinnedFetch';

const TIMEOUT_MS = 1_200;
const MAX_BYTES = 192 * 1024;

/** SVG is excluded: Satori rasterises it inconsistently from a data URI. */
const ALLOWED = new Map<string, string>([
  ['image/png', 'image/png'],
  ['image/jpeg', 'image/jpeg'],
  ['image/webp', 'image/webp'],
  ['image/gif', 'image/gif'],
  ['image/x-icon', 'image/x-icon'],
  ['image/vnd.microsoft.icon', 'image/x-icon'],
]);

const memo = new Map<string, string | null>();
const MAX_MEMO = 300;

type ResolveTarget = (urlStr: string) => Promise<FetchTarget>;
type Transport = (
  target: FetchTarget,
  opts: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<PinnedResponse>;
export type FaviconDeps = { resolveTarget?: ResolveTarget; transport?: Transport };

export async function faviconDataUri(url: string, deps: FaviconDeps = {}): Promise<string | null> {
  if (!url) return null;
  if (memo.has(url)) return memo.get(url) ?? null;

  const value = await load(url, deps);
  if (memo.size >= MAX_MEMO) memo.clear();
  memo.set(url, value);
  return value;
}

/** Read the body up to the cap; anything larger is rejected (returns null). */
async function readUpTo(body: AsyncIterable<Buffer>, cap: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of body) {
    const b = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += b.byteLength;
    if (total > cap) return null;
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

async function load(url: string, deps: FaviconDeps): Promise<string | null> {
  const resolveTarget: ResolveTarget = deps.resolveTarget ?? ((u) => resolveFetchTarget(u));
  const transport: Transport = deps.transport ?? pinnedRequest;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const target = await resolveTarget(url);
    const res = await transport(target, {
      headers: { accept: 'image/*', 'accept-encoding': 'identity' },
      signal: controller.signal,
    });
    try {
      // No redirects for favicons: a 3xx would need re-validation we don't do here.
      if (res.status < 200 || res.status >= 300) return null;

      const type = (res.getHeader('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      const mime = ALLOWED.get(type);
      if (!mime) return null;

      const declared = Number(res.getHeader('content-length') ?? '0');
      if (declared > MAX_BYTES) return null;

      const buf = await readUpTo(res.body, MAX_BYTES);
      if (!buf || buf.byteLength === 0) return null;

      return `data:${mime};base64,${buf.toString('base64')}`;
    } finally {
      res.destroy();
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam. */
export function __clearFaviconMemo(): void {
  memo.clear();
}
