/**
 * Agent-readable result: the same stored roast, served as clean Markdown.
 * Reached as `/r/<id>.md` (and via content negotiation on `/r/<id>`) through
 * the middleware rewrite, so agents and curl get Markdown while browsers keep
 * the rich HTML page. Zero extra LLM — it is the stored result reformatted.
 */
import { isValidId } from '@/lib/cache';
import { getCached } from '@/lib/pipeline';
import { notFoundMarkdown, resultToMarkdown } from '@/lib/resultMarkdown';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function markdown(body: string, status: number, cacheable: boolean): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': cacheable ? 'public, max-age=300, s-maxage=3600' : 'no-store',
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidId(id)) return markdown(notFoundMarkdown(false), 404, false);

  const r = await getCached(id);
  if (!r) return markdown(notFoundMarkdown(true), 404, false);

  return markdown(resultToMarkdown(r), 200, true);
}
