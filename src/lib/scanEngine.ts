/* ─────────────────────────────────────────────────────────────────────────────
   ROAST LENS — a page being scanned, in plain Canvas 2D.

   A dependency-free pseudo-3D engine (no WebGL, no blur). One wireframe
   "landing page" floats in perspective, drifts on a slow, gentle orbit, and a
   laser sheet sweeps down it. Blocks flash acid as the beam crosses them, then
   settle into the verdict colour (rough / mid / sharp) and reveal a rubric
   callout whose leader line draws itself in. When the sweep completes the whole
   page resolves with a soft pulse, then it loops. NO fabricated scores or
   numbers are ever shown — only the rubric category names (HERO / SPECIFICS /
   PROOF / CRAFT / CTA) and their qualitative verdict word.

   Rendering order is a true back-to-front painter's pass: the background board
   is painted first as the backdrop, then every page block is depth-sorted and
   painted over it, so no element is ever occluded or culled at any angle.

   Everything rendered is a pure function of time, so the reduced-motion frame is
   just one render() call with no loop — a fully-graded, resolved still.

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

/* Reduced-motion still: a calm, fully-graded pose. */
const STATIC_YAW = -0.3;
const STATIC_PITCH = 0.12;

/* Calm oscillating orbit. Base angle + a gentle, detuned two-wave drift so the
   motion reads organic and expensive rather than a rigid metronome. Kept small
   so the page stays legible and face-on. */
const YAW_BASE = -0.33;
const YAW_AMP = 0.17;
const PITCH_BASE = 0.12;
const PITCH_AMP = 0.05;
const ORBIT_W = 0.35; // rad/s of the primary sway (ambient); ~18s period

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

/** Symmetric ease-in-out (smoothstep-like), used for callout reveals. */
export function easeInOut(t: number): number {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
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

/**
 * Depth (camera-space z) of a page-space point after the yaw→pitch rotation —
 * the exact quantity the renderer sorts on. Larger is nearer the camera. Pure
 * and unit-tested so the painter's-order guarantee can be proven at every angle.
 */
export function projectZ(x: number, y: number, z: number, yaw: number, pitch: number): number {
  const cY = Math.cos(yaw);
  const sY = Math.sin(yaw);
  const cP = Math.cos(pitch);
  const sP = Math.sin(pitch);
  const z1 = -x * sY + z * cY;
  return y * sP + z1 * cP;
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

/** Number of drawable boxes in the scene (background board + page blocks). */
export const BOX_COUNT = N;

/**
 * Each box's depth-sort centroid in page space: [cx, cy, z + d/2]. Exposed so a
 * test can reconstruct the exact quantity `paintOrder` sorts on and prove the
 * back-to-front ordering holds at every camera angle.
 */
export const BOX_CENTROIDS: Array<[number, number, number]> = BOXES.map((b) => [
  b.cx,
  b.cy,
  b.z + b.d / 2,
]);

/* The board (frame) boxes are the backdrop — always painted first. Everything
   else sits at z >= 0 (on or in front of the board face) and is depth-sorted. */
const BACKDROP: Box[] = BOXES.filter((b) => b.frame);
const DRAW_ORDER: Box[] = BOXES.filter((b) => !b.frame);

/**
 * Back-to-front paint order of every box at a given camera pose: backdrop
 * boards first, then the remaining blocks by ascending centroid depth. Returns
 * indices into the scene. Pure (steady-state scale), so a test can sweep every
 * angle and assert nothing is dropped and nothing sorts in front of the board.
 */
export function paintOrder(yaw: number, pitch: number): number[] {
  const back: number[] = [];
  const front: number[] = [];
  for (let i = 0; i < N; i++) {
    const b = BOXES[i];
    if (b.frame) back.push(i);
    else front.push(i);
  }
  front.sort(
    (a, b) =>
      projectZ(BOXES[a].cx, BOXES[a].cy, BOXES[a].z + BOXES[a].d / 2, yaw, pitch) -
      projectZ(BOXES[b].cx, BOXES[b].cy, BOXES[b].z + BOXES[b].d / 2, yaw, pitch),
  );
  return back.concat(front);
}

/* dot lattice that rises as the beam passes — only in the margins */
const DOTS: Array<[number, number, number]> = [];
for (let gy = 8; gy < LENS_H; gy += 14) {
  for (let gx = 8; gx < LENS_W; gx += 14) {
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

/* depth dust — sparse ambient motes */
const DUST: Array<[number, number, number, number]> = [];
for (let m = 0; m < 56; m++) {
  DUST.push([
    (hash(m) - 0.5) * 760,
    (hash(m + 91) - 0.5) * 760,
    (hash(m + 187) - 0.3) * 440,
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
const EDGE_SETS = [BACK, LINKS, FRONT];
const EDGE_MUL = [0.5, 0.65, 1];

/* ── non-allocating convex hull over 8 projected corners ────────────────────── */
const _o8: number[] = [0, 1, 2, 3, 4, 5, 6, 7];
const _lo: number[] = new Array(10);
const _up: number[] = new Array(10);
const _ring: number[] = new Array(10);
let _spx: number[] = [];
let _spy: number[] = [];
function _cmp8(a: number, b: number): number {
  return _spx[a] - _spx[b] || _spy[a] - _spy[b];
}
function _cross(o: number, a: number, b: number): number {
  return (_spx[a] - _spx[o]) * (_spy[b] - _spy[o]) - (_spy[a] - _spy[o]) * (_spx[b] - _spx[o]);
}
/** Monotone-chain hull of the 8 corners -> fills `_ring`, returns its length. */
function hullInto(px: number[], py: number[]): number {
  _spx = px;
  _spy = py;
  for (let i = 0; i < 8; i++) _o8[i] = i;
  _o8.sort(_cmp8);
  let ln = 0;
  let un = 0;
  let i: number;
  for (i = 0; i < 8; i++) {
    while (ln > 1 && _cross(_lo[ln - 2], _lo[ln - 1], _o8[i]) <= 0) ln--;
    _lo[ln++] = _o8[i];
  }
  for (i = 7; i >= 0; i--) {
    while (un > 1 && _cross(_up[un - 2], _up[un - 1], _o8[i]) <= 0) un--;
    _up[un++] = _o8[i];
  }
  let n = 0;
  for (i = 0; i < ln - 1; i++) _ring[n++] = _lo[i];
  for (i = 0; i < un - 1; i++) _ring[n++] = _up[i];
  return n;
}
function _depthCmp(a: Box, b: Box): number {
  return a.depth - b.depth;
}

/** Pre-allocated callout records (reused every frame — no hot-loop garbage). */
interface Tag {
  v: Verdict;
  a: number;
  reveal: number;
  ax: number;
  ay: number;
  lf: boolean;
}
const TAGS: Tag[] = [];
for (let i = 0; i < N; i++) TAGS.push({ v: VERDICT.hero, a: 0, reveal: 0, ax: 0, ay: 0, lf: false });

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
  let F = 0;
  let CX = 0;
  let CY = 0;
  let S = 0;
  let cY = 1;
  let sY = 0;
  let cP = 1;
  let sP = 0;
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
    // DPR-aware backing store so every 1px line is crisp on retina.
    dpr = Math.min(root.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.min(h / (LENS_H * 1.34), w / (LENS_W * 1.82));
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

  /** Shrink letter-spacing then size until `s` fits `maxW`; returns [size, ls]. */
  function fitFont(s: string, maxW: number, size0: number, weight: number, ls0: number): [number, number] {
    let size = size0;
    let ls = ls0;
    for (let guard = 0; guard < 40; guard++) {
      ctx!.font = weight + ' ' + size + 'px ' + FONT;
      if (hasLS) ctx!.letterSpacing = ls + 'px';
      if (ctx!.measureText(s).width <= maxW) break;
      if (ls > 0) ls = Math.max(0, ls - 0.4);
      else if (size > 8) size -= 0.5;
      else break;
    }
    return [size, ls];
  }

  /* frame-state (set each draw, read by drawBox) */
  let _cur: ModeCfg = MODES[mode];
  let _p = -1;
  let _cycle = -1;
  let _env = 0;
  let _fade = 1;
  let _enterOn = false;
  let _isStatic = false;
  let _resolve = 0;
  let _T = 0;

  /** Paint one wireframe box: occluding face, verdict wash, three edge tiers. */
  function drawBox(bo: Box): void {
    const e2 = bo.e;
    if (e2 <= 0.003) return;
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
    /* lit state — stateless: time since the beam crossed this block. In the
       reduced-motion still every graded block is simply fully resolved. */
    let lit = 0;
    let flash = 0;
    let dtHit = -1;
    if (_isStatic) {
      if (bo.v && !bo.frame) lit = 1;
    } else if (_p >= 0 && !bo.frame) {
      const hi = bo.f * _cur.sweep;
      if (_p >= hi) dtHit = _p - hi;
      else if (_cycle > 0) dtHit = _p + _cur.P - hi;
      if (dtHit >= 0) {
        const dur = bo.fd * _cur.sweep;
        flash = dtHit <= dur ? 1 : Math.exp(-(dtHit - dur) / 0.4);
        lit = dtHit < _cur.hold ? 1 : Math.exp(-(dtHit - _cur.hold) / _cur.tau);
        flash *= _fade;
        lit *= _fade;
      }
    }
    const depthK = 0.62 + 0.38 * clamp((bo.depth + 120) / 240, 0, 1);
    const vc = bo.v ? bo.v[0] : ACID;
    // col = mix(mix(CHALK, vc, lit), FLASH, flash*0.75) — inlined, no array alloc.
    const f2 = flash * 0.75;
    const cr = CHALK[0] + (vc[0] - CHALK[0]) * lit;
    const cg = CHALK[1] + (vc[1] - CHALK[1]) * lit;
    const cb = CHALK[2] + (vc[2] - CHALK[2]) * lit;
    const r = (cr + (FLASH[0] - cr) * f2) | 0;
    const g = (cg + (FLASH[1] - cg) * f2) | 0;
    const b = (cb + (FLASH[2] - cb) * f2) | 0;
    // graded edges brighten briefly as the page resolves
    const settle = bo.v ? 1 + 0.5 * _resolve * lit : 1;
    const enterK = _enterOn ? clamp(e2 * 1.4, 0, 1) : 1;
    const edgeA =
      (0.36 + 0.58 * Math.max(lit * (bo.v ? 0.95 : 0.55), flash)) * depthK * enterK * settle;

    const n = hullInto(bo.sx, bo.sy);
    ctx!.beginPath();
    ctx!.moveTo(bo.sx[_ring[0]], bo.sy[_ring[0]]);
    for (let ri = 1; ri < n; ri++) ctx!.lineTo(bo.sx[_ring[ri]], bo.sy[_ring[ri]]);
    ctx!.closePath();
    ctx!.fillStyle = 'rgba(9,9,9,0.92)';
    ctx!.fill();
    const big = bo.w * bo.h > 9000 ? 0.4 : 1; // large blocks get a lighter wash
    const tint = (0.035 + (0.12 * lit * (bo.v ? 1 : 0.4) + 0.12 * flash) * big) * enterK;
    ctx!.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + clamp(tint, 0, 1).toFixed(3) + ')';
    ctx!.fill();

    const colA = r + ',' + g + ',' + b + ',';
    for (let si = 0; si < 3; si++) {
      const set = EDGE_SETS[si];
      ctx!.strokeStyle = 'rgba(' + colA + clamp(edgeA * EDGE_MUL[si], 0, 1).toFixed(3) + ')';
      ctx!.lineWidth = si === 2 ? 1 : 0.75;
      ctx!.beginPath();
      for (let ei = 0; ei < 4; ei++) {
        const ed = EDGES[set[ei]];
        ctx!.moveTo(bo.sx[ed[0]], bo.sy[ed[0]]);
        ctx!.lineTo(bo.sx[ed[1]], bo.sy[ed[1]]);
      }
      ctx!.stroke();
    }

    if (bo.tag && bo.v && lit > 0.04) {
      const lf = bo.tag === 'left';
      const reveal = _isStatic ? 1 : easeInOut(clamp(dtHit / 0.42, 0, 1));
      const t = TAGS[_tagN++];
      t.v = bo.v;
      t.a = Math.min(1, lit * 1.4);
      t.reveal = reveal;
      t.ax = bo.sx[lf ? 4 : 5];
      t.ay = bo.sy[lf ? 4 : 5];
      t.lf = lf;
    }
  }
  let _tagN = 0;

  function draw(T: number): void {
    const cur = MODES[mode];
    _cur = cur;
    _T = T;
    const isStatic = reduced();
    _isStatic = isStatic;
    // The still has no sweep: grading is forced on per-block, no beam/marker.
    const q = isStatic ? -1 : T - modeT0;
    const p = q < 0 ? -1 : q % cur.P;
    const cycle = q < 0 ? -1 : Math.floor(q / cur.P);
    _p = p;
    _cycle = cycle;
    const fade = isStatic ? 1 : clamp((T - fadeT0) / 0.6, 0, 1);
    _fade = fade;
    const enterOn = !isStatic && T < 3.4;
    _enterOn = enterOn;

    /* camera — a calm, gently detuned orbit (static freezes to a fixed pose) */
    if (isStatic) {
      yaw = STATIC_YAW;
      pitch = STATIC_PITCH;
    } else {
      const s1 = T * ORBIT_W * cur.swing;
      yaw = YAW_BASE + YAW_AMP * (0.82 * Math.sin(s1) + 0.18 * Math.sin(s1 * 0.47 + 1.7));
      pitch = PITCH_BASE + PITCH_AMP * Math.sin(s1 * 0.63 + 0.5);
    }
    cY = Math.cos(yaw);
    sY = Math.sin(yaw);
    cP = Math.cos(pitch);
    sP = Math.sin(pitch);
    S = S || 1;
    F = D * S;
    CX = w * 0.5 + 6;
    CY = h * 0.5 - 10 + (isStatic ? 0 : Math.sin(T * 0.45) * 3.5);

    ctx!.clearRect(0, 0, w, h);

    const u = p >= 0 && p <= cur.sweep ? p / cur.sweep : -1; // beam progress 0..1
    const by = u < 0 ? 0 : -LENS_PAD + (LENS_H + LENS_PAD * 2) * u - LENS_H / 2; // centred page coords
    const env = u < 0 ? 0 : Math.min(1, u / 0.06, (1 - u) / 0.06) * cur.beam * fade;
    _env = env;

    /* the "complete" beat: a soft resolve pulse as the sweep clears the page */
    let resolve = 0;
    if (!isStatic && p >= 0) {
      const over = p - cur.sweep;
      if (over >= 0 && over < 0.95) {
        resolve = clamp(over / 0.08, 0, 1) * Math.exp(-Math.max(0, over - 0.08) / 0.4) * fade;
      }
    } else if (isStatic) {
      resolve = 0.65; // the still sits inside a gentle, steady resolve glow
    }
    _resolve = resolve;

    /* floor grid — a platform under the page */
    const fy = LENS_H / 2 + 44;
    let gi: number;
    let a: number;
    ctx!.lineWidth = 1;
    for (gi = -6; gi <= 6; gi++) {
      a = 0.09 * (1 - Math.abs(gi) / 7);
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
        (0.08 + 0.26 * d[3]) *
        (0.55 + 0.45 * Math.sin(T * 0.8 + d[3] * 40)) *
        clamp((pz + 260) / 380, 0.25, 1);
      ctx!.fillStyle = rgba(CHALK, a);
      ctx!.fillRect(px, py, 1.3, 1.3);
    }

    /* depth sort: backdrop board(s) stay behind; page blocks by centroid depth */
    let bi: number;
    for (bi = 0; bi < N; bi++) {
      const bb = BOXES[bi];
      bb.e = enterOn ? easeOut((T - bb.delay) / 1.15) : 1;
      P(bb.cx, bb.cy, (bb.z + bb.d / 2) * bb.e);
      bb.depth = pz;
    }

    /* 1) the board, painted first as the backdrop */
    for (bi = 0; bi < BACKDROP.length; bi++) drawBox(BACKDROP[bi]);

    /* 2) surface detail that lives ON the board, over its face */
    drawSurface(by, u, env);

    /* 3) page blocks, strictly back-to-front */
    DRAW_ORDER.sort(_depthCmp);
    _tagN = 0;
    for (bi = 0; bi < DRAW_ORDER.length; bi++) drawBox(DRAW_ORDER[bi]);

    /* 4) callouts, drawing their leader lines in as the scan reaches them */
    drawCallouts();

    /* 5) the resolve glow sits in front of the page, behind the HUD */
    if (resolve > 0.01) {
      P(0, 0, 10);
      const gr = ctx!.createRadialGradient(px, py, 0, px, py, Math.max(w, h) * 0.5);
      gr.addColorStop(0, rgba(ACID, 0.1 * resolve));
      gr.addColorStop(0.55, rgba(ACID, 0.03 * resolve));
      gr.addColorStop(1, rgba(ACID, 0));
      ctx!.fillStyle = gr;
      ctx!.fillRect(0, 0, w, h);
    }

    /* 6) the laser sheet + sparks, in front of everything it crosses */
    if (env > 0.01) drawBeam(by, env, cur);

    hud(T, p, u, by, env, cur, isStatic);
  }

  /* dot lattice + scan trail, drawn onto the board surface */
  function drawSurface(by: number, u: number, env: number): void {
    const BAND = 64;
    let gi: number;
    /* base lattice in one path */
    ctx!.fillStyle = rgba(CHALK, 0.12);
    ctx!.beginPath();
    _nearN = 0;
    for (gi = 0; gi < DOTS.length; gi++) {
      const dt = DOTS[gi];
      const dy = u < 0 ? 999 : dt[1] - by;
      if (dy > -BAND * 1.6 && dy < BAND * 0.7) {
        _near[_nearN++] = gi;
        continue;
      }
      P(dt[0], dt[1], 0);
      ctx!.rect(px - 0.7, py - 0.7, 1.4, 1.4);
    }
    ctx!.fill();
    /* active band rises toward the beam */
    for (gi = 0; gi < _nearN; gi++) {
      const nd = DOTS[_near[gi]];
      const ddy = nd[1] - by;
      const pk = Math.exp(-(ddy * ddy) / (2 * 15 * 15));
      const tail = ddy < 0 ? Math.exp(ddy / 58) * 0.35 : 0;
      const k2 = Math.min(1, pk + tail) * env;
      P(nd[0], nd[1], 15 * pk * env);
      const sz = 1.4 + 1.6 * pk * env;
      ctx!.fillStyle = rgba(k2 > 0.5 ? FLASH : ACID, 0.1 + 0.9 * k2);
      ctx!.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    }
    /* scan trail — a soft gradient wash just behind the beam, on the page plane */
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
      g.addColorStop(1, rgba(ACID, 0.12 * env));
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.moveTo(ax, ay);
      ctx!.lineTo(bx, byy);
      ctx!.lineTo(cx2, cy2);
      ctx!.lineTo(dx2, dy2);
      ctx!.closePath();
      ctx!.fill();
    }
  }

  function drawCallouts(): void {
    const pad = 16;
    for (let ti = 0; ti < _tagN; ti++) {
      const tg = TAGS[ti];
      const grow = tg.reveal;
      if (grow <= 0.001) continue;
      const label = tg.v[2] + '  ';
      const verdict = tg.v[1];
      ctx!.font = '600 10px ' + FONT;
      if (hasLS) ctx!.letterSpacing = '1.4px';
      const tw = ctx!.measureText(label + verdict).width;
      const dir = tg.lf || tg.ax + 16 + tw + 30 > w - 20 ? -1 : 1;
      // Resolved (grow=1) geometry: anchor -> elbow corner -> horizontal run.
      const cornerX = tg.ax + dir * 14;
      const cornerY = tg.ay - 14;
      const runEndX = cornerX + dir * (tw + 8);
      // Keep the whole label on-canvas: shift the run so the text never clips
      // the edge at any cell width (the left-pointing labels on a narrow cell).
      let txFull = dir === 1 ? cornerX + 3 : runEndX + 3;
      let shift = 0;
      if (txFull < pad) shift = pad - txFull;
      else if (txFull + tw > w - pad) shift = w - pad - (txFull + tw);
      const cX = cornerX + shift;
      const rX = runEndX + shift;
      // Draw the elbow growing in from the anchor toward the (shifted) run.
      const ex = tg.ax + (cX - tg.ax) * grow;
      const ey = tg.ay + (cornerY - tg.ay) * grow;
      const rx = ex + (rX - cX) * grow;
      const la = tg.a * grow;
      ctx!.strokeStyle = rgba(tg.v[0], la * 0.9);
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.moveTo(tg.ax, tg.ay);
      ctx!.lineTo(ex, ey);
      ctx!.lineTo(rx, ey);
      ctx!.stroke();
      ctx!.fillStyle = rgba(tg.v[0], la);
      ctx!.fillRect(tg.ax - 1.5, tg.ay - 1.5, 3, 3);
      if (grow > 0.75) {
        const textA = (grow - 0.75) / 0.25;
        const tx = dir === 1 ? ex + 3 : rx + 3;
        const ty = ey - 5;
        text(label, tx, ty, rgba(CHALK, tg.a * 0.85 * textA), 10, 600, 1.4);
        const lw = ctx!.measureText(label).width;
        text(verdict, tx + lw, ty, rgba(tg.v[0], tg.a * textA), 10, 700, 1.4);
      }
    }
  }

  function drawBeam(by: number, env: number, cur: ModeCfg): void {
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
    const T = _T;
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
    const edge = rgba(CHALK, 0.24);
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
    ctx!.strokeStyle = rgba(CHALK, 0.13);
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

    /* bottom readouts — fitted so nothing is ever clipped at any cell width */
    const baseline = h - inset - 12;
    const yd = Math.round(yaw * 57.2958);
    const pd = Math.round(pitch * 57.2958);
    const readout =
      'YAW ' +
      (yd < 0 ? '-' : '+') +
      ('0' + Math.abs(yd)).slice(-2) +
      '°  PITCH ' +
      (pd < 0 ? '-' : '+') +
      ('0' + Math.abs(pd)).slice(-2) +
      '°';
    const rMax = (w - inset * 2) * 0.42;
    const [rs, rls] = fitFont(readout, rMax, 9.5, 500, 1.2);
    text(readout, w - inset - 2, baseline, rgba(CHALK, 0.34), rs, 500, rls, 'right');

    let foot: string;
    if (mode === 'scanning') {
      const pct = isStatic ? 100 : u < 0 ? (p < 0 ? 0 : 100) : Math.round(u * 100);
      foot =
        'PASS ' +
        ('0' + (isStatic ? 1 : Math.max(1, Math.floor((T - modeT0) / cur.P) + 1))).slice(-2) +
        '   ' +
        ('00' + pct).slice(-3) +
        '%';
    } else foot = 'HERO  SPECIFICS  PROOF  CRAFT  CTA';
    const fMax = (w - inset * 2) * 0.54;
    const [fs, fls] = fitFont(foot, fMax, 10, 500, 1.4);
    text(
      foot,
      inset + 2,
      baseline,
      rgba(mode === 'scanning' ? ACID : CHALK, mode === 'scanning' ? 0.85 : 0.34),
      fs,
      500,
      fls,
    );
    ctx!.textAlign = 'left';
  }

  /* reusable scratch for the dot-lattice active band (no per-frame alloc) */
  const _near: number[] = new Array(DOTS.length);
  let _nearN = 0;

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
