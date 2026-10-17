import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RoastApp } from '@/components/RoastApp';
import { isValidId } from '@/lib/cache';
import { getCached } from '@/lib/pipeline';
import { originFromRequest } from '@/lib/baseUrl';
import { MIN_DISPLAY, roastCount } from '@/lib/counter';
import { showcaseRoast } from '@/lib/showcase';

type Props = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isValidId(id)) return { title: 'Roast my site' };

  const r = await getCached(id);
  if (!r) return { title: 'Roast my site', robots: { index: false } };

  const origin = await originFromRequest();
  const title = `${r.displayUrl} scored ${r.score.overall}/100`;
  const description = r.verdict;
  const image = `${origin}/api/og?id=${r.id}`;

  return {
    title,
    description,
    alternates: { canonical: `${origin}/r/${r.id}` },
    openGraph: {
      title,
      description,
      url: `${origin}/r/${r.id}`,
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
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

  // An expired share link should still convert: fall through to the form.
  if (!r) return <RoastApp roasted={roasted} showcase={(await showcaseRoast()) ?? undefined} />;

  return <RoastApp initialResult={r} initialUrl={r.displayUrl} roasted={roasted} />;
}
