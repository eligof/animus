import type { Bones, P3, Puppet, Swing } from '../../worlds/types.ts';
import { apply, move, mul, turn, type Mat, type Sketch } from '../figure/paint.ts';
import { HANG } from './acts.ts';

// What the worlds' locals share on the puppet (see buildNpc in ./puppet.ts):
// where a hand is, the swing that puts it somewhere, what it holds stood
// upright, and a station's points in a local's own frame. Its frame: the
// origin between its feet, x toward where it faces, y down; its body's
// frame is that frame lifted `bob` and leaning `lean`.

// Where arm k's hand is in the body's frame: its shoulder, swung `sh`
// there and bent `el` at the elbow.
export function handOf(b: Bones, p: Puppet, k: 0 | 1): [number, number] {
  const [sx, sy] = b.shoulders[k];
  const { sh, el } = p.arms[k];
  return [sx + Math.sin(sh) * b.upper + Math.sin(sh + el) * b.fore, sy + Math.cos(sh) * b.upper + Math.cos(sh + el) * b.fore];
}

// A point of the local's own frame in its body's frame.
export function toBody(p: Pick<Puppet, 'lean' | 'bob'>, x: number, y: number): [number, number] {
  return apply(turn(-p.lean), x, y + p.bob);
}

// The swing that puts arm k's hand at (x, y) in the body's frame (see
// toBody), as near as the arm reaches. The elbow bends forward, under the
// line to the hand; or, `low`, whichever way keeps it lower (back, for a
// hand across the chest, which a three-quarter view shows so).
export function reach(b: Bones, k: 0 | 1, x: number, y: number, low = false): Swing {
  const [sx, sy] = b.shoulders[k];
  const dx = x - sx;
  const dy = y - sy;
  const a = b.upper;
  const f = b.fore;
  const d = Math.max(Math.abs(a - f) + 1e-3, Math.min(Math.hypot(dx, dy), a + f - 1e-3));
  const cos = (q: number) => Math.acos(Math.max(-1, Math.min(1, q)));
  const phi = Math.atan2(dx, dy);
  const at = cos((a * a + d * d - f * f) / (2 * a * d));
  const el = Math.PI - cos((a * a + f * f - d * d) / (2 * a * f));
  return !low || Math.cos(phi - at) >= Math.cos(phi + at) ? { sh: phi - at, el } : { sh: phi + at, el: -el };
}

// A swing `k` of the way from hanging at rest (see HANG in ./acts.ts) to
// `to`: for one-shot acts, which start and end at rest.
export const toward = (k: number, to: Swing): Swing => ({ sh: HANG.sh + (to.sh - HANG.sh) * k, el: HANG.el + (to.el - HANG.el) * k });

// The turn, in arm k's forearm frame, that stands what its hand holds
// back upright in the room, whatever the arm and the lean.
export const upright = (p: Puppet, k: 0 | 1): Mat => turn(p.arms[k].sh + p.arms[k].el - p.lean);

// Draws `fn` at arm k's hand, `f` down its forearm (from inside its fore
// part), turned so that its +y runs at angle `a` in the body's frame (0
// straight down, + toward where the local faces). By default `a` is the
// lean, which stands it upright in the room, as the puppet holds out what
// a local serves.
export function atHand(sk: Sketch, p: Puppet, k: 0 | 1, f: number, fn: () => void, a = p.lean): void {
  sk.at(mul(move(0, f), turn(p.arms[k].sh + p.arms[k].el - a)), fn);
}

// Draws `fn` turned back upright on screen from whatever frame the sketch
// is in, by its turn so far (a stream from the spout of a tipped pot).
export function level(sk: Sketch, fn: () => void): void {
  const m = sk.m;
  sk.at(turn(-Math.atan2(m[1], m[0])), fn);
}

// Point (x, y) of the body's frame as seen from arm k's hand, upright (in
// the frame atHand draws in by default).
export function fromHand(b: Bones, p: Puppet, k: 0 | 1, x: number, y: number): [number, number] {
  const [hx, hy] = handOf(b, p, k);
  const [dx, dy] = [x - hx, y - hy];
  return [Math.cos(p.lean) * dx - Math.sin(p.lean) * dy, Math.sin(p.lean) * dx + Math.cos(p.lean) * dy];
}

// The inverse of a sketch frame (the puppet's are turns and moves).
export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

// Draws `fn` in the local's own frame (its feet at the origin, upright,
// unleaned), from inside any part.
export const inFrame = (sk: Sketch, fn: () => void): void => sk.at(invert(sk.m), fn);

// A point p of a station's frame (u, v, z, as PropView) in the frame of a
// local standing at (`at.u`, `at.v`) in it, its frame lifted `at.z` (a
// seat), looking along it (+u): a step along u is a unit across the
// screen and half a unit down; a step out (+v) a unit back and half down.
export function seen(at: { u: number; v: number; z?: number }, p: P3): [number, number] {
  const du = p[0] - at.u;
  const dv = p[1] - at.v;
  return [du - dv, (du + dv) / 2 - (p[2] - (at.z ?? 0))];
}
