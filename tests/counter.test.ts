import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TTL_MS } from '@/lib/cache';
import { MIN_DISPLAY, roastCount, __resetCounter } from '@/lib/counter';

let dir: string;

function entry(name: string, ageMs: number): void {
  const p = path.join(dir, 'results', name);
  fs.writeFileSync(p, '{}', 'utf8');
  const t = (Date.now() - ageMs) / 1000;
  fs.utimesSync(p, t, t);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roast-counter-'));
  fs.mkdirSync(path.join(dir, 'results'), { recursive: true });
  process.env.ROAST_CACHE_DIR = dir;
  __resetCounter();
});

afterEach(() => {
  delete process.env.ROAST_CACHE_DIR;
  __resetCounter();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('roastCount', () => {
  it('counts one per cached result', () => {
    entry('aaaaaaaaaaaa.json', 1000);
    entry('bbbbbbbbbbbb.json', 1000);
    expect(roastCount()).toBe(2);
  });

  it('is zero on a cold cache rather than guessing', () => {
    expect(roastCount()).toBe(0);
  });

  it('is zero when the directory does not exist at all', () => {
    fs.rmSync(path.join(dir, 'results'), { recursive: true, force: true });
    expect(roastCount()).toBe(0);
  });

  it('ignores entries past their TTL', () => {
    entry('aaaaaaaaaaaa.json', 1000);
    entry('bbbbbbbbbbbb.json', TTL_MS + 60_000);
    expect(roastCount()).toBe(1);
  });

  it('ignores files that are not cache entries', () => {
    entry('aaaaaaaaaaaa.json', 1000);
    entry('notes.txt', 1000);
    expect(roastCount()).toBe(1);
  });

  it('memoises for a minute so a traffic blast cannot hammer the disk', () => {
    entry('aaaaaaaaaaaa.json', 1000);
    expect(roastCount()).toBe(1);
    entry('bbbbbbbbbbbb.json', 1000);
    expect(roastCount()).toBe(1); // still the memoised value
    __resetCounter();
    expect(roastCount()).toBe(2);
  });

  it('re-reads once the memo window has passed', () => {
    const t0 = Date.now();
    entry('aaaaaaaaaaaa.json', 1000);
    expect(roastCount(t0)).toBe(1);
    entry('bbbbbbbbbbbb.json', 1000);
    expect(roastCount(t0 + 61_000)).toBe(2);
  });
});

describe('MIN_DISPLAY', () => {
  it('is a real threshold, not a multiplier on the truth', () => {
    expect(MIN_DISPLAY).toBeGreaterThan(0);
    expect(Number.isInteger(MIN_DISPLAY)).toBe(true);
  });
});
