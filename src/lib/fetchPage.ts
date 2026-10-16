/** Fetch an arbitrary user URL safely: SSRF-checked on every redirect hop. */
import { assertFetchableUrl, BlockedUrlError } from './ssrf';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 RoastGlowupBot/0.1 (+https://github.com/charles161/roast)';

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

/** Read a response body up to a hard byte cap, then abort the stream. */
async function readCapped(res: Response, cap: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: '', truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > cap) {
        chunks.push(value.subarray(0, Math.max(0, value.byteLength - (total - cap))));
        truncated = true;
        break;
      }
      chunks.push(value);
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { text: buf.toString('utf8'), truncated };
}

export async function fetchPage(normalizedUrl: string): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let current = normalizedUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Re-validate before every single connection, including redirect targets.
      await assertFetchableUrl(current);

      let res: Response;
      try {
        res = await fetch(current, {
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'user-agent': UA,
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
          },
        });
      } catch (err) {
        if (controller.signal.aborted) throw new FetchPageError('That site took too long to respond.');
        if (err instanceof BlockedUrlError) throw err;
        throw new FetchPageError("We couldn't reach that site.");
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        try { await res.body?.cancel(); } catch { /* ignore */ }
        if (!loc) throw new FetchPageError('That site redirected us nowhere.');
        if (hop === MAX_REDIRECTS) throw new FetchPageError('That site redirects too many times.');
        current = new URL(loc, current).toString();
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        try { await res.body?.cancel(); } catch { /* ignore */ }
        throw new FetchPageError('That site is blocking bots, so we never saw it.');
      }
      if (!res.ok) {
        try { await res.body?.cancel(); } catch { /* ignore */ }
        throw new FetchPageError(`That site returned ${res.status}.`);
      }

      const ctype = (res.headers.get('content-type') ?? '').toLowerCase();
      if (ctype && !/text\/html|application\/xhtml|text\/plain|^$/.test(ctype)) {
        try { await res.body?.cancel(); } catch { /* ignore */ }
        throw new FetchPageError('That URL is not a web page.');
      }

      const declared = Number(res.headers.get('content-length') ?? '0');
      if (declared > MAX_BODY_BYTES * 4) {
        try { await res.body?.cancel(); } catch { /* ignore */ }
        throw new FetchPageError('That page is enormous.');
      }

      const { text, truncated } = await readCapped(res, MAX_BODY_BYTES);
      if (!text.trim()) throw new FetchPageError('That page came back empty.');
      return { finalUrl: res.url || current, html: text, truncated };
    }

    throw new FetchPageError('That site redirects too many times.');
  } finally {
    clearTimeout(timer);
  }
}
