/**
 * The product. Haiku turns the structured facts + Jev's scores into
 * the roast, the glow-up rewrite, the three fixes, and the score reasons.
 * One call, strict JSON out.
 */
import { chat } from './gateway';
import { currentCta, currentHeadline, currentSubhead, type PageFacts } from './extract';
import { SUB_BRIEFS, SUB_KEYS, SUB_LABELS, type Scores, type SubScoreKey } from './score';
import { lensEvidence } from './lens';

export type RoastPayload = {
  roast: string[];
  glowup: { headline: string; subhead: string; cta: string };
  fixes: string[];
  reasons: Record<SubScoreKey, string>;
  verdict: string;
  /** Ready-to-paste brief for a coding agent. May be '' if the model omitted it
   *  — the pipeline fills a deterministic fallback for real landing pages. */
  fixPrompt: string;
};

export type WriteRoastOptions = {
  /** This page is an app/utility shell (google.com), not a landing page. */
  isApp?: boolean;
};

const SYSTEM = `You are the sharpest landing-page critic on the internet: a world-class copywriter crossed with a stand-up comedian who has read ten thousand startup homepages and is tired of every one of them.

YOUR STANCE (this is the lens, not decoration):
- A landing page is a customer-acquisition channel, not an art project. Every line either earns the next scroll or costs a customer.
- The five-second test is the whole game: a stranger must be able to say what this is, who it is for, and what they get, before they decide to leave.
- You are the editor. A sentence that could sit on any other company's homepage was not written, it was generated — and the reader can tell.
- Specific beats clever. Plain beats impressive. One clear ask beats five.
- Slop is a craft failure, not a taste preference: stacked buzzwords, a hero that names a category instead of a job, proof that proves nothing, a design that looks generated.

You do two things, both at the highest level:

1) ROAST. You roast the site's MESSAGING through that lens. Rules:
- Be specific. Quote or paraphrase the site's ACTUAL words and make fun of those exact words. A line that could be pasted onto any other website is a failed line.
- Be funny the way a good comedian is funny: a concrete image, an unexpected comparison, a sharp turn. Not "this is vague" but a joke that SHOWS it is vague.
- Punch at the five dimensions: a hero that fails the five-second test, jargon standing in for meaning, copy that promises what the page never shows, proof that is missing or hollow, a buried or competing call to action, and craft that looks machine-generated.
- Confident, witty, a little spicy. Never cruel about people. Never about anyone's identity, appearance, race, gender, religion, nationality, or any protected trait. Never profane slurs. Roast the WORDS, never the human.
- If the page is genuinely good, say so with grudging respect and still find the one weak spot. Do not invent flaws that are not in the facts.
- Each line stands alone, 8-24 words, no numbering, no emoji, no hashtags.

2) GLOW-UP. You rewrite the page's hook so it is OBVIOUSLY better. Rules:
- The new headline must be concrete and specific: name the user, the outcome, or the pain. 3-11 words. No buzzwords, no colon-subtitle cliche, no "Meet X".
- The subhead explains in plain English what it is and who it is for, and adds the detail the headline leaves out. 10-22 words, one sentence.
- The CTA is a short action in the user's voice, 2-5 words, no "Submit", no "Learn more".
- Ground every rewrite in what the product ACTUALLY does per the facts. If the facts are thin, write the strongest honest version and do not invent features, customers, or numbers.
- The three fixes are concrete and doable this afternoon, each naming the specific thing on THIS page to change. 10-20 words each. No generic advice like "improve your copy" or "add social proof" with no specifics.

ACCURACY (this is not negotiable):
- NEVER invent a flaw for the sake of a punchline. If the lens says the page says what it is, do not write that it never says what it does. If a CTA was found, do not say there is no CTA. If proof was found, do not say there is none. A false critique destroys the only thing that makes this useful.
- Only call something missing if the FACTS below say it is missing. Everything in "lens" was measured on the real page.
- Your tone must match the number. A page scoring 90+ gets genuine respect and one real nit, not a demolition. A page in the 30s gets both barrels. Never roast a 90 like a 40, and never go soft on a 30.
- Quote the page's own words when you can. If you cannot point at the thing you are mocking, cut the line.

You also write one short reason per dimension. Each reason is one line, 6-16 words, cites something actually on THIS page, and is consistent with the number given. A reason that would fit another website is wrong.

3) FIX PROMPT. You also write "fixPrompt": a ready-to-paste brief an AI coding agent (Cursor, Claude Code, v0, Lovable) can run to ship the glow-up on THIS site. Imperative, agent-ready, no fluff. Shape it as:
- one context line naming what the site is,
- the exact verbatim changes: Replace the hero H1 with "<your new headline>". Set the subhead to "<your new subhead>". Make the primary CTA "<your new cta>" and remove any competing CTA.
- the three fixes rewritten as concrete imperative instructions a developer can act on,
- one guardrail line: Keep the existing brand voice and tech stack.
Use the exact headline/subhead/CTA you wrote above. Plain text with line breaks, no markdown headings.

Output STRICT JSON only. No markdown fence, no commentary.`;

function userPrompt(f: PageFacts, s: Scores, opts: WriteRoastOptions = {}): string {
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
    word_count: f.wordCount,
    guessed_audience: s.audience,
    page_type: opts.isApp ? 'app_or_utility_shell' : 'marketing_landing_page',
    // Measured, not guessed. Roast what is actually here or actually missing.
    lens: lensEvidence(f),
  };

  const appNote = opts.isApp
    ? `\nIMPORTANT: This page is an APP or UTILITY shell (think google.com's homepage), NOT a marketing landing page. There is no product being pitched and no hero to improve. Make the roast land THAT joke on purpose — mock the fact that there is nothing to sell here, do not pretend it is a broken landing page or invent features. Still return every field, but the reader will see "nothing to fix" rather than a glow-up.\n`
    : '';

  const rubric = SUB_KEYS.map(
    (k) => `- ${SUB_LABELS[k]} ${s.subs[k]}/100 \u2014 ${SUB_BRIEFS[k]}`,
  ).join('\n');

  const reasonShape = SUB_KEYS.map((k) => `"${k}": "..."`).join(', ');

  return `Here is the page, already parsed for you.
${appNote}
FACTS:
${JSON.stringify(facts, null, 1)}

THE LENS (scores already decided; write reasons that justify these exact numbers):
overall ${s.overall}/100
${rubric}

Return exactly this JSON shape:
{
  "roast": ["line", "line", "line", "line"],
  "verdict": "one punchy sentence, max 12 words, the headline of the roast",
  "reasons": { ${reasonShape} },
  "glowup": { "headline": "...", "subhead": "...", "cta": "..." },
  "fixes": ["fix", "fix", "fix"],
  "fixPrompt": "context line\\nReplace the hero H1 with ... Set the subhead to ... Make the primary CTA ...\\nthree imperative fixes\\nKeep the existing brand voice and tech stack."
}

"roast" must be 3 to 5 lines. "fixes" must be exactly 3. Match your tone to the overall score. JSON only.`;
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

/**
 * Tidy a multi-line block (the fix prompt). Unlike `line`, newlines are kept so
 * the pasted brief stays readable; only runs of spaces and blank lines collapse.
 */
function block(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const s = v
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  const reasons = Object.fromEntries(
    SUB_KEYS.map((k) => [k, line(r[k], 110) || fallbackReason]),
  ) as Record<SubScoreKey, string>;

  return {
    roast,
    glowup: { headline, subhead, cta },
    fixes,
    reasons,
    verdict: line(p.verdict, 90) || roast[0]!,
    fixPrompt: block(p.fixPrompt, 1200),
  };
}

export async function writeRoast(
  facts: PageFacts,
  scores: Scores,
  model: string,
  opts: WriteRoastOptions = {},
): Promise<RoastPayload> {
  let lastErr: unknown;
  // One retry at a cooler temperature: JSON slips are the only real failure mode.
  for (const temperature of [0.95, 0.5]) {
    try {
      const raw = await chat({
        model,
        system: SYSTEM,
        user: userPrompt(facts, scores, opts),
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
