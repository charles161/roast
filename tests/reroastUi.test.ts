import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RoastResult } from '@/lib/types';

/**
 * The "Re-roast" action lives on a RESULT only (next to the share actions),
 * never on the plain homepage, and the default request body is unchanged.
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

  it('appears when a result is shown (e.g. someone opens their /r/<id> link)', async () => {
    const html = await app({ initialResult: fakeResult(), initialUrl: 'stripe.com' });
    expect(html).toContain(LABEL);
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
