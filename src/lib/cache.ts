/**
 * Per-URL result cache: in-memory LRU in front of a small on-disk store.
 * Disk survives restarts so a viral link keeps resolving (and stays
 * consistent for everyone who clicks the same shared card).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const TTL_MS = 24 * 60 * 60 * 1000;
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

export function cacheGet<T>(id: string, now = Date.now()): T | null {
  if (!isValidId(id)) return null;

  const hit = mem.get(id);
  if (hit) {
    if (hit.expires > now) {
      // Refresh recency.
      mem.delete(id);
      mem.set(id, hit);
      return hit.value as T;
    }
    mem.delete(id);
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

export function cacheSet<T>(id: string, value: T, now = Date.now()): void {
  if (!isValidId(id)) return;
  const expires = now + TTL_MS;
  memSet(id, value, expires);
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
export function __clearCache(): void {
  mem.clear();
  try { fs.rmSync(RESULTS_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
}
