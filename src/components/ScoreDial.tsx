'use client';

import { useEffect, useState } from 'react';
import { band } from '@/lib/grade';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Mirrors the dial arc's easing curve, so number and ring land together. */
const easeOut = (t: number) => 1 - (1 - t) ** 5;

/**
 * Counts 0 -> target. Starts at 0 on the server too, which is the point: the
 * reveal begins from zero whether or not JS has booted yet.
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

/**
 * The score. A thin arc with butt caps — no glow, no rounded ends, nothing
 * soft. It reads as an instrument, which is what it is.
 */
export function ScoreDial({ score, size = 148 }: { score: number; size?: number }) {
  const b = band(score);
  const shown = useCountUp(score);
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = c * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-line)"
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
          strokeLinecap="butt"
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
          className="font-bold leading-none tabular-nums"
          style={{ fontSize: size * 0.38, color: b.hex, letterSpacing: '-0.04em' }}
          aria-label={`${score} out of 100`}
        >
          {shown}
        </div>
        <div className="label mt-2" style={{ fontSize: Math.max(9, size * 0.068) }}>
          / 100
        </div>
      </div>
    </div>
  );
}

/** One rubric line: label, measured bar, number, and the reason underneath. */
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
    <div className="rule py-4 first:border-t-0">
      <div className="flex items-baseline gap-4">
        <span className="label w-[6.5rem] shrink-0 text-chalk">{label}</span>
        <div className="h-[3px] flex-1 bg-line">
          <div
            className="bar-grow h-full"
            style={{
              width: `${Math.max(2, score)}%`,
              backgroundColor: b.hex,
              animationDelay: `${delayMs}ms`,
            }}
          />
        </div>
        <span
          className="w-9 shrink-0 text-right text-body font-bold tabular-nums"
          style={{ color: b.hex }}
        >
          {shown}
        </span>
      </div>
      <p
        className="cut-in mt-2.5 pl-[7.5rem] text-body leading-relaxed text-mute"
        style={{ animationDelay: `${delayMs + 160}ms` }}
      >
        {reason}
      </p>
    </div>
  );
}
