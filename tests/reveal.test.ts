import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createRevealer, revealBehavior, revealKey, REDUCED_MOTION_QUERY } from '@/lib/reveal';
import type { RoastResult } from '@/lib/types';

/**
 * Scroll-to-result: when a result card is displayed the page glides to it, so a
 * visitor on a phone can tell the roast worked instead of staring at the hero.
 * The logic is a tiny pure core (so it is testable without a DOM) plus a hook
 * that wires it to the result container.
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

type Call = ScrollIntoViewOptions | undefined;
function fakeEl() {
  const calls: Call[] = [];
  return { calls, scrollIntoView: (o?: ScrollIntoViewOptions | boolean) => void calls.push(o as Call) };
}
const mm = (reduced: boolean) => () => (q: string) => ({ matches: q === REDUCED_MOTION_QUERY && reduced });

describe('revealBehavior', () => {
  it('glides normally, jumps instantly under reduced motion', () => {
    expect(revealBehavior(false)).toBe('smooth');
    expect(revealBehavior(true)).toBe('auto');
  });
});

describe('revealKey', () => {
  it('is stable for one result and changes for a different or re-roasted one', () => {
    const a = fakeResult();
    expect(revealKey(a)).toBe(revealKey({ ...a }));
    expect(revealKey(a)).not.toBe(revealKey(fakeResult({ id: 'zzzzzzzzzzzz' })));
    // A Re-roast keeps the id but has a new createdAt: it is a new result to reveal.
    expect(revealKey(a)).not.toBe(revealKey(fakeResult({ createdAt: 2000 })));
  });
});

describe('createRevealer', () => {
  it('scrolls the result to the top of the viewport, smoothly', () => {
    const el = fakeEl();
    const rv = createRevealer(mm(false));
    expect(rv.reveal(el, 'k1')).toBe(true);
    expect(el.calls).toEqual([{ behavior: 'smooth', block: 'start' }]);
  });

  it('respects prefers-reduced-motion: no smooth scrolling', () => {
    const el = fakeEl();
    createRevealer(mm(true)).reveal(el, 'k1');
    expect(el.calls).toEqual([{ behavior: 'auto', block: 'start' }]);
  });

  it('asks the media query for reduced motion, not some other query', () => {
    const asked: string[] = [];
    const rv = createRevealer(() => (q: string) => {
      asked.push(q);
      return { matches: false };
    });
    rv.reveal(fakeEl(), 'k1');
    expect(asked).toEqual(['(prefers-reduced-motion: reduce)']);
  });

  it('fires once per result: re-renders with the same key do not re-scroll', () => {
    const el = fakeEl();
    const rv = createRevealer(mm(false));
    expect(rv.reveal(el, 'k1')).toBe(true);
    expect(rv.reveal(el, 'k1')).toBe(false);
    expect(rv.reveal(el, 'k1')).toBe(false);
    expect(el.calls).toHaveLength(1);
  });

  it('fires again when the key changes (new result, or a Re-roast)', () => {
    const el = fakeEl();
    const rv = createRevealer(mm(false));
    rv.reveal(el, 'k1');
    rv.reveal(el, 'k2');
    expect(el.calls).toHaveLength(2);
  });

  it('never scrolls without a result: no element, or an empty key (the plain homepage)', () => {
    const el = fakeEl();
    const rv = createRevealer(mm(false));
    expect(rv.reveal(null, 'k1')).toBe(false);
    expect(rv.reveal(el, '')).toBe(false);
    expect(el.calls).toHaveLength(0);
    // Skipped calls must not burn the key: the real element still scrolls later.
    expect(rv.reveal(el, 'k1')).toBe(true);
  });

  it('falls back to a smooth scroll when matchMedia is unavailable (SSR / old browsers)', () => {
    const el = fakeEl();
    createRevealer(() => undefined).reveal(el, 'k1');
    expect(el.calls).toEqual([{ behavior: 'smooth', block: 'start' }]);
  });
});

describe('wiring', () => {
  it('ResultView marks its root as the reveal target, with a small top offset', async () => {
    const { ResultView } = await import('@/components/ResultView');
    const html = renderToStaticMarkup(
      createElement(ResultView, { r: fakeResult(), shareUrl: 'https://x.test/r/abcdefghijkl' }),
    );
    expect(html.match(/data-result-root/g)).toHaveLength(1);
    expect(html).toMatch(/<div[^>]*class="[^"]*scroll-mt-6[^"]*"[^>]*data-result-root|<div[^>]*data-result-root[^>]*class="[^"]*scroll-mt-6/);
  });

  it('the plain homepage renders no result root (nothing to scroll to)', async () => {
    const { RoastApp } = await import('@/components/RoastApp');
    const html = renderToStaticMarkup(createElement(RoastApp, {}));
    expect(html).not.toContain('data-result-root');
  });

  it('a cached /r/<id> link renders exactly one result root on mount', async () => {
    const { RoastApp } = await import('@/components/RoastApp');
    const html = renderToStaticMarkup(createElement(RoastApp, { initialResult: fakeResult() }));
    expect(html.match(/data-result-root/g)).toHaveLength(1);
  });
});
