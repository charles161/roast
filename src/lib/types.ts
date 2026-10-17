import type { SubScoreKey } from './score';
import type { PageType } from './pageType';

export type RoastResult = {
  id: string;
  url: string;
  displayUrl: string;
  siteName: string;
  favicon: string;
  createdAt: number;
  score: { overall: number; subs: { key: SubScoreKey; label: string; score: number; reason: string }[] };
  roast: string[];
  verdict: string;
  before: { headline: string; subhead: string; cta: string };
  after: { headline: string; subhead: string; cta: string };
  fixes: string[];
  /** A ready-to-paste brief for an AI coding agent to ship the glow-up. Present
   *  for real landing pages; omitted for app/utility shells (nothing to fix). */
  fixPrompt?: string;
  /** Whether this is a marketing landing page or an app/utility shell. */
  pageType?: PageType;
  isLandingPage?: boolean;
  degraded?: 'heuristic-scores';
};

export type ApiError = { error: string; code: 'bad_url' | 'blocked' | 'fetch' | 'thin' | 'rate' | 'capped' | 'llm' | 'server' };
