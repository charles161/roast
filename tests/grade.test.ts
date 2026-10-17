import { describe, expect, it } from 'vitest';
import { band, temperature } from '@/lib/grade';

describe('band', () => {
  it('grades green at the top, red at the bottom', () => {
    expect(band(100).hex).toBe('#34d399');
    expect(band(0).hex).toBe('#ff5d47');
  });

  it('switches exactly on the documented boundaries', () => {
    expect(band(80).label).toBe('Sharp');
    expect(band(79).label).toBe('Decent');
    expect(band(60).label).toBe('Decent');
    expect(band(59).label).toBe('Mid');
    expect(band(40).label).toBe('Mid');
    expect(band(39).label).toBe('Rough');
  });

  it('always returns a usable colour pair', () => {
    for (let s = 0; s <= 100; s += 1) {
      const b = band(s);
      expect(b.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(b.soft).toMatch(/^rgba\(/);
      expect(b.label.length).toBeGreaterThan(0);
    }
  });
});

describe('temperature', () => {
  it('reads worse as the score drops', () => {
    expect(temperature(90)).toBe('Genuinely good');
    expect(temperature(70)).toBe('Pretty strong');
    expect(temperature(55)).toBe('Needs a hook');
    expect(temperature(40)).toBe('Needs work');
    expect(temperature(25)).toBe('Rough shape');
    expect(temperature(0)).toBe('Oh dear');
  });

  it('never returns an empty label', () => {
    for (let s = 0; s <= 100; s += 1) expect(temperature(s).length).toBeGreaterThan(0);
  });
});
