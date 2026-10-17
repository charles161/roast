/** The whole server-side pipeline: URL -> cached or freshly generated result. */
import { cacheGet, cacheSet, idForUrl } from './cache';
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
  return cacheGet<RoastResult>(id);
}

const JEV_MODEL = () => process.env.JEV_MODEL || 'typesafe-ai/jev-1.14.0';
const ROAST_MODEL = () => process.env.ROAST_MODEL || 'anthropic/claude-haiku-5.5';

export async function roastUrl(
  normalizedUrl: string,
): Promise<{ result: RoastResult; cached: boolean; costUsd: number }> {
  const id = idForUrl(normalizedUrl);

  const hit = await cacheGet<RoastResult>(id);
  if (hit) return { result: hit, cached: true, costUsd: 0 };

  // Spend cap: serve cache only. Checked before the fetch so we don't
  // hammer other people's sites for nothing either.
  if (!(await hasBudget())) throw new CappedError();

  const page = await fetchPage(normalizedUrl);
  const facts = extractFacts(page.html, page.finalUrl);
  if (!hasEnoughContent(facts)) throw new ThinPageError();

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
    const copy = await writeRoast(facts, scores, ROAST_MODEL());
    return { scores, copy, degraded };
  });

  const { scores, copy, degraded } = value;

  const subs = (Object.keys(SUB_LABELS) as SubScoreKey[]).map((key) => ({
    key,
    label: SUB_LABELS[key],
    score: scores.subs[key],
    reason: copy.reasons[key],
  }));

  const result: RoastResult = {
    id,
    url: normalizedUrl,
    displayUrl: displayUrl(normalizedUrl),
    siteName: siteName(normalizedUrl),
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
    after: copy.glowup,
    fixes: copy.fixes,
    ...(degraded ? { degraded } : {}),
  };

  await cacheSet(id, result);
  // KV mode only: keep the shared count + showcase indexes current. No-ops on disk.
  await recordRoast(id, result.createdAt);
  await recordShowcase(result);
  return { result, cached: false, costUsd };
}

export { FetchPageError };
