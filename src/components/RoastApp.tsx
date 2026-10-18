'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ResultView } from './ResultView';
import { HeroProof } from './HeroProof';
import { Logo, Mark } from './Logo';
import { LensScan } from './LensScan';
import { RoastAnother } from './ShareBar';
import { WORDMARK } from '@/lib/share';
import { getRecent, pushRecent, type RecentEntry } from '@/lib/history';
import { lensModeForLoading } from '@/lib/scanEngine';
import { track } from '@/lib/track';
import type { ApiError, RoastResult } from '@/lib/types';

const LOADING_LINES = [
  'fetching the page',
  'reading the hero',
  'running the five-second test',
  'counting the jargon',
  'judging your life choices',
  'consulting the brutal honesty department',
  'writing the rewrite',
];

const EXAMPLES = ['stripe.com', 'linear.app', 'vercel.com', 'notion.so'];

/** The rubric, in the mockup's order. The same five criteria the lens scores on. */
const RUBRIC: Array<[string, string, string]> = [
  ['01', 'Hero', 'Can a stranger tell what this is, who it is for, and what they get — in five seconds?'],
  ['02', 'Specifics', 'Plain words over jargon, and copy that matches what the page actually shows.'],
  ['03', 'Proof', 'Named customers, real numbers, visible pricing. Claims without evidence score zero.'],
  ['04', 'Craft', 'Does the page look deliberately made, or generated?'],
  ['05', 'CTA', 'One clear ask, in the reader’s own words.'],
];

/** POST body for /api/roast. `fresh` is only ever sent when true, so the default body is unchanged. */
export function roastRequestBody(url: string, fresh = false): string {
  return JSON.stringify(fresh ? { url, fresh: true } : { url });
}

/**
 * The URL a /r/<id> miss should auto-roast on mount, or null. A link whose
 * result aged out still has a durable id -> URL pointer; the page passes it as
 * `resolveUrl` and a normal roast regenerates the result under the same id.
 * Never when a result is already there.
 */
export function healTarget({
  resolveUrl,
  initialResult,
}: {
  resolveUrl?: string;
  initialResult?: RoastResult;
}): string | null {
  if (initialResult) return null;
  const target = resolveUrl?.trim();
  return target ? target : null;
}

/**
 * The result card plus its actions. `source` says how the visitor got here:
 *   - 'form': they generated it themselves in THIS session via the home form.
 *   - 'link': they opened a /r/<id> link (shared, or one that just self-healed).
 * Re-roast is for the owner's own session only. On a link-open view every idle
 * click would cost an LLM call during a viral blast, and "Roast yours" already
 * carries the loop there.
 */
export function ResultStage({
  r,
  shareUrl,
  source,
  onAnother,
  onReroast,
}: {
  r: RoastResult;
  shareUrl: string;
  source: 'form' | 'link';
  onAnother?: () => void;
  onReroast?: () => void;
}) {
  return (
    <ResultView
      r={r}
      shareUrl={shareUrl}
      onAnother={onAnother}
      onReroast={source === 'form' ? onReroast : undefined}
    />
  );
}

/** A terminal log, not a spinner. The wait is part of the voice. */
function Loading() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN((i) => Math.min(LOADING_LINES.length, i + 1)), 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mt-10 border border-line" aria-live="polite" aria-busy="true">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="label text-acid">Running</span>
        <span className="label">the lens</span>
      </div>
      <div className="px-4 py-5">
        {LOADING_LINES.slice(0, n).map((l, i) => (
          <div key={l} className="cut-in flex gap-3 py-1 text-body text-mute">
            <span className="select-none text-acid" aria-hidden>
              &gt;
            </span>
            <span className={`font-sans${i === n - 1 ? ' text-chalk' : ''}`}>
              {l}
              {i === n - 1 ? <span className="caret ml-1 text-acid">&#9608;</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RoastApp({
  initialResult,
  initialUrl,
  roasted = 0,
  showcase,
  expiredShare = false,
  resolveUrl,
}: {
  initialResult?: RoastResult;
  initialUrl?: string;
  /** Real count of sites in the result cache; 0 means "don't show". */
  roasted?: number;
  /** A real cached roast to show as proof, or undefined. */
  showcase?: RoastResult;
  /** /r/<id> had nothing cached: show a dismissible "that roast has expired" notice. */
  expiredShare?: boolean;
  /**
   * /r/<id> had no result but a durable pointer to its URL: roast it on mount
   * (a normal cache-or-generate roast, never fresh) to heal the link in place.
   */
  resolveUrl?: string;
}) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [result, setResult] = useState<RoastResult | null>(initialResult ?? null);
  // Healing a link: start in the loading state so the very first paint is the
  // terminal log, not a flash of the idle homepage.
  const [loading, setLoading] = useState(() => healTarget({ resolveUrl, initialResult }) !== null);
  const [error, setError] = useState<string | null>(null);
  const [arrived, setArrived] = useState(Boolean(initialResult));
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [expiredOpen, setExpiredOpen] = useState(expiredShare);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const healed = useRef(false);

  // Client-only: load the viewer's own recent roasts after mount (keeps SSR
  // output stable; renders nothing until there's real history).
  useEffect(() => {
    setRecent(getRecent());
  }, []);

  // Self-heal an expired share link: roast the remembered URL once, on mount.
  // The ref (not state) is the guard, so StrictMode's double effect or a
  // re-render can never fire a second LLM call.
  useEffect(() => {
    const target = healTarget({ resolveUrl, initialResult });
    if (!target || healed.current) return;
    healed.current = true;
    void run(target, false, true);
    // Mount-only on purpose: the props describe the page the visitor landed on.
  }, []);

  // Fire once per distinct result shown — fresh scan or a shared card.
  useEffect(() => {
    if (result) track('result_viewed', { id: result.id, overall: result.score.overall });
  }, [result]);

  /**
   * `heal`: this roast is the page regenerating the link the visitor opened
   * (not something they asked for). It starts already in the loading state,
   * skips the scroll-jumps, and lands in the same card-first view as any other
   * link-open visit.
   */
  async function run(raw: string, fresh = false, heal = false) {
    const target = raw.trim();
    if (!target || (loading && !heal)) return;
    if (heal) track('link_heal_started', { inputLen: target.length });
    else track('scan_submitted', fresh ? { inputLen: target.length, fresh: true } : { inputLen: target.length });
    setExpiredOpen(false);
    setLoading(true);
    setError(null);
    setResult(null);
    setArrived(false);
    if (!heal) {
      requestAnimationFrame(() =>
        loadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
    }
    try {
      const res = await fetch('/api/roast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: roastRequestBody(target, fresh),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setError((data as ApiError)?.error ?? 'Something went wrong. Try again.');
        return;
      }
      const r = data as RoastResult;
      setResult(r);
      if (heal) {
        // Same id as the link they opened (the pointer only exists for ids that
        // hash from their URL), so the address bar is already right. This is a
        // link-open view: not their own roast, so no "Recent" entry and no
        // Re-roast; the card-first layout with "Roast yours" carries the loop.
        setArrived(true);
        return;
      }
      // Remember it for this viewer (their own roast), newest first, capped at 3.
      setRecent(
        pushRecent({
          id: r.id,
          displayUrl: r.displayUrl,
          score: r.score.overall,
          createdAt: r.createdAt,
          favicon: r.favicon,
        }),
      );
      // Put the shareable id in the URL without a reload, so the link is copyable.
      window.history.replaceState(null, '', `/r/${r.id}`);
      // No scroll here: ResultView scrolls itself into view once it has actually
      // rendered. A rAF here fires before React commits the result, so it raced
      // the render and left the page at the top.
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
  // The hero scan idles (ambient) and switches to the scanning visual while a
  // roast is in flight. Desktop-only; the component itself no-ops below 1024px.
  const lensMode = lensModeForLoading(loading);
  // Someone who clicked a shared card came to see that card. Put it first, or
  // the whole reveal plays off-screen.
  const shared = arrived && result !== null;

  if (shared && result) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 pb-28 pt-6">
        <nav className="flex items-center justify-between gap-4 border-b border-line pb-5">
          <Logo size={20} href="/" />
          <RoastAnother
            onAnother={another}
            className="border border-acid px-4 py-2 text-label text-acid transition-colors hover:bg-acid hover:text-ink"
          >
            Roast yours
          </RoastAnother>
        </nav>
        <div className="mt-8">
          {/* A link-open view (shared, or self-healed): no Re-roast, see ResultStage. */}
          <ResultStage r={result} shareUrl={shareUrl} source="link" onAnother={another} />
        </div>
      </main>
    );
  }

  return (
    <>
      {/* Full-bleed hairline nav, aligned to the hero's left edge. */}
      <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 lg:px-10 xl:px-20">
        <Logo size={20} href="/" />
        {roasted > 0 ? (
          <span className="text-micro text-mute">
            <span className="font-bold tabular-nums text-chalk">
              {roasted.toLocaleString('en-US')}
            </span>{' '}
            pages roasted / 24h
          </span>
        ) : null}
      </header>

      <main>
        {/* HERO — copy on the left, the generative scan filling the right half on
            desktop. Below 1024px the lens cell is hidden and the engine never
            mounts; the column collapses to the single-column hero of today. */}
        <section className="lg:grid lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_560px] 2xl:grid-cols-[minmax(0,1fr)_640px]">
          <div className="px-5 lg:pl-10 lg:pr-14 xl:pl-20">
            <div className="mx-auto w-full max-w-3xl pb-14 pt-10 lg:mx-0 lg:max-w-[40rem] lg:py-16">
              {expiredOpen ? (
                <div
                  role="status"
                  className="cut-in mb-8 flex items-start gap-3 border border-acid px-4 py-3.5 text-body text-chalk"
                >
                  <span className="select-none font-bold text-acid" aria-hidden>
                    !
                  </span>
                  <p className="flex-1 font-sans">
                    That roast has expired &mdash; roast any site below for a fresh link.
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpiredOpen(false)}
                    aria-label="Dismiss notice"
                    className="-my-1.5 -mr-2 select-none px-2.5 py-1 text-title leading-none text-mute transition-colors hover:text-acid"
                  >
                    &times;
                  </button>
                </div>
              ) : null}

              <div className="cut-in mb-6 flex items-center gap-2.5 text-label uppercase tracking-[0.16em] text-mute">
                <span className="size-[7px] bg-acid" aria-hidden />
                Landing-page roaster
              </div>

              <h1 className="cut-in max-w-[20ch] text-pretty text-display font-bold leading-[0.98] tracking-[-0.045em]">
                Your landing page is probably <span className="text-acid">lying</span> to you.
              </h1>
              <p
                className="cut-in mt-7 max-w-[52ch] text-pretty font-sans text-[0.95rem] leading-relaxed text-prose sm:text-[1.0625rem]"
                style={{ animationDelay: '90ms' }}
              >
                Paste a URL. Founders and developers get a <b className="font-semibold text-chalk">brutal roast</b> of
                their landing page, <b className="font-semibold text-chalk">a score out of 100</b>, and{' '}
                <b className="font-semibold text-chalk">the rewritten headline</b>. Free, no account.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(url);
                }}
                className="cut-in mt-10"
                style={{ animationDelay: '180ms' }}
              >
                <div className="flex flex-col gap-px border border-line bg-line sm:flex-row">
                  <div className="relative flex flex-1 items-center bg-ink">
                    <span className="select-none pl-4 pr-1 text-body text-acid" aria-hidden>
                      &gt;
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
                      className="w-full border border-transparent bg-transparent py-4 pr-4 text-body text-chalk outline-none placeholder:text-mute/60 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !url.trim()}
                    className="border border-acid bg-acid px-8 py-4 text-label text-ink transition-colors hover:border-chalk hover:bg-chalk disabled:cursor-not-allowed disabled:bg-transparent disabled:text-acid/70"
                  >
                    {loading ? 'Judging…' : 'Roast my site'}
                  </button>
                </div>
              </form>

              <div
                className="cut-in mt-4 flex flex-wrap items-center gap-2 text-micro text-mute"
                style={{ animationDelay: '260ms' }}
              >
                <span className="label">Try</span>
                {EXAMPLES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      setUrl(e);
                      void run(e);
                    }}
                    className="border border-line px-2.5 py-1 font-sans text-[0.78rem] text-chalk/80 transition-colors hover:border-acid hover:text-acid"
                  >
                    {e}
                  </button>
                ))}
                {showcase ? (
                  <a href="#example" className="ml-auto text-micro text-mute transition-colors hover:text-acid">
                    See a real roast &rarr;
                  </a>
                ) : null}
              </div>

              {idle && recent.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-micro text-mute">
                  <span className="label">Recent</span>
                  {recent.map((e) => (
                    <a
                      key={e.id}
                      href={`/r/${e.id}`}
                      onClick={() => track('recent_clicked', { id: e.id })}
                      className="flex items-center gap-1.5 border border-line px-2.5 py-1 text-chalk/80 transition-colors hover:border-acid hover:text-acid"
                    >
                      <span className="max-w-[14ch] truncate">{e.displayUrl}</span>
                      <span className="tabular-nums text-mute">{e.score}</span>
                    </a>
                  ))}
                </div>
              ) : null}

              {error ? (
                <div
                  role="alert"
                  className="cut-in mt-8 border border-rough px-4 py-3.5 font-sans text-body text-chalk"
                >
                  <span className="mr-2 select-none font-bold text-rough" aria-hidden>
                    !
                  </span>
                  {error}
                </div>
              ) : null}

              <div ref={loadingRef}>{loading ? <Loading /> : null}</div>
            </div>
          </div>

          {/* The scan cell — desktop only. hidden lg:block keeps it out of the
              mobile flow entirely; LensScan also JS-gates the engine at 1024px. */}
          <div className="relative hidden min-h-[34rem] overflow-hidden border-l border-line bg-[#0c0c0c] lg:block">
            <LensScan mode={lensMode} className="absolute inset-0" />
          </div>
        </section>

        {/* The result the visitor generated here (form flow). Narrow column, so
            the card and reveal are byte-for-byte what they were. */}
        {!loading && result ? (
          <div className="mx-auto w-full max-w-3xl px-5 pb-28">
            <div className="mt-12">
              <ResultStage
                r={result}
                shareUrl={shareUrl}
                source="form"
                onAnother={another}
                onReroast={() => void run(result.url, true)}
              />
            </div>
          </div>
        ) : null}

        {/* WHAT WE ACTUALLY MEASURE — the rubric strip, directly under the hero. */}
        {idle ? (
          <section
            aria-label="What we actually measure"
            className="relative border-t border-line"
          >
            <span className="label absolute -top-[0.55rem] left-5 bg-ink px-2.5 lg:left-10 lg:translate-x-[18px] xl:left-20">
              What we actually measure
            </span>
            <dl className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 lg:grid-cols-5 lg:gap-0 lg:bg-transparent lg:pl-10 xl:pl-20">
              {RUBRIC.map(([num, key, desc]) => (
                <div
                  key={key}
                  className="bg-ink px-5 pb-7 pt-9 lg:border-l lg:border-line lg:px-6 lg:pt-8"
                >
                  <dt className="label flex items-center gap-2.5 text-acid">
                    <span className="not-italic text-mute">{num}</span>
                    {key}
                  </dt>
                  <dd className="mt-3 max-w-[34ch] font-sans text-[0.9rem] leading-relaxed text-prose">
                    {desc}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {idle ? (
          <div className="mx-auto w-full max-w-3xl px-5 pb-28">
            {showcase ? (
              <div className="mt-20 scroll-mt-6" id="example">
                <HeroProof r={showcase} />
              </div>
            ) : null}

            <footer className="mt-20 flex items-center justify-between gap-4 border-t border-line pt-6 text-micro text-mute">
              <span className="flex items-center gap-2">
                <Mark size={13} />
                {WORDMARK}
              </span>
              <span className="text-right">We read the public HTML. Results are kept for 90 days.</span>
            </footer>
          </div>
        ) : null}
      </main>
    </>
  );
}
