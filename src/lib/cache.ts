/**
 * Per-URL result cache. Two backends behind one async API:
 *   - No KV env: in-memory LRU in front of a small on-disk store (UNCHANGED).
 *     Disk survives restarts so a viral link keeps resolving (and stays
 *     consistent for everyone who clicks the same shared card).
 *   - KV env present: in-memory LRU in front of shared Redis, because a
 *     serverless filesystem is ephemeral and every instance must agree.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { k, kv, kvEnabled } from './kv';

// 90 days: a shared /r/<id> link has to outlive launch day or the viral loop
// dies after 24h. Storage is cheap (one small JSON per site), so keep it long.
// Also drives the KV `ex` (TTL_SEC) and the disk/in-memory expiry below.
export const TTL_MS = 90 * 24 * 60 * 60 * 1000;
const TTL_SEC = Math.ceil(TTL_MS / 1000);
const MAX_MEM_ENTRIES = 500;
const MAX_DISK_ENTRIES = 5000;

const CACHE_DIR = process.env.ROAST_CACHE_DIR || path.join(process.cwd(), '.cache');
const RESULTS_DIR = path.join(CACHE_DIR, 'results');

/** Stable short id for a normalized URL — also the /r/<id> slug. */
export function idForUrl(normalizedUrl: string): string {
  return crypto.createHash('sha256').update(normalizedUrl).digest('base64url').slice(0, 12);
}

export function isValidId(id: string): boolean {
  return /^[A-Za-z0-9_-]{12}$/.test(id);
}

type Entry<T> = { value: T; expires: number };

const mem = new Map<string, Entry<unknown>>();
/** KV-mode only: ids this instance has written, so __clearCache can purge them. */
const kvWritten = new Set<string>();

const kvKey = (id: string) => k(`r:${id}`);

function diskPath(id: string): string {
  return path.join(RESULTS_DIR, `${id}.json`);
}

function memSet<T>(id: string, value: T, expires: number): void {
  mem.delete(id);
  mem.set(id, { value, expires });
  while (mem.size > MAX_MEM_ENTRIES) {
    const oldest = mem.keys().next().value;
    if (oldest === undefined) break;
    mem.delete(oldest);
  }
}

/** Shared LRU lookup, in front of both backends. Returns a value or 'miss'. */
function memGet<T>(id: string, now: number): T | null | 'miss' {
  const hit = mem.get(id);
  if (!hit) return 'miss';
  if (hit.expires > now) {
    mem.delete(id); // refresh recency
    mem.set(id, hit);
    return hit.value as T;
  }
  mem.delete(id);
  return 'miss';
}

export async function cacheGet<T>(id: string, now = Date.now()): Promise<T | null> {
  if (!isValidId(id)) return null;

  const m = memGet<T>(id, now);
  if (m !== 'miss') return m;

  if (kvEnabled()) {
    try {
      const entry = await kv()!.get<Entry<T>>(kvKey(id));
      if (entry && typeof entry.expires === 'number' && entry.expires > now) {
        memSet(id, entry.value, entry.expires);
        return entry.value;
      }
    } catch {
      /* KV blip -> treat as a miss */
    }
    return null;
  }

  try {
    const raw = fs.readFileSync(diskPath(id), 'utf8');
    const entry = JSON.parse(raw) as Entry<T>;
    if (entry && typeof entry.expires === 'number' && entry.expires > now) {
      memSet(id, entry.value, entry.expires);
      return entry.value;
    }
    fs.rmSync(diskPath(id), { force: true });
  } catch { /* cold cache */ }

  return null;
}

export async function cacheSet<T>(id: string, value: T, now = Date.now()): Promise<void> {
  if (!isValidId(id)) return;
  const expires = now + TTL_MS;
  memSet(id, value, expires);

  if (kvEnabled()) {
    try {
      await kv()!.set(kvKey(id), { value, expires }, { ex: TTL_SEC });
      kvWritten.add(id);
    } catch { /* mem-only is still correct for this instance */ }
    return;
  }

  try {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const tmp = `${diskPath(id)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ value, expires }), 'utf8');
    fs.renameSync(tmp, diskPath(id)); // atomic: readers never see a partial file
    pruneDisk();
  } catch { /* memory-only is still correct */ }
}

let lastPrune = 0;
function pruneDisk(): void {
  const now = Date.now();
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  try {
    const files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json'));
    if (files.length <= MAX_DISK_ENTRIES) return;
    const stats = files
      .map((f) => {
        const p = path.join(RESULTS_DIR, f);
        try { return { p, t: fs.statSync(p).mtimeMs }; } catch { return null; }
      })
      .filter((x): x is { p: string; t: number } => x !== null)
      .sort((a, b) => a.t - b.t);
    for (const s of stats.slice(0, stats.length - MAX_DISK_ENTRIES)) {
      fs.rmSync(s.p, { force: true });
    }
  } catch { /* ignore */ }
}

/** Test seam. */
export async function __clearCache(): Promise<void> {
  mem.clear();
  if (kvEnabled()) {
    try {
      if (kvWritten.size) await kv()!.del(...[...kvWritten].map(kvKey));
    } catch { /* ignore */ }
    kvWritten.clear();
    return;
  }
  try { fs.rmSync(RESULTS_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
}
