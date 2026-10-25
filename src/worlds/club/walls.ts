import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { RoomView } from '../types.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, NEONS, hash, withAlpha } from './kit.ts';
import type { Feature, Plan, Wall } from './plan.ts';
import { PAINT, STRIP, TRUSS, fh, muralTop } from './plan.ts';
import { sign, signColor } from './signs.ts';

// The club's walls: old brick, black-painted along the foot, a neon strip
// just over everyone's heads with its colour washed on the brick, and a
// lighting truss along the top throwing scallops of coloured light down
// the wall. Between the stations: neon signs over posters, tags and fuse
// boxes, a mural of the club's cat in headphones, and a fire exit. Each
// wall's colour follows the light: the right wall's face is lit, the
// left's in shade. A tile of the shell draws only the bricks it shows.

const COURSE = 1.0; // a course of brick, units
const BRICK = 2.6; // a brick's length
// Each wall's strip colour (right, left).
export const STRIPS: Record<Wall, Color> = { right: C.pink, left: C.cyan };

// The part of the wall face a0..a1 x z0..z1 that falls on the canvas (in
// the face's own a, z), or null.
function visible(k: Kit, a0: number, a1: number, z0: number, z1: number): [number, number, number, number] | null {
  const [ox, oy] = k.p(0, 0, 0);
  const [ux, uy] = k.eu;
  const [zx, zy] = k.ez;
  const det = ux * zy - uy * zx;
  if (!(Math.abs(det) > 1e-9)) return [a0, a1, z0, z1];
  let lo = Infinity;
  let hi = -Infinity;
  let zl = Infinity;
  let zh = -Infinity;
  for (const [x, y] of [[0, 0], [k.pen.width, 0], [0, k.pen.height], [k.pen.width, k.pen.height]]) {
    const dx = x - ox;
    const dy = y - oy;
    const a = (dx * zy - dy * zx) / det;
    const z = (ux * dy - uy * dx) / det;
    lo = Math.min(lo, a);
    hi = Math.max(hi, a);
    zl = Math.min(zl, z);
    zh = Math.max(zh, z);
  }
  const r: [number, number, number, number] = [Math.max(a0, lo - 1), Math.min(a1, hi + 1), Math.max(z0, zl - 1), Math.min(z1, zh + 1)];
  return r[1] > r[0] && r[3] > r[2] ? r : null;
}

export function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  if (!k.seenBox(T, 0, 0, end, 2.5, H, 4 * s)) return;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.16) => (lit ? c : shade(c, -d));
  // Brick, fading into the dark toward the top.
  k.rect(T, 0, PAINT, end, H, k.vgrad(T, 0, PAINT, H, [[0, tone(C.brick)], [0.35, tone(shade(C.brick, -0.08))], [1, tone(shade(C.brick, -0.42))]]));
  bricks(k, plan, wall, T, end, H, tone);
  // the black band along the foot, scuffed, with a steel trim on top
  k.rect(T, 0, 0, end, PAINT, tone(C.paint, 0.1));
  const vis = visible(k, T, end, 0, PAINT);
  if (vis) {
    pen.beginPath();
    for (let i = Math.floor(vis[0] / 3); i * 3 < vis[1]; i++) {
      if (hash(i, wall === 'right' ? 3 : 4) < 0.7) continue;
      const a = i * 3 + hash(i, 5) * 2;
      const z = 0.6 + hash(i, 6) * 2.5;
      k.trace([[a, 0, z], [a + 1.2 + hash(i, 7) * 2, 0, z + 0.25], [a + 1.4 + hash(i, 7) * 2, 0, z + 0.5], [a + 0.2, 0, z + 0.3]]);
    }
    pen.fillStyle = withAlpha(tone('#5a4a66'), 0.5);
    pen.fill();
  }
  k.box(T, 0, PAINT - 0.3, end - T, 0.35, 0.3, C.steelDark, { line: k.thin, stripe: false });
  // the far corner in shadow
  k.rect(T, 0, 0, T + 10, H, k.grad([T, 0, H / 2], [T + 10, 0, H / 2], [[0, '#0a051055'], [1, '#0a051000']]));
  // what the truss's cans throw down the brick
  truss(k, v, end, 'wash');
  for (const f of plan.features) {
    if (f.wall !== wall || !k.seenBox(f.a - f.w / 2 - 6, 0, 0, f.a + f.w / 2 + 6, 1, H, 8 * s)) continue;
    if (f.kind === 'mural') mural(k, f, lit, H);
    else if (f.kind === 'exit') exitDoor(k, f, lit);
    else bay(k, plan, f, lit);
  }
  // the neon strip, its light on the brick above and below
  const strip = STRIPS[wall];
  pen.save();
  pen.globalCompositeOperation = 'screen';
  k.rect(T, 0.05, STRIP - 6, end, STRIP + 6, k.vgrad(T, 0.05, STRIP - 6, STRIP + 6, [[0, withAlpha(strip, 0)], [0.5, withAlpha(strip, 0.22)], [1, withAlpha(strip, 0)]]));
  pen.restore();
  for (let a = T + 1; a < end - 1; a += 12) k.line([[a, 0.02, STRIP - 0.5], [a, 0.45, STRIP - 0.5]], C.steelDark, Math.max(1, 0.18 * s));
  let from = T + 0.8;
  for (const f of plan.features) {
    if (f.wall !== wall || f.kind !== 'mural' || muralTop(H) < STRIP + 1) continue;
    k.neon([[from, 0.45, STRIP], [f.a - f.w / 2 - 0.8, 0.45, STRIP]], strip, 0.36);
    from = f.a + f.w / 2 + 0.8;
  }
  k.neon([[from, 0.45, STRIP], [end - 0.5, 0.45, STRIP]], strip, 0.36);
  if (wall === 'left' && H >= 44) duct(k, v, end);
  truss(k, v, end, 'rig');
}

// Mortar courses and joints over the visible brick, a few bricks a shade
// off, and plaster patches nowhere: this is a basement.
function bricks(k: Kit, plan: Plan, wall: Wall, T: number, end: number, H: number, tone: (c: Color, d?: number) => Color): void {
  const vis = visible(k, T, end, PAINT, H);
  if (!vis) return;
  const { pen, s } = k;
  const [a0, a1, z0, z1] = vis;
  const r0 = Math.max(0, Math.floor((z0 - PAINT) / COURSE));
  const r1 = Math.ceil((z1 - PAINT) / COURSE);
  // bricks a shade lighter or darker
  const odd: Array<[number, number, number]> = [];
  for (let r = r0; r < r1; r++) {
    const off = r & 1 ? BRICK / 2 : 0;
    const zb = PAINT + r * COURSE;
    for (let j = Math.floor((a0 - T - off) / BRICK); T + off + j * BRICK < a1; j++) {
      const h = hash(j, r, wall === 'right' ? 21 : 22);
      if (h < 0.16) odd.push([T + off + j * BRICK, zb, h < 0.08 ? 1 : -1]);
    }
  }
  for (const sign of [1, -1]) {
    pen.beginPath();
    for (const [a, z, g] of odd) if (g === sign) k.trace([[Math.max(T, a), 0, z], [Math.min(end, a + BRICK), 0, z], [Math.min(end, a + BRICK), 0, Math.min(H, z + COURSE)], [Math.max(T, a), 0, Math.min(H, z + COURSE)]]);
    pen.fillStyle = sign > 0 ? withAlpha(tone(C.brickLit), 0.55) : withAlpha(tone(C.brickDark), 0.6);
    pen.fill();
  }
  pen.beginPath();
  for (let r = r0; r <= r1; r++) {
    const z = PAINT + r * COURSE;
    if (z > H) break;
    const [x0, y0] = k.p(a0, 0, z);
    const [x1, y1] = k.p(a1, 0, z);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
    if (r === r1) continue;
    const off = r & 1 ? BRICK / 2 : 0;
    for (let j = Math.floor((a0 - T - off) / BRICK); T + off + j * BRICK < a1; j++) {
      const a = T + off + j * BRICK;
      if (a <= T) continue;
      const [p0, q0] = k.p(a, 0, z);
      const [p1, q1] = k.p(a, 0, Math.min(H, z + COURSE));
      pen.moveTo(p0, q0);
      pen.lineTo(p1, q1);
    }
  }
  pen.strokeStyle = withAlpha(tone(C.mortar), 0.8);
  pen.lineWidth = Math.max(0.6, 0.13 * s);
  pen.lineCap = 'butt';
  pen.stroke();
  if (k.fine) {
    // a lit lip along the top of each course
    pen.beginPath();
    for (let r = r0; r < r1; r++) {
      const z = PAINT + (r + 1) * COURSE - 0.14;
      if (z > H) break;
      const [x0, y0] = k.p(a0, 0, z);
      const [x1, y1] = k.p(a1, 0, z);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = withAlpha(tone('#a06a88'), 0.25);
    pen.lineWidth = 0.1 * s;
    pen.stroke();
  }
}

// ── the rig along the top ──────────────────────────────────────────────────
// The lights hung along a wall's truss: a par can every 9 units, every third
// a moving head, each with its colour.
export function rig(T: number, end: number): Array<{ a: number; c: Color; head: boolean }> {
  const out: Array<{ a: number; c: Color; head: boolean }> = [];
  let i = 0;
  for (let a = T + 5; a < end - 3; a += 9, i++) out.push({ a, c: NEONS[(i * 3 + (end > 150 ? 1 : 0)) % NEONS.length], head: i % 3 === 1 });
  return out;
}

// A box truss on brackets, par cans hanging under it every few units and a
// moving head now and then; 'wash' paints the cones of light they throw
// down the brick (under everything on the wall), 'rig' the truss itself.
function truss(k: Kit, v: RoomView, end: number, part: 'wash' | 'rig'): void {
  const { T, H } = v;
  const z = H - TRUSS;
  const n = 1.9;
  const cans = rig(T, end);
  if (part === 'wash') {
    for (const c of cans) {
      if (!k.seen([[c.a - 5, 0, 0], [c.a + 5, 0, z]], 0)) continue;
      k.wash(c.a, 0.05, z - 9, 3.2, 10, c.c, 0.2);
      k.wash(c.a, 0.05, z - 3, 1.6, 3, c.c, 0.25);
    }
    return;
  }
  if (!k.seenBox(T, 0, z - 4, end, n + 1, z + 2, 4 * k.s)) return;
  const { pen } = k;
  const lo = z - 0.6;
  const hi = z + 0.6;
  // brackets to the wall
  for (let a = T + 9; a < end - 2; a += 18) k.rod([[a, 0, hi + 0.8], [a, n, hi]], C.steelDark, 0.14);
  // the chords and the zigzag between them
  k.rod([[T + 1, n, hi], [end - 0.5, n, hi]], C.steel, 0.16);
  pen.beginPath();
  for (let a = T + 1, j = 0; a < end - 0.5; a += 1.2, j++) {
    const [x0, y0] = k.p(a, n, j & 1 ? hi : lo);
    const [x1, y1] = k.p(Math.min(end - 0.5, a + 1.2), n, j & 1 ? lo : hi);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = C.steelDark;
  pen.lineWidth = Math.max(0.8, 0.1 * k.s);
  pen.stroke();
  k.rod([[T + 1, n, lo], [end - 0.5, n, lo]], C.steel, 0.16);
  // the lights
  for (const c of cans) {
    if (!k.seen([[c.a - 2, n, lo - 4], [c.a + 2, n, lo]], 2 * k.s)) continue;
    if (c.head) {
      // a moving head: a yoke and a round head looking down into the room
      k.box(c.a - 0.7, n - 0.6, lo - 0.6, 1.4, 1.2, 0.6, C.black, { line: k.thin });
      k.rod([[c.a - 0.75, n, lo - 0.6], [c.a - 0.75, n, lo - 2.2]], C.black, 0.18);
      k.rod([[c.a + 0.75, n, lo - 0.6], [c.a + 0.75, n, lo - 2.2]], C.black, 0.18);
      k.ring(c.a, n, lo - 2.2, 0.75, k.vgrad(c.a, n, lo - 3, lo - 1.4, [[0, '#211b29'], [1, '#4a4356']]), k.thin);
      k.ring(c.a, n + 0.3, lo - 2.35, 0.38, c.c, 0);
      k.halo(c.a, n + 0.4, lo - 2.4, 1.6, c.c, 0.55);
    } else {
      // a par can on its yoke, lens aglow
      k.line([[c.a, n, lo], [c.a, n, lo - 0.7]], INK, Math.max(1, 0.2 * k.s));
      k.box(c.a - 0.45, n - 0.45, lo - 1.9, 0.9, 0.9, 1.25, '#2d2836', { line: k.thin, round: 0.25 });
      k.ring(c.a, n + 0.47, lo - 1.4, 0.32, c.c, 0);
      k.halo(c.a, n + 0.5, lo - 1.5, 1.3, c.c, 0.5);
    }
  }
}

// A round duct along the top of the wall, on hangers.
function duct(k: Kit, v: RoomView, end: number): void {
  const z = v.H - TRUSS - 8;
  if (!k.seenBox(v.T, 0, z - 2, end, 4, z + 2, 4 * k.s)) return;
  for (let a = v.T + 6; a < end - 2; a += 14) k.rod([[a, 1.8, z + 1.6], [a, 1.8, z + 3.4], [a, 0, z + 3.4]], C.steelDark, 0.1);
  k.box(v.T, 0.4, z - 1.6, end - v.T, 3.2, 3.2, '#6e6a82', { round: 1.1, top: '#827e96' });
  const { pen } = k;
  pen.beginPath();
  for (let a = v.T + 5; a < end - 1; a += 5) {
    const pts: P3[] = [[a, 0.4, z + 1.6], [a, 3.6, z + 1.6], [a, 3.6, z - 1.6]];
    pts.forEach(([u, w, zz], j) => {
      const [x, y] = k.p(u, w, zz);
      if (j) pen.lineTo(x, y);
      else pen.moveTo(x, y);
    });
  }
  pen.strokeStyle = '#4a465c';
  pen.lineWidth = Math.max(0.8, 0.12 * k.s);
  pen.stroke();
}

// ── on the walls ─────────────────────────────────────────────────────────────

// A neon sign over something low.
function bay(k: Kit, plan: Plan, f: Feature, lit: boolean): void {
  const { r, z } = plan.sign;
  if (f.sign >= 0) {
    const c = signColor(f.sign);
    k.wash(f.a, 0.05, z, r * 2.2, r * 1.7, c, 0.32);
    // some hang on a black board on stand-offs, some straight on the brick
    if (fh(f, 1) < 0.45) {
      k.box(f.a - r - 0.8, 0, z - r - 0.8, 2 * r + 1.6, 0.3, 2 * r + 1.6, '#1d1824', { line: k.thin, round: 0.4, stripe: false });
      sign(k, f.sign, f.a, 0.55, z, r);
    } else sign(k, f.sign, f.a, 0.4, z, r);
  }
  if (f.low === 'posters') posters(k, f, lit);
  else if (f.low === 'tag') tag(k, f);
  else if (f.low === 'fuse') fuse(k, f);
}

const POSTER_BG: readonly Color[] = ['#2a1d4a', C.pink, '#21c2d8', '#f3eadf', '#1d1a24', C.amber, '#7a5ae0', '#c8f05a'];

// Gig posters pasted up in a cluster, a little askew, corners taped or torn.
function posters(k: Kit, f: Feature, lit: boolean): void {
  const n = Math.max(2, Math.min(6, Math.floor(f.w / 2.6)));
  const span = Math.min(f.w, n * 2.7);
  for (let i = 0; i < n; i++) {
    const w = 2.3 + fh(f, i, 1) * 0.7;
    const h = 3.3 + fh(f, i, 2) * 1.1;
    const a = f.a - span / 2 + (span * (i + 0.5)) / n + (fh(f, i, 3) - 0.5) * 0.6;
    const zc = 8.2 + (i & 1 ? 2.3 : 0) + (fh(f, i, 4) - 0.5) * 1.6;
    const th = (fh(f, i, 5) - 0.5) * 0.16;
    const n0 = 0.05 + i * 0.004;
    const P = (dx: number, dz: number): P3 => [a + dx * Math.cos(th) - dz * Math.sin(th), n0, zc + dx * Math.sin(th) + dz * Math.cos(th)];
    const design = Math.floor(fh(f, i, 6) * 6);
    const bg = POSTER_BG[(design + i) % POSTER_BG.length];
    const tone = (c: Color) => (lit ? c : shade(c, -0.14));
    k.poly([P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)], tone(bg), k.thin);
    const ink = bg === '#f3eadf' || bg === C.amber || bg === '#c8f05a' ? '#1d1a24' : '#f6eefa';
    const acc = design % 2 ? C.amber : C.cyan;
    if (design === 0) {
      // a sun going down over stripes
      k.poly(circ(P, 0, 0.35, w * 0.32), tone(C.amber), 0);
      for (let j = 0; j < 3; j++) k.poly([P(-w / 2 + 0.2, -0.1 - j * 0.32), P(w / 2 - 0.2, -0.1 - j * 0.32), P(w / 2 - 0.2, -0.25 - j * 0.32), P(-w / 2 + 0.2, -0.25 - j * 0.32)], tone(C.pink), 0);
    } else if (design === 1) {
      k.poly([P(-w * 0.35, -h * 0.25), P(w * 0.35, -h * 0.25), P(0, h * 0.25)], tone(ink), 0);
      k.poly(circ(P, w * 0.12, h * 0.22, w * 0.16), tone(acc), 0);
    } else if (design === 2) {
      for (let j = 3; j >= 1; j--) k.poly(circ(P, 0, 0.2, (w * 0.4 * j) / 3), tone(j & 1 ? ink : bg), 0);
    } else if (design === 3) {
      for (let j = -2; j <= 2; j++) k.poly([P(-w / 2 + 0.1, j * 0.7 - 0.2), P(w / 2 - 0.1, j * 0.7 + 0.3), P(w / 2 - 0.1, j * 0.7 + 0.6), P(-w / 2 + 0.1, j * 0.7 + 0.1)], tone(j & 1 ? C.pink : ink), 0);
    } else if (design === 4) {
      // a dancer, arms up
      k.poly(circ(P, 0, h * 0.18, 0.36), tone(C.lime), 0);
      k.poly([P(-0.5, -h * 0.3), P(0.5, -h * 0.3), P(0.25, h * 0.08), P(0.9, h * 0.32), P(0.7, h * 0.38), P(0, h * 0.12), P(-0.7, h * 0.38), P(-0.9, h * 0.32), P(-0.25, h * 0.08)], tone(C.lime), 0);
    } else {
      k.poly(circ(P, 0, 0.25, w * 0.38), tone('#141018'), 0);
      k.poly(circ(P, 0, 0.25, w * 0.13), tone(C.pink), 0);
    }
    // bars that read as the line-up (no letters)
    for (let j = 0; j < 2; j++) {
      const l = w * (0.5 + fh(f, i, 7 + j) * 0.3);
      k.poly([P(-l / 2, -h / 2 + 0.35 + j * 0.32), P(l / 2, -h / 2 + 0.35 + j * 0.32), P(l / 2, -h / 2 + 0.5 + j * 0.32), P(-l / 2, -h / 2 + 0.5 + j * 0.32)], tone(withAlpha(ink, 0.85)), 0);
    }
    // tape on the top corners, or one torn away
    if (fh(f, i, 9) < 0.35) k.poly([P(w / 2 - 0.9, h / 2), P(w / 2, h / 2), P(w / 2, h / 2 - 0.9)], tone(shade(C.brick, -0.1)), 0);
    else for (const sx of [-1, 1]) k.poly([P(sx * w / 2 - 0.3, h / 2 - 0.2), P(sx * w / 2 + 0.3, h / 2 - 0.2), P(sx * w / 2 + 0.3, h / 2 + 0.2), P(sx * w / 2 - 0.3, h / 2 + 0.2)], '#f4f0e488', 0);
  }
}

const circ = (P: (dx: number, dz: number) => P3, cx: number, cz: number, r: number): P3[] => {
  const out: P3[] = [];
  for (let i = 0; i < 16; i++) out.push(P(cx + Math.cos((i / 16) * Math.PI * 2) * r, cz + Math.sin((i / 16) * Math.PI * 2) * r));
  return out;
};

// A spray-painted tag: fat bubbly shapes with a highlight, drips and a few
// sparkles round it.
function tag(k: Kit, f: Feature): void {
  const w = Math.min(f.w, 11);
  const base = 8.5;
  const pals: ReadonlyArray<readonly [Color, Color]> = [[C.pink, C.violet], [C.lime, '#21b8c8'], [C.amber, C.hot], [C.cyan, C.violet]];
  const [c0, c1] = pals[Math.floor(fh(f, 20) * pals.length)];
  const n = 3 + Math.floor(fh(f, 21) * 2);
  const g = k.vgrad(f.a, 0.06, base - 2, base + 4, [[0, c1], [1, c0]]);
  for (let i = 0; i < n; i++) {
    const a = f.a - w / 2 + (w * (i + 0.5)) / n;
    const rz = 2.2 + fh(f, i, 22) * 1.2;
    const ra = (w / n) * 0.62;
    const pts: P3[] = [];
    for (let j = 0; j < 14; j++) {
      const th = (j / 14) * Math.PI * 2;
      const q = 0.85 + fh(f, i * 14 + j, 23) * 0.3;
      pts.push([a + Math.cos(th) * ra * q, 0.06, base + (i & 1 ? 0.6 : 0) + Math.sin(th) * rz * q]);
    }
    k.poly(pts, g, k.lw, 0.5);
    k.line([[a - ra * 0.45, 0.07, base + rz * 0.35], [a - ra * 0.1, 0.07, base + rz * 0.6]], '#ffffffaa', Math.max(1, 0.28 * k.s));
  }
  // drips
  for (let i = 0; i < 4; i++) {
    const a = f.a - w * 0.4 + fh(f, i, 24) * w * 0.8;
    const l = 1 + fh(f, i, 25) * 2.4;
    k.line([[a, 0.07, base - 1.6], [a, 0.07, base - 1.6 - l]], c1, Math.max(1, 0.24 * k.s));
  }
  // a crown over it, sparkles
  const ca = f.a + w * 0.15;
  k.line([[ca - 1.2, 0.07, base + 3.6], [ca - 1.2, 0.07, base + 4.8], [ca - 0.6, 0.07, base + 4.1], [ca, 0.07, base + 5.0], [ca + 0.6, 0.07, base + 4.1], [ca + 1.2, 0.07, base + 4.8], [ca + 1.2, 0.07, base + 3.6], [ca - 1.2, 0.07, base + 3.6]], '#f6eefa', Math.max(1, 0.2 * k.s));
  for (let i = 0; i < 3; i++) {
    const a = f.a - w / 2 + fh(f, i, 26) * w;
    const z = base + 3 + fh(f, i, 27) * 3;
    const r = 0.5;
    k.line([[a - r, 0.07, z], [a + r, 0.07, z]], '#ffffffcc', Math.max(0.8, 0.12 * k.s));
    k.line([[a, 0.07, z - r], [a, 0.07, z + r]], '#ffffffcc', Math.max(0.8, 0.12 * k.s));
  }
}

// A grey fuse box with its conduit, a sticker, and a fire extinguisher.
function fuse(k: Kit, f: Feature): void {
  const a = f.a - 1;
  k.rod([[a + 0.6, 0.3, 11.2], [a + 0.6, 0.3, STRIP - 1]], '#77748a', 0.22);
  k.box(a - 1.3, 0, 7.4, 2.6, 0.7, 3.8, '#8d8a9c', { line: k.lw });
  k.line([[a - 1.1, 0.72, 9.3], [a + 1.1, 0.72, 9.3]], INK, k.thin);
  k.poly([[a - 0.5, 0.72, 10.2], [a + 0.5, 0.72, 10.2], [a, 0.72, 11.0]], '#f2c84a', k.thin);
  // the extinguisher on its bracket
  const e = f.a + 2.2;
  k.shadow(e, 0.6, 0.8, 0.5, 0.25, 2.6);
  k.line([[e, 0.05, 5.4], [e, 0.5, 5.4]], C.steelDark, Math.max(1, 0.2 * k.s));
  k.cyl(e, 0.65, 2.6, 0.55, 2.8, C.red);
  k.cyl(e, 0.65, 5.4, 0.3, 0.45, '#2b2633');
  k.rod([[e + 0.15, 0.95, 5.7], [e + 0.75, 1.1, 5.3], [e + 0.65, 1.15, 3.6]], '#2b2633', 0.12);
  k.line([[e - 0.42, 1.12, 3.6], [e - 0.42, 1.12, 4.8]], '#ffffff66', Math.max(0.8, 0.12 * k.s));
}

// The fire exit: a steel door with a push bar and wired glass, a green
// running man over it.
function exitDoor(k: Kit, f: Feature, lit: boolean): void {
  const a = f.a;
  const hw = 3.2;
  const h = 11;
  k.box(a - hw - 0.5, 0, 0, 2 * hw + 1, 0.45, h + 0.5, '#4a4458', { line: k.lw, stripe: false });
  const leaf = lit ? '#5d6a72' : shade('#5d6a72', -0.14);
  k.rect(a - hw, 0.47, 0, a + hw, h, k.vgrad(a, 0.47, 0, h, [[0, shade(leaf, -0.12)], [1, leaf]]), k.thin);
  k.line([[a, 0.48, 0.1], [a, 0.48, h - 0.1]], INK, k.thin);
  // the push bar, wired glass, kick plates
  k.rod([[a - hw + 0.5, 0.75, 5.0], [a + hw - 0.5, 0.75, 5.0]], C.chrome, 0.24);
  for (const sx of [-1, 1]) {
    const c = a + sx * hw * 0.5;
    k.rect(c - 0.8, 0.49, 7.0, c + 0.8, 9.6, k.vgrad(c, 0.49, 7, 9.6, [[0, '#2a3a52'], [1, '#55708e']]), k.thin);
    if (k.fine) {
      for (let i = 1; i < 4; i++) k.line([[c - 0.8, 0.5, 7 + i * 0.65], [c + 0.8, 0.5, 7 + i * 0.65]], '#9ab0c880', 0.04 * k.s);
      for (let i = 1; i < 3; i++) k.line([[c - 0.8 + i * 0.53, 0.5, 7], [c - 0.8 + i * 0.53, 0.5, 9.6]], '#9ab0c880', 0.04 * k.s);
    }
    k.rect(a + sx * 0.2, 0.49, 0.2, a + sx * (hw - 0.3), 1.4, '#7f8c95', 0);
  }
  // the green sign: a running man and an arrow, glowing
  const z = h + 1.6;
  k.wash(a, 0.05, z + 0.8, 4, 2.4, '#3cff8a', 0.3);
  k.box(a - 1.8, 0, z, 3.6, 0.6, 1.7, '#e9f3ec', { line: k.thin, stripe: false });
  k.rect(a - 1.6, 0.62, z + 0.15, a + 1.6, z + 1.55, '#29d46a', 0);
  const m = (du: number, dz: number): P3 => [a - 0.6 + du, 0.64, z + 0.85 + dz];
  const pw = Math.max(0.8, 0.14 * k.s);
  k.disc(...m(0.25, 0.48), 0.13, '#f2fff6', 0);
  k.line([m(0.15, 0.32), m(-0.05, -0.05), m(-0.3, -0.5)], '#f2fff6', pw);
  k.line([m(-0.05, -0.05), m(0.25, -0.25), m(0.35, -0.55)], '#f2fff6', pw);
  k.line([m(-0.35, 0.05), m(0.1, 0.2), m(0.45, 0.05)], '#f2fff6', pw);
  k.line([[a + 0.4, 0.64, z + 0.85], [a + 1.3, 0.64, z + 0.85]], '#f2fff6', pw);
  k.line([[a + 1.0, 0.64, z + 1.1], [a + 1.3, 0.64, z + 0.85], [a + 1.0, 0.64, z + 0.6]], '#f2fff6', pw);
  k.halo(a, 0.7, z + 0.85, 2.6, '#3cff8a', 0.35);
}

// The mural: the club's grey cat in pink headphones on a sunburst, spray
// stars round it, drips under it.
function mural(k: Kit, f: Feature, lit: boolean, H: number): void {
  const { pen } = k;
  const w = f.w;
  const z0 = 2.2;
  const z1 = muralTop(H);
  const h = z1 - z0;
  const a = f.a;
  const n = 0.06;
  const tone = (c: Color) => (lit ? c : shade(c, -0.12));
  // the panel: an upright slab of paint with wobbly sprayed edges, a
  // sunburst inside
  const blob: P3[] = [];
  const edge = (i: number) => (hash(i, f.k, 31) - 0.5) * 0.7;
  for (let i = 0; i <= 8; i++) blob.push([a - w / 2 + (w * i) / 8, n, z0 + edge(i)]);
  for (let i = 1; i <= 8; i++) blob.push([a + w / 2 + edge(i + 10), n, z0 + (h * i) / 8]);
  for (let i = 7; i >= 0; i--) blob.push([a - w / 2 + (w * i) / 8, n, z1 + edge(i + 20)]);
  for (let i = 7; i >= 1; i--) blob.push([a - w / 2 + edge(i + 30), n, z0 + (h * i) / 8]);
  k.poly(blob, tone('#3a1f5c'), k.lw, 1.2);
  pen.save();
  pen.beginPath();
  k.trace(blob, 1.2);
  pen.clip();
  const cz = z0 + h * 0.48;
  for (let i = 0; i < 16; i += 2) {
    const t0 = (i / 16) * Math.PI * 2;
    const t1 = ((i + 1) / 16) * Math.PI * 2;
    k.poly([[a, n, cz], [a + Math.cos(t0) * w, n, cz + Math.sin(t0) * w], [a + Math.cos(t1) * w, n, cz + Math.sin(t1) * w]], tone(i % 4 ? '#8a2f8a' : '#c2337f'), 0);
  }
  pen.restore();
  // the cat: ears, a round grey head, big lime eyes, a pink nose and grin
  const r = Math.min(h * 0.36, w * 0.24);
  const hz = cz - r * 0.05;
  const grey = tone('#9a8fb4');
  for (const sx of [-1, 1]) k.poly([[a + sx * r * 0.85, n, hz + r * 0.25], [a + sx * r * 0.95, n, hz + r * 1.35], [a + sx * r * 0.25, n, hz + r * 0.8]], grey, k.lw);
  for (const sx of [-1, 1]) k.poly([[a + sx * r * 0.78, n, hz + r * 0.45], [a + sx * r * 0.85, n, hz + r * 1.1], [a + sx * r * 0.42, n, hz + r * 0.78]], tone('#f29ac4'), 0);
  const head: P3[] = [];
  for (let i = 0; i < 24; i++) {
    const th = (i / 24) * Math.PI * 2;
    head.push([a + Math.cos(th) * r * 1.05, n, hz + Math.sin(th) * r * 0.88]);
  }
  k.poly(head, grey, k.lw);
  for (const sx of [-1, 1]) {
    k.ring(a + sx * r * 0.4, n, hz + r * 0.12, r * 0.24, tone(C.lime), k.thin);
    k.ring(a + sx * r * 0.4, n, hz + r * 0.12, r * 0.09, INK, 0);
    k.ring(a + sx * r * 0.43, n, hz + r * 0.2, r * 0.05, '#ffffff', 0);
  }
  k.poly([[a - r * 0.1, n, hz - r * 0.12], [a + r * 0.1, n, hz - r * 0.12], [a, n, hz - r * 0.24]], tone('#f29ac4'), k.thin);
  k.line([[a - r * 0.3, n, hz - r * 0.36], [a - r * 0.15, n, hz - r * 0.46], [a, n, hz - r * 0.3], [a + r * 0.15, n, hz - r * 0.46], [a + r * 0.3, n, hz - r * 0.36]], INK, k.thin);
  for (const sx of [-1, 1]) for (const dz of [-0.2, -0.36]) k.line([[a + sx * r * 0.45, n, hz + r * dz], [a + sx * r * 1.25, n, hz + r * (dz * 1.6)]], '#f6eefa', Math.max(0.8, 0.1 * k.s));
  // the headphones over its head
  const band: P3[] = [];
  for (let i = 0; i <= 14; i++) {
    const th = Math.PI * (0.1 + (0.8 * i) / 14);
    band.push([a + Math.cos(th) * r * 1.2, n, hz + Math.sin(th) * r * 1.12]);
  }
  k.line(band, INK, (0.5 + 0.12) * k.s + k.lw);
  k.line(band, tone(C.pink), 0.5 * k.s);
  for (const sx of [-1, 1]) {
    const cups: P3[] = [];
    for (let i = 0; i < 14; i++) {
      const th = (i / 14) * Math.PI * 2;
      cups.push([a + sx * r * 1.12 + Math.cos(th) * r * 0.22, n, hz + Math.sin(th) * r * 0.42]);
    }
    k.poly(cups, tone(C.pink), k.lw);
  }
  // drips off the bottom, spray stars
  for (let i = 0; i < 6; i++) {
    const da = (hash(i, f.k, 32) - 0.5) * w * 0.7;
    k.line([[a + da, n, z0 + 0.6], [a + da, n, z0 - 0.5 - hash(i, f.k, 33) * 1.4]], tone('#3a1f5c'), Math.max(1, 0.3 * k.s));
  }
  for (let i = 0; i < 5; i++) {
    const sa = a + (hash(i, f.k, 34) - 0.5) * w * 0.9;
    const sz = z0 + 0.8 + hash(i, f.k, 35) * (h - 1.6);
    if (Math.abs(sa - a) < r * 1.5) continue;
    const st: P3[] = [];
    for (let j = 0; j < 8; j++) {
      const th = (j / 8) * Math.PI * 2;
      const rr = j & 1 ? 0.25 : 0.75;
      st.push([sa + Math.cos(th) * rr, n, sz + Math.sin(th) * rr]);
    }
    k.poly(st, tone(j2(i)), 0);
  }
  k.wash(a, 0.05, z0 + h / 2, w * 0.6, h * 0.7, mix(C.pink, C.violet, 0.5), 0.14);
}

const j2 = (i: number): Color => [C.lime, C.cyan, C.amber, '#ffffff', C.pink][i % 5];
