/** URL normalization: user input -> a canonical, cacheable https(s) URL. */

export class BadUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadUrlError';
  }
}

/** Query params that are pure tracking noise; dropped so cache keys collapse. */
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|gbraid$|wbraid$|msclkid$|mc_(e|c)id$|ref$|ref_src$|igshid$|si$|_hs(enc|mi)$|vero_|yclid$|twclid$|ttclid$)/i;

/**
 * Normalize raw user input into a canonical absolute http(s) URL string.
 * Throws BadUrlError for anything we will not fetch.
 */
export function normalizeUrl(raw: string): string {
  if (typeof raw !== 'string') throw new BadUrlError('Enter a URL.');
  let input = raw.trim();
  if (!input) throw new BadUrlError('Enter a URL.');
  if (input.length > 2048) throw new BadUrlError('That URL is absurdly long.');

  // Strip wrapping quotes/angle brackets people paste from chat apps.
  input = input.replace(/^["'<(\[]+/, '').replace(/["'>)\]]+$/, '').trim();

  // Reject control chars / whitespace inside the URL outright.
  if (/[\s\u0000-\u001f\u007f]/.test(input)) throw new BadUrlError('That URL has invalid characters.');

  // A bare scheme-less host gets https://. Guard against "javascript:..." etc.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input)) {
    if (input.startsWith('//')) input = `https:${input}`;
    else input = `https://${input}`;
  }

  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new BadUrlError("That doesn't look like a URL.");
  }

  const proto = u.protocol.toLowerCase();
  if (proto !== 'http:' && proto !== 'https:') {
    throw new BadUrlError('Only http and https URLs are supported.');
  }

  // Embedded credentials are a redirect/SSRF smell and never needed here.
  if (u.username || u.password) throw new BadUrlError('Remove the credentials from that URL.');

  const host = u.hostname.toLowerCase();
  if (!host) throw new BadUrlError("That doesn't look like a URL.");

  // Must be a dotted name or a bracketed IPv6 literal or a bare IP.
  const isIpv6 = u.hostname.startsWith('[') || host.includes(':');
  if (!isIpv6 && !/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes('.')) {
    throw new BadUrlError('Use a full domain, like example.com.');
  }
  if (/\.\.|^[.-]|[.-]$/.test(host)) throw new BadUrlError("That doesn't look like a URL.");

  u.protocol = proto;
  // Collapse the www. prefix: it is virtually always the same site, and
  // letting it split the cache key would double LLM spend on one domain.
  u.hostname = host.startsWith('www.') && host.split('.').length > 2 ? host.slice(4) : host;
  u.hash = '';

  // Default ports are implicit; a non-default port stays but must be web-ish.
  if ((proto === 'https:' && u.port === '443') || (proto === 'http:' && u.port === '80')) u.port = '';

  // Drop tracking params, sort the rest so param order can't split the cache.
  const keep: [string, string][] = [];
  for (const [k, v] of u.searchParams) {
    if (!TRACKING_PARAMS.test(k)) keep.push([k, v]);
  }
  keep.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const qs = new URLSearchParams(keep).toString();
  u.search = qs ? `?${qs}` : '';

  // Collapse a bare "/" path to "" so example.com and example.com/ are one key.
  if (u.pathname === '/') u.pathname = '/';

  return u.toString();
}

/** Short, human display form: host + trimmed path. */
export function displayUrl(normalized: string): string {
  try {
    const u = new URL(normalized);
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    return `${u.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    return normalized;
  }
}

/** The brand-ish name we show on the card. */
export function siteName(normalized: string): string {
  try {
    const host = new URL(normalized).hostname.replace(/^www\./, '');
    const base = host.split('.')[0] ?? host;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return 'This site';
  }
}
