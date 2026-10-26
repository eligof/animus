import type { At } from '../../art/iso.ts';
import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { binders, cageLamp, chair, checker, dot, fillPts, frustum, gauge, hazard, hazardEnd, hull, needleOf, rivets, sleeve, tin, wheel } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, due, hash, kitOf, still, wisp, withAlpha } from './kit.ts';

// The shelter's stations, each a PropArt in its own frame (u along the
// wall, v out toward the agent, z up; the viewer always sees the top, the
// +v front and the +u end). Animated ones paint their still parts through
// the sprite cache (see still) and only the moving bits each frame, and
// hold still while nobody works them.

type Spawn = (p: Particle) => void;

// A Kit in a frame turned by th radians about the upright line through
// (u0, v0) of k's frame: u' runs along the turned leaf, v' out of its face.
function turned(k: Kit, u0: number, v0: number, th: number): Kit {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const at: At = (u, v, z) => k.p(u0 + c * u - s * v, v0 + s * u + c * v, z);
  return new Kit(k.pen, at, k.s);
}

// ── write: the typewriter desk ──────────────────────────────────────────────
// A steel desk with a drawer pedestal, an ivory typewriter with a sheet in
// the roller, a stack of papers and a gooseneck lamp; a swivel chair
// pulled up. Working it steps the carriage along, strikes the keys and
// grows the lines on the sheet.

const TYPE = { u0: 2.2, u1: 6.4, v0: 1.6, v1: 4.3, z: 7.1 };
const ROLL = { v: 2.0, z: 8.55, half: 2.5 };

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 11,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 11, (k) => {
      k.shadow(5.5, 3.2, 5.8, 3.6, 0.3);
      // the desk: a side panel, a modesty panel, the drawer pedestal
      const desk = '#8d9a86';
      k.box(0.8, 0.8, 0, 0.5, 4.0, 6.2, shade(desk, -0.08), { stripe: false });
      k.box(1.3, 0.8, 2.2, 5.4, 0.35, 4.0, shade(desk, -0.2), { line: k.thin, stripe: false });
      k.box(6.7, 0.8, 0, 3.6, 4.0, 6.2, desk, { stripe: false });
      for (const [z0, z1] of [[0.5, 2.3], [2.6, 4.2], [4.5, 5.9]] as const) {
        k.rect(6.95, z0, 10.05, z1, 4.81, k.side(shade(desk, 0.06), 0, 1, 0.12), k.thin);
        k.box(7.95, 4.8, (z0 + z1) / 2 - 0.15, 1.1, 0.3, 0.3, C.chrome, { line: k.thin * 0.8, stripe: false });
      }
      k.box(0.5, 0.5, 6.2, 10.0, 4.6, 0.55, desk);
      // a rubber mat under the machine
      k.poly([[1.9, 1.3, 6.76], [6.7, 1.3, 6.76], [6.7, 4.85, 6.76], [1.9, 4.85, 6.76]], '#3b4a3a', k.thin, 0.25);
      // papers stacked on the pedestal, a pencil on them
      for (let i = 0; i < 4; i++) k.box(7.0 + hash(v.seed, i, 2) * 0.3, 2.6 + hash(v.seed, i, 3) * 0.3, 6.75 + i * 0.16, 2.1, 1.8, 0.16, i & 1 ? '#f2ead2' : C.cream, { line: k.thin * 0.7, stripe: false });
      k.rod([[7.3, 3.3, 7.45], [8.7, 4.0, 7.45]], C.mustard, 0.1);
      // the swivel chair pulled up to it
      chair(k, 3.8, 5.7, -Math.PI / 2 - 0.25, C.leather);
      // the typewriter: a heavy body, the sloped keyboard, the basket
      const ivory = '#ddd2b2';
      const { u0, u1, v0, v1, z } = TYPE;
      k.shadow((u0 + u1) / 2, (v0 + v1) / 2, 2.4, 1.6, 0.3, 6.77);
      k.box(u0, v0, z - 0.35, u1 - u0, v1 - v0 - 1.1, 1.45, ivory, { round: 0.25 });
      // the keyboard: a wedge down toward the typist
      const kb = (fu: number, fv: number): P3 => [u0 + 0.15 + fu * (u1 - u0 - 0.3), v1 - 1.2 + fv * 1.2, z - 0.3 + (1 - fv) * 0.75];
      k.poly([kb(0, 0), kb(1, 0), kb(1, 1), kb(0, 1)], shade(ivory, 0.08), k.lw, 0.1);
      k.poly([[u1 - 0.15, v1 - 1.2, z + 0.45], [u1 - 0.15, v1, z - 0.3], [u1 - 0.15, v1, z - 0.35], [u1 - 0.15, v1 - 1.2, z - 0.35]], shade(ivory, -0.2), k.thin);
      // keys: three rows of dark caps
      const keys: P3[] = [];
      for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) keys.push(kb(0.08 + i * 0.105 + (r & 1) * 0.04, 0.18 + r * 0.3));
      if (k.fine) {
        for (const [ku, kv, kz] of keys) dot(k, ku, kv, kz + 0.05, 0.12, '#2a2a26', Math.max(0.5, k.thin * 0.5));
      } else {
        for (let r = 0; r < 3; r++) k.line([kb(0.08, 0.18 + r * 0.3), kb(0.94, 0.18 + r * 0.3)], '#2a2a26', Math.max(0.8, 0.16 * k.s));
      }
      // the space bar and the type basket's dark mouth
      k.line([kb(0.3, 0.92), kb(0.7, 0.92)], '#2a2a26', Math.max(0.8, 0.14 * k.s));
      k.poly([[u0 + 1.2, v0 + 1.25, z + 1.11], [u1 - 1.2, v0 + 1.25, z + 1.11], [u1 - 1.5, v0 + 0.9, z + 1.11], [u0 + 1.5, v0 + 0.9, z + 1.11]], '#2f2b26', 0);
      // the gooseneck lamp at the back corner, lit
      k.disc(9.6, 1.3, 6.78, 0.75, C.steelDark, k.lw);
      k.rod([[9.6, 1.3, 6.8], [9.5, 1.4, 9.0], [9.0, 1.9, 10.2], [8.4, 2.4, 10.1]], C.steelDark, 0.14);
      frustum(k, 8.3, 2.5, 10.4, 0.35, 9.5, 0.9, C.teal, '#fff3c4');
      k.halo(8.3, 2.6, 9.3, 2.4, '#ffe2a0', 0.4);
      k.pool(8.1, 3.2, 1.8, 1.2, '#ffe2a0', 0.5, 6.8);
    });
    // the carriage: stepped along while typing, back again at the bell
    const step = Math.floor(v.t * 6);
    const col = v.active ? step % 26 : 8;
    const line = v.active ? Math.floor(step / 26) : 0;
    const co = 1.2 - col * 0.1;
    const cu = (TYPE.u0 + TYPE.u1) / 2 + co;
    // the sheet standing up out of the roller, a little back
    const sh = (fu: number, fz: number): P3 => [cu - 1.25 + fu * 2.5, ROLL.v - 0.15 - fz * 0.55, ROLL.z + 0.2 + fz * 2.15];
    k.poly([sh(0, 0), sh(1, 0), sh(1, 1), sh(0, 1)], k.side('#fbf6e8', 0, 1, 0.08), k.thin);
    // typed lines, the newest at the roller (lines of grey marks, never letters)
    const rows: Array<[P3, P3]> = [];
    for (let r = 0; r < 4; r++) {
      const fz = 0.16 + r * 0.2;
      const n = line - r;
      const full = 0.55 + hash(n, 5) * 0.3;
      const len = r === 0 ? (v.active ? (col / 26) * 0.85 : full * 0.6) : full;
      if (len > 0.03) rows.push([sh(0.08, fz), sh(0.08 + Math.min(0.84, len), fz)]);
    }
    k.segs(rows, '#7b7f78', Math.max(0.7, 0.13 * k.s));
    // the roller with its knobs, and the return lever
    const rl: P3 = [cu - ROLL.half, ROLL.v, ROLL.z];
    const rr: P3 = [cu + ROLL.half, ROLL.v, ROLL.z];
    k.rod([rl, rr], '#2f2b26', 0.42);
    k.line([[rl[0] + 0.2, ROLL.v, ROLL.z + 0.18], [rr[0] - 0.2, ROLL.v, ROLL.z + 0.18]], '#5a544a', Math.max(0.6, 0.1 * k.s));
    k.disc(rl[0] - 0.25, ROLL.v, ROLL.z - 0.4, 0.42, '#2f2b26', k.thin);
    k.disc(rr[0] + 0.25, ROLL.v, ROLL.z - 0.4, 0.42, '#2f2b26', k.thin);
    k.rod([[rl[0] + 0.1, ROLL.v + 0.3, ROLL.z + 0.2], [rl[0] - 0.4, ROLL.v + 1.1, ROLL.z + 0.5]], C.chrome, 0.1);
    if (!v.active) return;
    // a type bar flying up to strike, and the struck key down
    const ph = (v.t * 6) % 1;
    if (ph < 0.5) {
      const f = ph / 0.5;
      const base: P3 = [(TYPE.u0 + TYPE.u1) / 2, TYPE.v0 + 1.1, TYPE.z + 1.0];
      const tip: P3 = [base[0], base[1] - 0.2 - f * 0.7, base[2] + 0.2 + f * 1.0];
      k.line([base, tip], '#4a4640', Math.max(0.8, 0.1 * k.s));
      const kv = hash(step, 9);
      const ku = TYPE.u0 + 0.5 + hash(step, 8) * (TYPE.u1 - TYPE.u0 - 1);
      dot(k, ku, TYPE.v1 - 1.0 + kv * 0.8, TYPE.z + 0.1 + (1 - kv) * 0.4, 0.16, C.orange, k.thin * 0.6);
    }
  },
};

// ── read: the filing cabinets ───────────────────────────────────────────────
// Two four-drawer steel filing cabinets, one khaki and one olive, binders
// and manuals on top (coloured spines, plain bands), one drawer pulled
// out on its folders; a little open shelf of manuals and a carton beside.

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 16,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(7, 2.0, 7.4, 2.4, 0.3);
    const F = 3.0; // the cabinets' fronts
    const H = 12.4;
    const cabinet = (u0: number, base: Color, open: number) => {
      k.box(u0, 0.2, 0, 4.4, F - 0.2, H, base, { round: 0.12 });
      k.box(u0 + 0.1, F - 0.05, 0, 4.2, 0.1, 0.35, shade(base, -0.4), { line: 0, stripe: false });
      for (let i = 0; i < 4; i++) {
        const z0 = 0.5 + i * 2.95;
        const z1 = z0 + 2.7;
        const out = i === open ? 0.85 : 0;
        if (out) {
          // the drawer pulled out: its sides, the folders standing in it
          k.box(u0 + 0.25, F - 0.6, z0, 3.9, out + 0.6, z1 - z0, shade(base, -0.06), { line: k.lw, stripe: false });
          const tabs: Color[] = ['#e8d48a', '#f2ead2', '#c9a96a', '#a8c8e0', '#e8b0a0'];
          for (let j = 0; j < 7; j++) k.box(u0 + 0.5 + j * 0.5, F - 0.4, z1 - 0.2, 0.42, out + 0.2, 0.55 + hash(v.seed, j, 4) * 0.4, tabs[j % tabs.length], { line: k.thin * 0.7, stripe: false });
        }
        const n = F + out + 0.01;
        k.rect(u0 + 0.25, z0, u0 + 4.15, z1, n, k.side(shade(base, out ? 0.02 : 0.05), 0, 1, 0.12), k.thin);
        // a blank card holder and the pull
        k.rect(u0 + 1.5, z1 - 0.95, u0 + 2.9, z1 - 0.35, n + 0.01, k.side(C.cream, 0, 1, 0.1), Math.max(0.6, k.thin * 0.7));
        k.box(u0 + 1.5, n, z1 - 1.75, 1.4, 0.28, 0.32, C.chrome, { line: k.thin * 0.8, stripe: false });
      }
    };
    cabinet(0.3, '#b9a77a', -1);
    cabinet(5.0, '#7a8a5a', 1);
    // on top: binders on the khaki one, manuals and a tin on the olive one
    k.box(0.6, 0.6, H, 0.3, 1.8, 2.0, C.steelDark, { line: k.thin, stripe: false });
    binders(k, 0.95, 4.3, 2.5, H, 2.9, v.seed, 1.9);
    for (let i = 0; i < 3; i++) k.box(5.4 + i * 0.15, 0.6 + i * 0.1, H + i * 0.5, 2.6 - i * 0.2, 1.9, 0.5, [C.teal, '#c8463a', '#e8dcb8'][i], { line: k.thin, stripe: false });
    tin(k, 8.7, 1.4, H, 0.6, 1.3, '#7fbf4a');
    // the open shelf: angle-iron posts, three shelves
    const s0 = 10.0;
    const s1 = 13.6;
    const posts = [[s0, 0.3], [s1 - 0.25, 0.3], [s0, 2.75], [s1 - 0.25, 2.75]] as const;
    for (const [u, w] of posts.slice(0, 2)) k.box(u, w, 0, 0.25, 0.25, 13.6, C.steelDark, { line: k.thin, stripe: false });
    const shelves = [0.4, 4.8, 9.2, 13.3];
    for (const [i, z] of shelves.entries()) {
      k.box(s0, 0.3, z, s1 - s0, 2.7, 0.3, C.steel, { line: k.thin });
      if (i === 0) {
        // a carton on the bottom shelf
        k.box(s0 + 0.3, 0.6, z + 0.3, 3.0, 2.2, 2.6, '#c49a62', { line: k.lw });
        k.line([[s0 + 0.3, 2.81, z + 2.0], [s0 + 3.3, 2.81, z + 2.0]], '#9a7444', Math.max(0.7, 0.1 * k.s));
      } else if (i < 3) binders(k, s0 + 0.2, s1 - 0.3, 2.85, z + 0.3, 3.3, v.seed + i * 5, 2.0);
    }
    for (const [u, w] of posts.slice(2)) k.box(u, w, 0, 0.25, 0.25, 13.6, C.steelDark, { line: k.thin, stripe: false });
  },
};

// ── search: the radar console ───────────────────────────────────────────────
// A steel console with a sloped panel of knobs, toggles and small lamps,
// a round green scope (rings and a cross) set in a tall housing, a desk
// microphone. Searching turns the sweep, a blip lighting up behind it;
// idle, the scope glows dim with its rings.

const SCOPE = { u: 6, n: 2.45, z: 8.6, r: 2.0 };

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 12,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'search', 12, (k) => {
      k.shadow(6, 2.0, 6.4, 2.4, 0.3);
      const body = '#55777a';
      k.box(0.5, 0.3, 0, 11.0, 3.3, 5.6, body, { stripe: false, round: 0.1 });
      // the base's kick and the front panels with vents
      k.rect(0.5, 0, 11.5, 0.5, 3.61, '#2b3330', 0);
      for (const [a0, a1] of [[1.0, 3.6], [8.4, 11.0]] as const) {
        k.rect(a0, 1.0, a1, 4.8, 3.61, k.side(shade(body, -0.06), 0, 1, 0.1), k.thin);
        const sl: Array<[P3, P3]> = [];
        for (let z = 1.5; z < 4.5; z += 0.55) sl.push([[a0 + 0.4, 3.62, z], [a1 - 0.4, 3.62, z]]);
        k.segs(sl, withAlpha(INK, 0.55), Math.max(0.6, 0.1 * k.s));
      }
      // the sloped control panel along the front of the top
      const sp = (u: number, f: number): P3 => [u, 3.6 - f * 1.2, 5.6 + f * 0.9];
      k.poly([sp(0.5, 0), sp(11.5, 0), sp(11.5, 1), sp(0.5, 1)], shade('#2f3f40', 0.1), k.lw);
      k.poly([[11.5, 0.3, 5.6], [11.5, 3.6, 5.6], [11.5, 2.4, 6.5], [11.5, 0.3, 6.5]], k.side(body, 1, 0), k.lw);
      k.box(0.5, 0.3, 5.6, 11.0, 2.1, 0.9, body, { stripe: false });
      // knobs, toggles and lamps on the slope (both sides of the housing)
      for (const u of [1.3, 2.5, 9.4, 10.6]) {
        const p = sp(u, 0.45);
        k.disc(p[0], p[1], p[2] + 0.1, 0.32, '#2a2a26', k.thin);
        if (k.fine) k.disc(p[0], p[1], p[2] + 0.2, 0.12, C.chrome, 0);
      }
      const lamps: Color[] = [C.red, C.mustard, C.radar];
      for (const [i, u] of [1.6, 2.1, 9.9].entries()) {
        const p = sp(u, 0.85);
        dot(k, p[0], p[1], p[2] + 0.1, 0.16, lamps[i], k.thin * 0.6);
      }
      if (k.fine) {
        const tog: Array<[P3, P3]> = [];
        for (const u of [3.2, 3.6, 8.8]) {
          const p = sp(u, 0.4);
          tog.push([[p[0], p[1], p[2]], [p[0], p[1] + 0.2, p[2] + 0.45]]);
        }
        k.segs(tog, C.chrome, 0.12 * k.s, 'round');
      }
      // the scope's housing standing on the console
      k.box(3.3, 0.4, 6.5, 5.4, 2.0, 5.0, '#c9bd94', { round: 0.2 });
      k.box(3.6, 0.6, 11.5, 4.8, 1.6, 0.3, body, { line: k.thin, stripe: false });
      // the scope: a chrome bezel, the glass dark with its rings
      k.face(SCOPE.u, SCOPE.n, SCOPE.z, SCOPE.r + 0.35, C.chrome, k.lw, 32);
      k.face(SCOPE.u, SCOPE.n + 0.02, SCOPE.z, SCOPE.r, C.crtDark, k.thin, 32);
      scopeMarks(k, 0.55);
      // two little meters flanking it
      for (const u of [3.95, 8.05]) {
        k.rect(u - 0.45, 6.9, u + 0.45, 7.8, SCOPE.n + 0.01, C.cream, k.thin);
        k.line([[u, SCOPE.n + 0.02, 7.0], [u + 0.25, SCOPE.n + 0.02, 7.6]], C.red, Math.max(0.6, 0.06 * k.s));
      }
      // the microphone on its stand
      k.disc(10.6, 1.1, 6.52, 0.5, C.steelDark, k.thin);
      k.rod([[10.6, 1.1, 6.5], [10.6, 1.1, 8.0], [10.3, 1.4, 8.6]], C.steelDark, 0.1);
      k.box(9.95, 1.25, 8.4, 0.75, 0.5, 1.0, C.chrome, { line: k.thin, round: 0.25 });
    });
    // the screen's glow: dim and still while idle, bright while sweeping
    if (!v.active) {
      k.halo(SCOPE.u, SCOPE.n + 0.6, SCOPE.z, SCOPE.r * 1.2, C.radar, 0.16);
      return;
    }
    k.face(SCOPE.u, SCOPE.n + 0.03, SCOPE.z, SCOPE.r - 0.05, '#0f3a1c', 0, 28);
    scopeMarks(k, 0.9);
    // the sweep and its fading trail
    const a = -v.t * 2.6;
    const R = SCOPE.r - 0.1;
    for (let i = 6; i >= 0; i--) {
      const b = a + i * 0.11;
      const wedge: P3[] = [[SCOPE.u, SCOPE.n + 0.05, SCOPE.z]];
      for (let j = 0; j <= 3; j++) {
        const c = b + (j / 3) * 0.12;
        wedge.push([SCOPE.u + Math.cos(c) * R, SCOPE.n + 0.05, SCOPE.z + Math.sin(c) * R]);
      }
      k.poly(wedge, withAlpha(C.radar, 0.5 * (1 - i / 7)), 0);
    }
    k.line([[SCOPE.u, SCOPE.n + 0.06, SCOPE.z], [SCOPE.u + Math.cos(a) * R, SCOPE.n + 0.06, SCOPE.z + Math.sin(a) * R]], '#d8ffe0', Math.max(0.8, 0.12 * k.s));
    // blips that light as the sweep passes and fade after
    for (let i = 0; i < 3; i++) {
      const ba = hash(v.seed, i, 31) * Math.PI * 2;
      const br = 0.5 + hash(v.seed, i, 32) * (R - 0.7);
      const since = (((ba - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const glow = since < 4 ? 1 - since / 4 : 0;
      if (glow <= 0.05) continue;
      const bu = SCOPE.u + Math.cos(ba) * br;
      const bz = SCOPE.z + Math.sin(ba) * br;
      k.face(bu, SCOPE.n + 0.07, bz, 0.18, withAlpha('#e8ffd8', glow), 0, 10);
      k.halo(bu, SCOPE.n + 0.1, bz, 0.7, C.radar, 0.5 * glow);
    }
    k.halo(SCOPE.u, SCOPE.n + 0.6, SCOPE.z, SCOPE.r * 1.3, C.radar, 0.3);
  },
};

// The scope's range rings and cross, at strength a.
function scopeMarks(k: Kit, a: number): void {
  const { u, n, z, r } = SCOPE;
  const col = withAlpha(C.radar, a);
  const w = Math.max(0.6, 0.06 * k.s);
  for (const f of [0.33, 0.66, 0.97]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 28; i++) {
      const th = (i / 28) * Math.PI * 2;
      pts.push([u + Math.cos(th) * r * f, n + 0.04, z + Math.sin(th) * r * f]);
    }
    k.line(pts, col, w);
  }
  k.segs([[[u - r, n + 0.04, z], [u + r, n + 0.04, z]], [[u, n + 0.04, z - r], [u, n + 0.04, z + r]]], col, w);
}

// ── run: the water purifier ────────────────────────────────────────────────
// Two teal tanks banded in steel on a skid, glass sight tubes up
// their fronts, a manifold between them dropping through a valve wheel to
// a pump, a cabinet of round gauges before them and a spigot over a pail.
// Running it bubbles the water up the sight tubes, turns the wheel, sets
// the needles wobbling and blows steam off the vents.

const TANKS = [[2.7, 2.7], [7.9, 2.7]] as const;
const TANK = { r: 2.1, z0: 0.7, h: 10.0 };
const SIGHT = (cu: number, cv: number): [number, number] => [cu + 0.75, cv + TANK.r + 0.12];
const PANEL = { u0: 0.9, u1: 5.3, v: 7.6, z1: 6.0 };
const GAUGES = [[2.0, PANEL.v + 0.01, 4.4], [4.2, PANEL.v + 0.01, 4.4]] as const;
const VALVE: P3 = [7.9, 5.95, 5.0];

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'run', 15, (k) => {
      k.shadow(5.5, 5.5, 5.8, 5.8, 0.32);
      // the skid: a steel deck, its edges striped
      k.box(0.4, 0.4, 0, 10.2, 10.2, 0.7, C.steelDark);
      hazard(k, 0.5, 0.1, 10.5, 0.6, 10.61, 0, k.lit(0, 1), 0.5);
      hazardEnd(k, 0.5, 0.1, 10.5, 0.6, 10.61, 0, 0.5);
      if (k.fine) {
        const tread: Array<[P3, P3]> = [];
        for (let u = 1; u < 10.4; u += 1.1) for (let w = 8.2; w < 10.4; w += 1.1) tread.push([[u, w, 0.71], [u + 0.45, w + 0.45, 0.71]]);
        k.segs(tread, withAlpha('#9aa794', 0.6), 0.1 * k.s, 'round');
      }
      // the two tanks, banded, domed, with a vent on each
      for (const [cu, cv] of TANKS) {
        k.shadow(cu, cv, TANK.r * 1.05, TANK.r * 1.05, 0.25, TANK.z0);
        k.cyl(cu, cv, TANK.z0, TANK.r, TANK.h, C.teal);
        for (const z of [TANK.z0 + 1.0, TANK.z0 + TANK.h - 1.4]) sleeve(k, cu, cv, TANK.r * 1.02, z, z + 0.55, C.steel, k.thin);
        rivets(k, [-0.6, -0.2, 0.2, 0.6].map((d) => [cu + Math.cos(Math.PI / 2 + d) * TANK.r * 1.03, cv + Math.sin(Math.PI / 2 + d) * TANK.r * 1.03, TANK.z0 + 1.27] as P3), C.rivet, 0.1);
        dome(k, cu, cv, TANK.z0 + TANK.h, TANK.r, 1.2, C.teal);
        k.cyl(cu - 0.6, cv - 0.4, TANK.z0 + TANK.h + 0.8, 0.26, 2.3, C.pipe);
        k.cyl(cu - 0.6, cv - 0.4, TANK.z0 + TANK.h + 3.0, 0.4, 0.3, C.steelDark);
        // the sight tube up the front: glass between two fittings, water in it
        const [su, sv] = SIGHT(cu, cv);
        k.box(su - 0.3, sv - 0.35, 4.0, 0.6, 0.55, 0.45, C.chrome, { line: k.thin, stripe: false });
        k.box(su - 0.3, sv - 0.35, 9.9, 0.6, 0.55, 0.45, C.chrome, { line: k.thin, stripe: false });
        k.cyl(su, sv, 4.45, 0.22, 5.45, '#d8eef6', { line: k.thin });
        k.cyl(su, sv, 4.45, 0.16, 3.2, C.water, { line: 0, top: '#bfe8f8' });
      }
      // the manifold: out of each tank, across, and down through the valve to the pump
      k.rod([[TANKS[0][0] + 1.4, 4.4, 7.4], [TANKS[0][0] + 1.4, 5.95, 7.4], [VALVE[0], 5.95, 7.4]], C.pipe, 0.4);
      k.rod([[TANKS[1][0], 4.75, 7.4], [VALVE[0], 5.95, 7.4]], C.pipe, 0.4);
      k.rod([[VALVE[0], 5.95, 7.4], [VALVE[0], 5.95, 3.2]], C.pipe, 0.4);
      k.box(VALVE[0] - 0.7, VALVE[1] - 0.6, VALVE[2] - 0.8, 1.4, 1.2, 1.6, C.steelDark, { line: k.lw, round: 0.2 });
      k.rod([[VALVE[0], VALVE[1] + 0.6, VALVE[2]], [VALVE[0], VALVE[1] + 1.0, VALVE[2]]], C.steelDark, 0.18);
      // the pump: a green motor housing with fins, the spigot off its end over a pail
      k.box(6.2, 6.6, 0.7, 3.4, 2.2, 2.6, '#5f7f4f', { round: 0.25 });
      if (k.fine) {
        const fins: Array<[P3, P3]> = [];
        for (let z = 1.2; z < 3.0; z += 0.42) fins.push([[6.5, 8.81, z], [8.6, 8.81, z]]);
        k.segs(fins, withAlpha(INK, 0.5), 0.09 * k.s);
      }
      k.cyl(VALVE[0], 6.4, 3.2, 0.55, 0.35, C.steelDark);
      k.rod([[9.4, 7.5, 2.6], [9.65, 8.9, 2.9], [9.65, 9.3, 2.6]], C.copper, 0.2);
      k.cyl(9.65, 9.55, 0.7, 0.8, 1.5, '#a9b3a6');
      k.disc(9.65, 9.55, 2.21, 0.66, C.water, 0);
      k.rod([[8.85, 9.55, 2.25], [9.65, 10.35, 2.8], [10.45, 9.55, 2.25]], C.steelDark, 0.06);
      // the gauge cabinet before the tanks: two round gauges, lamps, a lever
      const pc = '#c9b48a';
      k.box(PANEL.u0, 6.2, 0.7, PANEL.u1 - PANEL.u0, PANEL.v - 6.2, PANEL.z1 - 0.7, pc, { round: 0.15 });
      for (const [gu, gv, gz] of GAUGES) gauge(k, gu, gv, gz, 0.85, Math.PI * 0.75);
      for (const [i, c] of [C.radar, C.mustard, C.red].entries()) dot(k, 1.6 + i * 0.6, PANEL.v + 0.01, 2.6, 0.15, c, k.thin * 0.6);
      k.rect(3.8, 1.6, 4.9, 3.2, PANEL.v + 0.01, k.side(shade(pc, -0.1), 0, 1, 0.1), k.thin);
      k.rod([[4.35, PANEL.v + 0.05, 2.6], [4.35, PANEL.v + 0.4, 3.6]], C.chrome, 0.12);
      k.disc(4.35, PANEL.v + 0.4, 3.7, 0.22, C.red, k.thin);
    });
    // the valve wheel turns while it runs
    wheel(k, VALVE[0], VALVE[1] + 1.05, VALVE[2], 1.05, v.active ? v.t * 1.6 : 0.3, C.orange, 4);
    // the needles: wobbling while it runs, resting low otherwise
    for (const [i, [gu, gv, gz]] of GAUGES.entries()) {
      const a = v.active ? Math.PI * (0.45 - 0.1 * i) + Math.sin(v.t * (7 + i * 3) + i) * 0.18 : Math.PI * 0.95;
      needleOf(k, gu, gv, gz, 0.85, a);
    }
    if (!v.active) return;
    // bubbles rising up the sight tubes
    for (const [ti, [cu, cv]] of TANKS.entries()) {
      const [su, sv] = SIGHT(cu, cv);
      for (let i = 0; i < 4; i++) {
        const ph = (v.t * (0.9 + hash(ti, i, 3) * 0.6) + hash(ti, i, 4)) % 1;
        dot(k, su + (hash(ti, i, 5) - 0.5) * 0.1, sv + 0.16, 4.6 + ph * 2.9, 0.07 + ph * 0.05, '#f0faff', Math.max(0.5, k.thin * 0.4));
      }
    }
    // a drip falling from the spigot into the pail
    const ph = (v.t * 1.3) % 1;
    dot(k, 9.65, 9.3, 2.4 - ph * 0.2, 0.1, C.water, 0);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 2.2, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      const [cu, cv] = TANKS[tick & 1];
      spawn(wisp(cu - 0.6, cv - 0.4, TANK.z0 + TANK.h + 3.4, tick, i));
    }
  },
};

// A shallow dome over a tank at z, r round, h high.
function dome(k: Kit, cu: number, cv: number, z: number, r: number, h: number, base: Color): void {
  const e = k.ell(cu, cv, z, r);
  const [, ty] = k.p(cu, cv, z + h);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e.cx - e.rx, e.cy);
  pen.bezierCurveTo(e.cx - e.rx, ty + (e.cy - ty) * 0.25, e.cx - e.rx * 0.45, ty, e.cx, ty);
  pen.bezierCurveTo(e.cx + e.rx * 0.45, ty, e.cx + e.rx, ty + (e.cy - ty) * 0.25, e.cx + e.rx, e.cy);
  pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createRadialGradient(e.cx - e.rx * 0.35, ty + (e.cy - ty) * 0.35, 0, e.cx, e.cy, e.rx * 1.25);
  g.addColorStop(0, shade(base, 0.35));
  g.addColorStop(0.5, shade(base, 0.08));
  g.addColorStop(1, shade(base, -0.25));
  k.paint(g, k.lw);
}

// ── web: the green-screen terminal ──────────────────────────────────────────
// A steel desk with a chunky ivory terminal (a deep tube behind its glass),
// a keyboard, a squat printer feeding striped paper and a mug; a swivel
// chair. Browsing scrolls glyph-like marks (bars of varying length, never
// letters) up the green screen.

const SCREEN = { u0: 2.85, u1: 6.15, n: 4.02, z0: 7.55, z1: 10.55 };

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 12,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'web', 12, (k) => {
      k.shadow(4.5, 4.6, 4.4, 4.4, 0.3);
      const desk = '#8d9a86';
      for (const [u, w] of [[0.8, 0.8], [7.8, 0.8], [0.8, 5.5], [7.8, 5.5]] as const) k.box(u, w, 0, 0.45, 0.45, 6.0, shade(desk, -0.15), { line: k.thin });
      k.box(1.0, 0.9, 4.6, 7.0, 4.8, 1.4, shade(desk, -0.05), { stripe: false });
      k.box(3.2, 5.68, 4.95, 2.6, 0.08, 0.7, shade(desk, 0.1), { line: k.thin, stripe: false });
      k.box(4.15, 5.74, 5.15, 0.7, 0.2, 0.25, C.chrome, { line: k.thin * 0.7, stripe: false });
      k.box(0.6, 0.6, 6.0, 7.8, 5.4, 0.45, desk);
      // the chair, pulled up
      chair(k, 4.5, 7.6, -Math.PI / 2 + 0.2, C.tealDark);
      // the terminal: the deep tube housing behind, the cabinet, the glass
      const ivory = '#d8cca4';
      k.box(3.1, 0.8, 6.95, 2.8, 1.0, 3.2, shade(ivory, -0.12), { round: 0.3 });
      k.box(3.4, 1.8, 6.45, 2.2, 1.8, 0.5, shade(ivory, -0.2), { line: k.thin });
      k.box(2.4, 1.6, 6.95, 4.2, 2.4, 4.1, ivory, { round: 0.3 });
      k.rect(SCREEN.u0 - 0.2, SCREEN.z0 - 0.2, SCREEN.u1 + 0.2, SCREEN.z1 + 0.2, 4.01, '#4a4a40', k.thin);
      k.poly([[SCREEN.u0, SCREEN.n, SCREEN.z0], [SCREEN.u1, SCREEN.n, SCREEN.z0], [SCREEN.u1, SCREEN.n, SCREEN.z1], [SCREEN.u0, SCREEN.n, SCREEN.z1]], C.crtDark, 0, 0.5);
      // a power lamp and two knobs under the glass
      dot(k, 5.9, 4.02, 7.2, 0.12, C.radar, 0);
      for (const u of [3.1, 3.6]) dot(k, u, 4.02, 7.2, 0.14, '#4a4a40', 0);
      // the keyboard on the desk
      k.box(2.5, 4.3, 6.45, 4.0, 1.4, 0.35, shade(ivory, -0.05), { round: 0.1 });
      const rows: Array<[P3, P3]> = [];
      for (let r = 0; r < 3; r++) rows.push([[2.75, 4.55 + r * 0.38, 6.81], [6.25, 4.55 + r * 0.38, 6.81]]);
      k.segs(rows, '#4a4a40', Math.max(0.8, 0.2 * k.s));
      // the printer at the end, its striped paper fanned over the desk edge
      k.box(6.8, 1.0, 6.45, 1.5, 2.6, 1.2, '#a9b3a6', { round: 0.15 });
      k.poly([[6.95, 1.2, 7.66], [8.15, 1.2, 7.66], [8.15, 3.4, 7.66], [6.95, 3.4, 7.66]], '#3d463b', k.thin);
      const sheet: P3[] = [[7.0, 3.6, 7.0], [8.1, 3.6, 7.0], [8.1, 5.9, 6.47], [7.0, 5.9, 6.47]];
      k.poly(sheet, '#f4f6ec', k.thin);
      const bars: Array<[P3, P3]> = [];
      for (let i = 0; i < 4; i++) {
        const f = 0.12 + i * 0.24;
        bars.push([[7.05, 3.6 + f * 2.3, 7.0 - f * 0.53], [8.05, 3.6 + f * 2.3, 7.0 - f * 0.53]]);
      }
      k.segs(bars, withAlpha('#7fbf4a', 0.6), Math.max(0.8, 0.22 * k.s));
      k.poly([[7.0, 5.9, 6.47], [8.1, 5.9, 6.47], [8.1, 6.0, 4.6], [7.0, 6.0, 4.4]], k.side('#f4f6ec', 0, 1, 0.1), k.thin);
      // a mug
      k.cyl(1.6, 4.6, 6.45, 0.42, 0.8, C.orange);
      k.rod([[1.15, 4.6, 7.0], [0.95, 4.6, 6.8], [1.15, 4.6, 6.6]], C.orange, 0.1);
    });
    const pen = k.pen;
    const line = (fz: number, f0: number, f1: number): P3[] => {
      const z = SCREEN.z0 + 0.3 + fz * (SCREEN.z1 - SCREEN.z0 - 0.6);
      const u0 = SCREEN.u0 + 0.3 + f0 * (SCREEN.u1 - SCREEN.u0 - 0.6);
      const u1 = SCREEN.u0 + 0.3 + f1 * (SCREEN.u1 - SCREEN.u0 - 0.6);
      return [[u0, SCREEN.n + 0.02, z], [u1, SCREEN.n + 0.02, z], [u1, SCREEN.n + 0.02, z + 0.2], [u0, SCREEN.n + 0.02, z + 0.2]];
    };
    // glyph marks: rows of short bars, scrolling up while browsing
    const roll = v.active ? v.t * 2.2 : 0.4;
    const base = Math.floor(roll);
    pen.beginPath();
    for (let i = 0; i < 7; i++) {
      const row = base - i;
      const fz = 1 - (i + (roll - base)) / 7.2;
      if (fz < 0.04 || fz > 0.97) continue;
      let f = Math.floor(hash(row, 2) * 3) * 0.08;
      const words = 2 + Math.floor(hash(row, 3) * 3);
      for (let w = 0; w < words && f < 0.95; w++) {
        const len = 0.06 + hash(row, w, 4) * 0.2;
        k.trace(line(fz, f, Math.min(0.97, f + len)));
        f += len + 0.06;
      }
    }
    pen.fillStyle = v.active ? C.crt : withAlpha(C.crt, 0.45);
    pen.fill();
    // the cursor
    if (!v.active || Math.floor(v.t * 3) % 2 === 0) k.poly(line(0.02, 0, 0.05), v.active ? C.crt : withAlpha(C.crt, 0.6), 0);
    k.halo((SCREEN.u0 + SCREEN.u1) / 2, SCREEN.n + 0.8, (SCREEN.z0 + SCREEN.z1) / 2, 2.6, C.crt, v.active ? 0.3 : 0.12);
  },
};

// ── think: the armchair and the valve radio ─────────────────────────────────
// A worn mustard club armchair, patched and taped, on a round rug; beside
// it a wooden cabinet radio with an arched grille and a dial glowing warm;
// magazines on the floor and a mug on the radio.

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 11,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(6, 3.6, 6.2, 3.4, 0.28);
    // the rug: rings of faded colour
    const rings: Color[] = ['#7a4a3a', '#c9a96a', '#8a5a44', '#d9c08a', '#6f7d4f'];
    rings.forEach((c, i) => {
      const f = 1 - i / rings.length;
      k.poly(ovalPts(4.0, 3.9, 3.6 * f, 2.85 * f, 0.03), c, i === 0 ? k.thin : 0);
    });
    // the armchair
    const cover = '#c9a03a';
    const u0 = 1.0;
    const u1 = 6.2;
    for (const [u, w] of [[u0 + 0.4, 1.1], [u1 - 0.8, 1.1], [u0 + 0.4, 5.2], [u1 - 0.8, 5.2]] as const) k.box(u, w, 0, 0.4, 0.4, 0.7, C.woodDark, { line: k.thin });
    k.box(u0, 0.8, 0.6, u1 - u0, 5.0, 2.2, cover, { round: 0.4 });
    k.box(u0 + 0.1, 0.6, 2.7, u1 - u0 - 0.2, 1.6, 4.6, cover, { round: 0.8 });
    k.box(u0 + 1.0, 2.1, 2.8, u1 - u0 - 2.0, 3.6, 0.8, shade(cover, 0.06), { round: 0.4 });
    k.box(u0, 1.7, 2.8, 1.2, 4.1, 2.0, cover, { round: 0.55 });
    k.box(u1 - 1.2, 1.7, 2.8, 1.2, 4.1, 2.0, cover, { round: 0.55 });
    // patches sewn on, and a strip of tape over a split
    k.poly([[u0 + 1.4, 2.25, 4.6], [u0 + 2.7, 2.25, 4.6], [u0 + 2.75, 2.3, 6.0], [u0 + 1.45, 2.3, 6.0]], '#6f8a5a', k.thin, 0.15);
    k.poly([[u1 - 1.25, 4.2, 4.85], [u1 - 0.05, 4.2, 4.85], [u1 - 0.05, 5.4, 4.85], [u1 - 1.25, 5.4, 4.85]], '#8a5aa8', k.thin, 0.1);
    k.poly([[u1 + 0.01, 2.4, 3.2], [u1 + 0.01, 3.4, 3.2], [u1 + 0.01, 3.4, 4.6], [u1 + 0.01, 2.4, 4.6]], k.side('#a85a3a', 1, 0, 0.14), k.thin, 0.1);
    k.line([[u0 + 2.2, 4.2, 3.62], [u0 + 3.6, 3.4, 3.62]], '#c8ccc6', Math.max(1, 0.36 * k.s));
    if (k.fine) {
      const st: Array<[P3, P3]> = [];
      for (let z = 4.7; z < 6; z += 0.3) st.push([[u0 + 1.35, 2.31, z], [u0 + 1.55, 2.31, z + 0.1]]);
      k.segs(st, '#2a2a26', 0.05 * k.s, 'round');
    }
    // magazines on the floor by the chair
    for (let i = 0; i < 3; i++) k.box(0.6 + i * 0.1, 5.4 - i * 0.12, 0.05 + i * 0.12, 1.4, 1.1, 0.12, [C.red, C.cream, C.teal][i], { line: k.thin * 0.7, stripe: false });
    // the radio cabinet: wooden sides, an arched front, grille and dial
    const r0 = 7.0;
    const r1 = 11.3;
    const F = 4.2;
    const top = 7.0;
    const rad = (r1 - r0) / 2;
    const archPts = (n: number): P3[] => {
      const pts: P3[] = [[r0, n, 0], [r1, n, 0], [r1, n, top]];
      for (let i = 1; i < 14; i++) {
        const th = (i / 14) * Math.PI;
        pts.push([(r0 + r1) / 2 + Math.cos(th) * rad, n, top + Math.sin(th) * rad * 0.7]);
      }
      pts.push([r0, n, top]);
      return pts;
    };
    k.shadow((r0 + r1) / 2, 2.6, 2.6, 2.0, 0.3);
    const back = archPts(1.0);
    const front = archPts(F);
    fillPts(k, hull([...back, ...front].map(([a, n, z]) => k.p(a, n, z))), shade(C.wood, -0.2), k.lw);
    k.poly(front, C.wood, k.lw);
    // the grille: cloth behind wooden fretwork in an arch
    const g = (n: number, w: number, z0: number, z1: number): P3[] => {
      const pts: P3[] = [[(r0 + r1) / 2 - w, n, z0], [(r0 + r1) / 2 + w, n, z0], [(r0 + r1) / 2 + w, n, z1]];
      for (let i = 1; i < 10; i++) {
        const th = (i / 10) * Math.PI;
        pts.push([(r0 + r1) / 2 + Math.cos(th) * w, n, z1 + Math.sin(th) * w * 0.8]);
      }
      pts.push([(r0 + r1) / 2 - w, n, z1]);
      return pts;
    };
    k.poly(g(F + 0.01, 1.5, 3.4, 6.9), '#c9b48a', k.thin);
    const fret: Array<[P3, P3]> = [];
    for (const du of [-0.75, 0, 0.75]) fret.push([[(r0 + r1) / 2 + du, F + 0.02, 3.4], [(r0 + r1) / 2 + du, F + 0.02, 6.9 + (du ? 1.0 : 1.2)]]);
    k.segs(fret, C.woodDark, Math.max(0.9, 0.2 * k.s));
    // the dial: a warm glowing window with ticks and a pointer (no digits)
    k.rect(r0 + 0.6, 1.9, r1 - 0.6, 2.9, F + 0.02, '#5a3a22', k.thin);
    k.rect(r0 + 0.8, 2.05, r1 - 0.8, 2.75, F + 0.03, '#ffcf7a', 0);
    const ticks: Array<[P3, P3]> = [];
    for (let u = r0 + 1.0; u < r1 - 0.8; u += 0.3) ticks.push([[u, F + 0.04, 2.5], [u, F + 0.04, 2.7]]);
    k.segs(ticks, withAlpha('#5a3a22', 0.7), Math.max(0.5, 0.05 * k.s));
    k.line([[r0 + 2.6, F + 0.05, 2.1], [r0 + 2.6, F + 0.05, 2.75]], C.red, Math.max(0.8, 0.1 * k.s));
    k.halo((r0 + r1) / 2, F + 0.4, 2.4, 2.3, C.valve, 0.45);
    // knobs
    for (const u of [r0 + 0.95, (r0 + r1) / 2, r1 - 0.95]) k.face(u, F + 0.05, 1.1, 0.38, '#3a2a1e', k.thin, 14);
    // a mug on top, steam long gone
    k.cyl(r1 - 1.1, 2.0, top + 0.95, 0.4, 0.8, C.cream);
  },
};

// Points round a level oval (a rug), ru along u, rv along v.
function ovalPts(cu: number, cv: number, ru: number, rv: number, z: number): P3[] {
  const pts: P3[] = [];
  for (let i = 0; i < 28; i++) {
    const th = (i / 28) * Math.PI * 2;
    pts.push([cu + Math.cos(th) * ru, cv + Math.sin(th) * rv, z]);
  }
  return pts;
}

// ── idle: the jukebox and the diner booth ──────────────────────────────────
// A booth and a jukebox on a patch of red and cream checker: red vinyl
// benches facing across a pale table with milkshakes, a napkin box and
// squeeze bottles; beside it a jukebox with a rounded top, a chrome grille
// and bands of coloured light round its face (no name, no badge). While
// someone lounges here the light bands cycle.

const JUKE = { u0: 10.6, u1: 14.4, v0: 1.4, v1: 4.6, top: 8.6 };
const BANDS: readonly Color[] = ['#ff5a4a', '#ffb347', '#ffe066', '#7fe07a', '#5ac8ff', '#c87aff'];

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 13,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'idle', 13, (k) => {
      k.shadow(7.5, 5.5, 7.2, 5.2, 0.28);
      // the diner's red and cream checker under the booth and the jukebox
      checker(k, 0.4, 0.6, 14.6, 10.4, 12, 8);
      // the far bench: a high back at -u, its seat toward the table
      bench(k, 0.8, -1);
      // the table: a chrome pedestal, a pale top with a chrome band
      k.shadow(5.0, 5.5, 1.6, 2.6, 0.25);
      k.cyl(5.0, 5.5, 0, 1.0, 0.25, C.chrome);
      k.cyl(5.0, 5.5, 0.25, 0.25, 4.0, C.chrome);
      k.box(3.5, 2.6, 4.25, 3.0, 5.8, 0.45, '#9fd6c8', { top: '#b8e6da' });
      k.line([[3.5, 8.4, 4.4], [6.5, 8.4, 4.4], [6.5, 2.6, 4.4]], C.chrome, Math.max(0.8, 0.18 * k.s));
      // on it: milkshakes, a napkin box, the bottles
      const zt = 4.7;
      shake(k, 4.3, 4.0, zt, '#f2a7b8');
      shake(k, 5.7, 6.9, zt, '#f6ecd8');
      k.box(4.6, 5.0, zt, 0.8, 1.0, 0.9, C.chrome, { line: k.thin });
      k.cyl(5.6, 4.3, zt, 0.24, 1.0, C.red, { line: k.thin });
      k.cyl(5.65, 4.85, zt, 0.24, 1.0, C.mustard, { line: k.thin });
      k.cyl(4.2, 7.6, zt, 0.6, 0.12, '#f4f6ec', { line: k.thin });
      // the near bench, its back toward the viewer's right
      bench(k, 7.1, 1);
      // the jukebox: an arched cabinet seen from the front and its +u end
      const { u0, u1, v0, v1, top } = JUKE;
      k.shadow((u0 + u1) / 2, (v0 + v1) / 2 + 0.4, 2.4, 2.2, 0.3);
      k.box(u0 - 0.15, v0 - 0.1, 0, u1 - u0 + 0.3, v1 - v0 + 0.25, 0.5, '#5a2a22', { line: k.thin, stripe: false });
      const back = jukeFace(u0, u1, v0, top);
      const front = jukeFace(u0, u1, v1, top);
      fillPts(k, hull([...back, ...front].map(([a, n, z]) => k.p(a, n, z))), shade('#8a3a2e', -0.15), k.lw);
      k.poly(front, '#8a3a2e', k.lw);
      // the face: a chrome surround, a dark window with records, the grille
      const cu = (u0 + u1) / 2;
      const inner = jukeFace(u0 + 0.45, u1 - 0.45, v1 + 0.01, top, 0.45);
      k.poly(inner, '#e8e4d4', k.thin);
      k.rect(u0 + 0.8, 5.6, u1 - 0.8, top + 0.6, v1 + 0.02, '#2a2230', k.thin);
      for (let i = 0; i < 4; i++) {
        const z = 6.2 + i * 0.55;
        k.line([[cu - 0.9, v1 + 0.03, z], [cu + 0.9, v1 + 0.03, z]], i === 1 ? '#e8b04a' : '#1a1a1e', Math.max(0.8, 0.22 * k.s));
      }
      k.rect(u0 + 0.8, 1.0, u1 - 0.8, 4.6, v1 + 0.02, C.chrome, k.thin);
      const grille: Array<[P3, P3]> = [];
      for (let z = 1.4; z < 4.4; z += 0.45) grille.push([[u0 + 1.0, v1 + 0.03, z], [u1 - 1.0, v1 + 0.03, z]]);
      k.segs(grille, '#6a6e70', Math.max(0.7, 0.12 * k.s));
      // the buttons under the window
      for (let i = 0; i < 6; i++) dot(k, u0 + 1.05 + i * 0.34, v1 + 0.03, 5.05, 0.1, '#f4f6ec', 0);
    });
    // the light bands round its face: still while nobody is here, cycling while they are
    const { u0, u1, v1, top } = JUKE;
    const shift = v.active ? Math.floor(v.t * 6) : 0;
    const arc: P3[] = [[u1 - 0.22, v1 + 0.04, 0.9], ...jukeFace(u0 + 0.22, u1 - 0.22, v1 + 0.04, top, 0.22, 22).slice(2), [u0 + 0.22, v1 + 0.04, 0.9]];
    const seg: Array<[P3, P3, Color]> = [];
    for (let i = 0; i + 1 < arc.length; i++) seg.push([arc[i], arc[i + 1], BANDS[(i + shift) % BANDS.length]]);
    const w = Math.max(1, 0.32 * k.s);
    k.segs(seg.map(([a, b]) => [a, b] as [P3, P3]), INK, w + k.thin * 1.2, 'round');
    for (const c of BANDS) {
      const mine = seg.filter((q) => q[2] === c).map(([a, b]) => [a, b] as [P3, P3]);
      k.segs(mine, c, w, 'round');
    }
    const glow = BANDS[shift % BANDS.length];
    k.halo((u0 + u1) / 2, v1 + 0.6, top + 0.4, 3.0, v.active ? glow : '#ffc8e8', v.active ? 0.32 : 0.18);
  },
};

// The jukebox's face on the plane v = n: a body up to `top` and a round
// arch over it, inset by `inset` (the outline from its lower right).
function jukeFace(u0: number, u1: number, n: number, top: number, inset = 0, steps = 16): P3[] {
  const r = (u1 - u0) / 2;
  const cu = (u0 + u1) / 2;
  const pts: P3[] = [[u0, n, 0.5 + inset], [u1, n, 0.5 + inset]];
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI;
    pts.push([cu + Math.cos(th) * r, n, top + Math.sin(th) * r * 1.15]);
  }
  return pts;
}

// A booth bench: a padded seat and a high padded back at u0 (dir -1: the
// back on the -u side; +1: on the +u side, the seat on its -u side).
function bench(k: Kit, u0: number, dir: -1 | 1): void {
  const vinyl = C.vinyl;
  const [seat0, back0] = dir < 0 ? [u0 + 0.9, u0] : [u0, u0 + 1.9];
  k.box(seat0, 1.6, 0, 2.0, 7.8, 1.6, shade(vinyl, -0.25), { line: k.lw, stripe: false });
  k.box(seat0, 1.6, 1.6, 2.0, 7.8, 0.9, vinyl, { round: 0.35 });
  const bh = dir < 0 ? 6.2 : 5.4;
  k.box(back0, 1.4, 0, 1.0, 8.2, bh, shade(vinyl, -0.1), { round: 0.45 });
  // the chrome edge along the top of the back, tuck lines down it
  k.line([[back0 + 0.5, 1.5, bh - 0.05], [back0 + 0.5, 9.5, bh - 0.05]], C.chrome, Math.max(0.8, 0.2 * k.s));
  if (k.fine) {
    const n = dir < 0 ? back0 + 1.01 : back0 + 1.01;
    const tucks: Array<[P3, P3]> = [];
    for (let w = 2.6; w < 9.4; w += 1.3) tucks.push([[n, w, 2.8], [n, w, bh - 0.5]]);
    k.segs(tucks, withAlpha(INK, 0.35), 0.08 * k.s);
  }
}

// A milkshake: a fluted glass, the shake, a cherry and a straw.
function shake(k: Kit, cu: number, cv: number, z: number, color: Color): void {
  frustum(k, cu, cv, z + 0.3, 0.22, z + 1.5, 0.42, '#dfe8ec', color);
  k.disc(cu, cv, z + 0.15, 0.3, '#dfe8ec', k.thin);
  k.rod([[cu, cv, z + 0.3], [cu, cv, z + 0.15]], '#dfe8ec', 0.1);
  k.disc(cu, cv, z + 1.62, 0.34, '#fff6f0', 0);
  dot(k, cu + 0.05, cv, z + 1.9, 0.13, '#d8303a', k.thin * 0.6);
  k.rod([[cu - 0.12, cv, z + 1.4], [cu - 0.32, cv, z + 2.5]], '#f4f6ec', 0.08);
}

// ── entrance: the blast door ────────────────────────────────────────────────
// A heavy rectangular steel door in a thick frame striped amber and black,
// a big spoked hand-wheel in its middle, two great hinges and locking
// bolts; a dark tunnel and a caged lamp beyond; a beacon over it, an
// extinguisher on the left, a control box with a mushroom button on the
// right. While someone passes the door stands ajar, its wheel spins and
// the beacon turns. The frame and the leaf (shut, or ajar) are one cached
// sprite each; a frame draws only the wheel, the beacon and the lamps.

const DOOR = { u0: 3.5, u1: 9.5, h: 16, hv: 1.1, thick: 0.9, ajar: 0.4 };
const HUB = { z: 8, r: 2.0 };
const FRAME = { u0: 1.8, u1: 11.2, top: 18.4, out: 1.3 };

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 22,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, h } = DOOR;
    const open = v.active;
    const th = open ? DOOR.ajar : 0;
    const k = still(v, open ? 'entrance-ajar' : 'entrance-shut', 22, (k) => {
      // the tunnel beyond: concrete going back into the dark, a caged lamp
      const out = -0.6;
      k.poly([[u0, out, 0], [u1, out, 0], [u1, out, h], [u0, out, h]], k.vgrad(u0, out, 0, h, [[0, '#3a3f38'], [0.5, '#262a25'], [1, '#141713']]), 0);
      k.poly([[u0, out, 0], [u1, out, 0], [u1 - 1.6, out, 3.0], [u0 + 1.6, out, 3.0]], '#4a4e46', 0);
      k.poly([[u0 + 1.6, out, 3.0], [u1 - 1.6, out, 3.0], [u1 - 1.6, out, 11.5], [u0 + 1.6, out, 11.5]], '#1c1f1b', 0);
      cageLamp(k, (u0 + u1) / 2, out, 12.8, 0.35, true, 0.35);
      // the reveal and the soffit
      k.poly([[u0, out, 0], [u0, 0, 0], [u0, 0, h], [u0, out, h]], k.side('#4a4e46', 1, 0), 0);
      k.poly([[u0, out, h], [u1, out, h], [u1, 0, h], [u0, 0, h]], '#2a2d28', 0);
      // the frame: two posts and a lintel standing out of the wall, striped
      const { u0: f0, u1: f1, top, out: fo } = FRAME;
      k.box(f0, 0, 0, u0 - f0, fo, top, C.steel, { stripe: false });
      k.box(u1, 0, 0, f1 - u1, fo, top, C.steel, { stripe: false });
      k.box(f0, 0, h, f1 - f0, fo, top - h, C.steel);
      const lit = k.lit(0, 1);
      hazard(k, f0 + 0.25, 0.4, u0 - 0.25, h - 0.3, fo + 0.01, k.thin, lit, 0.7);
      hazard(k, u1 + 0.25, 0.4, f1 - 0.25, h - 0.3, fo + 0.01, k.thin, lit, 0.7);
      hazard(k, f0 + 0.25, h + 0.35, f1 - 0.25, top - 0.35, fo + 0.01, k.thin, lit, 0.7);
      rivets(k, [0.6, 4, 8, 12, 15.4].flatMap((z) => [[f0 + 0.12, fo + 0.02, z], [f1 - 0.12, fo + 0.02, z]] as P3[]), C.rivet, 0.11);
      // the threshold plate and a grating before it
      hazard(k, u0, 0.03, u1, 0.05, 0, 0, lit, 0.5);
      k.poly([[u0, 0, 0.04], [u1, 0, 0.04], [u1, fo + 0.2, 0.04], [u0, fo + 0.2, 0.04]], '#3a3f38', k.thin);
      k.shadow((u0 + u1) / 2, 2.8, 3.2, 1.2, 0.12);
      k.poly([[u0 + 0.2, fo + 0.4, 0.05], [u1 - 0.2, fo + 0.4, 0.05], [u1 - 0.2, 3.8, 0.05], [u0 + 0.2, 3.8, 0.05]], '#4a5048', k.thin);
      const grate: Array<[P3, P3]> = [];
      for (let u = u0 + 0.6; u < u1 - 0.3; u += 0.5) grate.push([[u, fo + 0.5, 0.06], [u, 3.7, 0.06]]);
      k.segs(grate, '#2a2d28', Math.max(0.7, 0.12 * k.s));
      // the beacon's base on the lintel
      k.box(6.0, 0.3, top, 1.0, 0.8, 0.4, C.steelDark, { line: k.thin, stripe: false });
      // left: an extinguisher on its bracket (plain red, no label)
      k.box(0.5, 0, 4.2, 0.9, 0.3, 0.4, C.steelDark, { line: k.thin, stripe: false });
      k.shadow(0.95, 0.6, 0.6, 0.5, 0.2, 3.6);
      k.cyl(0.95, 0.75, 3.7, 0.45, 2.7, C.red);
      k.cyl(0.95, 0.75, 6.4, 0.22, 0.4, '#2a2a26');
      k.rod([[0.95, 0.75, 6.8], [1.35, 0.95, 6.8], [1.4, 1.1, 5.4]], '#2a2a26', 0.1);
      // right: the control box with its mushroom button and lamps
      k.shadow(13.3, 0.4, 1.4, 0.6, 0.2, 7.4);
      k.rod([[13.3, 0.4, 10.9], [13.3, 0.4, 18.0]], C.steelDark, 0.18);
      k.box(12.2, 0, 7.6, 2.2, 0.9, 3.3, '#c9b48a', { round: 0.15 });
      k.rect(12.4, 7.8, 14.2, 10.7, 0.91, k.side('#c9b48a', 0, 1, 0.1), k.thin);
      k.cyl(13.3, 1.0, 8.6, 0.32, 0.25, '#2a2a26');
      k.disc(13.3, 1.0, 8.9, 0.42, C.red, k.thin);
      k.rod([[14.0, 0.95, 9.6], [14.4, 1.4, 10.4]], C.chrome, 0.1);
      k.disc(14.4, 1.4, 10.45, 0.18, '#2a2a26', 0);
      // the hinges' plates on the post
      for (const z of [2.6, 12.4]) k.box(u0 - 1.0, fo, z - 0.4, 0.9, 0.2, 2.4, C.steelDark, { line: k.thin, stripe: false });
      // the leaf, shut (its wheel at rest) or ajar (its wheel drawn live)
      if (open) k.pool((u0 + u1) / 2, 2.0, 3.0, 1.8, '#d8e0c8', 0.18);
      blastDoor(turned(k, u0, DOOR.hv, th), th, open ? null : 0.35);
      // the hinge barrels over the leaf's edge
      for (const z of [2.6, 12.4]) {
        k.cyl(u0 - 0.15, DOOR.hv + 0.45, z - 0.3, 0.38, 2.2, C.steelDark, { line: k.lw });
        k.cyl(u0 - 0.15, DOOR.hv + 0.45, z + 1.9, 0.22, 0.25, C.chrome, { line: k.thin });
      }
      // the beacon over the door, dark at rest
      if (!open) k.cyl(6.5, 0.7, FRAME.top + 0.4, 0.42, 0.9, '#b8702a', { line: k.lw, top: '#c8803a' });
    });
    // the control box's lamps: red at rest, green while the door works
    dot(k, 12.75, 0.92, 10.1, 0.17, v.active ? '#5a2a22' : '#ff4a3a', k.thin * 0.6);
    dot(k, 13.85, 0.92, 10.1, 0.17, v.active ? C.radar : '#1f4a2a', k.thin * 0.6);
    if (!open) return;
    // the wheel spinning on the door standing ajar
    const leaf = turned(k, u0, DOOR.hv, th);
    wheel(leaf, (u1 - u0 - 0.05) / 2, 0.65, HUB.z, HUB.r, v.t * 2.4, C.orange, 6);
    // the beacon over the door, lit and turning
    const bz = FRAME.top + 0.4;
    k.cyl(6.5, 0.7, bz, 0.42, 0.9, '#ffb347', { line: k.lw, top: '#ffe2a0' });
    const a = v.t * 6;
    const [x, y] = k.p(6.5 + Math.cos(a) * 0.3, 0.7 + Math.sin(a) * 0.3, bz + 0.5);
    k.pen.beginPath();
    k.pen.arc(x, y, Math.max(0.8, 0.2 * k.s), 0, Math.PI * 2);
    k.pen.fillStyle = '#fff6d8';
    k.pen.fill();
    k.halo(6.5, 0.9, bz + 0.5, 1.6 + 0.6 * Math.max(0, Math.cos(a)), '#ffb347', 0.5);
  },
};

// The blast door's leaf in its own (turned) frame: hinge at u = 0, the
// face at v = 0 toward the room, back to v = -thick; its hand-wheel turned
// to `turn` (null: left to be drawn live).
function blastDoor(k: Kit, th: number, turn: number | null): void {
  const { h, thick } = DOOR;
  const w = DOOR.u1 - DOOR.u0 - 0.05;
  const steel = '#73806e';
  // the free edge (seen once it swings) and the face
  if (th > 0.05) {
    k.poly([[w, 0, 0], [w, -thick, 0], [w, -thick, h], [w, 0, h]], k.side(steel, 1, 0, 0.18), k.lw);
    // locking bolts out of the edge
    for (const z of [3.2, 8, 12.8]) k.box(w - 0.1, -0.7, z - 0.25, 0.6, 0.5, 0.5, C.chrome, { line: k.thin, stripe: false });
  }
  const face = k.side(steel, 0, 1, 0.16);
  k.poly([[0, 0, 0], [w, 0, 0], [w, 0, h], [0, 0, h]], face, k.lw);
  // a raised rim, three heavy ribs across, rivets along them
  const rim = shade(face, 0.12);
  k.line([[0.35, 0.02, 0.35], [w - 0.35, 0.02, 0.35], [w - 0.35, 0.02, h - 0.35], [0.35, 0.02, h - 0.35], [0.35, 0.02, 0.35]], rim, Math.max(0.9, 0.22 * k.s));
  for (const z of [2.6, 13.4]) {
    k.box(0.5, 0, z - 0.45, w - 1.0, 0.25, 0.9, steel, { line: k.thin, stripe: false });
    rivets(k, [1, 2, 3, 4, 5].map((i) => [0.5 + (i * (w - 1.0)) / 6, 0.27, z] as P3), shade(steel, 0.35), 0.1);
  }
  // a kick plate in hazard stripes
  hazard(k, 0.5, 0.45, w - 0.5, 1.35, 0.03, k.thin, k.lit(0, 1), 0.45);
  // the hub plate and the hand-wheel on it
  const cu = w / 2;
  const cz = HUB.z;
  k.face(cu, 0.04, cz, 1.0, shade(steel, -0.12), k.thin, 20);
  k.rod([[cu, 0.05, cz], [cu, 0.6, cz]], C.steelDark, 0.3);
  if (turn !== null) wheel(k, cu, 0.65, cz, HUB.r, turn, C.orange, 6);
  // the wired-glass port high in it
  k.rect(cu - 0.6, h - 4.0, cu + 0.6, h - 2.2, 0.03, '#2a3a40', k.thin);
  k.line([[cu - 0.5, 0.04, h - 3.0], [cu + 0.5, 0.04, h - 3.6]], withAlpha('#c8dce0', 0.4), Math.max(0.6, 0.08 * k.s));
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
