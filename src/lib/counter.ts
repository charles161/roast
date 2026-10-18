/**
 * How many sites have actually been roasted.
 *   - No KV env: read straight off the result cache dir — one file per distinct
 *     site, counting only those written in the last 24h. Never a decorative number.
 *   - KV env present: a sorted set `roast:idx` scored by createdAt; count the
 *     members still inside the 24h window. `recordRoast` adds to it on each new
 *     result (there is no shared filesystem to count on serverless).
 * The window is deliberately NOT the cache TTL: results are kept for 90 days so
 * shared links survive, but the UI label says "pages roasted / 24h".
 * If the backend says nothing, we show nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { k, kv, kvEnabled } from './kv';

/** Under this it reads as a dead launch, so the UI stays quiet instead. */
export const MIN_DISPLAY = 25;

/** The count is a rolling 24h, independent of how long results stay cached. */
export const COUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

const IDX = k('idx');
const IDX_TTL_SEC = Math.ceil((2 * COUNT_WINDOW_MS) / 1000);

const MEMO_MS = 60_000;
let memo: { at: number; n: number } | null = null;

function resultsDir(): string {
  const base = process.env.ROAST_CACHE_DIR || path.join(process.cwd(), '.cache');
  return path.join(base, 'results');
}

/** KV mode: record a fresh roast in the index. No-op on the disk path. */
export async function recordRoast(id: string, createdAt: number): Promise<void> {
  if (!kvEnabled()) return;
  const r = kv()!;
  try {
    await r.zadd(IDX, { score: createdAt, member: id });
    await r.expire(IDX, IDX_TTL_SEC);
  } catch { /* best effort */ }
}

export async function roastCount(now = Date.now()): Promise<number> {
  if (memo && now - memo.at < MEMO_MS) return memo.n;

  let n = 0;
  if (kvEnabled()) {
    try {
      const r = kv()!;
      // Prune occasionally, then count what's still inside the window.
      await r.zremrangebyscore(IDX, 0, now - COUNT_WINDOW_MS);
      n = await r.zcount(IDX, `(${now - COUNT_WINDOW_MS}`, '+inf');
    } catch { n = 0; }
  } else {
    try {
      const dir = resultsDir();
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        try {
          if (now - fs.statSync(path.join(dir, f)).mtimeMs < COUNT_WINDOW_MS) n += 1;
        } catch { /* vanished mid-scan */ }
      }
    } catch { /* cold cache: zero is the honest answer */ }
  }

  memo = { at: now, n };
  return n;
}

/** Test seam. */
export function __resetCounter(): void {
  memo = null;
}
