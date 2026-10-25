import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, CANS, INK, SPINES, hash, hullPts, on, withAlpha } from './kit.ts';

// Small things the den is full of, drawn in any frame: screens (flat
// panels and CRTs) and what plays on them (green rain, scrolling code),
// cans, mugs, pizza, books and binders, crates, cables, chairs, beanbags,
// plants, a rubber duck and stickers.

export type Quad = [P3, P3, P3, P3];

// ── screens ──────────────────────────────────────────────────────────────

// A flat monitor on a foot, its panel w wide and h tall, turned by ang in
// the u-v plane (0: facing +v). Returns the screen's quad (bottom left,
// bottom right, top right, top left).
export function flat(k: Kit, cu: number, cv: number, z0: number, w: number, h: number, ang: number, body: Color = C.graphite, lift = 1.3): Quad {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const c = (a: number, b: number, z: number): P3 => [cu + ca * a - sa * b, cv + sa * a + ca * b, z];
  k.shadow(cu, cv, w * 0.3, 0.8, 0.25, z0);
  k.obox(cu, cv, z0, w * 0.36, 1.1, 0.18, ang, body, { line: k.thin });
  const [nu, nv] = [c(0, -0.15, 0)[0], c(0, -0.15, 0)[1]];
  k.rod([[nu, nv, z0 + 0.15], [nu, nv, z0 + lift + 0.4]], shade(body, 0.1), 0.3);
  const zb = z0 + lift;
  k.obox(cu, cv, zb, w, 0.32, h, ang, body);
  const F = 0.17;
  const m = 0.2;
  return [c(-w / 2 + m, F, zb + m), c(w / 2 - m, F, zb + m), c(w / 2 - m, F, zb + h - m), c(-w / 2 + m, F, zb + h - m)];
}

// A CRT monitor or TV: a deep back tapering behind a front bezel; its
// screen on the +v face, round cornered. Returns the screen's quad.
export function crt(k: Kit, u0: number, v0: number, z0: number, w: number, d: number, h: number, body: Color = C.beige): Quad {
  k.box(u0 + w * 0.17, v0, z0 + h * 0.1, w * 0.66, d * 0.5, h * 0.72, shade(body, -0.06), { round: 0.3 });
  k.box(u0, v0 + d * 0.42, z0, w, d * 0.58, h, body, { round: 0.18 });
  const F = v0 + d + 0.02;
  const bx = Math.min(0.55, w * 0.11);
  const bz0 = Math.min(0.9, h * 0.17);
  const bz1 = Math.min(0.5, h * 0.1);
  // the bezel's recess, then the screen in it
  k.rect(u0 + bx - 0.12, z0 + bz0 - 0.12, u0 + w - bx + 0.12, z0 + h - bz1 + 0.12, F, k.side(shade(body, -0.22), 0, 1, 0.12), k.thin, 0.35);
  const q: Quad = [[u0 + bx, F, z0 + bz0], [u0 + w - bx, F, z0 + bz0], [u0 + w - bx, F, z0 + h - bz1], [u0 + bx, F, z0 + h - bz1]];
  // a power light and a couple of knobs under the screen
  if (bz0 > 0.5) {
    k.dot(u0 + w - bx - 0.3, F, z0 + bz0 * 0.45, 0.09, '#7aff9a');
    if (k.fine) for (const du of [0.4, 0.85]) k.dot(u0 + bx + du, F, z0 + bz0 * 0.45, 0.12, shade(body, -0.35));
  }
  return q;
}

// The glass of a screen: dark (or `fill`), round cornered, with a sheen.
export function glass(k: Kit, q: Quad, fill: Color = C.screenDark, round = 0.25, line = k.thin): void {
  k.poly(q, fill, line, round);
}

export function sheen(k: Kit, q: Quad, a = 0.1): void {
  k.poly([on(q, 0.55, 0.06), on(q, 0.7, 0.06), on(q, 0.4, 0.94), on(q, 0.25, 0.94)], withAlpha('#ffffff', a), 0);
}

// Green rain on a screen: columns of glyphs falling, a bright head and a
// fading tail, the glyphs changing as they fall. `t` the clock, `a` how
// bright (1: worked).
export function rain(k: Kit, q: Quad, t: number, seed: number, cols: number, rows: number, a = 1): void {
  const pen = k.pen;
  const tones: Color[] = a >= 1 ? ['#e2ffe8', '#86ffaa', '#38d872', '#1a8a45'] : ['#a8f5bc', '#5fd986', '#2aa456', '#16703a'];
  const lists: Array<Array<[number, number, number, number]>> = [[], [], [], []];
  for (let c = 0; c < cols; c++) {
    const sp = (2.2 + hash(seed, c, 1) * 4) * (a >= 1 ? 1.6 : 1);
    const len = 3 + Math.floor(hash(seed, c, 2) * rows * 0.7);
    const span = rows + len + 2;
    const head = (t * sp + hash(seed, c, 3) * span) % span;
    const hr = Math.floor(head);
    for (let r = hr - len; r <= hr; r++) {
      if (r < 0 || r >= rows) continue;
      const lv = hr - r;
      const tone = lv === 0 ? 0 : lv < len * 0.25 ? 1 : lv < len * 0.6 ? 2 : 3;
      const g = hash(seed + c * 131, r, Math.floor(t * 2.5 + hash(c, r, 7) * 4));
      const gw = 0.42 + g * 0.36;
      const f0 = (c + 0.5 - gw / 2) / cols;
      const f1 = (c + 0.5 + gw / 2) / cols;
      const z1 = 1 - (r + 0.12) / rows;
      const z0 = 1 - (r + 0.86) / rows;
      if (g < 0.28 && k.fine) {
        // two strokes with a gap
        const zm = (z0 + z1) / 2;
        lists[tone].push([f0, zm + 0.08 / rows, f1, z1], [f0, z0, f1, zm - 0.08 / rows]);
      } else lists[tone].push([f0, z0, f1, z1]);
    }
  }
  lists.forEach((list, i) => {
    if (!list.length) return;
    pen.beginPath();
    for (const [f0, z0, f1, z1] of list) k.trace([on(q, f0, z0), on(q, f1, z0), on(q, f1, z1), on(q, f0, z1)]);
    pen.fillStyle = tones[i];
    pen.fill();
  });
}

// Lines of code scrolling up a screen (an editor in a dark theme): the
// lines indented and coloured by token, `roll` lines a second.
export function code(k: Kit, q: Quad, t: number, seed: number, rows = 9, roll = 2.4): void {
  const pen = k.pen;
  const colors: Color[] = ['#5dff8f', '#5fe0ff', '#ffb347', '#ff6fb5', '#c8d6d0'];
  const at = t * roll;
  const base = Math.floor(at);
  const lists: Array<Array<[number, number, number, number]>> = colors.map(() => []);
  for (let i = 0; i < rows; i++) {
    const row = base - i;
    const fz = 0.9 - (i + 1 - (at - base)) / (rows + 1);
    if (fz < 0.06 || fz > 0.9) continue;
    const ind = Math.floor(hash(seed, row, 1) * 4) * 0.08;
    let f = 0.08 + ind;
    const parts = 1 + Math.floor(hash(seed, row, 2) * 3);
    for (let j = 0; j < parts && f < 0.9; j++) {
      const len = 0.08 + hash(seed, row * 7 + j, 3) * 0.3;
      const f1 = Math.min(0.92, f + len);
      lists[Math.floor(hash(seed, row * 7 + j, 4) * colors.length)].push([f, fz, f1, fz + 0.5 / (rows + 1)]);
      f = f1 + 0.04;
    }
  }
  lists.forEach((list, i) => {
    if (!list.length) return;
    pen.beginPath();
    for (const [f0, z0, f1, z1] of list) k.trace([on(q, f0, z0), on(q, f1, z0), on(q, f1, z1), on(q, f0, z1)]);
    pen.fillStyle = colors[i];
    pen.fill();
  });
}

// A terminal prompt: a line or two and a block cursor (shown when `on`).
export function prompt(k: Kit, q: Quad, lit: boolean, seed: number): void {
  const pen = k.pen;
  pen.beginPath();
  for (let i = 0; i < 3; i++) {
    const fz = 0.82 - i * 0.14;
    const l = 0.2 + hash(seed, i, 9) * 0.45;
    k.trace([on(q, 0.08, fz), on(q, 0.08 + l, fz), on(q, 0.08 + l, fz + 0.06), on(q, 0.08, fz + 0.06)]);
  }
  pen.fillStyle = '#2a8a4a';
  pen.fill();
  if (lit) k.poly([on(q, 0.08, 0.4), on(q, 0.16, 0.4), on(q, 0.16, 0.5), on(q, 0.08, 0.5)], C.glyph, 0);
}

// ── food and drink ───────────────────────────────────────────────────────

// An energy drink can standing at (u, v) on z.
export function can(k: Kit, u: number, v: number, z: number, color: Color = CANS[0], r = 0.32): void {
  k.cyl(u, v, z, r, r * 3, color, { line: k.thin, top: '#c9d0cf' });
  if (k.s * r >= 2) {
    // a dark band with a stripe of light down the lit side
    k.cyl(u, v, z + r * 1.1, r * 1.005, r * 0.7, color === '#f2f2f2' ? '#2a2f33' : shade(color, -0.45), { line: 0, top: color === '#f2f2f2' ? '#2a2f33' : shade(color, -0.45) });
    k.disc(u, v, z + r * 3, r * 0.85, '#dfe5e3', 0);
  }
}

// A can on its side, crushed a little, from (u0, v0) to (u1, v1).
export function lyingCan(k: Kit, u0: number, v0: number, u1: number, v1: number, z: number, color: Color): void {
  k.rod([[u0, v0, z + 0.3], [(u0 + u1) / 2, (v0 + v1) / 2, z + 0.24], [u1, v1, z + 0.3]], color, 0.55);
  const [x, y] = k.p(u1, v1, z + 0.3);
  k.pen.beginPath();
  k.pen.ellipse(x, y, 0.2 * k.s, 0.27 * k.s, 0.4, 0, Math.PI * 2);
  k.paint('#cfd6d4', k.thin * 0.7);
}

// A mug at (u, v) on z, coffee in it.
export function mug(k: Kit, u: number, v: number, z: number, color: Color = '#e9ecea', r = 0.45): void {
  k.rod([[u + r * 0.9, v, z + r * 1.5], [u + r * 1.55, v, z + r * 1.15], [u + r * 0.9, v, z + r * 0.55]], color, Math.max(0.08, r * 0.22));
  k.cyl(u, v, z, r, r * 1.9, color);
  k.disc(u, v, z + r * 1.9 - 0.05, r * 0.8, '#3a2216', 0);
}

// A pizza box w x d on z at (u0, v0). Open boxes show what is left of the
// pizza (`left` of 8 slices) under a lid standing up at the back.
export function pizzaBox(k: Kit, u0: number, v0: number, z: number, w: number, d: number, open: boolean, seed: number, left = 5): void {
  const h = 0.42;
  if (open) {
    // the lid, up at the back, leaning back a little
    const lean = 0.5;
    k.poly([[u0, v0, z + h], [u0 + w, v0, z + h], [u0 + w, v0 - lean, z + h + d * 0.95], [u0, v0 - lean, z + h + d * 0.95]], k.side(C.cardboard, 0, 1, 0.14), k.thin);
    if (k.fine) k.disc(u0 + w * 0.5, v0 - lean * 0.5, z + h + d * 0.5, 0.01, C.cardboard, 0);
    k.box(u0, v0, z, w, d, h, C.cardboard, { line: k.thin, stripe: false });
    k.poly([[u0 + 0.15, v0 + 0.15, z + h + 0.01], [u0 + w - 0.15, v0 + 0.15, z + h + 0.01], [u0 + w - 0.15, v0 + d - 0.15, z + h + 0.01], [u0 + 0.15, v0 + d - 0.15, z + h + 0.01]], '#b98f5e', 0);
    pizza(k, u0 + w / 2, v0 + d / 2, z + h + 0.02, Math.min(w, d) * 0.43, left, seed);
  } else {
    k.box(u0, v0, z, w, d, h, C.cardboard, { line: k.thin });
    // a grease spot and the tab on the lid's front
    const [x, y] = k.p(u0 + w * (0.3 + hash(seed, 1) * 0.4), v0 + d * (0.3 + hash(seed, 2) * 0.4), z + h);
    k.pen.beginPath();
    k.pen.ellipse(x, y, 0.45 * k.s, 0.22 * k.s, 0, 0, Math.PI * 2);
    k.pen.fillStyle = '#9a6a3a55';
    k.pen.fill();
  }
}

// A pizza: crust, cheese, pepperoni; `left` of its 8 slices still there.
export function pizza(k: Kit, cu: number, cv: number, z: number, r: number, left: number, seed: number): void {
  const n = Math.max(1, Math.min(8, left));
  const a0 = hash(seed, 3) * Math.PI * 2;
  const wedge = (rr: number): P3[] => {
    const pts: P3[] = n < 8 ? [[cu, cv, z]] : [];
    const steps = n * 4;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (n / 8) * Math.PI * 2;
      pts.push([cu + Math.cos(a) * rr, cv + Math.sin(a) * rr, z]);
    }
    return pts;
  };
  k.poly(wedge(r), C.crust, k.thin);
  k.poly(wedge(r * 0.82), C.pizza, 0);
  // pepperoni on the slices left
  for (let i = 0; i < n * 2; i++) {
    const a = a0 + ((i + 0.5) / (n * 2)) * (n / 8) * Math.PI * 2;
    const rr = r * (0.3 + hash(seed, i, 4) * 0.4);
    k.disc(cu + Math.cos(a) * rr, cv + Math.sin(a) * rr, z + 0.01, r * 0.12, C.pepperoni, 0);
  }
  if (k.fine && n < 8) {
    // the cuts
    const pen = k.pen;
    pen.beginPath();
    for (let i = 1; i < n; i++) {
      const a = a0 + (i / 8) * Math.PI * 2;
      const [x0, y0] = k.p(cu, cv, z + 0.02);
      const [x1, y1] = k.p(cu + Math.cos(a) * r * 0.85, cv + Math.sin(a) * r * 0.85, z + 0.02);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = '#b07a2a';
    pen.lineWidth = Math.max(0.6, 0.05 * k.s);
    pen.stroke();
  }
}

// ── books, binders, boxes ────────────────────────────────────────────────

// A row of books standing on a shelf at z, their spines on the plane v,
// from u0 to u1, no taller than hmax.
export function bookRow(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number, binders = false): void {
  const pen = k.pen;
  const byColor = new Map<Color, P3[][]>();
  const all: P3[][] = [];
  let u = u0;
  let i = 0;
  while (u < u1 - 0.3) {
    const w = binders ? 0.7 + hash(seed, i, 61) * 0.35 : 0.36 + hash(seed, i, 61) * 0.42;
    if (u + w > u1) break;
    if (!binders && hash(seed, i, 62) < 0.07 && u > u0 + 1) {
      u += 0.6;
      i++;
      continue;
    }
    const h = hmax * (binders ? 0.9 + hash(seed, i, 63) * 0.08 : 0.62 + hash(seed, i, 63) * 0.34);
    const c = binders ? ['#2a2f33', '#c0392f', '#34476b', '#3d5a40', '#e9ecea'][Math.floor(hash(seed, i, 64) * 5)] : SPINES[Math.floor(hash(seed, i, 64) * SPINES.length)];
    const lean = !binders && hash(seed, i, 65) < 0.08 && i > 0 ? 0.35 : 0;
    const q: P3[] = [[u, v, z], [u + w, v, z], [u + w + lean, v, z + h], [u + lean, v, z + h]];
    (byColor.get(c) ?? byColor.set(c, []).get(c)!).push(q);
    all.push(q);
    u += w + (lean ? 0.3 : 0.02);
    i++;
  }
  for (const [c, qs] of byColor) {
    pen.beginPath();
    for (const q of qs) k.trace(q);
    pen.fillStyle = k.side(c, 0, 1, 0.12);
    pen.fill();
  }
  if (k.fine || binders) {
    // binders: a label window and a finger hole; books: a band or two
    pen.beginPath();
    for (const q of all) {
      const w = q[1][0] - q[0][0];
      const hh = q[3][2] - q[0][2];
      if (binders) {
        k.trace([[q[0][0] + w * 0.22, v, q[0][2] + hh * 0.55], [q[0][0] + w * 0.78, v, q[0][2] + hh * 0.55], [q[0][0] + w * 0.78, v, q[0][2] + hh * 0.82], [q[0][0] + w * 0.22, v, q[0][2] + hh * 0.82]]);
      } else {
        const l = q[3][0] - q[0][0];
        for (const f of [0.16, 0.8]) k.trace([[q[0][0] + l * f, v, q[0][2] + hh * f], [q[1][0] + l * f, v, q[0][2] + hh * f], [q[1][0] + l * f, v, q[0][2] + hh * f + 0.12], [q[0][0] + l * f, v, q[0][2] + hh * f + 0.12]]);
      }
    }
    pen.fillStyle = binders ? '#ece8dccc' : '#f3e6b888';
    pen.fill();
  }
  pen.beginPath();
  for (const q of all) k.trace(q);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, k.thin * 0.7);
  pen.lineJoin = 'round';
  pen.stroke();
}

// A milk crate: a plastic box with slots in its sides.
export function crate(k: Kit, u0: number, v0: number, z0: number, w: number, d: number, h: number, color: Color = C.milk): void {
  k.box(u0, v0, z0, w, d, h, color, { line: k.lw, stripe: false });
  const pen = k.pen;
  // slots on the two faces the viewer sees
  const slots = (face: 'v' | 'u') => {
    pen.beginPath();
    const n = Math.max(2, Math.round((face === 'v' ? w : d) / 0.9));
    const span = face === 'v' ? w : d;
    for (let i = 0; i < n; i++) {
      const a0 = (span * (i + 0.22)) / n;
      const a1 = (span * (i + 0.78)) / n;
      for (const [zz0, zz1] of [[0.2, 0.45], [0.58, 0.82]]) {
        const za = z0 + h * zz0;
        const zb = z0 + h * zz1;
        if (face === 'v') k.trace([[u0 + a0, v0 + d + 0.01, za], [u0 + a1, v0 + d + 0.01, za], [u0 + a1, v0 + d + 0.01, zb], [u0 + a0, v0 + d + 0.01, zb]]);
        else k.trace([[u0 + w + 0.01, v0 + a0, za], [u0 + w + 0.01, v0 + a1, za], [u0 + w + 0.01, v0 + a1, zb], [u0 + w + 0.01, v0 + a0, zb]]);
      }
    }
    pen.fillStyle = shade(color, -0.5);
    pen.fill();
  };
  if (k.s * h > 6) {
    slots('v');
    slots('u');
  }
}

// ── cables ───────────────────────────────────────────────────────────────

// A cable through frame points, w units thick.
export function cable(k: Kit, pts: ReadonlyArray<P3>, color: Color = '#1c2226', w = 0.16): void {
  k.line(pts, INK, w * k.s + Math.max(1, k.thin));
  k.line(pts, color, w * k.s);
}

// A sagging cable from a to b, dropping `sag` units in the middle.
export function droop(a: P3, b: P3, sag: number, n = 8): P3[] {
  const out: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - sag * 4 * t * (1 - t)]);
  }
  return out;
}

// ── seats ────────────────────────────────────────────────────────────────

// A gaming chair at (cu, cv), its sitter facing `face` (radians in the u-v
// plane): five casters, a gas lift, a bucket seat and a tall back with
// wings, black with a coloured trim.
export function gamingChair(k: Kit, cu: number, cv: number, face: number, trim: Color = C.green, body: Color = '#2b3036'): void {
  const fu = Math.cos(face);
  const fv = Math.sin(face);
  const ang = face - Math.PI / 2;
  k.shadow(cu, cv, 1.9, 1.9, 0.3);
  for (let i = 0; i < 5; i++) {
    const a = face + (i / 5) * Math.PI * 2 + 0.3;
    const eu = cu + Math.cos(a) * 1.5;
    const ev = cv + Math.sin(a) * 1.5;
    k.rod([[cu, cv, 0.75], [eu, ev, 0.5]], '#3a4045', 0.24);
    k.dot(eu, ev, 0.22, 0.22, '#1b1f22');
  }
  k.cyl(cu, cv, 0.6, 0.32, 2.4, '#8f989c', { line: k.thin });
  const back = () => {
    const bu = cu - fu * 1.25;
    const bv = cv - fv * 1.25;
    const faces = k.obox(bu, bv, 3.6, 2.7, 0.7, 6.4, ang, body, { line: k.lw });
    // trim down the wings of each broad face shown
    for (const f of faces) {
      const [a, b, c, d] = f;
      const wide = Math.hypot(b[0] - a[0], b[1] - a[1]) > 1.5;
      if (!wide) continue;
      for (const t of [0.14, 0.86]) k.line([on([a, b, c, d], t, 0.1), on([a, b, c, d], t, 0.82)], trim, Math.max(1, 0.22 * k.s));
      k.poly([on([a, b, c, d], 0.3, 0.84), on([a, b, c, d], 0.7, 0.84), on([a, b, c, d], 0.7, 0.96), on([a, b, c, d], 0.3, 0.96)], shade(body, 0.15), k.thin * 0.7, 0.2);
    }
  };
  const towards = fu + fv > 0; // facing the viewer: the back is behind the seat
  if (towards) back();
  k.obox(cu, cv, 3.0, 2.9, 2.9, 0.8, ang, body, { line: k.lw, top: shade(body, 0.1) });
  // a coloured stripe down the seat's middle
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const sc = (a: number, b: number): P3 => [cu + ca * a - sa * b, cv + sa * a + ca * b, 3.82];
  k.poly([sc(-0.35, -1.3), sc(0.35, -1.3), sc(0.35, 1.3), sc(-0.35, 1.3)], trim, 0);
  // armrests
  for (const side of [-1, 1]) {
    const p0 = sc(side * 1.55, -0.6);
    const p1 = sc(side * 1.55, 0.7);
    k.rod([[p0[0], p0[1], 3.5], [p0[0], p0[1], 5.0]], '#3a4045', 0.2);
    k.rod([[p0[0], p0[1], 5.0], [p1[0], p1[1], 5.0]], '#2b3036', 0.3);
  }
  if (!towards) back();
}

// A squashy beanbag at (cu, cv), r across, h tall, a dent where one sits.
export function beanbag(k: Kit, cu: number, cv: number, r: number, h: number, color: Color): void {
  k.shadow(cu, cv, r * 1.15, r * 1.05, 0.32);
  const e0 = k.ell(cu, cv, 0.25, r);
  const e1 = k.ell(cu + 0.1, cv - 0.1, h * 0.72, r * 0.72);
  const [, ty] = k.p(cu, cv, h);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e0.cx - e0.rx, e0.cy);
  pen.bezierCurveTo(e0.cx - e0.rx * 1.08, e1.cy, e1.cx - e1.rx * 0.95, ty, e1.cx, ty);
  pen.bezierCurveTo(e1.cx + e1.rx * 0.95, ty, e0.cx + e0.rx * 1.08, e1.cy, e0.cx + e0.rx, e0.cy);
  pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createLinearGradient(e0.cx - e0.rx, ty, e0.cx + e0.rx, e0.cy);
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, -0.3));
  k.paint(g, k.lw);
  // the dent, and a seam
  pen.beginPath();
  pen.ellipse(e1.cx + e1.rx * 0.08, e1.cy + (ty - e1.cy) * 0.15, e1.rx * 0.62, e1.ry * 0.62 + 0.3 * k.s, e1.rot, 0, Math.PI * 2);
  pen.fillStyle = shade(color, -0.18);
  pen.fill();
  pen.beginPath();
  pen.moveTo(e0.cx - e0.rx * 0.35, e0.cy + e0.ry * 0.7);
  pen.quadraticCurveTo(e0.cx - e0.rx * 0.6, e1.cy, e1.cx - e1.rx * 0.5, ty + (e1.cy - ty) * 0.4);
  pen.strokeStyle = shade(color, -0.4);
  pen.lineWidth = Math.max(0.7, k.thin * 0.7);
  pen.stroke();
}

// ── plants, a duck, stickers ─────────────────────────────────────────────

// One pointed leaf from (x, y) toward angle a, length L px (screen space).
export function leaf(k: Kit, x: number, y: number, a: number, L: number, w: number, fill: Color): void {
  const pen = k.pen;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (s: number, t: number): Pt => [x + ca * s - sa * t, y + sa * s + ca * t];
  pen.beginPath();
  const [x0, y0] = P(0, 0);
  pen.moveTo(x0, y0);
  const [c1x, c1y] = P(L * 0.3, -w);
  const [c2x, c2y] = P(L * 0.8, -w * 0.8);
  const [tx, ty] = P(L, 0);
  pen.bezierCurveTo(c1x, c1y, c2x, c2y, tx, ty);
  const [d1x, d1y] = P(L * 0.8, w * 0.8);
  const [d2x, d2y] = P(L * 0.3, w);
  pen.bezierCurveTo(d1x, d1y, d2x, d2y, x0, y0);
  pen.closePath();
  k.paint(fill, k.thin);
}

export function pot(k: Kit, u: number, v: number, z: number, r: number, h: number, color: Color = '#c66a42'): void {
  k.cyl(u, v, z, r * 0.82, h * 0.8, color);
  k.cyl(u, v, z + h * 0.78, r, h * 0.22, shade(color, 0.08));
  k.disc(u, v, z + h - 0.02, r * 0.82, '#3a2a1e', 0);
}

// A snake plant: tall striped blades from a pot standing on z.
export function snakePlant(k: Kit, u: number, v: number, z: number, r: number, tall: number, seed: number, potC: Color = '#c66a42'): void {
  pot(k, u, v, z, r, r * 1.5, potC);
  const [bx, by] = k.p(u, v, z + r * 1.5 - 0.1);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.13 + (hash(seed, i, 17) - 0.5) * 0.1;
    leaf(k, bx + (i - (n - 1) / 2) * 0.2 * k.s, by, a, (tall * (0.6 + hash(seed, i, 18) * 0.4)) * k.s, 0.42 * k.s * r, i & 1 ? '#4f8a4a' : '#6fa35a');
  }
}

// A rubber duck at (u, v) on z, `r` its body's radius, facing +u.
export function duck(k: Kit, u: number, v: number, z: number, r = 0.55): void {
  const pen = k.pen;
  const [x, y] = k.p(u, v, z + r * 0.75);
  pen.beginPath();
  pen.ellipse(x, y, r * 1.25 * k.s, r * 0.78 * k.s, 0, 0, Math.PI * 2);
  k.paint(C.rubberDuck, k.thin);
  const [hx, hy] = k.p(u + r * 0.45, v, z + r * 1.75);
  pen.beginPath();
  pen.arc(hx, hy, r * 0.62 * k.s, 0, Math.PI * 2);
  k.paint(C.rubberDuck, k.thin);
  // the beak toward the lit side, an eye, a wing
  pen.beginPath();
  pen.ellipse(hx - r * 0.72 * k.s, hy + r * 0.12 * k.s, r * 0.36 * k.s, r * 0.18 * k.s, 0, 0, Math.PI * 2);
  k.paint('#ff8a2a', k.thin * 0.7);
  pen.beginPath();
  pen.arc(hx - r * 0.2 * k.s, hy - r * 0.12 * k.s, Math.max(0.7, r * 0.11 * k.s), 0, Math.PI * 2);
  pen.fillStyle = INK;
  pen.fill();
  pen.beginPath();
  pen.ellipse(x + r * 0.25 * k.s, y - r * 0.05 * k.s, r * 0.55 * k.s, r * 0.32 * k.s, -0.3, 0, Math.PI * 2);
  pen.fillStyle = shade(C.rubberDuck, -0.12);
  pen.fill();
}

export const STICKERS: readonly Color[] = ['#ff4fb0', '#39ff6e', '#ffb000', '#5fe0ff', '#e9ecea', '#9a5ad8', '#ff5a4a', '#ffd23e'];

// A sticker centred on c, on the upright plane along `ax` (a unit vector
// in the u-v plane): a dot, a star, a bolt, a heart, a cat's head or a
// little alien, by `kind`, r units across.
export function sticker(k: Kit, c: P3, ax: readonly [number, number], r: number, kind: number, color: Color): void {
  const pen = k.pen;
  const pts: P3[] = [];
  const P = (du: number, dz: number): P3 => [c[0] + ax[0] * du * r, c[1] + ax[1] * du * r, c[2] + dz * r];
  switch (kind % 6) {
    case 0:
      for (let i = 0; i < 12; i++) pts.push(P(Math.cos((i / 12) * Math.PI * 2), Math.sin((i / 12) * Math.PI * 2)));
      break;
    case 1:
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i & 1 ? 0.45 : 1;
        pts.push(P(Math.cos(a) * rr, Math.sin(a) * rr));
      }
      break;
    case 2:
      pts.push(P(0.2, 1), P(-0.55, -0.05), P(-0.05, -0.05), P(-0.25, -1), P(0.55, 0.15), P(0.05, 0.15));
      break;
    case 3:
      pts.push(P(0, -0.9), P(-0.95, 0.1), P(-0.7, 0.75), P(-0.25, 0.8), P(0, 0.45), P(0.25, 0.8), P(0.7, 0.75), P(0.95, 0.1));
      break;
    case 4:
      pts.push(P(-0.8, -0.7), P(0.8, -0.7), P(0.85, 0.35), P(0.6, 1), P(0.3, 0.55), P(-0.3, 0.55), P(-0.6, 1), P(-0.85, 0.35));
      break;
    default:
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        pts.push(P(Math.cos(a) * 0.75, Math.sin(a) * (a < Math.PI ? 1 : 0.8)));
      }
  }
  k.poly(pts, color, Math.max(0.7, k.thin * 0.7), 0.05);
  if (kind % 6 >= 4 && k.s * r > 3) {
    // eyes
    for (const du of [-0.32, 0.32]) {
      const [x, y] = k.p(...P(du, 0.05));
      pen.beginPath();
      pen.arc(x, y, Math.max(0.6, 0.14 * r * k.s), 0, Math.PI * 2);
      pen.fillStyle = INK;
      pen.fill();
    }
  }
}

// Screen points round a circle of radius r centred on c, square to n.
export function ring(k: Kit, c: P3, n: P3, r: number, steps = 20): Pt[] {
  const l = Math.hypot(...n) || 1;
  const N: P3 = [n[0] / l, n[1] / l, n[2] / l];
  const ref: P3 = Math.abs(N[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cr = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const A = cr(N, ref);
  const la = Math.hypot(...A);
  const a: P3 = [A[0] / la, A[1] / la, A[2] / la];
  const b = cr(N, a);
  const out: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const cs = Math.cos(th) * r;
    const sn = Math.sin(th) * r;
    out.push(k.p(c[0] + a[0] * cs + b[0] * sn, c[1] + a[1] * cs + b[1] * sn, c[2] + a[2] * cs + b[2] * sn));
  }
  return out;
}

// Fills a closed screen-point path.
export function fillPts(k: Kit, pts: ReadonlyArray<Pt>, c: Color | Gradient | null, line = 0): void {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.paint(c, line);
}

export { hullPts };

// A fan's blades seen face on, on the plane v = n round (u, z): `blades`
// curved blades turned by `spin`, r units across.
export function fanBlades(k: Kit, u: number, n: number, z: number, r: number, spin: number, color: Color, blades = 5): void {
  const pen = k.pen;
  pen.beginPath();
  for (let i = 0; i < blades; i++) {
    const a = spin + (i / blades) * Math.PI * 2;
    const p = (rr: number, da: number): P3 => [u + Math.cos(a + da) * rr * r, n, z + Math.sin(a + da) * rr * r];
    k.trace([p(0.3, -0.25), p(0.95, -0.05), p(0.92, 0.38), p(0.3, 0.3)]);
  }
  pen.fillStyle = color;
  pen.fill();
}
