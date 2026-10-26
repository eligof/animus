import { mix, shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash, withAlpha } from './kit.ts';

// Small things the outpost is full of, drawn in any frame: crates of
// planks, clay pots and jugs turned on a lathe, bottles and tea glasses,
// tin lanterns and cold tube lamps, stools, cushions, coils of rope, hide
// awnings, pipes, barrels racked on their sides and kegs with bent pipe
// taps, gears, jars and sacks, and a few shape helpers (after the vault's
// and the café's).

// ── shape helpers ────────────────────────────────────────────────────────────

// The convex hull of screen points (monotone chain).
export function hull(pts: ReadonlyArray<Pt>): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const q of list) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], q) <= 1e-9) out.pop();
      out.push(q);
    }
    return out;
  };
  const lo = half(p);
  const up = half([...p].reverse());
  return lo.slice(0, -1).concat(up.slice(0, -1));
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

// Fills (and inks, line > 0) a polygon of screen points.
export function fillPts(k: Kit, pts: ReadonlyArray<Pt>, c: Color | Gradient | null, line = 0): void {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.paint(c, line);
}

// A left-to-right gradient across screen points: lit left, dark right.
export function across(k: Kit, pts: ReadonlyArray<Pt>, base: Color, lift = 0.14, drop = 0.24): Gradient {
  const xs = pts.map((p) => p[0]);
  const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  g.addColorStop(0, shade(base, lift * 0.5));
  g.addColorStop(0.3, shade(base, lift));
  g.addColorStop(0.65, base);
  g.addColorStop(1, shade(base, -drop));
  return g;
}

// Small round heads (rivets, nails, studs) at frame points, r units.
export function rivets(k: Kit, pts: ReadonlyArray<P3>, color: Color, r = 0.13): void {
  if (!pts.length) return;
  const pen = k.pen;
  const R = Math.max(0.7, r * k.s);
  pen.beginPath();
  for (const [u, v, z] of pts) {
    const [x, y] = k.p(u, v, z);
    pen.moveTo(x + R, y);
    pen.arc(x, y, R, 0, Math.PI * 2);
  }
  pen.fillStyle = color;
  pen.fill();
}

// ── turned things ────────────────────────────────────────────────────────────

// A round thing turned on a lathe, standing at (cu, cv) from z0: `prof`
// is its profile from the foot up, [height over z0, radius]. Shaded across
// (lit left), outlined; `mouth` fills its top opening, `lid` caps it.
export function lathe(k: Kit, cu: number, cv: number, z0: number, prof: ReadonlyArray<readonly [number, number]>, base: Color, o: { mouth?: Color; lid?: Color; line?: number } = {}): void {
  const es = prof.map(([dz, r]) => k.ell(cu, cv, z0 + dz, r));
  const pen = k.pen;
  const top = es[es.length - 1];
  const bot = es[0];
  const outline = () => {
    pen.beginPath();
    es.forEach((e, i) => (i ? pen.lineTo(e.cx - e.rx, e.cy) : pen.moveTo(e.cx - e.rx, e.cy)));
    pen.ellipse(top.cx, top.cy, top.rx, top.ry, 0, Math.PI, Math.PI * 2);
    for (let i = es.length - 2; i >= 0; i--) pen.lineTo(es[i].cx + es[i].rx, es[i].cy);
    pen.ellipse(bot.cx, bot.cy, bot.rx, bot.ry, 0, 0, Math.PI);
    pen.closePath();
  };
  const wide = es.reduce((m, e) => Math.max(m, e.rx), 0);
  const g = pen.createLinearGradient(bot.cx - wide, 0, bot.cx + wide, 0);
  g.addColorStop(0, shade(base, 0.06));
  g.addColorStop(0.28, shade(base, 0.16));
  g.addColorStop(0.62, base);
  g.addColorStop(1, shade(base, -0.26));
  outline();
  k.paint(g, 0);
  if (o.mouth || o.lid) {
    pen.beginPath();
    pen.ellipse(top.cx, top.cy, top.rx, top.ry, 0, 0, Math.PI * 2);
    k.paint(o.lid ?? o.mouth!, k.thin);
    if (o.mouth && !o.lid && top.rx > 3) {
      pen.beginPath();
      pen.ellipse(top.cx, top.cy + top.ry * 0.2, top.rx * 0.78, top.ry * 0.6, 0, 0, Math.PI * 2);
      pen.fillStyle = shade(o.mouth, -0.35);
      pen.fill();
    }
  }
  outline();
  k.paint(null, o.line ?? k.lw);
}

// The front half of a level ring round a turned thing: a hoop, a painted
// band, a cord.
export function band(k: Kit, cu: number, cv: number, z: number, r: number, color: Color, w: number): void {
  const e = k.ell(cu, cv, z, r);
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0.04, Math.PI - 0.04);
  pen.strokeStyle = color;
  pen.lineWidth = w;
  pen.lineCap = 'butt';
  pen.stroke();
}

// A clay pot or jar: a rounded belly, a short neck and a lip; a painted
// band round the shoulder.
export function claypot(k: Kit, cu: number, cv: number, z: number, r: number, h: number, color: Color = C.clay, stripe: Color | null = C.cream): void {
  lathe(k, cu, cv, z, [[0, r * 0.55], [h * 0.12, r * 0.85], [h * 0.38, r], [h * 0.62, r * 0.88], [h * 0.8, r * 0.52], [h * 0.9, r * 0.5], [h, r * 0.62]], color, { mouth: shade(color, -0.2) });
  if (stripe && k.s * r >= 2.5) band(k, cu, cv, z + h * 0.6, r * 0.9, stripe, Math.max(0.8, 0.13 * k.s));
}

// A jug: a pot with a handle on its +u side.
export function jug(k: Kit, cu: number, cv: number, z: number, r: number, h: number, color: Color = C.clay): void {
  k.rod([[cu + r * 0.45, cv, z + h * 0.92], [cu + r * 1.25, cv, z + h * 0.85], [cu + r * 1.15, cv, z + h * 0.42], [cu + r * 0.8, cv, z + h * 0.35]], color, Math.max(0.1, r * 0.2));
  lathe(k, cu, cv, z, [[0, r * 0.6], [h * 0.3, r], [h * 0.6, r * 0.85], [h * 0.8, r * 0.45], [h, r * 0.55]], color, { mouth: shade(color, -0.25) });
}

// A bottle of glass with a cork.
export function bottle(k: Kit, cu: number, cv: number, z: number, h: number, color: Color, r = 0.36): void {
  lathe(k, cu, cv, z, [[0, r], [h * 0.58, r], [h * 0.7, r * 0.5], [h * 0.92, r * 0.38]], color, { lid: '#c9a06a', line: Math.max(0.8, k.thin) });
  if (k.s * r >= 2) {
    const [x0, y0] = k.p(cu - r * 0.45, cv + r * 0.5, z + h * 0.12);
    const [x1, y1] = k.p(cu - r * 0.45, cv + r * 0.5, z + h * 0.52);
    k.pen.beginPath();
    k.pen.moveTo(x0, y0);
    k.pen.lineTo(x1, y1);
    k.pen.strokeStyle = withAlpha('#fff8e8', 0.55);
    k.pen.lineWidth = Math.max(0.7, 0.1 * k.s);
    k.pen.stroke();
  }
}

// A small tea glass with amber tea, or a clay cup (tea = false).
export function glass(k: Kit, cu: number, cv: number, z: number, r = 0.34, h = 0.8, tea = true): void {
  if (tea) {
    lathe(k, cu, cv, z, [[0, r * 0.8], [h * 0.45, r * 0.72], [h, r]], '#c8742e', { mouth: '#e09a48', line: Math.max(0.8, k.thin * 0.9) });
    band(k, cu, cv, z + h * 0.92, r, withAlpha('#fff6e0', 0.75), Math.max(0.7, 0.08 * k.s));
  } else lathe(k, cu, cv, z, [[0, r * 0.75], [h, r]], C.clay, { mouth: '#5a2e18', line: Math.max(0.8, k.thin * 0.9) });
}

// ── wood ─────────────────────────────────────────────────────────────────────

// Seams between planks on the faces of a box the viewer sees (front +v,
// end +u, top): `n` boards up the sides, `m` across the top.
export function seams(k: Kit, u0: number, v0: number, z0: number, du: number, dv: number, dz: number, n: number, m = 0, color: Color = withAlpha(INK, 0.5)): void {
  const list: Array<[P3, P3]> = [];
  const [u1, v1, z1] = [u0 + du, v0 + dv, z0 + dz];
  for (let i = 1; i < n; i++) {
    const z = z0 + (dz * i) / n;
    list.push([[u0, v1, z], [u1, v1, z]], [[u1, v0, z], [u1, v1, z]]);
  }
  for (let i = 1; i < m; i++) {
    const v = v0 + (dv * i) / m;
    list.push([[u0, v, z1], [u1, v, z1]]);
  }
  k.segs(list, color, Math.max(0.7, k.thin * 0.75));
}

// A crate of planks; `open` leaves its front open on a dark inside (what
// it holds is drawn after, standing on z0 + 0.35 just inside v0 + dv).
export function crate(k: Kit, u0: number, v0: number, z0: number, du: number, dv: number, dz: number, wood: Color = C.woodLight, open = false): void {
  k.box(u0, v0, z0, du, dv, dz, wood, { stripe: false });
  const F = v0 + dv;
  if (!open) {
    seams(k, u0, v0, z0, du, dv, dz, Math.max(2, Math.round(dz / 1.3)), Math.max(1, Math.round(dv / 1.4)));
    // the corner battens and a cross brace on the front
    const b = 0.38;
    const dark = shade(wood, -0.12);
    k.rect(u0, z0, u0 + b, z0 + dz, F + 0.01, k.side(dark, 0, 1), k.thin);
    k.rect(u0 + du - b, z0, u0 + du, z0 + dz, F + 0.01, k.side(dark, 0, 1), k.thin);
    k.line([[u0 + b, F + 0.02, z0 + 0.3], [u0 + du - b, F + 0.02, z0 + dz - 0.3]], INK, Math.max(1.2, 0.3 * k.s + k.thin));
    k.line([[u0 + b, F + 0.02, z0 + 0.3], [u0 + du - b, F + 0.02, z0 + dz - 0.3]], k.side(dark, 0, 1), Math.max(0.8, 0.3 * k.s));
    return;
  }
  seams(k, u0, v0, z0, du, dv, dz, Math.max(2, Math.round(dz / 1.3)), Math.max(1, Math.round(dv / 1.4)));
  const b = 0.35;
  k.rect(u0 + b, z0 + b, u0 + du - b, z0 + dz - b, F + 0.01, k.vgrad(u0, F, z0, z0 + dz, [[0, '#4a2c16'], [0.7, '#2e1a0c'], [1, '#22130a']]), k.thin);
}

// A low stool: a round seat of hide on three splayed legs with a rung.
export function stool(k: Kit, cu: number, cv: number, h: number, seat: Color = C.hide, wood: Color = C.wood): void {
  k.shadow(cu, cv, 1.25, 1.25, 0.22);
  const legs = [0.4, 2.5, 4.6];
  for (const a of legs) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    k.rod([[cu + ca * 0.55, cv + sa * 0.55, h - 0.4], [cu + ca * 0.95, cv + sa * 0.95, 0]], wood, 0.17);
  }
  const rz = h * 0.35;
  const pts: P3[] = legs.map((a) => [cu + Math.cos(a) * 0.82, cv + Math.sin(a) * 0.82, rz] as P3);
  k.rod([pts[1], pts[0], pts[2]], shade(wood, -0.1), 0.1);
  k.cyl(cu, cv, h - 0.45, 0.95, 0.45, wood);
  k.disc(cu, cv, h + 0.02, 0.85, seat, k.thin);
  if (k.fine) {
    const e = k.ell(cu, cv, h + 0.03, 0.62);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
    k.pen.strokeStyle = withAlpha(shade(seat, -0.4), 0.7);
    k.pen.lineWidth = Math.max(0.6, 0.05 * k.s);
    k.pen.stroke();
  }
}

// A floor cushion: a soft box with a button in its top, piped in `trim`.
export function cushion(k: Kit, u0: number, v0: number, z0: number, du: number, dv: number, dz: number, color: Color, trim: Color = C.brass): void {
  k.box(u0, v0, z0, du, dv, dz, color, { round: Math.min(du, dv, dz) * 0.45, top: shade(color, 0.14) });
  const [cx, cy] = k.p(u0 + du / 2, v0 + dv / 2, z0 + dz);
  const R = Math.max(0.8, 0.16 * k.s);
  k.pen.beginPath();
  k.pen.arc(cx, cy, R, 0, Math.PI * 2);
  k.pen.fillStyle = trim;
  k.pen.fill();
  if (k.fine) {
    // creases from the button
    const seg: Array<[P3, P3]> = [];
    for (const [du2, dv2] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]] as const) {
      seg.push([[u0 + du / 2 + du2 * 0.3, v0 + dv / 2 + dv2 * 0.3, z0 + dz], [u0 + du / 2 + du2 * du * 0.7, v0 + dv / 2 + dv2 * dv * 0.7, z0 + dz]]);
    }
    k.segs(seg, withAlpha(shade(color, -0.4), 0.6), Math.max(0.6, 0.05 * k.s), 'round');
  }
}

// A coil of rope lying on z: a few loops, the loose end trailing.
export function ropeCoil(k: Kit, cu: number, cv: number, z: number, r: number): void {
  const pen = k.pen;
  const rope = '#c9a46a';
  for (let i = 0; i < 3; i++) {
    const e = k.ell(cu + i * 0.05, cv, z + 0.2 + i * 0.26, r * (1 - i * 0.08));
    pen.beginPath();
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
    pen.strokeStyle = INK;
    pen.lineWidth = Math.max(1.4, 0.32 * k.s + k.lw * 0.9);
    pen.stroke();
    pen.strokeStyle = i === 2 ? shade(rope, 0.12) : rope;
    pen.lineWidth = Math.max(0.9, 0.32 * k.s);
    pen.stroke();
  }
  k.rod([[cu + r * 0.9, cv + 0.2, z + 0.75], [cu + r * 1.25, cv + 0.6, z + 0.2], [cu + r * 1.5, cv + 0.4, z + 0.05]], rope, 0.16);
}

// ── light ────────────────────────────────────────────────────────────────────

// A tin lantern hanging by its ring at z (the ring's top), `size` times
// the usual: a cap, glass panes lit from within, a base; its glow round it.
export function lantern(k: Kit, u: number, v: number, z: number, lit = true, glow = 0.42, size = 1): void {
  const r = 0.55 * size;
  const zb = z - 2.6 * size;
  if (lit) k.halo(u, v, zb + 1.1 * size, 4.5 * size, C.lamp, glow);
  // the base
  k.cyl(u, v, zb, r * 0.95, 0.35 * size, C.scrapDark, { line: k.thin });
  // the glass, lit
  const g = lit ? '#ffe6a6' : '#8a7a5a';
  lathe(k, u, v, zb + 0.35 * size, [[0, r * 0.8], [0.6 * size, r * 0.9], [1.2 * size, r * 0.8]], g, { line: k.thin });
  if (lit) {
    const [x, y] = k.p(u, v, zb + 0.95 * size);
    k.pen.beginPath();
    k.pen.ellipse(x, y, 0.13 * size * k.s, 0.28 * size * k.s, 0, 0, Math.PI * 2);
    k.pen.fillStyle = C.flame;
    k.pen.fill();
  }
  // the tin frame: two wires up the front
  k.segs([[[u - r * 0.5, v + r * 0.6, zb + 0.35 * size], [u - r * 0.5, v + r * 0.6, zb + 1.55 * size]], [[u + r * 0.6, v + r * 0.4, zb + 0.35 * size], [u + r * 0.6, v + r * 0.4, zb + 1.55 * size]]], withAlpha(INK, 0.8), Math.max(0.6, 0.06 * k.s * size));
  // the cap and the ring
  frustumCap(k, u, v, zb + 1.55 * size, r, 0.7 * size);
  const [rx, ry] = k.p(u, v, z - 0.25 * size);
  k.pen.beginPath();
  k.pen.ellipse(rx, ry, 0.22 * size * k.s, 0.25 * size * k.s, 0, 0, Math.PI * 2);
  k.pen.strokeStyle = INK;
  k.pen.lineWidth = Math.max(0.8, 0.1 * k.s * size);
  k.pen.stroke();
}

function frustumCap(k: Kit, u: number, v: number, z: number, r: number, h: number): void {
  const bot = ring(k, [u, v, z], [0, 0, 1], r, 16);
  const top = ring(k, [u, v, z + h], [0, 0, 1], r * 0.25, 10);
  const sil = hull([...bot, ...top]);
  fillPts(k, sil, across(k, sil, C.scrap), k.thin);
}

// ── hide ─────────────────────────────────────────────────────────────────────

// A hide awning stretched from its back edge (v = 0, z = zb) out to its
// front edge (v = vf, z = zf) across u0..u1, sagging a little, its front
// cut in tabs with a stitched seam; `struts`: poles from the front
// corners back to the wall at z = zs (or none, when the poles are drawn by
// the caller).
export function awning(k: Kit, u0: number, u1: number, zb: number, vf: number, zf: number, seed: number, zs: number | null = null): void {
  const pen = k.pen;
  const hide = mix(C.hide, '#d7ad72', hash(seed, 1) * 0.6);
  const n = Math.max(3, Math.round((u1 - u0) / 1.4));
  const sag = (i: number) => Math.sin((i / n) * Math.PI) * 0.35;
  const back: P3[] = [];
  const front: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n;
    back.push([u, 0.05, zb]);
    front.push([u, vf, zf - sag(i)]);
  }
  if (zs !== null) {
    for (const u of [u0 + 0.4, u1 - 0.4]) k.rod([[u, vf - 0.2, zf - 0.1], [u, 0.1, zs]], C.woodDark, 0.16);
  }
  // the hide's top, lighter toward the wall
  const top = [...back, ...front.slice().reverse()];
  k.poly(top, k.lgrad([u0, 0, zb], [u0, vf, zf], [1, 0, 0], [[0, shade(hide, 0.1)], [0.6, hide], [1, shade(hide, -0.08)]]), k.lw);
  // tabs hanging off the front edge
  const tabs: P3[][] = [];
  for (let i = 0; i < n; i++) {
    const a = front[i];
    const b = front[i + 1];
    const m: P3 = [(a[0] + b[0]) / 2, vf, (a[2] + b[2]) / 2 - 0.7];
    tabs.push([a, b, m]);
  }
  pen.beginPath();
  for (const q of tabs) k.trace(q);
  k.paint(k.side(shade(hide, -0.06), 0, 1, 0.14), k.thin);
  // a stitched seam along the front and spots of darker hide
  if (k.s >= 4) {
    const st: Array<[P3, P3]> = [];
    for (let i = 0; i < n * 3; i++) {
      const f0 = (i + 0.2) / (n * 3);
      const f1 = (i + 0.6) / (n * 3);
      const at = (f: number): P3 => [u0 + (u1 - u0) * f, vf * 0.86, zb + (zf - zb) * 0.86 - Math.sin(f * Math.PI) * 0.3];
      st.push([at(f0), at(f1)]);
    }
    k.segs(st, withAlpha(C.cream, 0.75), Math.max(0.6, 0.07 * k.s));
    pen.beginPath();
    for (let i = 0; i < 4; i++) {
      const fu = 0.15 + hash(seed, i, 2) * 0.7;
      const fv = 0.2 + hash(seed, i, 3) * 0.5;
      const [x, y] = k.p(u0 + (u1 - u0) * fu, vf * fv, zb + (zf - zb) * fv - 0.15);
      pen.moveTo(x + 0.5 * k.s, y);
      pen.ellipse(x, y, (0.35 + hash(seed, i, 4) * 0.4) * k.s, 0.22 * k.s, 0.4, 0, Math.PI * 2);
    }
    pen.fillStyle = withAlpha(C.hideDark, 0.35);
    pen.fill();
  }
  // lashings at the back edge
  rivets(k, back.filter((_, i) => i % 2 === 1), C.woodDark, 0.16);
}

// ── outside ──────────────────────────────────────────────────────────────────

// The view out of an opening (u0..u1, z0..z1) set back on the plane v = n:
// a hazy sky warming toward the top, three bands of dunes up to the
// horizon hz (far, mid and near, the near one lit along its crest), and
// now and then a pale sun.
export function dunesView(k: Kit, u0: number, u1: number, z0: number, z1: number, n: number, hz: number, seed: number, sun = true): void {
  const f = Math.max(0, Math.min(1, (hz - z0) / Math.max(0.1, z1 - z0)));
  k.poly([[u0, n, z0], [u1, n, z0], [u1, n, z1], [u0, n, z1]], k.vgrad(u0, n, z0, z1, [[0, '#fbe0a8'], [f, '#fbe3b0'], [Math.min(1, f + 0.08), C.sky], [1, C.skyHigh]]), 0);
  if (sun && hash(seed, 5) < 0.45 && z1 - hz > 4) {
    const su = u0 + 1.4 + hash(seed, 6) * Math.max(0.2, u1 - u0 - 2.8);
    const sz = hz + 2.4 + hash(seed, 7) * Math.max(0.5, z1 - hz - 4.5);
    k.halo(su, n, sz, 3.2, '#fff6dc', 0.6);
    k.face(su, n, sz, 0.85, '#fff4d6', 0, 16);
  }
  const m = Math.max(6, Math.round((u1 - u0) * 2));
  const wave = (u: number, i: number) => Math.sin((u - u0) * (0.55 + i * 0.13) + seed * 1.7 + i * 2.1) * 0.6 + Math.sin((u - u0) * 0.23 + seed + i) * 0.4;
  const bands: Array<[number, number, Color]> = [
    [hz + 0.3, 0.6, C.duneFar],
    [hz - 1.1, 0.9, C.dune],
    [hz - 2.8, 1.4, C.duneShade],
  ];
  bands.forEach(([zc, amp, c], i) => {
    const ridge: P3[] = [];
    for (let j = 0; j <= m; j++) {
      const u = u0 + ((u1 - u0) * j) / m;
      ridge.push([u, n, Math.max(z0, Math.min(z1, zc + amp * wave(u, i)))]);
    }
    k.poly([[u0, n, z0], ...ridge, [u1, n, z0]], c, 0);
    if (i === 2) {
      // the near dune's sunlit slope, falling away from its crest
      const lit = ridge.map(([u, w, z], j): P3 => [u, w, Math.max(z0, z - 0.4 - (j / m) * 2.2)]);
      k.poly([[u0, n, z0], ...lit, [u1, n, z0]], mix(C.dune, '#f8dcaa', 0.45), 0);
    } else if (i === 0) {
      k.line(ridge, withAlpha('#fff2d4', 0.6), Math.max(0.6, 0.08 * k.s));
    }
  });
}

// ── tubes ────────────────────────────────────────────────────────────────────

// A round tube from a to b (radius ra at a, rb at b), shaded across, its
// end toward the viewer capped in `cap`.
export function tube(k: Kit, a: P3, b: P3, ra: number, rb: number, base: Color, cap: Color | null = null, line = k.lw): void {
  const d: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ea = ring(k, a, d, ra, 18);
  const eb = ring(k, b, d, rb, 18);
  const sil = hull([...ea, ...eb]);
  fillPts(k, sil, across(k, sil, base), line);
  if (cap) fillPts(k, d[0] + d[1] + d[2] > 0 ? eb : ea, cap, Math.max(0.8, k.thin * 0.8));
}

// Screen points along the part of a ring round an axis along v (radius r
// at (cu, n, cz)) that faces the viewer: over the top and down the +u
// side.
export function frontArc(k: Kit, cu: number, n: number, cz: number, r: number, steps = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const th = -Math.PI / 4 + (Math.PI * i) / steps;
    out.push(k.p(cu + Math.cos(th) * r, n, cz + Math.sin(th) * r));
  }
  return out;
}

// ── books and leaves ─────────────────────────────────────────────────────────

const BINDINGS: readonly Color[] = ['#a8603f', '#6f8f7a', '#c9a46a', '#8a4a32', '#4f7f86', '#b88a4a', '#7a5a3a', '#d9c4a0', '#9a6a5a'];

// A row of salvaged books standing on a shelf at z, their spines on the
// plane v, from u0 to u1, no taller than hmax. One path a colour.
export function bookRow(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number): void {
  const pen = k.pen;
  const byColor = new Map<Color, P3[][]>();
  const all: P3[][] = [];
  let u = u0;
  let i = 0;
  while (u < u1 - 0.3) {
    const w = 0.45 + hash(seed, i, 61) * 0.45;
    if (u + w > u1) break;
    const h = hmax * (0.62 + hash(seed, i, 63) * 0.36);
    const c = BINDINGS[Math.floor(hash(seed, i, 64) * BINDINGS.length)];
    const lean = hash(seed, i, 65) < 0.12 && i > 0 ? 0.4 : 0;
    const q: P3[] = [[u, v, z], [u + w, v, z], [u + w + lean, v, z + h], [u + lean, v, z + h]];
    (byColor.get(c) ?? byColor.set(c, []).get(c)!).push(q);
    all.push(q);
    u += w + (lean ? 0.35 : 0.03);
    i++;
  }
  for (const [c, qs] of byColor) {
    pen.beginPath();
    for (const q of qs) k.trace(q);
    pen.fillStyle = k.side(c, 0, 1, 0.12);
    pen.fill();
  }
  if (k.s >= 5) {
    pen.beginPath();
    for (const q of all) {
      const hh = q[3][2] - q[0][2];
      for (const f of [0.2, 0.8]) {
        const [x0, y0] = k.p(q[0][0] + (q[3][0] - q[0][0]) * f, v, q[0][2] + hh * f);
        const [x1, y1] = k.p(q[1][0] + (q[2][0] - q[1][0]) * f, v, q[1][2] + hh * f);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
    }
    pen.strokeStyle = withAlpha('#f6e2b4', 0.55);
    pen.lineWidth = Math.max(0.6, 0.07 * k.s);
    pen.stroke();
  }
  pen.beginPath();
  for (const q of all) k.trace(q);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, k.thin * 0.75);
  pen.lineJoin = 'round';
  pen.stroke();
}

// One pointed leaf (or a feather's vane) from (x, y) toward angle a,
// length L px, half-width w px (screen space).
export function leaf(k: Kit, x: number, y: number, a: number, L: number, w: number, fill: Color, rib: Color | null = null): void {
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
  if (rib && L > 8) {
    pen.beginPath();
    pen.moveTo(x0, y0);
    const [rx, ry] = P(L * 0.9, 0);
    pen.lineTo(rx, ry);
    pen.strokeStyle = rib;
    pen.lineWidth = Math.max(0.6, k.thin * 0.6);
    pen.stroke();
  }
}

// ── pipe and light ───────────────────────────────────────────────────────────

// A pipe along frame points, w units thick: ink under metal, a lit line
// along its upper left.
export function pipe(k: Kit, pts: ReadonlyArray<P3>, w: number, color: Color = C.pipe): void {
  k.rod(pts, color, w);
  const d = w * 0.2 * k.s;
  const pen = k.pen;
  pen.beginPath();
  pts.forEach(([u, v, z], i) => {
    const [x, y] = k.p(u, v, z);
    if (i) pen.lineTo(x - d * 0.4, y - d);
    else pen.moveTo(x - d * 0.4, y - d);
  });
  pen.strokeStyle = withAlpha(C.pipeLight, 0.75);
  pen.lineWidth = Math.max(0.6, w * 0.25 * k.s);
  pen.lineCap = 'round';
  pen.lineJoin = 'round';
  pen.stroke();
}

// A cold-white tube lamp standing at (u, v) from z0 to z0 + h: steel caps,
// the glowing tube, a faint cold halo round it (`glow` its strength).
export function tubeLamp(k: Kit, u: number, v: number, z0: number, h: number, glow = 0.3): void {
  if (glow > 0) k.halo(u, v, z0 + h / 2, Math.min(3.4, h * 0.7), C.tubeGlow, glow);
  lathe(k, u, v, z0, [[0, 0.22], [h, 0.22]], C.tube, { line: k.thin });
  k.line([[u - 0.06, v, z0 + 0.25], [u - 0.06, v, z0 + h - 0.25]], '#ffffff', Math.max(0.8, 0.13 * k.s));
  k.cyl(u, v, z0 - 0.4, 0.34, 0.45, C.steelDark, { line: k.thin });
  k.cyl(u, v, z0 + h - 0.05, 0.34, 0.45, C.steelDark, { line: k.thin });
}

// ── barrels and kegs ─────────────────────────────────────────────────────────

// A barrel lying on its side, its axis along v from v0 to v0 + len, centred
// at (cu, cz), radius r at its belly; its head (toward the viewer, +v) of
// boards in a hoop, with a little tap now and then.
export function barrelSide(k: Kit, cu: number, v0: number, cz: number, r: number, len: number, wood: Color = C.stave, tap = false): void {
  const v1 = v0 + len;
  const ax: P3 = [0, 1, 0];
  const sil = hull([...ring(k, [cu, v0, cz], ax, r * 0.86, 20), ...ring(k, [cu, v0 + len * 0.5, cz], ax, r, 20), ...ring(k, [cu, v1, cz], ax, r * 0.86, 20)]);
  fillPts(k, sil, across(k, sil, wood), k.lw);
  // staves along it and hoops round it, over the top and down the near side
  const arc = (n: number, rr: number): Pt[] => frontArc(k, cu, n, cz, rr, 10);
  if (k.s >= 3) {
    const pen = k.pen;
    pen.beginPath();
    for (const th of [0.15, 0.75, 1.35, 1.95]) {
      const a = -Math.PI / 4 + th;
      const [x0, y0] = k.p(cu + Math.cos(a) * r * 0.86, v0 + 0.1, cz + Math.sin(a) * r * 0.86);
      const [x1, y1] = k.p(cu + Math.cos(a) * r, v0 + len * 0.5, cz + Math.sin(a) * r);
      const [x2, y2] = k.p(cu + Math.cos(a) * r * 0.86, v1 - 0.1, cz + Math.sin(a) * r * 0.86);
      pen.moveTo(x0, y0);
      pen.quadraticCurveTo(2 * x1 - (x0 + x2) / 2, 2 * y1 - (y0 + y2) / 2, x2, y2);
    }
    pen.strokeStyle = withAlpha(INK, 0.3);
    pen.lineWidth = Math.max(0.6, 0.07 * k.s);
    pen.stroke();
  }
  for (const f of [0.16, 0.36, 0.64, 0.84]) {
    const rr = r * (0.86 + 0.14 * Math.sin(f * Math.PI)) * 1.01;
    const pts = arc(v0 + len * f, rr);
    const pen = k.pen;
    pen.beginPath();
    pts.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
    pen.strokeStyle = INK;
    pen.lineWidth = Math.max(1.4, 0.26 * k.s + k.thin);
    pen.stroke();
    pen.strokeStyle = C.hoop;
    pen.lineWidth = Math.max(0.8, 0.26 * k.s);
    pen.stroke();
  }
  // the head: boards in its hoop
  const head = ring(k, [cu, v1, cz], ax, r * 0.86, 22);
  fillPts(k, head, k.side(shade(wood, 0.1), 0, 1, 0.1), k.lw);
  fillPts(k, ring(k, [cu, v1 + 0.01, cz], ax, r * 0.7, 22), null, Math.max(0.7, k.thin * 0.8));
  if (k.s >= 3) {
    const seg: Array<[P3, P3]> = [];
    for (const d of [-0.45, 0, 0.45]) {
      const h = Math.sqrt(Math.max(0, 0.7 * 0.7 - d * d)) * r;
      seg.push([[cu + d * r, v1 + 0.02, cz - h], [cu + d * r, v1 + 0.02, cz + h]]);
    }
    k.segs(seg, withAlpha(INK, 0.4), Math.max(0.6, 0.07 * k.s));
  }
  if (tap) {
    k.rod([[cu, v1, cz - r * 0.35], [cu, v1 + 0.6, cz - r * 0.35], [cu, v1 + 0.6, cz - r * 0.6]], C.brassDark, 0.16);
    k.rod([[cu - 0.25, v1 + 0.6, cz - r * 0.3], [cu + 0.25, v1 + 0.6, cz - r * 0.3]], C.brass, 0.1);
  } else rivets(k, [[cu + r * 0.25, v1 + 0.03, cz - r * 0.35]], C.woodDark, 0.16);
}

// An upright keg of staves in iron hoops, r round and h tall, standing at
// (cu, cv) on z; a bent pipe up out of its lid and over to a tap.
export function keg(k: Kit, cu: number, cv: number, z: number, r: number, h: number, wood: Color = C.stave, dir = 1): void {
  lathe(k, cu, cv, z, [[0, r * 0.88], [h * 0.25, r * 0.98], [h * 0.5, r], [h * 0.75, r * 0.98], [h, r * 0.88]], wood, { lid: shade(wood, 0.14) });
  if (k.s >= 3) {
    const pen = k.pen;
    pen.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 4 + 0.25 + (i / 5) * (Math.PI - 0.5);
      const col = (zz: number, rr: number): Pt => k.p(cu + Math.cos(a) * rr, cv + Math.sin(a) * rr, zz);
      const p0 = col(z + 0.1, r * 0.88);
      const p1 = col(z + h * 0.5, r);
      const p2 = col(z + h - 0.1, r * 0.88);
      pen.moveTo(p0[0], p0[1]);
      pen.quadraticCurveTo(2 * p1[0] - (p0[0] + p2[0]) / 2, 2 * p1[1] - (p0[1] + p2[1]) / 2, p2[0], p2[1]);
    }
    pen.strokeStyle = withAlpha(INK, 0.32);
    pen.lineWidth = Math.max(0.6, 0.07 * k.s);
    pen.stroke();
  }
  for (const [f, rr] of [[0.1, 0.9], [0.3, 0.99], [0.7, 0.99], [0.9, 0.9]] as const) {
    band(k, cu, cv, z + h * f, r * rr * 1.015, INK, Math.max(1.4, 0.3 * k.s + k.thin));
    band(k, cu, cv, z + h * f, r * rr * 1.015, C.hoop, Math.max(0.8, 0.3 * k.s));
  }
  // the bent pipe: up from the lid, across, down to the tap with its handle
  const top = z + h;
  const pu = cu + dir * r * 0.95;
  k.cyl(cu, cv, top, 0.32, 0.3, C.hoop, { line: k.thin });
  pipe(k, [[cu, cv, top + 0.2], [cu, cv, top + 1.7], [pu, cv, top + 1.7], [pu, cv, top + 0.9]], 0.24);
  k.rod([[pu, cv, top + 1.2], [pu + dir * 0.45, cv, top + 1.2]], C.pipe, 0.12);
  k.cyl(pu, cv, top + 0.55, 0.16, 0.4, C.brassDark, { line: k.thin });
}

// ── bits and pieces ──────────────────────────────────────────────────────────

// A cog standing on the plane v = n: `teeth` teeth round a rim of radius r,
// a hole in its middle.
export function gear(k: Kit, u: number, n: number, z: number, r: number, teeth: number, color: Color = C.scrap): void {
  const pts: P3[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const da = Math.PI / teeth;
    for (const [aa, rr] of [[a - da * 0.55, r * 0.8], [a - da * 0.3, r], [a + da * 0.3, r], [a + da * 0.55, r * 0.8]] as const) pts.push([u + Math.cos(aa) * rr, n, z + Math.sin(aa) * rr]);
  }
  k.poly(pts, k.side(color, 0, 1, 0.14), k.thin);
  k.face(u, n + 0.01, z, r * 0.3, shade(color, -0.35), Math.max(0.7, k.thin * 0.7), 12);
}

// A glass jar on z with something in it to its shoulder, a tin lid.
export function jar(k: Kit, cu: number, cv: number, z: number, r: number, h: number, stuff: Color): void {
  lathe(k, cu, cv, z, [[0, r * 0.9], [h * 0.7, r], [h * 0.82, r * 0.86], [h * 0.9, r * 0.74]], mix(stuff, '#e8f0ea', 0.25), { line: Math.max(0.8, k.thin * 0.9) });
  if (k.s * r >= 2) {
    const [x0, y0] = k.p(cu - r * 0.5, cv + r * 0.5, z + h * 0.15);
    const [x1, y1] = k.p(cu - r * 0.5, cv + r * 0.5, z + h * 0.6);
    k.pen.beginPath();
    k.pen.moveTo(x0, y0);
    k.pen.lineTo(x1, y1);
    k.pen.strokeStyle = withAlpha('#ffffff', 0.55);
    k.pen.lineWidth = Math.max(0.7, 0.1 * k.s);
    k.pen.stroke();
  }
  k.cyl(cu, cv, z + h * 0.88, r * 0.8, h * 0.14, C.scrap, { line: k.thin });
}

// A sack of grain or salt on z, tied at its neck.
export function sack(k: Kit, cu: number, cv: number, z: number, r: number, h: number, color: Color = C.burlap): void {
  lathe(k, cu, cv, z, [[0, r * 0.82], [h * 0.12, r], [h * 0.5, r * 0.97], [h * 0.72, r * 0.78], [h * 0.84, r * 0.34], [h * 0.9, r * 0.26], [h, r * 0.42]], color, { mouth: shade(color, -0.2) });
  const neck = z + h * 0.86;
  band(k, cu, cv, neck, r * 0.32, INK, Math.max(1.4, 0.2 * k.s + k.thin));
  band(k, cu, cv, neck, r * 0.32, '#8a6a3e', Math.max(0.8, 0.2 * k.s));
  if (k.fine) {
    // a stitched seam down its front
    const st: Array<[P3, P3]> = [];
    for (let i = 0; i < 6; i++) {
      const f0 = 0.12 + i * 0.1;
      st.push([[cu + r * 0.5, cv + r * 0.8, z + h * f0], [cu + r * 0.5, cv + r * 0.8, z + h * (f0 + 0.05)]]);
    }
    k.segs(st, withAlpha(INK, 0.45), Math.max(0.6, 0.06 * k.s), 'round');
  }
}
