import { ScoreDial, SubScoreRow } from './ScoreDial';
import { band, temperature } from '@/lib/grade';
import { quoteWrap, teaser, WORDMARK } from '@/lib/share';
import type { RoastResult } from '@/lib/types';
import { RoastAnother, ShareBar } from './ShareBar';

/** Reveal choreography, in ms. One place, so the beats stay in order. */
const T = {
  verdict: 220,
  teaser: 520,
  subs: 700,
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
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/8 text-sm font-semibold text-mute">
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
      width={40}
      height={40}
      loading="lazy"
      className="size-10 shrink-0 rounded-xl bg-white/8 object-contain p-1"
    />
  );
}

function Wordmark() {
  return (
    <div className="shrink-0 text-right text-[0.62rem] font-semibold tracking-[0.12em] text-mute/80">
      {WORDMARK}
    </div>
  );
}

/** The screenshot target: everything worth posting, in one framed block. */
export function ShareCard({ r }: { r: RoastResult }) {
  const b = band(r.score.overall);
  const best = teaser({ ...r, verdict: '' }, 150) || teaser(r, 150);

  return (
    <section
      id="share-card"
      className="land relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-ink-900/85 p-5 shadow-[0_30px_90px_-36px_rgba(0,0,0,0.95)] backdrop-blur sm:p-7"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${b.hex}, transparent)` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 -top-32 h-64 opacity-80"
        style={{ background: `radial-gradient(30rem 15rem at 50% 100%, ${b.soft}, transparent 70%)` }}
        aria-hidden
      />

      <header className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Favicon src={r.favicon} name={r.siteName} />
          <div className="min-w-0">
            <div className="truncate text-[0.95rem] font-semibold leading-tight text-chalk">
              {r.siteName}
            </div>
            <div className="truncate text-xs text-mute">{r.displayUrl}</div>
          </div>
        </div>
        <Wordmark />
      </header>

      <div className="relative mt-7 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
        <ScoreDial score={r.score.overall} size={162} />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div
            className="verdict-in text-[0.62rem] font-bold uppercase tracking-[0.22em]"
            style={{ ...delay(T.verdict), color: b.hex }}
          >
            {temperature(r.score.overall)}
          </div>
          <p
            className="verdict-in mt-2.5 text-balance text-[1.4rem] font-semibold leading-[1.18] tracking-tight text-chalk sm:text-[1.7rem]"
            style={delay(T.verdict + 90)}
          >
            {r.verdict}
          </p>
        </div>
      </div>

      <blockquote
        className="deliver relative mt-6 border-l-2 pl-4 text-[0.95rem] leading-relaxed text-chalk/85"
        style={{ ...delay(T.teaser), borderColor: b.hex }}
      >
        {quoteWrap(best)}
      </blockquote>

      <div className="relative mt-6 grid grid-cols-2 gap-x-5 gap-y-4 rounded-2xl border border-white/8 bg-white/[0.025] p-4 sm:grid-cols-4">
        {r.score.subs.map((s, i) => {
          const sb = band(s.score);
          return (
            <div
              key={s.key}
              className="deliver min-w-0"
              style={delay(T.subs + i * T.subStep)}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-mute">
                  {s.label}
                </span>
                <span className="text-base font-semibold tabular-nums" style={{ color: sb.hex }}>
                  {s.score}
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/8">
                <div
                  className="bar-grow h-full rounded-full"
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

      <div className="relative mt-5 space-y-2" style={delay(T.compare)}>
        <div className="deliver rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3" style={delay(T.compare)}>
          <div className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-ember">
            Before
          </div>
          <p className="mt-1.5 line-clamp-2 text-[0.85rem] leading-snug text-mute">
            {r.before.headline}
          </p>
        </div>
        <div
          className="deliver rounded-xl border px-4 py-3.5"
          style={{
            ...delay(T.compare + 140),
            borderColor: 'rgba(52,211,153,0.3)',
            background: 'rgba(52,211,153,0.07)',
          }}
        >
          <div className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-mint">
            After
          </div>
          <p className="mt-1.5 text-balance text-[1.02rem] font-semibold leading-snug tracking-tight text-chalk sm:text-[1.12rem]">
            {r.after.headline}
          </p>
        </div>
      </div>
    </section>
  );
}

function Compare({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <div className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-ember">
          {label} · before
        </div>
        <p className="mt-2 text-sm leading-relaxed text-mute">{before}</p>
      </div>
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: 'rgba(52,211,153,0.28)', background: 'rgba(52,211,153,0.06)' }}
      >
        <div className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-mint">
          {label} · after
        </div>
        <p className="mt-2 text-pretty text-sm font-medium leading-relaxed text-chalk">{after}</p>
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  delayMs = 0,
  children,
}: {
  eyebrow: string;
  title: string;
  delayMs?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="deliver mt-11" style={delay(delayMs)}>
      <div className="text-[0.6rem] font-bold uppercase tracking-[0.22em] text-mute">{eyebrow}</div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-chalk sm:text-2xl">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ResultView({
  r,
  shareUrl,
  onAnother,
}: {
  r: RoastResult;
  shareUrl: string;
  onAnother?: () => void;
}) {
  return (
    <div>
      <ShareCard r={r} />

      <div className="deliver" style={delay(T.share)}>
        <ShareBar r={r} shareUrl={shareUrl} onAnother={onAnother} />
      </div>

      <Section eyebrow="The roast" title="What your copy is actually saying" delayMs={T.tail}>
        <ul className="space-y-3">
          {r.roast.map((lineText, i) => (
            <li
              key={i}
              className="deliver flex gap-3.5 rounded-xl border border-white/8 bg-white/[0.02] p-4 text-sm leading-relaxed text-chalk"
              style={delay(T.tail + 120 + i * 130)}
            >
              <span className="mt-0.5 shrink-0 text-xs font-bold tabular-nums text-ember">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-pretty">{lineText}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="The scorecard" title="Where the points went">
        <div className="divide-y divide-white/8 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-1">
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

      <Section eyebrow="The glow-up" title="Same product, better words">
        <div className="space-y-3">
          <Compare label="Headline" before={r.before.headline} after={r.after.headline} />
          <Compare label="Subhead" before={r.before.subhead} after={r.after.subhead} />
          <Compare label="CTA" before={r.before.cta} after={r.after.cta} />
        </div>
      </Section>

      <Section eyebrow="Do these three things" title="Fixes you can ship this afternoon">
        <ol className="space-y-2.5">
          {r.fixes.map((f, i) => (
            <li
              key={i}
              className="flex gap-3.5 rounded-xl border border-white/8 bg-white/[0.02] p-4 text-sm leading-relaxed text-chalk"
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-mint/15 text-[0.65rem] font-bold text-mint">
                {i + 1}
              </span>
              <span className="text-pretty">{f}</span>
            </li>
          ))}
        </ol>
      </Section>

      {r.degraded ? (
        <p className="mt-8 text-center text-xs text-mute">
          Scores came from our fallback rubric on this one — the scoring model was busy.
        </p>
      ) : null}

      <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="text-balance text-lg font-semibold tracking-tight text-chalk">
          Know a landing page that deserves this?
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-mute">
          Takes about ten seconds. The rewrite is free.
        </p>
        <div className="mt-5 flex justify-center">
          <RoastAnother
            onAnother={onAnother}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-ember px-6 py-3.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.99]"
          >
            Roast another site
          </RoastAnother>
        </div>
      </div>
    </div>
  );
}
