import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { BINDINGS, bookRow, chair, crown, cup, frustum, hull, ivy, jarCandle, leaf, pot, ring, stool } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, due, hash, kitOf, still, wisp } from './kit.ts';

// The café's stations, each a PropArt in its own frame (u along the wall,
// v out toward the agent, z up; the viewer always sees the top, the +v
// front and the +u end). Animated ones paint their still parts through the
// sprite cache (see still) and only the moving bits each frame.

type Spawn = (p: Particle) => void;

const fill = (k: Kit, pts: ReadonlyArray<Pt>, c: Color | Gradient, line = 0) => {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.paint(c, line);
};

// A point on the quad a (u0, z0) - (u1, z1) of the plane v.
const on = (q: readonly [P3, P3, P3, P3], fu: number, fz: number): P3 => {
  const [a, b, , d] = q;
  return [a[0] + (b[0] - a[0]) * fu + (d[0] - a[0]) * fz, a[1] + (b[1] - a[1]) * fu + (d[1] - a[1]) * fz, a[2] + (b[2] - a[2]) * fu + (d[2] - a[2]) * fz];
};

// ── write: a laptop table with a latte ──────────────────────────────────────
// An oak café table against the wall: the laptop (its screen toward the
// agent), a latte, a notebook and a succulent; a bentwood chair pulled out.
// Working wakes the screen, scrolling code and glowing.

const LID: readonly [P3, P3, P3, P3] = [[5.0, 1.75, 7.58], [8.9, 1.75, 7.58], [8.9, 1.0, 10.75], [5.0, 1.0, 10.75]];

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 12,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 12, (k) => {
      k.shadow(5.5, 3.3, 6.4, 3.9, 0.3);
      chair(k, 2.6, 5.4, -Math.PI / 2 - 0.35);
      for (const [u, w] of [[1.0, 1.0], [9.35, 1.0]] as const) k.box(u, w, 0, 0.65, 0.65, 6.6, C.walnut);
      for (const [u, w] of [[1.0, 4.7], [9.35, 4.7]] as const) k.box(u, w, 0, 0.65, 0.65, 6.6, C.walnut);
      k.box(1.0, 1.0, 5.8, 9.0, 4.35, 0.8, C.walnut, { stripe: false });
      k.box(0.5, 0.5, 6.6, 10, 5.4, 0.7, C.honey);
      // notebook and pen, a succulent
      k.box(1.3, 2.7, 7.3, 2.6, 2.0, 0.32, C.mustard, { round: 0.1 });
      k.line([[1.5, 4.72, 7.45], [3.7, 4.72, 7.45]], '#f6ecd2', Math.max(0.8, 0.12 * k.s));
      k.rod([[1.8, 3.2, 7.7], [3.4, 4.1, 7.7]], C.walnutDark, 0.1);
      pot(k, 2.0, 1.35, 7.3, 0.62, 1.0);
      crown(k, 2.0, 1.35, 8.75, 0.55, 0.35, 7, v.seed, ['#5f8f6a', '#7fb08a', '#a6cf9c']);
      // laptop: base, keys, the lid's back edge
      k.box(5.0, 1.75, 7.3, 3.9, 2.55, 0.28, '#c4c8ce');
      k.poly([[5.3, 2.05, 7.59], [8.6, 2.05, 7.59], [8.6, 3.3, 7.59], [5.3, 3.3, 7.59]], '#8d939b', 0);
      k.poly([[6.3, 3.55, 7.59], [7.6, 3.55, 7.59], [7.6, 4.1, 7.59], [6.3, 4.1, 7.59]], '#a9aeb5', 0);
      k.poly([...LID], '#b9bec6', k.lw);
      cup(k, 9.75, 4.0, 7.3, C.china, true, 0.55);
    });
    // the screen
    const scr: readonly [P3, P3, P3, P3] = [on(LID, 0.07, 0.07), on(LID, 0.93, 0.07), on(LID, 0.93, 0.93), on(LID, 0.07, 0.93)];
    if (!v.active) {
      k.poly([...scr], k.grad(scr[3], scr[1], [[0, '#2b3446'], [1, '#1b2130']]), 0);
      k.poly([on(LID, 0.55, 0.07), on(LID, 0.7, 0.07), on(LID, 0.35, 0.93), on(LID, 0.2, 0.93)], '#ffffff12', 0);
      return;
    }
    k.poly([...scr], k.grad(scr[3], scr[1], [[0, '#d9f3ff'], [1, '#8fd3f4']]), 0);
    const pen = k.pen;
    const roll = v.t * 2.4;
    const base = Math.floor(roll);
    const colors: Color[] = ['#2b6f9c', '#c0507a', '#3f8f5a', '#7a5ab0', '#2b3446'];
    for (const [ci, c] of colors.entries()) {
      pen.beginPath();
      for (let i = 0; i < 8; i++) {
        const row = base - i;
        if (Math.floor(hash(row, 3) * colors.length) !== ci) continue;
        const fz = 0.14 + (i + roll - base) * 0.1;
        if (fz > 0.88) continue;
        const ind = Math.floor(hash(row, 1) * 4) * 0.07;
        const len = 0.2 + hash(row, 2) * 0.45;
        const f0 = 0.12 + ind;
        const f1 = Math.min(0.88, f0 + len);
        k.trace([on(LID, f0, fz), on(LID, f1, fz), on(LID, f1, fz + 0.045), on(LID, f0, fz + 0.045)]);
      }
      pen.fillStyle = c;
      pen.fill();
    }
    const [cu, cv, cz] = on(LID, 0.5, 0.5);
    k.halo(cu, cv + 0.6, cz, 4.5, '#9fe0ff', 0.35);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, v.active ? 1.4 : 0.45, v.seed);
    for (let i = 0; i < n; i++) spawn(wisp(9.75, 4.0, 8.3, Math.floor(v.t * 10), i));
  },
};

// ── read: the bookcase ──────────────────────────────────────────────────────
// A tall walnut bookcase of every colour of binding, ivy trailing off the
// top and a library ladder against it; a little table with a banker's lamp
// and an open book. Reading lights the lamp and turns the pages.

const SHELVES = [0.9, 5.65, 10.4, 15.15, 19.0];
const BAYS: ReadonlyArray<readonly [number, number]> = [[0.95, 5.05], [5.55, 9.65]];

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'read', 21, (k) => {
      const F = 3.4; // the bookcase's front
      k.shadow(5.3, 2.4, 6.2, 2.6, 0.3);
      k.box(0.3, 0.05, 0, 10, F - 0.05, 19.7, C.walnut, { stripe: false });
      k.box(0.1, 0, 19.7, 10.4, F + 0.25, 0.6, shade(C.walnut, 0.06));
      // the bays, dark inside, then what is on each shelf
      SHELVES.slice(0, -1).forEach((z0, r) => {
        const z1 = SHELVES[r + 1] - 0.45;
        for (const [bi, [u0, u1]] of BAYS.entries()) {
          k.poly([[u0, F, z0], [u1, F, z0], [u1, F, z1], [u0, F, z1]], k.vgrad(u0, F, z0, z1, [[0, '#3f2617'], [1, '#22140c']]), k.thin);
          const sd = v.seed + r * 7 + bi * 3;
          const kind = hash(sd, 5);
          if (kind < 0.18) {
            // a few lying flat and a jar
            for (let j = 0; j < 3; j++) k.box(u0 + 0.3, F - 2.2, z0 + j * 0.42, 2.4 - j * 0.15, 2.0, 0.42, BINDINGS[(sd + j) % BINDINGS.length], { line: k.thin, stripe: false });
            k.cyl(u1 - 1.0, F - 1.2, z0, 0.55, 1.6, '#cfdcd8');
            k.cyl(u1 - 1.0, F - 1.2, z0 + 0.1, 0.45, 1.0, C.coffee, { line: 0 });
            bookRow(k, u0 + 2.9, u1 - 1.7, F - 0.05, z0, z1 - z0 - 0.3, sd);
          } else if (kind < 0.32) {
            bookRow(k, u0 + 0.1, u1 - 1.6, F - 0.05, z0, z1 - z0 - 0.3, sd);
            pot(k, u1 - 0.8, F - 1.0, z0, 0.6, 1.2, '#e3d6bd');
            crown(k, u1 - 0.8, F - 1.0, z0 + 1.6, 0.6, 0.4, 7, sd);
          } else bookRow(k, u0 + 0.1, u1 - 0.1, F - 0.05, z0, z1 - z0 - 0.3, sd);
        }
      });
      // ivy over the top, a box and a vase
      pot(k, 1.6, 1.6, 20.3, 0.75, 1.1);
      ivy(k, 1.2, F + 0.3, 20.6, 7, v.seed, 3);
      k.box(6.0, 0.8, 20.3, 2.2, 1.8, 1.0, C.mustard, { line: k.thin });
      k.cyl(9.2, 1.6, 20.3, 0.5, 1.3, C.teal);
      // the ladder against the right bay
      for (const u of [7.9, 9.3]) k.rod([[u, 3.95, 0], [u, 3.55, 18.6]], C.honey, 0.22);
      for (let z = 1.6; z < 18; z += 1.9) k.rod([[7.9, 3.95 - z * 0.022, z], [9.3, 3.95 - z * 0.022, z]], C.honey, 0.16);
      // the side table, a stack of books under it
      k.shadow(12.2, 2.0, 1.8, 1.6, 0.25);
      k.cyl(12.2, 2.0, 0, 0.9, 0.25, C.walnutDark);
      k.cyl(12.2, 2.0, 0.25, 0.22, 4.9, C.walnutDark);
      k.box(12.6, 2.7, 0, 1.3, 1.0, 0.45, '#8f2f2f', { line: k.thin, stripe: false });
      k.box(12.7, 2.6, 0.45, 1.1, 0.95, 0.4, '#2f6e6a', { line: k.thin, stripe: false });
      k.cyl(12.2, 2.0, 5.1, 1.55, 0.3, C.walnut);
      // the banker's lamp: brass stem, green shade
      k.disc(12.75, 1.3, 5.42, 0.6, C.brass, k.thin);
      k.rod([[12.75, 1.3, 5.4], [12.75, 1.3, 7.4]], C.brass, 0.16);
      // an open book on the table (its turning page is drawn live)
      k.poly([[11.15, 2.0, 5.42], [12.05, 2.0, 5.42], [12.05, 3.0, 5.42], [11.15, 3.0, 5.42]], '#f1e6cc', k.thin);
      k.poly([[12.05, 2.0, 5.42], [12.95, 2.0, 5.42], [12.95, 3.0, 5.42], [12.05, 3.0, 5.42]], '#f6edd8', k.thin);
      if (k.fine) for (const u0 of [11.3, 12.2]) for (let i = 0; i < 4; i++) k.line([[u0, 2.2 + i * 0.2, 5.43], [u0 + 0.6, 2.2 + i * 0.2, 5.43]], '#b8a888', Math.max(0.6, 0.05 * k.s));
    });
    // the shade: green glass, glowing when lit
    const on = v.active;
    const shadeC = on ? '#4fae7a' : '#2f6f4f';
    const [s0, s1, sv0, sv1, sz] = [11.7, 13.8, 0.75, 1.85, 7.25];
    k.poly([[s0, sv0, sz], [s1, sv0, sz], [s1, sv1, sz], [s0, sv1, sz]], on ? '#fff0c0' : shade(shadeC, -0.3), 0);
    k.poly([[s0, sv0, sz], [s1, sv0, sz], [s1 - 0.15, (sv0 + sv1) / 2, sz + 1.0], [s0 + 0.15, (sv0 + sv1) / 2, sz + 1.0]], shade(shadeC, 0.12), k.lw);
    k.poly([[s0, sv1, sz], [s1, sv1, sz], [s1 - 0.15, (sv0 + sv1) / 2, sz + 1.0], [s0 + 0.15, (sv0 + sv1) / 2, sz + 1.0]], shadeC, k.lw);
    k.line([[s0 + 0.15, (sv0 + sv1) / 2, sz + 1.0], [s1 - 0.15, (sv0 + sv1) / 2, sz + 1.0]], shade(shadeC, 0.4), Math.max(0.8, 0.1 * k.s));
    if (on) {
      k.pool(12.2, 2.3, 1.7, 1.3, '#ffe2a0', 0.55, 5.45);
      k.halo(12.75, 1.6, 6.9, 3.4, '#ffd890', 0.42);
      // a page turning over, right to left
      const ph = (v.t * 0.8) % 1;
      if (ph < 0.45) {
        const a = (ph / 0.45) * Math.PI;
        const tip = (dv: number): P3 => [12.05 + Math.cos(a) * 0.85, dv, 5.45 + Math.sin(a) * 0.85];
        k.poly([[12.05, 2.02, 5.45], tip(2.02), tip(2.98), [12.05, 2.98, 5.45]], '#fbf4e4', k.thin);
      }
    }
  },
};

// ── search: the pastry case ─────────────────────────────────────────────────
// A walnut counter with a glass case of cakes, croissants, cinnamon rolls,
// macarons and cupcakes, and a bundt cake under a glass dome. Looking
// through it lights the case, and a glint runs along the glass.

const CASE = { u0: 0.6, u1: 8.4, v0: 0.5, v1: 3.5, z0: 5.85, z1: 9.7, mid: 7.75 };

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 11,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'search', 11, (k) => {
      k.shadow(6, 2.2, 6.6, 2.6, 0.3);
      k.box(0.5, 0.45, 0, 11, 3.2, 0.6, C.walnutDark, { stripe: false });
      k.box(0.3, 0.3, 0.6, 11.4, 3.5, 4.8, C.walnut, { stripe: false });
      // panels on the front
      const F = 3.8;
      const panels: Array<[number, number]> = [[0.9, 4.1], [4.4, 7.6], [7.9, 11.1]];
      for (const [u0, u1] of panels) {
        k.poly([[u0, F, 1.3], [u1, F, 1.3], [u1, F, 4.8], [u0, F, 4.8]], k.side(shade(C.walnut, -0.08), 0, 1), k.thin);
        k.line([[u0 + 0.15, F, 1.45], [u0 + 0.15, F, 4.65], [u1 - 0.15, F, 4.65]], shade(C.walnut, 0.3), Math.max(0.7, 0.1 * k.s));
      }
      k.box(0.1, 0.1, 5.4, 11.8, 3.9, 0.45, '#ece5da');
      if (k.fine) {
        k.line([[1, 1, 5.86], [2.5, 2.2, 5.86], [3.4, 2.0, 5.86], [4.6, 3.6, 5.86]], '#c9c0b4', 0.06 * k.s);
        k.line([[9.0, 0.6, 5.86], [10.2, 1.9, 5.86], [11.6, 2.4, 5.86]], '#c9c0b4', 0.06 * k.s);
      }
      // inside the case: a cream back, the shelf, the bakes
      const { u0, u1, v0, v1, z0, z1, mid } = CASE;
      k.poly([[u0, v0, z0], [u1, v0, z0], [u1, v0, z1], [u0, v0, z1]], k.vgrad(u0, v0, z0, z1, [[0, '#f0dfbf'], [1, '#d9c29b']]), 0);
      k.poly([[u1, v0, z0], [u1, v1, z0], [u1, v1, z1], [u1, v0, z1]], shade('#e6d3b0', -0.1), 0);
      // lower tier: a layer cake, croissants, cinnamon rolls
      k.cyl(2.0, 2.0, z0, 1.15, 1.2, '#f4d9e0');
      k.cyl(2.0, 2.0, z0 + 1.2, 1.18, 0.3, '#fff5f0');
      k.disc(2.0, 2.0, z0 + 1.52, 0.18, '#c0392f', k.thin);
      for (const [cu, cv] of [[4.2, 1.6], [5.1, 2.4], [4.1, 2.8]] as const) croissant(k, cu, cv, z0);
      for (const [cu, cv] of [[6.6, 1.5], [7.5, 2.2], [6.5, 2.7]] as const) {
        k.cyl(cu, cv, z0, 0.55, 0.45, '#c98a4a');
        if (k.fine) k.line(spiral(cu, cv, z0 + 0.46, 0.45), '#8a5530', 0.06 * k.s);
      }
      // the glass shelf
      k.poly([[u0, v0, mid], [u1, v0, mid], [u1, v1, mid], [u0, v1, mid]], '#e6f2f440', 0);
      k.line([[u0, v1, mid], [u1, v1, mid], [u1, v0, mid]], '#ffffffa0', Math.max(0.8, 0.1 * k.s));
      // upper tier: macarons, cupcakes
      const mac = ['#f2a7b8', '#b9e0c4', '#f6e08a', '#c9b3e6'];
      for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) {
        const c = mac[(i + r) % mac.length];
        k.cyl(1.1 + i * 0.75, 1.4 + r * 1.1, mid, 0.33, 0.12, c, { line: k.thin * 0.8 });
        k.cyl(1.1 + i * 0.75, 1.4 + r * 1.1, mid + 0.12, 0.3, 0.1, '#fdf6ea', { line: 0 });
        k.cyl(1.1 + i * 0.75, 1.4 + r * 1.1, mid + 0.22, 0.33, 0.14, c, { line: k.thin * 0.8 });
      }
      for (const [cu, cv, c] of [[5.6, 1.6, '#f2a7b8'], [6.9, 1.7, '#f6ecd8'], [6.2, 2.7, '#8a5530']] as const) cupcake(k, cu, cv, mid, c);
      // the glass: top, front, end, with the frame's edges
      k.poly([[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], '#dff2fa30', 0);
      k.poly([[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]], '#dff2fa22', 0);
      for (const e of [[[u0, v1, z0], [u0, v1, z1]], [[u1, v1, z0], [u1, v1, z1]], [[u1, v0, z0], [u1, v0, z1]]] as P3[][]) k.rod(e, C.brass, 0.14);
      k.line([[u0, v0, z1], [u0, v1, z1], [u1, v1, z1], [u1, v0, z1], [u0, v0, z1]], INK, k.lw);
      k.line([[u0, v1, z1], [u1, v1, z1], [u1, v0, z1]], C.brass, Math.max(0.8, 0.14 * k.s));
      // the cake stand under its dome
      k.cyl(10.0, 2.0, z0, 0.55, 0.15, '#f2ece0');
      k.cyl(10.0, 2.0, z0 + 0.15, 0.18, 0.75, '#f2ece0');
      k.cyl(10.0, 2.0, z0 + 0.9, 1.15, 0.15, '#f2ece0');
      k.cyl(10.0, 2.0, z0 + 1.05, 0.85, 0.85, '#a8623a');
      k.disc(10.0, 2.0, z0 + 1.9, 0.5, '#fbf3e6', 0);
      dome(k, 10.0, 2.0, z0 + 1.05, 1.15, 2.4);
      // a jar of tips with a coin or two
      k.cyl(11.3, 3.25, z0, 0.42, 0.85, '#d6e6ea');
      k.disc(11.3, 3.25, z0 + 0.35, 0.3, C.brass, 0);
    });
    // reflections on the front glass (live, over the sprite)
    const { u0, u1, v1, z0, z1 } = CASE;
    k.poly([[u0 + 0.6, v1, z0 + 0.4], [u0 + 1.4, v1, z0 + 0.4], [u0 + 2.6, v1, z1 - 0.3], [u0 + 1.8, v1, z1 - 0.3]], '#ffffff30', 0);
    k.poly([[u0 + 2.0, v1, z0 + 0.4], [u0 + 2.4, v1, z0 + 0.4], [u0 + 3.6, v1, z1 - 0.3], [u0 + 3.2, v1, z1 - 0.3]], '#ffffff24', 0);
    if (!v.active) return;
    k.halo((u0 + u1) / 2, 1.8, (z0 + z1) / 2, 5.5, '#ffe2a8', 0.32);
    // the glint, sliding along the front glass
    const f = (v.t * 0.45) % 1.4;
    if (f < 1) {
      const u = u0 + (u1 - u0 - 1.2) * f;
      k.poly([[u, v1 + 0.02, z0 + 0.3], [u + 0.5, v1 + 0.02, z0 + 0.3], [u + 1.3, v1 + 0.02, z1 - 0.2], [u + 0.8, v1 + 0.02, z1 - 0.2]], '#ffffff70', 0);
    }
  },
};

function spiral(cu: number, cv: number, z: number, r: number): P3[] {
  const out: P3[] = [];
  for (let i = 0; i <= 18; i++) {
    const a = i * 0.6;
    const rr = (r * i) / 18;
    out.push([cu + Math.cos(a) * rr, cv + Math.sin(a) * rr, z]);
  }
  return out;
}

function croissant(k: Kit, cu: number, cv: number, z: number): void {
  const pts: P3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (0.15 + (0.7 * i) / 10);
    pts.push([cu + Math.cos(a) * 0.75, cv - Math.sin(a) * 0.45 + 0.3, z + 0.1 + Math.sin(a) * 0.45]);
  }
  for (let i = 10; i >= 0; i--) {
    const a = Math.PI * (0.15 + (0.7 * i) / 10);
    pts.push([cu + Math.cos(a) * 0.55, cv - Math.sin(a) * 0.2 + 0.3, z]);
  }
  k.poly(pts, '#d9944a', k.thin, 0.1);
  if (k.fine) for (const du of [-0.25, 0.05, 0.35]) k.line([[cu + du, cv - 0.1, z + 0.45], [cu + du + 0.1, cv + 0.25, z + 0.2]], '#a8622e', 0.05 * k.s);
}

function cupcake(k: Kit, cu: number, cv: number, z: number, icing: Color): void {
  const e0 = k.ell(cu, cv, z, 0.38);
  const e1 = k.ell(cu, cv, z + 0.6, 0.5);
  fill(k, [[e0.cx - e0.rx, e0.cy], [e0.cx + e0.rx, e0.cy], [e1.cx + e1.rx, e1.cy], [e1.cx - e1.rx, e1.cy]], '#e3b25e', k.thin);
  const [x, y] = k.p(cu, cv, z + 0.95);
  k.pen.beginPath();
  k.pen.ellipse(x, y, e1.rx * 1.05, e1.rx * 0.75, 0, 0, Math.PI * 2);
  k.paint(icing, k.thin);
  k.disc(cu, cv, z + 1.35, 0.13, '#c0392f', 0);
}

// A glass cloche: a dome outline with a knob and a highlight.
function dome(k: Kit, cu: number, cv: number, z: number, r: number, h: number): void {
  const e = k.ell(cu, cv, z, r);
  const [, ty] = k.p(cu, cv, z + h);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e.cx - e.rx, e.cy);
  pen.bezierCurveTo(e.cx - e.rx, ty + (e.cy - ty) * 0.15, e.cx - e.rx * 0.4, ty, e.cx, ty);
  pen.bezierCurveTo(e.cx + e.rx * 0.4, ty, e.cx + e.rx, ty + (e.cy - ty) * 0.15, e.cx + e.rx, e.cy);
  pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
  pen.closePath();
  k.paint('#e6f4fa26', k.thin);
  pen.beginPath();
  pen.ellipse(e.cx - e.rx * 0.45, ty + (e.cy - ty) * 0.35, e.rx * 0.18, (e.cy - ty) * 0.25, 0.3, 0, Math.PI * 2);
  pen.fillStyle = '#ffffff55';
  pen.fill();
  k.disc(cu, cv, z + h + 0.15, 0.22, '#e6f4fa', k.thin);
}

// ── run: the espresso bar ──────────────────────────────────────────────────
// A walnut bar with a marble top and a brass foot rail; on it a red
// two-group espresso machine with a brass dome and cups warming on top, a
// grinder and a milk jug; two stools in front. Running it pulls shots into
// the cups, wobbles the gauge and sends up steam.

const GROUPS = [5.9, 8.3];

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'run', 15, (k) => {
      k.shadow(5.5, 5.4, 6.6, 6.2, 0.3);
      // the bar
      k.box(0.5, 1.2, 0, 10, 6.0, 6.6, C.walnut, { stripe: false });
      const F = 7.2;
      const pen = k.pen;
      pen.beginPath();
      for (let u = 1.2; u < 10.4; u += 0.9) {
        const [x0, y0] = k.p(u, F, 0.7);
        const [x1, y1] = k.p(u, F, 6.3);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      for (let w = 1.9; w < 7.1; w += 0.9) {
        const [x0, y0] = k.p(10.5, w, 0.7);
        const [x1, y1] = k.p(10.5, w, 6.3);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      pen.strokeStyle = shade(C.walnut, -0.35);
      pen.lineWidth = Math.max(0.8, 0.1 * k.s);
      pen.stroke();
      k.poly([[0.5, F, 0], [10.5, F, 0], [10.5, F, 0.6], [0.5, F, 0.6]], shade(C.walnutDark, -0.1), k.thin);
      k.poly([[10.5, 1.2, 0], [10.5, F, 0], [10.5, F, 0.6], [10.5, 1.2, 0.6]], shade(C.walnutDark, -0.2), k.thin);
      // the foot rail on its brackets
      for (const u of [1.4, 5.5, 9.6]) k.rod([[u, F, 1.0], [u, F + 0.55, 1.0]], C.brass, 0.14);
      k.rod([[0.9, F + 0.6, 1.0], [10.1, F + 0.6, 1.0]], C.brass, 0.2);
      // marble top
      k.box(0.25, 1.0, 6.6, 10.5, 6.45, 0.55, '#eee8de');
      if (k.fine) k.line([[0.9, 2, 7.16], [2.6, 3.6, 7.16], [3.1, 3.3, 7.16], [4.2, 6.9, 7.16]], '#cbc2b6', 0.06 * k.s);
      const zt = 7.15;
      // grinder
      k.box(1.3, 2.4, zt, 2.0, 2.0, 1.7, '#2f2a29', { round: 0.15 });
      k.cyl(2.3, 3.4, zt + 1.7, 0.5, 0.55, C.chrome);
      k.cyl(2.3, 3.4, zt + 2.25, 0.85, 1.7, '#cddde1');
      k.cyl(2.3, 3.4, zt + 2.3, 0.7, 1.15, C.coffee, { line: 0 });
      k.cyl(2.3, 3.4, zt + 3.95, 0.95, 0.3, '#2f2a29');
      // saucers and cups stacked, a jar of biscotti
      for (let i = 0; i < 3; i++) k.cyl(1.5, 6.0, zt + i * 0.16, 0.8, 0.16, C.china, { line: k.thin });
      cup(k, 1.5, 6.0, zt + 0.48, C.china, false, 0.42);
      k.cyl(3.4, 6.1, zt, 0.55, 1.3, '#d6e6ea');
      k.cyl(3.4, 6.1, zt + 0.1, 0.45, 0.8, '#d9a35c', { line: 0 });
      k.cyl(3.4, 6.1, zt + 1.3, 0.6, 0.25, C.walnut);
      // the machine
      k.box(4.5, 2.0, zt, 5.2, 3.0, 3.75, C.red, { round: 0.25 });
      k.box(4.4, 1.9, zt + 3.75, 5.4, 3.2, 0.45, C.chrome);
      k.box(4.8, 4.98, zt, 4.6, 0.95, 0.45, C.chrome);
      if (k.fine) for (let u = 5.1; u < 9.3; u += 0.35) k.line([[u, 5.05, zt + 0.46], [u, 5.85, zt + 0.46]], '#8f969c', 0.05 * k.s);
      // brass dome and cups warming on top
      const top = zt + 4.2;
      cup(k, 5.1, 2.5, top, '#e8d9bf', false, 0.38);
      cup(k, 5.2, 4.2, top, C.china, false, 0.38);
      k.cyl(7.1, 3.5, top, 1.2, 0.35, C.brass);
      brassDome(k, 7.1, 3.5, top + 0.35, 1.2, 1.4);
      cup(k, 9.0, 2.6, top, C.china, false, 0.38);
      // gauge on the front
      const gz = zt + 2.75;
      fill(k, ring(k, [7.1, 5.02, gz], [0, 1, 0], 0.62, 20), C.chrome, k.thin);
      fill(k, ring(k, [7.1, 5.04, gz], [0, 1, 0], 0.48, 20), '#f6efdc', 0);
      // group heads with their portafilters, cups under them
      for (const g of GROUPS) {
        k.cyl(g, 5.35, zt + 1.75, 0.5, 0.8, C.chrome);
        k.cyl(g, 5.4, zt + 1.3, 0.42, 0.45, '#3a3433');
        k.rod([[g + 0.1, 5.75, zt + 1.5], [g + 0.35, 7.0, zt + 1.35]], '#2b2522', 0.34);
        cup(k, g, 5.45, zt + 0.45, C.china, false, 0.34);
      }
      // the steam wand and a milk jug
      k.rod([[9.7, 4.0, zt + 3.0], [10.15, 4.6, zt + 2.6], [10.15, 5.3, zt + 1.0]], C.chrome, 0.14);
      k.cyl(9.95, 6.4, zt, 0.42, 0.95, C.chrome);
      // two stools before the bar
      stool(k, 2.2, 9.4, '#8f2f2f');
      stool(k, 8.8, 9.4, '#8f2f2f');
    });
    const zt = 7.15;
    // the gauge's needle
    const a = v.active ? -0.4 + Math.sin(v.t * 9) * 0.12 : -2.2;
    const gz = zt + 2.75;
    k.line([[7.1, 5.06, gz], [7.1 + Math.cos(a) * 0.38, 5.06, gz - Math.sin(a) * 0.38]], '#c0392f', Math.max(0.8, 0.09 * k.s));
    // the pilot light
    const [lx, ly] = k.p(4.95, 5.02, zt + 3.25);
    k.pen.beginPath();
    k.pen.arc(lx, ly, Math.max(1, 0.16 * k.s), 0, Math.PI * 2);
    k.pen.fillStyle = v.active ? '#ffcf5a' : '#7a5a3a';
    k.pen.fill();
    if (!v.active) return;
    k.halo(4.95, 5.1, zt + 3.25, 1.2, '#ffcf5a', 0.6);
    // shots running into the cups
    for (const [i, g] of GROUPS.entries()) {
      const w = Math.sin(v.t * 23 + i) * 0.03;
      k.line([[g + w, 5.45, zt + 1.28], [g - w, 5.45, zt + 1.0]], '#6a3b22', Math.max(1, 0.12 * k.s));
    }
    k.halo(7.1, 5.4, zt + 2, 5, '#ffb070', 0.18);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) {
      if (due(v.t, dt, 0.35, v.seed)) spawn(wisp(5.2, 4.2, 12.0, Math.floor(v.t * 10), 0));
      return;
    }
    const n = due(v.t, dt, 5, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 20) + i;
      const at = hash(tick, 7) < 0.55 ? ([10.15, 5.4, 7.8] as const) : ([GROUPS[tick & 1], 5.45, 8.0] as const);
      spawn(wisp(at[0], at[1], at[2], tick, i));
    }
  },
};

// A brass dome on the machine, round at the top, a knob on it.
function brassDome(k: Kit, cu: number, cv: number, z: number, r: number, h: number): void {
  const e = k.ell(cu, cv, z, r);
  const [, ty] = k.p(cu, cv, z + h);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e.cx - e.rx, e.cy);
  pen.bezierCurveTo(e.cx - e.rx, ty + (e.cy - ty) * 0.2, e.cx - e.rx * 0.5, ty, e.cx, ty);
  pen.bezierCurveTo(e.cx + e.rx * 0.5, ty, e.cx + e.rx, ty + (e.cy - ty) * 0.2, e.cx + e.rx, e.cy);
  pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createRadialGradient(e.cx - e.rx * 0.35, ty + (e.cy - ty) * 0.3, 0, e.cx, e.cy, e.rx * 1.3);
  g.addColorStop(0, '#fff2c0');
  g.addColorStop(0.35, C.brass);
  g.addColorStop(1, '#8a6224');
  k.paint(g, k.lw);
  k.disc(cu, cv, z + h + 0.2, 0.28, C.brass, k.thin);
}

// ── web: the gramophone ─────────────────────────────────────────────────────
// A walnut radio cabinet on tapered legs with a gramophone on top, its
// brass horn opening toward the room; a crate of records and a fern
// beside it. Browsing spins the record and sends notes drifting up.

const BELL: { c: P3; n: P3; r: number } = { c: [2.6, 2.7, 12.0], n: [0.38, 0.62, 0.68], r: 2.3 };

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'web', 15, (k) => {
      k.shadow(4.6, 4.4, 4.6, 4.2, 0.3);
      // the fern and the record crate (nearest things last)
      for (const [u, w] of [[1.6, 1.6], [7.0, 1.6], [1.6, 5.8], [7.0, 5.8]] as const) k.rod([[u, w, 1.1], [u + (u < 4 ? -0.15 : 0.15), w + (w < 4 ? -0.15 : 0.15), 0]], C.walnutDark, 0.22);
      k.box(1.2, 1.2, 1.0, 6.4, 4.8, 5.0, C.walnut, { round: 0.15 });
      // grille cloth and doors on the front
      const F = 6.0;
      k.poly([[1.7, F, 1.6], [4.2, F, 1.6], [4.2, F, 5.4], [1.7, F, 5.4]], k.side('#d8c39a', 0, 1, 0.14), k.thin);
      for (let u = 2.0; u < 4.1; u += 0.42) k.line([[u, F, 1.75], [u, F, 5.25]], shade('#a88e62', 0), Math.max(0.7, 0.1 * k.s));
      k.poly([[4.6, F, 1.6], [7.1, F, 1.6], [7.1, F, 5.4], [4.6, F, 5.4]], k.side(shade(C.walnut, 0.06), 0, 1), k.thin);
      k.line([[5.85, F, 1.6], [5.85, F, 5.4]], INK, k.thin);
      for (const u of [5.55, 6.15]) {
        const [x, y] = k.p(u, F + 0.05, 3.6);
        k.pen.beginPath();
        k.pen.arc(x, y, Math.max(1.1, 0.17 * k.s), 0, Math.PI * 2);
        k.paint(C.brass, k.thin * 0.7);
      }
      // the gramophone: box, platter, record
      k.box(2.0, 1.9, 6.0, 4.6, 3.8, 1.8, C.honey, { round: 0.1 });
      k.disc(4.3, 3.8, 7.82, 1.65, '#3a3030', k.thin);
      k.disc(4.3, 3.8, 7.9, 1.5, '#1d1818', 0);
      if (k.fine) for (const r of [1.3, 1.05, 0.8]) {
        const e = k.ell(4.3, 3.8, 7.9, r);
        k.pen.beginPath();
        k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
        k.pen.strokeStyle = '#3d3434';
        k.pen.lineWidth = Math.max(0.6, 0.05 * k.s);
        k.pen.stroke();
      }
      k.disc(4.3, 3.8, 7.91, 0.5, '#c0392f', 0);
      k.disc(4.3, 3.8, 7.92, 0.08, '#e6d3b0', 0);
      // the crank on the +u side
      k.rod([[6.6, 3.8, 7.0], [7.2, 3.8, 7.0], [7.2, 3.8, 6.3]], C.brass, 0.12);
      // the horn: a brass bell on a curved neck, open toward the room
      const throat = ring(k, [3.0, 2.4, 7.8], [0, 0, 1], 0.3, 12);
      const neck = ring(k, [2.7, 2.4, 9.6], [0.15, 0.25, 0.95], 0.45, 12);
      const bell = ring(k, BELL.c, BELL.n, BELL.r, 28);
      const body = hull([...throat, ...neck]);
      fill(k, body, '#b8862e', k.lw);
      const flare = hull([...neck, ...ring(k, BELL.c, BELL.n, BELL.r * 0.98, 28)]);
      const xs = flare.map((p) => p[0]);
      const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
      g.addColorStop(0, '#f2cf7a');
      g.addColorStop(0.45, C.brass);
      g.addColorStop(1, '#8a6224');
      fill(k, flare, g, k.lw);
      const [bx, by] = k.p(...BELL.c);
      const ig = k.pen.createRadialGradient(bx, by, 0, bx, by, BELL.r * k.s * 1.4);
      ig.addColorStop(0, '#4a3212');
      ig.addColorStop(0.5, '#a0742a');
      ig.addColorStop(1, '#f0c870');
      fill(k, bell, ig, k.lw);
      // petal seams across the bell
      if (k.fine) for (let i = 0; i < 8; i++) {
        const p = bell[Math.floor((i * bell.length) / 8)];
        k.pen.beginPath();
        k.pen.moveTo(bx, by);
        k.pen.lineTo(p[0], p[1]);
        k.pen.strokeStyle = '#6a4a1866';
        k.pen.lineWidth = Math.max(0.6, 0.06 * k.s);
        k.pen.stroke();
      }
      // a fern, and the crate of records
      pot(k, 1.7, 7.4, 0, 0.85, 1.4, '#e3d6bd');
      for (let i = 0; i < 9; i++) {
        const [x, y] = k.p(1.7, 7.4, 1.5);
        const a = -Math.PI / 2 + (i - 4) * 0.36;
        leaf(k, x, y, a, (2.2 + hash(v.seed, i, 3) * 0.8) * k.s, 0.35 * k.s, i & 1 ? C.leaf : C.leafLight);
      }
      k.box(5.9, 6.1, 0, 2.9, 2.7, 2.4, '#b98a55', { stripe: false });
      const sleeves = ['#c0392f', '#2f6e6a', '#dba640', '#34476b', '#f2e3c6'];
      for (let i = 0; i < 5; i++) {
        const w = 6.5 + i * 0.45;
        const tilt = (hash(v.seed, i, 9) - 0.5) * 0.5;
        k.poly([[6.1, w, 1.0], [8.6, w, 1.0], [8.6 + tilt, w, 3.2], [6.1 + tilt, w, 3.2]], k.side(sleeves[i], 0, 1, 0.12), k.thin);
      }
      k.poly([[5.9, 8.8, 0], [8.8, 8.8, 0], [8.8, 8.8, 1.6], [5.9, 8.8, 1.6]], k.side('#c99a62', 0, 1), k.lw);
      k.line([[5.9, 8.8, 0.8], [8.8, 8.8, 0.8]], shade('#c99a62', -0.3), k.thin);
    });
    // the record: a sheen that turns while it plays, the tonearm on it or parked
    const spin = v.active ? v.t * 3.4 : 0.6;
    const sheen: P3[] = [[4.3, 3.8, 7.91]];
    for (let i = 0; i <= 6; i++) {
      const a = spin + (i / 6) * 0.7;
      sheen.push([4.3 + Math.cos(a) * 1.4, 3.8 + Math.sin(a) * 1.4, 7.91]);
    }
    k.poly(sheen, '#ffffff1e', 0);
    const ma = spin * 1.0 + 2;
    k.disc(4.3 + Math.cos(ma) * 0.3, 3.8 + Math.sin(ma) * 0.3, 7.93, 0.08, '#f2e3c6', 0);
    const pivot: P3 = [6.2, 2.3, 8.0];
    const tip: P3 = v.active ? [4.9, 3.3, 8.15] : [6.3, 3.7, 8.15];
    k.disc(pivot[0], pivot[1], 7.85, 0.35, C.brass, k.thin);
    k.rod([pivot, [(pivot[0] + tip[0]) / 2, (pivot[1] + tip[1]) / 2, 8.35], tip], C.brass, 0.13);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 1.6, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      spawn({ kind: 'glint', x: BELL.c[0] + j(1) * 2, y: BELL.c[1] + 1 + j(2), z: BELL.c[2] + 0.5, vx: 0.4 + j(3) * 0.6, vy: 0.4 + j(4) * 0.6, vz: 1.6 + j(5), life: 1.6, color: [255, 214, 140], glow: true, gravity: -0.2 });
    }
  },
};

// ── think: the wingback and the lamp ───────────────────────────────────────
// A teal wingback armchair with a mustard throw, a pouf before it, a tall
// fringed floor lamp and a side table with tea and books. Thinking turns
// the lamp up and steams the tea.

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'think', 16, (k) => {
      k.shadow(6, 3.4, 6.4, 3.6, 0.3);
      armchair(k, 2.8, C.teal);
      // the pouf
      k.shadow(5.5, 6.0, 1.3, 1.1, 0.2);
      k.cyl(5.5, 6.0, 0, 1.05, 1.7, C.mustard);
      if (k.fine) for (let i = 0; i < 6; i++) {
        const a = Math.PI * (0.15 + i * 0.14);
        k.line([[5.5 + Math.cos(a) * 1.05, 6 + Math.sin(a) * 1.05, 0.2], [5.5 + Math.cos(a) * 1.05, 6 + Math.sin(a) * 1.05, 1.6]], shade(C.mustard, -0.25), 0.06 * k.s);
      }
      // the lamp
      k.shadow(10.4, 1.5, 1.2, 1.0, 0.25);
      k.cyl(10.4, 1.5, 0, 0.9, 0.3, C.brass);
      k.rod([[10.4, 1.5, 0.3], [10.4, 1.5, 12.8]], C.brass, 0.16);
      // the side table with tea and books
      k.shadow(10.2, 4.7, 1.6, 1.4, 0.22);
      k.cyl(10.2, 4.7, 0, 0.75, 0.2, C.walnutDark);
      k.cyl(10.2, 4.7, 0.2, 0.2, 4.1, C.walnutDark);
      k.cyl(10.2, 4.7, 4.3, 1.45, 0.3, C.walnut);
      k.box(10.0, 4.6, 4.6, 1.6, 1.2, 0.35, '#34476b', { line: k.thin, stripe: false });
      k.box(10.15, 4.7, 4.95, 1.3, 1.0, 0.35, '#b5543a', { line: k.thin, stripe: false });
      cup(k, 9.5, 4.2, 4.6, '#f6f1e6', false, 0.45);
    });
    // the shade, lit; brighter while someone thinks here
    frustum(k, 10.4, 1.5, 12.6, 1.95, 15.0, 1.15, '#f3e2bd', v.active ? '#fff3cf' : '#f6e6c4');
    const pen = k.pen;
    pen.beginPath();
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI * (0.05 + (0.9 * i) / 14);
      const [x0, y0] = k.p(10.4 + Math.cos(a + 0.79) * 1.95, 1.5 + Math.sin(a + 0.79) * 1.95, 12.6);
      pen.moveTo(x0, y0);
      pen.lineTo(x0, y0 + 0.45 * k.s);
    }
    pen.strokeStyle = C.mustard;
    pen.lineWidth = Math.max(0.8, 0.1 * k.s);
    pen.stroke();
    const a = v.active ? 0.55 + 0.05 * Math.sin(v.t * 2.1) : 0.3;
    k.halo(10.4, 1.6, 13.6, 5, '#ffd890', a);
    k.pool(9.0, 3.2, 4.5, 3.4, '#ffd890', a * 0.45, 0);
    if (v.active) k.pool(5.5, 3.4, 2.6, 2.2, '#ffd890', 0.18, 2.9);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 1.2, v.seed);
    for (let i = 0; i < n; i++) spawn(wisp(9.5, 4.2, 5.4, Math.floor(v.t * 10), i));
  },
};

// A wingback armchair facing +v, its left side at u0 (5.4 wide).
function armchair(k: Kit, u0: number, cover: Color): void {
  const u1 = u0 + 5.4;
  for (const [u, w] of [[u0 + 0.4, 1.0], [u1 - 0.8, 1.0], [u0 + 0.4, 5.0], [u1 - 0.8, 5.0]] as const) k.box(u, w, 0, 0.4, 0.4, 0.8, C.walnutDark, { line: k.thin });
  k.box(u0, 0.8, 0.7, 5.4, 4.8, 2.1, cover, { round: 0.35 });
  k.box(u0 + 0.1, 0.6, 2.8, 5.2, 1.5, 5.0, cover, { round: 0.7 });
  if (k.fine) {
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) k.disc(u0 + 1.2 + i * 1.0 + (r & 1) * 0.5, 2.12, 4.6 + r * 1.3, 0.12, shade(cover, -0.35), 0);
  }
  k.box(u0, 1.8, 4.4, 1.0, 1.7, 3.2, cover, { round: 0.45 });
  k.box(u1 - 1.0, 1.8, 4.4, 1.0, 1.7, 3.2, cover, { round: 0.45 });
  k.box(u0 + 1.0, 2.0, 2.8, 3.4, 3.5, 0.8, shade(cover, 0.06), { round: 0.35 });
  k.box(u0, 1.6, 2.8, 1.1, 4.0, 1.8, cover, { round: 0.5 });
  k.box(u1 - 1.1, 1.6, 2.8, 1.1, 4.0, 1.8, cover, { round: 0.5 });
  // a cushion against the back and a throw over the arm
  k.poly([[u0 + 1.6, 2.1, 3.5], [u0 + 3.6, 2.1, 3.5], [u0 + 3.4, 2.3, 5.4], [u0 + 1.8, 2.3, 5.4]], C.mustard, k.lw, 0.5);
  k.poly([[u1 - 1.15, 3.4, 4.65], [u1 + 0.05, 3.4, 4.65], [u1 + 0.05, 3.6, 1.2], [u1 - 0.3, 3.7, 1.1], [u1 - 0.3, 5.2, 1.1], [u1 + 0.05, 5.2, 1.2], [u1 + 0.05, 5.0, 4.65], [u1 - 1.15, 5.0, 4.65]], '#d98c4a', k.lw, 0.2);
  if (k.fine) for (let z = 1.6; z < 4.4; z += 0.5) k.line([[u1 + 0.07, 3.5, z], [u1 + 0.07, 5.1, z]], '#b86e34', 0.06 * k.s);
}

// ── idle: the sofa ──────────────────────────────────────────────────────────
// A rust chesterfield with cushions and a knitted blanket, a low coffee
// table with a teapot, cups and a jar candle, a side table with a lamp and
// an empty cat basket (the cat is out). Where tired agents curl up.

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(7.2, 3.6, 7.6, 3.4, 0.3);
    // the sofa
    const R = C.rust;
    for (const [u, w] of [[1.4, 1.0], [11.7, 1.0], [1.4, 5.0], [11.7, 5.0]] as const) k.box(u, w, 0, 0.45, 0.45, 0.7, C.walnutDark, { line: k.thin });
    k.box(1.0, 0.8, 0.6, 11.6, 4.8, 2.0, R, { round: 0.4 });
    k.box(1.0, 0.5, 2.6, 11.6, 1.5, 3.8, R, { round: 0.7 });
    if (k.fine) for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) k.disc(2.6 + i * 1.05 + (r & 1) * 0.5, 2.02, 4.0 + r * 1.2, 0.11, shade(R, -0.35), 0);
    for (let i = 0; i < 3; i++) k.box(2.3 + i * 3.0, 1.95, 2.6, 3.0, 3.4, 0.8, shade(R, 0.06), { round: 0.35 });
    k.box(1.0, 0.8, 2.6, 1.3, 4.6, 2.2, R, { round: 0.6 });
    k.box(11.3, 0.8, 2.6, 1.3, 4.6, 2.2, R, { round: 0.6 });
    // cushions leaning on the back, the blanket over the left arm
    k.poly([[2.6, 2.1, 3.4], [4.6, 2.1, 3.4], [4.4, 2.35, 5.4], [2.8, 2.35, 5.4]], C.mustard, k.lw, 0.5);
    k.poly([[8.9, 2.1, 3.4], [10.9, 2.1, 3.4], [10.7, 2.35, 5.3], [9.1, 2.35, 5.3]], '#f2e3c6', k.lw, 0.5);
    k.line([[9.0, 2.2, 4.35], [10.8, 2.2, 4.35]], C.teal, Math.max(1, 0.25 * k.s));
    // a knitted throw folded over the left arm, hanging down its front
    const knit = '#7fa58e';
    k.poly([[0.9, 3.2, 4.9], [2.4, 3.2, 4.9], [2.4, 5.7, 4.75], [0.9, 5.7, 4.75]], shade(knit, 0.1), k.lw, 0.15);
    k.poly([[0.9, 5.7, 4.75], [2.4, 5.7, 4.75], [2.45, 5.8, 1.4], [0.85, 5.8, 1.5]], k.side(knit, 0, 1), k.lw, 0.15);
    if (k.fine) for (let u = 1.15; u < 2.3; u += 0.3) k.line([[u, 5.82, 1.6], [u, 5.82, 4.6]], shade(knit, -0.25), 0.06 * k.s);
    k.line([[0.9, 5.85, 1.45], [2.45, 5.85, 1.4]], C.cream, Math.max(1, 0.18 * k.s));
    // the coffee table: teapot, cups, a candle, a book
    k.shadow(6.8, 8.3, 4.0, 1.9, 0.25);
    for (const [u, w] of [[3.8, 7.3], [9.5, 7.3], [3.8, 9.1], [9.5, 9.1]] as const) k.box(u, w, 0, 0.4, 0.4, 2.1, C.walnutDark, { line: k.thin });
    k.box(3.6, 7.1, 0.5, 6.4, 2.4, 0.25, C.walnutDark, { line: k.thin, stripe: false });
    k.box(4.0, 7.5, 0.75, 1.6, 1.4, 0.3, '#c0392f', { line: k.thin, stripe: false });
    k.box(3.4, 6.9, 2.1, 6.8, 2.8, 0.45, C.walnut);
    teapot(k, 5.3, 8.1, 2.55);
    cup(k, 7.3, 8.6, 2.55, '#f6f1e6', true, 0.45);
    cup(k, 8.4, 7.7, 2.55, '#e3b25e', true, 0.45);
    jarCandle(k, 9.4, 8.9, 2.55);
    // the side table and its lamp past the sofa's end
    k.shadow(13.9, 2.0, 1.4, 1.2, 0.22);
    k.box(12.9, 1.0, 0, 2.0, 2.0, 3.6, C.walnut);
    k.cyl(13.9, 2.0, 3.6, 0.45, 0.9, '#c86a48');
    k.rod([[13.9, 2.0, 4.5], [13.9, 2.0, 5.2]], C.brass, 0.1);
    frustum(k, 13.9, 2.0, 5.0, 1.0, 6.5, 0.65, '#efd9a8', '#fff3cf');
    k.halo(13.9, 2.0, 5.6, 3.4, '#ffd890', 0.45);
    // the cat's basket, its cushion still dented
    k.shadow(13.6, 8.0, 1.8, 1.6, 0.22);
    k.cyl(13.6, 8.0, 0, 1.55, 1.1, '#c8995a');
    if (k.fine) for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.1 + i * 0.1);
      k.line([[13.6 + Math.cos(a + 0.79) * 1.55, 8 + Math.sin(a + 0.79) * 1.55, 0.1], [13.6 + Math.cos(a + 0.79) * 1.55, 8 + Math.sin(a + 0.79) * 1.55, 1.0]], '#9a6e3a', 0.06 * k.s);
    }
    k.disc(13.6, 8.0, 1.1, 1.25, '#e9d3b0', k.thin);
    k.disc(13.65, 8.05, 1.12, 0.7, '#d9c09a', 0);
  },
};

function teapot(k: Kit, cu: number, cv: number, z: number): void {
  const body = '#5f8b7d';
  k.rod([[cu + 0.7, cv, z + 0.8], [cu + 1.3, cv, z + 1.4]], body, 0.22);
  const e = k.ell(cu, cv, z + 0.75, 0.85);
  k.pen.beginPath();
  k.pen.ellipse(e.cx, e.cy, e.rx * 0.95, e.rx * 0.62, 0, 0, Math.PI * 2);
  const g = k.pen.createRadialGradient(e.cx - e.rx * 0.3, e.cy - e.rx * 0.3, 0, e.cx, e.cy, e.rx);
  g.addColorStop(0, shade(body, 0.3));
  g.addColorStop(1, shade(body, -0.15));
  k.paint(g, k.lw);
  k.rod([[cu - 0.75, cv, z + 1.1], [cu - 1.15, cv, z + 0.9], [cu - 0.8, cv, z + 0.4]], body, 0.12);
  k.disc(cu, cv, z + 1.3, 0.35, shade(body, 0.1), k.thin);
  k.disc(cu, cv, z + 1.45, 0.12, C.cream, k.thin);
}

// ── entrance: the front door ────────────────────────────────────────────────
// A green front door with a glazed top in a walnut casing, a fanlight over
// it, the wet street beyond; a doormat, a lantern and a snake plant on one
// side, coats, a scarf and a hat on hooks and an umbrella stand on the
// other. It swings open while someone comes or goes, ringing its bell.

const DOOR = { u0: 4.6, u1: 10.4, h: 15.2, hv: 0.3 };

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, h } = DOOR;
    const k = still(v, 'entrance', 21, (k) => {
      // the street beyond the opening
      const out = -0.6;
      k.poly([[u0, out, 0], [u1, out, 0], [u1, out, h], [u0, out, h]], k.vgrad(u0, out, 0, h, [[0, '#59617a'], [0.25, '#2f3a55'], [1, '#1b2236']]), 0);
      k.poly([[u0, out, 0], [u1, out, 0], [u1, out, 2.4], [u0, out, 2.6]], '#3a3f52', 0);
      k.halo(u0 + 3.8, out, 9.5, 3.4, '#ffc070', 0.45);
      k.line([[u0 + 3.8, out, 0.2], [u0 + 3.8, out, 9.2]], '#151a26', Math.max(1, 0.25 * k.s));
      k.halo(u0 + 3.8, out, 1.2, 2.2, '#ffc070', 0.3);
      const pen = k.pen;
      pen.beginPath();
      for (let i = 0; i < 14; i++) {
        const u = u0 + 0.3 + hash(i, 101) * (u1 - u0 - 0.6);
        const z = 2.5 + hash(i, 102) * (h - 4);
        const [x0, y0] = k.p(u, out, z);
        const [x1, y1] = k.p(u - 0.15, out, z - 1.4);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      pen.strokeStyle = '#b8cce466';
      pen.lineWidth = Math.max(0.7, 0.07 * k.s);
      pen.stroke();
      // the reveal and the casing
      k.poly([[u0, out, 0], [u0, 0, 0], [u0, 0, h], [u0, out, h]], k.side('#cdb592', 1, 0), 0);
      k.poly([[u0, out, h], [u1, out, h], [u1, 0, h], [u0, 0, h]], '#8a6a4a', 0);
      k.box(u0 - 0.6, 0, 0, 0.6, 0.55, h + 0.9, C.walnut);
      k.box(u1, 0, 0, 0.6, 0.55, h + 0.9, C.walnut);
      k.box(u0 - 0.9, 0, h, u1 - u0 + 1.8, 0.7, 0.9, C.walnut);
      // the fanlight
      const fz = h + 0.9;
      const fan: P3[] = [];
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI * (i / 14);
        fan.push([(u0 + u1) / 2 + Math.cos(a) * 3.1, 0.05, fz + Math.sin(a) * 3.1]);
      }
      k.poly(fan, C.walnut, k.lw);
      const glass: P3[] = fan.map(([u, , z]) => [(u0 + u1) / 2 + (u - (u0 + u1) / 2) * 0.8, 0.08, fz + (z - fz) * 0.8]);
      k.poly(glass, k.vgrad((u0 + u1) / 2, 0.08, fz, fz + 2.6, [[0, '#ffd890'], [1, '#e8a85a']]), k.thin);
      for (let i = 1; i < 4; i++) {
        const a = Math.PI * (i / 4);
        k.line([[(u0 + u1) / 2, 0.1, fz], [(u0 + u1) / 2 + Math.cos(a) * 2.5, 0.1, fz + Math.sin(a) * 2.5]], C.walnut, Math.max(0.8, 0.15 * k.s));
      }
      k.halo((u0 + u1) / 2, 0.3, fz + 1.2, 3.2, '#ffd890', 0.25);
      // the threshold and the doormat
      k.poly([[u0, 0, 0.03], [u1, 0, 0.03], [u1, 0.45, 0.03], [u0, 0.45, 0.03]], C.brass, k.thin);
      k.shadow((u0 + u1) / 2, 2.2, 3.2, 1.6, 0.12);
      k.poly([[u0 + 0.2, 0.75, 0.06], [u1 - 0.2, 0.75, 0.06], [u1 - 0.2, 3.7, 0.06], [u0 + 0.2, 3.7, 0.06]], '#b8955e', k.thin, 0.2);
      k.poly([[u0 + 0.7, 1.2, 0.07], [u1 - 0.7, 1.2, 0.07], [u1 - 0.7, 3.25, 0.07], [u0 + 0.7, 3.25, 0.07]], '#9c3b32', 0);
      k.poly([[u0 + 1.0, 1.5, 0.08], [u1 - 1.0, 1.5, 0.08], [u1 - 1.0, 2.95, 0.08], [u0 + 1.0, 2.95, 0.08]], '#b8955e', 0);
      // left: a snake plant
      pot(k, 1.9, 2.0, 0, 0.95, 1.7, '#e3d6bd');
      const [px, py] = k.p(1.9, 2.0, 1.6);
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.16 + (hash(v.seed, i, 7) - 0.5) * 0.1;
        leaf(k, px + (i - 3) * 0.18 * k.s, py, a, (4.2 + hash(v.seed, i, 8) * 2.4) * k.s, 0.45 * k.s, i & 1 ? '#4f8a4a' : '#6fa35a');
      }
      // right: hooks with a coat, a scarf and a hat; the umbrella stand
      k.box(11.6, 0, 12.6, 3.3, 0.35, 0.6, C.walnut);
      for (const u of [12.3, 13.4, 14.5]) k.rod([[u, 0.35, 12.9], [u, 0.75, 12.8], [u, 0.85, 13.2]], C.brass, 0.1);
      k.poly([[11.6, 0.55, 12.8], [13.0, 0.55, 12.8], [13.3, 0.7, 6.0], [11.4, 0.75, 6.0]], '#9d4a35', k.lw, 0.3);
      k.line([[12.3, 0.62, 12.6], [12.35, 0.75, 6.2]], shade('#9d4a35', -0.3), k.thin);
      k.poly([[13.1, 0.6, 12.8], [13.7, 0.6, 12.8], [13.75, 0.7, 8.0], [13.2, 0.7, 8.0]], C.mustard, k.lw, 0.2);
      for (const z of [11.5, 10.3, 9.1]) k.line([[13.12, 0.62, z], [13.72, 0.62, z]], '#c0503f', Math.max(0.8, 0.18 * k.s));
      k.disc(14.5, 0.9, 13.3, 0.95, '#4a3a32', k.thin);
      k.cyl(14.5, 0.9, 13.3, 0.55, 0.65, '#4a3a32');
      k.shadow(13.5, 2.2, 1.0, 0.9, 0.25);
      for (const [du, c] of [[-0.2, '#2f6e6a'], [0.25, '#c0392f']] as const) {
        k.rod([[13.5 + du, 2.2, 1.5], [13.5 + du, 2.2, 4.2], [13.5 + du + 0.35, 2.2, 4.5], [13.5 + du + 0.6, 2.2, 4.1]], c === '#2f6e6a' ? C.walnutDark : '#2b2522', 0.12);
      }
      k.cyl(13.5, 2.2, 0, 0.75, 2.5, C.teal);
      // the lantern by the door
      k.rod([[2.2, 0.05, 13.4], [2.2, 0.9, 13.4]], C.iron, 0.12);
      k.box(1.7, 0.7, 11.4, 1.0, 1.0, 1.8, C.iron, { line: k.lw, stripe: false });
      k.poly([[1.82, 1.71, 11.55], [2.58, 1.71, 11.55], [2.58, 1.71, 13.05], [1.82, 1.71, 13.05]], '#ffe0a0', 0);
      k.poly([[2.71, 0.82, 11.55], [2.71, 1.58, 11.55], [2.71, 1.58, 13.05], [2.71, 0.82, 13.05]], '#f0c070', 0);
      k.box(1.6, 0.6, 13.2, 1.2, 1.2, 0.3, C.iron, { line: k.thin });
    });
    // the lantern's glow
    k.halo(2.2, 1.2, 12.3, 3.6, '#ffc870', 0.4);
    // the door: shut, or swung in while someone passes
    const th = v.active ? 0.62 + 0.05 * Math.sin(v.t * 2.2) : 0;
    doorLeaf(k, th);
    // the bell over it, swinging while the door is open
    const sw = v.active ? Math.sin(v.t * 9) * 0.45 : 0;
    const bu = u1 - 0.6;
    const bz = h + 0.6;
    k.rod([[bu, 0.6, bz + 0.6], [bu + Math.sin(sw) * 0.5, 0.7, bz + 0.6 - Math.cos(sw) * 0.5]], C.brass, 0.08);
    const [bx, by] = k.p(bu + Math.sin(sw) * 0.75, 0.75, bz + 0.6 - Math.cos(sw) * 0.75);
    const r = 0.38 * k.s;
    k.pen.beginPath();
    k.pen.moveTo(bx - r, by + r * 0.6);
    k.pen.quadraticCurveTo(bx - r, by - r * 0.9, bx, by - r * 0.9);
    k.pen.quadraticCurveTo(bx + r, by - r * 0.9, bx + r, by + r * 0.6);
    k.pen.closePath();
    k.paint(C.brass, k.thin);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    // rain blowing in at the open door
    const n = due(v.t, dt, 6, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 30) + i;
      const j = (q: number) => hash(tick, q);
      spawn({ kind: 'drop', x: DOOR.u0 + 1 + j(1) * 4, y: 0.5 + j(2) * 1.5, z: 6 + j(3) * 8, vx: (j(4) - 0.5) * 0.6, vy: 1.5 + j(5) * 1.5, vz: -2, life: 1.2, color: [190, 210, 235], glow: false, gravity: 18 });
    }
  },
};

// The door leaf on its hinge at u0, opened by th radians into the room.
function doorLeaf(k: Kit, th: number): void {
  const { u0, u1, h, hv } = DOOR;
  const w = u1 - u0 - 0.1;
  const du = Math.cos(th);
  const dv = Math.sin(th);
  const P = (s: number, z: number, n = 0): P3 => [u0 + 0.05 + du * s - dv * n, hv + dv * s + du * n, z];
  const green = '#2f5d4e';
  const face = k.side(green, -dv, du, 0.16);
  // the free edge, seen once it swings
  if (th > 0.05) k.poly([P(w, 0), P(w, 0, -0.35), P(w, h, -0.35), P(w, h)], k.side(green, du, dv, 0.16), k.thin);
  k.poly([P(0, 0), P(w, 0), P(w, h), P(0, h)], face, k.lw);
  // two raised panels below, a glazed top in four lights
  const panel = (s0: number, s1: number, z0: number, z1: number) => {
    k.poly([P(s0, z0), P(s1, z0), P(s1, z1), P(s0, z1)], shade(face, -0.08), k.thin);
    k.line([P(s0 + 0.12, z0 + 0.12), P(s0 + 0.12, z1 - 0.12), P(s1 - 0.12, z1 - 0.12)], shade(face, 0.25), Math.max(0.7, 0.09 * k.s));
  };
  panel(0.6, w / 2 - 0.25, 1.3, 6.6);
  panel(w / 2 + 0.25, w - 0.6, 1.3, 6.6);
  const g0 = 7.5;
  const g1 = h - 0.8;
  k.poly([P(0.6, g0), P(w - 0.6, g0), P(w - 0.6, g1), P(0.6, g1)], k.grad(P(0.6, g1), P(w - 0.6, g0), [[0, '#3a4a6a'], [0.6, '#24304a'], [1, '#2f3c5a']]), k.thin);
  k.poly([P(1.2, g0 + 0.4), P(1.8, g0 + 0.4), P(3.2, g1 - 0.4), P(2.6, g1 - 0.4)], '#ffffff1c', 0);
  k.line([P(w / 2, g0), P(w / 2, g1)], green, Math.max(1, 0.22 * k.s));
  k.line([P(0.6, (g0 + g1) / 2), P(w - 0.6, (g0 + g1) / 2)], green, Math.max(1, 0.22 * k.s));
  // kick plate, handle
  k.poly([P(0.3, 0.2), P(w - 0.3, 0.2), P(w - 0.3, 0.9), P(0.3, 0.9)], C.brass, k.thin);
  k.rod([P(w - 0.6, 7.0, 0.15), P(w - 1.3, 7.0, 0.3)], C.brass, 0.16);
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
