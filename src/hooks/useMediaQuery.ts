import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query. SSR-safe: it reports `false` on the server and
 * on the first client render (so hydration always matches), then resolves to the
 * real value after mount and tracks changes. A consumer that gates an expensive
 * mount (e.g. the hero scan canvas) therefore never mounts it until the client
 * has confirmed the query matches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    // addEventListener is the modern API; the older addListener path is there for
    // Safari < 14, which some phones still run.
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}
