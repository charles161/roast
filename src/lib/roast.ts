/**
 * The product. Haiku turns the structured facts + Jev's scores into
 * the roast, the glow-up rewrite, the three fixes, and the score reasons.
 * One call, strict JSON out.
 */
import { chat } from './gateway';
import { currentCta, currentHeadline, currentSubhead, type PageFacts } from './extract';
import { SUB_LABELS, type Scores, type SubScoreKey } from './score';

export type RoastPayload = {
  roast: string[];
  glowup: { headline: string; subhead: string; cta: string };
  fixes: string[];
  reasons: Record<SubScoreKey, string>;
  verdict: string;
};

const SYSTEM = `You are the sharpest landing-page critic on the internet: a mix of a world-class copywriter and a stand-up comedian who has read ten thousand startup homepages and is tired of all of them.

You do two things, both at the highest level:

1) ROAST. You roast the site's MESSAGING. Rules:
- Be specific. Quote or paraphrase the site's ACTUAL words and make fun of those exact words. A line that could be pasted onto any other website is a failed line.
- Be funny the way a good comedian is funny: a concrete image, an unexpected comparison, a sharp turn. Not "this is vague" but a joke that SHOWS it is vague.
- Punch at the copy: buzzwords, vague value props, weak hooks, hedging, missing proof, a CTA nobody would click.
- Confident, witty, a little spicy. Never cruel about people. Never about anyone's identity, appearance, race, gender, religion, nationality, or any protected trait. Never profane slurs. Roast the WORDS, never the human.
- If the page is genuinely good, say so with grudging respect and still find the one weak spot. Do not invent flaws that are not in the facts.
- Each line stands alone, 8-24 words, no numbering, no emoji, no hashtags.

2) GLOW-UP. You rewrite the page's hook so it is OBVIOUSLY better. Rules:
- The new headline must be concrete and specific: name the user, the outcome, or the pain. 3-11 words. No buzzwords, no colon-subtitle cliche, no "Meet X".
- The subhead explains in plain English what it is and who it is for, and adds the detail the headline leaves out. 10-22 words, one sentence.
- The CTA is a short action in the user's voice, 2-5 words, no "Submit", no "Learn more".
- Ground every rewrite in what the product ACTUALLY does per the facts. If the facts are thin, write the strongest honest version and do not invent features, customers, or numbers.
- The three fixes are concrete and doable this afternoon, each naming the specific thing on THIS page to change. 10-20 words each. No generic advice like "improve your copy" or "add social proof" with no specifics.

You also write one short reason per score. Each reason is one line, 6-16 words, specific to this page, and consistent with the number given.

Output STRICT JSON only. No markdown fence, no commentary.`;

function userPrompt(f: PageFacts, s: Scores): string {
  const facts = {
    url: f.url,
    current_headline: currentHeadline(f),
    current_subhead: currentSubhead(f),
    current_cta: currentCta(f),
    page_title: f.title,
    meta_description: f.metaDescription || '(none)',
    social_preview_title: f.ogTitle || '(none)',
    section_headings: f.h2s,
    hero_copy: f.heroText.slice(0, 700),
    all_cta_labels: f.ctas,
    nav_labels: f.navLabels,
    buzzwords_found: f.buzzwords,
    word_count: f.wordCount,
    guessed_audience: s.audience,
    missing: [
      !f.signals.hasMetaDescription && 'no meta description',
      !f.signals.hasOgImage && 'no social preview image',
      !f.signals.hasH1 && 'no H1 headline',
      !f.signals.hasTestimonial && 'no testimonials',
      !f.signals.hasLogoWall && 'no customer logos',
      !f.signals.hasPricing && 'no visible pricing',
      !f.signals.hasNumbers && 'no concrete numbers',
      !f.ctas.length && 'no clear call to action',
    ].filter(Boolean),
  };

  return `Here is the page, already parsed for you.

FACTS:
${JSON.stringify(facts, null, 1)}

SCORES (already decided; write reasons that justify these exact numbers):
overall ${s.overall}/100 - ${SUB_LABELS.hook} ${s.subs.hook}/100, ${SUB_LABELS.clarity} ${s.subs.clarity}/100, ${SUB_LABELS.trust} ${s.subs.trust}/100, ${SUB_LABELS.design} ${s.subs.design}/100

Return exactly this JSON shape:
{
  "roast": ["line", "line", "line", "line"],
  "verdict": "one punchy sentence, max 12 words, the headline of the roast",
  "reasons": { "hook": "...", "clarity": "...", "trust": "...", "design": "..." },
  "glowup": { "headline": "...", "subhead": "...", "cta": "..." },
  "fixes": ["fix", "fix", "fix"]
}

"roast" must be 3 to 5 lines. "fixes" must be exactly 3. JSON only.`;
}

/** Pull the first JSON object out of a model response, fence or prose tolerant. */
export function parseJsonLoose(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(text);
  } catch { /* fall through to brace scan */ }

  const start = text.indexOf('{');
  if (start === -1) throw new Error('no JSON object in model output');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error('unterminated JSON in model output');
}

/**
 * Tidy one model-written line. Outer quotes are stripped only when BOTH ends
 * are quoted, so a line that opens by quoting the site's own copy keeps its
 * closing quote instead of being left with an orphan.
 */
function line(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  let s = v.replace(/\s+/g, ' ').trim();
  const PAIRS: [RegExp, RegExp][] = [
    [/^"/, /"$/],
    [/^'/, /'$/],
    [/^\u201c/, /\u201d$/],
    [/^\u2018/, /\u2019$/],
  ];
  for (const [open, close] of PAIRS) {
    if (open.test(s) && close.test(s.slice(1))) {
      s = s.slice(1, -1).trim();
      break;
    }
  }
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}\u2026` : s;
}

/** Validate + coerce the model payload. Throws if the roast is unusable. */
export function normalizeRoast(parsed: unknown, fallbackReason: string): RoastPayload {
  const p = (parsed ?? {}) as Record<string, unknown>;

  const roast = (Array.isArray(p.roast) ? p.roast : [])
    .map((l) => line(l, 180))
    .filter((l) => l.length >= 8)
    .slice(0, 5);
  if (roast.length < 3) throw new Error('roast too short');

  const g = (p.glowup ?? {}) as Record<string, unknown>;
  const headline = line(g.headline, 90);
  const subhead = line(g.subhead, 200);
  const cta = line(g.cta, 40);
  if (!headline || !subhead || !cta) throw new Error('glow-up incomplete');

  const fixes = (Array.isArray(p.fixes) ? p.fixes : [])
    .map((l) => line(l, 160))
    .filter((l) => l.length >= 8)
    .slice(0, 3);
  if (fixes.length < 3) throw new Error('fixes incomplete');

  const r = (p.reasons ?? {}) as Record<string, unknown>;
  const reasons = {
    hook: line(r.hook, 110) || fallbackReason,
    clarity: line(r.clarity, 110) || fallbackReason,
    trust: line(r.trust, 110) || fallbackReason,
    design: line(r.design, 110) || fallbackReason,
  };

  return {
    roast,
    glowup: { headline, subhead, cta },
    fixes,
    reasons,
    verdict: line(p.verdict, 90) || roast[0]!,
  };
}

export async function writeRoast(facts: PageFacts, scores: Scores, model: string): Promise<RoastPayload> {
  let lastErr: unknown;
  // One retry at a cooler temperature: JSON slips are the only real failure mode.
  for (const temperature of [0.95, 0.5]) {
    try {
      const raw = await chat({
        model,
        system: SYSTEM,
        user: userPrompt(facts, scores),
        maxTokens: 2000,
        temperature,
      });
      return normalizeRoast(parseJsonLoose(raw), 'Judged from the page copy we could read.');
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('roast generation failed');
}
