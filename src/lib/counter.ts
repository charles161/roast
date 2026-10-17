/**
 * How many sites have actually been roasted, read straight off the result
 * cache: one file per distinct site, and the file is gone once its 24h TTL
 * lapses. Never a decorative number — if the disk says nothing, we show
 * nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { TTL_MS } from './cache';

/** Under this it reads as a dead launch, so the UI stays quiet instead. */
export const MIN_DISPLAY = 25;

const MEMO_MS = 60_000;
let memo: { at: number; n: number } | null = null;

function resultsDir(): string {
  const base = process.env.ROAST_CACHE_DIR || path.join(process.cwd(), '.cache');
  return path.join(base, 'results');
}

/**
 * Counts cache files still inside their TTL. mtime is the write time, so
 * `mtime + TTL` is exactly the entry's expiry — no need to open each file.
 */
export function roastCount(now = Date.now()): number {
  if (memo && now - memo.at < MEMO_MS) return memo.n;

  let n = 0;
  try {
    const dir = resultsDir();
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        if (now - fs.statSync(path.join(dir, f)).mtimeMs < TTL_MS) n += 1;
      } catch { /* vanished mid-scan */ }
    }
  } catch { /* cold cache: zero is the honest answer */ }

  memo = { at: now, n };
  return n;
}

/** Test seam. */
export function __resetCounter(): void {
  memo = null;
}
