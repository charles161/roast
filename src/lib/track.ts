/**
 * Client-side analytics via the shared posthog-js singleton. Every call is a
 * no-op without a public key or outside the browser, and is wrapped so
 * analytics can never break the UI. The singleton is initialized once by
 * PostHogProvider; here we only capture — on the SAME instance, which is why
 * this uses a static import rather than a per-call dynamic one.
 */
import posthog from 'posthog-js';

type Props = Record<string, unknown>;

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/** Capture a client event. No-op without a key or outside the browser. */
export function track(event: string, props?: Props): void {
  if (typeof window === 'undefined' || !KEY) return;
  try {
    posthog.capture(event, props);
  } catch {
    /* analytics must never break the UI */
  }
}
