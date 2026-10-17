import { describe, expect, it } from 'vitest';
import { extractFacts } from '@/lib/extract';
import {
  ctaAudit,
  fiveSecondRead,
  jargonDensity,
  jargonHits,
  lensEvidence,
  slopMarkers,
} from '@/lib/lens';

const facts = (body: string, head = '') =>
  extractFacts(`<html><head>${head}</head><body>${body}</body></html>`, 'https://x.com/');

describe('jargon detection', () => {
  it('finds filler in the hero copy', () => {
    const f = facts('<h1>Seamlessly unlock next-generation synergy</h1>');
    expect(jargonHits(f)).toEqual(expect.arrayContaining(['seamlessly', 'unlock', 'next-generation']));
  });

  it('finds nothing in plain copy', () => {
    const f = facts('<h1>Send invoices from your phone</h1><p>Get paid in two days.</p>');
    expect(jargonHits(f)).toEqual([]);
    expect(jargonDensity(f)).toBe(0);
  });

  it('measures density, not raw count, so long pages are not punished', () => {
    const short = facts('<h1>Seamless robust scalable</h1>');
    const long = facts(
      `<h1>Seamless invoicing</h1><p>${'We send invoices to your customers every week. '.repeat(20)}</p>`,
    );
    expect(jargonDensity(short)).toBeGreaterThan(jargonDensity(long));
  });
});

describe('the five-second test', () => {
  it('passes a page that names the thing, the reader and the payoff', () => {
    const f = facts(
      '<h1>Ship software in days</h1><p>The issue tracker developers use to build and ship faster.</p>',
    );
    expect(fiveSecondRead(f)).toMatchObject({
      namesWhat: true,
      namesWho: true,
      namesOutcome: true,
      answered: 3,
    });
  });

  it('fails a page of pure abstraction', () => {
    const f = facts('<h1>Empowering excellence through innovation</h1>');
    expect(fiveSecondRead(f).answered).toBeLessThanOrEqual(1);
  });
});

describe('the CTA audit', () => {
  it('flags a button that asks for nothing', () => {
    expect(ctaAudit(facts('<h1>Hi</h1><a href="#">Learn more</a>')).generic).toBe(true);
    expect(ctaAudit(facts('<h1>Hi</h1><a href="#">Get started</a>')).generic).toBe(true);
  });

  it('accepts a real ask', () => {
    const a = ctaAudit(facts('<h1>Hi</h1><a href="#">Start building</a>'));
    expect(a.generic).toBe(false);
    expect(a.missing).toBe(false);
    expect(a.primary).toBe('Start building');
  });

  it('notices there is no ask at all', () => {
    expect(ctaAudit(facts('<h1>Hi</h1><p>words</p>')).missing).toBe(true);
  });

  it('does not call a normal marketing page competing', () => {
    const f = facts(
      '<h1>Hi</h1><a href="#">Start free</a><a href="#">Book a demo</a><a href="#">Buy</a>',
    );
    expect(ctaAudit(f).competing).toBe(false);
  });

  it('notices seven asks genuinely competing', () => {
    const f = facts(
      '<h1>Hi</h1><a href="#">Start free</a><a href="#">Book a demo</a><a href="#">Try now</a><a href="#">Buy</a><a href="#">Join</a><a href="#">Download</a><a href="#">Install</a>',
    );
    expect(ctaAudit(f).competing).toBe(true);
  });

  it('keeps the only ask on a spare page, even though it is also the nav', () => {
    const f = facts('<nav><a href="#go">Roast my site</a></nav>');
    expect(ctaAudit(f).missing).toBe(false);
    expect(ctaAudit(f).primary).toBe('Roast my site');
  });

  it('does not promote an ordinary menu of destinations into an ask', () => {
    const f = facts('<nav><a href="/">Home</a><a href="/a">About</a><a href="/b">Blog</a></nav>');
    expect(ctaAudit(f).missing).toBe(true);
  });
});

describe('slop markers', () => {
  it('points only at things actually on the page', () => {
    const f = facts('<h1>Unlock seamless next-generation synergy solutions</h1><a href="#">Learn more</a>');
    const m = slopMarkers(f);
    expect(m).toEqual(expect.arrayContaining([
      'jargon-dense',
      'never-says-what-it-is',
      'cta-asks-for-nothing',
      'no-proof-of-anything',
    ]));
  });

  it('stays quiet on a page that does the work', () => {
    const f = facts(
      `<h1>Ship software in days</h1>
       <p>The issue tracker developers use to plan and ship faster.</p>
       <a href="/signup">Start building</a>
       <h2>Trusted by 10,000 teams</h2><h2>Pricing</h2>
       <p>What our customers say: teams close 40% more issues. $8 per month.</p>`,
      `<title>Linear</title><meta name="description" content="Ship software"><meta property="og:image" content="/o.png"><link rel="icon" href="/f.ico">`,
    );
    expect(slopMarkers(f)).toEqual([]);
  });

  it('does not mistake a hyphenated word for a stuffed title', () => {
    const f = facts('<h1>Hi</h1>', '<title>FlowSync — the all-in-one state-of-the-art thing</title>');
    expect(slopMarkers(f)).not.toContain('keyword-stuffed-title');
  });

  it('does flag a genuinely stuffed title', () => {
    const f = facts('<h1>Hi</h1>', '<title>Acme | AI Solutions | Platform | Enterprise</title>');
    expect(slopMarkers(f)).toContain('keyword-stuffed-title');
  });
});

describe('lensEvidence', () => {
  it('hands the model measurements rather than adjectives', () => {
    const e = lensEvidence(facts('<h1>Seamless synergy</h1>')) as Record<string, unknown>;
    expect(Object.keys(e)).toEqual(
      expect.arrayContaining(['five_second_test', 'jargon_found', 'cta', 'proof', 'craft', 'slop_markers']),
    );
    expect(Array.isArray(e.slop_markers)).toBe(true);
  });
});
