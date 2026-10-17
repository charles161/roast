import { ImageResponse } from 'next/og';
import { ACID, INK, MARK_R, MARK_SEAR, MARK_VIEWBOX } from '@/lib/brand';

export const runtime = 'nodejs';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * Home-screen icon. No border here: iOS masks the corners itself and a
 * hairline would be clipped unevenly. The glyph gets more room than in the
 * favicon because this is never rendered at 16px.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: INK,
        }}
      >
        <svg viewBox={MARK_VIEWBOX} width={124} height={124}>
          {MARK_R.map((d) => (
            <path key={d} d={d} fill={ACID} />
          ))}
          <path d={MARK_SEAR} fill={INK} />
        </svg>
      </div>
    ),
    size,
  );
}
