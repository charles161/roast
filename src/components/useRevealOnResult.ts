import { useEffect, useRef } from 'react';
import { createRevealer } from '@/lib/reveal';

/**
 * Attach the returned ref to the element that holds a displayed result. Whenever
 * `key` (see `revealKey`) becomes a new value, the page scrolls that element into
 * view once. A null/empty key means "no result", so the plain homepage never
 * scrolls. Respects prefers-reduced-motion (see lib/reveal).
 */
export function useRevealOnResult<T extends HTMLElement>(key: string | null) {
  const ref = useRef<T>(null);
  const revealer = useRef<ReturnType<typeof createRevealer> | null>(null);

  useEffect(() => {
    if (!key) return;
    revealer.current ??= createRevealer();
    revealer.current.reveal(ref.current, key);
  }, [key]);

  return ref;
}
