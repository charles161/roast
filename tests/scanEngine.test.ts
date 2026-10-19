import { describe, expect, it } from 'vitest';
import {
  BOX_CENTROIDS,
  BOX_COUNT,
  MODES,
  VERDICT,
  LENS_H,
  LENS_PAD,
  beamY,
  clamp,
  easeInOut,
  easeOut,
  hash,
  lensModeForLoading,
  mix,
  paintOrder,
  projectZ,
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

describe('easeInOut', () => {
  it('maps the ends through and is symmetric at the midpoint', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
  });
  it('clamps its input so it never overshoots', () => {
    expect(easeInOut(-3)).toBe(0);
    expect(easeInOut(4)).toBe(1);
  });
  it('eases in and out — flat at both ends, steep in the middle', () => {
    // derivative is 0 at the ends, so early/late steps move less than middle steps
    const early = easeInOut(0.1) - easeInOut(0);
    const middle = easeInOut(0.55) - easeInOut(0.45);
    expect(middle).toBeGreaterThan(early);
    let prev = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const v = easeInOut(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('projectZ', () => {
  it('is the identity on z when the board faces the camera', () => {
    // yaw=0, pitch=0: a point keeps its own z as its camera depth.
    expect(projectZ(5, 9, 20, 0, 0)).toBeCloseTo(20, 6);
    expect(projectZ(-40, 130, -9, 0, 0)).toBeCloseTo(-9, 6);
  });
  it('treats larger depth as nearer the camera', () => {
    // A block extruded further off the page (higher z) is always in front.
    for (const yaw of [-0.5, -0.2, 0, 0.3]) {
      for (const pitch of [0, 0.12, 0.25]) {
        expect(projectZ(0, 0, 40, yaw, pitch)).toBeGreaterThan(projectZ(0, 0, 0, yaw, pitch));
      }
    }
  });
  it('matches the closed form on the view axis', () => {
    const yaw = -0.33;
    const pitch = 0.12;
    expect(projectZ(0, 0, 30, yaw, pitch)).toBeCloseTo(30 * Math.cos(yaw) * Math.cos(pitch), 6);
  });
});

describe('paintOrder (painter back-to-front)', () => {
  const YAWS = Array.from({ length: 24 }, (_, i) => -Math.PI / 2 + (i * Math.PI) / 23);
  const PITCHES = [-0.4, -0.1, 0, 0.12, 0.25, 0.5];

  it('never culls a drawable — every box is painted at every angle', () => {
    for (const yaw of YAWS) {
      for (const pitch of PITCHES) {
        const order = paintOrder(yaw, pitch);
        expect(order).toHaveLength(BOX_COUNT);
        // a true permutation of 0..N-1: nothing missing, nothing duplicated
        expect(new Set(order).size).toBe(BOX_COUNT);
        expect(Math.min(...order)).toBe(0);
        expect(Math.max(...order)).toBe(BOX_COUNT - 1);
      }
    }
  });

  it('always paints the background board first, so it can never occlude the page', () => {
    // The slab (index 0) is the one frame box; it must lead the order at any pose.
    for (const yaw of YAWS) {
      for (const pitch of PITCHES) {
        expect(paintOrder(yaw, pitch)[0]).toBe(0);
      }
    }
  });

  it('orders the page blocks strictly back-to-front by camera depth', () => {
    // Every block after the backdrop is non-decreasing in projected depth —
    // recomputed from the real centroids, so this is the genuine sort invariant.
    for (const yaw of YAWS) {
      for (const pitch of PITCHES) {
        const order = paintOrder(yaw, pitch);
        let prev = -Infinity;
        for (let i = 1; i < order.length; i++) {
          const [cx, cy, cz] = BOX_CENTROIDS[order[i]];
          const d = projectZ(cx, cy, cz, yaw, pitch);
          expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
          prev = d;
        }
      }
    }
  });

  it('keeps the background board behind every page block it overlaps', () => {
    // The regression: at a downward pitch the slab centroid used to sort in
    // front of the upper blocks and paint over them. The board (index 0) must
    // now sit at or behind the furthest page block at every tested pose.
    for (const yaw of YAWS) {
      for (const pitch of PITCHES) {
        const order = paintOrder(yaw, pitch);
        expect(order[0]).toBe(0); // board painted first
      }
    }
  });

  it('is deterministic for a given pose', () => {
    expect(paintOrder(-0.33, 0.12)).toEqual(paintOrder(-0.33, 0.12));
  });
});
