// The scene's small drawings: soft floor shadows and rings, particles,
// light halos, the ambient tint and the label pills, most of them also as
// sprites to cache and lay on the scene.

import type { RGB } from '../../term/color.ts';
import { opacity } from '../../world/particles.ts';
import type { Particle } from '../../world/types.ts';
import { Canvas } from '../canvas.ts';
import { hexOf, rgbOf } from '../iso.ts';
import type { Pen } from '../types.ts';

export type Project = (x: number, y: number, z: number) => [number, number];

// A soft dark ellipse on the floor, rx x ry px, as a premultiplied sprite
// (to cache) with its middle at (cx, cy). A circle `r` units round on the
// floor is rx = sqrt(2) r s, ry = rx / 2.
export function shadowSprite(rx: number, ry: number, a: number): { img: Canvas; cx: number; cy: number } {
  const w = Math.ceil(2 * rx) + 2;
  const h = Math.ceil(2 * ry) + 2;
  const img = new Canvas(w, h);
  img.translate(w / 2, h / 2);
  img.scale(1, ry / rx);
  const g = img.createRadialGradient(0, 0, 0, 0, 0, rx);
  for (const [t, k] of [[0, 1], [0.45, 0.85], [0.75, 0.4], [1, 0]]) g.addColorStop(t, `rgba(0, 0, 0, ${a * k})`);
  img.fillStyle = g;
  img.beginPath();
  img.arc(0, 0, rx, 0, Math.PI * 2);
  img.fill();
  return { img, cx: w / 2, cy: h / 2 };
}

// A ring on the floor round (x, y), `r` units: a soft glow inside and a
// crisp band, in `color` at `a`.
export function floorRing(pen: Pen, at: Project, x: number, y: number, r: number, s: number, color: RGB, a: number): void {
  const [cx, cy] = at(x, y, 0);
  const rx = Math.SQRT2 * r * s;
  pen.save();
  pen.translate(cx, cy);
  pen.scale(1, 0.5);
  const g = pen.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
  g.addColorStop(0, hexOf(color, 0));
  g.addColorStop(0.7, hexOf(color, 0.18 * a));
  g.addColorStop(1, hexOf(color, 0.32 * a));
  pen.fillStyle = g;
  pen.beginPath();
  pen.arc(0, 0, rx, 0, Math.PI * 2);
  pen.fill();
  pen.restore();
  pen.save();
  pen.beginPath();
  pen.ellipse(cx, cy, rx, rx / 2, 0, 0, Math.PI * 2);
  pen.strokeStyle = hexOf(color, 0.3 * a);
  pen.lineWidth = Math.max(3, 0.9 * s);
  pen.stroke();
  pen.strokeStyle = hexOf(color, a);
  pen.lineWidth = Math.max(1.5, 0.34 * s);
  pen.stroke();
  pen.restore();
}

// The ring as a sprite, its middle at (cx, cy).
export function ringSprite(r: number, s: number, color: RGB, a: number): { img: Canvas; cx: number; cy: number } {
  const rx = Math.SQRT2 * r * s;
  const lw = Math.max(3, 0.9 * s);
  const cx = Math.ceil(rx + lw / 2) + 2;
  const cy = Math.ceil(rx / 2 + lw / 2) + 2;
  const img = new Canvas(2 * cx + 1, 2 * cy + 1);
  floorRing(img, () => [cx, cy], 0, 0, r, s, color, a);
  return { img, cx, cy };
}

// ── particles ────────────────────────────────────────────────────────────

const WHITE: RGB = [255, 255, 255];
const lighten = (c: RGB, k: number): RGB => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k];

// Bits that drift as ambient animation (steam off a cup, embers) rather
// than events (sparks, confetti, bolts).
export function ambientBit(p: Particle): boolean {
  return p.kind === 'steam' || p.kind === 'ember' || p.kind === 'smoke' || p.kind === 'drop' || p.kind === 'zzz';
}

// A spin that tells one bit from another (they carry no id).
const spinOf = (p: Particle) => (p.color[0] * 7 + p.color[1] * 3 + p.vx * 5 + p.vy * 11) % (Math.PI * 2);

// One particle drawn at its place, faded by its life.
export function drawParticle(pen: Pen, at: Project, p: Particle, s: number, t: number): void {
  const a = opacity(p);
  if (a <= 0.02) return;
  const [x, y] = at(p.x, p.y, p.z);
  const u = Math.max(1, s);
  pen.globalAlpha = a;
  switch (p.kind) {
    case 'spark':
    case 'ember': {
      // A hot dot with a short streak behind it along its flight.
      const r = Math.max(1, (p.kind === 'spark' ? 0.32 : 0.28) * u);
      const [bx, by] = at(p.x - p.vx * 0.035, p.y - p.vy * 0.035, p.z - p.vz * 0.035);
      if (Math.hypot(bx - x, by - y) > r) {
        pen.beginPath();
        pen.moveTo(bx, by);
        pen.lineTo(x, y);
        pen.strokeStyle = hexOf(p.color, 0.7);
        pen.lineWidth = r * 1.2;
        pen.lineCap = 'round';
        pen.stroke();
      }
      pen.beginPath();
      pen.arc(x, y, r, 0, Math.PI * 2);
      pen.fillStyle = hexOf(lighten(p.color, 0.55));
      pen.fill();
      break;
    }
    case 'confetti': {
      // A little paper rectangle, tumbling while it falls, flat once landed.
      const w = 0.9 * u;
      const h = 0.5 * u;
      const ang = spinOf(p) + (p.landed ? 0 : t * 7);
      const flip = p.landed ? 0.55 : Math.cos(t * 9 + spinOf(p) * 3);
      pen.save();
      pen.translate(x, y);
      pen.rotate(ang);
      pen.scale(1, Math.max(0.15, Math.abs(flip)));
      pen.fillStyle = hexOf(flip < 0 ? mixRgb(p.color, [0, 0, 0], 0.18) : p.color);
      pen.fillRect(-w / 2, -h / 2, w, h);
      pen.restore();
      break;
    }
    case 'smoke':
    case 'steam': {
      // A soft round puff that swells as it rises.
      const age = Math.max(0, 2.2 - p.life);
      const r = (p.kind === 'smoke' ? 1.1 + age * 0.9 : 0.6 + age * 0.6) * u;
      const k = p.kind === 'smoke' ? 0.42 : 0.3;
      const g = pen.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, hexOf(p.color, k));
      g.addColorStop(0.55, hexOf(p.color, k * 0.6));
      g.addColorStop(1, hexOf(p.color, 0));
      pen.fillStyle = g;
      pen.beginPath();
      pen.arc(x, y, r, 0, Math.PI * 2);
      pen.fill();
      break;
    }
    case 'drop': {
      const r = Math.max(0.8, 0.22 * u);
      pen.beginPath();
      pen.ellipse(x, y, r, r * 1.7, 0, 0, Math.PI * 2);
      pen.fillStyle = hexOf(p.color, 0.85);
      pen.fill();
      break;
    }
    case 'glint':
      star(pen, x, y, Math.max(2, 0.9 * u), lighten(p.color, 0.5));
      break;
    case 'bolt': {
      // A crackling arc trailing back along its flight, a white core in a
      // coloured sheath.
      const n = 5;
      const pts: Array<[number, number]> = [];
      const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
      const len = 2.2;
      for (let i = 0; i <= n; i++) {
        const k = (i / n) * len;
        const [px, py] = at(p.x - (p.vx / sp) * k, p.y - (p.vy / sp) * k, p.z - (p.vz / sp) * k);
        const wob = i && i < n ? Math.sin(t * 40 + i * 2.3) * 0.35 * u : 0;
        pts.push([px + wob, py - wob * 0.5]);
      }
      for (const [w, c] of [[0.55 * u, hexOf(p.color, 0.85)], [0.22 * u, hexOf(lighten(p.color, 0.8))]] as const) {
        pen.beginPath();
        pts.forEach(([px, py], i) => (i ? pen.lineTo(px, py) : pen.moveTo(px, py)));
        pen.strokeStyle = c;
        pen.lineWidth = Math.max(1, w);
        pen.lineJoin = 'round';
        pen.lineCap = 'round';
        pen.stroke();
      }
      break;
    }
    case 'zzz': {
      const h = 0.9 * u;
      pen.beginPath();
      pen.moveTo(x - h / 2, y - h / 2);
      pen.lineTo(x + h / 2, y - h / 2);
      pen.lineTo(x - h / 2, y + h / 2);
      pen.lineTo(x + h / 2, y + h / 2);
      pen.strokeStyle = hexOf(p.color);
      pen.lineWidth = Math.max(1, 0.18 * u);
      pen.lineJoin = 'round';
      pen.stroke();
      break;
    }
  }
  pen.globalAlpha = 1;
}

function mixRgb(a: RGB, b: RGB, k: number): RGB {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

// A four-point star of radius r.
function star(pen: Pen, x: number, y: number, r: number, c: RGB): void {
  const q = r * 0.22;
  pen.beginPath();
  pen.moveTo(x, y - r);
  pen.quadraticCurveTo(x + q, y - q, x + r, y);
  pen.quadraticCurveTo(x + q, y + q, x, y + r);
  pen.quadraticCurveTo(x - q, y + q, x - r, y);
  pen.quadraticCurveTo(x - q, y - q, x, y - r);
  pen.closePath();
  pen.fillStyle = hexOf(c);
  pen.fill();
  pen.beginPath();
  pen.arc(x, y, Math.max(0.8, q), 0, Math.PI * 2);
  pen.fillStyle = hexOf(WHITE);
  pen.fill();
}

// ── light ────────────────────────────────────────────────────────────────

// Soft round halos, as 64-step falloff masks cached by radius.
const HALOS = new Map<number, Float32Array>();
function halo(r: number): Float32Array {
  let m = HALOS.get(r);
  if (!m) {
    const d = 2 * r + 1;
    m = new Float32Array(d * d);
    for (let j = 0; j < d; j++) {
      for (let i = 0; i < d; i++) {
        const q = Math.hypot(i - r, j - r) / (r + 0.5);
        m[j * d + i] = q >= 1 ? 0 : (1 - q) * (1 - q);
      }
    }
    if (HALOS.size > 64) HALOS.clear();
    HALOS.set(r, m);
  }
  return m;
}

// Adds a halo of radius r px in `c` at strength `a` round (x, y), blended
// `screen` straight into an opaque bitmap.
export function addHalo(px: Uint8ClampedArray, w: number, h: number, x: number, y: number, r: number, c: RGB, a: number): void {
  const R = Math.max(1, Math.round(r));
  if (a <= 0 || x + R < 0 || y + R < 0 || x - R >= w || y - R >= h) return;
  const m = halo(R);
  const d = 2 * R + 1;
  const cx = Math.round(x) - R;
  const cy = Math.round(y) - R;
  const i0 = Math.max(0, -cx);
  const j0 = Math.max(0, -cy);
  const i1 = Math.min(d, w - cx);
  const j1 = Math.min(d, h - cy);
  const [r0, g0, b0] = c;
  for (let j = j0; j < j1; j++) {
    let o = ((cy + j) * w + cx + i0) * 4;
    for (let i = i0; i < i1; i++, o += 4) {
      const k = m[j * d + i] * a;
      if (k <= 0.004) continue;
      // screen: 1 - (1 - dst) (1 - src)
      px[o] += ((255 - px[o]) * r0 * k) / 255;
      px[o + 1] += ((255 - px[o + 1]) * g0 * k) / 255;
      px[o + 2] += ((255 - px[o + 2]) * b0 * k) / 255;
    }
  }
}

// Where a halo sprite's light is matched. Screen lifts each channel by its
// own share (the colour's channel over 255, times the falloff); a pixel
// laid over lifts every channel by one share, its alpha. So the sprite
// takes the strongest channel's share as its alpha and picks its colour to
// come out exact over a ground this bright: over darker grounds a little
// paler than screen would make it, over lighter ones a little deeper in its
// own colour. Over the café's floor and walls this is the least error, and
// it errs toward light.
const LIGHT_REF = 128;

// addHalo as a premultiplied sprite (2R + 1 square) to lay over the scene.
export function haloSprite(R: number, c: RGB, a: number): Canvas {
  const m = halo(R);
  const d = 2 * R + 1;
  const img = new Canvas(d, d);
  const px = img.data;
  const top = Math.max(c[0], c[1], c[2]) / 255;
  for (let i = 0; i < d * d; i++) {
    const k = m[i] * a;
    if (k <= 0.004) continue;
    const al = top * k;
    const o = i * 4;
    for (let j = 0; j < 3; j++) {
      const mc = (c[j] / 255) * k;
      px[o + j] = 255 * mc + LIGHT_REF * (al - mc);
    }
    px[o + 3] = 255 * al;
  }
  return img;
}

// Multiplies the bitmap toward `tint` by `k` (0..1): the colour channels
// only, so a premultiplied picture stays one.
export function tintAll(px: Uint8ClampedArray, tint: RGB, k: number): void {
  if (k <= 0) return;
  const lut = [0, 1, 2].map((c) => {
    const t = new Uint8ClampedArray(256);
    const f = 1 - k + (k * tint[c]) / 255;
    for (let v = 0; v < 256; v++) t[v] = v * f + 0.5;
    return t;
  });
  const [lr, lg, lb] = lut;
  for (let o = 0, n = px.length; o < n; o += 4) {
    px[o] = lr[px[o]];
    px[o + 1] = lg[px[o + 1]];
    px[o + 2] = lb[px[o + 2]];
  }
}

// ── label pills ──────────────────────────────────────────────────────────

// A soft capsule behind a label's cells (x0, y0)-(x1, y1): a faint shadow
// under it, the fill in `color` at `a`, a thin ink rim.
export function pill(pen: Pen, x0: number, y0: number, x1: number, y1: number, color: RGB, a: number, ink: string, strong: boolean): void {
  const h = y1 - y0;
  const inset = Math.max(1, Math.round(h * 0.08));
  const out = Math.max(2, Math.round(h * 0.18));
  const x = x0 - out;
  const y = y0 + inset;
  const w = x1 - x0 + 2 * out;
  const ph = h - 2 * inset;
  const r = ph / 2;
  pen.save();
  pen.beginPath();
  pen.roundRect(x + 0.5, y + 1.5, w, ph, r);
  pen.fillStyle = `rgba(0, 0, 0, ${(0.22 * a).toFixed(3)})`;
  pen.fill();
  pen.beginPath();
  pen.roundRect(x, y, w, ph, r);
  pen.fillStyle = hexOf(color, a);
  pen.fill();
  pen.strokeStyle = strong ? ink : hexOf(rgbOf(ink), 0.45 * a);
  pen.lineWidth = strong ? 1.5 : 1;
  pen.stroke();
  pen.restore();
}

// A pill behind a w x h run of cells as a sprite, the run's top-left at
// (dx, dy) in it.
export function pillSprite(w: number, h: number, color: RGB, a: number, ink: string, strong: boolean): { img: Canvas; dx: number; dy: number } {
  const dx = Math.max(2, Math.round(h * 0.18)) + 2;
  const dy = 2;
  const img = new Canvas(w + 2 * dx + 1, h + 2 * dy + 1);
  pill(img, dx, dy, dx + w, dy + h, color, a, ink, strong);
  return { img, dx, dy };
}
