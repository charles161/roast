'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ResultView } from './ResultView';
import { RoastAnother } from './ShareBar';
import { WORDMARK } from '@/lib/share';
import type { ApiError, RoastResult } from '@/lib/types';

const LOADING_LINES = [
  'Reading your site…',
  'Counting the buzzwords…',
  'Judging your life choices…',
  'Consulting the brutal honesty department…',
  'Writing something mean but fair…',
  'Rewriting it properly…',
];

const EXAMPLES = ['stripe.com', 'linear.app', 'vercel.com', 'notion.so'];

function Loading() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1 < LOADING_LINES.length ? n + 1 : n)), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rise mt-10" aria-live="polite" aria-busy="true">
      <div className="rounded-[1.75rem] border border-white/10 bg-ink-900/70 p-5 sm:p-7">
        <div className="flex items-center gap-4">
          <div className="pulse-soft relative size-[150px] shrink-0">
            <div className="absolute inset-0 rounded-full border-[13px] border-white/[0.07]" />
            <div
              className="absolute inset-0 rounded-full border-[13px] border-transparent"
              style={{ borderTopColor: 'rgba(255,93,71,0.55)' }}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="shimmer h-3 w-24 rounded" />
            <div className="shimmer h-7 w-full rounded" />
            <div className="shimmer h-7 w-4/5 rounded" />
            <div className="shimmer h-3 w-2/3 rounded" />
          </div>
        </div>
        <div className="mt-7 grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="shimmer h-14 rounded-xl" />
          ))}
        </div>
      </div>
      <p className="mt-5 text-center text-sm text-mute" role="status">
        {LOADING_LINES[i]}
      </p>
    </div>
  );
}

export function RoastApp({
  initialResult,
  initialUrl,
  roasted = 0,
}: {
  initialResult?: RoastResult;
  initialUrl?: string;
  /** Real count of sites currently in the result cache; 0 means "don't show". */
  roasted?: number;
}) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [result, setResult] = useState<RoastResult | null>(initialResult ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrived, setArrived] = useState(Boolean(initialResult));
  const inputRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  async function run(raw: string) {
    const target = raw.trim();
    if (!target || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setArrived(false);
    // Bring the skeleton into view, so the wait is something to watch.
    requestAnimationFrame(() => loadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    try {
      const res = await fetch('/api/roast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setError((data as ApiError)?.error ?? 'Something went wrong. Try again.');
        return;
      }
      const r = data as RoastResult;
      setResult(r);
      // Put the shareable id in the URL without a reload, so the link is copyable.
      window.history.replaceState(null, '', `/r/${r.id}`);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch {
      setError('Network hiccup. Try that again.');
    } finally {
      setLoading(false);
    }
  }

  /** Back to an empty form without a page load — the conversion path. */
  const another = useCallback(() => {
    setResult(null);
    setArrived(false);
    setError(null);
    setUrl('');
    window.history.pushState(null, '', '/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const shareUrl = result
    ? typeof window !== 'undefined'
      ? `${window.location.origin}/r/${result.id}`
      : `/r/${result.id}`
    : '';

  const idle = !result && !loading;
  // Someone who clicked a shared card came to see that card. Put it first and
  // keep the pitch to a single line, or the whole reveal plays off-screen.
  const shared = arrived && result !== null;

  if (shared && result) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
        <div className="flex items-center justify-between gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-mute transition hover:text-chalk"
          >
            <span className="size-1.5 rounded-full bg-ember" aria-hidden />
            Roast · Score · Glow-up
          </a>
          <RoastAnother
            onAnother={another}
            className="rounded-full border border-ember/40 bg-ember/10 px-3.5 py-1.5 text-xs font-semibold text-ember transition hover:bg-ember/20"
          />
        </div>
        <div className="mt-5">
          <ResultView r={result} shareUrl={shareUrl} onAnother={another} />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-12 sm:pt-16">
      <header className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-mute">
          Roast · Score · Glow-up
        </div>
        <h1 className="mt-5 text-balance text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-6xl">
          Your landing page is{' '}
          <span className="bg-gradient-to-r from-ember via-amber2 to-ember bg-clip-text text-transparent">
            probably lying
          </span>{' '}
          to you.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-pretty text-[0.98rem] leading-relaxed text-mute">
          Paste your URL. Get a sharp, specific roast of your messaging, a score out of 100, and a
          rewritten headline that is actually better.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(url);
        }}
        className="mt-8"
      >
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-mute">
              https://
            </span>
            <input
              ref={inputRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              aria-label="Your website URL"
              placeholder="yoursite.com"
              className="w-full rounded-xl border border-white/12 bg-white/[0.04] py-4 pl-[4.7rem] pr-4 text-[0.95rem] text-chalk outline-none transition placeholder:text-mute/60 focus:border-ember/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-ember/20"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="rounded-xl bg-ember px-7 py-4 text-[0.95rem] font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? 'Judging…' : 'Roast it'}
          </button>
        </div>
      </form>

      <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 text-xs text-mute">
        <span>Try</span>
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              setUrl(e);
              void run(e);
            }}
            className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-medium text-chalk/80 transition hover:border-white/20 hover:text-chalk"
          >
            {e}
          </button>
        ))}
      </div>

      {idle && roasted > 0 ? (
        <p className="mt-6 text-center text-xs text-mute">
          <span className="font-semibold tabular-nums text-chalk">{roasted.toLocaleString('en-US')}</span>{' '}
          sites roasted in the last 24 hours.
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rise mt-7 rounded-xl border border-ember/30 bg-ember/[0.08] p-4 text-sm leading-relaxed text-chalk"
        >
          {error}
        </div>
      ) : null}

      <div ref={loadingRef}>{loading ? <Loading /> : null}</div>

      <div ref={resultRef} className="scroll-mt-6">
        {!loading && result ? (
          <div className="mt-10">
            <ResultView r={result} shareUrl={shareUrl} onAnother={another} />
          </div>
        ) : null}
      </div>

      {idle ? (
        <footer className="mt-16 text-center text-xs leading-relaxed text-mute/70">
          <p>We read the public HTML of the page you paste. Nothing is stored except the result, for a day.</p>
          <p className="mt-2 font-semibold tracking-[0.1em] text-mute/60">{WORDMARK}</p>
        </footer>
      ) : null}
    </main>
  );
}
