import { RoastApp } from '@/components/RoastApp';
import { MIN_DISPLAY, roastCount } from '@/lib/counter';
import { showcaseRoast } from '@/lib/showcase';

// Both numbers are read off disk, so re-render at most once a minute. Under a
// traffic blast this serves the same cached HTML to everyone in between.
export const revalidate = 60;

export default function HomePage() {
  const n = roastCount();
  return <RoastApp roasted={n >= MIN_DISPLAY ? n : 0} showcase={showcaseRoast() ?? undefined} />;
}
