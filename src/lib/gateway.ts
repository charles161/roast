/**
 * Vercel AI Gateway client. Server-only: the key never leaves this process.
 * Two surfaces, because Jev is an *evaluation* model, not a chat model:
 *   - chat()     -> POST {GATEWAY_URL}            (OpenAI-compatible)
 *   - evaluate() -> POST {origin}/v1/evaluate     (typed decision questions)
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { recordSpend } from './spend';

export class GatewayError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'GatewayError';
  }
}

/**
 * Request-scoped cost accumulator. Every gateway call meters its real USD cost
 * into the active box (if any), so the pipeline can report per-scan cost for
 * unit economics without threading a return value through score/roast.
 */
const costBox = new AsyncLocalStorage<{ usd: number }>();

/** Run `fn`, returning its value plus the total gateway USD cost it incurred. */
export async function trackCost<T>(fn: () => Promise<T>): Promise<{ value: T; costUsd: number }> {
  const box = { usd: 0 };
  const value = await costBox.run(box, fn);
  return { value, costUsd: box.usd };
}

function cfg(): { url: string; key: string } {
  const raw = process.env.GATEWAY_URL;
  const key = process.env.GATEWAY_KEY || process.env.AI_GATEWAY_API_KEY;
  if (!raw || !key) throw new GatewayError('LLM gateway is not configured.');
  // Accept either the full chat-completions endpoint or the gateway base: a
  // bare `.../v1` is normalized to `.../v1/chat/completions` so a common env
  // misconfig can't silently break every scan. evaluate() derives its own path
  // from the origin, so it is unaffected either way.
  const trimmed = raw.replace(/\/+$/, '');
  const url = trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
  return { url, key };
}

function evaluateUrl(chatUrl: string): string {
  const u = new URL(chatUrl);
  return `${u.origin}/v1/evaluate`;
}

/**
 * Fallback per-1M-token prices ($), used ONLY when the gateway reports no cost.
 * The AI Gateway's raw chat/completions response carries token `usage` but no
 * cost field, so without this the daily spend cap meters Haiku at $0 and never
 * trips — the whole cost backstop for a viral spike. Matched by model-name
 * substring; refine if a published price changes.
 */
const FALLBACK_PRICE_PER_M: Record<string, { in: number; out: number }> = {
  haiku: { in: 0.1, out: 0.5 }, // anthropic/claude-haiku-5.5 (<=100k tokens)
  jev: { in: 0.042, out: 0 }, // typesafe-ai/jev-1.14.0 — eval output is free
};

/** Estimate a call's cost from token usage when the gateway doesn't report one. */
export function usageCost(model: unknown, usage: unknown): number {
  if (typeof model !== 'string' || !usage || typeof usage !== 'object') return 0;
  const key = Object.keys(FALLBACK_PRICE_PER_M).find((k) => model.toLowerCase().includes(k));
  if (!key) return 0;
  const p = FALLBACK_PRICE_PER_M[key]!;
  const u = usage as Record<string, unknown>;
  const inTok = Number(u.prompt_tokens ?? u.input_tokens ?? 0);
  const outTok = Number(u.completion_tokens ?? u.output_tokens ?? 0);
  const c = (inTok * p.in + outTok * p.out) / 1_000_000;
  return Number.isFinite(c) && c > 0 ? c : 0;
}

/** Bill a request: prefer the gateway's reported cost, else estimate from usage. */
async function meter(payload: unknown): Promise<void> {
  let cost = 0;
  try {
    const p = payload as { providerMetadata?: { gateway?: { cost?: string } }; usage?: unknown; model?: unknown };
    const reported = Number(p?.providerMetadata?.gateway?.cost ?? 0);
    cost = Number.isFinite(reported) && reported > 0 ? reported : usageCost(p?.model, p?.usage);
  } catch { cost = 0; }
  const box = costBox.getStore();
  if (box && cost > 0) box.usd += cost;
  await recordSpend(cost);
}

async function post(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const { key } = cfg();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctl.signal,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* non-JSON error body */ }

    if (!res.ok) {
      const msg =
        (json as { error?: { message?: string } })?.error?.message ?? `gateway ${res.status}`;
      throw new GatewayError(msg, res.status);
    }
    await meter(json);
    return json;
  } catch (err) {
    if (ctl.signal.aborted) throw new GatewayError('LLM timed out', 504);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type ChatOpts = {
  model: string;
  system?: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
};

export async function chat(opts: ChatOpts): Promise<string> {
  const { url } = cfg();
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: opts.user });

  const json = (await post(
    url,
    {
      model: opts.model,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.9,
      // Haiku 5.5 will otherwise spend the whole budget on extended thinking
      // and return empty content. We want the copy, not the deliberation.
      reasoning_effort: 'none',
    },
    opts.timeoutMs ?? 25_000,
  )) as { choices?: { finish_reason?: string; message?: { content?: string } }[] };

  const choice = json?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    if (process.env.ROAST_DEBUG) console.error('[gateway] empty response', JSON.stringify(json).slice(0, 2000));
    const why = choice?.finish_reason === 'length' ? 'LLM hit the token ceiling' : 'LLM returned an empty response';
    throw new GatewayError(why);
  }
  return content;
}

/** A typed question for Jev. criteria shape differs per question type. */
export type JevQuestion =
  | { type: 'score'; criteria: string[] }
  | { type: 'boolean'; criteria: { true: string; false: string } }
  | { type: 'choice'; criteria: Record<string, string> };

export type JevAnswer =
  | { type: 'score'; score: number; confidence?: number }
  | { type: 'boolean'; probability: number }
  | { type: 'choice'; choice: string; confidence?: number; probabilities?: Record<string, number> };

export async function evaluate(args: {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, JevQuestion>;
  timeoutMs?: number;
}): Promise<Record<string, JevAnswer>> {
  const { url } = cfg();
  const json = (await post(
    evaluateUrl(url),
    { model: args.model, state: args.state, questions: args.questions },
    args.timeoutMs ?? 20_000,
  )) as { answers?: Record<string, JevAnswer> };

  if (!json?.answers) throw new GatewayError('Evaluation model returned no answers');
  return json.answers;
}
