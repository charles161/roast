/**
 * Hero proof: a REAL roast, read straight off the result cache.
 *
 * The brief for this page is the same one we score everyone else against —
 * copy has to match what the page actually shows. So the example in the hero
 * is not a mock-up of a result, it is a result. If there is nothing worth
 * showing, the hero shows nothing.
 *
 * We only surface well-known public landing pages. Someone's personal site
 * should not become our marketing because they tried the tool once.
 *
 *   - No KV env: scan the result cache dir for the freshest usable well-known.
 *   - KV env present: a sorted set `roast:showcase` scored by createdAt; read
 *     the freshest members and return the first that still resolves + is usable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { cacheGet, TTL_MS } from './cache';
import { k, kv, kvEnabled } from './kv';
import type { RoastResult } from './types';

const WELL_KNOWN = new Set([
  'stripe.com', 'linear.app', 'vercel.com', 'notion.so', 'figma.com',
  'github.com', 'anthropic.com', 'openai.com', 'railway.app', 'cal.com',
  'supabase.com', 'posthog.com', 'clerk.com', 'resend.com', 'netlify.com',
  'google.com', 'slack.com', 'airbnb.com', 'shopify.com',
]);

const SHOWCASE = k('showcase');
const SHOWCASE_TTL_SEC = Math.ceil((2 * TTL_MS) / 1000);
const SCAN_TOP = 20; // most-recent members to consider in KV mode

const MEMO_MS = 60_000;
let memo: { at: number; value: RoastResult | null } | null = null;

function resultsDir(): string {
  const base = process.env.ROAST_CACHE_DIR || path.join(process.cwd(), '.cache');
  return path.join(base, 'results');
}

function usable(r: unknown): r is RoastResult {
  const v = r as RoastResult | undefined;
  return Boolean(
    v &&
      typeof v.id === 'string' &&
      typeof v.displayUrl === 'string' &&
      typeof v.verdict === 'string' &&
      v.verdict.length > 0 &&
      v.score &&
      typeof v.score.overall === 'number' &&
      Array.isArray(v.roast) &&
      v.roast.length > 0 &&
      v.after &&
      typeof v.after.headline === 'string',
  );
}

/** KV mode: add a well-known result to the showcase index. No-op on disk. */
export async function recordShowcase(r: {
  id: string;
  displayUrl: string;
  createdAt: number;
}): Promise<void> {
  if (!kvEnabled()) return;
  if (!WELL_KNOWN.has(r.displayUrl)) return;
  const client = kv()!;
  try {
    await client.zadd(SHOWCASE, { score: r.createdAt, member: r.id });
    await client.expire(SHOWCASE, SHOWCASE_TTL_SEC);
  } catch { /* best effort */ }
}

/** The freshest live roast of a page everyone recognises, or null. */
export async function showcaseRoast(now = Date.now()): Promise<RoastResult | null> {
  if (memo && now - memo.at < MEMO_MS) return memo.value;

  let best: RoastResult | null = null;

  if (kvEnabled()) {
    try {
      const ids = await kv()!.zrange(SHOWCASE, 0, SCAN_TOP - 1, { rev: true });
      for (const id of ids) {
        const v = await cacheGet<RoastResult>(id, now); // null once expired
        if (usable(v) && WELL_KNOWN.has(v.displayUrl)) { best = v; break; }
      }
    } catch { best = null; }
  } else {
    try {
      const dir = resultsDir();
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const p = path.join(dir, f);
          if (now - fs.statSync(p).mtimeMs >= TTL_MS) continue;
          const entry = JSON.parse(fs.readFileSync(p, 'utf8')) as { value?: unknown };
          const v = entry.value;
          if (!usable(v) || !WELL_KNOWN.has(v.displayUrl)) continue;
          if (!best || v.createdAt > best.createdAt) best = v;
        } catch { /* skip an unreadable entry */ }
      }
    } catch { /* cold cache: no proof, so show none */ }
  }

  memo = { at: now, value: best };
  return best;
}

/** Test seam. */
export function __resetShowcase(): void {
  memo = null;
}
