import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRecent, pushRecent, type RecentEntry } from '@/lib/history';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
  key(): string | null {
    return null;
  }
  get length(): number {
    return this.m.size;
  }
}

const entry = (id: string, over: Partial<RecentEntry> = {}): RecentEntry => ({
  id,
  displayUrl: 'stripe.com',
  score: 73,
  createdAt: Date.now(),
  ...over,
});

const g = globalThis as unknown as { window?: unknown };
const original = g.window;
let mem: MemStorage;

function setWindow(storage: unknown): void {
  g.window = storage === undefined ? undefined : { localStorage: storage };
}

beforeEach(() => {
  mem = new MemStorage();
  setWindow(mem);
});
afterEach(() => {
  g.window = original;
});

describe('recent history', () => {
  it('is empty to begin with', () => {
    expect(getRecent()).toEqual([]);
  });

  it('pushes and reads back, newest first', () => {
    pushRecent(entry('aaaaaaaaaaaa', { displayUrl: 'a.com' }));
    pushRecent(entry('bbbbbbbbbbbb', { displayUrl: 'b.com' }));
    expect(getRecent().map((e) => e.id)).toEqual(['bbbbbbbbbbbb', 'aaaaaaaaaaaa']);
  });

  it('dedupes by id, moving an existing entry to the front', () => {
    pushRecent(entry('aaaaaaaaaaaa'));
    pushRecent(entry('bbbbbbbbbbbb'));
    pushRecent(entry('aaaaaaaaaaaa'));
    expect(getRecent().map((e) => e.id)).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
  });

  it('caps at 3, dropping the oldest', () => {
    pushRecent(entry('aaaaaaaaaaaa'));
    pushRecent(entry('bbbbbbbbbbbb'));
    pushRecent(entry('cccccccccccc'));
    pushRecent(entry('dddddddddddd'));
    const ids = getRecent().map((e) => e.id);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(['dddddddddddd', 'cccccccccccc', 'bbbbbbbbbbbb']);
  });

  it('survives a reload (same backing store)', () => {
    pushRecent(entry('aaaaaaaaaaaa'));
    // getRecent re-reads storage each call, i.e. a fresh page load sees it.
    expect(getRecent().map((e) => e.id)).toEqual(['aaaaaaaaaaaa']);
  });

  it('ignores a malformed entry', () => {
    pushRecent({ id: 'too-short', displayUrl: 'x', score: 1, createdAt: 1 } as RecentEntry);
    expect(getRecent()).toEqual([]);
  });

  it('degrades to empty on corrupt stored JSON', () => {
    mem.setItem('roast:recent:v1', '{not json');
    expect(getRecent()).toEqual([]);
  });

  it('never throws when storage access throws (private mode / full quota)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    setWindow(throwing);
    expect(() => getRecent()).not.toThrow();
    expect(getRecent()).toEqual([]);
    expect(() => pushRecent(entry('aaaaaaaaaaaa'))).not.toThrow();
  });

  it('is SSR-safe: no window means empty, no throw', () => {
    setWindow(undefined);
    expect(getRecent()).toEqual([]);
    expect(() => pushRecent(entry('aaaaaaaaaaaa'))).not.toThrow();
  });
});
