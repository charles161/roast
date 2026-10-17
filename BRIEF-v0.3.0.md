# Roast — Milestone v0.3.0: "World-Class" (redesign + Schaad lens + brand)

READ THIS WHOLE FILE. This is a design-critical pass. The app is LIVE (v0.2.0) and pm2-managed on :3042 — do NOT touch/restart/launch anything on 3042. Smoke-test on temp port 3098 ONLY.

## NORTH STAR
A tool that roasts AI slop must NOT look like AI slop. The site must obey its own anti-slop lens.
**DEFINITION OF DONE (acceptance test):** our own site, run through our OWN lens-upgraded tool, scores ~95–100 AND passes a Schaad critique on every dimension. DO NOT game the scorer — make the page genuinely world-class.

## SCOPE (do ALL three; do NOT do the fix-prompt / google-site-handling / analytics — those are the v0.3.1 fast-follow)
1. REDESIGN the whole app (home, loading, result, share card, /api/og) into a world-class, anti-slop identity.
2. Recast the SCORING LENS to Raphael Schaad's framework, calibrated 0–100 so a world-class page reaches ~95–100.
3. BRAND: a real mark + favicon + logo lockup, cohesive with the new identity.

## ART DIRECTION: B — Brutalist / terminal "roast machine"
Chosen because it is the literal opposite of the purple-gradient slop we roast; reads confident, not AI-generated; screenshots with attitude; fits the roast voice + dev/founder audience.
- Near-black ground (~#0A0A0A), structural/hairline grid, ONE sharp acid accent (pick ONE — acid-lime or ember — and commit), stark high contrast.
- Type: ONE distinctive family used decisively — a strong mono or grotesque for the terminal feel (e.g. a quality mono like JetBrains/Geist Mono for UI/labels; a confident grotesque or the mono itself for display). 4–5 sizes MAX on a clear scale. NEVER 3+ competing bold fonts; never default Inter-with-no-intent.
- Generous, asymmetric whitespace carries the hierarchy. The score dial can stay (sweep + countup) but restyled to the new identity.
- Motion: ONE orchestrated page-load with staggered reveals. BAN cursor-follow, scroll-jack, fade-on-scroll, hover-only reveals. Respect prefers-reduced-motion.
- **BANNED SLOP MARKERS (explicit):** purple/violet/indigo gradients (esp. on white), 3+ bold fonts, eyebrow-pill + 3-icon-cards combo, bento grids, default glassmorphism / 0.1-opacity shadows / rounded-everything, emoji/badge/pill clutter, stock imagery.

## HERO COPY — make our OWN site pass the 5-second test
The current "Your landing page is probably lying to you" is a great HOOK but fails the 5-sec test alone (a stranger can't tell it's a page-scoring tool). Keep a punchy hook, then GROUND it instantly:
- H1 = the hook; subhead (one line, ≤~14 words, plain nouns, zero jargon) = what/who/why; ONE clear CTA.
- e.g. H1 "Your landing page is probably lying to you." / subhead "Paste a URL — we roast your landing page, score it out of 100, and hand you the glow-up. Free." / CTA "Roast my site".
- Apply the lens to our own page: concrete copy, copy↔visual match (show a real roast result as hero proof), one CTA, real trust signal if honest (e.g. a live "N sites roasted" from the real counter already added in v0.2.0).

## THE LENS (scoring) — recast to Schaad, calibrate so 100 is reachable
Recast sub-scores + the scoring/roast PROMPTS to Schaad's rubric (keep 4–5 subs for a clean card; `score.subs[]` is a dynamic array so relabeling is schema-safe):
- **Hero clarity / 5-sec test 30%** · **Specificity vs jargon + copy↔visual match 20%** · **Trust/proof 15%** · **Craft & anti-slop 25%** · **CTA 10%**.
- CALIBRATION: a world-class page (Linear/Stripe-tier) must score ~95–100; vibe-coded slop ~30–45. Add a calibration test: assert the scorer rates a known-great page high and a known-slop page low. (Our redesigned site must be able to reach ~100.)
- The ROAST punches at these dimensions (vague hero, jargon, slop markers, mismatched visual, buried/competing CTA) in OUR funnier/spicier voice. Bake Schaad's POV as the tool's stance, in our words: "a landing page is a customer-acquisition channel"; "you're the editor — don't outsource your thinking to the LLM."
- Reasons must cite the actual page.

## BRAND
- A distinctive roast mark (NOT an emoji) cohesive with the terminal/brutalist identity — a sharp flame-as-glyph, a scorch/sear mark, or a strong monogram in the acid accent; readable at 16px + crisp large.
- `src/app/icon.svg` (favicon) + apple-icon (180x180) + `metadata.icons` in layout + a reusable `<Logo/>` lockup in home/result headers + the mark on the `/api/og` image and the on-page share card next to the `roast.lightslips.ai` wordmark.

## HARD GUARDRAILS
- Keep the `/api/roast` request flow and the SSRF / rate-limit / cache / daily-spend-cap guards + gateway client **BYTE-IDENTICAL** (you may edit only the scoring/roast PROMPTS and the OG renderer). Result JSON contract is ADD-ONLY (relabeling `subs` is fine).
- Keep ALL existing tests green + ADD tests for new lens logic (jargon/slop detectors, rubric→score mapping, calibration) and brand.
- Cost flat (no extra LLM calls; the lens recast rides the existing 2 gens).

## DELIVERABLE + STOP
- Smoke-test on temp port 3098 only. Run `npm run build`, keep tests green, `npm audit` clean.
- In `progress.json`: set `app.version` "0.3.0", `ready` true, and a `selfRoast` note = how our redesigned copy/design maps to each Schaad dimension + the expected score (the orchestrator will run the live self-roast after deploy as the final gate).
- Commit on main at a coherent point. STOP. The orchestrator owns `pm2 restart roast`, the live self-roast (≥~95 + clean per-dimension pass), and deploy.
- If blocked, write `progress.json.blockers` and STOP.

## CALIBRATION (critical — Charles flagged v0.2.0 scored Stripe 73, too harsh)
The score MUST be credible to a savvy founder, or the tool reads as edgy-not-accurate and they bounce. The roast stays spicy; the NUMBER must be fair and defensible. Anchor the scale to real sites:
- World-class (Stripe, Linear): **92–98**
- Strong but flawed: 78–88
- Mediocre: 58–72
- Generic AI slop: 30–48
- App-shell / near-empty (google.com): 10–25
REQUIREMENTS:
- Add a CALIBRATION TEST asserting the scorer rates Stripe & Linear ≥90 (use captured PageFacts fixtures) and a known-slop/app-shell page low. Our own redesigned site must be able to reach ~100.
- ACCURACY: the roast must punch at REAL flaws, not invent them. v0.2.0 falsely claimed Stripe's hero "forgot to say what it does" — but its hero+subhead clearly state it. The lens prompt must not fabricate weaknesses for a punchline; cite the actual page. Clever hook is fine; false critique is not.
- The score and the roast must agree (don't score 73 while roasting it like a 40).

## KEEP IT SIMPLE — NO OVER-ENGINEERING (Charles 11757)
This is a FOCUSED pass, NOT a rewrite. Do ONLY the 3 scoped items (redesign + lens + brand). Hard rules:
- No new features / no scope creep (fix-prompt, agent-link, google-handling, analytics are v0.3.1 — NOT now).
- No speculative abstractions, no premature generalization, no config knobs nobody asked for.
- No new dependencies unless truly essential (justify each; prefer what's already in package.json).
- Delete dead code; don't leave commented-out blocks or unused exports. No gold-plating.
- Prefer the SIMPLEST implementation that is genuinely world-class. Clean, minimal, tasteful > clever.
The orchestrator will review the diff for over-engineering/bloat/scope-creep before deploy and cut anything crappy.
