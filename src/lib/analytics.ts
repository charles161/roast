/**
 * Server-side analytics (PostHog). Lazy singleton, created only when
 * POSTHOG_KEY is set; otherwise every call is a silent no-op that makes zero
 * network requests. We never send PII beyond the domain the user typed.
 *
 * On serverless we flush before the response returns, so short-lived
 * invocations don't drop events.
 */
import { PostHog } from 'posthog-node';

/** The slice of posthog-node we use; lets tests inject a spy. */
export interface Capturer {
  capture(payload: { distinctId: string; event: string; properties?: Record<string, unknown> }): void;
  flush(): Promise<void>;
}

let injected: Capturer | null | undefined;
let real: Capturer | null = null;

function client(): Capturer | null {
  if (injected !== undefined) return injected;
  const key = process.env.POSTHOG_KEY;
  if (!key) return null;
  if (!real) {
    real = new PostHog(key, {
      host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    }) as unknown as Capturer;
  }
  return real;
}

/** Capture one server event and flush. Silent + no-op without POSTHOG_KEY. */
export async function captureServer(
  event: 'roast_completed' | 'roast_capped' | 'roast_error',
  properties: Record<string, unknown> = {},
): Promise<void> {
  const c = client();
  if (!c) return;
  try {
    c.capture({
      distinctId: 'roast-server',
      event,
      // We aggregate server events; no per-person profiles.
      properties: { ...properties, $process_person_profile: false },
    });
    await c.flush();
  } catch { /* analytics must never break a response */ }
}

/** Test seam. */
export function __setPostHogForTests(c: Capturer | null | undefined): void {
  injected = c;
  real = null;
}
