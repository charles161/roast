import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeKv } from './helpers/fakeKv';

const KV_ENV = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

function clearEnv() {
  for (const k of KV_ENV) delete process.env[k];
}

async function load() {
  vi.resetModules();
  return import('@/lib/kv');
}

afterEach(clearEnv);

describe('kv adapter detection', () => {
  it('is disabled with no env and no injection', async () => {
    clearEnv();
    const { kvEnabled, kv } = await load();
    expect(kvEnabled()).toBe(false);
    expect(kv()).toBeNull();
  });

  it('detects the Vercel KV_REST_API_* pair', async () => {
    clearEnv();
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    process.env.KV_REST_API_TOKEN = 'tok';
    const { kvEnabled } = await load();
    expect(kvEnabled()).toBe(true);
  });

  it('detects the UPSTASH_REDIS_REST_* pair', async () => {
    clearEnv();
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
    const { kvEnabled } = await load();
    expect(kvEnabled()).toBe(true);
  });

  it('stays disabled when only half a pair is present', async () => {
    clearEnv();
    process.env.KV_REST_API_URL = 'https://example.upstash.io';
    const { kvEnabled } = await load();
    expect(kvEnabled()).toBe(false);
  });

  it('namespaces keys under roast:', async () => {
    const { k, NS } = await load();
    expect(NS).toBe('roast:');
    expect(k('spend:2026-10-17:usd')).toBe('roast:spend:2026-10-17:usd');
  });
});

describe('kv injection seam', () => {
  it('injecting a stub enables KV and returns it', async () => {
    clearEnv();
    const { kvEnabled, kv, __setKvForTests } = await load();
    const stub = new FakeKv();
    __setKvForTests(stub);
    expect(kvEnabled()).toBe(true);
    expect(kv()).toBe(stub);
    __setKvForTests(null);
    expect(kvEnabled()).toBe(false);
    __setKvForTests(undefined); // back to env detection
    expect(kvEnabled()).toBe(false);
  });
});
