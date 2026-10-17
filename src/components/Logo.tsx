import { ACID, INK, MARK_R, MARK_SEAR, MARK_VIEWBOX } from '@/lib/brand';

/**
 * The bare mark. `cut` is the colour of the sear struck through the glyph —
 * it is the surface behind the mark, not a hole, so pass the real background
 * if it is ever anything but ink.
 */
export function Mark({
  size = 24,
  color = ACID,
  cut = INK,
  title,
}: {
  size?: number;
  color?: string;
  cut?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      width={size}
      height={size}
      className="shrink-0"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {MARK_R.map((d) => (
        <path key={d} d={d} fill={color} />
      ))}
      <path d={MARK_SEAR} fill={cut} />
    </svg>
  );
}

/** Mark + wordmark. The link home on every page that is not the home page. */
export function Logo({ size = 22, href }: { size?: number; href?: string }) {
  const lockup = (
    <span className="inline-flex items-baseline gap-2">
      <span className="translate-y-[0.15em]">
        <Mark size={size} />
      </span>
      <span
        className="font-semibold uppercase tracking-[0.14em] text-chalk"
        style={{ fontSize: size * 0.72 }}
      >
        roast
      </span>
    </span>
  );

  if (!href) return lockup;
  return (
    <a href={href} aria-label="Roast — home" className="inline-flex transition-opacity hover:opacity-70">
      {lockup}
    </a>
  );
}
