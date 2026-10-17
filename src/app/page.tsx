import { RoastApp } from '@/components/RoastApp';
import { MIN_DISPLAY, roastCount } from '@/lib/counter';
import { showcaseRoast } from '@/lib/showcase';

// Both numbers are read off shared state, so re-render at most once a minute.
// Under a traffic blast this serves the same cached HTML to everyone in between.
export const revalidate = 60;

export default async function HomePage() {
  const [n, showcase] = await Promise.all([roastCount(), showcaseRoast()]);
  return <RoastApp roasted={n >= MIN_DISPLAY ? n : 0} showcase={showcase ?? undefined} />;
}
