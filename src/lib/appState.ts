/**
 * Shared "it's an app, nothing to sell" copy for utility shells (google.com).
 * One source of truth so the result card, the glow-up section, the OG image,
 * and the markdown view all tell the same joke.
 */

export const APP_HEADLINE = 'Nothing to fix';

export function appCheekySubhead(siteName: string): string {
  const name = (siteName || 'this site').trim();
  return `Nothing to fix — ${name} doesn't need a landing page 🤷`;
}

/**
 * The `after` block we store for an app page, instead of a hallucinated
 * glow-up. Keeps the result schema valid and the share card coherent.
 */
export function appAfter(siteName: string): { headline: string; subhead: string; cta: string } {
  return {
    headline: APP_HEADLINE,
    subhead: appCheekySubhead(siteName),
    cta: '—',
  };
}
