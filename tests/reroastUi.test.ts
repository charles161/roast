import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RoastResult } from '@/lib/types';

/**
 * The "Re-roast" action lives on a RESULT only (next to the share actions),
 * never on the plain homepage, and the default request body is unchanged.
 *
 * It is for the page-owner's OWN session only: a result the visitor generated
 * through the home form. Opening someone's /r/<id> link (shared, or a link that
 * just self-healed) must not offer it, or a viral blast turns into idle LLM
 * spend; "Roast another / Roast yours" carries the loop there instead.
 */

function fakeResult(over: Partial<RoastResult> = {}): RoastResult {
  return {
    id: 'abcdefghijkl',
    url: 'https://stripe.com/',
    displayUrl: 'stripe.com',
    siteName: 'Stripe',
    favicon: '',
    createdAt: 1000,
    score: { overall: 73, subs: [{ key: 'hero', label: 'Hero', score: 60, reason: 'r' }] },
    roast: ['A line.'],
    verdict: 'A verdict.',
    before: { headline: 'b', subhead: 'b', cta: 'b' },
    after: { headline: 'a', subhead: 'a', cta: 'a' },
    fixes: ['one', 'two', 'three'],
    ...over,
  };
}

const LABEL = 'Re-roast';

describe('ResultView re-roast action', () => {
  async function view(props: Record<string, unknown>): Promise<string> {
    const { ResultView } = await import('@/components/ResultView');
    return renderToStaticMarkup(
      createElement(ResultView, { r: fakeResult(), shareUrl: 'https://x.test/r/abcdefghijkl', ...props }),
    );
  }

  it('shows a Re-roast button when a handler is provided', async () => {
    const html = await view({ onReroast: () => {} });
    expect(html).toContain(LABEL);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>\s*Re-roast/);
  });

  it('shows no Re-roast without a handler, and the rest is byte-identical', async () => {
    const without = await view({});
    expect(without).not.toContain(LABEL);
    expect(without).toBe(await view({ onReroast: undefined }));
  });

  it('sits with the share actions, above the roast itself', async () => {
    const html = await view({ onReroast: () => {}, onAnother: () => {} });
    const share = html.indexOf('Copy link');
    const reroast = html.indexOf(LABEL);
    const roast = html.indexOf('The roast');
    expect(share).toBeGreaterThan(-1);
    expect(reroast).toBeGreaterThan(share);
    expect(reroast).toBeLessThan(roast);
  });

  it('also appears on the app-shell variant of a result', async () => {
    const html = await view({
      r: fakeResult({ isLandingPage: false, pageType: 'app' }),
      onReroast: () => {},
    });
    expect(html).toContain(LABEL);
  });
});

describe('Re-roast is for own-session results only', () => {
  async function stage(props: {
    source: 'form' | 'link';
    onReroast?: (() => void) | undefined;
  }): Promise<string> {
    const { ResultStage } = await import('@/components/RoastApp');
    return renderToStaticMarkup(
      createElement(ResultStage, {
        r: fakeResult(),
        shareUrl: 'https://x.test/r/abcdefghijkl',
        onAnother: () => {},
        onReroast: () => {},
        ...props,
      }),
    );
  }

  it('a result generated through the home form offers Re-roast', async () => {
    expect(await stage({ source: 'form' })).toContain(LABEL);
  });

  it('a /r/<id> link-open view (shared or self-healed) does NOT, even if a handler is passed', async () => {
    const html = await stage({ source: 'link' });
    expect(html).not.toContain(LABEL);
    // ...and the loop CTA is still there.
    expect(html).toContain('Roast another');
  });

  it('the link-open view differs from the form view only by the Re-roast row', async () => {
    const form = await stage({ source: 'form' });
    const link = await stage({ source: 'link' });
    expect(link).toBe(await stage({ source: 'link', onReroast: undefined }));
    expect(form.replace(/<div class="mt-3 flex[^]*?<\/div>/, '')).toBe(link);
  });
});

describe('RoastApp re-roast action', () => {
  async function app(props: Record<string, unknown>): Promise<string> {
    const { RoastApp } = await import('@/components/RoastApp');
    return renderToStaticMarkup(createElement(RoastApp, props));
  }

  it('does not appear on the plain homepage', async () => {
    const html = await app({});
    expect(html).not.toContain(LABEL);
    expect(await app({ expiredShare: true })).not.toContain(LABEL);
    expect(await app({ showcase: fakeResult() })).not.toContain(LABEL);
  });

  it('does NOT appear when someone opens a /r/<id> link (shared card)', async () => {
    const html = await app({ initialResult: fakeResult(), initialUrl: 'stripe.com' });
    expect(html).not.toContain(LABEL);
    // The shared-card view still carries the viral loop.
    expect(html).toContain('Roast yours');
    expect(html).toContain('Copy link');
  });
});

describe('roast request body', () => {
  it('is exactly { url } by default and adds fresh:true only when asked', async () => {
    const { roastRequestBody } = await import('@/components/RoastApp');
    expect(roastRequestBody('stripe.com')).toBe('{"url":"stripe.com"}');
    expect(roastRequestBody('stripe.com', false)).toBe('{"url":"stripe.com"}');
    expect(roastRequestBody('stripe.com', true)).toBe('{"url":"stripe.com","fresh":true}');
  });
});
