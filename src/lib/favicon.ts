/**
 * Inline a site's favicon for the OG image. Satori cannot fetch a remote
 * image itself, so we hand it a data URI.
 *
 * The URL comes off a page we were asked to roast, i.e. it is attacker
 * controlled, so it goes through the same SSRF guard as the page fetch. Two
 * extra rules on top: no redirects at all (nothing to re-validate that way),
 * and every failure returns null so the card falls back to a monogram rather
 * than rendering a broken preview.
 */
import { assertFetchableUrl } from './ssrf';

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

export async function faviconDataUri(url: string): Promise<string | null> {
  if (!url) return null;
  if (memo.has(url)) return memo.get(url) ?? null;

  const value = await load(url);
  if (memo.size >= MAX_MEMO) memo.clear();
  memo.set(url, value);
  return value;
}

async function load(url: string): Promise<string | null> {
  try {
    await assertFetchableUrl(url);

    const res = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'image/*' },
    });
    if (!res.ok) return null;

    const type = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    const mime = ALLOWED.get(type);
    if (!mime) return null;

    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_BYTES) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;

    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Test seam. */
export function __clearFaviconMemo(): void {
  memo.clear();
}
