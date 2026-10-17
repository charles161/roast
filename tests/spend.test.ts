import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roast-spend-'));
  process.env.ROAST_CACHE_DIR = dir;
  process.env.DAILY_LLM_USD_CAP = '1';
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.ROAST_CACHE_DIR;
  delete process.env.DAILY_LLM_USD_CAP;
});

async function load() {
  vi.resetModules();
  return import('@/lib/spend');
}

describe('dailyCapUsd', () => {
  it('reads the env cap', async () => {
    const { dailyCapUsd } = await load();
    expect(dailyCapUsd()).toBe(1);
  });

  it.each(['', 'abc', '0', '-5'])('falls back to a safe default for %j', async (bad) => {
    process.env.DAILY_LLM_USD_CAP = bad;
    const { dailyCapUsd } = await load();
    expect(dailyCapUsd()).toBe(5);
  });
});

describe('budget enforcement', () => {
  it('starts with budget available', async () => {
    const { hasBudget, spentToday } = await load();
    expect(await hasBudget()).toBe(true);
    expect((await spentToday()).usd).toBe(0);
  });

  it('accumulates spend and then refuses', async () => {
    const { hasBudget, recordSpend, spentToday } = await load();
    await recordSpend(0.4);
    await recordSpend(0.4);
    expect(await hasBudget()).toBe(true);
    await recordSpend(0.3);
    expect((await spentToday()).usd).toBeCloseTo(1.1, 5);
    expect(await hasBudget()).toBe(false);
  });

  it('counts calls', async () => {
    const { recordSpend, spentToday } = await load();
    await recordSpend(0.01);
    await recordSpend(0.01);
    expect((await spentToday()).calls).toBe(2);
  });

  it('ignores junk amounts rather than corrupting the ledger', async () => {
    const { recordSpend, spentToday } = await load();
    await recordSpend(NaN);
    await recordSpend(-10);
    await recordSpend(Infinity);
    expect((await spentToday()).usd).toBe(0);
    expect((await spentToday()).calls).toBe(3);
  });

  it('persists across a restart so the cap cannot be reset by bouncing the process', async () => {
    const first = await load();
    await first.recordSpend(0.95);
    expect(await first.hasBudget()).toBe(true);

    const second = await load();
    await second.recordSpend(0.1);
    expect(await second.hasBudget()).toBe(false);
    expect((await second.spentToday()).usd).toBeCloseTo(1.05, 5);
  });

  it('starts a fresh budget on a new day', async () => {
    const first = await load();
    await first.recordSpend(5);
    expect(await first.hasBudget()).toBe(false);

    // Rewrite the ledger as if it were yesterday's.
    const file = path.join(dir, 'spend.json');
    const led = JSON.parse(fs.readFileSync(file, 'utf8'));
    led.day = '2000-01-01';
    fs.writeFileSync(file, JSON.stringify(led));

    const second = await load();
    expect(await second.hasBudget()).toBe(true);
    expect((await second.spentToday()).usd).toBe(0);
  });

  it('survives a corrupt ledger file', async () => {
    fs.writeFileSync(path.join(dir, 'spend.json'), 'not json at all');
    const { hasBudget, spentToday } = await load();
    expect(await hasBudget()).toBe(true);
    expect((await spentToday()).usd).toBe(0);
  });
});
