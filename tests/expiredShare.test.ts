import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoastResult } from '@/lib/types';

/**
 * Expired / unknown share links: /r/<id> with nothing cached falls through to
 * the homepage form plus a dismissible notice. The plain homepage must not
 * change at all.
 */

const NOTICE = 'That roast has expired';

function fakeResult(): RoastResult {
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
  };
}

describe('RoastApp expired-share notice', () => {
  async function markup(props: Record<string, unknown>): Promise<string> {
    const { RoastApp } = await import('@/components/RoastApp');
    return renderToStaticMarkup(createElement(RoastApp, props));
  }

  it('renders a dismissible status notice when expiredShare is set', async () => {
    const html = await markup({ expiredShare: true });
    expect(html).toContain(NOTICE);
    expect(html).toContain('role="status"');
    expect(html).toMatch(/aria-label="Dismiss[^"]*"/);
    // The convert path stays: the form is still there.
    expect(html).toContain('Roast my site');
  });

  it('renders nothing new on the plain homepage', async () => {
    const plain = await markup({});
    expect(plain).not.toContain(NOTICE);
    expect(plain).not.toContain('role="status"');
    expect(plain).not.toMatch(/aria-label="Dismiss/);
    // Absent and explicitly-false must be byte-identical.
    expect(await markup({ expiredShare: false })).toBe(plain);
  });

  it('puts the notice above the input', async () => {
    const html = await markup({ expiredShare: true });
    expect(html.indexOf(NOTICE)).toBeGreaterThan(-1);
    expect(html.indexOf(NOTICE)).toBeLessThan(html.indexOf('aria-label="Your website URL"'));
  });

  it('tells the truth about how long results are kept', async () => {
    const { TTL_MS } = await import('@/lib/cache');
    const days = Math.round(TTL_MS / (24 * 60 * 60 * 1000));
    expect(days).toBe(90);
    expect(await markup({})).toContain(`Results are kept for ${days} days.`);
  });
});

describe('/r/[id] page', () => {
  const getCached = vi.fn();
  const urlForId = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    getCached.mockReset();
    urlForId.mockReset();
    urlForId.mockResolvedValue(null); // default: no durable pointer for this id
    vi.doMock('@/lib/pipeline', () => ({ getCached }));
    vi.doMock('@/lib/cache', async () => ({
      ...(await vi.importActual<typeof import('@/lib/cache')>('@/lib/cache')),
      urlForId,
    }));
    vi.doMock('@/lib/counter', () => ({ MIN_DISPLAY: 25, roastCount: async () => 0 }));
    vi.doMock('@/lib/showcase', () => ({ showcaseRoast: async () => null }));
    vi.doMock('@/lib/baseUrl', () => ({ originFromRequest: async () => 'https://example.test' }));
    vi.doMock('@/components/RoastApp', () => ({ RoastApp: () => null }));
  });

  async function render(id: string): Promise<ReactElement<Record<string, unknown>>> {
    const { default: ResultPage } = await import('@/app/r/[id]/page');
    const el = await ResultPage({ params: Promise.resolve({ id }) });
    expect(isValidElement(el)).toBe(true);
    return el as ReactElement<Record<string, unknown>>;
  }

  it('flags expiredShare when nothing is cached AND no pointer exists (ancient link)', async () => {
    getCached.mockResolvedValue(null);
    const el = await render('abcdefghijkl');
    expect(urlForId).toHaveBeenCalledWith('abcdefghijkl');
    expect(el.props.expiredShare).toBe(true);
    expect(el.props.initialResult).toBeUndefined();
    expect(el.props.resolveUrl).toBeUndefined();
  });

  it('does not flag expiredShare when a result exists', async () => {
    const r = fakeResult();
    getCached.mockResolvedValue(r);
    const el = await render('abcdefghijkl');
    expect(el.props.expiredShare).toBeUndefined();
    expect(el.props.resolveUrl).toBeUndefined();
    expect(el.props.initialResult).toBe(r);
    expect(urlForId).not.toHaveBeenCalled(); // a hit never pays for the pointer lookup
  });

  it('still 404s on a malformed id', async () => {
    await expect(render('../nope')).rejects.toThrow();
    expect(getCached).not.toHaveBeenCalled();
    expect(urlForId).not.toHaveBeenCalled();
  });
});
