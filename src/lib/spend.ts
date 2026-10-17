/**
 * Hard daily LLM spend cap. The gateway reports real cost per generation, so
 * we meter actuals rather than guessing from tokens.
 *   - No KV env: persisted to disk so a restart can't reset the day's budget.
 *   - KV env present: atomic Redis counters, so the cap is GLOBAL across every
 *     serverless instance (a per-instance cap would be unenforceable = real
 *     money risk). Increments are atomic ops only — never read-modify-write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { k, kv, kvEnabled } from './kv';

const CACHE_DIR = process.env.ROAST_CACHE_DIR || path.join(process.cwd(), '.cache');
const LEDGER = path.join(CACHE_DIR, 'spend.json');
const SPEND_TTL_SEC = 172_800; // ~2 days: yesterday lingers briefly, then evaporates

export function dailyCapUsd(): number {
  const n = Number(process.env.DAILY_LLM_USD_CAP);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const usdKey = (day: string) => k(`spend:${day}:usd`);
const callsKey = (day: string) => k(`spend:${day}:calls`);

type Ledger = { day: string; usd: number; calls: number };

let mem: Ledger | null = null;

function load(): Ledger {
  if (mem && mem.day === today()) return mem;
  let l: Ledger = { day: today(), usd: 0, calls: 0 };
  try {
    const raw = JSON.parse(fs.readFileSync(LEDGER, 'utf8')) as Ledger;
    if (raw && raw.day === today() && Number.isFinite(raw.usd)) l = raw;
  } catch { /* fresh day or no file */ }
  mem = l;
  return l;
}

function save(l: Ledger): void {
  mem = l;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(LEDGER, JSON.stringify(l), 'utf8');
  } catch { /* disk optional; memory still enforces within this process */ }
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function spentToday(): Promise<{ usd: number; calls: number; capUsd: number }> {
  if (kvEnabled()) {
    const r = kv()!;
    const day = today();
    try {
      const [usd, calls] = await Promise.all([
        r.get<number>(usdKey(day)),
        r.get<number>(callsKey(day)),
      ]);
      return { usd: num(usd), calls: num(calls), capUsd: dailyCapUsd() };
    } catch {
      return { usd: 0, calls: 0, capUsd: dailyCapUsd() };
    }
  }
  const l = load();
  return { usd: l.usd, calls: l.calls, capUsd: dailyCapUsd() };
}

/** True when we still have budget to make a fresh LLM call. */
export async function hasBudget(): Promise<boolean> {
  if (kvEnabled()) {
    try {
      return num(await kv()!.get<number>(usdKey(today()))) < dailyCapUsd();
    } catch {
      // A KV read failure must fail CLOSED: do not risk unbounded spend.
      return false;
    }
  }
  return load().usd < dailyCapUsd();
}

export async function recordSpend(usd: number): Promise<void> {
  const add = Number.isFinite(usd) && usd > 0 ? usd : 0;

  if (kvEnabled()) {
    const r = kv()!;
    const day = today();
    try {
      // Atomic counters — never read-then-write, so concurrent instances can't
      // race the cap open.
      if (add > 0) await r.incrbyfloat(usdKey(day), add);
      await r.incr(callsKey(day));
      await r.expire(usdKey(day), SPEND_TTL_SEC);
      await r.expire(callsKey(day), SPEND_TTL_SEC);
    } catch { /* best effort; the cap read fails closed anyway */ }
    return;
  }

  const l = load();
  save({ day: l.day, usd: l.usd + add, calls: l.calls + 1 });
}

/** Test seam. */
export async function __resetSpend(): Promise<void> {
  mem = null;
  if (kvEnabled()) {
    const day = today();
    try { await kv()!.del(usdKey(day), callsKey(day)); } catch { /* ignore */ }
    return;
  }
  try { fs.rmSync(LEDGER, { force: true }); } catch { /* ignore */ }
}
