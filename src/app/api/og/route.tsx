import { ImageResponse } from 'next/og';
import { isValidId } from '@/lib/cache';
import { getCached } from '@/lib/pipeline';
import { band, temperature } from '@/lib/grade';
import type { RoastResult } from '@/lib/types';

export const runtime = 'nodejs';

const W = 1200;
const H = 630;
const MUTE = '#9aa1ae';
const INK = '#07070a';
const CHALK = '#f6f7f9';

/**
 * Satori renders a narrow CSS subset: flexbox only, and EVERY element gets an
 * explicit display. A div with more than one child and no `display: flex`
 * throws, which would otherwise serve a broken preview on a shared link.
 */
const row = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  display: 'flex',
  ...extra,
});
const col = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  ...extra,
});

function clamp(s: string, max: number): string {
  const t = (s ?? '').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function Fallback() {
  return (
    <div
      style={col({
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: INK,
        color: CHALK,
      })}
    >
      <div style={row({ fontSize: 68, fontWeight: 700, letterSpacing: -2 })}>Roast my site</div>
      <div style={row({ marginTop: 18, fontSize: 30, color: MUTE })}>
        A sharp roast, a score, and an instant glow-up.
      </div>
    </div>
  );
}

function Card({ r }: { r: RoastResult }) {
  const b = band(r.score.overall);
  return (
    <div
      style={col({
        width: '100%',
        height: '100%',
        backgroundColor: INK,
        color: CHALK,
        padding: 60,
        position: 'relative',
      })}
    >
      <div
        style={row({
          position: 'absolute',
          top: 0,
          left: 0,
          width: W,
          height: 6,
          backgroundColor: b.hex,
        })}
      />

      <div style={row({ alignItems: 'center', justifyContent: 'space-between' })}>
        <div style={col()}>
          <div style={row({ fontSize: 34, fontWeight: 700 })}>{clamp(r.siteName, 28)}</div>
          <div style={row({ fontSize: 23, color: MUTE, marginTop: 4 })}>
            {clamp(r.displayUrl, 44)}
          </div>
        </div>
        <div style={row({ fontSize: 18, fontWeight: 700, letterSpacing: 4, color: MUTE })}>
          ROAST · GLOW-UP
        </div>
      </div>

      <div style={row({ alignItems: 'center', marginTop: 40 })}>
        <div
          style={col({
            alignItems: 'center',
            justifyContent: 'center',
            width: 228,
            height: 228,
            borderRadius: 9999,
            border: `14px solid ${b.hex}`,
          })}
        >
          <div style={row({ fontSize: 104, fontWeight: 700, color: b.hex, lineHeight: 1 })}>
            {r.score.overall}
          </div>
          <div style={row({ fontSize: 18, color: MUTE, marginTop: 8, letterSpacing: 2 })}>
            OUT OF 100
          </div>
        </div>

        <div style={col({ marginLeft: 44, flex: 1 })}>
          <div style={row({ fontSize: 20, fontWeight: 700, color: b.hex, letterSpacing: 3 })}>
            {temperature(r.score.overall).toUpperCase()}
          </div>
          <div
            style={row({
              fontSize: 42,
              fontWeight: 700,
              lineHeight: 1.18,
              marginTop: 12,
            })}
          >
            {clamp(r.verdict, 88)}
          </div>
          <div style={row({ marginTop: 22 })}>
            {r.score.subs.map((s) => (
              <div key={s.key} style={col({ marginRight: 34 })}>
                <div style={row({ fontSize: 28, fontWeight: 700, color: band(s.score).hex })}>
                  {s.score}
                </div>
                <div style={row({ fontSize: 15, color: MUTE, marginTop: 2 })}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={row({ marginTop: 'auto' })}>
        <div
          style={col({
            flex: 1,
            padding: 20,
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.10)',
          })}
        >
          <div style={row({ fontSize: 14, fontWeight: 700, color: '#ff5d47', letterSpacing: 2.5 })}>
            BEFORE
          </div>
          <div style={row({ fontSize: 22, color: MUTE, marginTop: 8, lineHeight: 1.3 })}>
            {clamp(r.before.headline, 64)}
          </div>
        </div>
        <div style={row({ width: 20 })} />
        <div
          style={col({
            flex: 1,
            padding: 20,
            borderRadius: 18,
            border: '1px solid rgba(52,211,153,0.32)',
            backgroundColor: 'rgba(52,211,153,0.08)',
          })}
        >
          <div style={row({ fontSize: 14, fontWeight: 700, color: '#34d399', letterSpacing: 2.5 })}>
            AFTER
          </div>
          <div style={row({ fontSize: 24, fontWeight: 700, marginTop: 8, lineHeight: 1.3 })}>
            {clamp(r.after.headline, 64)}
          </div>
        </div>
      </div>
    </div>
  );
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const r = isValidId(id) ? getCached(id) : null;

  const opts = {
    width: W,
    height: H,
    headers: { 'cache-control': 'public, max-age=86400, immutable' },
  };

  if (!r) return new ImageResponse(<Fallback />, opts);

  try {
    return new ImageResponse(<Card r={r} />, opts);
  } catch (err) {
    // A broken preview would silently kill the share loop; a plain card is
    // always better than an error response.
    console.error('[og] render failed', err);
    return new ImageResponse(<Fallback />, opts);
  }
}
