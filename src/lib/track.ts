/**
 * Client-side analytics. posthog-js is loaded lazily and ONLY when a public key
 * is configured, so with no env the chunk is never fetched and zero network
 * calls are made. Every call is wrapped so analytics can never break the UI.
 */
type Props = Record<string, unknown>;

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

type PostHogLike = {
  init: (key: string, opts: Record<string, unknown>) => void;
  capture: (event: string, props?: Props) => void;
};

let loader: Promise<PostHogLike | null> | null = null;
let initialized = false;

function load(): Promise<PostHogLike | null> {
  if (!loader) {
    loader = import('posthog-js')
      .then((m) => (m.default ?? m) as unknown as PostHogLike)
      .catch(() => null);
  }
  return loader;
}

/** Initialize PostHog once, on the client, if a key is present. */
export function initAnalytics(): void {
  if (initialized || typeof window === 'undefined' || !KEY) return;
  initialized = true;
  void load().then((ph) => {
    if (!ph) return;
    try {
      ph.init(KEY, { api_host: HOST, capture_pageview: true, autocapture: true });
    } catch { /* ignore */ }
  });
}

/** Capture a client event. No-op without a key or outside the browser. */
export function track(event: string, props?: Props): void {
  if (typeof window === 'undefined' || !KEY) return;
  initAnalytics();
  void load().then((ph) => {
    if (!ph) return;
    try { ph.capture(event, props); } catch { /* ignore */ }
  });
}
