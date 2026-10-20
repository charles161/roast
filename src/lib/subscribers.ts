/**
 * Email capture store. ADDITIVE — nothing here touches the roast pipeline or
 * its guards. Two backends behind one async API, mirroring the rest of the
 * state layer:
 *   - KV env present (Vercel): a single Redis HASH `roast:subscribers`
 *     (field = lowercased email, value = JSON {ts, roastId, source}) plus a
 *     cheap `roast:subscribers:count` counter. `HSETNX` is atomic, so dedupe
 *     and "is this new?" are the same op and two serverless instances agree.
 *   - No KV env (local / VPC): one small JSON file per subscriber under
 *     `<CACHE_DIR>/subscribers/`, written atomically. The filename is a hash of
 *     the email (never the email itself), so a directory listing can't leak the
 *     list, and an existing file means "already subscribed".
 *
 * The caller (the /api/subscribe route) validates the email first; this module
 * only lowercases/trims for the key. It NEVER logs an email.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { k, kv, kvEnabled } from './kv';

/** Hash-op slice of the real Upstash client. The narrow KvClient type the state
 *  layer shares doesn't declare these, but the live `@upstash/redis` instance
 *  (and the test stub) implement them. Cast rather than widen KvClient, so the
 *  shared interface the other modules depend on stays exactly as it was. */
interface HashKv {
  hsetnx(key: string, field: string, value: unknown): Promise<number>;
  incr(key: string): Promise<number>;
}

/** Redis keys (namespaced via `k`, i.e. the shared `roast:` prefix). */
const HASH_KEY = k('subscribers');
const COUNT_KEY = k('subscribers:count');

const CACHE_DIR = process.env.ROAST_CACHE_DIR || path.join(process.cwd(), '.cache');
// A sibling of RESULTS_DIR; cache.ts' pruner only ever scans RESULTS_DIR, so a
// subscriber file can never be reaped by it.
const SUBS_DIR = path.join(CACHE_DIR, 'subscribers');

export type SubscribeInput = {
  /** Already validated by the route. Lowercased + trimmed here for the key. */
  email: string;
  roastId?: string;
  source?: string;
};

export type SubscribeOutcome = { dup: boolean };

function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

function diskName(lcEmail: string): string {
  // Hash the email so the on-disk filename never exposes it.
  return crypto.createHash('sha256').update(lcEmail).digest('base64url').slice(0, 24);
}

/**
 * Record a subscriber durably. Returns `{ dup: true }` when the email was
 * already captured (idempotent — the caller still answers 200). Throws only on
 * a genuine storage failure, so the route can surface a quiet retry.
 */
export async function recordSubscriber(input: SubscribeInput, now = Date.now()): Promise<SubscribeOutcome> {
  const email = emailKey(input.email);
  const record = {
    ts: now,
    roastId: input.roastId ?? null,
    source: input.source ?? null,
  };

  if (kvEnabled()) {
    const client = kv() as unknown as HashKv;
    // HSETNX: 1 => this field was new, 0 => it already existed (a duplicate).
    const added = await client.hsetnx(HASH_KEY, email, record);
    if (added === 1) {
      // Best-effort cheap counter; HLEN is the source of truth if it ever drifts.
      try {
        await client.incr(COUNT_KEY);
      } catch {
        /* count is a convenience, not correctness */
      }
      return { dup: false };
    }
    return { dup: true };
  }

  // Disk fallback (no shared KV): one file per subscriber, filename = hash.
  const file = path.join(SUBS_DIR, `${diskName(email)}.json`);
  if (fs.existsSync(file)) return { dup: true };
  fs.mkdirSync(SUBS_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ email, ...record }), 'utf8');
  fs.renameSync(tmp, file); // atomic: a reader never sees a partial file
  return { dup: false };
}

/** Test seam: wipe the disk store (KV is cleared via the kv injection seam). */
export function __clearSubscribersDisk(): void {
  try {
    fs.rmSync(SUBS_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
