import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { isValidId } from '@/lib/cache';
import { faviconDataUri } from '@/lib/favicon';
import { getCached } from '@/lib/pipeline';
import { band, temperature } from '@/lib/grade';
import { clampText, quoteWrap, teaser, WORDMARK } from '@/lib/share';
import { ACID, CHALK, INK, LINE, MARK_R, MARK_SEAR, MARK_VIEWBOX, MUTE } from '@/lib/brand';
import type { RoastResult } from '@/lib/types';

export const runtime = 'nodejs';

const W = 1200;
const H = 630;

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

/**
 * The interface is set in one mono and the share image has to match, so the
 * font is vendored rather than fetched at render time — a network call here
 * would put a third party in the path of every link preview. If it cannot be
 * read we still render, just in Satori's default face.
 */
let fontCache: { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[] | null =
  null;

function fonts() {
  if (fontCache) return fontCache;
  try {
    const dir = path.join(process.cwd(), 'assets', 'fonts');
    const read = (f: string) => {
      const b = fs.readFileSync(path.join(dir, f));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    };
    fontCache = [
      { name: 'JetBrains Mono', data: read('JetBrainsMono-Regular.ttf'), weight: 400, style: 'normal' },
      { name: 'JetBrains Mono', data: read('JetBrainsMono-Bold.ttf'), weight: 700, style: 'normal' },
    ];
  } catch {
    fontCache = [];
  }
  return fontCache;
}

function imageOpts() {
  const f = fonts();
  return {
    width: W,
    height: H,
    headers: { 'cache-control': 'public, max-age=86400, immutable' },
    ...(f.length ? { fonts: f } : {}),
  };
}

/** The brand glyph. Plain paths only — Satori has no defs or gradients. */
function Glyph({ size }: { size: number }) {
  return (
    <svg viewBox={MARK_VIEWBOX} width={size} height={size}>
      {MARK_R.map((d) => (
        <path key={d} d={d} fill={ACID} />
      ))}
      <path d={MARK_SEAR} fill={INK} />
    </svg>
  );
}

function Signature({ size = 28 }: { size?: number }) {
  return (
    <div style={row({ alignItems: 'center' })}>
      <Glyph size={size} />
      <div style={row({ fontSize: 20, color: MUTE, marginLeft: 12, letterSpacing: 1 })}>
        {WORDMARK}
      </div>
    </div>
  );
}

function Rule({ color = LINE, height = 1 }: { color?: string; height?: number }) {
  return <div style={row({ width: '100%', height, backgroundColor: color })} />;
}

function Fallback() {
  return (
    <div
      style={col({
        width: '100%',
        height: '100%',
        backgroundColor: INK,
        color: CHALK,
        padding: 64,
        justifyContent: 'center',
      })}
    >
      <div style={row({ alignItems: 'center' })}>
        <Glyph size={64} />
        <div style={row({ fontSize: 26, color: MUTE, marginLeft: 20, letterSpacing: 2 })}>
          {WORDMARK}
        </div>
      </div>
      <div
        style={row({
          fontSize: 68,
          fontWeight: 700,
          letterSpacing: -3,
          marginTop: 34,
          lineHeight: 1.08,
        })}
      >
        Score your landing page out of 100.
      </div>
      <div style={row({ marginTop: 28, fontSize: 25, color: MUTE })}>
        Paste a URL. We roast it, score it, and hand you the rewrite.
      </div>
    </div>
  );
}

function Card({ r, mark }: { r: RoastResult; mark: string | null }) {
  const b = band(r.score.overall);
  const quote = teaser({ ...r, verdict: '' }, 112) || teaser(r, 112);

  return (
    <div
      style={col({
        width: '100%',
        height: '100%',
        backgroundColor: INK,
        color: CHALK,
      })}
    >
      <div style={row({ width: '100%', height: 6, backgroundColor: b.hex })} />

      {/* identity bar */}
      <div
        style={row({
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 44px',
        })}
      >
        <div style={row({ alignItems: 'center' })}>
          {mark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mark} alt="" width={40} height={40} style={{ width: 40, height: 40 }} />
          ) : (
            <div
              style={row({
                width: 40,
                height: 40,
                border: `1px solid ${LINE}`,
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                color: MUTE,
              })}
            >
              {(r.siteName.charAt(0) || '?').toUpperCase()}
            </div>
          )}
          <div style={col({ marginLeft: 16 })}>
            <div style={row({ fontSize: 27, fontWeight: 700 })}>{clampText(r.siteName, 24)}</div>
            <div style={row({ fontSize: 19, color: MUTE, marginTop: 2 })}>
              {clampText(r.displayUrl, 40)}
            </div>
          </div>
        </div>
        <Signature />
      </div>

      <Rule />

      {/* the number and the verdict */}
      <div style={row({ padding: '24px 44px', alignItems: 'center' })}>
        <div style={col({ width: 230, flexShrink: 0 })}>
          <div
            style={row({
              fontSize: 128,
              fontWeight: 700,
              color: b.hex,
              lineHeight: 1,
              letterSpacing: -8,
            })}
          >
            {r.score.overall}
          </div>
          <div style={row({ fontSize: 18, color: MUTE, marginTop: 10, letterSpacing: 3 })}>
            / 100
          </div>
        </div>
        <div style={col({ flex: 1, marginLeft: 20 })}>
          <div style={row({ fontSize: 19, fontWeight: 700, color: b.hex, letterSpacing: 3.5 })}>
            {temperature(r.score.overall)}
          </div>
          <div
            style={row({
              fontSize: 40,
              fontWeight: 700,
              lineHeight: 1.18,
              marginTop: 14,
              letterSpacing: -1.4,
            })}
          >
            {clampText(r.verdict, 100)}
          </div>
        </div>
      </div>

      <Rule />

      {/* the rubric */}
      <div style={row({ width: '100%' })}>
        {r.score.subs.map((s, i) => (
          <div
            key={s.key}
            style={col({
              flex: 1,
              padding: '13px 0 15px 20px',
              borderLeft: i === 0 ? 'none' : `1px solid ${LINE}`,
            })}
          >
            <div style={row({ fontSize: 14, color: MUTE, letterSpacing: 2.2 })}>
              {s.label.toUpperCase()}
            </div>
            <div
              style={row({
                fontSize: 32,
                fontWeight: 700,
                color: band(s.score).hex,
                marginTop: 6,
              })}
            >
              {s.score}
            </div>
          </div>
        ))}
      </div>

      <Rule />

      {/* the line worth quoting */}
      <div style={row({ padding: '16px 44px', alignItems: 'flex-start' })}>
        <div style={row({ fontSize: 24, fontWeight: 700, color: b.hex, marginRight: 14 })}>
          &gt;
        </div>
        <div style={row({ fontSize: 23, color: '#cfcfcf', lineHeight: 1.34 })}>
          {quoteWrap(quote)}
        </div>
      </div>

      <div style={row({ marginTop: 'auto' })}>
        <Rule />
      </div>

      {/* before -> after */}
      <div style={row({ width: '100%' })}>
        <div style={col({ flex: 1, padding: '14px 24px 16px 44px' })}>
          <div style={row({ fontSize: 14, color: '#ff4b3e', letterSpacing: 2.2 })}>BEFORE</div>
          <div style={row({ fontSize: 20, color: MUTE, marginTop: 8, lineHeight: 1.3 })}>
            {clampText(r.before.headline, 58)}
          </div>
        </div>
        <div style={row({ width: 1, backgroundColor: LINE })} />
        <div style={col({ flex: 1, padding: '14px 44px 16px 24px' })}>
          <div style={row({ fontSize: 14, color: ACID, letterSpacing: 2.2 })}>AFTER</div>
          <div
            style={row({ fontSize: 22, fontWeight: 700, marginTop: 8, lineHeight: 1.3 })}
          >
            {clampText(r.after.headline, 58)}
          </div>
        </div>
      </div>
    </div>
  );
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const r = isValidId(id) ? getCached(id) : null;

  if (!r) return new ImageResponse(<Fallback />, imageOpts());

  // Never let the icon fetch decide whether the preview renders at all.
  const mark = await faviconDataUri(r.favicon).catch(() => null);

  try {
    return new ImageResponse(<Card r={r} mark={mark} />, imageOpts());
  } catch (err) {
    // A broken preview would silently kill the share loop; a plain card is
    // always better than an error response.
    console.error('[og] render failed', err);
    return new ImageResponse(<Fallback />, imageOpts());
  }
}
