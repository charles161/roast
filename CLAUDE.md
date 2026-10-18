# Roast + Glow-up — builder spec

You are a focused builder. Build the app described here, keep it tight, ship the WOW first, then STOP for review. Read this whole file before acting. Communicate progress only via `progress.json` (do NOT message Telegram — the orchestrator handles that).

## Product
A viral web toy for founders/devs. Paste a website URL → in ~10s get:
1. **Roast** — a sharp, genuinely funny, *specific* critique of the site's messaging (3–5 punchy lines; roast the actual copy, not generic filler). Confident, witty, a little spicy — never cruel/offensive, never about protected traits. Punch at vague value props, buzzwords, weak hooks.
2. **Score /100** — overall + 4 sub-scores: **Hook**, **Clarity**, **Trust**, **Design-signal**. Each with a one-line reason.
3. **Glow-up** — the fix, shown side-by-side: rewritten **headline**, **subhead/hero line**, and a **1-line CTA**. Plus 3 concrete, specific fixes. This is the "magic" — it must be clearly better than the original.
4. **Shareable card** — a beautiful result card designed to be screenshotted onto X/Twitter: site favicon + name, the big score, the best roast line, before→after headline. Plus an auto-generated **OG image** so pasted links preview richly. A prominent **"Roast yours →"** button = the viral loop.

## Stack (keep it simple + fast)
- **Next.js (App Router) + TypeScript + Tailwind**. Single page + one API route.
- **LLM via our Vercel AI Gateway** (OpenAI-compatible). Models:
  - `typesafe-ai/jev-1.14.0` (**Jev**) — cheap parse/extract + scoring (output is free). Use for the structured extraction + scoring.
  - `anthropic/claude-haiku-5.5` (**Haiku**) — the roast copy + the glow-up rewrite (quality/persuasion). Keep prompts tight.
  - Gateway base URL + key come from server env (`GATEWAY_URL`, `GATEWAY_KEY`). The orchestrator will provide a `.env.local`. **NEVER** ship the key to the client or commit it. All LLM calls happen server-side in the API route only.
- **OG image**: `@vercel/og` (or `next/og`) server-rendered.

## Pipeline (server API route `/api/roast`)
1. Validate + normalize the URL. **SSRF GUARD (critical):** only `http(s)`, resolve host and REJECT private/loopback/link-local/metadata IPs (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fc00::/7, `*.internal`, `localhost`). No redirects to private IPs.
2. Fetch the page (timeout 8s, cap body ~2MB, desktop UA). Extract: `<title>`, meta description, og:*, the first H1/H2, visible hero text, nav/CTA button labels. Strip scripts/styles.
3. **Jev**: turn that into a compact structured JSON (offer, audience guess, headline, subhead, CTA, buzzword list) + the 4 sub-scores with reasons. (Reuse-friendly: this extraction is the same shape AutoGTM will want.)
4. **Haiku**: given the structured JSON, write the roast (3–5 lines) + the glow-up (new headline/subhead/CTA) + 3 fixes. One call, strict JSON out.
5. Return JSON for the UI; render the card; generate the OG image for the result URL (so `/r/<id>` or `/?url=` previews richly).

## Guards (MUST — this will get an 11k-person X blast)
- **Per-domain cache**: same normalized URL → return cached result (in-memory + a small on-disk/KV cache, TTL 90 days so shared links survive). Cheap + fast + consistent shareable results.
- **Rate limit** per IP (e.g. 10/min, 60/hr) → friendly 429.
- **Hard LLM spend cap**: a global daily cap + per-request token caps; when the cap is hit, serve cached-only + a "we're melting, try later" state. Log spend.
- Fetch timeout + body size cap. Never follow file:// or non-web schemes. Sanitize extracted text before prompting.
- No secrets client-side. No auth on the public pages (this is a public viral tool — intended) but the app must be fully isolated (its own service, no access to any other system).

## Hosting
- v1: runnable on our Linux VPS via `npm run build && npm run start` on a port (default 3042; make it `PORT`-configurable). The orchestrator wires the public URL (subdomain via Cloudflare) after the wow is validated.
- Keep it **Vercel-portable**: standard Next.js, no VPS-only deps, env via `process.env`. We may redeploy to Vercel Pro later.

## Quality bar
- The roast must be funny + specific (not generic). The glow-up must be visibly better. The card must look genuinely shareable (clean type, big score, tasteful). This is the whole point — polish the output quality and the card.
- Mobile-first (people open it from X on phones). Fast first paint. A tasteful loading state ("reading your site… judging your life choices…").
- Tests: unit-test the SSRF guard, URL normalization, scoring parse, and the cache/rate-limit logic (these are correctness-critical). The LLM/UX feel is judged by the orchestrator/Charles.

## Deliverable + STOP
- Get the WOW working **end to end** first: enter URL → roast + score + glow-up + card render, with guards in place, running via `npm run start` on the VPS. Then set `progress.json` → `{ "app": { "version":"0.1.0", "ready": true, "url": "http://127.0.0.1:3042", "port": 3042, "notes": "<what works / what's stubbed>" }, "blockers": [] }` and **STOP** for review. Do not gold-plate (leaderboard, accounts, extra pages) in v1.
- If blocked, put a clear note in `progress.json.blockers` and STOP.
- Commit your work (git) at a coherent point before stopping.

## Budget
Shared weekly compute is tight; the orchestrator authorized a bounded spend. Build the wow, ship it, STOP. Don't over-engineer.

---

# Milestone v0.2.0 — "MINDBLOWING" (polish pass, 2026-10-17)

Charles saw v1 LIVE at https://roast.lightslips.ai, loved it ("fking brilliant, working awesomely well"), and wants it made **mindblowingly awesome** for a 2-day X boost (~11k people, opening it from phones). v1 content quality is already great — this pass is about **the moment of delight + the shareable surface**. Make people go "holy shit" and screenshot it.

## HARD GUARDRAILS (do not break the live app)
- **DO NOT change the `/api/roast` pipeline logic, the SSRF / rate-limit / cache / daily-spend-cap guards, or the gateway client.** They are verified and protecting a live blast. You may READ them. The one thing you may touch server-side is the OG image renderer (`/api/og`) for the redesign below, and ADDING small new endpoints/helpers (e.g. a share-intent builder, a real counter) — never removing/renaming existing result fields.
- **Result JSON schema is a contract.** The UI consumes: `id, url, displayUrl, siteName, favicon, createdAt, score{overall, subs[{key,label,score,reason}]}, roast[], verdict, before{headline,subhead,cta}, after{headline,subhead,cta}, fixes[]`. You may ADD fields; do NOT remove or rename.
- **Deploy is the orchestrator's job.** The app is **pm2-managed (name `roast`)** and serving live traffic on :3042. DO NOT kill it, DO NOT `pm2 restart`, DO NOT setsid-launch. To smoke-test, run a one-off `next start -p 3098` (temp port) or use `next dev -p 3098`. When done: `npm run build` (regenerates .next in place — harmless to the running server until restart), run the full test suite, then set `progress.json` ready. The orchestrator does `pm2 restart roast` + live verification as the deploy gate.
- **No fake data, ever.** Any counter/number shown must be derived from real on-disk state (e.g. real count of cached results). If you can't make it real + cheap, omit it.
- Keep it **fast** (first paint, 60fps animations via transform/opacity only), **mobile-first**, **Vercel-portable**, and keep bundle lean (prefer CSS animation / a tiny motion lib; justify any new dep). Respect `prefers-reduced-motion`.
- Keep ALL existing tests green (212 unit + typecheck + `npm audit` 0 vulns). ADD tests for any new pure logic (share-intent URL builder, real counter, score→color mapping).

## THE WOW (build these, in priority order)
1. **Jaw-dropping result reveal.** When the card appears: a big **circular score dial** sweeps 0→score with easing and the number counts up, color-graded by score (brutal red → amber → green). Sub-scores stagger in (bars fill + reason fades). Roast lines deliver one-by-one like a verdict (stagger/typewriter, tasteful). A bold **verdict** hero line. It should feel alive and a little theatrical — this is the holy-shit moment.
2. **Premium visual design.** Confident, modern, a little spicy. **Dark theme default** (screenshots gorgeous on X), cohesive design tokens, big expressive type, subtle gradient/grain/glow — tasteful, not gaudy. Cohere the whole app (home, loading, result) into one striking identity. Delightful loading state with rotating copy ("reading your site…", "judging your life choices…", "consulting the brutal honesty department…").
3. **The share card is the product.** Redesign the on-page result card AND the `/api/og` image to be screenshot-perfect and identical in spirit: favicon + site name, giant score dial, the single best roast line, before→after headline, and the `roast.lightslips.ai` wordmark so every screenshot carries the brand + implies "you can do this too". Legible at X-thumbnail size.
4. **Viral loop.** One-tap **Share on X** button → opens a prefilled tweet (score + a roast teaser + the `/r/<id>` link). Plus **Copy link** and a prominent **Roast another →** everywhere. (Optional, only if trivially real: a small "N sites roasted" from the real cache count.)

## DELIVERABLE + STOP
- Get all 4 WOW items working end-to-end, smoke-tested on a temp port, tests green. Then bump `progress.json` → `{ app: { version: "0.2.0", ready: true, ... notes } }` with a short note of what changed + what you smoke-tested, and **STOP**. Commit your work (git, on main) at a coherent point before stopping. Do not gold-plate beyond the 4 items.
- If blocked, write a clear `progress.json.blockers` note and STOP.

## BUDGET
Shared weekly compute is tight (orchestrator watching a hard ceiling). This is a **bounded, focused polish pass** — build the 4 WOW items beautifully, then STOP. Don't rewrite the app or the pipeline.
