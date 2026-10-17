import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PageFacts } from '@/lib/extract';
import { extractFacts } from '@/lib/extract';
import { heuristicScores } from '@/lib/score';

/**
 * CALIBRATION against real pages.
 *
 * These fixtures are captured `PageFacts` — the actual parse of stripe.com,
 * linear.app, vercel.com and google.com, not hand-written mock-ups. They are
 * the anchors for the whole scale: if a change moves these numbers, it has
 * changed what the product claims, and that should be deliberate.
 *
 * What is exercised here is the deterministic rubric in `score.ts`, which is
 * also the Jev-outage fallback. The live scorer reads strictly more than this
 * (the full hero copy, the headings, the lens evidence), so these are the
 * conservative floor, not the expected live number.
 */
const fixture = (name: string): PageFacts =>
  JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'tests/fixtures', `${name}.json`), 'utf8'),
  ) as PageFacts;

const score = (name: string) => heuristicScores(fixture(name)).overall;

describe('world-class pages', () => {
  it('rates stripe.com at 90 or better', () => {
    expect(score('stripe')).toBeGreaterThanOrEqual(90);
  });

  it('rates linear.app at 90 or better', () => {
    expect(score('linear')).toBeGreaterThanOrEqual(90);
  });

  it('rates vercel.com as strong', () => {
    expect(score('vercel')).toBeGreaterThanOrEqual(85);
  });

  it('gives them credit on the dimensions they actually earn', () => {
    const s = heuristicScores(fixture('linear')).subs;
    expect(s.hero).toBeGreaterThanOrEqual(90);
    expect(s.specificity).toBeGreaterThanOrEqual(90);
    expect(s.craft).toBeGreaterThanOrEqual(85);
  });

  it('does not mistake a real nav for competing calls to action', () => {
    for (const n of ['stripe', 'linear', 'vercel']) {
      expect(heuristicScores(fixture(n)).subs.cta).toBeGreaterThanOrEqual(85);
    }
  });
});

describe('an app shell is not a landing page', () => {
  it('rates google.com between 10 and 25', () => {
    const v = score('google');
    expect(v).toBeGreaterThanOrEqual(10);
    expect(v).toBeLessThanOrEqual(25);
  });

  it('collapses the messaging dimensions when there is no hero', () => {
    const s = heuristicScores(fixture('google')).subs;
    expect(s.hero).toBeLessThan(20);
    expect(s.cta).toBeLessThan(45);
  });
});

describe('generated slop', () => {
  const SLOP = `<html><head>
    <title>FlowSync — The all-in-one platform for modern teams</title>
    <meta name="description" content="FlowSync helps teams streamline their workflow with powerful automation.">
    <meta property="og:image" content="/og.png"><link rel="icon" href="/f.ico">
  </head><body>
    <h1>The all-in-one platform for modern teams</h1>
    <p>FlowSync empowers teams to streamline workflows and unlock productivity with seamless automation.</p>
    <a href="#">Get started</a>
    <h2>Features</h2><h2>How it works</h2>
    <img src="a"><img src="b"><img src="c">
  </body></html>`;

  it('rates a vibe-coded SaaS page between 30 and 48', () => {
    const v = heuristicScores(extractFacts(SLOP, 'https://x.com/')).overall;
    expect(v).toBeGreaterThanOrEqual(30);
    expect(v).toBeLessThanOrEqual(48);
  });

  it('sits far below every real page in the fixture set', () => {
    const slop = heuristicScores(extractFacts(SLOP, 'https://x.com/')).overall;
    for (const n of ['stripe', 'linear', 'vercel']) {
      expect(score(n) - slop).toBeGreaterThanOrEqual(40);
    }
  });
});

describe('the top of the scale is reachable', () => {
  /**
   * A page that does everything the rubric asks. This mirrors the shape of
   * our own home page — hook, grounded subhead, one ask, a real example, a
   * real number — because the bar for this release is that our own site can
   * reach the top of our own scale.
   */
  const EXEMPLARY = `<html><head>
    <title>Roast \u2014 score your landing page out of 100</title>
    <meta name="description" content="Paste a URL. We roast your landing page, score it out of 100, and hand you the rewrite.">
    <meta property="og:image" content="/og.png"><link rel="icon" href="/icon.svg">
  </head><body>
    <h1>Your landing page is probably lying to you</h1>
    <p>Paste a URL and we roast your landing page, score it out of 100, and hand you the rewrite. Free.</p>
    <button type="submit">Roast my site</button>
    <h2>What we measure</h2><h2>A real roast</h2>
    <p>1,200 pages roasted in the last 24 hours. Used by founders and developers.</p>
    <a href="/r/abc">See the full roast</a>
    <p>Free. No account. $0 per month.</p>
    <img src="a"><img src="b"><img src="c">
  </body></html>`;

  it('scores a page that does everything at 95 or better', () => {
    expect(heuristicScores(extractFacts(EXEMPLARY, 'https://x.com/')).overall).toBeGreaterThanOrEqual(95);
  });
});
