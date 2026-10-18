import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoastResult } from '@/lib/types';

/**
 * Self-healing share links. On a /r/<id> miss the page looks up the durable
 * id -> URL pointer; with one, it hands the URL to RoastApp, which runs a
 * NORMAL roast on mount and so regenerates the result under the same id.
 * Without one (ancient link) the expired notice from 1a89fb6 stays.
 */

const ID = 'abcdefghijkl';
const URL_ = 'https://stripe.com/';

function fakeResult(): RoastResult {
  return {
    id: ID,
    url: URL_,
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

describe('/r/[id] page — miss with a durable pointer', () => {
  const getCached = vi.fn();
  const urlForId = vi.fn();
  const showcaseRoast = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    getCached.mockReset();
    urlForId.mockReset();
    showcaseRoast.mockReset();
    showcaseRoast.mockResolvedValue(null);
    vi.doMock('@/lib/pipeline', () => ({ getCached }));
    vi.doMock('@/lib/cache', async () => ({
      ...(await vi.importActual<typeof import('@/lib/cache')>('@/lib/cache')),
      urlForId,
    }));
    vi.doMock('@/lib/counter', () => ({ MIN_DISPLAY: 25, roastCount: async () => 0 }));
    vi.doMock('@/lib/showcase', () => ({ showcaseRoast }));
    vi.doMock('@/lib/baseUrl', () => ({ originFromRequest: async () => 'https://example.test' }));
    vi.doMock('@/components/RoastApp', () => ({ RoastApp: () => null }));
  });

  async function render(id: string): Promise<ReactElement<Record<string, unknown>>> {
    const { default: ResultPage } = await import('@/app/r/[id]/page');
    const el = await ResultPage({ params: Promise.resolve({ id }) });
    expect(isValidElement(el)).toBe(true);
    return el as ReactElement<Record<string, unknown>>;
  }

  it('passes the resolved URL to RoastApp so it self-heals on mount', async () => {
    getCached.mockResolvedValue(null);
    urlForId.mockResolvedValue(URL_);
    const el = await render(ID);
    expect(urlForId).toHaveBeenCalledWith(ID);
    expect(el.props.resolveUrl).toBe(URL_);
    // The visitor sees the site being roasted, not an empty box.
    expect(el.props.initialUrl).toBe('stripe.com');
    // It is NOT the expired-notice path and has no result to show yet.
    expect(el.props.expiredShare).toBeUndefined();
    expect(el.props.initialResult).toBeUndefined();
  });

  it('does not pay for a showcase lookup while healing', async () => {
    getCached.mockResolvedValue(null);
    urlForId.mockResolvedValue(URL_);
    await render(ID);
    expect(showcaseRoast).not.toHaveBeenCalled();
  });

  it('falls back to the expired notice when there is no pointer', async () => {
    getCached.mockResolvedValue(null);
    urlForId.mockResolvedValue(null);
    const el = await render(ID);
    expect(el.props.expiredShare).toBe(true);
    expect(el.props.resolveUrl).toBeUndefined();
  });

  it('serves the stored result on a hit, exactly as before', async () => {
    const r = fakeResult();
    getCached.mockResolvedValue(r);
    const el = await render(ID);
    expect(el.props.initialResult).toBe(r);
    expect(el.props.initialUrl).toBe('stripe.com');
    expect(el.props.resolveUrl).toBeUndefined();
    expect(el.props.expiredShare).toBeUndefined();
    expect(urlForId).not.toHaveBeenCalled();
  });

  it('404s on a malformed id without any lookups', async () => {
    await expect(render('../nope')).rejects.toThrow();
    expect(getCached).not.toHaveBeenCalled();
    expect(urlForId).not.toHaveBeenCalled();
  });

  it('generateMetadata on a miss stays noindex and never blocks on a roast', async () => {
    getCached.mockResolvedValue(null);
    urlForId.mockResolvedValue(URL_);
    const { generateMetadata } = await import('@/app/r/[id]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ id: ID }) });
    expect(meta.robots).toEqual({ index: false });
    expect(meta.openGraph).toBeUndefined();
  });
});

// The page tests above stub RoastApp; the rest need the real component.
function useRealRoastApp() {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('@/components/RoastApp');
  });
}

describe('healTarget', () => {
  useRealRoastApp();

  it('returns the URL to auto-roast when there is no result yet', async () => {
    const { healTarget } = await import('@/components/RoastApp');
    expect(healTarget({ resolveUrl: URL_ })).toBe(URL_);
    expect(healTarget({ resolveUrl: URL_, initialResult: undefined })).toBe(URL_);
  });

  it('is null when a result is already there, or there is nothing to resolve', async () => {
    const { healTarget } = await import('@/components/RoastApp');
    expect(healTarget({ resolveUrl: URL_, initialResult: fakeResult() })).toBeNull();
    expect(healTarget({})).toBeNull();
    expect(healTarget({ resolveUrl: '' })).toBeNull();
    expect(healTarget({ resolveUrl: '   ' })).toBeNull();
  });
});

describe('RoastApp while healing a link', () => {
  useRealRoastApp();

  async function app(props: Record<string, unknown>): Promise<string> {
    const { RoastApp } = await import('@/components/RoastApp');
    return renderToStaticMarkup(createElement(RoastApp, props));
  }

  it('renders the standard loading state straight away, with the site prefilled', async () => {
    const html = await app({ resolveUrl: URL_, initialUrl: 'stripe.com' });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('fetching the page');
    expect(html).toContain('value="stripe.com"');
  });

  it('shows neither the expired notice nor Re-roast nor the idle marketing blocks', async () => {
    const html = await app({ resolveUrl: URL_, initialUrl: 'stripe.com', showcase: fakeResult() });
    expect(html).not.toContain('That roast has expired');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('Re-roast');
    expect(html).not.toContain('What we actually measure');
    expect(html).not.toContain('id="example"');
  });

  it('is inert without resolveUrl: the plain homepage is byte-identical', async () => {
    const plain = await app({});
    expect(plain).not.toContain('aria-busy="true"');
    expect(await app({ resolveUrl: undefined })).toBe(plain);
  });

  it('does not heal over a result that is already there', async () => {
    const html = await app({
      resolveUrl: URL_,
      initialResult: fakeResult(),
      initialUrl: 'stripe.com',
    });
    expect(html).not.toContain('aria-busy="true"');
    expect(html).toContain('Roast yours'); // the normal shared-card view
  });
});
