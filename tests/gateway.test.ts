import { describe, expect, it } from 'vitest';
import { usageCost } from '@/lib/gateway';

describe('usageCost — spend-cap fallback when the gateway reports no cost', () => {
  it('prices a Haiku call from token usage', () => {
    // 2000 in @ $0.10/M + 700 out @ $0.50/M = 0.0002 + 0.00035 = 0.00055
    const c = usageCost('anthropic/claude-haiku-5.5', { prompt_tokens: 2000, completion_tokens: 700 });
    expect(c).toBeCloseTo(0.00055, 6);
    expect(c).toBeGreaterThan(0);
  });

  it('prices Jev by input tokens only (eval output is free)', () => {
    // 1M input @ $0.042/M + any output @ $0 = 0.042
    expect(usageCost('typesafe-ai/jev-1.14.0', { prompt_tokens: 1_000_000, completion_tokens: 5000 })).toBeCloseTo(0.042, 6);
  });

  it('is zero for an unknown model — never guess a price', () => {
    expect(usageCost('openai/gpt-4o', { prompt_tokens: 2000, completion_tokens: 500 })).toBe(0);
  });

  it('is zero with no / empty usage', () => {
    expect(usageCost('anthropic/claude-haiku-5.5', undefined)).toBe(0);
    expect(usageCost('anthropic/claude-haiku-5.5', {})).toBe(0);
  });

  it('accepts input_tokens/output_tokens aliases', () => {
    expect(usageCost('anthropic/claude-haiku-5.5', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(0.1, 6);
  });
});
