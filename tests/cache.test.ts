import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roast-cache-'));
  process.env.ROAST_CACHE_DIR = dir;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.ROAST_CACHE_DIR;
});

/**
 * Fresh module per call so the in-memory map and the cache dir are isolated.
 * resetModules (not a query-busted path, which loses the .ts extension) is
 * what lets one test hold two independent instances of the module.
 */
async function load() {
  vi.resetModules();
  return import('@/lib/cache');
}

describe('idForUrl', () => {
  it('is stable and url-safe', async () => {
    const { idForUrl, isValidId } = await load();
    const a = idForUrl('https://example.com/');
    expect(a).toBe(idForUrl('https://example.com/'));
    expect(isValidId(a)).toBe(true);
    expect(a).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it('differs for different URLs', async () => {
    const { idForUrl } = await load();
    expect(idForUrl('https://a.com/')).not.toBe(idForUrl('https://b.com/'));
  });
});

describe('isValidId', () => {
  it.each(['', 'short', 'a'.repeat(13), '../../etc/passwd', 'abc/def/ghij', 'abcdefghij k'])(
    'rejects %j',
    async (bad) => {
      const { isValidId } = await load();
      expect(isValidId(bad)).toBe(false);
    },
  );
});

describe('cacheGet / cacheSet', () => {
  it('round-trips a value', async () => {
    const { cacheGet, cacheSet, idForUrl } = await load();
    const id = idForUrl('https://example.com/');
    await cacheSet(id, { hello: 'world' });
    expect(await cacheGet(id)).toEqual({ hello: 'world' });
  });

  it('misses on an unknown id', async () => {
    const { cacheGet, idForUrl } = await load();
    expect(await cacheGet(idForUrl('https://nope.com/'))).toBeNull();
  });

  it('refuses an invalid id instead of touching the filesystem', async () => {
    const { cacheGet, cacheSet } = await load();
    await cacheSet('../../evil', { x: 1 });
    expect(await cacheGet('../../evil')).toBeNull();
    expect(fs.existsSync(path.join(dir, 'results'))).toBe(false);
  });

  it('expires an entry after the TTL', async () => {
    const { cacheGet, cacheSet, idForUrl, TTL_MS } = await load();
    const id = idForUrl('https://example.com/');
    const t0 = Date.now();
    await cacheSet(id, { v: 1 }, t0);
    expect(await cacheGet(id, t0 + TTL_MS - 1000)).toEqual({ v: 1 });
    expect(await cacheGet(id, t0 + TTL_MS + 1000)).toBeNull();
  });

  it('persists to disk so a restart still serves the link', async () => {
    const first = await load();
    const id = first.idForUrl('https://example.com/');
    await first.cacheSet(id, { v: 'persisted' });

    // A second module instance has an empty memory map: this can only hit disk.
    const second = await load();
    expect(await second.cacheGet(id)).toEqual({ v: 'persisted' });
  });

  it('writes the disk entry atomically, leaving no partial files', async () => {
    const { cacheSet, idForUrl } = await load();
    await cacheSet(idForUrl('https://example.com/'), { v: 1 });
    const files = fs.readdirSync(path.join(dir, 'results'));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.json$/);
    expect(files.some((f) => f.includes('tmp'))).toBe(false);
  });

  it('drops an expired entry from disk on read', async () => {
    const { cacheGet, cacheSet, idForUrl, TTL_MS } = await load();
    const id = idForUrl('https://example.com/');
    await cacheSet(id, { v: 1 }, Date.now());
    await cacheGet(id, Date.now() + TTL_MS + 1);
    expect(fs.readdirSync(path.join(dir, 'results'))).toHaveLength(0);
  });

  it('survives a corrupt disk entry', async () => {
    const { cacheGet, idForUrl } = await load();
    const id = idForUrl('https://example.com/');
    fs.mkdirSync(path.join(dir, 'results'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'results', `${id}.json`), '{not json');
    expect(await cacheGet(id)).toBeNull();
  });
});
