import { describe, expect, it } from 'vitest';
import type { JevAnswer } from '@/lib/gateway';
import {
  heuristicScores,
  LADDER_LEVELS,
  normalizeScore,
  probabilityToHundred,
  readSubScore,
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
    const a = answers({ hook: { type: 'score', score: 2 } });
    expect(readSubScore(a, 'hook')).toBe(50);
    expect(LADDER_LEVELS.hook).toBe(5);
  });

  it('accepts a boolean answer as a probability', () => {
    const a = answers({ trust: { type: 'boolean', probability: 0.3 } });
    expect(readSubScore(a, 'trust')).toBe(30);
  });

  it('returns a neutral 50 when the answer is missing', () => {
    expect(readSubScore(answers({}), 'clarity')).toBe(50);
    expect(readSubScore(undefined, 'clarity')).toBe(50);
  });

  it('returns a neutral 50 when the answer is the wrong type', () => {
    const a = answers({ design: { type: 'choice', choice: 'developers' } });
    expect(readSubScore(a, 'design')).toBe(50);
  });
});

describe('weightedOverall', () => {
  it('weights hook and clarity at 30% each, trust and design at 20%', () => {
    expect(weightedOverall({ hook: 100, clarity: 0, trust: 0, design: 0 })).toBe(30);
    expect(weightedOverall({ hook: 0, clarity: 0, trust: 100, design: 0 })).toBe(20);
  });

  it('is 100 when everything is perfect and 1 at the floor', () => {
    expect(weightedOverall({ hook: 100, clarity: 100, trust: 100, design: 100 })).toBe(100);
    expect(weightedOverall({ hook: 0, clarity: 0, trust: 0, design: 0 })).toBe(1);
  });

  it('stays inside 0..100 for a plausible mix', () => {
    const v = weightedOverall({ hook: 28, clarity: 58, trust: 65, design: 81 });
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(100);
    expect(v).toBe(55);
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

  it('always produces in-range sub-scores', () => {
    for (const s of Object.values(heuristicScores(page('')).subs)) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
});
