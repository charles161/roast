import { describe, expect, it } from 'vitest';
import { DESKTOP_MIN, DESKTOP_QUERY, isDesktopWidth } from '@/lib/responsive';

describe('the desktop gate', () => {
  it('breaks at 1024px', () => {
    expect(DESKTOP_MIN).toBe(1024);
    expect(DESKTOP_QUERY).toBe('(min-width: 1024px)');
  });

  it('is inclusive at the breakpoint and false below it', () => {
    expect(isDesktopWidth(1024)).toBe(true);
    expect(isDesktopWidth(1023)).toBe(false);
    expect(isDesktopWidth(1920)).toBe(true);
    expect(isDesktopWidth(390)).toBe(false);
    expect(isDesktopWidth(0)).toBe(false);
  });
});
