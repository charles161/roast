import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TTL_MS } from '@/lib/cache';
import { showcaseRoast, __resetShowcase } from '@/lib/showcase';
import type { RoastResult } from '@/lib/types';

let dir: string;

function result(over: Partial<RoastResult> = {}): RoastResult {
  return {
    id: 'abcdefghijkl',
    url: 'https://stripe.com/',
    displayUrl: 'stripe.com',
    siteName: 'Stripe',
    favicon: '',
    createdAt: 1000,
    score: { overall: 73, subs: [{ key: 'hero', label: 'Hero', score: 60, reason: 'r' }] },
    roast: ['A line.'],
    verdict: 'A verdict.',
    before: { headline: 'b', subhead: 'b', cta: 'b' },
    after: { headline: 'a', subhead: 'a', cta: 'a' },
    fixes: ['one', 'two', 'three'],
    ...over,
  };
}

function write(name: string, value: unknown, ageMs = 1000): void {
  const p = path.join(dir, 'results', name);
  fs.writeFileSync(p, JSON.stringify({ value, expires: Date.now() + TTL_MS }), 'utf8');
  const t = (Date.now() - ageMs) / 1000;
  fs.utimesSync(p, t, t);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roast-showcase-'));
  fs.mkdirSync(path.join(dir, 'results'), { recursive: true });
  process.env.ROAST_CACHE_DIR = dir;
  __resetShowcase();
});

afterEach(() => {
  delete process.env.ROAST_CACHE_DIR;
  __resetShowcase();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('showcaseRoast', () => {
  it('returns a real cached roast of a well-known page', async () => {
    write('a.json', result());
    expect((await showcaseRoast())?.displayUrl).toBe('stripe.com');
  });

  it('shows nothing rather than inventing something on a cold cache', async () => {
    expect(await showcaseRoast()).toBeNull();
  });

  it('never surfaces a stranger’s personal site', async () => {
    write('a.json', result({ url: 'https://bobs-blog.dev/', displayUrl: 'bobs-blog.dev' }));
    expect(await showcaseRoast()).toBeNull();
  });

  it('prefers the freshest roast', async () => {
    write('a.json', result({ id: 'aaaaaaaaaaaa', createdAt: 100 }));
    write('b.json', result({ id: 'bbbbbbbbbbbb', displayUrl: 'linear.app', createdAt: 900 }));
    expect((await showcaseRoast())?.id).toBe('bbbbbbbbbbbb');
  });

  it('ignores an entry past its TTL', async () => {
    write('a.json', result(), TTL_MS + 60_000);
    expect(await showcaseRoast()).toBeNull();
  });

  it('skips a malformed entry instead of throwing', async () => {
    fs.writeFileSync(path.join(dir, 'results', 'bad.json'), '{not json', 'utf8');
    write('a.json', result());
    expect((await showcaseRoast())?.displayUrl).toBe('stripe.com');
  });

  it('skips a well-known entry that is missing the fields the hero renders', async () => {
    write('a.json', { ...result(), verdict: '' });
    expect(await showcaseRoast()).toBeNull();
  });
});
