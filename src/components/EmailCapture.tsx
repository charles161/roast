'use client';

import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/track';

type Status = 'idle' | 'sending' | 'done' | 'error';

/**
 * A slim, OPTIONAL email capture shown after a roast result. It never blocks,
 * gates, or delays the roast — the result is already fully rendered above it.
 * Matches the house style: mono, hairlines, ink/acid, nothing rounded/blurred.
 */
export function EmailCapture({
  roastId,
  source = 'result',
  delayMs = 0,
}: {
  roastId?: string;
  source?: string;
  delayMs?: number;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const shown = useRef(false);

  // Fire once when the field actually renders (opt-in analytics; no-op w/o key).
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    track('email_capture_shown', { source, roastId });
  }, [source, roastId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value || status === 'sending') return;
    setStatus('sending');
    // Fire the funnel event up front; analytics must never gate the request.
    track('email_captured', { source, roastId });
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: value, roastId, source }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('done');
    } catch {
      // Quiet retry: keep what they typed, let them try again.
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div
        className="cut-in mt-5 flex items-center gap-3 border border-line bg-ink px-5 py-4"
        style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
      >
        <span className="text-label font-bold text-acid" aria-hidden>
          &#10003;
        </span>
        <p className="text-body text-chalk" aria-live="polite">
          You&rsquo;re in. We&rsquo;ll send the full report + Pro early access.
        </p>
      </div>
    );
  }

  return (
    <div
      className="cut-in mt-5 border border-line bg-ink px-5 py-4"
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      <p className="text-body font-bold text-chalk">
        Get the full report + Pro early access <span aria-hidden className="text-acid">&rarr;</span>
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-px bg-line sm:flex-row">
        <label htmlFor="roast-email" className="sr-only">
          Email address
        </label>
        <input
          id="roast-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === 'error') setStatus('idle');
          }}
          placeholder="you@company.com"
          disabled={status === 'sending'}
          className="min-w-0 flex-1 border-0 bg-ink px-4 py-3 font-mono text-body text-chalk placeholder:text-mute focus:outline-none focus:ring-1 focus:ring-acid disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="flex items-center justify-center gap-2 border-0 bg-acid px-5 py-3 text-label text-ink transition-colors hover:bg-chalk disabled:opacity-60"
        >
          {status === 'sending' ? 'Sending…' : 'Notify me'}
        </button>
      </form>
      {status === 'error' ? (
        <p className="mt-2 text-micro text-rough" aria-live="polite">
          Didn&rsquo;t go through. Try again?
        </p>
      ) : (
        <p className="mt-2 text-micro text-mute">No spam. One email when it ships.</p>
      )}
    </div>
  );
}
