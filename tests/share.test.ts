import { describe, expect, it } from 'vitest';
import {
  clampText,
  quoteWrap,
  teaser,
  tweetLength,
  tweetText,
  WORDMARK,
  xIntentUrl,
} from '@/lib/share';
import type { RoastResult } from '@/lib/types';

function result(over: Partial<RoastResult> = {}): RoastResult {
  return {
    id: 'abcdefghijkl',
    url: 'https://example.com/',
    displayUrl: 'example.com',
    siteName: 'Example',
    favicon: '',
    createdAt: 0,
    score: {
      overall: 59,
      subs: [
        { key: 'hero', label: 'Hero', score: 41, reason: 'r' },
        { key: 'specificity', label: 'Specifics', score: 60, reason: 'r' },
        { key: 'trust', label: 'Proof', score: 63, reason: 'r' },
        { key: 'craft', label: 'Craft', score: 81, reason: 'r' },
        { key: 'cta', label: 'CTA', score: 55, reason: 'r' },
      ],
    },
    roast: ['First roast line.', 'Second line.'],
    verdict: 'Lofty principles, thin on plain English.',
    before: { headline: 'Before headline', subhead: 'b', cta: 'b' },
    after: { headline: 'After headline', subhead: 'a', cta: 'a' },
    fixes: ['one', 'two', 'three'],
    ...over,
  };
}

describe('clampText', () => {
  it('leaves a short string alone', () => {
    expect(clampText('hello', 20)).toBe('hello');
  });

  it('collapses whitespace and trims', () => {
    expect(clampText('  a \n  b  ', 20)).toBe('a b');
  });

  it('cuts with an ellipsis and no trailing space', () => {
    expect(clampText('one two three', 9)).toBe('one two…');
    expect(clampText('one two three', 9).length).toBeLessThanOrEqual(9);
  });

  it('survives a zero or negative budget', () => {
    expect(clampText('abc', 0)).toBe('');
    expect(clampText('abc', -5)).toBe('');
  });
});

describe('teaser', () => {
  it('prefers the verdict', () => {
    expect(teaser(result(), 200)).toBe('Lofty principles, thin on plain English.');
  });

  it('falls back to the first roast line when there is no verdict', () => {
    expect(teaser(result({ verdict: '' }), 200)).toBe('First roast line.');
  });

  it('strips matching outer quotes so we never nest them', () => {
    expect(teaser(result({ verdict: '“Quoted verdict”' }), 200)).toBe('Quoted verdict');
    expect(teaser(result({ verdict: '"Quoted verdict"' }), 200)).toBe('Quoted verdict');
  });

  it('keeps an unmatched quote, which is part of the sentence', () => {
    expect(teaser(result({ verdict: 'It says "synergy" twice' }), 200)).toBe(
      'It says "synergy" twice',
    );
  });

  it('returns an empty string when there is nothing to quote', () => {
    expect(teaser(result({ verdict: '', roast: [] }), 200)).toBe('');
  });
});

describe('tweetText', () => {
  it('leads with the domain and the score', () => {
    expect(tweetText(result())).toContain('example.com scored 59/100.');
  });

  it('quotes the verdict and ends with the call to action', () => {
    const t = tweetText(result());
    expect(t).toContain('“Lofty principles, thin on plain English.”');
    expect(t.endsWith('Roast yours →')).toBe(true);
  });

  it('stays inside the 280 limit once the link is counted', () => {
    expect(tweetLength(result())).toBeLessThanOrEqual(280);
  });

  it('stays inside the limit even with a very long verdict and domain', () => {
    const r = result({
      verdict: 'x'.repeat(400),
      displayUrl: 'a-really-long-subdomain.an-even-longer-domain-name.example.com/some/deep/path',
      score: { ...result().score, overall: 100 },
    });
    expect(tweetLength(r)).toBeLessThanOrEqual(280);
  });
});

describe('xIntentUrl', () => {
  it('puts the text and the link in separate params', () => {
    const u = new URL(xIntentUrl(result(), 'https://roast.lightslips.ai/r/abcdefghijkl'));
    expect(u.origin + u.pathname).toBe('https://twitter.com/intent/tweet');
    expect(u.searchParams.get('url')).toBe('https://roast.lightslips.ai/r/abcdefghijkl');
    expect(u.searchParams.get('text')).toBe(tweetText(result()));
  });

  it('omits the url param when there is no share link yet', () => {
    const u = new URL(xIntentUrl(result(), ''));
    expect(u.searchParams.has('url')).toBe(false);
  });
});

describe('WORDMARK', () => {
  it('is the public host, so every screenshot carries it', () => {
    expect(WORDMARK).toBe('roast.lightslips.ai');
  });
});

describe('quoteWrap', () => {
  it('adds curly quotes to a plain line', () => {
    expect(quoteWrap('Nice try.')).toBe('“Nice try.”');
  });

  it('leaves a line that already opens with a quote alone', () => {
    const line = '"Financial infrastructure" is what a vending machine would say.';
    expect(quoteWrap(line)).toBe(line);
    expect(quoteWrap('“Synergy”, apparently.')).toBe('“Synergy”, apparently.');
  });

  it('returns an empty string for nothing', () => {
    expect(quoteWrap('')).toBe('');
    expect(quoteWrap('   ')).toBe('');
  });
});
