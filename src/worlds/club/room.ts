import type { At } from '../../art/iso.ts';
import { frame, mix, shade } from '../../art/iso.ts';
import { lampsOn } from '../../art/scene/light.ts';
import type { Color } from '../../art/types.ts';
import type { Slot } from '../../world/types.ts';
import type { RoomArt, RoomLight, RoomView } from '../types.ts';
import { BEAT, C, INK, Kit, NEONS, hash, kick, softDot, withAlpha } from './kit.ts';
import type { Dance, Plan, Wall } from './plan.ts';
import { EXIT_SIGN, STRIP, TILE, TRUSS, fh, planFor } from './plan.ts';
import { sign, signColor } from './signs.ts';
import { STRIPS, rig, wallFace } from './walls.ts';

// The club's shell: a brick basement (see walls.ts) over polished dark
// concrete, the light-up dance floor in the middle of it caught mid-chase,
// a plum rug under the lounge, and pools of coloured light where the
// stations glow. What moves in the shell itself (room.floor, under
// everyone, a kept two-second loop): the dance floor's tiles on the beat,
// the moving heads' beams sweeping it and the ball's sparkles on the
// walls. The overlay is what moves up in the air, over everyone's heads:
// the mirror ball turning over the dance floor, and a sign whose tube is
// on the blink.

const SLAB = 2.5; // the floor's thickness, shown along the front cut

const wallAt = (P: At, wall: Wall, T: number): At => frame(P, wall, wall === 'right' ? 0 : T, wall === 'right' ? T : 0);

export const room: RoomArt = {
  draw(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    const k = new Kit(v.pen, v.at, v.s);
    v.pen.save();
    floor(k, v, plan);
    for (const wall of ['right', 'left'] as const) wallFace(new Kit(v.pen, wallAt(v.at, wall, v.T), v.s), v, plan, wall);
    shell(k, v);
    v.pen.restore();
  },
  overlay(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    v.pen.save();
    ball(new Kit(v.pen, v.at, v.s), v, plan);
    flicker(v, plan);
    v.pen.restore();
  },
  // What moves in the shell, under the dancers and whatever stands before
  // the walls, round a loop of four beats (two seconds; the scene keeps
  // each picture of it): the dance floor's tiles lighting up (on with the
  // lights off too: lit from under its glass), and with the lights on the
  // moving heads' beams sweeping it and the ball's sparkles on the walls
  // (the rig's light thrown back: gone with it).
  floor(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    v.pen.save();
    const k = new Kit(v.pen, v.at, v.s);
    if (plan.dance) danceTiles(k, plan.dance, v.t);
    if (lampsOn(v)) {
      beams(k, v, plan);
      for (const wall of ['right', 'left'] as const) sparkles(new Kit(v.pen, wallAt(v.at, wall, v.T), v.s), v, wall);
    }
    v.pen.restore();
  },
  // The light the shell gives (see RoomLight): each neon sign and the fire
  // exit's sign (glows, on all night), the dance floor lit from under its
  // glass, and the moving heads on the truss (lamps: house lights, out at
  // night). The stations and the jukebox and totems give their own.
  lights(v): RoomLight[] {
    const plan = planFor(v.W, v.D, v.H, v.T);
    const out: RoomLight[] = [];
    for (const f of [...plan.features, ...plan.over]) {
      if (f.kind === 'bay' && f.sign >= 0) out.push({ kind: 'glow', wall: f.wall, u: f.a, v: 0.5, z: plan.sign.z, color: signColor(f.sign), r: 8, strength: 0.55, halo: 0.8 * (f.r ?? plan.sign.r) });
      else if (f.kind === 'exit') out.push({ kind: 'glow', wall: f.wall, u: f.a, v: 0.7, z: EXIT_SIGN, color: '#3cff8a', r: 5, strength: 0.4, halo: 1.6 });
    }
    for (const wall of ['right', 'left'] as const) {
      for (const c of rig(plan, wall, v.T, wall === 'right' ? v.W : v.D)) if (c.head) out.push({ kind: 'lamp', wall, u: c.a, v: 1.9, z: v.H - TRUSS - 2.8, color: c.c, r: 10, strength: 0.4, halo: 0 });
    }
    const d = plan.dance;
    if (d) {
      const size = d.n * TILE;
      out.push({ kind: 'glow', wall: 'right', u: d.x0 + size / 2, v: d.y0 + size / 2 - v.T, z: 0.4, color: '#c46cff', r: Math.min(40, size * 0.85), strength: 0.7, halo: Math.min(12, size * 0.3) });
    }
    return out;
  },
};

// ── floor ──────────────────────────────────────────────────────────────────

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], C.concrete, 0);
  // Slab joints, and a few darker slabs.
  const SL = 16;
  pen.beginPath();
  for (let i = 0; T + i * SL < W; i++) for (let j = 0; T + j * SL < D; j++) {
    if (hash(i, j, 41) > 0.22) continue;
    const x0 = T + i * SL;
    const y0 = T + j * SL;
    k.trace([[x0, y0, 0], [Math.min(W, x0 + SL), y0, 0], [Math.min(W, x0 + SL), Math.min(D, y0 + SL), 0], [x0, Math.min(D, y0 + SL), 0]]);
  }
  pen.fillStyle = '#2a223218';
  pen.fill();
  pen.beginPath();
  for (let x = T + SL; x < W; x += SL) {
    const [a, b] = [k.p(x, T, 0), k.p(x, D, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  for (let y = T + SL; y < D; y += SL) {
    const [a, b] = [k.p(T, y, 0), k.p(W, y, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  pen.strokeStyle = '#231c2a88';
  pen.lineWidth = Math.max(0.7, 0.1 * s);
  pen.lineCap = 'butt';
  pen.stroke();
  // Shade: darker toward the walls' feet and the far corner.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  g.addColorStop(0, '#0a051055');
  g.addColorStop(0.35, '#0a051018');
  g.addColorStop(0.7, '#0a051000');
  g.addColorStop(1, '#0a051030');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    wk.poly([[T, 0, 0], [end, 0, 0], [end, 4, 0], [T, 4, 0]], wk.lgrad([0, 0, 0], [0, 4, 0], [1, 0, 0], [[0, '#0a051088'], [0.4, '#0a051030'], [1, '#0a051000']]), 0);
    // the neon strip caught in the polish along the wall's foot: a soft
    // falloff and a crisp line, as a gloss reads
    pen.save();
    pen.globalCompositeOperation = 'screen';
    wk.poly([[T, 0.5, 0], [end, 0.5, 0], [end, 9, 0], [T, 9, 0]], wk.lgrad([0, 0.5, 0], [0, 9, 0], [1, 0, 0], [[0, withAlpha(STRIPS[wall], 0.24)], [0.4, withAlpha(STRIPS[wall], 0.08)], [1, withAlpha(STRIPS[wall], 0)]]), 0);
    wk.line([[T + 0.6, 1.3, 0.01], [end - 0.4, 1.3, 0.01]], withAlpha(STRIPS[wall], 0.3), Math.max(1, 0.16 * s));
    pen.restore();
  }
  const slot = (kind: Slot['kind']) => plan.L.slots.find((q) => q.kind === kind);
  const idle = slot('idle');
  if (idle) rug(new Kit(pen, frame(v.at, idle.wall, idle.x0, idle.y0), s), idle.len / 2, idle.dep / 2 - 0.5, Math.max(idle.len, idle.dep) * 0.62);
  if (plan.dance) {
    confetti(k, plan.dance);
    danceFrame(k, plan.dance);
  }
  // (The light the stations, the signs and the dance floor lay on the
  // floor is declared: room.lights, the stations' own.)
}

// Confetti and glitter trodden into the concrete round the dance floor,
// thinning out away from it; one path a colour.
function confetti(k: Kit, d: Dance): void {
  const size = d.n * TILE;
  const cx = d.x0 + size / 2;
  const cy = d.y0 + size / 2;
  const R = size / 2 + 12;
  if (!k.seenBox(cx - R, cy - R, 0, cx + R, cy + R, 0, 4)) return;
  const n = Math.round(size * 7);
  const paths = NEONS.map(() => [] as Array<[number, number, number]>);
  for (let i = 0; i < n; i++) {
    const a = hash(i, 51) * Math.PI * 2;
    const r = size * 0.45 + Math.pow(hash(i, 52), 1.6) * 14;
    paths[i % NEONS.length].push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, hash(i, 53) * Math.PI]);
  }
  const { pen } = k;
  const w = 0.32;
  paths.forEach((list, j) => {
    pen.beginPath();
    for (const [x, y, th] of list) {
      const dx = Math.cos(th) * w;
      const dy = Math.sin(th) * w;
      k.trace([[x - dx, y - dy, 0.02], [x - dy * 0.5, y + dx * 0.5, 0.02], [x + dx, y + dy, 0.02], [x + dy * 0.5, y - dx * 0.5, 0.02]]);
    }
    pen.fillStyle = withAlpha(NEONS[j], 0.75);
    pen.fill();
  });
}

// A round plum rug with a tufted ring and a fringe of lighter pile.
function rug(k: Kit, cu: number, cv: number, r: number): void {
  if (!k.seenBox(cu - r, cv - r, 0, cu + r, cv + r, 0, 4)) return;
  const z = 0.05;
  k.shadow(cu, cv, r * 1.05, r * 1.05, 0.12);
  const rings: Color[] = ['#4b2357', '#6a2f73', '#55285f', '#7c3a83', '#4b2357'];
  rings.forEach((c, i) => k.disc(cu, cv, z, r * (1 - i * 0.17), c, i === 0 ? k.thin : 0));
  if (k.fine) {
    k.pen.beginPath();
    for (let i = 0; i < 40; i++) {
      const th = (i / 40) * Math.PI * 2;
      const [x0, y0] = k.p(cu + Math.cos(th) * r * 0.9, cv + Math.sin(th) * r * 0.9, z);
      const [x1, y1] = k.p(cu + Math.cos(th) * r * 0.98, cv + Math.sin(th) * r * 0.98, z);
      k.pen.moveTo(x0, y0);
      k.pen.lineTo(x1, y1);
    }
    k.pen.strokeStyle = '#9a5aa266';
    k.pen.lineWidth = 0.12 * k.s;
    k.pen.stroke();
  }
}

// The dance floor's steel frame and the dark glass in it, a step up from
// the concrete (the base: its tiles light up in room.floor, see
// danceTiles).
function danceFrame(k: Kit, d: Dance): void {
  const size = d.n * TILE;
  const { x0, y0 } = d;
  const x1 = x0 + size;
  const y1 = y0 + size;
  if (!k.seenBox(x0 - 8, y0 - 8, 0, x1 + 8, y1 + 8, 0.5, 4)) return;
  k.shadow(x0 + size / 2, y0 + size / 2, size * 0.62, size * 0.62, 0.25);
  k.box(x0 - 0.7, y0 - 0.7, 0, size + 1.4, size + 1.4, FRAME, C.steelDark, { line: k.lw, top: '#8a86a0' });
  k.poly([[x0, y0, FRAME + 0.01], [x1, y0, FRAME + 0.01], [x1, y1, FRAME + 0.01], [x0, y1, FRAME + 0.01]], '#120c1a', 0);
  k.line([[x0 - 0.7, y1 + 0.7, FRAME], [x1 + 0.7, y1 + 0.7, FRAME], [x1 + 0.7, y0 - 0.7, FRAME]], C.cyan, Math.max(1, 0.16 * k.s));
}

const FRAME = 0.35; // the dance floor's frame, how far it stands up

// How bright tile (i, j) of an n x n floor is (0..1) at clock t: the chase
// on the club's 120 BPM, one pattern a beat, round a loop of four beats
// (two seconds: the scene keeps each picture of it, see RoomArt.floor) —
// a ripple out from the middle, the checker flipping, a sweep corner to
// corner, a chase round the rim — each lit on the kick and fading.
export function tileGlow(i: number, j: number, n: number, t: number): number {
  const b = Math.floor(t / BEAT);
  const p = t / BEAT - b;
  const c = (n - 1) / 2;
  const ring = Math.max(Math.abs(i - c), Math.abs(j - c));
  const near = (d: number, w: number) => Math.max(0, 1 - Math.abs(d) / w);
  let g: number;
  switch (((b % 4) + 4) % 4) {
    case 0: // a ripple out from the middle
      g = near(ring - p * (c + 1), 0.9);
      break;
    case 1: // the checker, flipping halfway
      g = (i + j) % 2 === (p < 0.5 ? 0 : 1) ? 1 : 0.12;
      break;
    case 2: // a sweep from the back corner to the front
      g = near((i + j) / Math.max(1, 2 * (n - 1)) - p * 1.3 + 0.15, 0.22);
      break;
    default: {
      // a chase round the rim, a tail behind it; the middle glows low
      if (ring < c - 0.01) {
        g = 0.18;
        break;
      }
      // tile k of the rim's per, counted round it; the head at p of the way
      const per = Math.max(1, 4 * (n - 1));
      const k = i === 0 ? j : j === n - 1 ? n - 1 + i : i === n - 1 ? 3 * (n - 1) - j : 4 * (n - 1) - i;
      g = near((p * per - k + per) % per, 3.5);
    }
  }
  // never dark: the whole floor glows low under the pattern
  return Math.min(1, (0.28 + 0.72 * g) * (0.7 + 0.3 * kick(t)));
}

// The dance floor's glass tiles lit from under at clock t (see tileGlow),
// each in its ring's colour: by colour and level, one path each (the
// glass, a bright core on the brightest), a sheen along their back edges,
// the bloom over it all and the mirror ball's flecks.
function danceTiles(k: Kit, d: Dance, t: number): void {
  const { pen } = k;
  const size = d.n * TILE;
  const { x0, y0 } = d;
  const cx = x0 + size / 2;
  const cy = y0 + size / 2;
  const c = (d.n - 1) / 2;
  const LEVELS = 4;
  const groups = new Map<string, { glass: Array<[number, number]>; color: Color; level: number }>();
  for (let i = 0; i < d.n; i++) {
    for (let j = 0; j < d.n; j++) {
      const ring = Math.round(Math.max(Math.abs(i - c), Math.abs(j - c)));
      const color = NEONS[(ring + 1) % NEONS.length];
      const level = Math.round(tileGlow(i, j, d.n, t) * LEVELS);
      const key = `${color}|${level}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { glass: [], color, level }));
      g.glass.push([x0 + i * TILE, y0 + j * TILE]);
    }
  }
  const zt = FRAME + 0.02;
  const m = 0.22;
  for (const g of groups.values()) {
    const lv = g.level / LEVELS;
    pen.beginPath();
    for (const [x, y] of g.glass) k.trace([[x + m, y + m, zt], [x + TILE - m, y + m, zt], [x + TILE - m, y + TILE - m, zt], [x + m, y + TILE - m, zt]]);
    pen.fillStyle = mix(mix(g.color, '#1a1226', 0.84), mix(g.color, '#2a1238', 0.3), lv);
    pen.fill();
    if (lv < 0.7) continue;
    const q = 1.0;
    pen.beginPath();
    for (const [x, y] of g.glass) k.trace([[x + q, y + q, zt], [x + TILE - q, y + q, zt], [x + TILE - q, y + TILE - q, zt], [x + q, y + TILE - q, zt]], 0.35);
    pen.fillStyle = mix(g.color, '#ffffff', 0.2 + 0.4 * (lv - 0.7));
    pen.fill();
  }
  // a sheen along each tile's back edges
  pen.beginPath();
  for (let i = 0; i < d.n; i++) {
    for (let j = 0; j < d.n; j++) {
      const x = x0 + i * TILE;
      const y = y0 + j * TILE;
      for (const [p, q] of [[[x + TILE - m, y + m], [x + m, y + m]], [[x + m, y + m], [x + m, y + TILE - m]]] as const) {
        const [a0, b0] = k.p(p[0], p[1], zt);
        const [a1, b1] = k.p(q[0], q[1], zt);
        pen.moveTo(a0, b0);
        pen.lineTo(a1, b1);
      }
    }
  }
  pen.strokeStyle = '#ffffff30';
  pen.lineWidth = Math.max(0.7, 0.12 * k.s);
  pen.lineCap = 'round';
  pen.stroke();
  // the bloom over it all, swelling on the kick, and the mirror ball's
  // light thrown down on it in a ring of flecks
  k.pool(cx, cy, size * 0.62, size * 0.62, '#ff8ad8', 0.16 + 0.1 * kick(t), zt);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + hash(i, 48) * 0.5;
    const rr = size * (0.26 + hash(i, 49) * 0.14);
    const e = k.ell(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, zt + 0.01, 0.3);
    pen.beginPath();
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
    pen.fillStyle = '#ffffff59';
    pen.fill();
  }
}

// ── the light show ───────────────────────────────────────────────────────────
// The two moving heads nearest the dance floor on each wall sweep their
// beams across and round it, a pair mirroring each other (crossing in the
// middle), each wall's pair a quarter turn behind the other's: a figure of
// eight round the floor loop's four beats (SWEEP seconds), each beam a
// slim soft cone through the haze, its gobo landing and turning on the
// floor. Drawn in room.floor, under what stands in its way; off with the
// lights.
const SWEEP = 4 * BEAT;

function beams(k: Kit, v: RoomView, plan: Plan): void {
  const d = plan.dance;
  if (!d) return;
  const { pen, s } = k;
  const size = d.n * TILE;
  const cx = d.x0 + size / 2;
  const cy = d.y0 + size / 2;
  const th = ((((v.t % SWEEP) + SWEEP) % SWEEP) / SWEEP) * Math.PI * 2;
  (['right', 'left'] as const).forEach((wall, w) => {
    const end = wall === 'right' ? v.W : v.D;
    const along = wall === 'right' ? cx : cy;
    const heads = rig(plan, wall, v.T, end)
      .filter((c) => c.head)
      .sort((p, q) => Math.abs(p.a - along) - Math.abs(q.a - along))
      .slice(0, 2)
      .sort((p, q) => p.a - q.a);
    heads.forEach((h, j) => {
      const ph = th + (w * Math.PI) / 2;
      // along the wall and out from it, from the dance floor's middle
      const a = size * 0.3 * Math.sin(ph) * (j ? -1 : 1);
      const o = size * 0.2 * Math.sin(2 * ph);
      const [fx, fy] = wall === 'right' ? [cx + a, cy + o] : [cx + o, cy + a];
      const z = v.H - TRUSS - 0.6 - 2.4;
      const src: [number, number, number] = wall === 'right' ? [h.a, v.T + 2.3, z] : [v.T + 2.3, h.a, z];
      if (!k.seen([src, [fx, fy, 0]], 4 * s)) return;
      const [sx, sy] = k.p(...src);
      const [tx, ty] = k.p(fx, fy, 0);
      const l = Math.hypot(tx - sx, ty - sy) || 1;
      const px = -(ty - sy) / l;
      const py = (tx - sx) / l;
      const ws = 0.3 * s;
      const wf = 1.5 * s;
      pen.save();
      pen.globalCompositeOperation = 'screen';
      const g = pen.createLinearGradient(sx, sy, tx, ty);
      g.addColorStop(0, withAlpha(h.c, 0.26));
      g.addColorStop(0.5, withAlpha(h.c, 0.1));
      g.addColorStop(1, withAlpha(h.c, 0.05));
      pen.beginPath();
      pen.moveTo(sx + px * ws, sy + py * ws);
      pen.lineTo(tx + px * wf, ty + py * wf);
      pen.lineTo(tx - px * wf, ty - py * wf);
      pen.lineTo(sx - px * ws, sy - py * ws);
      pen.closePath();
      pen.fillStyle = g;
      pen.fill();
      pen.restore();
      gobo(k, fx, fy, h.c, 2 * th + j * Math.PI);
    });
  });
}

// Where a beam lands: its gobo's pattern on the floor, a soft disc ringed
// with six spots round a bright middle, turned by `turn`.
function gobo(k: Kit, x: number, y: number, c: Color, turn: number): void {
  k.pool(x, y, 3.0, 3.0, c, 0.2);
  for (let i = 0; i < 6; i++) {
    const a = turn + (i / 6) * Math.PI * 2;
    k.pool(x + Math.cos(a) * 2.0, y + Math.sin(a) * 2.0, 0.7, 0.7, c, 0.55);
  }
  k.pool(x, y, 1.0, 1.0, '#ffffff', 0.4);
}

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { pen } = k;
  const { W, D, H, T } = v;
  const cap = C.cap;
  k.poly([[T, D, 0], [W, D, 0], [W, D, -SLAB], [T, D, -SLAB]], k.side('#2a2431', 0, 1), k.lw);
  k.poly([[W, T, 0], [W, D, 0], [W, D, -SLAB], [W, T, -SLAB]], k.side('#2a2431', 1, 0), k.lw);
  k.line([[T, D, -0.35], [W, D, -0.35], [W, T, -0.35]], '#5a5266', Math.max(1, 0.25 * k.s));
  // the walls' cut ends: brick through
  k.poly([[0, D, -SLAB], [T, D, -SLAB], [T, D, H], [0, D, H]], k.side(C.brick, 0, 1), k.lw);
  k.poly([[W, 0, -SLAB], [W, T, -SLAB], [W, T, H], [W, 0, H]], k.side(C.brick, 1, 0), k.lw);
  for (const [p, q] of [[[0, D], [T, D]], [[W, 0], [W, T]]] as const) {
    if (!k.seen([[p[0], p[1], 0], [q[0], q[1], H]], 4)) continue;
    pen.beginPath();
    for (let z = 1; z < H - 0.3; z += 1) {
      const [x0, y0] = k.p(p[0] + (q[0] - p[0]) * 0.04, p[1] + (q[1] - p[1]) * 0.04, z);
      const [x1, y1] = k.p(p[0] + (q[0] - p[0]) * 0.96, p[1] + (q[1] - p[1]) * 0.96, z);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = '#2a1626aa';
    pen.lineWidth = Math.max(0.6, 0.1 * k.s);
    pen.stroke();
  }
  k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], cap, k.lw);
  k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], shade(cap, 0.3), Math.max(1, 0.2 * k.s));
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.5), k.thin);
}

// ── per frame, over everyone's heads ─────────────────────────────────────────

// Where the mirror ball hangs (world units) and how big it is: high, its
// top 1.5 under the walls' tops, up in the dark over the furniture, so it
// hangs over the room rather than sitting on whatever stands behind it.
export function ballAt(plan: Plan): { x: number; y: number; z: number; r: number } {
  const { L } = plan;
  const d = plan.dance;
  const x = d ? d.x0 + (d.n * TILE) / 2 : L.T + (L.W - L.T) * 0.55;
  const y = d ? d.y0 + (d.n * TILE) / 2 : L.T + (L.D - L.T) * 0.55;
  const r = Math.max(2.2, Math.min(4.8, L.H / 15));
  return { x, y, z: Math.max(22, Math.min(40, L.H - 1.5 - r)), r };
}

// The mirror ball: a solid chain up past the walls' tops into the dark, a
// sphere of tiny mirrors turning, each catching the light as it comes
// round.
function ball(k: Kit, v: RoomView, plan: Plan): void {
  const b = ballAt(plan);
  const { pen, s } = k;
  const [cx, cy] = k.p(b.x, b.y, b.z);
  const R = b.r * s;
  const hook = Math.max(b.z + b.r + 3, v.H + 2);
  const [rx, ry] = k.p(b.x, b.y, hook);
  const [tx, ty] = k.p(b.x, b.y, hook + 2);
  const g = pen.createLinearGradient(tx, ty, rx, ry);
  g.addColorStop(0, '#b9b4cf00');
  g.addColorStop(1, '#b9b4cf');
  pen.lineCap = 'round';
  pen.beginPath();
  pen.moveTo(tx, ty);
  pen.lineTo(rx, ry);
  pen.strokeStyle = g;
  pen.lineWidth = Math.max(1, 0.18 * s);
  pen.stroke();
  // the chain: inked links down to the ball's cap
  pen.beginPath();
  pen.moveTo(rx, ry);
  pen.lineTo(cx, cy - R);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(2.4, 0.34 * s);
  pen.stroke();
  pen.strokeStyle = '#b9b4cf';
  pen.lineWidth = Math.max(1.5, 0.18 * s);
  pen.stroke();
  const link = Math.max(3, 0.7 * s);
  pen.beginPath();
  for (let y = ry + link * 0.5; y < cy - R - link * 0.3; y += link) {
    pen.moveTo(cx - 0.16 * s, y);
    pen.lineTo(cx + 0.16 * s, y);
  }
  pen.strokeStyle = '#c8c4dc';
  pen.lineWidth = Math.max(0.7, 0.1 * s);
  pen.stroke();
  // the cap the chain hooks into
  pen.beginPath();
  pen.ellipse(cx, cy - R * 0.97, Math.max(1.5, 0.45 * s), Math.max(1, 0.22 * s), 0, 0, Math.PI * 2);
  pen.fillStyle = '#5f5a72';
  pen.fill();
  softDot(pen, cx, cy, R * 2.4, '#d8c8ff', 0.22);
  // the sphere, then its mirrors band by band
  pen.beginPath();
  pen.arc(cx, cy, R, 0, Math.PI * 2);
  const body = pen.createRadialGradient(cx - R * 0.35, cy - R * 0.4, 0, cx, cy, R);
  body.addColorStop(0, '#e8e6f4');
  body.addColorStop(0.6, '#9a96b4');
  body.addColorStop(1, '#4a4660');
  pen.fillStyle = body;
  pen.fill();
  const spin = v.t * 0.9;
  const BANDS = 7;
  const lit: Array<[number, number, number, number, number, number, number, number]> = [];
  for (let i = 0; i < BANDS; i++) {
    const la0 = -Math.PI / 2 + (i * Math.PI) / BANDS;
    const la1 = la0 + Math.PI / BANDS;
    const m = Math.max(4, Math.round(Math.cos((la0 + la1) / 2) * 14));
    for (let j = 0; j < m; j++) {
      const lo0 = ((j / m) * Math.PI * 2 + spin) % (Math.PI * 2);
      const lo1 = lo0 + (Math.PI * 2) / m;
      // front half only (sin of longitude > 0 faces us)
      if (Math.sin(lo0) < 0.05 || Math.sin(lo1) < 0.05) continue;
      const P = (la: number, lo: number): [number, number] => [cx + Math.cos(la) * Math.cos(lo) * R * 0.97, cy - Math.sin(la) * R * 0.97];
      const q = [P(la0, lo0), P(la0, lo1), P(la1, lo1), P(la1, lo0)];
      const flash = hash(i, Math.floor((j * 7 + Math.floor(v.t * 6)) % 23), 47);
      if (flash < 0.18) lit.push([...q[0], ...q[1], ...q[2], ...q[3]] as typeof lit[number]);
      else {
        pen.beginPath();
        q.forEach(([x, y], n) => (n ? pen.lineTo(x, y) : pen.moveTo(x, y)));
        pen.closePath();
        pen.strokeStyle = '#3a364c66';
        pen.lineWidth = Math.max(0.5, 0.06 * s);
        pen.stroke();
      }
    }
  }
  pen.beginPath();
  for (const q of lit) {
    pen.moveTo(q[0], q[1]);
    pen.lineTo(q[2], q[3]);
    pen.lineTo(q[4], q[5]);
    pen.lineTo(q[6], q[7]);
    pen.closePath();
  }
  pen.fillStyle = '#ffffff';
  pen.fill();
  pen.beginPath();
  pen.arc(cx, cy, R, 0, Math.PI * 2);
  pen.strokeStyle = INK;
  pen.lineWidth = k.lw;
  pen.stroke();
  // a glint on its lit shoulder
  const gx = cx - R * 0.4;
  const gy = cy - R * 0.45;
  pen.beginPath();
  pen.moveTo(gx - R * 0.5, gy);
  pen.lineTo(gx + R * 0.5, gy);
  pen.moveTo(gx, gy - R * 0.5);
  pen.lineTo(gx, gy + R * 0.5);
  pen.strokeStyle = '#ffffffcc';
  pen.lineWidth = Math.max(0.8, 0.12 * s);
  pen.stroke();
}

// The ball's sparkles on a wall between the strip and the truss: each
// fades in, drifts a few units the way the ball turns and fades out round
// the floor loop's two seconds (see room.floor), their phases spread so
// some are always lit, twinkling.
function sparkles(k: Kit, v: RoomView, wall: Wall): void {
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  const len = end - T - 2;
  const z0 = STRIP + 2.5;
  const z1 = H - TRUSS - 3.5;
  if (len < 10 || z1 - z0 < 2) return;
  const n = Math.max(5, Math.min(22, Math.round(len / 10)));
  const dir = wall === 'right' ? -1 : 1;
  const { pen, s } = k;
  const tint: Color[] = ['#ffffff', '#ffd0f0', '#c8f8ff', '#ffffff', '#f0ffd0'];
  for (let i = 0; i < n; i++) {
    const salt = wall === 'right' ? 61 : 62;
    // how far round its own two seconds: in, across, out
    const u = (((v.t / SWEEP + hash(i, salt, 1)) % 1) + 1) % 1;
    const a = T + 1 + hash(i, salt, 2) * (len - 6) + 3 + dir * (u - 0.5) * 6;
    const z = z0 + hash(i, salt, 3) * (z1 - z0);
    const tw = Math.sin(Math.PI * u) * (0.7 + 0.3 * Math.sin((2 * Math.PI * (2 + (i % 3)) * v.t) / SWEEP + i * 2.1));
    if (tw <= 0.02) continue;
    const [x, y] = k.p(a, 0.1, z);
    if (x < -8 || y < -8 || x > pen.width + 8 || y > pen.height + 8) continue;
    const c = tint[i % tint.length];
    softDot(pen, x, y, Math.max(3.5, 1.4 * s), c, 0.55 * tw);
    const r = Math.max(2.2, 0.6 * s) * (0.7 + 0.3 * tw);
    pen.beginPath();
    pen.moveTo(x - r, y);
    pen.lineTo(x + r, y);
    pen.moveTo(x, y - r * 1.2);
    pen.lineTo(x, y + r * 1.2);
    pen.strokeStyle = withAlpha(c, 0.9 * tw);
    pen.lineWidth = Math.max(0.7, 0.1 * s);
    pen.lineCap = 'round';
    pen.stroke();
  }
}

// A sign whose second tube is on the blink: off for a beat now and then.
function flicker(v: RoomView, plan: Plan): void {
  const f = plan.features.find((q) => q.flaky && q.sign >= 0);
  if (!f) return;
  const step = Math.floor(v.t * 6);
  const off = hash(step, 71) < 0.12 || (hash(Math.floor(v.t / 3), 72) < 0.3 && step % 2 === 0);
  if (!off) return;
  const k = new Kit(v.pen, wallAt(v.at, f.wall, v.T), v.s);
  // as walls.ts hangs it: on a board, or on the brick
  sign(k, f.sign, f.a, fh(f, 1) < 0.45 ? 0.55 : 0.4, plan.sign.z, f.r ?? plan.sign.r, false, 1);
}

