/**
 * Per-URL result cache. Two backends behind one async API:
 *   - No KV env: in-memory LRU in front of a small on-disk store (UNCHANGED).
 *     Disk survives restarts so a viral link keeps resolving (and stays
 *     consistent for everyone who clicks the same shared card).
 *   - KV env present: in-memory LRU in front of shared Redis, because a
 *     serverless filesystem is ephemeral and every instance must agree.
 *
 * Alongside every result sits a DURABLE id -> URL pointer (`roast:u:<id>`, or a
 * `<id>.url` sidecar on disk) that never expires. `idForUrl` is a one-way hash,
 * so without it a shared /r/<id> link could not be regenerated once the result
 * hits its TTL. It is a ~50-byte string; keeping it forever is cheap.
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
// Disk-mode pointers live apart from results so pruneDisk (which only ever
// looks at RESULTS_DIR) can never reap one. Best-effort: KV is prod.
const URLS_DIR = path.join(CACHE_DIR, 'urls');
/** Never evict-and-forget more than this many "already remembered" ids per instance. */
const MAX_REMEMBERED = 5000;

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

/** KV-mode only: ids whose pointer this instance has written, for __clearCache. */
const kvUrlWritten = new Set<string>();
/** Ids whose pointer this instance has already ensured, so cache hits don't each hit the store. */
const remembered = new Set<string>();

const kvKey = (id: string) => k(`r:${id}`);
const urlKey = (id: string) => k(`u:${id}`);

function diskPath(id: string): string {
  return path.join(RESULTS_DIR, `${id}.json`);
}

function urlDiskPath(id: string): string {
  return path.join(URLS_DIR, `${id}.url`);
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
  await storeResult(id, value, now);
  // Every cached result (fresh re-roast included) leaves a permanent pointer to
  // its URL. Generic values with no `url` (tests, future callers) simply skip it.
  const url = (value as { url?: unknown } | null)?.url;
  if (typeof url === 'string') await rememberUrl(id, url);
}

async function storeResult<T>(id: string, value: T, now: number): Promise<void> {
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

/**
 * A pointer is only worth keeping if regenerating from it lands back on the
 * SAME id (otherwise the "healed" link would stay dead) and it is something the
 * pipeline would ever fetch. The SSRF guard still runs when it is re-roasted.
 */
function pointerOk(id: string, url: unknown): url is string {
  return (
    typeof url === 'string' &&
    url.length <= 2048 &&
    /^https?:\/\//i.test(url) &&
    idForUrl(url) === id
  );
}

/**
 * Remember id -> URL permanently (no TTL). Best-effort: a failure here must
 * never break a roast, so it logs and moves on.
 */
export async function rememberUrl(id: string, url: string): Promise<void> {
  if (!isValidId(id) || !pointerOk(id, url)) return;
  if (remembered.size >= MAX_REMEMBERED) remembered.clear();
  remembered.add(id);

  if (kvEnabled()) {
    try {
      await kv()!.set(urlKey(id), url); // no `ex`: this outlives the result
      kvUrlWritten.add(id);
    } catch (err) {
      console.warn('[cache] could not store url pointer', id, err instanceof Error ? err.message : err);
    }
    return;
  }

  try {
    fs.mkdirSync(URLS_DIR, { recursive: true });
    const tmp = `${urlDiskPath(id)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, url, 'utf8');
    fs.renameSync(tmp, urlDiskPath(id));
  } catch (err) {
    console.warn('[cache] could not store url pointer', id, err instanceof Error ? err.message : err);
  }
}

/** The URL behind a share id, or null if it was never stored. Survives result expiry. */
export async function urlForId(id: string): Promise<string | null> {
  if (!isValidId(id)) return null;

  if (kvEnabled()) {
    try {
      const v = await kv()!.get<unknown>(urlKey(id));
      return pointerOk(id, v) ? v : null;
    } catch {
      return null; // KV blip -> behave like "no pointer"
    }
  }

  try {
    const v = fs.readFileSync(urlDiskPath(id), 'utf8').trim();
    return pointerOk(id, v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Legacy results (cached before pointers existed) get one when they're next
 * served. Deduped per instance so a cache-hit storm is not a write storm.
 */
export async function backfillUrl(value: unknown): Promise<void> {
  try {
    const url = (value as { url?: unknown } | null)?.url;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || url.length > 2048) return;
    const id = idForUrl(url);
    if (remembered.has(id)) return;
    await rememberUrl(id, url);
  } catch { /* best-effort */ }
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
  remembered.clear();
  if (kvEnabled()) {
    try {
      if (kvWritten.size) await kv()!.del(...[...kvWritten].map(kvKey));
      if (kvUrlWritten.size) await kv()!.del(...[...kvUrlWritten].map(urlKey));
    } catch { /* ignore */ }
    kvWritten.clear();
    kvUrlWritten.clear();
    return;
  }
  try { fs.rmSync(RESULTS_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(URLS_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
}
