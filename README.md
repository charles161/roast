# Roast + Glow-up

Paste a URL → in ~6s get a sharp, specific roast of the site's messaging, a
score out of 100 (Hook / Clarity / Trust / Design-signal), a side-by-side
**glow-up** of the headline, subhead and CTA, 3 concrete fixes, and a
shareable card with an auto-generated OG image.

## Run it

```bash
npm install
npm run build
npm run start          # binds 127.0.0.1:3042
PORT=3099 npm run start # port is configurable
```

Env (`.env.local`, never committed, never sent to the client):

| var | meaning |
|---|---|
| `GATEWAY_URL` | Vercel AI Gateway chat completions endpoint |
| `GATEWAY_KEY` | gateway bearer token (server-side only) |
| `JEV_MODEL` | evaluation model for scoring (`typesafe-ai/jev-1.14.0`) |
| `ROAST_MODEL` | copy model for roast + glow-up (`anthropic/claude-haiku-5.5`) |
| `PORT` | listen port, default 3042 |
| `DAILY_LLM_USD_CAP` | hard daily spend ceiling, default 5 |
| `PUBLIC_BASE_URL` | optional; absolute origin used in share links + OG tags |
| `ROAST_CACHE_DIR` | optional; defaults to `./.cache` |

## How it works

`POST /api/roast` runs the whole pipeline server-side:

1. **Normalize** the URL (`src/lib/url.ts`) — scheme, `www.`, tracking params
   and param order all collapse so one site is one cache key.
2. **SSRF guard** (`src/lib/ssrf.ts`) — http(s) only, web ports only, and every
   resolved IP must be public. Re-checked on *every* redirect hop.
3. **Fetch** (`src/lib/fetchPage.ts`) — 8s timeout, 2MB body cap, manual
   redirects, HTML content types only.
4. **Extract** (`src/lib/extract.ts`) — deterministic regex parse into a
   structured `PageFacts`. No LLM, so it is free and fast. Everything that
   reaches a model is sanitized and length-capped first.
5. **Score** (`src/lib/score.ts`) — Jev judges four rubric ladders. Its output
   tokens are free. Falls back to a deterministic heuristic if Jev is down.
6. **Write** (`src/lib/roast.ts`) — one Haiku call returns the roast, the
   glow-up and the score reasons as strict JSON.

Result pages live at `/r/<id>` with a server-rendered OG image at
`/api/og?id=<id>`, so a pasted link previews richly.

## The share surfaces

The on-page card (`#share-card`) and the OG image are deliberately the same
design: favicon, site name, the score dial, the verdict, the best roast line,
before -> after, and the `roast.lightslips.ai` wordmark, so a screenshot and a
link preview carry the same thing.

- `src/lib/share.ts` is the single source for share copy — the tweet body, the
  quote picker and `quoteWrap`, which stops us double-quoting a roast line that
  already opens by quoting the site. The tweet budget counts the link as 23
  characters, the way X does.
- `src/lib/favicon.ts` inlines the site's favicon for the OG image, because
  Satori cannot fetch one itself. The URL comes off a page we were asked to
  roast, so it goes through the same SSRF guard as the page fetch, with no
  redirects, a 1.2s timeout and a 192KB cap. Every failure falls back to a
  monogram rather than a broken preview.
- `src/lib/counter.ts` counts live entries in the result cache. It is the only
  number on the page that is not from the current result, and it is read off
  disk — nothing here is decorative. It stays hidden below `MIN_DISPLAY`.

The reveal (dial sweep, count-up, staggered sub-scores and roast lines) runs on
transform/opacity only and is disabled under `prefers-reduced-motion`.

### A note on Jev

Jev is an **evaluation** model, not a chat model: it is called at
`POST /v1/evaluate` with `{state, questions}` and cannot emit free text, so
extraction is done in code rather than by Jev.

Its `score` questions take an **ordered rubric ladder**, and the returned
`score` is the expected rung index, so it ranges `0..criteria.length-1` — not
`0..1`. `normalizeScore()` divides by `levels - 1`; dividing by 100 silently
scores every site near zero.

## Guards

- **Cache** — per-URL, 24h TTL, memory LRU over an atomic on-disk store, so a
  viral link keeps resolving across restarts and costs nothing to re-serve.
- **Rate limit** — 10/min and 60/hr per IP, sliding windows. Rejected requests
  are not recorded, so hammering cannot extend the penalty.
- **Spend cap** — `DAILY_LLM_USD_CAP`, metered from the real per-generation
  cost the gateway reports, persisted to disk so a restart cannot reset it.
  At the cap we serve cached results only.

> Deployment note: client IP comes from `cf-connecting-ip` / `x-real-ip` /
> `x-forwarded-for`. Only run this behind a proxy that overwrites those
> headers (Cloudflare does), or the rate limit can be spoofed.

## Tests

```bash
npm test        # 244 unit tests
npm run typecheck
```

Covers URL normalization, the SSRF guard (IPv4/IPv6 ranges, DNS rebinding,
redirect hops), score parsing, the cache, the rate limiter, the spend cap, the
model-output JSON parser, the share-intent builder, the score -> colour bands
and the cache counter.
