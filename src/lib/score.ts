/**
 * Scoring. Jev (evaluation model, free output) judges four dimensions.
 *
 * How Jev `score` questions actually work: the criteria array is an ORDERED
 * RUBRIC LADDER, not a set of independent checks. Jev returns a probability
 * distribution over the rung indices 0..n-1 and `score` is its expected value,
 * so the raw score lives in 0..(criteria.length - 1). Normalising by n-1 is
 * what turns it into a percentage — dividing by 100 would be nonsense.
 */
import { evaluate, type JevAnswer, type JevQuestion } from './gateway';
import type { PageFacts } from './extract';
import { currentHeadline, currentSubhead } from './extract';

export type SubScoreKey = 'hook' | 'clarity' | 'trust' | 'design';

export type Scores = {
  overall: number;
  subs: Record<SubScoreKey, number>;
  audience: string;
  buzzwordy: number;
};

export const SUB_LABELS: Record<SubScoreKey, string> = {
  hook: 'Hook',
  clarity: 'Clarity',
  trust: 'Trust',
  design: 'Design-signal',
};

/** Weights: a landing page lives or dies on hook + clarity. */
const WEIGHTS: Record<SubScoreKey, number> = { hook: 0.3, clarity: 0.3, trust: 0.2, design: 0.2 };

/** Ordered worst-to-best rubric ladders, one per dimension. */
const LADDERS: Record<SubScoreKey, string[]> = {
  hook: [
    'There is no real headline, or it is pure generic category words that could belong to any company',
    'The headline names a product category or topic but makes no promise to the reader',
    'The headline states a real benefit, though one that competitors could claim just as easily',
    'The headline makes a specific, concrete promise aimed at a recognisable audience',
    'The headline is a sharp, specific promise with a real outcome, number, or pain that a stranger instantly wants',
  ],
  clarity: [
    'After reading the page a first-time visitor still cannot say what this product does',
    'The general domain is guessable but what the product actually does is not',
    'A visitor can roughly tell what it does, but not who it is for or why it is different',
    'The page plainly states what the product does and who it is for',
    'It is instantly obvious what the product does, who it is for, and what the single next action is',
  ],
  trust: [
    'There is no evidence of any kind that this is a real, maintained business',
    'Claims are made with nothing at all backing them up',
    'The page reads as a real business but offers no named customers, metrics, or testimonials',
    'The page shows real proof: named customers, testimonials, logos, or concrete numbers',
    'Proof is layered and specific: named customers plus hard numbers plus transparent pricing',
  ],
  design: [
    'Core craft signals are missing: no real title, no meta description, no favicon, no structure',
    'Only the bare minimum metadata exists and the content is an unstructured wall of text',
    'Basic craft signals are present but the social preview or heading structure is incomplete',
    'The page has a real title, meta description, favicon, social preview image, and clear heading hierarchy',
    'Every craft signal is present and the page reads as deliberately designed by a team that cares about detail',
  ],
};

const SCORE_QUESTIONS: Record<SubScoreKey, JevQuestion> = {
  hook: { type: 'score', criteria: LADDERS.hook },
  clarity: { type: 'score', criteria: LADDERS.clarity },
  trust: { type: 'score', criteria: LADDERS.trust },
  design: { type: 'score', criteria: LADDERS.design },
};

const EXTRA_QUESTIONS: Record<string, JevQuestion> = {
  audience: {
    type: 'choice',
    criteria: {
      developers: 'Built for software engineers or technical builders',
      founders: 'Built for startup founders or small business owners',
      marketers: 'Built for marketing, sales, or growth teams',
      designers: 'Built for designers or creative professionals',
      consumers: 'Built for general consumers or everyday people',
      enterprise: 'Built for large enterprise buyers or IT departments',
      unclear: 'The page never says who it is for',
    },
  },
  buzzwordy: {
    type: 'boolean',
    criteria: {
      true: 'The copy leans on corporate buzzwords and abstract filler',
      false: 'The copy is plain, specific, and concrete',
    },
  },
};

/**
 * Turn a raw Jev ordinal score into 0..100.
 * `levels` is the number of rungs; the top rung index is levels - 1.
 */
export function normalizeScore(raw: unknown, levels: number): number {
  // Only a real number counts. Coercing would turn null/'' into 0, which
  // reads as a legitimate score of zero instead of a missing answer.
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 50;
  const top = Math.max(1, levels - 1);
  return Math.max(0, Math.min(100, Math.round((raw / top) * 100)));
}

/** A 0..1 probability (boolean questions) straight to 0..100. */
export function probabilityToHundred(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 50;
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}

/**
 * Pull one 0..100 sub-score out of a Jev answers record, tolerating a
 * missing or wrong-typed answer rather than failing the whole request.
 */
export function readSubScore(
  answers: Record<string, JevAnswer> | undefined,
  key: SubScoreKey,
): number {
  const a = answers?.[key];
  const levels = LADDERS[key].length;
  if (a && a.type === 'score') return normalizeScore(a.score, levels);
  if (a && a.type === 'boolean') return probabilityToHundred(a.probability);
  return 50;
}

export function weightedOverall(subs: Record<SubScoreKey, number>): number {
  let total = 0;
  for (const k of Object.keys(WEIGHTS) as SubScoreKey[]) {
    total += (subs[k] ?? 50) * WEIGHTS[k];
  }
  return Math.max(1, Math.min(100, Math.round(total)));
}

/** The compact state we hand to Jev — also the shape AutoGTM will reuse. */
export function scoringState(f: PageFacts): Record<string, unknown> {
  return {
    url: f.url,
    page_title: f.title,
    headline: currentHeadline(f),
    subhead: currentSubhead(f),
    meta_description: f.metaDescription,
    social_preview_title: f.ogTitle,
    section_headings: f.h2s,
    hero_copy: f.heroText.slice(0, 700),
    call_to_action_labels: f.ctas,
    nav_labels: f.navLabels,
    buzzwords_detected: f.buzzwords,
    word_count: f.wordCount,
    has_social_preview_image: f.signals.hasOgImage,
    has_meta_description: f.signals.hasMetaDescription,
    has_favicon: f.signals.hasFavicon,
    has_h1: f.signals.hasH1,
    has_testimonials: f.signals.hasTestimonial,
    has_customer_logos: f.signals.hasLogoWall,
    has_visible_pricing: f.signals.hasPricing,
    has_concrete_numbers: f.signals.hasNumbers,
  };
}

export async function scorePage(facts: PageFacts, model: string): Promise<Scores> {
  const answers = await evaluate({
    model,
    state: scoringState(facts),
    questions: { ...SCORE_QUESTIONS, ...EXTRA_QUESTIONS },
  });

  const subs: Record<SubScoreKey, number> = {
    hook: readSubScore(answers, 'hook'),
    clarity: readSubScore(answers, 'clarity'),
    trust: readSubScore(answers, 'trust'),
    design: readSubScore(answers, 'design'),
  };

  const aud = answers['audience'];
  const audience = aud && aud.type === 'choice' ? aud.choice : 'unclear';
  const buzz = answers['buzzwordy'];
  const buzzwordy = buzz && buzz.type === 'boolean' ? probabilityToHundred(buzz.probability) : 50;

  return { overall: weightedOverall(subs), subs, audience, buzzwordy };
}

/** Deterministic fallback so a Jev outage still produces a usable result. */
export function heuristicScores(f: PageFacts): Scores {
  const s = f.signals;
  const hl = currentHeadline(f);
  const hookRaw =
    (hl.length > 10 && hl.length < 70 ? 30 : 12) +
    (/\d/.test(hl) ? 18 : 0) +
    (f.buzzwords.length === 0 ? 22 : Math.max(0, 22 - f.buzzwords.length * 5)) +
    (f.ctas.length ? 15 : 0);
  const clarityRaw =
    (s.hasH1 ? 25 : 5) + (s.hasMetaDescription ? 20 : 0) +
    (f.ctas.length ? 20 : 0) + (f.wordCount > 60 ? 15 : 5) +
    (f.buzzwords.length < 3 ? 15 : 0);
  const trustRaw =
    (s.hasTestimonial ? 28 : 0) + (s.hasLogoWall ? 22 : 0) +
    (s.hasPricing ? 20 : 0) + (s.hasNumbers ? 18 : 0) + 8;
  const designRaw =
    (s.hasOgImage ? 28 : 0) + (s.hasFavicon ? 18 : 0) +
    (s.hasMetaDescription ? 16 : 0) + (f.h2s.length >= 2 ? 20 : 6) +
    (s.imageCount > 2 ? 14 : 4);

  const subs: Record<SubScoreKey, number> = {
    hook: Math.max(5, Math.min(95, Math.round(hookRaw))),
    clarity: Math.max(5, Math.min(95, Math.round(clarityRaw))),
    trust: Math.max(5, Math.min(95, Math.round(trustRaw))),
    design: Math.max(5, Math.min(95, Math.round(designRaw))),
  };
  return {
    overall: weightedOverall(subs),
    subs,
    audience: 'unclear',
    buzzwordy: Math.min(95, f.buzzwords.length * 18),
  };
}

/** Exposed for tests: rung counts must stay in sync with the ladders. */
export const LADDER_LEVELS: Record<SubScoreKey, number> = {
  hook: LADDERS.hook.length,
  clarity: LADDERS.clarity.length,
  trust: LADDERS.trust.length,
  design: LADDERS.design.length,
};
