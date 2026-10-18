/**
 * Scroll-to-result. When a result card is displayed the page glides to it, so a
 * visitor (on a phone, mostly) can tell the roast worked instead of staring at
 * the hero with the card below the fold.
 *
 * Pure and DOM-free on purpose: the element and the media-query lookup are
 * injected, so the "once per result" and "respect reduced motion" rules are unit
 * tested without a browser. The React hook that wires it up is
 * `components/useRevealOnResult`.
 */

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type MatchMedia = (query: string) => { matches: boolean };
type Scrollable = { scrollIntoView: (arg?: ScrollIntoViewOptions | boolean) => void };

/** Smooth by default; an instant jump (CSS `auto`) for people who asked for less motion. */
export function revealBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? 'auto' : 'smooth';
}

/**
 * Identity of "a result being shown". A Re-roast returns the same id with a new
 * createdAt, and it is still a new result the visitor is waiting to see.
 */
export function revealKey(r: { id: string; createdAt: number }): string {
  return `${r.id}:${r.createdAt}`;
}

function browserMatchMedia(): MatchMedia | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  return window.matchMedia.bind(window);
}

/**
 * A revealer remembers the last key it scrolled for, so re-renders (and React
 * StrictMode's dev double-effect) never scroll twice for the same result. Call
 * `reveal` from an effect keyed on the result; it returns whether it scrolled.
 */
export function createRevealer(getMatchMedia: () => MatchMedia | undefined = browserMatchMedia) {
  let last: string | null = null;
  return {
    reveal(el: Scrollable | null | undefined, key: string): boolean {
      // No element or no result (the plain homepage): nothing to scroll to, and
      // do not burn the key so the real element still scrolls once it exists.
      if (!el || !key || key === last) return false;
      last = key;
      const mq = getMatchMedia();
      const reduced = mq ? mq(REDUCED_MOTION_QUERY).matches : false;
      el.scrollIntoView({ behavior: revealBehavior(reduced), block: 'start' });
      return true;
    },
  };
}
