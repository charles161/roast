/**
 * Hard daily LLM spend cap. The gateway reports real cost per generation,
 * so we meter actuals rather than guessing from tokens.
 * Persisted to disk so a restart can't reset the day's budget.
 */
import fs from 'node:fs';
import path from 'node:path';

const CACHE_DIR = process.env.ROAST_CACHE_DIR || path.join(process.cwd(), '.cache');
const LEDGER = path.join(CACHE_DIR, 'spend.json');

export function dailyCapUsd(): number {
  const n = Number(process.env.DAILY_LLM_USD_CAP);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

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

export function spentToday(): { usd: number; calls: number; capUsd: number } {
  const l = load();
  return { usd: l.usd, calls: l.calls, capUsd: dailyCapUsd() };
}

/** True when we still have budget to make a fresh LLM call. */
export function hasBudget(): boolean {
  return load().usd < dailyCapUsd();
}

export function recordSpend(usd: number): void {
  const l = load();
  const add = Number.isFinite(usd) && usd > 0 ? usd : 0;
  save({ day: l.day, usd: l.usd + add, calls: l.calls + 1 });
}

/** Test seam. */
export function __resetSpend(): void {
  mem = null;
  try { fs.rmSync(LEDGER, { force: true }); } catch { /* ignore */ }
}
