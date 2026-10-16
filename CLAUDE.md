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
- **Per-domain cache**: same normalized URL → return cached result (in-memory + a small on-disk/KV cache, TTL ~24h). Cheap + fast + consistent shareable results.
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
