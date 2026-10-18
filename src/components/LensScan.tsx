'use client';

import { useEffect, useRef } from 'react';
import { mountLens, type LensController, type LensMode } from '@/lib/scanEngine';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { DESKTOP_QUERY } from '@/lib/responsive';

/**
 * The hero's generative scan — a wireframe landing page being swept by a laser,
 * drawn in plain Canvas 2D (see lib/scanEngine). Desktop-only and decorative:
 *
 *  - Mounts the engine ONLY at >= 1024px (useMediaQuery gate). Below that the
 *    canvas is never rendered and no requestAnimationFrame loop ever starts, so
 *    the mobile page stays exactly as light as before.
 *  - `mode` drives it: 'ambient' idles in the hero, 'scanning' is the loading
 *    visual while a roast is in flight.
 *  - The engine pauses offscreen and on hidden tabs, honours
 *    prefers-reduced-motion (one static frame, no loop), and is torn down fully
 *    on unmount (cancelAnimationFrame + every observer/listener removed).
 *
 * aria-hidden throughout: it shows no real scores or numbers, only the rubric
 * category names, and carries no information the copy does not already state.
 */
export function LensScan({ mode, className }: { mode: LensMode; className?: string }) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<LensController | null>(null);
  // The latest mode without re-running the mount effect: mount reads it once.
  const modeRef = useRef<LensMode>(mode);
  modeRef.current = mode;

  // Mount/teardown is tied to the desktop breakpoint, not to the page lifetime:
  // crossing below 1024px unmounts the canvas and destroys the engine.
  useEffect(() => {
    if (!isDesktop) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctrl = mountLens(canvas, { mode: modeRef.current });
    ctrlRef.current = ctrl;
    return () => {
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, [isDesktop]);

  // Ambient <-> scanning as the roast starts and finishes. setMode is a no-op
  // if the engine is not mounted (mobile) or already in that mode.
  useEffect(() => {
    ctrlRef.current?.setMode(mode);
  }, [mode]);

  return (
    <div className={className} aria-hidden>
      {isDesktop ? (
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      ) : null}
    </div>
  );
}
