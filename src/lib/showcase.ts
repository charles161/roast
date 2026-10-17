/**
 * Hero proof: a REAL roast, read straight off the result cache.
 *
 * The brief for this page is the same one we score everyone else against —
 * copy has to match what the page actually shows. So the example in the hero
 * is not a mock-up of a result, it is a result. If the cache has nothing
 * worth showing, the hero shows nothing.
 *
 * We only surface well-known public landing pages. Someone's personal site
 * should not become our marketing because they tried the tool once.
 */
import fs from 'node:fs';
import path from 'node:path';
import { TTL_MS } from './cache';
import type { RoastResult } from './types';

const WELL_KNOWN = new Set([
  'stripe.com', 'linear.app', 'vercel.com', 'notion.so', 'figma.com',
  'github.com', 'anthropic.com', 'openai.com', 'railway.app', 'cal.com',
  'supabase.com', 'posthog.com', 'clerk.com', 'resend.com', 'netlify.com',
  'google.com', 'slack.com', 'airbnb.com', 'shopify.com',
]);

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

/** The freshest live roast of a page everyone recognises, or null. */
export function showcaseRoast(now = Date.now()): RoastResult | null {
  if (memo && now - memo.at < MEMO_MS) return memo.value;

  let best: RoastResult | null = null;
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

  memo = { at: now, value: best };
  return best;
}

/** Test seam. */
export function __resetShowcase(): void {
  memo = null;
}
