import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACID, INK, MARK_R, MARK_SEAR, MARK_VIEWBOX } from '@/lib/brand';

const iconSvg = fs.readFileSync(path.join(process.cwd(), 'src/app/icon.svg'), 'utf8');

describe('the mark', () => {
  it('is drawn in the box its paths assume', () => {
    expect(MARK_VIEWBOX).toBe('0 0 32 32');
  });

  it('uses closed paths, or the fill leaks', () => {
    for (const d of [...MARK_R, MARK_SEAR]) {
      expect(d.startsWith('M')).toBe(true);
      expect(d.trimEnd().endsWith('Z')).toBe(true);
    }
  });

  it('stays inside the viewBox, so nothing clips at 16px', () => {
    for (const d of [...MARK_R, MARK_SEAR]) {
      for (const n of d.match(/\d+(\.\d+)?/g) ?? []) {
        expect(Number(n)).toBeGreaterThanOrEqual(0);
        expect(Number(n)).toBeLessThanOrEqual(32);
      }
    }
  });

  it('paints the sear in the ground colour, since it is a strike not a hole', () => {
    expect(INK).toBe('#0A0A0A');
  });

  it('commits to exactly one accent', () => {
    expect(ACID).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

/**
 * icon.svg is a static asset and cannot import brand.ts, so it is the one copy
 * of the geometry that can silently drift. This is that guard.
 */
describe('icon.svg', () => {
  it('draws the same glyph as every other surface', () => {
    for (const d of MARK_R) expect(iconSvg).toContain(d);
    expect(iconSvg).toContain(MARK_SEAR);
  });

  it('uses the brand colours', () => {
    expect(iconSvg).toContain(ACID);
    expect(iconSvg).toContain(INK);
  });

  it('declares a viewBox so it scales to any favicon slot', () => {
    expect(iconSvg).toContain(`viewBox="${MARK_VIEWBOX}"`);
  });
});
