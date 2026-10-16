import { band } from '@/lib/grade';

/** The big number. An SVG arc so it stays crisp in a screenshot. */
export function ScoreDial({ score, size = 168 }: { score: number; size?: number }) {
  const b = band(score);
  const stroke = size >= 140 ? 12 : 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = c * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          className="dial-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="dial-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={b.hex}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          style={
            {
              '--dash-full': `${c}px`,
              '--dash-target': `${target}px`,
              strokeDashoffset: target,
            } as React.CSSProperties
          }
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="font-semibold tracking-tight tabular-nums leading-none"
          style={{ fontSize: size * 0.34, color: b.hex }}
        >
          {score}
        </div>
        <div className="mt-1 text-[0.6rem] font-medium uppercase tracking-[0.18em] text-mute">
          out of 100
        </div>
      </div>
    </div>
  );
}

/** Horizontal sub-score bar with its one-line reason. */
export function SubScoreRow({ label, score, reason }: { label: string; score: number; reason: string }) {
  const b = band(score);
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-chalk">{label}</span>
        <span className="text-sm font-semibold tabular-nums" style={{ color: b.hex }}>
          {score}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/7">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(2, score)}%`, backgroundColor: b.hex }}
        />
      </div>
      <p className="mt-2 text-[0.8rem] leading-relaxed text-mute">{reason}</p>
    </div>
  );
}
