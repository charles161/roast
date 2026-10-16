'use client';

import { useEffect, useRef, useState } from 'react';
import { ResultView } from './ResultView';
import type { ApiError, RoastResult } from '@/lib/types';

const LOADING_LINES = [
  'Fetching your site…',
  'Reading your headline…',
  'Counting the buzzwords…',
  'Judging your life choices…',
  'Writing something mean but fair…',
  'Rewriting it properly…',
];

const EXAMPLES = ['stripe.com', 'linear.app', 'vercel.com', 'notion.so'];

function Loading() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1 < LOADING_LINES.length ? n + 1 : n)), 1700);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rise mt-10" aria-live="polite">
      <div className="rounded-3xl border border-white/10 bg-ink-900/70 p-6 sm:p-7">
        <div className="flex items-center gap-4">
          <div className="size-[150px] shrink-0 rounded-full shimmer" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-3 w-24 rounded shimmer" />
            <div className="h-6 w-full rounded shimmer" />
            <div className="h-6 w-4/5 rounded shimmer" />
            <div className="h-3 w-2/3 rounded shimmer" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="h-14 rounded-xl shimmer" />
          ))}
        </div>
      </div>
      <p className="mt-5 text-center text-sm text-mute">{LOADING_LINES[i]}</p>
    </div>
  );
}

export function RoastApp({ initialResult, initialUrl }: { initialResult?: RoastResult; initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [result, setResult] = useState<RoastResult | null>(initialResult ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  async function run(raw: string) {
    const target = raw.trim();
    if (!target || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
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

  const shareUrl = result
    ? typeof window !== 'undefined'
      ? `${window.location.origin}/r/${result.id}`
      : `/r/${result.id}`
    : '';

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-14 sm:pt-20">
      <header className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-mute">
          Roast · Score · Glow-up
        </div>
        <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          Your landing page is{' '}
          <span className="bg-gradient-to-r from-ember via-amber2 to-ember bg-clip-text text-transparent">
            probably lying
          </span>{' '}
          to you.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-pretty text-[0.95rem] leading-relaxed text-mute">
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
              className="w-full rounded-xl border border-white/12 bg-white/[0.04] py-3.5 pl-[4.7rem] pr-4 text-[0.95rem] text-chalk outline-none transition placeholder:text-mute/60 focus:border-ember/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-ember/20"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="rounded-xl bg-ember px-6 py-3.5 text-[0.95rem] font-semibold text-white transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
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

      {error ? (
        <div
          role="alert"
          className="rise mt-7 rounded-xl border border-ember/30 bg-ember/[0.08] p-4 text-sm leading-relaxed text-chalk"
        >
          {error}
        </div>
      ) : null}

      {loading ? <Loading /> : null}

      <div ref={resultRef} className="scroll-mt-6">
        {!loading && result ? (
          <div className="mt-10">
            <ResultView r={result} shareUrl={shareUrl} />
          </div>
        ) : null}
      </div>

      {!result && !loading ? (
        <p className="mt-14 text-center text-xs leading-relaxed text-mute/70">
          We read the public HTML of the page you paste. Nothing is stored except the result, for a day.
        </p>
      ) : null}
    </main>
  );
}
