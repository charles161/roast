import { useEffect, useRef } from 'react';
import { ScoreDial, SubScoreRow } from './ScoreDial';
import { band, temperature } from '@/lib/grade';
import { quoteWrap, teaser, WORDMARK } from '@/lib/share';
import { track } from '@/lib/track';
import type { RoastResult } from '@/lib/types';
import { RoastAnother, ShareBar } from './ShareBar';
import { FixPrompt } from './FixPrompt';
import { appCheekySubhead } from '@/lib/appState';
import { Mark } from './Logo';

/** Reveal choreography, in ms. One place, so the beats stay in order. */
const T = {
  verdict: 200,
  teaser: 500,
  subs: 680,
  subStep: 90,
  compare: 980,
  share: 1180,
  tail: 1320,
};

function delay(ms: number): React.CSSProperties {
  return { animationDelay: `${ms}ms` };
}

function Favicon({ src, name }: { src: string; name: string }) {
  if (!src) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center border border-line text-label text-mute">
        {name.charAt(0)}
      </div>
    );
  }
  return (
    // Third-party favicon from an arbitrary host: plain <img> so we never
    // proxy or optimise someone else's asset through our server.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={32}
      height={32}
      loading="lazy"
      className="size-8 shrink-0 border border-line object-contain p-1"
    />
  );
}

/** The screenshot target: everything worth posting, inside one hard frame. */
export function ShareCard({ r }: { r: RoastResult }) {
  const b = band(r.score.overall);
  const best = teaser({ ...r, verdict: '' }, 150) || teaser(r, 150);

  return (
    <section id="share-card" className="cut-in border border-line bg-ink">
      <div className="h-[3px] w-full" style={{ backgroundColor: b.hex }} aria-hidden />

      <header className="rule-0 flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <Favicon src={r.favicon} name={r.siteName} />
          <div className="min-w-0">
            <div className="truncate text-body font-bold text-chalk">{r.siteName}</div>
            <div className="truncate text-micro text-mute">{r.displayUrl}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Mark size={15} />
          <span className="text-[0.56rem] tracking-[0.08em] text-mute sm:text-micro">{WORDMARK}</span>
        </div>
      </header>

      <div className="flex flex-col items-center gap-6 px-5 py-7 sm:flex-row sm:items-center sm:gap-8">
        <ScoreDial score={r.score.overall} size={148} />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div
            className="wipe-in text-label font-bold"
            style={{ ...delay(T.verdict), color: b.hex }}
          >
            {temperature(r.score.overall)}
          </div>
          <p
            className="wipe-in mt-3 text-pretty text-[1.3rem] font-bold leading-[1.22] tracking-[-0.03em] text-chalk sm:text-[1.6rem]"
            style={delay(T.verdict + 90)}
          >
            {r.verdict}
          </p>
        </div>
      </div>

      <blockquote
        className="cut-in border-t border-line px-5 py-5 text-body leading-relaxed text-chalk/90"
        style={delay(T.teaser)}
      >
        <span className="mr-2 select-none font-bold" style={{ color: b.hex }} aria-hidden>
          &gt;
        </span>
        {quoteWrap(best)}
      </blockquote>

      <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-5">
        {r.score.subs.map((s, i) => {
          const sb = band(s.score);
          return (
            <div
              key={s.key}
              className="cut-in bg-ink px-4 py-3.5 last:col-span-2 sm:last:col-span-1"
              style={delay(T.subs + i * T.subStep)}
            >
              <div className="label truncate">{s.label}</div>
              <div className="mt-1.5 text-title font-bold tabular-nums" style={{ color: sb.hex }}>
                {s.score}
              </div>
              <div className="mt-2 h-[2px] w-full bg-line">
                <div
                  className="bar-grow h-full"
                  style={{
                    width: `${Math.max(2, s.score)}%`,
                    backgroundColor: sb.hex,
                    animationDelay: `${T.subs + i * T.subStep}ms`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line">
        <div className="cut-in flex gap-4 px-5 py-3.5" style={delay(T.compare)}>
          <span className="label w-14 shrink-0 text-rough">Before</span>
          <p className="line-clamp-2 min-w-0 text-body leading-snug text-mute">
            {r.before.headline}
          </p>
        </div>
        <div
          className="cut-in flex gap-4 border-t border-line px-5 py-4"
          style={delay(T.compare + 140)}
        >
          <span className="label w-14 shrink-0 text-acid">After</span>
          <p className="min-w-0 text-pretty text-body font-bold leading-snug text-chalk sm:text-[0.95rem]">
            {r.after.headline}
          </p>
        </div>
      </div>
    </section>
  );
}

function Compare({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="border border-line">
      <div className="flex gap-4 px-4 py-3.5">
        <span className="label w-20 shrink-0 text-rough">{label}</span>
        <p className="min-w-0 text-body leading-relaxed text-mute">{before}</p>
      </div>
      <div className="flex gap-4 border-t border-line bg-acid/[0.04] px-4 py-3.5">
        <span className="label w-20 shrink-0 text-acid">{label}</span>
        <p className="min-w-0 text-pretty text-body font-medium leading-relaxed text-chalk">
          {after}
        </p>
      </div>
    </div>
  );
}

function Section({
  index,
  title,
  delayMs = 0,
  children,
}: {
  index: string;
  title: string;
  delayMs?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="cut-in mt-14" style={delay(delayMs)}>
      <div className="flex items-baseline gap-4 border-b border-line pb-3">
        <span className="label text-acid">{index}</span>
        <h2 className="text-title font-bold tracking-[-0.02em] text-chalk">{title}</h2>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/**
 * Secondary, deliberately quiet: the page-owner's path (change the page, get a
 * fresh score) must not compete with the share buttons the viral loop runs on.
 * Same chip styling as the homepage "Try" examples.
 */
function ReroastRow({ onReroast }: { onReroast: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-micro text-mute">
      <span>Changed the page? Get a fresh score.</span>
      <button
        type="button"
        onClick={onReroast}
        title="Roast this page again for a fresh score"
        className="border border-line px-2.5 py-1 text-chalk/80 transition-colors hover:border-acid hover:text-acid"
      >
        Re-roast <span aria-hidden>&#8635;</span>
      </button>
    </div>
  );
}

export function ResultView({
  r,
  shareUrl,
  onAnother,
  onReroast,
}: {
  r: RoastResult;
  shareUrl: string;
  onAnother?: () => void;
  /** Re-submit this result's URL for a fresh (uncached) roast. Omit to hide the action. */
  onReroast?: () => void;
}) {
  const glowRef = useRef<HTMLDivElement>(null);
  // Old cached results predate the field; treat a missing flag as a landing page.
  const isLanding = r.isLandingPage !== false;

  // Fire once when the glow-up (the "magic") actually comes into view.
  useEffect(() => {
    const el = glowRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          track('glowup_viewed');
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div>
      <ShareCard r={r} />

      <div className="cut-in" style={delay(T.share)}>
        <ShareBar r={r} shareUrl={shareUrl} onAnother={onAnother} />
        {onReroast ? <ReroastRow onReroast={onReroast} /> : null}
      </div>

      <Section index="01" title="The roast" delayMs={T.tail}>
        <ul>
          {r.roast.map((lineText, i) => (
            <li
              key={i}
              className="cut-in rule flex gap-4 py-4 first:border-t-0 first:pt-0"
              style={delay(T.tail + 120 + i * 130)}
            >
              <span className="label w-6 shrink-0 tabular-nums text-acid">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-pretty text-body leading-relaxed text-chalk">{lineText}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section index="02" title="Where the points went">
        <div>
          {r.score.subs.map((s, i) => (
            <SubScoreRow
              key={s.key}
              label={s.label}
              score={s.score}
              reason={s.reason}
              delayMs={T.subs + i * T.subStep}
            />
          ))}
        </div>
      </Section>

      {isLanding ? (
        <>
          <div ref={glowRef}>
            <Section index="03" title="Same product, better words">
              <div className="grid gap-4">
                <Compare label="Headline" before={r.before.headline} after={r.after.headline} />
                <Compare label="Subhead" before={r.before.subhead} after={r.after.subhead} />
                <Compare label="CTA" before={r.before.cta} after={r.after.cta} />
              </div>
            </Section>
          </div>

          <Section index="04" title="Ship these three this afternoon">
            <ol>
              {r.fixes.map((f, i) => (
                <li key={i} className="rule flex gap-4 py-4 first:border-t-0 first:pt-0">
                  <span className="label w-6 shrink-0 tabular-nums text-acid">{i + 1}</span>
                  <span className="text-pretty text-body leading-relaxed text-chalk">{f}</span>
                </li>
              ))}
            </ol>
          </Section>

          {r.fixPrompt ? (
            <Section index="05" title="Copy the fix prompt">
              <FixPrompt fixPrompt={r.fixPrompt} shareUrl={shareUrl} />
            </Section>
          ) : null}
        </>
      ) : (
        <div ref={glowRef}>
          <Section index="03" title="The glow-up">
            <div className="border border-line p-8 text-center">
              <p className="text-pretty text-title font-bold tracking-[-0.02em] text-chalk">
                {appCheekySubhead(r.siteName)}
              </p>
              <p className="mx-auto mt-3 max-w-sm text-body leading-relaxed text-mute">
                It&rsquo;s an app, not a landing page — there&rsquo;s nothing to sell here. The roast
                above is what we&rsquo;d say if it tried.
              </p>
            </div>
          </Section>
        </div>
      )}

      {r.degraded ? (
        <p className="mt-10 text-micro text-mute">
          Scores came from the fallback rubric on this one — the scoring model was busy.
        </p>
      ) : null}

      <div className="mt-16 border border-line p-8 text-center">
        <p className="text-pretty text-title font-bold tracking-[-0.02em] text-chalk">
          Know a landing page that deserves this?
        </p>
        <p className="mx-auto mt-3 max-w-sm text-body leading-relaxed text-mute">
          Ten seconds. The rewrite is free.
        </p>
        <div className="mt-6 flex justify-center">
          <RoastAnother
            onAnother={onAnother}
            className="inline-flex items-center justify-center gap-2 border border-acid bg-acid px-7 py-3.5 text-label text-ink transition-colors hover:bg-chalk hover:border-chalk"
          >
            Roast another site
          </RoastAnother>
        </div>
      </div>
    </div>
  );
}
