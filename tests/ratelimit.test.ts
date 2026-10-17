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
  it('allows requests up to the per-minute limit', async () => {
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) {
      expect((await rateLimit('ip', [PER_MINUTE], t)).ok).toBe(true);
    }
  });

  it('blocks the one after the limit', async () => {
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) await rateLimit('ip', [PER_MINUTE], t);
    const res = await rateLimit('ip', [PER_MINUTE], t);
    expect(res.ok).toBe(false);
    expect(res.retryAfterSec).toBeGreaterThan(0);
    expect(res.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('lets the window slide so the client recovers', async () => {
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) await rateLimit('ip', [PER_MINUTE], t);
    expect((await rateLimit('ip', [PER_MINUTE], t)).ok).toBe(false);
    expect((await rateLimit('ip', [PER_MINUTE], t + PER_MINUTE.windowMs + 1)).ok).toBe(true);
  });

  it('does not record rejected hits, so hammering cannot extend the penalty', async () => {
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) await rateLimit('ip', [PER_MINUTE], t);
    // Hammer while blocked.
    for (let i = 0; i < 50; i++) await rateLimit('ip', [PER_MINUTE], t + 1000);
    // Once the original window passes, the client is clear again.
    expect((await rateLimit('ip', [PER_MINUTE], t + PER_MINUTE.windowMs + 2)).ok).toBe(true);
  });

  it('tracks each key independently', async () => {
    const t = 1_000_000;
    for (let i = 0; i < PER_MINUTE.limit; i++) await rateLimit('a', [PER_MINUTE], t);
    expect((await rateLimit('a', [PER_MINUTE], t)).ok).toBe(false);
    expect((await rateLimit('b', [PER_MINUTE], t)).ok).toBe(true);
  });

  it('enforces the hourly cap across several minute windows', async () => {
    let t = 1_000_000;
    let allowed = 0;
    // Spread requests out so the minute rule never trips, only the hour rule.
    for (let i = 0; i < 100; i++) {
      if ((await rateLimit('ip', [PER_MINUTE, PER_HOUR], t)).ok) allowed++;
      t += 20_000;
    }
    expect(allowed).toBe(PER_HOUR.limit);
  });

  it('reports remaining against the tightest rule', async () => {
    const t = 1_000_000;
    const first = await rateLimit('ip', [PER_MINUTE, PER_HOUR], t);
    expect(first.remaining).toBe(PER_MINUTE.limit - 1);
  });
});

describe('clientIp', () => {
  it('prefers x-vercel-forwarded-for (platform-set, trustworthy)', () => {
    const h = new Headers({ 'x-vercel-forwarded-for': '1.1.1.1, 9.9.9.9', 'x-real-ip': '2.2.2.2' });
    expect(clientIp(h)).toBe('1.1.1.1');
  });

  it('does NOT trust cf-connecting-ip (spoofable with no Cloudflare in front)', () => {
    // Attacker sets cf-connecting-ip per request; we must ignore it and use
    // the platform header so every spoofed value maps to the SAME real bucket.
    const h = new Headers({ 'cf-connecting-ip': '6.6.6.6', 'x-real-ip': '3.3.3.3' });
    expect(clientIp(h)).toBe('3.3.3.3');
  });

  it('falls back to x-real-ip then x-forwarded-for', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(clientIp(new Headers({ 'x-forwarded-for': '4.4.4.4, 5.5.5.5' }))).toBe('4.4.4.4');
  });

  it('falls back to a shared bucket when no trusted header is present', () => {
    expect(clientIp(new Headers())).toBe('unknown');
    // cf-connecting-ip alone is not enough to earn its own bucket.
    expect(clientIp(new Headers({ 'cf-connecting-ip': '7.7.7.7' }))).toBe('unknown');
  });
});
