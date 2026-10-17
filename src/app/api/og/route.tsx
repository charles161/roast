import { ImageResponse } from 'next/og';
import { isValidId } from '@/lib/cache';
import { faviconDataUri } from '@/lib/favicon';
import { getCached } from '@/lib/pipeline';
import { band, temperature } from '@/lib/grade';
import { clampText, quoteWrap, teaser, WORDMARK } from '@/lib/share';
import type { RoastResult } from '@/lib/types';

export const runtime = 'nodejs';

const W = 1200;
const H = 630;
const MUTE = '#9aa1ae';
const INK = '#06060a';
const CHALK = '#f7f8fa';
const EMBER = '#ff5d47';
const MINT = '#34d399';

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
      <div style={row({ fontSize: 76, fontWeight: 700, letterSpacing: -2 })}>Roast my site</div>
      <div style={row({ marginTop: 18, fontSize: 30, color: MUTE })}>
        A sharp roast, a score, and an instant glow-up.
      </div>
      <div style={row({ marginTop: 34, fontSize: 24, fontWeight: 700, letterSpacing: 3, color: EMBER })}>
        {WORDMARK}
      </div>
    </div>
  );
}

/** Site identity tile: the real favicon when we could inline it, else a monogram. */
function Mark({ src, name, tint }: { src: string | null; name: string; tint: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={56}
        height={56}
        style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'contain' }}
      />
    );
  }
  return (
    <div
      style={row({
        width: 56,
        height: 56,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.07)',
        border: `1px solid ${tint}`,
        fontSize: 28,
        fontWeight: 700,
        color: CHALK,
      })}
    >
      {(name.charAt(0) || '?').toUpperCase()}
    </div>
  );
}

/** The dial, as a real SVG arc so the score reads at thumbnail size. */
function Dial({ score, hex }: { score: number; hex: string }) {
  const size = 236;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <div style={row({ position: 'relative', width: size, height: size, flexShrink: 0 })}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={hex}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        style={col({
          position: 'absolute',
          top: 0,
          left: 0,
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <div style={row({ fontSize: 112, fontWeight: 700, color: hex, lineHeight: 1 })}>
          {score}
        </div>
        <div style={row({ fontSize: 17, color: MUTE, marginTop: 6, letterSpacing: 2.5 })}>
          OUT OF 100
        </div>
      </div>
    </div>
  );
}

function Card({ r, mark }: { r: RoastResult; mark: string | null }) {
  const b = band(r.score.overall);
  const quote = teaser({ ...r, verdict: '' }, 128) || teaser(r, 128);

  return (
    <div
      style={col({
        width: '100%',
        height: '100%',
        backgroundColor: INK,
        color: CHALK,
        padding: '44px 54px',
        position: 'relative',
      })}
    >
      <div
        style={row({ position: 'absolute', top: 0, left: 0, width: W, height: 8, backgroundColor: b.hex })}
      />

      <div style={row({ alignItems: 'center', justifyContent: 'space-between' })}>
        <div style={row({ alignItems: 'center' })}>
          <Mark src={mark} name={r.siteName} tint={b.soft} />
          <div style={col({ marginLeft: 18 })}>
            <div style={row({ fontSize: 33, fontWeight: 700, lineHeight: 1.1 })}>
              {clampText(r.siteName, 26)}
            </div>
            <div style={row({ fontSize: 22, color: MUTE, marginTop: 3 })}>
              {clampText(r.displayUrl, 42)}
            </div>
          </div>
        </div>
        <div style={row({ fontSize: 21, fontWeight: 700, letterSpacing: 1.5, color: EMBER })}>
          {WORDMARK}
        </div>
      </div>

      <div style={row({ alignItems: 'center', marginTop: 28 })}>
        <Dial score={r.score.overall} hex={b.hex} />

        <div style={col({ marginLeft: 42, flex: 1 })}>
          <div style={row({ fontSize: 20, fontWeight: 700, color: b.hex, letterSpacing: 3 })}>
            {temperature(r.score.overall).toUpperCase()}
          </div>
          <div style={row({ fontSize: 41, fontWeight: 700, lineHeight: 1.16, marginTop: 10 })}>
            {clampText(r.verdict, 108)}
          </div>
          <div style={row({ marginTop: 20, alignItems: 'center' })}>
            {r.score.subs.map((s, i) => (
              <div key={s.key} style={row({ alignItems: 'center', marginRight: 20 })}>
                <div style={row({ fontSize: 22, fontWeight: 700, color: band(s.score).hex })}>
                  {s.score}
                </div>
                <div style={row({ fontSize: 17, color: MUTE, marginLeft: 7 })}>{s.label}</div>
                {i < r.score.subs.length - 1 ? (
                  <div style={row({ fontSize: 17, color: '#3a3f4a', marginLeft: 20 })}>·</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={row({ marginTop: 24, alignItems: 'flex-start' })}>
        <div style={row({ width: 4, height: 38, backgroundColor: b.hex, borderRadius: 2, marginRight: 18 })} />
        <div style={row({ fontSize: 25, color: 'rgba(247,248,250,0.88)', lineHeight: 1.34 })}>
          {quoteWrap(quote)}
        </div>
      </div>

      <div style={row({ marginTop: 'auto', alignItems: 'stretch' })}>
        <div
          style={col({
            flex: 1,
            padding: '16px 20px',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.10)',
          })}
        >
          <div style={row({ fontSize: 14, fontWeight: 700, color: EMBER, letterSpacing: 2.5 })}>
            BEFORE
          </div>
          <div style={row({ fontSize: 22, color: MUTE, marginTop: 7, lineHeight: 1.28 })}>
            {clampText(r.before.headline, 62)}
          </div>
        </div>
        <div style={row({ width: 48, alignItems: 'center', justifyContent: 'center', fontSize: 26, color: MINT })}>
          {'→'}
        </div>
        <div
          style={col({
            flex: 1,
            padding: '16px 20px',
            borderRadius: 16,
            border: '1px solid rgba(52,211,153,0.34)',
            backgroundColor: 'rgba(52,211,153,0.08)',
          })}
        >
          <div style={row({ fontSize: 14, fontWeight: 700, color: MINT, letterSpacing: 2.5 })}>
            AFTER
          </div>
          <div style={row({ fontSize: 24, fontWeight: 700, marginTop: 7, lineHeight: 1.28 })}>
            {clampText(r.after.headline, 62)}
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

  // Never let the icon fetch decide whether the preview renders at all.
  const mark = await faviconDataUri(r.favicon).catch(() => null);

  try {
    return new ImageResponse(<Card r={r} mark={mark} />, opts);
  } catch (err) {
    // A broken preview would silently kill the share loop; a plain card is
    // always better than an error response.
    console.error('[og] render failed', err);
    return new ImageResponse(<Fallback />, opts);
  }
}
