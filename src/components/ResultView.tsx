import { ScoreDial, SubScoreRow } from './ScoreDial';
import { band, temperature } from '@/lib/grade';
import type { RoastResult } from '@/lib/types';
import { ShareBar } from './ShareBar';

/**
 * Wrap a roast line in quotation marks, unless it already opens by quoting
 * the site's own copy — nesting them reads as a typo on the share card.
 */
function quoted(lineText: string): string {
  const OPENERS = ['"', '\u201c', "'", '\u2018'];
  if (OPENERS.some((q) => lineText.startsWith(q))) return lineText;
  return `\u201c${lineText}\u201d`;
}

function Favicon({ src, name }: { src: string; name: string }) {
  if (!src) {
    return (
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/8 text-sm font-semibold text-mute">
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
      width={36}
      height={36}
      loading="lazy"
      className="size-9 shrink-0 rounded-lg bg-white/8 object-contain p-0.5"
    />
  );
}

/** The screenshot target: everything worth posting, in one framed block. */
export function ShareCard({ r }: { r: RoastResult }) {
  const b = band(r.score.overall);
  return (
    <section
      id="share-card"
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900/80 p-5 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.9)] backdrop-blur sm:p-7"
    >
      <div
        className="pointer-events-none absolute inset-x-0 -top-28 h-56 opacity-70"
        style={{ background: `radial-gradient(28rem 14rem at 50% 100%, ${b.soft}, transparent 70%)` }}
        aria-hidden
      />

      <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Favicon src={r.favicon} name={r.siteName} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-chalk">{r.siteName}</div>
            <div className="truncate text-xs text-mute">{r.displayUrl}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-mute">
            Roast · Glow-up
          </div>
        </div>
      </div>

      <div className="relative mt-6 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
        <ScoreDial score={r.score.overall} size={150} />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div
            className="text-[0.65rem] font-semibold uppercase tracking-[0.2em]"
            style={{ color: b.hex }}
          >
            {temperature(r.score.overall)}
          </div>
          <p className="mt-2 text-balance text-xl font-semibold leading-snug tracking-tight text-chalk sm:text-2xl">
            {r.verdict}
          </p>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-mute">
            {quoted(r.roast[0] ?? '')}
          </p>
        </div>
      </div>

      <div className="relative mt-6 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4 sm:grid-cols-4">
        {r.score.subs.map((s) => {
          const sb = band(s.score);
          return (
            <div key={s.key} className="text-center">
              <div className="text-lg font-semibold tabular-nums" style={{ color: sb.hex }}>
                {s.score}
              </div>
              <div className="mt-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-mute">
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative mt-5 space-y-2.5">
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
          <div className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-ember">
            Before
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-mute">
            {r.before.headline}
          </p>
        </div>
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: 'rgba(52,211,153,0.28)', background: 'rgba(52,211,153,0.07)' }}
        >
          <div className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-mint">
            After
          </div>
          <p className="mt-1.5 text-balance text-base font-semibold leading-snug tracking-tight text-chalk sm:text-lg">
            {r.after.headline}
          </p>
        </div>
      </div>
    </section>
  );
}

function Compare({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex items-center gap-2">
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-ember">
            {label} · before
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-mute">{before}</p>
      </div>
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: 'rgba(52,211,153,0.28)', background: 'rgba(52,211,153,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-mint">
            {label} · after
          </span>
        </div>
        <p className="mt-2 text-pretty text-sm font-medium leading-relaxed text-chalk">{after}</p>
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-mute">
        {eyebrow}
      </div>
      <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-chalk sm:text-xl">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ResultView({ r, shareUrl }: { r: RoastResult; shareUrl: string }) {
  return (
    <div className="rise">
      <ShareCard r={r} />

      <ShareBar r={r} shareUrl={shareUrl} />

      <Section eyebrow="The roast" title="What your copy is actually saying">
        <ul className="space-y-3">
          {r.roast.map((lineText, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-4 text-sm leading-relaxed text-chalk"
            >
              <span className="mt-0.5 shrink-0 text-xs font-semibold tabular-nums text-ember">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-pretty">{lineText}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="The scorecard" title="Where the points went">
        <div className="divide-y divide-white/8 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-1">
          {r.score.subs.map((s) => (
            <SubScoreRow key={s.key} label={s.label} score={s.score} reason={s.reason} />
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
              className="flex gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-4 text-sm leading-relaxed text-chalk"
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-mint/15 text-[0.65rem] font-semibold text-mint">
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
    </div>
  );
}
