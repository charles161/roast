import { describe, expect, it } from 'vitest';
import { ACID } from '@/lib/brand';
import { band, MID, ROUGH, temperature } from '@/lib/grade';

describe('band', () => {
  it('uses three functional states, with the accent reserved for the top', () => {
    expect(band(100).hex).toBe(ACID);
    expect(band(60).hex).toBe(MID);
    expect(band(0).hex).toBe(ROUGH);
  });

  it('switches exactly on the documented boundaries', () => {
    expect(band(80).label).toBe('SHARP');
    expect(band(79).label).toBe('MID');
    expect(band(50).label).toBe('MID');
    expect(band(49).label).toBe('ROUGH');
  });

  it('always returns a usable colour pair', () => {
    for (let s = 0; s <= 100; s += 1) {
      const b = band(s);
      expect(b.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(b.soft).toMatch(/^rgba\(/);
      expect(b.label.length).toBeGreaterThan(0);
    }
  });

  it('never introduces a fourth colour', () => {
    const seen = new Set<string>();
    for (let s = 0; s <= 100; s += 1) seen.add(band(s).hex);
    expect(seen.size).toBe(3);
  });
});

describe('temperature', () => {
  it('reads worse as the score drops', () => {
    expect(temperature(100)).toBe('WORLD CLASS');
    expect(temperature(90)).toBe('GENUINELY GOOD');
    expect(temperature(75)).toBe('SOLID, NOT SHARP');
    expect(temperature(60)).toBe('NEEDS A HOOK');
    expect(temperature(45)).toBe('NEEDS WORK');
    expect(temperature(30)).toBe('ROUGH SHAPE');
    expect(temperature(10)).toBe('SLOP');
  });

  it('reserves the top label for a page that actually earns it', () => {
    expect(temperature(94)).not.toBe('WORLD CLASS');
    expect(temperature(95)).toBe('WORLD CLASS');
  });

  it('never returns an empty label', () => {
    for (let s = 0; s <= 100; s += 1) expect(temperature(s).length).toBeGreaterThan(0);
  });
});
