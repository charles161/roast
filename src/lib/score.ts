/**
 * THE LENS, scored. Raphael Schaad's landing-page rubric, judged by Jev
 * (evaluation model, free output) against the deterministic evidence in
 * `lens.ts`.
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
import {
  ctaAudit,
  fiveSecondRead,
  hasHero,
  hasProof,
  jargonDensity,
  jargonHits,
  lensEvidence,
  slopMarkers,
} from './lens';

export type SubScoreKey = 'hero' | 'specificity' | 'trust' | 'craft' | 'cta';

export type Scores = {
  overall: number;
  subs: Record<SubScoreKey, number>;
  audience: string;
  buzzwordy: number;
};

/** Short enough to sit under a number on the share card. */
export const SUB_LABELS: Record<SubScoreKey, string> = {
  hero: 'Hero',
  specificity: 'Specifics',
  trust: 'Proof',
  craft: 'Craft',
  cta: 'CTA',
};

/** What each dimension is actually asking, for the prompt and the UI. */
export const SUB_BRIEFS: Record<SubScoreKey, string> = {
  hero: 'Can a stranger tell what this is, who it is for, and what they get — in five seconds?',
  specificity: 'Is the copy specific and plain, and does the page deliver what it promises?',
  trust: 'Is there real, checkable proof that this works and that people use it?',
  craft: 'Does the page look deliberately made, or generated?',
  cta: 'Is there one clear ask, in the reader’s words?',
};

/** Schaad's weighting: the hero and the craft carry the page. */
const WEIGHTS: Record<SubScoreKey, number> = {
  hero: 0.3,
  specificity: 0.2,
  trust: 0.15,
  craft: 0.25,
  cta: 0.1,
};

/**
 * Ordered worst-to-best rubric ladders. The top rung describes what the best
 * pages on the internet actually do, not an unreachable ideal — a ladder whose
 * top nobody can stand on is a broken instrument.
 */
const LADDERS: Record<SubScoreKey, string[]> = {
  hero: [
    'After five seconds a stranger cannot say what this is or who it is for',
    'The headline names a category or a mood, but a stranger still cannot say what the product does',
    'A stranger can roughly place the domain, but not the specific product or the audience',
    'In five seconds a stranger can say what this does and roughly who it is for',
    'In five seconds a stranger can say what it does, who it is for, and what they get, in the page’s own plain words',
  ],
  specificity: [
    'The copy is almost entirely jargon and could be pasted onto any other company’s homepage',
    'Stacked buzzwords with a few real words; nothing names a specific user, job, or outcome',
    'There is a little concrete detail, but the hero is mostly an abstract claim any competitor could copy',
    'The copy is concrete and plain, names the product and the buyer, and matches what the page shows',
    'Every line is specific to this product, in plain words, and the page visibly delivers what the copy promises',
  ],
  trust: [
    'Nothing on the page suggests a real business or a real user',
    'Claims are asserted with nothing at all behind them',
    'It reads as a real business but shows no named customers, numbers, or testimonials',
    'Real proof is present: named customers, testimonials, logos, or concrete numbers',
    'Proof is layered and checkable: named customers plus hard numbers plus transparent pricing',
  ],
  // Judged from what is actually observable in the HTML — metadata, structure
  // and whether the writing reads as edited or generated. An earlier version
  // asked about visual design, which the model cannot see, so nothing could
  // ever reach the top rung.
  craft: [
    'Basic craft signals are missing: no real title, no meta description, no social preview, no heading structure',
    'Only the bare minimum exists, and the copy reads as untouched boilerplate',
    'The basics are present, but the page reads as assembled from a template',
    'Complete metadata, a real heading hierarchy, and copy that someone clearly edited',
    'Every craft signal is present and the writing has a specific voice — no filler, no generated phrasing, nothing a template would produce',
  ],
  cta: [
    'There is no call to action anywhere on the page',
    'The only ask is a generic button that never says what happens next',
    'There is a real ask, but several others of equal weight compete with it in the hero itself (a nav with Pricing and Login is normal, not competing)',
    'One clear primary action, plainly worded',
    'One clear primary action in the reader’s own words, with the next step obvious and low-friction',
  ],
};

const SCORE_QUESTIONS: Record<SubScoreKey, JevQuestion> = {
  hero: { type: 'score', criteria: LADDERS.hero },
  specificity: { type: 'score', criteria: LADDERS.specificity },
  trust: { type: 'score', criteria: LADDERS.trust },
  craft: { type: 'score', criteria: LADDERS.craft },
  cta: { type: 'score', criteria: LADDERS.cta },
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

export const CALIBRATION_KNEE = 72;

/**
 * Top-end calibration.
 *
 * Jev answers with the EXPECTED rung index over a probability distribution, so
 * even a page it is sure sits on the top rung comes back near 3.8 of 4 rather
 * than 4.0 — the residual mass on lower rungs never fully vanishes. Linear
 * normalisation therefore parks the best pages on the internet around 90 and
 * makes 100 unreachable in practice, which makes the top of the scale useless.
 *
 * This curve is the identity up to the knee, so slop and mediocrity are scored
 * exactly as measured, and concave above it, so the top rung's realistic range
 * spreads across the last ten points. It is monotonic and maps 100 to 100.
 */
export function calibrate(score: number): number {
  const x = Math.max(0, Math.min(100, score));
  if (x <= CALIBRATION_KNEE) return Math.round(x);
  const span = 100 - CALIBRATION_KNEE;
  return Math.round(CALIBRATION_KNEE + span * ((x - CALIBRATION_KNEE) / span) ** 0.62);
}

/**
 * Pull one calibrated 0..100 sub-score out of a Jev answers record, tolerating
 * a missing or wrong-typed answer rather than failing the whole request.
 */
export function readSubScore(
  answers: Record<string, JevAnswer> | undefined,
  key: SubScoreKey,
): number {
  const a = answers?.[key];
  const levels = LADDERS[key].length;
  if (a && a.type === 'score') return calibrate(normalizeScore(a.score, levels));
  if (a && a.type === 'boolean') return calibrate(probabilityToHundred(a.probability));
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
    // Nav links are NOT calls to action. Passing the raw list made the model
    // read every site with a Pricing link as having competing asks.
    primary_call_to_action: ctaAudit(f).primary,
    other_call_to_action_labels: ctaAudit(f).count,
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
    // The lens, measured rather than guessed. Judge against this, not vibes.
    lens: lensEvidence(f),
    // Calibration. Without this the model clusters everything in the middle,
    // and a scale whose top nobody reaches is not a scale.
    scoring_guidance:
      'Score by matching the page to the RUNG TEXT, worst-to-best, and pick the ' +
      'highest rung whose description the page actually satisfies. The top rung ' +
      'describes what the best real pages on the internet do, and the best real ' +
      'pages genuinely reach it — do not dock a rung for subjective taste or ' +
      'because a single line could be sharper. If the hero is clear, the copy is ' +
      'plain and specific, there is real proof, the craft signals are all present ' +
      'with edited writing, and there is one clear ask, then those dimensions ARE ' +
      'the top rung — score them there. Reserve the bottom two rungs for pages ' +
      'that genuinely fail the rung text. Never cluster toward the middle; a scale ' +
      'whose top no real page reaches is a broken instrument.',
  };
}

export async function scorePage(facts: PageFacts, model: string): Promise<Scores> {
  const answers = await evaluate({
    model,
    state: scoringState(facts),
    questions: { ...SCORE_QUESTIONS, ...EXTRA_QUESTIONS },
  });

  const subs: Record<SubScoreKey, number> = {
    hero: readSubScore(answers, 'hero'),
    specificity: readSubScore(answers, 'specificity'),
    trust: readSubScore(answers, 'trust'),
    craft: readSubScore(answers, 'craft'),
    cta: readSubScore(answers, 'cta'),
  };

  const aud = answers['audience'];
  const audience = aud && aud.type === 'choice' ? aud.choice : 'unclear';
  const buzz = answers['buzzwordy'];
  const buzzwordy = buzz && buzz.type === 'boolean' ? probabilityToHundred(buzz.probability) : 50;

  return { overall: weightedOverall(subs), subs, audience, buzzwordy };
}

const clamp = (n: number) => Math.max(3, Math.min(100, Math.round(n)));

/**
 * Deterministic fallback so a Jev outage still produces a usable result — and
 * the reference implementation of the rubric. Every term below reads a real
 * measurement from the lens.
 */
export function heuristicScores(f: PageFacts): Scores {
  const s = f.signals;
  const five = fiveSecondRead(f);
  const cta = ctaAudit(f);
  const proof = hasProof(f);
  const jargon = jargonHits(f);
  const dense = jargonDensity(f) >= 2;
  const hero = hasHero(f);
  const headlineWords = currentHeadline(f).split(/\s+/).filter(Boolean).length;

  // No hero means no messaging to judge. An app shell does not get to score
  // like a landing page just because its nav is tidy.
  const heroRaw = hero
    ? [8, 40, 72, 90][five.answered]! +
      (headlineWords >= 3 && headlineWords <= 16 ? 8 : -4) +
      (dense ? -12 : 0) +
      (currentSubhead(f) ? 4 : -10)
    : 5;

  // Specificity is earned by naming things, not merely by avoiding jargon: a
  // page with no copy at all has nothing concrete in it either.
  const substance = Math.min(1, 0.35 + f.wordCount / 60) * (hero ? 1 : 0.35);
  const specificityRaw =
    (40 +
      (five.namesWhat ? 20 : 0) +
      (five.namesOutcome ? 20 : 0) +
      (s.hasNumbers ? 10 : 0) +
      (f.h2s.length >= 2 ? 10 : 0)) *
      substance -
    jargon.length * 12 -
    (dense ? 15 : 0);

  // A page showing logos, pricing and hard numbers but no testimonial is
  // still "real proof present" — it should not be punished into the 60s.
  const trustRaw =
    (proof.social ? 26 : 0) +
    (proof.logos ? 26 : 0) +
    (s.hasPricing ? 17 : 0) +
    (s.hasNumbers ? 17 : 0) +
    14;

  const craftRaw =
    (s.hasOgImage ? 26 : 0) +
    (s.hasFavicon ? 16 : 0) +
    (s.hasMetaDescription ? 16 : 0) +
    (s.hasH1 ? 10 : 0) +
    (f.h2s.length >= 2 ? 18 : 4) +
    (s.imageCount > 2 ? 14 : 4) -
    // The fallback cannot see a layout, but copy that reads as generated is
    // itself craft evidence.
    slopMarkers(f).length * 6 -
    (dense ? 10 : 0);

  const ctaBase = cta.missing ? 8 : cta.generic ? 38 : cta.competing ? 55 : 92;
  // Nothing to convert on: a sign-in link is not a call to action.
  const ctaRaw = hero ? ctaBase : Math.min(ctaBase, 40);

  const subs: Record<SubScoreKey, number> = {
    hero: calibrate(clamp(heroRaw)),
    specificity: calibrate(clamp(specificityRaw)),
    trust: calibrate(clamp(trustRaw)),
    craft: calibrate(clamp(craftRaw)),
    cta: calibrate(clamp(ctaRaw)),
  };

  return {
    overall: weightedOverall(subs),
    subs,
    audience: 'unclear',
    buzzwordy: Math.min(95, slopMarkers(f).length * 12),
  };
}

/** Exposed for tests: rung counts must stay in sync with the ladders. */
export const LADDER_LEVELS: Record<SubScoreKey, number> = {
  hero: LADDERS.hero.length,
  specificity: LADDERS.specificity.length,
  trust: LADDERS.trust.length,
  craft: LADDERS.craft.length,
  cta: LADDERS.cta.length,
};

export const SUB_KEYS = Object.keys(SUB_LABELS) as SubScoreKey[];
