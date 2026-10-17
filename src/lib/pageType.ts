/**
 * Is this a marketing LANDING page, or an APP / utility shell (google.com)?
 *
 * Cheap, pure, no-LLM heuristic over the already-extracted PageFacts. An app
 * shell has nothing to sell — a bare brand word, UI-label fragments, no
 * value-proposition sentence — so inventing a glow-up for it is nonsense
 * (google.com scraped as a landing page produced "Turn a photo into the image
 * you described"). We only flag when several independent structural signals
 * agree, because wrongly flagging a REAL landing page would suppress its fix.
 */
import type { PageFacts } from './extract';
import { currentHeadline, currentSubhead } from './extract';

export type PageType = 'landing' | 'app';

const PLACEHOLDERS = new Set([
  '(no headline found)',
  '(no subhead found)',
  '(no clear cta found)',
]);

function isPlaceholder(s: string): boolean {
  return PLACEHOLDERS.has(s.trim().toLowerCase());
}

function words(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** The headline as real copy — a bare-word brand or a placeholder counts as none. */
function realHeadlineWords(f: PageFacts): number {
  const h = currentHeadline(f);
  return isPlaceholder(h) ? 0 : words(h);
}

/** A subhead that is an actual phrase, not a placeholder or a one-word fragment. */
function hasRealSubhead(f: PageFacts): boolean {
  const s = currentSubhead(f);
  if (!s || isPlaceholder(s)) return false;
  return words(s) >= 5;
}

/**
 * How many real prose sentences live in the hero copy. heroText is prose lines
 * joined by " · "; split them back out (and on sentence enders) and count the
 * chunks long enough to be an actual sentence rather than a nav/button label.
 */
export function proseSentenceCount(f: PageFacts): number {
  return (f.heroText || '')
    .split(/ · |(?<=[.!?])\s+/)
    .map((c) => c.trim())
    .filter((c) => words(c) >= 6).length;
}

/**
 * The page is an app/utility shell when it carries NO marketing message:
 * the hero is a bare brand word (or missing), there is no value-proposition
 * subhead, and there is no real prose sentence anywhere in the hero. A real
 * landing page clears at least one of these comfortably (it almost always has
 * a multi-word headline), so the three gates together stay conservative.
 */
export function isAppShell(f: PageFacts): boolean {
  return realHeadlineWords(f) < 2 && !hasRealSubhead(f) && proseSentenceCount(f) === 0;
}

export function detectPageType(f: PageFacts): { pageType: PageType; isLandingPage: boolean } {
  const app = isAppShell(f);
  return { pageType: app ? 'app' : 'landing', isLandingPage: !app };
}
