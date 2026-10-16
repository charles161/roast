import { NextResponse } from 'next/server';
import { BadUrlError, normalizeUrl } from '@/lib/url';
import { BlockedUrlError } from '@/lib/ssrf';
import { FetchPageError } from '@/lib/fetchPage';
import { CappedError, getCached, roastUrl, ThinPageError } from '@/lib/pipeline';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { isValidId } from '@/lib/cache';
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
  const cached = getCached(id);
  if (!cached) return fail('bad_url', 'That roast expired. Roast it again?', 404);
  return NextResponse.json(cached, {
    headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' },
  });
}

export async function POST(req: Request) {
  let raw: string;
  try {
    const body = (await req.json()) as { url?: unknown };
    raw = typeof body?.url === 'string' ? body.url : '';
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
  const rl = rateLimit(clientIp(req.headers));
  if (!rl.ok) {
    return fail('rate', "Easy there — you're roasting faster than we can judge. Try again in a minute.", 429, {
      'retry-after': String(rl.retryAfterSec),
    });
  }

  try {
    const { result, cached } = await roastUrl(normalized);
    return NextResponse.json(result, {
      headers: { 'x-roast-cache': cached ? 'hit' : 'miss' },
    });
  } catch (err) {
    if (err instanceof BlockedUrlError) return fail('blocked', err.message, 400);
    if (err instanceof FetchPageError) return fail('fetch', err.message, 502);
    if (err instanceof ThinPageError) return fail('thin', err.message, 422);
    if (err instanceof CappedError) return fail('capped', err.message, 503);
    console.error('[roast] pipeline failed', err);
    return fail('llm', 'Our judgement circuits tripped. Try again in a sec.', 502);
  }
}
