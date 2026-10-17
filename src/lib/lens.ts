/**
 * THE LENS — Raphael Schaad's landing-page rubric, as deterministic detectors.
 *
 * Two jobs. It feeds the scoring model concrete evidence instead of vibes, and
 * it is the whole rubric when the scoring model is down. Everything here is
 * pure and derived from `PageFacts`, so none of it costs a token.
 *
 * The stance, in our words: a landing page is a customer-acquisition channel,
 * not an art project. You are the editor — if a line could sit on any other
 * company's homepage, you did not write it, an LLM did, and it is costing you
 * customers.
 */
import type { PageFacts } from './extract';
import { currentCta, currentHeadline, currentSubhead } from './extract';

/**
 * Filler that occupies space without saying anything. Deliberately wider than
 * the extractor's buzzword list: that one feeds roast ammo, this one scores.
 */
const JARGON = [
  'seamless', 'seamlessly', 'frictionless', 'effortless', 'effortlessly',
  'revolutionary', 'revolutionize', 'disrupt', 'disruptive', 'game-changing',
  'next-generation', 'next generation', 'cutting-edge', 'cutting edge',
  'best-in-class', 'world-class', 'industry-leading', 'state-of-the-art',
  'end-to-end', 'holistic', 'robust', 'turnkey', 'bespoke', 'curated',
  'innovative', 'innovation', 'empower', 'empowering', 'unlock', 'unleash',
  'supercharge', 'transform', 'transformative', 'paradigm', 'ecosystem',
  'synergy', 'leverage', 'solutions', 'platform', 'enterprise-grade', 'mission-critical',
  'ai-powered', 'ai powered', 'powered by ai', 'ai-driven', 'data-driven',
  'cloud-native', 'future-proof', 'streamline', 'streamlined', 'optimize',
  'elevate', 'reimagine', 'redefine', 'unparalleled', 'one-stop', 'all-in-one',
  'blazing fast', 'lightning fast', 'take it to the next level',
  'the future of', 'built different', 'everything you need',
];

/** Concrete things a product can actually be or touch. */
const CONCRETE = [
  'api', 'app', 'site', 'website', 'page', 'email', 'inbox', 'invoice',
  'payment', 'payments', 'checkout', 'code', 'repo', 'deploy', 'server',
  'database', 'query', 'dashboard', 'report', 'spreadsheet', 'document',
  'contract', 'meeting', 'calendar', 'booking', 'ticket', 'bug', 'issue',
  'design', 'file', 'photo', 'video', 'podcast', 'newsletter', 'course',
  'order', 'shipment', 'inventory', 'payroll', 'tax', 'expense', 'budget',
  'lead', 'customer', 'subscriber', 'patient', 'student', 'resume',
];

/** Who it is for. */
const AUDIENCES = [
  'developer', 'developers', 'engineer', 'engineers', 'designer', 'designers',
  'founder', 'founders', 'marketer', 'marketers', 'team', 'teams', 'startup',
  'startups', 'agency', 'agencies', 'freelancer', 'freelancers', 'student',
  'students', 'teacher', 'teachers', 'nurse', 'doctor', 'lawyer', 'accountant',
  'recruiter', 'salespeople', 'sales teams', 'product managers', 'writers',
  'creators', 'small business', 'enterprise', 'businesses', 'companies',
  'merchants', 'brands', 'stores', 'organizations', 'product teams',
];

/** Something actually happening to the reader. */
const OUTCOMES = [
  'ship', 'ships', 'save', 'saves', 'cut', 'cuts', 'stop', 'stops', 'grow',
  'grows', 'launch', 'launches', 'close', 'closes', 'book', 'books', 'get paid',
  'hire', 'hires', 'find', 'finds', 'fix', 'fixes', 'send', 'sends', 'track',
  'tracks', 'build', 'builds', 'write', 'writes', 'answer', 'answers', 'in minutes',
  'in seconds', 'without', 'never again', 'in one place',
];

/**
 * Nav words that are destinations, not asks. Used to tell a real button that
 * happens to live in the nav from an ordinary menu link.
 */
const NAV_NOUNS = new Set([
  'home', 'about', 'pricing', 'docs', 'documentation', 'blog', 'contact',
  'login', 'log in', 'sign in', 'careers', 'archive', 'features', 'product',
  'products', 'company', 'resources', 'customers', 'support', 'help', 'faq',
  'terms', 'privacy', 'changelog', 'news', 'press', 'team', 'work', 'shop',
]);

/** CTAs that ask for nothing in particular. */
const GENERIC_CTAS = [
  'learn more', 'read more', 'submit', 'click here', 'explore', 'discover',
  'get started', 'sign up', 'sign in', 'log in', 'login', 'try it', 'try now',
  'request a demo',
  'find out more', 'see more', 'more info', 'contact us', 'get in touch',
  'coming soon', 'join the waitlist', 'subscribe',
];

/**
 * Is there a hero at all? An app shell with a one-word title has no messaging
 * to judge, and scoring its copy as if it did is how google.com ends up
 * outscoring a real landing page.
 */
export function hasHero(f: PageFacts): boolean {
  return currentHeadline(f).split(/\s+/).filter(Boolean).length >= 2;
}

/**
 * Proof the extractor's own regexes miss. Real pages say "powering", "used
 * by", or put Customers in the nav far more often than they say "trusted by".
 */
export function hasProof(f: PageFacts): { social: boolean; logos: boolean } {
  const h = hay(f);
  const nav = f.navLabels.join(' ').toLowerCase();
  return {
    social:
      f.signals.hasTestimonial ||
      /\b(loved by|used by|join (the )?\d|case stud|success stor|rated \d|reviews?\b)/.test(h),
    logos:
      f.signals.hasLogoWall ||
      /\b(powering|running on|millions of|thousands of|\d[\d,.]*\+? (companies|businesses|teams|developers|users|customers|sites|pages|projects))/.test(h) ||
      /\b(customers|case studies)\b/.test(nav),
  };
}

function hay(f: PageFacts): string {
  return [
    currentHeadline(f),
    currentSubhead(f),
    f.metaDescription,
    f.heroText.slice(0, 900),
  ]
    .join(' ')
    .toLowerCase();
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Jargon actually present in the hero copy, deduped, worst first. */
export function jargonHits(f: PageFacts): string[] {
  const h = hay(f);
  return JARGON.filter((j) => h.includes(j)).slice(0, 10);
}

/** Jargon per 100 words of hero copy. Density, not raw count, is the signal. */
export function jargonDensity(f: PageFacts): number {
  const words = Math.max(1, wordCount(hay(f)));
  return Math.round((jargonHits(f).length / words) * 1000) / 10;
}

export type FiveSecondRead = {
  namesWhat: boolean;
  namesWho: boolean;
  namesOutcome: boolean;
  /** How many of the three a stranger could answer. */
  answered: number;
};

/**
 * The five-second test, as far as HTML can answer it: after one glance, can a
 * stranger say what this is, who it is for, and what it gets them?
 */
export function fiveSecondRead(f: PageFacts): FiveSecondRead {
  const h = hay(f);
  const has = (list: string[]) => list.some((w) => h.includes(w));
  const namesWhat = has(CONCRETE) || /\b\d+\s*(k|m|x|%|\+)/.test(h);
  const namesWho = has(AUDIENCES) || /\bfor [a-z]{3,}/.test(h);
  const namesOutcome = has(OUTCOMES) || /\b\d/.test(h);
  return {
    namesWhat,
    namesWho,
    namesOutcome,
    answered: [namesWhat, namesWho, namesOutcome].filter(Boolean).length,
  };
}

export type CtaAudit = {
  count: number;
  primary: string;
  missing: boolean;
  generic: boolean;
  competing: boolean;
};

/**
 * One clear ask beats five. Nav links are not calls to action, so they come
 * out first — otherwise every real site with a Pricing link looks like it has
 * five competing asks.
 */
export function ctaAudit(f: PageFacts): CtaAudit {
  const nav = new Set(f.navLabels.map((n) => n.trim().toLowerCase()));
  const found = f.ctas.map((c) => c.trim()).filter(Boolean);

  // The extractor matches CTAs against a fixed verb list, so an imperative it
  // has not heard of ("Roast my site") lands in the nav instead. Promote a
  // multi-word nav label that is plainly an instruction, but never a bare
  // destination like Pricing or Docs.
  const promoted = found.length
    ? []
    : f.navLabels
        .map((n) => n.trim())
        .filter((n) => n.split(/\s+/).length >= 2 && !NAV_NOUNS.has(n.toLowerCase()));

  const all = found.length ? found : promoted;
  const offNav = all.filter((c) => !nav.has(c.toLowerCase()));
  // Dropping the nav must never erase the page's only ask: on a spare page the
  // single button IS the nav, and calling that "no CTA" is just wrong.
  const labels = offNav.length ? offNav : all;

  const isGeneric = (s: string) => {
    const low = s.toLowerCase();
    return GENERIC_CTAS.some((g) => low === g || low.startsWith(g));
  };

  // An ask is an instruction, so it has a verb and therefore more than one
  // word. A single noun ("Pricing", "Startups") is a destination.
  const isAsk = (s: string) =>
    s.split(/\s+/).length >= 2 && !NAV_NOUNS.has(s.toLowerCase());

  // The page gets credit for its best ask wherever it sits — a header button
  // is still the primary call to action. Only `competing` cares about the nav.
  const ranked = [
    ...all.filter((c) => isAsk(c) && !isGeneric(c)),
    ...all.filter((c) => isAsk(c)),
    ...labels,
  ];
  const primary = ranked[0] ?? currentCta(f).trim();

  return {
    count: labels.length,
    primary,
    missing: labels.length === 0,
    generic: !all.some((c) => isAsk(c) && !isGeneric(c)),
    // A long marketing page repeats its ask per section; that is not a
    // competing ask. Seven distinct non-nav asks is.
    competing: labels.length >= 7,
  };
}

/**
 * Slop we can actually see in the HTML. Nothing here is guessed — every marker
 * points at something literally present (or literally absent) on the page.
 */
export function slopMarkers(f: PageFacts): string[] {
  const out: string[] = [];
  const five = fiveSecondRead(f);
  const cta = ctaAudit(f);
  const headline = currentHeadline(f);

  if (jargonDensity(f) >= 2) out.push('jargon-dense');
  if (jargonHits(f).length >= 4) out.push('jargon-stacked');
  if (!currentSubhead(f)) out.push('no-subhead');
  if (wordCount(headline) > 16) out.push('headline-runs-long');
  if (!hasHero(f)) out.push('no-hero-at-all');
  if (!five.namesWhat) out.push('never-says-what-it-is');
  if (!five.namesWho) out.push('never-says-who-it-is-for');
  if (cta.missing) out.push('no-cta');
  else if (cta.generic) out.push('cta-asks-for-nothing');
  if (cta.competing) out.push('competing-ctas');
  const proof = hasProof(f);
  if (!proof.social && !proof.logos && !f.signals.hasNumbers) out.push('no-proof-of-anything');
  if (!f.signals.hasOgImage) out.push('no-social-preview');
  if (!f.signals.hasMetaDescription) out.push('no-meta-description');
  // Only separators standing alone count; a hyphen inside all-in-one is not one.
  if ((f.title.match(/\s[|–—-]\s/g) ?? []).length >= 3) out.push('keyword-stuffed-title');
  if (f.heroText.length > 600 && f.h2s.length === 0) out.push('undifferentiated-wall-of-text');
  return out;
}

/** Everything the lens found, in one object for the prompt and the state. */
export function lensEvidence(f: PageFacts): Record<string, unknown> {
  const five = fiveSecondRead(f);
  const cta = ctaAudit(f);
  return {
    five_second_test: {
      says_what_it_is: five.namesWhat,
      says_who_it_is_for: five.namesWho,
      says_what_you_get: five.namesOutcome,
      answered_out_of_three: five.answered,
    },
    jargon_found: jargonHits(f),
    jargon_per_100_words: jargonDensity(f),
    cta: {
      primary: cta.primary || '(none)',
      total_cta_labels: cta.count,
      is_generic: cta.generic,
      competing_asks: cta.competing,
    },
    proof: {
      testimonials: hasProof(f).social,
      customer_logos: hasProof(f).logos,
      concrete_numbers: f.signals.hasNumbers,
      visible_pricing: f.signals.hasPricing,
    },
    craft: {
      social_preview_image: f.signals.hasOgImage,
      meta_description: f.signals.hasMetaDescription,
      favicon: f.signals.hasFavicon,
      h1: f.signals.hasH1,
      section_headings: f.h2s.length,
    },
    slop_markers: slopMarkers(f),
  };
}
