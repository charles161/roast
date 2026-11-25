import { NextResponse } from 'next/server';
import { BadUrlError, normalizeUrl } from '@/lib/url';
import { getCached, roastUrl } from '@/lib/pipeline';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { isValidId } from '@/lib/cache';
import { apiErrorFor } from '@/lib/apiError';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(code: ApiError['code'], error: string, status: number, extra?: HeadersInit) {
  return NextResponse.json<ApiError>({ error, code }, { status, headers: extra });
}

export async function GET(req: Request) {
  // Cheap path for shared links: hydrate a known result without any LLM spend.
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!isValidId(id)) return fail('bad_url', 'Unknown roast.', 400);
  const cached = await getCached(id);
  if (!cached) return fail('bad_url', 'That roast expired. Roast it again?', 404);
  return NextResponse.json(cached, {
    headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' },
  });
}

export async function POST(req: Request) {
  let raw: string;
  let fresh = false;
  try {
    const body = (await req.json()) as { url?: unknown; fresh?: unknown };
    raw = typeof body?.url === 'string' ? body.url : '';
    // Explicit re-roast. Only the JSON boolean `true` counts — "yes", 1, "true"
    // and friends are a normal (cache-friendly) roast.
    fresh = body?.fresh === true;
  } catch {
    return fail('bad_url', 'Send a JSON body with a url.', 400);
  }

  let normalized: string;
  try {
    normalized = normalizeUrl(raw);
  } catch (err) {
    return fail('bad_url', err instanceof BadUrlError ? err.message : 'Invalid URL.', 400);
  }

  // Rate limit after normalization so junk input doesn't burn a user's quota.
  const rl = await rateLimit(clientIp(req.headers));
  if (!rl.ok) {
    return fail('rate', "Easy there — you're roasting faster than we can judge. Try again in a minute.", 429, {
      'retry-after': String(rl.retryAfterSec),
    });
  }

  try {
    const { result, cached } = await roastUrl(normalized, { fresh });
    return NextResponse.json(result, {
      headers: { 'x-roast-cache': cached ? 'hit' : 'miss' },
    });
  } catch (err) {
    const m = apiErrorFor(err);
    if (m.code === 'llm') console.error('[roast] pipeline failed', err);
    return fail(m.code, m.error, m.status);
  }
}
