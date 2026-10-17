/**
 * Share-surface copy, built in one place so the tweet, the on-page card and
 * the OG image all tell the same story. Pure functions: no DOM, no env.
 */
import type { RoastResult } from './types';

/** Stamped on every shareable surface so a screenshot carries the brand. */
export const WORDMARK = 'roast.lightslips.ai';

/** X counts any link as 23 characters, whatever its real length. */
const TCO_LEN = 23;
const TWEET_MAX = 280;
const TAIL = '\n\nRoast yours →';

/** Collapse whitespace and cut on a whole character, with an ellipsis. */
export function clampText(s: string, max: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (max <= 1) return t.slice(0, Math.max(0, max));
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** The model already quotes the site's own words; we add our own quotes. */
function unquote(s: string): string {
  const PAIRS: [string, string][] = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
  ];
  for (const [open, close] of PAIRS) {
    if (s.length > 1 && s.startsWith(open) && s.endsWith(close)) return s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Wrap a line in quotation marks, unless it already opens by quoting the
 * site's own copy. Nesting them reads as a typo on a share card.
 */
export function quoteWrap(s: string): string {
  const OPENERS = ['"', '\u201c', "'", '\u2018'];
  const t = (s ?? '').trim();
  if (!t) return '';
  if (OPENERS.some((q) => t.startsWith(q))) return t;
  return `\u201c${t}\u201d`;
}

/** The single line worth quoting: the verdict, else the first roast line. */
export function teaser(r: RoastResult, max: number): string {
  const pick = (r.verdict ?? '').trim() || (r.roast?.[0] ?? '').trim();
  return clampText(unquote(pick), max);
}

/**
 * Prefilled tweet body. The link rides in the intent's own `url` param, so we
 * budget 23 characters for it here and never overflow the 280 limit.
 */
export function tweetText(r: RoastResult): string {
  const head = `${clampText(r.displayUrl, 48)} scored ${r.score.overall}/100.`;
  const frame = head.length + TAIL.length + TCO_LEN + 6; // quotes + blank lines
  const quote = teaser(r, Math.max(40, Math.min(190, TWEET_MAX - frame)));
  return `${head}\n\n“${quote}”${TAIL}`;
}

/** What X will actually count for this tweet, link included. */
export function tweetLength(r: RoastResult): number {
  return tweetText(r).length + 1 + TCO_LEN;
}

export function xIntentUrl(r: RoastResult, shareUrl: string): string {
  const p = new URLSearchParams({ text: tweetText(r) });
  if (shareUrl) p.set('url', shareUrl);
  return `https://twitter.com/intent/tweet?${p.toString()}`;
}
