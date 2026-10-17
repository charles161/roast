'use client';

import { useEffect, useState } from 'react';
import { band } from '@/lib/grade';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Mirrors the cubic-bezier(.22,1,.36,1) the dial arc sweeps on, so the
// number and the ring arrive at the same moment.
const easeOut = (t: number) => 1 - (1 - t) ** 5;

/**
 * Counts 0 -> target on the same curve the dial arc sweeps on, so the number
 * and the ring land together. Starts at 0 on the server too, which is the
 * point: the reveal begins from zero whether or not JS has booted yet.
 */
export function useCountUp(target: number, durationMs = 1250, delayMs = 0): number {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setN(target);
      return;
    }
    let raf = 0;
    let t0 = 0;
    const tick = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, Math.max(0, (t - t0 - delayMs) / durationMs));
      setN(Math.round(target * easeOut(p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, delayMs]);

  return n;
}

/** The big number. An SVG arc, so it stays crisp in a screenshot. */
export function ScoreDial({
  score,
  size = 168,
  label = 'out of 100',
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const b = band(score);
  const shown = useCountUp(score);
  const stroke = size >= 140 ? 13 : 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = c * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="pointer-events-none absolute inset-[12%] rounded-full"
        style={{ background: `radial-gradient(circle, ${b.soft}, transparent 68%)` }}
        aria-hidden
      />
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
              filter: `drop-shadow(0 0 ${Math.round(size / 12)}px ${b.soft})`,
            } as React.CSSProperties
          }
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="font-semibold leading-none tracking-tight tabular-nums"
          style={{ fontSize: size * 0.36, color: b.hex }}
          aria-label={`${score} out of 100`}
        >
          {shown}
        </div>
        <div className="mt-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-mute">
          {label}
        </div>
      </div>
    </div>
  );
}

/** Horizontal sub-score bar with its one-line reason. */
export function SubScoreRow({
  label,
  score,
  reason,
  delayMs = 0,
}: {
  label: string;
  score: number;
  reason: string;
  delayMs?: number;
}) {
  const b = band(score);
  const shown = useCountUp(score, 900, delayMs);
  return (
    <div className="py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-chalk">{label}</span>
        <span className="text-sm font-semibold tabular-nums" style={{ color: b.hex }}>
          {shown}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/7">
        <div
          className="bar-grow h-full rounded-full"
          style={{
            width: `${Math.max(2, score)}%`,
            backgroundColor: b.hex,
            animationDelay: `${delayMs}ms`,
          }}
        />
      </div>
      <p
        className="deliver mt-2 text-[0.8rem] leading-relaxed text-mute"
        style={{ animationDelay: `${delayMs + 180}ms` }}
      >
        {reason}
      </p>
    </div>
  );
}
