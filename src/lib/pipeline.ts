/** The whole server-side pipeline: URL -> cached or freshly generated result. */
import { backfillUrl, cacheGet, cacheSet, idForUrl } from './cache';
import { recordRoast } from './counter';
import { currentCta, currentHeadline, currentSubhead, extractFacts, hasEnoughContent } from './extract';
import { fetchPage, FetchPageError } from './fetchPage';
import { trackCost } from './gateway';
import { heuristicScores, scorePage, SUB_LABELS, type SubScoreKey } from './score';
import { writeRoast } from './roast';
import { recordShowcase } from './showcase';
import { hasBudget } from './spend';
import type { RoastResult } from './types';
import { displayUrl, siteName } from './url';
import { detectPageType } from './pageType';
import { appAfter } from './appState';
import { buildFixPrompt } from './fixPrompt';

export class ThinPageError extends Error {
  constructor() {
    super("There's barely any text on that page — nothing to roast. Try the marketing homepage.");
    this.name = 'ThinPageError';
  }
}

export class CappedError extends Error {
  constructor() {
    super("We're melting from traffic right now. Cached roasts still work — try again later.");
    this.name = 'CappedError';
  }
}

export async function getCached(id: string): Promise<RoastResult | null> {
  const hit = await cacheGet<RoastResult>(id);
  // Results cached before durable pointers existed get one when next served, so
  // their /r/<id> link can self-heal too. Deduped per instance; never throws.
  if (hit) await backfillUrl(hit);
  return hit;
}

const JEV_MODEL = () => process.env.JEV_MODEL || 'typesafe-ai/jev-1.14.0';
const ROAST_MODEL = () => process.env.ROAST_MODEL || 'anthropic/claude-haiku-5.5';

export type RoastOptions = {
  /**
   * Explicit re-roast: skip the cache-hit short-circuit and regenerate, then
   * overwrite the SAME id so the existing /r/<id> share link shows the new roast.
   * Default (absent/false) is "a cache hit wins" — that is the cost protection
   * when many people roast the same popular URL. Fresh still obeys the spend cap.
   */
  fresh?: boolean;
};

export async function roastUrl(
  normalizedUrl: string,
  opts: RoastOptions = {},
): Promise<{ result: RoastResult; cached: boolean; costUsd: number }> {
  const id = idForUrl(normalizedUrl);

  if (!opts.fresh) {
    const hit = await cacheGet<RoastResult>(id);
    if (hit) {
      await backfillUrl(hit);
      return { result: hit, cached: true, costUsd: 0 };
    }
  }

  // Spend cap: serve cache only. Checked before the fetch so we don't
  // hammer other people's sites for nothing either. A fresh re-roast is not
  // exempt: it spends real money like any other miss.
  if (!(await hasBudget())) throw new CappedError();

  const page = await fetchPage(normalizedUrl);
  const facts = extractFacts(page.html, page.finalUrl);
  if (!hasEnoughContent(facts)) throw new ThinPageError();

  // App/utility shell (google.com) vs a real marketing landing page. Pure, no
  // LLM: it decides whether there is anything to glow up at all.
  const { pageType, isLandingPage } = detectPageType(facts);

  // Meter the real USD cost of this scan across both LLM calls.
  const { value, costUsd } = await trackCost(async () => {
    // Jev is cheap and its output is free; fall back to heuristics if it blips
    // so one flaky dependency never costs us the whole result.
    let scores;
    let degraded: RoastResult['degraded'];
    try {
      scores = await scorePage(facts, JEV_MODEL());
    } catch {
      scores = heuristicScores(facts);
      degraded = 'heuristic-scores';
    }
    const copy = await writeRoast(facts, scores, ROAST_MODEL(), { isApp: !isLandingPage });
    return { scores, copy, degraded };
  });

  const { scores, copy, degraded } = value;

  const subs = (Object.keys(SUB_LABELS) as SubScoreKey[]).map((key) => ({
    key,
    label: SUB_LABELS[key],
    score: scores.subs[key],
    reason: copy.reasons[key],
  }));

  const sName = siteName(normalizedUrl);
  const dUrl = displayUrl(normalizedUrl);

  // An app shell has nothing to sell: keep the (intentional) roast, but replace
  // the hallucinated glow-up with the cheeky "nothing to fix" state and emit NO
  // fix prompt. A real landing page always gets a non-empty fixPrompt — the
  // model's, or a deterministic fallback built from the glow-up + fixes.
  const after = isLandingPage ? copy.glowup : appAfter(sName);
  const fixPrompt = isLandingPage
    ? copy.fixPrompt ||
      buildFixPrompt({ siteName: sName, displayUrl: dUrl, after: copy.glowup, fixes: copy.fixes })
    : undefined;

  const result: RoastResult = {
    id,
    url: normalizedUrl,
    displayUrl: dUrl,
    siteName: sName,
    favicon: facts.favicon,
    createdAt: Date.now(),
    score: { overall: scores.overall, subs },
    roast: copy.roast,
    verdict: copy.verdict,
    before: {
      headline: currentHeadline(facts),
      subhead: currentSubhead(facts),
      cta: currentCta(facts),
    },
    after,
    fixes: copy.fixes,
    pageType,
    isLandingPage,
    ...(fixPrompt ? { fixPrompt } : {}),
    ...(degraded ? { degraded } : {}),
  };

  await cacheSet(id, result);
  // KV mode only: keep the shared count + showcase indexes current. No-ops on disk.
  await recordRoast(id, result.createdAt);
  await recordShowcase(result);
  return { result, cached: false, costUsd };
}

export { FetchPageError };
