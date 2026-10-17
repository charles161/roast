/**
 * Agent-readable result links. The React page at `/r/<id>` stays the rich HTML
 * surface for humans and link previews; agents/curl get Markdown two ways,
 * both rewritten internally to the `/api/md/<id>` handler (URL unchanged):
 *   - `/r/<id>.md`            — the must-have, explicit Markdown URL
 *   - `/r/<id>` with `Accept: text/markdown` — content negotiation, a bonus
 */
import { NextResponse, type NextRequest } from 'next/server';

// Result ids are a fixed 12 url-safe chars (see cache.idForUrl / isValidId).
const MD_SUFFIX = /^\/r\/([A-Za-z0-9_-]{12})\.md$/;
const BARE = /^\/r\/([A-Za-z0-9_-]{12})$/;

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  const md = pathname.match(MD_SUFFIX);
  if (md) return rewriteToMarkdown(req, md[1]!);

  const bare = pathname.match(BARE);
  if (bare && /\btext\/markdown\b/i.test(req.headers.get('accept') ?? '')) {
    return rewriteToMarkdown(req, bare[1]!);
  }

  return NextResponse.next();
}

function rewriteToMarkdown(req: NextRequest, id: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = `/api/md/${id}`;
  return NextResponse.rewrite(url);
}

export const config = { matcher: '/r/:path*' };
