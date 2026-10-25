import { shade } from '../../art/iso.ts';
import type { Particle } from '../../world/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { ball, barrel, blaze, crate, crystal, heap, icicles, lantern, log, rock, sack } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, INK, due, ember, flake, hash, kitOf, withAlpha } from './kit.ts';

// Snowy Depths' things between the stations: a snowman in a wizard's hat,
// clusters of ice crystals, a sled loaded for the trail, a stack of
// firewood with an axe in the block, braziers, a heap of snow under a crack
// in the roof with snow sifting down through a shaft of light, a fox's den
// and a stack of cut ice blocks. All still (drawn once into the scene's
// static layer), each on its own soft shadow, varied by the placement's
// seed; the braziers send up embers and the crack lets the snow in.

type Spawn = (p: Particle) => void;

// ── a snowman ───────────────────────────────────────────────────────────────
// Three balls of packed snow, coal eyes and buttons, a carrot nose, a red
// scarf and twig arms, and on top a wizard's hat (this is a wizards' cave).
const snowman: PropArt = {
  len: 4,
  dep: 4,
  height: 13,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2;
    k.shadow(c, c, 2.1, 2.1, 0.28);
    heap(k, c, c, 0, 2.0, 0.6, v.seed, C.snow, k.thin);
    // the far arm, then the balls, then the near arm
    const arm = (side: number) => {
      const a: P3 = [c - side * 0.9, c + side * 0.9, 4.5];
      k.rod([a, [c - side * 2.0, c + side * 1.9, 5.8], [c - side * 2.3, c + side * 2.0, 6.5]], C.woodDark, 0.12);
      k.rod([[c - side * 1.8, c + side * 1.75, 5.6], [c - side * 1.7, c + side * 2.0, 6.2]], C.woodDark, 0.09);
    };
    arm(1);
    ball(k, c, c, 1.7, 1.75);
    ball(k, c, c, 4.4, 1.3);
    // buttons down the front
    for (const z of [3.7, 4.5]) {
      const [x, y] = k.p(c + 0.95, c + 0.95, z);
      k.pen.beginPath();
      k.pen.arc(x, y, Math.max(0.9, 0.17 * k.s), 0, Math.PI * 2);
      k.pen.fillStyle = C.coal;
      k.pen.fill();
    }
    // the scarf, its tail hanging
    const tone = hash(v.seed, 1) < 0.5 ? C.wool : C.teal;
    const e = k.ell(c, c, 5.55, 1.05);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry * 1.25, 0, 0, Math.PI * 2);
    k.paint(tone, k.thin);
    k.poly([[c + 0.5, c + 0.9, 5.5], [c + 0.95, c + 0.85, 5.4], [c + 1.1, c + 0.9, 3.6], [c + 0.6, c + 0.95, 3.8]], shade(tone, -0.1), k.thin, 0.1);
    k.line([[c + 0.62, c + 0.97, 4.1], [c + 1.05, c + 0.95, 4.0]], C.furWhite, Math.max(0.8, 0.14 * k.s));
    ball(k, c, c, 6.55, 0.95);
    // the face: coal eyes and smile, the carrot
    const face = (du: number, dz: number): [number, number] => k.p(c + 0.62 + du, c + 0.62 - du, 6.55 + dz);
    k.pen.beginPath();
    for (const [du, dz, r] of [[-0.3, 0.25, 0.13], [0.3, 0.25, 0.13], [-0.35, -0.3, 0.07], [-0.12, -0.42, 0.07], [0.12, -0.42, 0.07], [0.35, -0.3, 0.07]] as const) {
      const [x, y] = face(du, dz);
      k.pen.moveTo(x + r * k.s, y);
      k.pen.arc(x, y, Math.max(0.6, r * k.s), 0, Math.PI * 2);
    }
    k.pen.fillStyle = C.coal;
    k.pen.fill();
    const [nx, ny] = face(0, 0);
    k.pen.beginPath();
    k.pen.moveTo(nx - 0.12 * k.s, ny - 0.15 * k.s);
    k.pen.lineTo(nx + 1.0 * k.s, ny + 0.25 * k.s);
    k.pen.lineTo(nx - 0.05 * k.s, ny + 0.18 * k.s);
    k.pen.closePath();
    k.paint(C.carrot, k.thin * 0.8);
    // the hat: a brim, a bent cone, a band and a star
    const hz = 7.3;
    k.disc(c, c, hz, 1.45, C.navy, k.thin);
    const b = k.ell(c, c, hz + 0.1, 0.9);
    const [tx, ty] = k.p(c - 0.4, c - 0.4, hz + 3.8);
    const [mx, my] = k.p(c, c, hz + 2.2);
    k.pen.beginPath();
    k.pen.moveTo(b.cx - b.rx, b.cy);
    k.pen.quadraticCurveTo(mx - b.rx * 0.5, my, tx, ty);
    k.pen.quadraticCurveTo(mx + b.rx * 0.3, my + 0.3 * k.s, b.cx + b.rx, b.cy);
    k.pen.ellipse(b.cx, b.cy, b.rx, b.ry, 0, 0, Math.PI);
    k.pen.closePath();
    const g = k.pen.createLinearGradient(b.cx - b.rx, 0, b.cx + b.rx, 0);
    g.addColorStop(0, shade(C.navy, 0.2));
    g.addColorStop(1, shade(C.navy, -0.25));
    k.paint(g, k.lw);
    k.pen.beginPath();
    k.pen.ellipse(b.cx, b.cy - 0.25 * k.s, b.rx * 0.95, b.ry * 0.9, 0, 0, Math.PI);
    k.pen.strokeStyle = C.mustard;
    k.pen.lineWidth = Math.max(1, 0.24 * k.s);
    k.pen.stroke();
    star(k, mx + 0.1 * k.s, my + 0.4 * k.s, 0.32 * k.s);
    arm(-1);
  },
};

// A five-pointed star, r px across.
function star(k: ReturnType<typeof kitOf>, x: number, y: number, r: number): void {
  const pen = k.pen;
  pen.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const q = i & 1 ? r * 0.45 : r;
    if (i) pen.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
    else pen.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  pen.closePath();
  pen.fillStyle = '#ffd86a';
  pen.fill();
}

// ── a cluster of ice crystals ───────────────────────────────────────────────
// Blue-white crystals grown up through the snow round a frozen boulder,
// glowing faintly.
const crystals: PropArt = {
  len: 5,
  dep: 5,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2.5, 2.4, 2.4, 0.22);
    k.halo(2.5, 2.5, 3.4, 2.6, '#9fe6ff', 0.3);
    rock(k, 1.7, 1.6, 0, 1.2, 1.4, v.seed, true, C.rockDark);
    const list: Array<{ u: number; v: number; h: number; r: number; lu: number; lv: number }> = [];
    const n = 5 + Math.floor(hash(v.seed, 1) * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash(v.seed, i, 2);
      const d = i === 0 ? 0 : 0.7 + hash(v.seed, i, 3) * 0.6;
      const u = 2.6 + Math.cos(a) * d;
      const w = 2.7 + Math.sin(a) * d;
      list.push({ u, v: w, h: i === 0 ? 5.2 : 1.4 + hash(v.seed, i, 4) * 3, r: i === 0 ? 0.62 : 0.32 + hash(v.seed, i, 5) * 0.2, lu: (u - 2.6) * 0.35, lv: (w - 2.7) * 0.35 });
    }
    list.sort((p, q) => p.u + p.v - (q.u + q.v));
    heap(k, 2.6, 2.7, 0, 1.9, 0.9, v.seed, C.snow, k.thin);
    for (const c of list) crystal(k, c.u, c.v, 0.4, c.r, c.h, c.lu, c.lv, c.u * 3);
  },
};

// ── a sled loaded for the trail ─────────────────────────────────────────────
// Bent-wood runners curling up at the front, a slatted deck, and on it
// crates, a sack and a coil of rope under a lashing strap; a lantern on the
// back post.
const sled: PropArt = {
  len: 8,
  dep: 4,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4, 2, 4.3, 2.3, 0.26);
    const runner = (w: number) => {
      const pts: P3[] = [[0.5, w, 0.2], [6.6, w, 0.2]];
      for (let i = 1; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 0.9;
        pts.push([6.6 + Math.sin(a) * 0.9, w, 0.2 + (1 - Math.cos(a)) * 0.9]);
      }
      k.rod(pts, C.woodDark, 0.18);
    };
    runner(0.6);
    for (const u of [1.2, 3.4, 5.6]) for (const w of [0.6, 3.4]) k.rod([[u, w, 0.2], [u, w, 1.0]], C.woodDark, 0.14);
    k.box(0.5, 0.4, 1.0, 6.6, 3.2, 0.28, C.woodLight, { stripe: false });
    k.pen.beginPath();
    for (let u = 1.4; u < 7; u += 0.95) k.run([[u, 0.4, 1.29], [u, 3.6, 1.29]]);
    k.pen.strokeStyle = shade(C.woodLight, -0.35);
    k.pen.lineWidth = Math.max(0.7, 0.07 * k.s);
    k.pen.stroke();
    // the load
    crate(k, 0.8, 0.7, 1.28, 2.4, 2.5, 1.9, C.woodLight, v.seed);
    crate(k, 1.0, 0.9, 3.18, 1.9, 2.0, 1.3, '#c99a62', v.seed + 1);
    sack(k, 4.4, 1.6, 1.28, 1.0, 1.8, '#c8ab7a', C.wool);
    // a coil of rope
    for (let i = 0; i < 3; i++) {
      const e = k.ell(5.9, 2.6, 1.32 + i * 0.22, 0.75);
      k.pen.beginPath();
      k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
      k.pen.strokeStyle = INK;
      k.pen.lineWidth = Math.max(1.6, 0.34 * k.s);
      k.pen.stroke();
      k.pen.strokeStyle = C.rope;
      k.pen.lineWidth = Math.max(1, 0.22 * k.s);
      k.pen.stroke();
    }
    // the strap over it all, the near runner, the back post and its lantern
    k.line([[2.0, 0.4, 1.3], [2.0, 0.7, 4.5], [2.0, 2.9, 4.5], [2.0, 3.6, 1.3]], C.woolDark, Math.max(1, 0.22 * k.s));
    runner(3.4);
    k.rod([[0.5, 0.6, 1.0], [0.4, 0.6, 3.6]], C.woodDark, 0.14);
    k.rod([[0.5, 3.4, 1.0], [0.4, 3.4, 3.6]], C.woodDark, 0.14);
    k.rod([[0.4, 0.6, 3.6], [0.4, 3.4, 3.6]], C.woodDark, 0.14);
    if (hash(v.seed, 7) < 0.6) lantern(k, 0.5, 2.0, 3.65, false, 0.6);
  },
};

// ── a stack of firewood ─────────────────────────────────────────────────────
// Split logs stacked in a pile under a cap of snow, and a chopping block
// with the axe left in it.
const woodpile: PropArt = {
  len: 6,
  dep: 3,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 1.5, 3.4, 1.8, 0.26);
    const rows: Array<[number, number[]]> = [[0.42, [0.55, 1.45, 2.35]], [1.15, [1.0, 1.9]], [1.85, [1.45]]];
    for (const [z, vs] of rows) for (const w of vs) log(k, [0.3, w, z], [4.3, w, z + (hash(v.seed, w * 10) - 0.5) * 0.1], 0.43, hash(v.seed, z * 10, w * 10) < 0.5 ? C.bark : '#8a6440');
    k.box(0.4, 1.0, 2.15, 3.8, 0.9, 0.35, C.snow, { round: 0.3, stripe: false, line: k.thin });
    icicles(k, 0.6, 4.0, 2.4, 1.0, 0.8, v.seed, 0.6);
    // the block and the axe
    k.shadow(5.2, 1.5, 0.9, 0.8, 0.2);
    k.cyl(5.2, 1.5, 0, 0.62, 1.2, C.bark, { top: '#ddb27a' });
    k.rod([[5.25, 1.5, 1.35], [5.6, 2.2, 3.2]], C.woodLight, 0.13);
    k.poly([[5.0, 1.3, 1.15], [5.5, 1.3, 1.6], [5.65, 1.5, 1.3], [5.3, 1.5, 1.05]], C.ironLight, k.thin);
  },
};

// ── a brazier ───────────────────────────────────────────────────────────────
// An iron basket of coals on three legs, burning: its light warm on the
// snow round it; embers lift off it.
const brazier: PropArt = {
  len: 5,
  dep: 5,
  height: 7,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2.5;
    k.pool(c, c, 2.4, 2.4, '#ff9a48', 0.32, 0, 'source-over');
    k.shadow(c, c, 1.4, 1.4, 0.3);
    for (const a of [0.7, 2.8, 4.9]) k.rod([[c + Math.cos(a) * 1.15, c + Math.sin(a) * 1.15, 0], [c + Math.cos(a) * 0.7, c + Math.sin(a) * 0.7, 2.6]], C.iron, 0.18);
    const e0 = k.ell(c, c, 2.4, 0.7);
    const e1 = k.ell(c, c, 3.5, 1.3);
    const pen = k.pen;
    pen.beginPath();
    pen.moveTo(e1.cx - e1.rx, e1.cy);
    pen.lineTo(e0.cx - e0.rx, e0.cy);
    pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, 0, Math.PI, 0, true);
    pen.lineTo(e1.cx + e1.rx, e1.cy);
    pen.ellipse(e1.cx, e1.cy, e1.rx, e1.ry, 0, 0, Math.PI);
    pen.closePath();
    const g = pen.createLinearGradient(e1.cx - e1.rx, 0, e1.cx + e1.rx, 0);
    g.addColorStop(0, C.ironLight);
    g.addColorStop(1, shade(C.iron, -0.25));
    k.paint(g, k.lw);
    const [cx, cy] = k.p(c, c, 3.5);
    const cg = pen.createRadialGradient(cx, cy, 0, cx, cy, e1.rx);
    cg.addColorStop(0, '#ffe08a');
    cg.addColorStop(0.5, '#ff7a2a');
    cg.addColorStop(1, '#7a2a14');
    k.disc(c, c, 3.5, 1.25, cg, k.thin);
    k.halo(c, c, 4.4, 2.4, '#ff9a48', 0.5);
    blaze(k, c, c, 3.45, 2.4, hash(v.seed, 3) * 6, 1.6);
    // the rim's straps
    k.pen.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      const [x0, y0] = [e0.cx + Math.cos(a) * e0.rx, e0.cy + Math.sin(a) * e0.ry];
      const [x1, y1] = [e1.cx + Math.cos(a) * e1.rx, e1.cy + Math.sin(a) * e1.ry];
      k.pen.moveTo(x0, y0);
      k.pen.lineTo(x1, y1);
    }
    k.pen.strokeStyle = INK;
    k.pen.lineWidth = k.thin;
    k.pen.stroke();
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, 1.4, v.seed);
    for (let i = 0; i < n; i++) spawn(ember(2.5, 2.5, 5, Math.floor(v.t * 10), i, 0.5));
  },
};

// ── a skylight drift ────────────────────────────────────────────────────────
// A heap of snow under a crack in the roof far above: a pale shaft of light
// comes down onto it, and snow sifts down through it (seen from where the
// shaft brightens).
const SHAFT = 26;
const skylight: PropArt = {
  len: 6,
  dep: 6,
  height: SHAFT + 1,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 3;
    // the shaft: a soft column of light, fading out up in the dark
    const [bx, by] = k.p(c, c, 0.5);
    const [, ty] = k.p(c, c, SHAFT);
    const w = 1.9 * k.s;
    const pen = k.pen;
    pen.save();
    pen.globalCompositeOperation = 'screen';
    const g = pen.createLinearGradient(0, ty, 0, by);
    g.addColorStop(0, '#cfe6ff00');
    g.addColorStop(0.55, '#cfe6ff26');
    g.addColorStop(1, '#cfe6ff55');
    pen.beginPath();
    pen.moveTo(bx - w * 0.7, ty);
    pen.lineTo(bx + w * 0.7, ty);
    pen.lineTo(bx + w, by);
    pen.lineTo(bx - w, by);
    pen.closePath();
    pen.fillStyle = g;
    pen.fill();
    pen.restore();
    k.pool(c, c, 2.8, 2.6, '#e6f2ff', 0.35);
    // the heap
    k.shadow(c, c, 2.8, 2.6, 0.18);
    heap(k, c + 1.2, c - 1.1, 0, 1.3, 1.1, v.seed + 1);
    heap(k, c - 0.2, c + 0.3, 0, 2.5, 3.0, v.seed, C.snowHi);
    // flakes resting on it
    pen.beginPath();
    for (let i = 0; i < 7; i++) {
      const [x, y] = k.p(c - 1 + hash(v.seed, i, 1) * 2.4, c - 1 + hash(v.seed, i, 2) * 2.4, 1.2 + hash(v.seed, i, 3) * 1.1);
      pen.moveTo(x + 0.15 * k.s, y);
      pen.arc(x, y, Math.max(0.5, 0.12 * k.s), 0, Math.PI * 2);
    }
    pen.fillStyle = '#ffffff';
    pen.fill();
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, 1.6, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 20) + i;
      spawn(flake(3, 3, 14 + hash(tick, 9) * 4, tick, i, 1.4));
    }
  },
};

// ── a fox's den ─────────────────────────────────────────────────────────────
// A bank of packed snow with a dark burrow dug into its front, a few
// tracks leading out.
const den: PropArt = {
  len: 6,
  dep: 5,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 2.4, 3.2, 2.6, 0.22);
    heap(k, 1.4, 1.3, 0, 1.4, 1.4, v.seed + 2);
    heap(k, 3.0, 2.3, 0, 2.6, 3.3, v.seed, C.snowHi);
    // the burrow, dug into its front, a lip of snow over it
    const [x, y] = k.p(3.0 + 1.75, 2.3 + 1.75, 0.15);
    const w = 0.85 * k.s;
    const hh = 1.25 * k.s;
    const pen = k.pen;
    pen.beginPath();
    pen.moveTo(x - w, y);
    pen.bezierCurveTo(x - w, y - hh * 1.2, x + w, y - hh * 1.2, x + w, y);
    pen.quadraticCurveTo(x, y + w * 0.35, x - w, y);
    pen.closePath();
    const g = pen.createRadialGradient(x, y - hh * 0.2, 0, x, y - hh * 0.4, w * 1.4);
    g.addColorStop(0, '#0b1124');
    g.addColorStop(0.7, '#1c2846');
    g.addColorStop(1, '#40557c');
    k.paint(g, k.lw);
    pen.beginPath();
    pen.moveTo(x - w * 1.25, y - hh * 0.7);
    pen.quadraticCurveTo(x, y - hh * 1.35, x + w * 1.25, y - hh * 0.7);
    pen.quadraticCurveTo(x, y - hh * 1.05, x - w * 1.25, y - hh * 0.7);
    pen.closePath();
    k.paint(C.snowHi, k.thin);
    // tracks out of it
    pen.beginPath();
    for (let i = 0; i < 4; i++) {
      const [px, py] = k.p(3.8 + i * 0.55, 5.0 + (i & 1) * 0.3 - i * 0.05, 0.03);
      pen.moveTo(px + 0.16 * k.s, py);
      pen.ellipse(px, py, 0.16 * k.s, 0.1 * k.s, 0, 0, Math.PI * 2);
    }
    pen.fillStyle = '#8297b6c0';
    pen.fill();
  },
};

// ── cut ice blocks ──────────────────────────────────────────────────────────
// Blocks of ice sawn from the pond and stacked for building, the saw left
// against them.
const iceblocks: PropArt = {
  len: 5,
  dep: 5,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2.5, 2.7, 2.7, 0.24);
    const tone = ['#bfe6f8', '#a9dcf3', '#cdeefb'];
    const blocks: Array<[number, number, number, number, number, number]> = [
      [0.4, 0.4, 0, 2.0, 1.8, 1.4],
      [2.6, 0.5, 0, 2.0, 1.8, 1.4],
      [0.6, 2.5, 0, 2.0, 1.8, 1.4],
      [1.4, 1.2, 1.4, 2.0, 1.8, 1.4],
    ];
    if (hash(v.seed, 1) < 0.5) blocks.splice(2, 0, [2.8, 2.6, 0, 1.8, 1.8, 1.2]);
    blocks.forEach(([u, w, z, du, dv, dz], i) => {
      k.box(u, w, z, du, dv, dz, tone[i % 3], { top: C.frost });
      k.line([[u + 0.3, w + dv, z + dz * 0.25], [u + du * 0.6, w + dv, z + dz * 0.8]], '#ffffffa0', Math.max(0.8, 0.12 * k.s));
    });
    // the saw
    k.poly([[3.6, 4.6, 0.1], [4.4, 4.6, 0.1], [4.6, 4.3, 2.8], [4.1, 4.3, 2.9]], C.tin, k.thin);
    k.pen.beginPath();
    for (let z = 0.3; z < 2.7; z += 0.3) k.run([[3.62 + z * 0.17, 4.6 - z * 0.1, z], [3.5 + z * 0.17, 4.6 - z * 0.1, z + 0.15]]);
    k.pen.strokeStyle = withAlpha(INK, 0.8);
    k.pen.lineWidth = Math.max(0.6, 0.06 * k.s);
    k.pen.stroke();
    k.rod([[4.1, 4.3, 2.9], [4.6, 4.25, 3.6]], C.woodDark, 0.2);
  },
};

// ── a barrel stove-side: supplies under snow ──────────────────────────────
// Two barrels and a crate, snow on their lids.
const stores: PropArt = {
  len: 5,
  dep: 4,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2, 2.8, 2.2, 0.24);
    barrel(k, 1.4, 1.3, 0, 1.0, 2.6, C.wood);
    k.disc(1.4, 1.3, 2.6, 0.8, C.snow, k.thin);
    crate(k, 2.7, 0.4, 0, 2.0, 1.8, 1.6, C.woodLight, v.seed);
    k.box(2.8, 0.5, 1.6, 1.8, 1.6, 0.3, C.snow, { round: 0.3, stripe: false, line: k.thin });
    barrel(k, 2.6, 2.8, 0, 0.85, 2.0, '#8a5a35');
    k.disc(2.6, 2.8, 2.0, 0.7, C.snow, k.thin);
  },
};

// Interleaved so the first few fit in any room.
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: snowman, count: 1, place: 'floor' },
  { art: crystals, count: 2, place: 'floor' },
  { art: sled, count: 1, place: 'floor' },
  { art: brazier, count: 1, place: 'floor' },
  { art: woodpile, count: 1, place: 'floor' },
  { art: skylight, count: 1, place: 'floor' },
  { art: den, count: 1, place: 'floor' },
  { art: iceblocks, count: 1, place: 'floor' },
  { art: stores, count: 1, place: 'floor' },
  // only big rooms have the floor for these
  { art: crystals, count: 2, place: 'floor' },
  { art: brazier, count: 1, place: 'floor' },
  { art: skylight, count: 1, place: 'floor' },
  { art: woodpile, count: 1, place: 'floor' },
  { art: snowman, count: 1, place: 'floor' },
  { art: iceblocks, count: 1, place: 'floor' },
  { art: crystals, count: 2, place: 'floor' },
  { art: stores, count: 1, place: 'floor' },
];

export const DECOR_ART = { snowman, crystals, sled, woodpile, brazier, skylight, den, iceblocks, stores };
