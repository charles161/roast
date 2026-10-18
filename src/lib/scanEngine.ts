/* ─────────────────────────────────────────────────────────────────────────────
   ROAST LENS — a page being scanned, in plain Canvas 2D.

   A faithful TypeScript port of the owner-approved mockup engine (type-A.html /
   _src/lens.js). No dependencies, no WebGL, no blur: one wireframe "landing page"
   floats in perspective, swings slowly on a turntable, and a laser sheet sweeps
   down it. Blocks flash as the beam crosses them, then settle into the verdict
   colour (rough / mid / sharp) and drop a rubric callout. NO fabricated scores or
   numbers are ever shown — only the rubric category names (HERO / SPECIFICS /
   PROOF / CRAFT / CTA) and their qualitative verdict word.

   Everything rendered is a pure function of time, so the reduced-motion frame is
   just one render() call with no loop.

     const lens = mountLens(canvas, { mode: 'ambient' | 'scanning' });
     lens.setMode('scanning');   // loading visual
     lens.freeze(true);          // static frame (reduced-motion)
     lens.destroy();             // cancelAnimationFrame + remove every listener
   ───────────────────────────────────────────────────────────────────────────── */

export type LensMode = 'ambient' | 'scanning';

export interface LensOptions {
  mode?: LensMode;
  /** Canvas text font stack. Defaults to the JetBrains Mono stack. */
  font?: string;
  /** Explicit frozen time in seconds (screenshots / deterministic frames). */
  freezeT?: number;
}

export interface LensController {
  setMode(mode: LensMode): void;
  freeze(on: boolean): void;
  replay(): void;
  readonly mode: LensMode;
  destroy(): void;
  /** Test hook: average ms/frame of draw() over n frames. */
  bench(n: number): number;
}

type RGB = [number, number, number];
type Verdict = [RGB, string, string];
interface ModeCfg {
  P: number;
  sweep: number;
  hold: number;
  tau: number;
  beam: number;
  swing: number;
  sparks: number;
}

/* ── palette ──────────────────────────────────────────────────────────────── */
const ACID: RGB = [204, 255, 63];
const ROUGH: RGB = [255, 75, 62];
const MID: RGB = [255, 176, 32];
const CHALK: RGB = [237, 237, 237];
const FLASH: RGB = [236, 255, 168];

export const VERDICT: Record<string, Verdict> = {
  hero: [ROUGH, 'ROUGH', 'HERO'],
  specifics: [MID, 'MID', 'SPECIFICS'],
  proof: [ROUGH, 'ROUGH', 'PROOF'],
  craft: [ACID, 'SHARP', 'CRAFT'],
  cta: [MID, 'MID', 'CTA'],
};

export const MODES: Record<LensMode, ModeCfg> = {
  // hero ambient: slow, quiet, long rests between passes
  ambient: { P: 8.0, sweep: 4.4, hold: 1.1, tau: 1.5, beam: 0.85, swing: 1.0, sparks: 10 },
  // loading: back-to-back passes, colours persist so the page "fills in"
  scanning: { P: 4.6, sweep: 3.6, hold: 3.4, tau: 2.2, beam: 1.0, swing: 1.55, sparks: 18 },
};

export const LENS_W = 300;
export const LENS_H = 520;
export const LENS_PAD = 34;
const D = 900;
const STATIC_POSE_T = 1.15;
const STATIC_PHASE = 2.15; // reduced-motion frame

/* ── pure helpers (unit-tested) ─────────────────────────────────────────────── */
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rgba(c: RGB, a: number): string {
  return (
    'rgba(' +
    (c[0] | 0) +
    ',' +
    (c[1] | 0) +
    ',' +
    (c[2] | 0) +
    ',' +
    (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) +
    ')'
  );
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function easeOut(t: number): number {
  t = 1 - clamp(t, 0, 1);
  return 1 - t * t * t;
}

export function hash(v: number): number {
  v = Math.sin(v * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Centred page-space Y of the laser for sweep progress u (0..1); -1 off = top. */
export function beamY(u: number, h = LENS_H, pad = LENS_PAD): number {
  return u < 0 ? 0 : -pad + (h + pad * 2) * u - h / 2;
}

/** Which lens mode a given loading state maps to. */
export function lensModeForLoading(loading: boolean): LensMode {
  return loading ? 'scanning' : 'ambient';
}

/* ── the page, as blocks (built once, pure) ─────────────────────────────────── */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  d: number;
  g: string | null;
  tag: boolean | 'left';
  frame?: boolean;
  cx: number;
  cy: number;
  f: number;
  fd: number;
  delay: number;
  v: Verdict | null;
  sz: number[];
  sx: number[];
  sy: number[];
  e: number;
  depth: number;
}

const BOXES: Box[] = [];
function B(
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  d: number,
  g?: string | null,
  tag?: boolean | 'left',
): void {
  BOXES.push({
    x,
    y,
    w,
    h,
    z,
    d,
    g: g || null,
    tag: tag === 'left' ? 'left' : !!tag,
    cx: 0,
    cy: 0,
    f: 0,
    fd: 0,
    delay: 0,
    v: null,
    sz: [],
    sx: [],
    sy: [],
    e: 1,
    depth: 0,
  });
}
B(0, 0, LENS_W, LENS_H, -9, 9, null); // slab
BOXES[0].frame = true;
B(0, 0, LENS_W, 24, 0, 3, null); // chrome bar
B(10, 9, 6, 6, 3, 2);
B(20, 9, 6, 6, 3, 2);
B(30, 9, 6, 6, 3, 2);
B(52, 6, 190, 12, 3, 3); // url pill
B(18, 38, 28, 12, 8, 6, 'craft'); // logo
B(128, 42, 24, 4, 4, 2);
B(160, 42, 24, 4, 4, 2);
B(192, 42, 24, 4, 4, 2);
B(236, 35, 48, 17, 12, 6, 'cta'); // nav button
B(20, 84, 206, 18, 30, 10, 'hero'); // headline
B(20, 108, 252, 18, 30, 10, 'hero', true);
B(20, 132, 138, 18, 30, 10, 'hero');
B(20, 164, 226, 5, 14, 3, 'specifics'); // subhead
B(20, 175, 192, 5, 14, 3, 'specifics');
B(20, 186, 146, 5, 14, 3, 'specifics');
B(20, 208, 86, 24, 40, 12, 'cta', true); // primary button
B(114, 208, 64, 24, 18, 5, 'cta'); // secondary button
B(20, 254, 260, 96, 22, 14, 'craft', true); // product shot
B(32, 266, 72, 72, 42, 6, 'craft');
B(114, 268, 154, 9, 38, 4, 'craft');
B(114, 286, 118, 6, 38, 4, 'craft');
B(114, 300, 136, 6, 38, 4, 'craft');
for (let i = 0; i < 5; i++) B(20 + i * 52, 370, 40, 12, 12, 4, 'proof', i === 2); // logo strip
for (let c = 0; c < 3; c++) {
  // feature cards
  B(20 + c * 90, 400, 80, 72, 20, 8, 'specifics', c === 0 ? 'left' : false);
  B(30 + c * 90, 412, 36, 6, 34, 3, 'specifics');
  B(30 + c * 90, 426, 58, 4, 30, 2, 'specifics');
}
B(20, 492, 70, 4, 6, 2);
B(120, 492, 54, 4, 6, 2);
B(210, 492, 62, 4, 6, 2);

const N = BOXES.length;
for (let n = 0; n < N; n++) {
  const b = BOXES[n];
  b.cx = b.x + b.w / 2 - LENS_W / 2;
  b.cy = b.y + b.h / 2 - LENS_H / 2;
  b.f = (b.y + LENS_PAD) / (LENS_H + LENS_PAD * 2); // when the beam reaches the top edge
  b.fd = b.h / (LENS_H + LENS_PAD * 2); // how long the beam is inside
  b.delay = (b.y / LENS_H) * 1.1 + (n % 5) * 0.035; // entrance stagger, top-down
  b.v = b.g ? VERDICT[b.g] : null;
}

/* dot lattice that rises as the beam passes — only in the margins */
const DOTS: Array<[number, number, number]> = [];
for (let gy = 8; gy < LENS_H; gy += 13) {
  for (let gx = 8; gx < LENS_W; gx += 13) {
    let hit = false;
    for (let k = 1; k < N; k++) {
      const q = BOXES[k];
      if (gx > q.x - 5 && gx < q.x + q.w + 5 && gy > q.y - 5 && gy < q.y + q.h + 5) {
        hit = true;
        break;
      }
    }
    if (!hit) DOTS.push([gx - LENS_W / 2, gy - LENS_H / 2, gy]);
  }
}

/* depth dust */
const DUST: Array<[number, number, number, number]> = [];
for (let m = 0; m < 90; m++) {
  DUST.push([
    (hash(m) - 0.5) * 700,
    (hash(m + 91) - 0.5) * 700,
    (hash(m + 187) - 0.3) * 420,
    hash(m + 33),
  ]);
}

const EDGES: Array<[number, number]> = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];
const BACK = [0, 1, 2, 3];
const FRONT = [4, 5, 6, 7];
const LINKS = [8, 9, 10, 11];

function hull(px: number[], py: number[]): number[] {
  // monotone chain over 8 projected corners -> index list
  const idx = [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => px[a] - px[b] || py[a] - py[b]);
  const cr = (o: number, a: number, b: number) =>
    (px[a] - px[o]) * (py[b] - py[o]) - (py[a] - py[o]) * (px[b] - px[o]);
  const lo: number[] = [];
  const up: number[] = [];
  let i: number;
  for (i = 0; i < 8; i++) {
    while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], idx[i]) <= 0) lo.pop();
    lo.push(idx[i]);
  }
  for (i = 7; i >= 0; i--) {
    while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], idx[i]) <= 0) up.pop();
    up.push(idx[i]);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

/** CanvasRenderingContext2D plus the letterSpacing property (not in every lib.dom). */
type Ctx2D = CanvasRenderingContext2D & { letterSpacing?: string };

export function mountLens(canvas: HTMLCanvasElement, opts: LensOptions = {}): LensController {
  const root: Window & typeof globalThis = window;
  const ctx = canvas.getContext('2d') as Ctx2D | null;
  const FONT = opts.font || '"JetBrains Mono", ui-monospace, monospace';
  let mode: LensMode = opts.mode === 'scanning' ? 'scanning' : 'ambient';
  const frozen: number | null = typeof opts.freezeT === 'number' ? opts.freezeT : null;
  let forcedStatic = false;
  const mq = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let alive = true;
  let onScreen = true;
  let t0 = performance.now() / 1000;
  let modeT0 = 0.9;
  let fadeT0 = -9;
  let cY = 0;
  let sY = 0;
  let cP = 0;
  let sP = 0;
  let F = 0;
  let CX = 0;
  let CY = 0;
  let S = 0;
  let px = 0;
  let py = 0;
  let pz = 0;
  const hasLS = !!ctx && 'letterSpacing' in ctx;
  let yaw = 0;
  let pitch = 0;

  // Nothing renders without a 2D context (e.g. a stubbed canvas). Return a
  // no-op controller so the caller's teardown path is always safe.
  if (!ctx) {
    return {
      setMode() {},
      freeze() {},
      replay() {},
      get mode() {
        return mode;
      },
      destroy() {},
      bench() {
        return 0;
      },
    };
  }

  function reduced(): boolean {
    return forcedStatic || !!(mq && mq.matches);
  }

  function resize(): void {
    const r = canvas.getBoundingClientRect();
    w = Math.max(2, r.width);
    h = Math.max(2, r.height);
    dpr = Math.min(root.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.min(h / (LENS_H * 1.26), w / (LENS_W * 1.75));
    if (reduced() || frozen !== null) draw(nowT());
  }

  function nowT(): number {
    return frozen !== null ? frozen : performance.now() / 1000 - t0;
  }

  function P(x: number, y: number, z: number): void {
    const x1 = x * cY + z * sY;
    const z1 = -x * sY + z * cY;
    const y2 = y * cP - z1 * sP;
    const z2 = y * sP + z1 * cP;
    const k = F / (D - z2);
    px = CX + x1 * k;
    py = CY + y2 * k;
    pz = z2;
  }

  function text(
    s: string,
    x: number,
    y: number,
    col: string,
    size?: number,
    weight?: number,
    ls?: number,
    align?: CanvasTextAlign,
  ): void {
    ctx!.font = (weight || 500) + ' ' + (size || 10) + 'px ' + FONT;
    if (hasLS) ctx!.letterSpacing = (ls || 0) + 'px';
    ctx!.textAlign = align || 'left';
    ctx!.fillStyle = col;
    ctx!.fillText(s, x, y);
  }

  function draw(T: number): void {
    const cur = MODES[mode];
    const isStatic = reduced();
    const q = isStatic ? STATIC_PHASE : T - modeT0;
    const p = q < 0 ? -1 : q % cur.P;
    const cycle = q < 0 ? -1 : Math.floor(q / cur.P);
    const fade = isStatic ? 1 : clamp((T - fadeT0) / 0.6, 0, 1);
    const poseT = isStatic ? STATIC_POSE_T : T;
    const enterOn = !isStatic && T < 3.4;

    yaw = -0.7 + 0.24 * Math.sin(poseT * 0.23 * cur.swing);
    pitch = 0.2 + 0.05 * Math.sin(poseT * 0.17 * cur.swing + 1);
    cY = Math.cos(yaw);
    sY = Math.sin(yaw);
    cP = Math.cos(pitch);
    sP = Math.sin(pitch);
    S = S || 1;
    F = D * S * 1.0;
    CX = w * 0.5 + 8;
    CY = h * 0.5 - 12 + (isStatic ? 0 : Math.sin(T * 0.5) * 4);

    ctx!.clearRect(0, 0, w, h);

    const u = p >= 0 && p <= cur.sweep ? p / cur.sweep : -1; // beam progress 0..1
    const by = u < 0 ? 0 : -LENS_PAD + (LENS_H + LENS_PAD * 2) * u - LENS_H / 2; // centred page coords
    const env = u < 0 ? 0 : Math.min(1, u / 0.05, (1 - u) / 0.06) * cur.beam * fade;

    /* floor grid — a platform under the page */
    const fy = LENS_H / 2 + 44;
    let gi: number;
    let a: number;
    ctx!.lineWidth = 1;
    for (gi = -6; gi <= 6; gi++) {
      a = 0.11 * (1 - Math.abs(gi) / 7);
      ctx!.strokeStyle = rgba(CHALK, a);
      ctx!.beginPath();
      P(gi * 50, fy, -300);
      ctx!.moveTo(px, py);
      P(gi * 50, fy, 300);
      ctx!.lineTo(px, py);
      P(-300, fy, gi * 50);
      ctx!.moveTo(px, py);
      P(300, fy, gi * 50);
      ctx!.lineTo(px, py);
      ctx!.stroke();
    }

    /* dust */
    for (gi = 0; gi < DUST.length; gi++) {
      const d = DUST[gi];
      P(d[0], d[1] + Math.sin(T * 0.3 + d[3] * 6) * 5, d[2]);
      a =
        (0.1 + 0.3 * d[3]) *
        (0.55 + 0.45 * Math.sin(T * 0.8 + d[3] * 40)) *
        clamp((pz + 260) / 380, 0.25, 1);
      ctx!.fillStyle = rgba(CHALK, a);
      ctx!.fillRect(px, py, 1.4, 1.4);
    }

    /* dot lattice — base layer in one path, active band in tiers */
    const BAND = 64;
    const near: number[] = [];
    ctx!.fillStyle = rgba(CHALK, 0.14);
    ctx!.beginPath();
    for (gi = 0; gi < DOTS.length; gi++) {
      const dt = DOTS[gi];
      const dy = u < 0 ? 999 : dt[1] - by;
      if (dy > -BAND * 1.6 && dy < BAND * 0.7) {
        near.push(gi);
        continue;
      }
      P(dt[0], dt[1], 0);
      ctx!.rect(px - 0.7, py - 0.7, 1.4, 1.4);
    }
    ctx!.fill();
    for (gi = 0; gi < near.length; gi++) {
      const nd = DOTS[near[gi]];
      const ddy = nd[1] - by;
      const pk = Math.exp(-(ddy * ddy) / (2 * 15 * 15));
      const tail = ddy < 0 ? Math.exp(ddy / 58) * 0.35 : 0;
      const k2 = Math.min(1, pk + tail) * env;
      P(nd[0], nd[1], 15 * pk * env);
      const sz = 1.4 + 1.6 * pk * env;
      ctx!.fillStyle = rgba(k2 > 0.5 ? FLASH : ACID, 0.1 + 0.9 * k2);
      ctx!.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    }

    /* scan trail painted on the page plane, under the blocks */
    if (env > 0.01) {
      P(-LENS_W / 2, by - 78, 0);
      const ax = px;
      const ay = py;
      P(LENS_W / 2, by - 78, 0);
      const bx = px;
      const byy = py;
      P(LENS_W / 2, by, 0);
      const cx2 = px;
      const cy2 = py;
      P(-LENS_W / 2, by, 0);
      const dx2 = px;
      const dy2 = py;
      const g = ctx!.createLinearGradient(0, (ay + byy) / 2, 0, (cy2 + dy2) / 2);
      g.addColorStop(0, rgba(ACID, 0));
      g.addColorStop(1, rgba(ACID, 0.13 * env));
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.moveTo(ax, ay);
      ctx!.lineTo(bx, byy);
      ctx!.lineTo(cx2, cy2);
      ctx!.lineTo(dx2, dy2);
      ctx!.closePath();
      ctx!.fill();
    }

    /* blocks, painter-sorted */
    const order: Box[] = [];
    let bi: number;
    for (bi = 0; bi < N; bi++) {
      const bb = BOXES[bi];
      const e = enterOn ? easeOut((T - bb.delay) / 1.15) : 1;
      bb.e = e;
      P(bb.cx, bb.cy, (bb.z + bb.d / 2) * e);
      bb.depth = pz;
      order.push(bb);
    }
    order.sort((a1, b1) => a1.depth - b1.depth);

    const tags: Array<{ v: Verdict; a: number; ax: number; ay: number; lf: boolean }> = [];
    for (bi = 0; bi < N; bi++) {
      const bo = order[bi];
      const e2 = bo.e;
      if (e2 <= 0.003) continue;
      const x0 = bo.x - LENS_W / 2;
      const x1 = x0 + bo.w;
      const y0 = bo.y - LENS_H / 2;
      const y1 = y0 + bo.h;
      const z0 = bo.z * e2;
      const z1 = (bo.z + bo.d) * e2;
      for (let ci = 0; ci < 8; ci++) {
        P(ci & 1 ? x1 : x0, ci & 2 ? y1 : y0, ci & 4 ? z1 : z0);
        bo.sx[ci] = px;
        bo.sy[ci] = py;
        bo.sz[ci] = pz;
      }
      /* lit state — stateless: time since the beam crossed this block */
      let dtHit = -1;
      if (p >= 0) {
        const hi = bo.f * cur.sweep;
        if (p >= hi) dtHit = p - hi;
        else if (cycle > 0) dtHit = p + cur.P - hi;
      }
      let lit = 0;
      let flash = 0;
      if (dtHit >= 0 && !bo.frame) {
        const dur = bo.fd * cur.sweep;
        flash = dtHit <= dur ? 1 : Math.exp(-(dtHit - dur) / 0.4);
        lit = dtHit < cur.hold ? 1 : Math.exp(-(dtHit - cur.hold) / cur.tau);
        if (isStatic === false) {
          flash *= fade;
          lit *= fade;
        }
      }
      const depthK = 0.62 + 0.38 * clamp((bo.depth + 120) / 240, 0, 1);
      const vc = bo.v ? bo.v[0] : ACID;
      let col = mix(CHALK, vc, lit);
      col = mix(col, FLASH, flash * 0.75);
      const edgeA =
        (0.36 + 0.58 * Math.max(lit * (bo.v ? 0.95 : 0.55), flash)) *
        depthK *
        (enterOn ? clamp(e2 * 1.4, 0, 1) : 1);
      const ring = hull(bo.sx, bo.sy);

      ctx!.beginPath();
      ctx!.moveTo(bo.sx[ring[0]], bo.sy[ring[0]]);
      for (let ri = 1; ri < ring.length; ri++) ctx!.lineTo(bo.sx[ring[ri]], bo.sy[ring[ri]]);
      ctx!.closePath();
      ctx!.fillStyle = 'rgba(10,10,10,0.9)';
      ctx!.fill();
      const big = bo.w * bo.h > 9000 ? 0.4 : 1; // large blocks get a lighter wash
      const tint = 0.035 + (0.12 * lit * (bo.v ? 1 : 0.4) + 0.12 * flash) * big;
      ctx!.fillStyle = rgba(col, tint * (enterOn ? clamp(e2 * 1.4, 0, 1) : 1));
      ctx!.fill();

      const sets = [BACK, LINKS, FRONT];
      const mul = [0.5, 0.65, 1];
      let si: number;
      let ei: number;
      for (si = 0; si < 3; si++) {
        ctx!.strokeStyle = rgba(col, edgeA * mul[si]);
        ctx!.lineWidth = si === 2 ? 1 : 0.8;
        ctx!.beginPath();
        for (ei = 0; ei < 4; ei++) {
          const ed = EDGES[sets[si][ei]];
          ctx!.moveTo(bo.sx[ed[0]], bo.sy[ed[0]]);
          ctx!.lineTo(bo.sx[ed[1]], bo.sy[ed[1]]);
        }
        ctx!.stroke();
      }
      if (bo.tag && lit > 0.04 && bo.v) {
        const lf = bo.tag === 'left';
        tags.push({
          v: bo.v,
          a: Math.min(1, lit * 1.4),
          ax: bo.sx[lf ? 4 : 5],
          ay: bo.sy[lf ? 4 : 5],
          lf,
        });
      }
    }

    /* callouts: blueprint-style elbows, label on top of the run */
    for (let ti = 0; ti < tags.length; ti++) {
      const tg = tags[ti];
      const label = tg.v[2] + '  ';
      const verdict = tg.v[1];
      ctx!.font = '600 10px ' + FONT;
      if (hasLS) ctx!.letterSpacing = '1.4px';
      const tw = ctx!.measureText(label + verdict).width;
      const dir = tg.lf || tg.ax + 16 + tw + 30 > w - 20 ? -1 : 1;
      const ex = tg.ax + dir * 14;
      const ey = tg.ay - 14;
      const rx = ex + dir * (tw + 8);
      ctx!.strokeStyle = rgba(tg.v[0], tg.a * 0.9);
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(tg.ax, tg.ay);
      ctx!.lineTo(ex, ey);
      ctx!.lineTo(rx, ey);
      ctx!.stroke();
      ctx!.fillStyle = rgba(tg.v[0], tg.a);
      ctx!.fillRect(tg.ax - 1.5, tg.ay - 1.5, 3, 3);
      const tx = dir === 1 ? ex + 3 : rx + 3;
      const ty = ey - 5;
      text(label, tx, ty, rgba(CHALK, tg.a * 0.85), 10, 600, 1.4);
      const lw = ctx!.measureText(label).width;
      text(verdict, tx + lw, ty, rgba(tg.v[0], tg.a), 10, 700, 1.4);
    }

    /* the laser sheet: a quad lying across the page, bright near edge */
    if (env > 0.01) {
      const ex0 = -LENS_W / 2 - 28;
      const ex1 = LENS_W / 2 + 28;
      const zb = -14;
      const zf = 62;
      P(ex0, by, zb);
      const q0x = px;
      const q0y = py;
      P(ex1, by, zb);
      const q1x = px;
      const q1y = py;
      P(ex1, by, zf);
      const q2x = px;
      const q2y = py;
      P(ex0, by, zf);
      const q3x = px;
      const q3y = py;
      ctx!.fillStyle = rgba(ACID, 0.07 * env);
      ctx!.beginPath();
      ctx!.moveTo(q0x, q0y);
      ctx!.lineTo(q1x, q1y);
      ctx!.lineTo(q2x, q2y);
      ctx!.lineTo(q3x, q3y);
      ctx!.closePath();
      ctx!.fill();
      ctx!.strokeStyle = rgba(ACID, 0.35 * env);
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(q0x, q0y);
      ctx!.lineTo(q1x, q1y);
      ctx!.stroke();
      ctx!.strokeStyle = rgba(FLASH, 0.95 * env);
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      ctx!.moveTo(q3x, q3y);
      ctx!.lineTo(q2x, q2y);
      ctx!.stroke();
      ctx!.strokeStyle = rgba(ACID, 0.5 * env);
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(q0x, q0y);
      ctx!.lineTo(q3x, q3y);
      ctx!.moveTo(q1x, q1y);
      ctx!.lineTo(q2x, q2y);
      ctx!.stroke();
      /* sparks shed behind the beam */
      for (let sp = 0; sp < cur.sparks; sp++) {
        const life = (T * 1.7 + sp * 0.37) % 1;
        const kk = Math.floor(T * 1.7 + sp * 0.37);
        const sx_ = (hash(sp * 7.3 + kk * 1.7) - 0.5) * (LENS_W + 30);
        const sz_ = hash(sp * 3.1 + kk * 5.3) * 60 - 6;
        P(sx_, by - life * 34, sz_);
        ctx!.fillStyle = rgba(life < 0.2 ? FLASH : ACID, (1 - life) * 0.9 * env);
        ctx!.fillRect(px - 1, py - 1, 2, 2);
      }
    }

    hud(T, p, u, by, env, cur, isStatic);
  }

  function hud(
    T: number,
    p: number,
    u: number,
    by: number,
    env: number,
    cur: ModeCfg,
    isStatic: boolean,
  ): void {
    const inset = 14;
    const L = 12;
    const edge = rgba(CHALK, 0.26);
    let i: number;
    ctx!.strokeStyle = edge;
    ctx!.lineWidth = 1;
    ctx!.beginPath();
    ctx!.moveTo(inset, inset + L);
    ctx!.lineTo(inset, inset);
    ctx!.lineTo(inset + L, inset);
    ctx!.moveTo(w - inset - L, inset);
    ctx!.lineTo(w - inset, inset);
    ctx!.lineTo(w - inset, inset + L);
    ctx!.moveTo(inset, h - inset - L);
    ctx!.lineTo(inset, h - inset);
    ctx!.lineTo(inset + L, h - inset);
    ctx!.moveTo(w - inset - L, h - inset);
    ctx!.lineTo(w - inset, h - inset);
    ctx!.lineTo(w - inset, h - inset - L);
    ctx!.stroke();

    /* ruler down the left edge, marker rides the beam */
    const r0 = 58;
    const r1 = h - 58;
    ctx!.strokeStyle = rgba(CHALK, 0.14);
    ctx!.beginPath();
    let y: number;
    for (i = 0, y = r0; y <= r1; i++, y += 11) {
      ctx!.moveTo(inset, y);
      ctx!.lineTo(inset + (i % 5 === 0 ? 9 : 4), y);
    }
    ctx!.stroke();
    if (u >= 0) {
      P(-LENS_W / 2, by, 0);
      const my = clamp(py, r0, r1);
      const pageY = Math.round(clamp(u, 0, 1) * LENS_H);
      ctx!.fillStyle = rgba(ACID, 0.95 * Math.max(env, 0.35));
      ctx!.fillRect(inset, my - 0.5, 20, 1.2);
      ctx!.beginPath();
      ctx!.moveTo(inset + 22, my - 3);
      ctx!.lineTo(inset + 22, my + 3);
      ctx!.lineTo(inset + 27, my);
      ctx!.closePath();
      ctx!.fill();
      const label = 'Y ' + ('000' + pageY).slice(-4);
      text(label, inset + 32, my + 3.5, rgba(ACID, 0.9 * Math.max(env, 0.4)), 10, 600, 1.2);
    }

    const blink = isStatic || frozen !== null || Math.floor(T * 1.6) % 2 === 0;
    ctx!.fillStyle = rgba(ACID, blink ? 1 : 0.25);
    ctx!.fillRect(inset + 2, 29, 6, 6);
    const title = mode === 'scanning' ? 'LENS  /  SCANNING' : 'LENS  /  LIVE';
    text(
      title,
      inset + 16,
      35,
      rgba(mode === 'scanning' ? ACID : CHALK, mode === 'scanning' ? 0.95 : 0.5),
      10,
      600,
      1.6,
    );

    const yd = Math.round(yaw * 57.2958);
    const pd = Math.round(pitch * 57.2958);
    text(
      'YAW ' +
        (yd < 0 ? '-' : '+') +
        ('0' + Math.abs(yd)).slice(-2) +
        '°   PITCH +' +
        ('0' + pd).slice(-2) +
        '°',
      w - inset - 2,
      h - inset - 12,
      rgba(CHALK, 0.34),
      10,
      500,
      1.4,
      'right',
    );
    let foot: string;
    if (mode === 'scanning') {
      const pct = u < 0 ? (p < 0 ? 0 : 100) : Math.round(u * 100);
      foot =
        'PASS ' +
        ('0' + (isStatic ? 1 : Math.max(1, Math.floor((T - modeT0) / cur.P) + 1))).slice(-2) +
        '   ' +
        ('00' + pct).slice(-3) +
        '%';
    } else foot = 'HERO  SPECIFICS  PROOF  CRAFT  CTA';
    text(
      foot,
      inset + 2,
      h - inset - 12,
      rgba(mode === 'scanning' ? ACID : CHALK, mode === 'scanning' ? 0.85 : 0.34),
      10,
      500,
      1.4,
    );
    ctx!.textAlign = 'left';
  }

  /* ── loop ───────────────────────────────────────────────────────────────── */
  function tick(): void {
    raf = 0;
    if (!alive) return;
    if (reduced() || frozen !== null || !onScreen || (root.document && root.document.hidden)) return;
    draw(nowT());
    raf = requestAnimationFrame(tick);
  }
  function kick(): void {
    if (raf || !alive) return;
    if (reduced() || frozen !== null) {
      draw(nowT());
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  const onResize = () => {
    resize();
    kick();
  };
  const ro = root.ResizeObserver ? new ResizeObserver(onResize) : null;
  if (ro) ro.observe(canvas);
  else root.addEventListener('resize', onResize);
  const io = root.IntersectionObserver
    ? new IntersectionObserver((en) => {
        onScreen = en[0].isIntersecting;
        if (onScreen) kick();
      })
    : null;
  if (io) io.observe(canvas);
  const vis = () => {
    if (!root.document.hidden) kick();
  };
  root.document.addEventListener('visibilitychange', vis);
  const rmChange = () => kick();
  if (mq && mq.addEventListener) mq.addEventListener('change', rmChange);

  resize();
  if (root.document.fonts && root.document.fonts.load) {
    root.document.fonts.load('600 10px ' + FONT).then(() => {
      if (reduced() || frozen !== null) draw(nowT());
    });
  }
  kick();

  return {
    setMode(m: LensMode): void {
      if (!MODES[m] || m === mode) return;
      mode = m;
      const T = nowT();
      modeT0 = T + 0.15;
      fadeT0 = T;
      if (reduced() || frozen !== null) draw(T);
      else kick();
    },
    freeze(on: boolean): void {
      forcedStatic = !!on;
      if (on) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        draw(nowT());
      } else kick();
    },
    replay(): void {
      t0 = performance.now() / 1000;
      modeT0 = 0.9;
      fadeT0 = -9;
      kick();
    },
    get mode(): LensMode {
      return mode;
    },
    destroy(): void {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      else root.removeEventListener('resize', onResize);
      if (io) io.disconnect();
      root.document.removeEventListener('visibilitychange', vis);
      if (mq && mq.removeEventListener) mq.removeEventListener('change', rmChange);
    },
    bench(n: number): number {
      const s = performance.now();
      const T = 6;
      for (let i = 0; i < n; i++) draw(T + i * 0.016);
      return (performance.now() - s) / n;
    },
  };
}
