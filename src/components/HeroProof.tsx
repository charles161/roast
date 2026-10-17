import { band } from '@/lib/grade';
import type { RoastResult } from '@/lib/types';

/**
 * A real roast, shown on the home page as proof. Not a mock-up: this is a
 * cached result and the link goes to the actual share page. We score other
 * people on whether their copy matches what their page shows; this is us
 * holding the same line.
 */
export function HeroProof({ r }: { r: RoastResult }) {
  const b = band(r.score.overall);
  return (
    <a
      href={`/r/${r.id}`}
      className="cut-in group block border border-line transition-colors hover:border-line-2"
      style={{ animationDelay: '520ms' }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="label text-acid">A real roast</h2>
        <span className="text-micro text-mute">{r.displayUrl}</span>
      </div>

      <div className="flex items-start gap-5 px-4 py-5">
        <div className="shrink-0 text-center">
          <div
            className="text-[2.5rem] font-bold leading-none tabular-nums tracking-[-0.04em]"
            style={{ color: b.hex }}
          >
            {r.score.overall}
          </div>
          <div className="label mt-1.5">/ 100</div>
        </div>
        <p className="min-w-0 text-pretty text-body font-bold leading-snug text-chalk">
          {r.verdict}
        </p>
      </div>

      <div className="flex gap-4 border-t border-line px-4 py-2.5">
        <span className="label w-14 shrink-0 text-rough">Before</span>
        <p className="line-clamp-1 min-w-0 text-micro leading-relaxed text-mute">
          {r.before.headline}
        </p>
      </div>
      <div className="flex gap-4 border-t border-line px-4 py-2.5">
        <span className="label w-14 shrink-0 text-acid">After</span>
        <p className="line-clamp-1 min-w-0 text-micro font-bold leading-relaxed text-chalk">
          {r.after.headline}
        </p>
      </div>

      <div className="border-t border-line px-4 py-2.5 text-micro text-mute transition-colors group-hover:text-chalk">
        See the result &rarr;
      </div>
    </a>
  );
}
