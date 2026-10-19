import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RoastApp } from '@/components/RoastApp';
import { isValidId, urlForId } from '@/lib/cache';
import { getCached } from '@/lib/pipeline';
import { originFromRequest } from '@/lib/baseUrl';
import { MIN_DISPLAY, roastCount } from '@/lib/counter';
import { showcaseRoast } from '@/lib/showcase';
import { displayUrl } from '@/lib/url';

type Props = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

// The browser-tab <title> stays STATIC on every page. A client-side roast
// swaps the result and pushes a new /r/<id> URL without re-running this server
// function, so a per-result <title> went stale mid-session (the tab read the
// FIRST site you opened while the page showed a later one). The per-result
// identity lives in the OG/Twitter card instead — that is what link previews
// actually read, so shared /r/<id> links still show "<site> scored N/100".
const TAB_TITLE = 'Roast — score your landing page out of 100';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isValidId(id)) return { title: TAB_TITLE };

  const r = await getCached(id);
  if (!r) return { title: TAB_TITLE, robots: { index: false } };

  const origin = await originFromRequest();
  const shareTitle = `${r.displayUrl} scored ${r.score.overall}/100`;
  const description = r.verdict;
  const image = `${origin}/api/og?id=${r.id}`;

  return {
    title: TAB_TITLE,
    description,
    alternates: { canonical: `${origin}/r/${r.id}` },
    openGraph: {
      title: shareTitle,
      description,
      url: `${origin}/r/${r.id}`,
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: shareTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description,
      images: [image],
    },
  };
}

export default async function ResultPage({ params }: Props) {
  const { id } = await params;
  if (!isValidId(id)) notFound();

  const [n, r] = await Promise.all([roastCount(), getCached(id)]);
  const roasted = n >= MIN_DISPLAY ? n : 0;

  if (!r) {
    // The result aged out, but the id -> URL pointer never does. Hand the URL to
    // the client, which runs a normal (cache-or-generate, NOT fresh) roast on
    // mount: the same id comes back to life and every later open is instant.
    // Rendering never waits on that roast, and link-preview crawlers (no JS)
    // never trigger one. The roast itself goes through /api/roast, so the SSRF
    // guard, rate limit and spend cap all still apply.
    const resolveUrl = await urlForId(id);
    if (resolveUrl) {
      return (
        <RoastApp roasted={roasted} resolveUrl={resolveUrl} initialUrl={displayUrl(resolveUrl)} />
      );
    }

    // Ancient link (no pointer): still convert, with a notice so it doesn't
    // look broken.
    return (
      <RoastApp roasted={roasted} showcase={(await showcaseRoast()) ?? undefined} expiredShare />
    );
  }

  return <RoastApp initialResult={r} initialUrl={r.displayUrl} roasted={roasted} />;
}
