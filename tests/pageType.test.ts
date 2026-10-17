import { describe, expect, it } from 'vitest';
import { extractFacts } from '@/lib/extract';
import { detectPageType, isAppShell, proseSentenceCount } from '@/lib/pageType';

const facts = (body: string, head = '') =>
  extractFacts(
    `<!doctype html><html><head>${head}</head><body>${body}</body></html>`,
    'https://site.com/',
  );

// A google-style app shell: a bare brand word, a wall of nav/button/footer
// fragments, and not one value-proposition sentence anywhere.
const googleLike = facts(
  `<nav>
     <a href="/gmail">Gmail</a><a href="/images">Images</a>
     <a href="/about">About</a><a href="/store">Store</a>
     <a href="/signin">Sign in</a>
   </nav>
   <form><input name="q"></form>
   <button>Google Search</button>
   <button>I'm Feeling Lucky</button>
   <footer>
     <a href="/ads">Advertising</a><a href="/business">Business</a>
     <a href="/how">How Search works</a><a href="/privacy">Privacy</a>
     <a href="/terms">Terms</a><a href="/settings">Settings</a>
     <a href="/careers">Careers</a><a href="/help">Help</a>
     <a href="/en">English</a><a href="/intl">Other regions</a>
   </footer>`,
  '<title>Google</title>',
);

// A real landing page: a hero sentence, a value-prop subhead, body prose.
const landingLike = facts(
  `<header><nav><a href="/pricing">Pricing</a><a href="/docs">Docs</a></nav></header>
   <h1>Deploy your Next.js app globally in seconds</h1>
   <p>We host frontend apps with automatic scaling, instant rollbacks, and a
      preview URL on every single push, so your team ships without touching a server.</p>
   <a href="/signup">Start deploying free</a>`,
  '<title>Acme — Ship frontend apps faster</title><meta name="description" content="Acme hosts your frontend apps with automatic scaling and preview deploys for every pull request.">',
);

describe('proseSentenceCount', () => {
  it('finds real sentences in a landing hero', () => {
    expect(proseSentenceCount(landingLike)).toBeGreaterThanOrEqual(1);
  });

  it('finds no prose in a fragment-only app shell', () => {
    expect(proseSentenceCount(googleLike)).toBe(0);
  });
});

describe('isAppShell / detectPageType', () => {
  it('flags a google-style utility page as an app', () => {
    expect(isAppShell(googleLike)).toBe(true);
    expect(detectPageType(googleLike)).toEqual({ pageType: 'app', isLandingPage: false });
  });

  it('treats a real landing page as a landing page', () => {
    expect(isAppShell(landingLike)).toBe(false);
    expect(detectPageType(landingLike)).toEqual({ pageType: 'landing', isLandingPage: true });
  });

  it('does not flag a minimal landing page that still has a real subhead', () => {
    const minimal = facts(
      `<h1>Acme</h1>
       <p>The easiest way for small teams to track every expense and reimbursement in real time.</p>`,
    );
    expect(isAppShell(minimal)).toBe(false);
  });

  it('does not flag a landing page whose only message is a strong headline', () => {
    const headlineOnly = facts('<h1>Invoicing software that gets freelancers paid twice as fast</h1>');
    expect(isAppShell(headlineOnly)).toBe(false);
  });
});
