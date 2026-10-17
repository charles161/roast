import { describe, expect, it } from 'vitest';
import type { JevAnswer } from '@/lib/gateway';
import {
  calibrate,
  CALIBRATION_KNEE,
  heuristicScores,
  LADDER_LEVELS,
  normalizeScore,
  probabilityToHundred,
  readSubScore,
  SUB_KEYS,
  weightedOverall,
} from '@/lib/score';
import { extractFacts } from '@/lib/extract';

describe('normalizeScore', () => {
  it('normalizes an ordinal score by the top rung index, not by 100', () => {
    // 5 rungs -> levels 0..4, so a raw 2 is the midpoint.
    expect(normalizeScore(2, 5)).toBe(50);
    expect(normalizeScore(0, 5)).toBe(0);
    expect(normalizeScore(4, 5)).toBe(100);
    expect(normalizeScore(1.63, 5)).toBe(41);
  });

  it('handles a two-rung question as a plain 0..1', () => {
    expect(normalizeScore(0.44, 2)).toBe(44);
  });

  it('clamps out-of-range values', () => {
    expect(normalizeScore(9, 5)).toBe(100);
    expect(normalizeScore(-3, 5)).toBe(0);
  });

  it('falls back to 50 on a non-numeric score', () => {
    expect(normalizeScore(undefined, 5)).toBe(50);
    expect(normalizeScore(NaN, 5)).toBe(50);
    expect(normalizeScore('nope', 5)).toBe(50);
  });

  it('never divides by zero on a degenerate single-rung question', () => {
    expect(normalizeScore(1, 1)).toBe(100);
    expect(normalizeScore(0, 1)).toBe(0);
  });
});

describe('probabilityToHundred', () => {
  it('scales a 0..1 probability', () => {
    expect(probabilityToHundred(0.87)).toBe(87);
    expect(probabilityToHundred(0)).toBe(0);
    expect(probabilityToHundred(1)).toBe(100);
  });

  it('falls back to 50 on junk', () => {
    expect(probabilityToHundred(null)).toBe(50);
  });
});

describe('readSubScore', () => {
  const answers = (a: Record<string, JevAnswer>) => a;

  it('reads a score answer against that ladder length', () => {
    const a = answers({ hero: { type: 'score', score: 2 } });
    expect(readSubScore(a, 'hero')).toBe(50);
    expect(LADDER_LEVELS.hero).toBe(5);
  });

  it('accepts a boolean answer as a probability', () => {
    const a = answers({ trust: { type: 'boolean', probability: 0.3 } });
    expect(readSubScore(a, 'trust')).toBe(30);
  });

  it('returns a neutral 50 when the answer is missing', () => {
    expect(readSubScore(answers({}), 'specificity')).toBe(50);
    expect(readSubScore(undefined, 'specificity')).toBe(50);
  });

  it('returns a neutral 50 when the answer is the wrong type', () => {
    const a = answers({ craft: { type: 'choice', choice: 'developers' } });
    expect(readSubScore(a, 'craft')).toBe(50);
  });
});

describe('weightedOverall', () => {
  const only = (k: string, v: number) =>
    weightedOverall(
      Object.fromEntries(SUB_KEYS.map((s) => [s, s === k ? v : 0])) as never,
    );

  it('applies Schaad weighting: hero 30, craft 25, specifics 20, proof 15, cta 10', () => {
    expect(only('hero', 100)).toBe(30);
    expect(only('craft', 100)).toBe(25);
    expect(only('specificity', 100)).toBe(20);
    expect(only('trust', 100)).toBe(15);
    expect(only('cta', 100)).toBe(10);
  });

  it('weights sum to a full 100, so the scale is actually reachable', () => {
    const all = (v: number) =>
      weightedOverall(Object.fromEntries(SUB_KEYS.map((k) => [k, v])) as never);
    expect(all(100)).toBe(100);
    expect(all(0)).toBe(1);
  });

  it('stays inside 0..100 for a plausible mix', () => {
    const v = weightedOverall({ hero: 28, specificity: 58, trust: 65, craft: 81, cta: 40 });
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(100);
  });
});

describe('calibrate', () => {
  it('leaves everything at or below the knee exactly as measured', () => {
    expect(calibrate(0)).toBe(0);
    expect(calibrate(30)).toBe(30);
    expect(calibrate(50)).toBe(50);
    expect(calibrate(CALIBRATION_KNEE)).toBe(CALIBRATION_KNEE);
  });

  it('spreads the top rung across the last points, so 100 is reachable', () => {
    expect(calibrate(100)).toBe(100);
    // A page Jev is confident sits on the top rung lands near 3.8/4 -> 95 raw.
    expect(calibrate(95)).toBeGreaterThanOrEqual(95);
    expect(calibrate(90)).toBeGreaterThan(90);
  });

  it('is monotonic and never leaves 0..100', () => {
    let prev = -1;
    for (let x = 0; x <= 100; x += 1) {
      const y = calibrate(x);
      expect(y).toBeGreaterThanOrEqual(prev);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
      prev = y;
    }
  });

  it('clamps junk input rather than propagating it', () => {
    expect(calibrate(-20)).toBe(0);
    expect(calibrate(140)).toBe(100);
  });
});

/**
 * CALIBRATION. The instrument is only useful if the top of the scale is
 * reachable and the bottom is deserved. These fixtures are the reference
 * points: a Linear/Stripe-tier page, a typical vibe-coded SaaS page, and
 * something with nothing on it at all.
 */
const WORLD_CLASS = `<html><head>
  <title>Linear \u2014 Plan and build products</title>
  <meta name="description" content="Linear is the issue tracker developers use to plan, track, and ship software.">
  <meta property="og:image" content="/og.png">
  <link rel="icon" href="/favicon.ico">
</head><body>
  <h1>Plan and build products</h1>
  <p>Linear is the issue tracker developers use to ship software in days, not quarters.</p>
  <a href="/signup">Start building</a>
  <h2>Trusted by 10,000 teams</h2>
  <h2>Pricing</h2>
  <p>What our customers say: teams at Vercel and Ramp close 40% more issues every week.</p>
  <p>$8 per user per month. Free for small teams.</p>
  <img src="a"><img src="b"><img src="c">
</body></html>`;

const VIBE_CODED = `<html><head>
  <title>FlowSync \u2014 The all-in-one platform for modern teams</title>
  <meta name="description" content="FlowSync helps teams streamline their workflow with powerful automation.">
  <meta property="og:image" content="/og.png">
  <link rel="icon" href="/f.ico">
</head><body>
  <h1>The all-in-one platform for modern teams</h1>
  <p>FlowSync empowers teams to streamline workflows and unlock productivity with seamless automation.</p>
  <a href="#">Get started</a>
  <h2>Features</h2><h2>How it works</h2>
  <img src="a"><img src="b"><img src="c">
</body></html>`;

const EMPTY = `<html><head><title>Home</title></head><body><p>hi</p></body></html>`;

const scoreOf = (html: string) => heuristicScores(extractFacts(html, 'https://x.com/'));

describe('lens calibration', () => {
  it('rates a world-class page in the 90s, so 100 is actually reachable', () => {
    expect(scoreOf(WORLD_CLASS).overall).toBeGreaterThanOrEqual(90);
  });

  it('rates typical vibe-coded slop in the 30s-40s', () => {
    const v = scoreOf(VIBE_CODED).overall;
    expect(v).toBeGreaterThanOrEqual(25);
    expect(v).toBeLessThanOrEqual(50);
  });

  it('separates the two by a wide, unambiguous margin', () => {
    expect(scoreOf(WORLD_CLASS).overall - scoreOf(VIBE_CODED).overall).toBeGreaterThanOrEqual(40);
  });

  it('rates an empty page below the slop', () => {
    expect(scoreOf(EMPTY).overall).toBeLessThan(scoreOf(VIBE_CODED).overall);
  });

  it('gives the world-class page the hero and proof it earns', () => {
    const s = scoreOf(WORLD_CLASS).subs;
    expect(s.hero).toBeGreaterThanOrEqual(90);
    expect(s.trust).toBeGreaterThanOrEqual(90);
    expect(s.specificity).toBeGreaterThanOrEqual(90);
  });

  it('marks the vibe-coded page down on hero, specifics and proof', () => {
    const s = scoreOf(VIBE_CODED).subs;
    expect(s.hero).toBeLessThan(55);
    expect(s.specificity).toBeLessThan(55);
    expect(s.trust).toBeLessThan(40);
  });
});

describe('a confident Jev verdict reaches the top of the scale', () => {
  // Jev answers with an expected rung index, so "certain top rung" is ~3.8/4.
  const profile = (raw: number) =>
    weightedOverall(
      Object.fromEntries(
        SUB_KEYS.map((k) => [k, readSubScore({ [k]: { type: 'score', score: raw } }, k)]),
      ) as never,
    );

  it('scores a confident top-rung page ~95 or better', () => {
    expect(profile(3.8)).toBeGreaterThanOrEqual(95);
  });

  it('scores a perfect answer exactly 100', () => {
    expect(profile(4)).toBe(100);
  });

  it('leaves a slop verdict where it belongs', () => {
    expect(profile(1.4)).toBeLessThanOrEqual(45);
    expect(profile(1.4)).toBeGreaterThanOrEqual(25);
  });
});

describe('heuristicScores fallback', () => {
  const page = (body: string, head = '') =>
    extractFacts(`<html><head>${head}</head><body>${body}</body></html>`, 'https://x.com/');

  it('scores a bare page low and a rich page higher', () => {
    const bare = heuristicScores(page('<p>hi</p>'));
    const rich = heuristicScores(
      page(
        `<h1>Ship your app in 90 seconds</h1>
         <h2>Trusted by 4,000 teams</h2><h2>Pricing</h2>
         <p>What our customers say about shipping faster every week with real numbers.</p>
         <a href="/x">Start free</a><img src="a"><img src="b"><img src="c">
         <p>$29 per month</p>`,
        `<title>Ship</title><meta name="description" content="Deploy fast"><meta property="og:image" content="/o.png"><link rel="icon" href="/f.ico">`,
      ),
    );
    expect(rich.overall).toBeGreaterThan(bare.overall);
  });

  it('answers on every dimension of the rubric', () => {
    const s = heuristicScores(page('<h1>Hi</h1>')).subs;
    for (const k of SUB_KEYS) expect(typeof s[k]).toBe('number');
  });

  it('always produces in-range sub-scores', () => {
    for (const s of Object.values(heuristicScores(page('')).subs)) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});
