import type { SubScoreKey } from './score';

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
  degraded?: 'heuristic-scores';
};

export type ApiError = { error: string; code: 'bad_url' | 'blocked' | 'fetch' | 'thin' | 'rate' | 'capped' | 'llm' | 'server' };
