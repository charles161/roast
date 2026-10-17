import { afterEach, describe, expect, it, vi } from 'vitest';

async function load() {
  vi.resetModules();
  return import('@/lib/analytics');
}

afterEach(() => {
  delete process.env.POSTHOG_KEY;
});

describe('server analytics', () => {
  it('is a silent no-op with no key and no injection', async () => {
    delete process.env.POSTHOG_KEY;
    const { captureServer } = await load();
    await expect(captureServer('roast_completed', { overall: 90 })).resolves.toBeUndefined();
  });

  it('captures the listed events with the right shape and flushes', async () => {
    const calls: { distinctId: string; event: string; properties?: Record<string, unknown> }[] = [];
    let flushes = 0;
    const spy = {
      capture: (p: { distinctId: string; event: string; properties?: Record<string, unknown> }) =>
        calls.push(p),
      flush: async () => {
        flushes += 1;
      },
    };
    const { captureServer, __setPostHogForTests } = await load();
    __setPostHogForTests(spy);

    await captureServer('roast_completed', {
      displayUrl: 'stripe.com',
      overall: 73,
      cached: false,
      cost_usd: 0.004,
      degraded: false,
    });
    await captureServer('roast_capped', {});
    await captureServer('roast_error', { code: 'llm' });

    expect(calls.map((c) => c.event)).toEqual(['roast_completed', 'roast_capped', 'roast_error']);
    expect(calls[0]!.distinctId).toBe('roast-server');
    expect(calls[0]!.properties).toMatchObject({ displayUrl: 'stripe.com', overall: 73, cost_usd: 0.004 });
    // Aggregate events only — no per-person profiles.
    expect(calls[0]!.properties).toMatchObject({ $process_person_profile: false });
    expect(flushes).toBe(3);

    __setPostHogForTests(undefined);
  });

  it('never throws even if the client errors', async () => {
    const bad = {
      capture: () => {
        throw new Error('boom');
      },
      flush: async () => {},
    };
    const { captureServer, __setPostHogForTests } = await load();
    __setPostHogForTests(bad);
    await expect(captureServer('roast_error', { code: 'fetch' })).resolves.toBeUndefined();
    __setPostHogForTests(undefined);
  });
});
