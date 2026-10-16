import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetRateLimit,
  clientIp,
  PER_HOUR,
  PER_MINUTE,
  rateLimit,
} from '@/lib/ratelimit';

beforeEach(() => __resetRateLimit());

describe('rateLimit', () => {
  it('allows requests up to the per-minute limit', () => {
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) {
      expect(rateLimit('ip', [PER_MINUTE], t).ok).toBe(true);
    }
  });

  it('blocks the one after the limit', () => {
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) rateLimit('ip', [PER_MINUTE], t);
    const res = rateLimit('ip', [PER_MINUTE], t);
    expect(res.ok).toBe(false);
    expect(res.retryAfterSec).toBeGreaterThan(0);
    expect(res.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('lets the window slide so the client recovers', () => {
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) rateLimit('ip', [PER_MINUTE], t);
    expect(rateLimit('ip', [PER_MINUTE], t).ok).toBe(false);
    expect(rateLimit('ip', [PER_MINUTE], t + PER_MINUTE.windowMs + 1).ok).toBe(true);
  });

  it('does not record rejected hits, so hammering cannot extend the penalty', () => {
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) rateLimit('ip', [PER_MINUTE], t);
    // Hammer while blocked.
    for (let i = 0; i < 50; i++) rateLimit('ip', [PER_MINUTE], t + 1000);
    // Once the original window passes, the client is clear again.
    expect(rateLimit('ip', [PER_MINUTE], t + PER_MINUTE.windowMs + 2).ok).toBe(true);
  });

  it('tracks each key independently', () => {
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) rateLimit('a', [PER_MINUTE], t);
    expect(rateLimit('a', [PER_MINUTE], t).ok).toBe(false);
    expect(rateLimit('b', [PER_MINUTE], t).ok).toBe(true);
  });

  it('enforces the hourly cap across several minute windows', () => {
    let t = 1_000_000;
    let allowed = 0;
    // Spread requests out so the minute rule never trips, only the hour rule.
    for (let i = 0; i < 100; i++) {
      if (rateLimit('ip', [PER_MINUTE, PER_HOUR], t).ok) allowed++;
      t += 20_000;
    }
    expect(allowed).toBe(PER_HOUR.limit);
  });

  it('reports remaining against the tightest rule', () => {
    const t = 1_000_000;
    const first = rateLimit('ip', [PER_MINUTE, PER_HOUR], t);
    expect(first.remaining).toBe(PER_MINUTE.limit - 1);
  });
});

describe('clientIp', () => {
  it('prefers cf-connecting-ip', () => {
    const h = new Headers({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' });
    expect(clientIp(h)).toBe('1.1.1.1');
  });

  it('then x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
  });

  it('takes the first hop of x-forwarded-for', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '4.4.4.4, 5.5.5.5' }))).toBe('4.4.4.4');
  });

  it('falls back to a shared bucket when no header is present', () => {
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
