import { describe, expect, it } from 'vitest';
import {
  MODES,
  VERDICT,
  LENS_H,
  LENS_PAD,
  beamY,
  clamp,
  easeOut,
  hash,
  lensModeForLoading,
  mix,
  rgba,
} from '@/lib/scanEngine';

describe('clamp', () => {
  it('passes through a value in range and pins the ends', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(9, 0, 1)).toBe(1);
  });
});

describe('mix', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    expect(mix([0, 0, 0], [100, 200, 40], 0)).toEqual([0, 0, 0]);
    expect(mix([0, 0, 0], [100, 200, 40], 1)).toEqual([100, 200, 40]);
  });
  it('interpolates component-wise at the midpoint', () => {
    expect(mix([0, 0, 0], [100, 200, 40], 0.5)).toEqual([50, 100, 20]);
  });
});

describe('rgba', () => {
  it('formats to three fixed decimals and truncates channels to ints', () => {
    expect(rgba([204, 255, 63], 0.5)).toBe('rgba(204,255,63,0.500)');
    expect(rgba([10.9, 10.1, 10.5], 0.1)).toBe('rgba(10,10,10,0.100)');
  });
  it('clamps alpha to [0,1]', () => {
    expect(rgba([0, 0, 0], -1)).toBe('rgba(0,0,0,0.000)');
    expect(rgba([0, 0, 0], 2)).toBe('rgba(0,0,0,1.000)');
  });
});

describe('easeOut', () => {
  it('maps 0->0 and 1->1 and eases in between', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeCloseTo(0.875, 6);
  });
  it('clamps its input, so it never overshoots', () => {
    expect(easeOut(-5)).toBe(0);
    expect(easeOut(5)).toBe(1);
  });
  it('is monotonic increasing', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const v = easeOut(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('hash', () => {
  it('is deterministic for a given input', () => {
    expect(hash(1)).toBe(hash(1));
    expect(hash(42.5)).toBe(hash(42.5));
  });
  it('stays within [0,1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = hash(i * 1.37);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('separates different inputs', () => {
    expect(hash(1)).not.toBe(hash(2));
  });
});

describe('beamY', () => {
  it('sits off the top before the sweep starts', () => {
    expect(beamY(-1)).toBe(0);
  });
  it('runs from above the page to below it, through centre at the midpoint', () => {
    expect(beamY(0)).toBe(-(LENS_PAD + LENS_H / 2));
    expect(beamY(0.5)).toBeCloseTo(0, 6);
    expect(beamY(1)).toBe(LENS_PAD + LENS_H / 2);
  });
  it('honours explicit page dimensions', () => {
    expect(beamY(0.5, 200, 10)).toBeCloseTo(0, 6);
    expect(beamY(1, 200, 10)).toBe(10 + 100);
  });
});

describe('MODES', () => {
  it('exposes both modes with the full config shape', () => {
    for (const key of ['ambient', 'scanning'] as const) {
      const m = MODES[key];
      for (const field of ['P', 'sweep', 'hold', 'tau', 'beam', 'swing', 'sparks']) {
        expect(typeof (m as unknown as Record<string, number>)[field]).toBe('number');
      }
    }
  });
  it('scanning is the busier pass: shorter period, more sparks', () => {
    expect(MODES.scanning.P).toBeLessThan(MODES.ambient.P);
    expect(MODES.scanning.sparks).toBeGreaterThan(MODES.ambient.sparks);
  });
});

describe('VERDICT', () => {
  it('maps the five rubric criteria to a colour, a verdict word, and a label', () => {
    expect(Object.keys(VERDICT).sort()).toEqual(
      ['cta', 'craft', 'hero', 'proof', 'specifics'].sort(),
    );
    // craft is the one "sharp" exemplar — acid green.
    expect(VERDICT.craft[1]).toBe('SHARP');
    expect(VERDICT.craft[2]).toBe('CRAFT');
    expect(VERDICT.craft[0]).toEqual([204, 255, 63]);
  });
});

describe('lensModeForLoading', () => {
  it('scans while loading and idles otherwise', () => {
    expect(lensModeForLoading(true)).toBe('scanning');
    expect(lensModeForLoading(false)).toBe('ambient');
  });
});
