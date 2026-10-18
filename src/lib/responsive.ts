/**
 * The single breakpoint the hero's generative scan is gated on. Below it the
 * canvas never mounts and no requestAnimationFrame loop runs — the mobile page
 * stays exactly as light as it is today. Kept here (not inline) so the gate is
 * one source of truth and unit-testable in the node test env.
 */
export const DESKTOP_MIN = 1024;

/** The media query the client hook subscribes to. */
export const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN}px)`;

/** True at viewport widths where the scan is allowed to mount and animate. */
export function isDesktopWidth(width: number): boolean {
  return width >= DESKTOP_MIN;
}
