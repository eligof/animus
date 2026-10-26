import { Canvas } from '../canvas.ts';
import type { Bitmap, Color, Pen } from '../types.ts';
import { alpha, mix, path, shade } from '../iso.ts';
import { drawHead, hairBehind, star } from './head.ts';
import type { Costume } from '../../world/character.ts';
import { CLOAK, CLOAK_D, GOLD, IRON, LEATHER, RAG, RAG_D, SLATE, WHITE, type Look } from './look.ts';
import { CLOTHES, STARTUP } from './look.ts';
import { apply, move, mul, turn, type Ctx, type Mat, type Sketch } from './paint.ts';
import { drawProp } from './props.ts';
import { FORE, HEAD_UP, HIP, NECK, SH, SHIN, THIGH, UPPER, type Prop, type Rig, type V } from './rig.ts';

// A whole figure from its rig: legs, the costume, arms, head and what is
// held, each recorded in its own frame and ordered back to front for the
// view (from the front arm and leg A are near; from behind, B).

const TAU = Math.PI * 2;
// Lying on its back, head to screen-left: the standing frame turned a
// quarter (its front up), the body centred over the anchor.
const LIE: Mat = mul(move(6.9, -2.75), turn(-Math.PI / 2 + 0.04));

export type View = { back: boolean; item: Color | null; frame: number; bandaged?: boolean };

// Two-bone IK from s toward t: the joint, and the end (pulled in when out
// of reach). bend +1 bends the joint clockwise of the line on screen.
export function ik(s: V, t: V, a: number, b: number, bend: number): [V, V] {
  const dx = t[0] - s[0];
  const dy = t[1] - s[1];
  let d = Math.hypot(dx, dy);
  const max = (a + b) * 0.999;
  const min = Math.abs(a - b) + 1e-3;
  const ux = d > 1e-9 ? dx / d : 0;
  const uy = d > 1e-9 ? dy / d : 1;
  d = Math.max(min, Math.min(max, d));
  const end: V = [s[0] + ux * d, s[1] + uy * d];
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const al = Math.acos(Math.max(-1, Math.min(1, cos))) * bend;
  const ang = Math.atan2(uy, ux) + al;
  return [[s[0] + a * Math.cos(ang), s[1] + a * Math.sin(ang)], end];
}

const lerp = (p: V, q: V, k: number): V => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
// The unit normal to the line from p to q.
function norm(p: V, q: V): V {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const l = Math.hypot(dx, dy) || 1;
  return [-dy / l, dx / l];
}

// The game worlds' costumes wear boots.
const BOOTS: ReadonlySet<Costume> = new Set(['drifter', 'nord', 'exosuit', 'jumpsuit', 'colonist']);
// An exosuit's chest lamp and its glow.
const LAMP = '#47e0f0';
// A nord's belt and its boots' straps, the leather flap hanging from it.
const BELT_LEATHER = '#3e2c20';
const FLAP = '#6b4a32';
// A duster's lining, the belt under it and its buckle, a shirt's buttons.
const LINING = '#4a3f35';
const DUSTER_BELT = '#3b2f27';
const BRASS = '#b8995e';
const BUTTON = '#8c7f6a';

type ArmRig = { s: V; e: V; h: V; k: 0 | 1 };
type LegRig = { hip: V; kn: V; ft: V; ang: number };

export function buildFigure(sk: Sketch, r: Rig, L: Look, v: View): void {
  const back = v.back;
  const ghost = L.sp === 'ghost';
  const root: Mat = r.mode === 'lie' ? LIE : move(r.shake, ghost ? -r.hover : 0);
  sk.push(root);
  const B = mul(move(r.pelvis[0], r.pelvis[1]), turn(r.lean));
  const arms: ArmRig[] = ([0, 1] as const).map((k) => {
    const s: V = [SH[k][0], SH[k][1] - r.chest];
    const [e, h] = ik(s, r.arms[k].hand, UPPER, FORE, r.arms[k].bend);
    return { s, e, h, k };
  });
  const legs: LegRig[] = ([0, 1] as const).map((k) => {
    const hip = apply(B, HIP[k][0], HIP[k][1]);
    const g = r.legs[k];
    const [kn, ft] = ik(hip, g.foot, THIGH, SHIN, g.bend);
    return { hip, kn, ft, ang: g.ang };
  });
  const H = mul(B, mul(move(NECK[0], NECK[1] - r.chest), mul(turn(r.tilt), move(0.1, -HEAD_UP))));
  const top = -4.75 - r.chest;
  // the skirt's hem (robes, coats, sheets), in the body frame: about the
  // floor (a robe), the knee (a coat), floating (a ghost)
  const floorY = -r.pelvis[1];

  // ★10: the aura's twinkles (its glow goes under everything, see auraGlow)
  if (L.aura) twinkles(sk, r.t);

  const parts: Array<[number, () => void]> = [];
  const add = (z: number, fn: () => void, frame: Mat = B) => parts.push([z, () => sk.at(frame, fn)]);

  // ---- arms
  for (const a of arms) {
    const arm = r.arms[a.k];
    const near = back ? a.k === 1 : a.k === 0;
    let z: number;
    if (back) z = arm.fwd ? 0.5 : near ? 8 : 1;
    else if (near) z = 8;
    else z = arm.high ? 8.5 : arm.fwd ? 6 : 1;
    add(z, () => drawArm(sk, L, a, arm.grip));
  }

  // ---- legs, hips and skirts
  const sitting = r.mode !== 'stand';
  if (!ghost) {
    for (const k of [0, 1] as const) {
      const near = back ? k === 1 : k === 0;
      add(near ? 3 : 2, () => drawLeg(sk, L, legs[k], back, sitting), ID_ROOT);
    }
  }
  add(4, () => hips(sk, L, r, floorY, back, sitting));

  // ---- torso and what hangs on it
  add(5, () => torso(sk, L, top, back, r, floorY));
  if (L.badge && !back) add(5.2, () => badge(sk, top));
  if (L.costume === 'astronaut') add(back ? 6 : 0, () => pack(sk, L, top, back));
  if (L.costume === 'astronaut') add(6.9, () => sk.blob((p) => p.ellipse(0.15, top - 0.02, 2.45, 0.72, 0, 0, TAU), '#c3cad6', { dark: '#9aa3b2', d: 0.2 }));
  if ((L.costume === 'hacker' || L.costume === 'startup') && !L.hoodUp) add(back ? 6 : 0, () => hoodDown(sk, L, top, back));
  if (L.costume === 'drifter') {
    add(6.9, () => scarf(sk, L, top, back));
    if (!ghost) add(6.95, () => collar(sk, L, top, back));
  }
  if (L.costume === 'nord') {
    add(back ? 5.8 : 0, () => cloak(sk, r, top, floorY, back, sitting, ghost));
    add(6.9, () => mantle(sk, L, top, back));
  }
  if (L.costume === 'exosuit' && !back) add(5.3, () => chestGlow(sk, top));
  if (L.sp === 'cat' && L.costume !== 'demon') add(back ? 6 : 0, () => tail(sk, L, r.t));
  dressedForSetting(sk, add, L, r, top, back);

  // ---- head
  add(back ? 6 : 0, () => hairBehind(sk, L, { back, t: r.t, carry: false, frame: v.frame }), H);
  add(7, () => drawHead(sk, L, r.face, { back, t: r.t, carry: hasBlockOnHead(r), frame: v.frame, bandaged: v.bandaged }), H);

  // ---- props
  for (const pr of r.props) {
    const at: V = pr.hand >= 0 ? [arms[pr.hand].h[0] + pr.x, arms[pr.hand].h[1] + pr.y] : [pr.x, pr.y];
    add(propZ(pr, back), () => drawProp(sk, pr, at, L, v.item));
  }

  parts.sort((a, b) => a[0] - b[0]);
  for (const [, fn] of parts) fn();
  sk.pop();
}

const ID_ROOT: Mat = [1, 0, 0, 1, 0, 0];

const hasBlockOnHead = (r: Rig) => r.props.some((p) => p.kind === 'block' && !p.fwd);

function propZ(pr: Prop, back: boolean): number {
  switch (pr.kind) {
    case 'book':
    case 'notepad':
      return back ? 0.2 : 5.5;
    case 'tablet':
      return back ? 0.2 : 8.7;
    case 'thought':
    case 'sweat':
    case 'spark':
      return 9;
    case 'block':
      return pr.fwd ? (back ? 0.2 : 9) : 9;
    case 'mallet':
      return pr.fwd ? (back ? 0.2 : 9) : back ? 9 : 6.8;
    default:
      return back ? 0.2 : 9;
  }
}

// ---- legs -------------------------------------------------------------------

function shoe(len: number) {
  return (p: Pen) => {
    const h = -0.62;
    p.moveTo(h, 0.62);
    p.lineTo(len - 0.4, 0.62);
    p.quadraticCurveTo(len + 0.12, 0.62, len + 0.1, 0.12);
    p.quadraticCurveTo(len + 0.02, -0.45, len - 0.55, -0.45);
    p.lineTo(h + 0.3, -0.45);
    p.quadraticCurveTo(h - 0.12, -0.45, h - 0.12, 0.1);
    p.quadraticCurveTo(h - 0.12, 0.62, h, 0.62);
    p.closePath();
  };
}

function drawLeg(sk: Sketch, L: Look, g: LegRig, back: boolean, sitting: boolean): void {
  const w = L.costume === 'astronaut' ? 1.8 : 1.5;
  const robe = L.costume === 'wizard' || L.costume === 'demon';
  const c = robe && sitting ? L.top : L.legs;
  const cd = robe && sitting ? L.topD : L.legsD;
  if (L.costume === 'drifter') {
    // baggy trousers, bloused over the boots
    const b = lerp(g.kn, g.ft, 0.45);
    sk.limb([g.hip[0], g.hip[1], g.kn[0], g.kn[1], b[0], b[1]], 1.8, c, { dark: cd });
  } else sk.limb([g.hip[0], g.hip[1], g.kn[0], g.kn[1], g.ft[0], g.ft[1]], robe && sitting ? 1.85 : w, c, { dark: cd });
  if (BOOTS.has(L.costume)) {
    // a boot up the shin: a nord's taller, fur-topped and cross-strapped; an
    // exosuit's in the suit's colour, its toe in the second colour, a knee
    // pad over it; a jumpsuit's legs cuffed over its boots
    const nord = L.costume === 'nord';
    const exo = L.costume === 'exosuit';
    const b0 = lerp(g.kn, g.ft, nord ? 0.2 : 0.42);
    sk.limb([b0[0], b0[1], g.ft[0], g.ft[1]], L.costume === 'drifter' ? 1.5 : w + 0.12, exo ? L.legs : L.shoe, { dark: exo ? L.legsD : L.shoeD });
    if (nord) {
      const s0 = lerp(g.kn, g.ft, 0.42);
      const s1 = lerp(g.kn, g.ft, 0.86);
      sk.draw((p, k) => {
        // two straps crossed up the shaft
        const h = (w + 0.12) / 2;
        const [nx, ny] = norm(g.kn, g.ft);
        p.beginPath();
        p.moveTo(s0[0] - nx * h, s0[1] - ny * h);
        p.lineTo(s1[0] + nx * h, s1[1] + ny * h);
        p.moveTo(s0[0] + nx * h, s0[1] + ny * h);
        p.lineTo(s1[0] - nx * h, s1[1] - ny * h);
        p.lineCap = 'butt';
        p.strokeStyle = k.ink;
        p.lineWidth = 0.32 + k.line;
        p.stroke();
        p.strokeStyle = BELT_LEATHER;
        p.lineWidth = 0.32;
        p.stroke();
      });
      sk.limb([b0[0], b0[1] - 0.15, b0[0], b0[1] + 0.15], w + 0.55, L.accent, { dark: L.accentD });
    }
    if (L.costume === 'jumpsuit') {
      const t0 = lerp(g.kn, g.ft, 0.38);
      const t1 = lerp(g.kn, g.ft, 0.5);
      sk.limb([t0[0], t0[1], t1[0], t1[1]], w + 0.3, L.legs, { dark: L.legsD });
    }
    if (exo) sk.blob((p) => p.arc(g.kn[0] + 0.12, g.kn[1], 0.58, 0, TAU), L.accent, { dark: L.accentD, d: 0.15 });
  }
  if (L.costume === 'raver' && !back) {
    // a neon stripe down the leggings
    sk.draw((p, k) => {
      p.beginPath();
      p.moveTo(g.hip[0] + 0.35, g.hip[1] + 0.3);
      p.lineTo(g.kn[0] + 0.4, g.kn[1]);
      p.lineTo(g.ft[0] + 0.35, g.ft[1] - 0.3);
      p.strokeStyle = L.color;
      p.lineWidth = Math.max(0.22, 0.9 / k.px);
      p.lineCap = 'round';
      p.lineJoin = 'round';
      p.stroke();
    });
  }
  settingLeg(sk, L, g, back, w);
  if (L.costume === 'startup') {
    // jeans with their hems turned up over the sneakers
    const h0 = lerp(g.kn, g.ft, 0.74);
    const h1 = lerp(g.kn, g.ft, 0.88);
    sk.limb([h0[0], h0[1], h1[0], h1[1]], w + 0.3, shade(L.legs, 0.22), { dark: L.legs, line: 0.6 });
  }
  const big = L.costume === 'astronaut' ? 1.18 : L.costume === 'raver' ? 1.1 : 1;
  sk.at(mul(move(g.ft[0], g.ft[1]), mul(turn(g.ang), [big, 0, 0, big, 0, 0])), () => {
    const s = shoe(back ? 0.55 : 1.1);
    sk.blob(s, L.shoe, { dark: L.shoeD, d: 0.25 });
    sk.draw((p) => {
      p.save();
      p.beginPath();
      s(p);
      p.clip();
      p.fillStyle = L.sole;
      p.fillRect(-1, 0.3, 3, 0.5);
      // a sneaker's heel tab in its colour
      if (L.costume === 'startup') {
        p.fillStyle = L.color;
        p.fillRect(-0.85, -0.45, 0.42, 0.72);
      }
      p.restore();
    });
  });
  settingFoot(sk, L, g, back);
}

// The seat of the trousers, or the skirt of a robe, coat or sheet.
function hips(sk: Sketch, L: Look, r: Rig, floorY: number, back: boolean, sitting: boolean): void {
  const cx = 0.1;
  if (L.sp === 'ghost') return;
  if (settingHips(sk, L, r, floorY, back, sitting)) return;
  if (L.costume === 'wizard' && !sitting) {
    const hem = Math.min(floorY - 0.7, 3.3);
    const sw = r.sway * 0.3;
    const robe = (p: Pen) => path(p, [[cx - 2.15, -1.2], [cx + 2.2, -1.2], [cx + 2.85 + sw, hem], [cx - 2.75 + sw, hem]], 0.55);
    sk.blob(robe, L.top, { dark: L.topD, d: 0.7 });
    sk.draw((p) => {
      p.save();
      p.beginPath();
      robe(p);
      p.clip();
      p.fillStyle = L.trim;
      p.fillRect(cx - 4, hem - 0.6, 8, 0.6);
      if (!back) {
        p.fillStyle = shade(L.top, -0.1);
        p.beginPath();
        p.moveTo(cx + 0.6, -1.2);
        p.lineTo(cx + 1.2 + sw, hem - 0.6);
        p.lineTo(cx + 0.2 + sw, hem - 0.6);
        p.closePath();
        p.fill();
      }
      p.restore();
    });
    return;
  }
  if (L.costume === 'scientist') {
    // a lab coat to the knee
    const hem = sitting ? 0.9 : Math.min(floorY - 1.4, 1.95);
    const coat = (p: Pen) => path(p, [[cx - 2.15, -1.5], [cx + 2.25, -1.5], [cx + 2.55, hem], [cx - 2.45, hem]], 0.45);
    sk.blob((p) => p.roundRect(-2.0, -0.8, 4.25, 1.4, 0.6), L.legs, { dark: L.legsD, d: 0.3 });
    sk.blob(coat, L.top, { dark: L.topD, d: 0.6 });
    sk.draw((p, k) => {
      p.strokeStyle = k.ink;
      p.lineWidth = k.line;
      p.lineCap = 'round';
      p.beginPath();
      if (back) {
        p.moveTo(cx - 0.4, -0.2);
        p.lineTo(cx - 0.4, hem);
      } else {
        p.moveTo(cx + 0.6, -1.4);
        p.lineTo(cx + 0.7, hem);
      }
      p.stroke();
    });
    return;
  }
  if (L.costume === 'drifter') {
    // the rawhide coat's skirt to the knee, wrapped shut over the legs and
    // split up the front from the hem (a vent behind)
    const hem = sitting ? 1.2 : Math.min(floorY - 0.8, 2.65);
    const sw = r.sway * 0.2;
    const xs = cx + 0.65;
    const split = sitting ? hem - 0.4 : 0.85;
    const coat = (p: Pen) =>
      back
        ? path(p, [[cx - 2.15, -1.5], [cx + 2.25, -1.5], [cx + 2.6 + sw, hem], [cx - 2.5 + sw, hem]], 0.45)
        : path(p, [[cx - 2.15, -1.5], [cx + 2.25, -1.5], [cx + 2.6 + sw, hem], [xs + 0.55 + sw, hem], [xs + 0.05, split], [xs - 0.35 + sw, hem], [cx - 2.5 + sw, hem]], 0.3);
    sk.blob((p) => p.roundRect(-2.0, -0.8, 4.25, 1.4, 0.6), L.legs, { dark: L.legsD, d: 0.3 });
    sk.blob(coat, L.top, { dark: L.topD, d: 0.6 });
    sk.draw((p, k) => {
      p.strokeStyle = k.ink;
      p.lineWidth = k.line * 0.8;
      p.lineCap = 'round';
      p.beginPath();
      if (back) {
        p.moveTo(cx - 0.4, 0.6);
        p.lineTo(cx - 0.4 + sw, hem);
      } else {
        // the wrap's edge, down to the split
        p.moveTo(xs + 0.1, -1.4);
        p.quadraticCurveTo(xs + 0.12, split - 0.6, xs + 0.05, split);
      }
      p.stroke();
    });
    return;
  }
  if (L.costume === 'nord') {
    // the tunic's skirt to mid-thigh over the trousers, a leather flap
    // hanging from the belt in front
    const hem = sitting ? 0.55 : 1.1;
    const sw = r.sway * 0.15;
    sk.blob((p) => p.roundRect(-2.0, -0.8, 4.25, 1.4, 0.6), L.legs, { dark: L.legsD, d: 0.3 });
    sk.blob((p) => path(p, [[cx - 2.2, -1.4], [cx + 2.3, -1.4], [cx + 2.6 + sw, hem], [cx - 2.5 + sw, hem]], 0.45), L.top, { dark: L.topD, d: 0.5 });
    if (!back) {
      const xs = cx + 0.55;
      const end = sitting ? 1.0 : Math.min(floorY - 0.95, 2.5);
      const fw = sw * 1.6;
      sk.blob((p) => path(p, [[xs - 0.7, -0.6], [xs + 0.72, -0.6], [xs + 0.62 + fw, end - 0.3], [xs + 0.02 + fw, end], [xs - 0.6 + fw, end - 0.3]], 0.22), FLAP, { dark: shade(FLAP, -0.2), d: 0.25 });
    }
    return;
  }
  if (L.costume === 'colonist') {
    // a duster to the knee, open down the front over the trousers, its dark
    // lining showing along its fronts (a vent behind)
    const hem = sitting ? 1.15 : Math.min(floorY - 0.8, 2.6);
    const sw = r.sway * 0.25;
    sk.blob((p) => p.roundRect(-2.0, -0.8, 4.25, 1.4, 0.6), L.legs, { dark: L.legsD, d: 0.3 });
    if (back) {
      sk.blob((p) => path(p, [[cx - 2.15, -1.5], [cx + 2.25, -1.5], [cx + 2.65 + sw, hem], [cx - 2.55 + sw, hem]], 0.45), L.top, { dark: L.topD, d: 0.6 });
      sk.draw((p, k) => {
        p.beginPath();
        p.moveTo(cx - 0.4, 0.5);
        p.lineTo(cx - 0.4 + sw, hem);
        p.strokeStyle = k.ink;
        p.lineWidth = k.line * 0.8;
        p.lineCap = 'round';
        p.stroke();
      });
      return;
    }
    const xs = cx + 0.6;
    const flare = sitting ? 0.2 : 0.42;
    const panels: Array<[Array<[number, number]>, Array<[number, number]>]> = [
      [
        [[cx - 2.15, -1.5], [xs - 0.45, -1.5], [xs - 0.45 - flare + sw, hem], [cx - 2.55 + sw, hem]],
        [[xs - 0.45, -0.9], [xs - 0.45 - flare + sw, hem], [xs - 0.95 - flare + sw, hem]],
      ],
      [
        [[xs + 0.45, -1.5], [cx + 2.25, -1.5], [cx + 2.65 + sw, hem], [xs + 0.45 + flare + sw, hem]],
        [[xs + 0.45, -0.9], [xs + 0.45 + flare + sw, hem], [xs + 0.95 + flare + sw, hem]],
      ],
    ];
    for (const [panel, lining] of panels) {
      const shape = (p: Pen) => path(p, panel, 0.3);
      sk.blob(shape, L.top, { dark: L.topD, d: 0.55 });
      sk.draw((p, k) => {
        p.save();
        p.beginPath();
        shape(p);
        p.clip();
        p.beginPath();
        path(p, lining);
        p.fillStyle = LINING;
        p.fill();
        p.strokeStyle = k.ink;
        p.lineWidth = k.line * 0.7;
        p.stroke();
        p.restore();
      });
    }
    return;
  }
  sk.blob((p) => p.roundRect(-2.0, -0.8, 4.25, 1.4, 0.6), L.legs, { dark: L.legsD, d: 0.3 });
}

// ---- torso ------------------------------------------------------------------

// ★3: a gold star badge pinned on the chest.
function badge(sk: Sketch, top: number): void {
  const x = 1.45;
  const y = top + 1.35;
  sk.blob((p) => p.arc(x, y, 0.62, 0, TAU), GOLD, { dark: shade(GOLD, -0.22), d: 0.16, line: 0.6, sil: false });
  sk.draw((p) => star(p, x - 0.02, y + 0.02, 0.4, '#fff8dc'));
}

// ★10: a soft glow in its own colour round it, and a twinkle or two. The
// glow is a gradient over most of the sprite, the dearest thing a figure
// draws: it is painted once a scale and colour, a picture laid under the
// figure (its centre and picture here, in the root frame's units; a
// sleeper's lies along the floor with it).
const AURA = { x: 0.1, y: -6.6, rx: 6.0, ry: 8.4 };
const glows = new Map<string, Canvas>();

export function auraGlow(r: Rig, L: Look, s: number): { img: Bitmap; x: number; y: number } {
  const lie = r.mode === 'lie';
  const [x, y] = lie ? apply(LIE, AURA.x, AURA.y) : [AURA.x + r.shake, AURA.y - (L.sp === 'ghost' ? r.hover : 0)];
  const key = `${s}|${L.color}|${lie ? 1 : 0}`;
  let img = glows.get(key);
  if (!img) {
    const [rx, ry] = lie ? [AURA.ry, AURA.rx] : [AURA.rx, AURA.ry];
    img = new Canvas(Math.ceil(2 * rx * s) + 2, Math.ceil(2 * ry * s) + 2);
    img.setTransform(s, 0, 0, s, img.width / 2, img.height / 2);
    const g = img.createRadialGradient(0, 0, 0.5, 0, 0, AURA.ry);
    g.addColorStop(0, alpha(L.color, 0.38));
    g.addColorStop(0.55, alpha(L.color, 0.18));
    g.addColorStop(1, alpha(L.color, 0));
    img.beginPath();
    img.ellipse(0, 0, rx, ry, 0, 0, TAU);
    img.fillStyle = g;
    img.fill();
    if (glows.size >= 32) glows.delete(glows.keys().next().value!);
    glows.set(key, img);
  }
  return { img, x, y };
}

function twinkles(sk: Sketch, t: number): void {
  sk.draw((p) => {
    for (const [x, y, ph] of [[-4.3, -11.2, 0], [4.2, -4.4, 2.1], [3.6, -12.6, 4.2]]) {
      const k = 0.5 + 0.5 * Math.sin(t * 5 + ph);
      const r = 0.35 + 0.35 * k;
      p.beginPath();
      p.moveTo(x, y - r * 2);
      p.quadraticCurveTo(x, y, x + r, y);
      p.quadraticCurveTo(x, y, x, y + r * 2);
      p.quadraticCurveTo(x, y, x - r, y);
      p.quadraticCurveTo(x, y, x, y - r * 2);
      p.closePath();
      p.fillStyle = alpha(WHITE, 0.55 + 0.4 * k);
      p.fill();
    }
  });
}

function torso(sk: Sketch, L: Look, top: number, back: boolean, r: Rig, floorY: number): void {
  const cx = 0.1;
  const xF = back ? cx - 0.45 : cx + 0.55;
  if (L.sp === 'ghost') {
    ghostSheet(sk, L, top, r, back, Math.min(2.35, floorY - 0.9));
    return;
  }
  const astro = L.costume === 'astronaut';
  const wt = astro ? 2.15 : 1.95;
  const wb = astro ? 2.4 : 2.2;
  const bot = L.costume === 'wizard' ? 0.1 : 0.35;
  const shape = (p: Pen) => path(p, [[cx - wt, top], [cx + wt, top], [cx + wb, bot], [cx - wb, bot]], 1.0);
  sk.blob(shape, L.top, { dark: L.topD, d: 0.65 });
  sk.draw((p, k) => {
    p.save();
    p.beginPath();
    shape(p);
    p.clip();
    dress(p, k.ink, k.line, k.px, L, top, bot, xF, back);
    // the head's shadow on the shoulders
    p.beginPath();
    p.ellipse(back ? -0.1 : 0.4, top - 0.3, 2.2, 0.95, 0, 0, TAU);
    p.fillStyle = alpha('#1a1030', 0.17);
    p.fill();
    p.restore();
  });
}

// Costume and print details over the torso (clipped to it).
function dress(p: Pen, ink: Color, line: number, px: number, L: Look, top: number, bot: number, xF: number, back: boolean): void {
  p.lineCap = 'round';
  p.lineJoin = 'round';
  const stroke = (w = line) => {
    p.strokeStyle = ink;
    p.lineWidth = w;
    p.stroke();
  };
  switch (L.costume) {
    case 'miner':
    case 'forager':
    case 'parka':
    case 'guard':
    case 'demon':
      settingDress(p, ink, line, L, top, xF, back);
      return;
    case 'scientist':
      if (back) {
        p.fillStyle = shade(L.top, -0.08);
        p.fillRect(xF - 0.9, -0.85, 1.8, 0.35);
        p.beginPath();
        p.rect(xF - 0.9, -0.85, 1.8, 0.35);
        stroke(line * 0.8);
        return;
      }
      // the shirt and tie in the coat's open front, lapels, a pocket and pen
      p.beginPath();
      p.moveTo(xF - 0.95, top - 0.2);
      p.lineTo(xF + 0.95, top - 0.2);
      p.lineTo(xF + 0.05, top + 2.35);
      p.closePath();
      p.fillStyle = L.under;
      p.fill();
      stroke();
      p.beginPath();
      p.moveTo(xF - 0.12, top + 0.35);
      p.lineTo(xF + 0.22, top + 0.35);
      p.lineTo(xF + 0.2, top + 1.55);
      p.lineTo(xF + 0.04, top + 1.85);
      p.lineTo(xF - 0.12, top + 1.55);
      p.closePath();
      p.fillStyle = L.trimD;
      p.fill();
      p.beginPath();
      p.moveTo(xF + 0.05, top + 2.35);
      p.lineTo(xF + 0.15, bot + 1);
      stroke();
      p.beginPath();
      p.roundRect(xF - 1.95, top + 1.45, 0.95, 0.85, 0.15);
      stroke(line * 0.8);
      p.fillStyle = L.color;
      p.fillRect(xF - 1.75, top + 1.05, 0.22, 0.6);
      return;
    case 'hacker':
      if (back) return;
      p.beginPath();
      p.roundRect(xF - 1.35, -1.75, 2.6, 1.35, 0.5);
      p.fillStyle = shade(L.top, -0.12);
      p.fill();
      stroke(line * 0.9);
      p.strokeStyle = '#e8e6ee';
      p.lineWidth = Math.max(0.2, 1 / px);
      p.beginPath();
      p.moveTo(xF - 0.45, top + 0.35);
      p.lineTo(xF - 0.55, top + 1.6);
      p.moveTo(xF + 0.45, top + 0.35);
      p.lineTo(xF + 0.5, top + 1.55);
      p.stroke();
      if (L.pattern === '║') {
        p.beginPath();
        p.moveTo(xF, top);
        p.lineTo(xF, -1.75);
        stroke(line * 0.8);
      }
      return;
    case 'astronaut':
      if (back) return;
      p.beginPath();
      p.roundRect(xF - 1.05, top + 1.05, 2.05, 1.4, 0.35);
      p.fillStyle = L.color;
      p.fill();
      stroke(line * 0.9);
      for (const [dx, c] of [[-0.55, '#ff5d5d'], [0, '#ffd166'], [0.55, '#5dffb0']] as const) {
        p.beginPath();
        p.arc(xF + dx, top + 1.75, 0.2, 0, TAU);
        p.fillStyle = c;
        p.fill();
      }
      p.fillStyle = '#9aa4b4';
      p.fillRect(xF - 4, -0.45, 8, 0.5);
      p.beginPath();
      p.moveTo(-4, -0.45);
      p.lineTo(4, -0.45);
      stroke(line * 0.8);
      return;
    case 'drifter': {
      // the coat wrapped shut, its edge crossing over to the far side (a
      // seam down the back), two straps round the chest and one slanting
      // round the waist
      p.beginPath();
      if (back) {
        p.moveTo(xF, top + 0.7);
        p.lineTo(xF, bot + 0.5);
      } else {
        p.moveTo(xF - 0.7, top - 0.2);
        p.quadraticCurveTo(xF + 0.2, top + 1.4, xF + 0.1, bot + 0.5);
      }
      stroke(line * 0.8);
      const s = back ? -1 : 1;
      for (const [y, h, k] of [[top + 1.6, 0.48, 0.05], [top + 2.6, 0.48, -0.06], [-0.75, 0.55, -0.17]] as const) strap(p, ink, line, y, h, k * s);
      return;
    }
    case 'nord':
      // a wide leather belt and a big round iron buckle (no emblem)
      p.fillStyle = BELT_LEATHER;
      p.fillRect(-4, -1.05, 8, 1.0);
      p.beginPath();
      p.moveTo(-4, -1.05);
      p.lineTo(4, -1.05);
      p.moveTo(-4, -0.05);
      p.lineTo(4, -0.05);
      stroke(line * 0.8);
      if (back) return;
      p.beginPath();
      p.arc(xF, -0.55, 0.7, 0, TAU);
      p.fillStyle = IRON;
      p.fill();
      stroke(line * 0.8);
      p.beginPath();
      p.arc(xF, -0.55, 0.3, 0, TAU);
      p.fillStyle = BELT_LEATHER;
      p.fill();
      stroke(line * 0.6);
      p.beginPath();
      p.moveTo(xF - 0.3, -0.55);
      p.lineTo(xF + 0.42, -0.55);
      stroke(line * 1.1);
      return;
    case 'exosuit':
      // a harness of two slate straps over the shoulders and down to the
      // belt (none on a ghost's back: on the white, crossed by the belt,
      // straps read as a cross); a chest plate in its second colour on
      // them in front, a plain round lamp in the plate
      if (!(back && L.sp === 'ghost')) {
        for (const dx of back ? [-0.8, 0.8] : [-1.1, 1.05]) {
          p.fillStyle = SLATE;
          p.fillRect(xF + dx - 0.21, top - 0.5, 0.42, BELT.top - top + 0.5);
          p.beginPath();
          for (const e of [-0.21, 0.21]) {
            p.moveTo(xF + dx + e, top - 0.5);
            p.lineTo(xF + dx + e, BELT.top);
          }
          stroke(line * 0.7);
        }
      }
      if (!back) {
        p.beginPath();
        p.moveTo(xF - 1.4, top + 0.2);
        p.quadraticCurveTo(xF, top + 0.7, xF + 1.35, top + 0.2);
        p.lineTo(xF + 1.25, top + 1.95);
        p.quadraticCurveTo(xF + 1.2, top + 2.65, xF, top + 2.7);
        p.quadraticCurveTo(xF - 1.25, top + 2.65, xF - 1.3, top + 1.95);
        p.closePath();
        p.fillStyle = L.accent;
        p.fill();
        stroke(line * 0.9);
        p.beginPath();
        p.arc(xF, top + 1.6, 0.42, 0, TAU);
        p.fillStyle = LAMP;
        p.fill();
        stroke(line * 0.8);
        p.beginPath();
        p.arc(xF - 0.12, top + 1.47, 0.13, 0, TAU);
        p.fillStyle = WHITE;
        p.fill();
      }
      belt(p, ink, line, SLATE, back ? null : L.accent, xF);
      return;
    case 'jumpsuit':
      // a wide orange placket from the collar to the belt, a zip down its
      // middle; an orange collar and belt, a small dark buckle (no number,
      // no logo)
      if (!back) {
        p.fillStyle = L.accent;
        p.fillRect(xF - 0.65, top - 0.5, 1.3, BELT.top - top + 0.5);
        p.beginPath();
        for (const dx of [-0.65, 0.65]) {
          p.moveTo(xF + dx, top - 0.5);
          p.lineTo(xF + dx, BELT.top);
        }
        stroke(line * 0.8);
        p.beginPath();
        p.moveTo(xF, top + 0.35);
        p.lineTo(xF, BELT.top);
        p.strokeStyle = alpha(ink, 0.55);
        p.lineWidth = line * 0.6;
        p.stroke();
        p.fillStyle = L.accentD;
        p.fillRect(xF - 0.12, top + 0.3, 0.24, 0.42);
      }
      p.beginPath();
      p.ellipse(back ? -0.1 : 0.15, top - 0.05, 1.75, 0.62, 0, 0, Math.PI);
      p.fillStyle = L.accent;
      p.fill();
      stroke(line * 0.8);
      belt(p, ink, line, L.accent, back ? null : '#3b3640', xF);
      return;
    case 'colonist': {
      // the duster open over a cream shirt (collar points, three dot
      // buttons, a plain belt across it), broad lapels; a yoke behind
      if (back) {
        p.beginPath();
        p.moveTo(-4, top + 1.3);
        p.quadraticCurveTo(xF, top + 1.6, 4, top + 1.3);
        stroke(line * 0.8);
        return;
      }
      const gap = (q: Pen) => path(q, [[xF - 0.95, top - 0.3], [xF + 0.95, top - 0.3], [xF + 0.55, bot + 0.5], [xF - 0.5, bot + 0.5]]);
      p.beginPath();
      gap(p);
      p.fillStyle = L.under;
      p.fill();
      p.save();
      p.clip();
      p.fillStyle = DUSTER_BELT;
      p.fillRect(xF - 2, BELT.top, 4, BELT.bot - BELT.top);
      p.beginPath();
      p.moveTo(xF - 2, BELT.top);
      p.lineTo(xF + 2, BELT.top);
      p.moveTo(xF - 2, BELT.bot);
      p.lineTo(xF + 2, BELT.bot);
      stroke(line * 0.7);
      p.beginPath();
      p.rect(xF - 0.3, -0.85, 0.62, 0.75);
      p.fillStyle = BRASS;
      p.fill();
      stroke(line * 0.7);
      p.restore();
      p.beginPath();
      gap(p);
      stroke();
      p.fillStyle = BUTTON;
      for (const y of [top + 1.45, top + 2.25, top + 3.05]) {
        p.beginPath();
        p.arc(xF + 0.03, y, 0.17, 0, TAU);
        p.fill();
      }
      // the shirt's collar points, then the lapels folded back over them
      for (const k of [-1, 1]) {
        p.beginPath();
        p.moveTo(xF + k * 0.05, top + 0.05);
        p.lineTo(xF + k * 0.8, top - 0.25);
        p.lineTo(xF + k * 0.55, top + 0.75);
        p.closePath();
        p.fillStyle = L.under;
        p.fill();
        stroke(line * 0.8);
      }
      p.fillStyle = L.sp === 'ghost' ? L.trim : shade(L.top, 0.1);
      for (const k of [-1, 1]) {
        p.beginPath();
        p.moveTo(xF + k * 0.95, top - 0.3);
        p.lineTo(xF + k * 2.05, top + 0.75);
        p.lineTo(xF + k * 1.45, top + 1.15);
        p.lineTo(xF + k * 0.72, top + 2.4);
        p.closePath();
        p.fill();
        stroke(line * 0.8);
      }
      return;
    }
    case 'startup':
      startupDress(p, ink, line, L, top, bot, xF, back);
      return;
    case 'raver':
      if (!back) {
        p.beginPath();
        p.ellipse(xF, top - 0.15, 0.95, 0.75, 0, 0, Math.PI);
        p.fillStyle = L.skin;
        p.fill();
        stroke(line * 0.9);
      }
      // a glowing belt
      p.fillStyle = alpha(L.color, 0.45);
      p.fillRect(-4, -0.75, 8, 0.85);
      p.fillStyle = mix(L.color, '#ffffff', 0.35);
      p.fillRect(-4, -0.55, 8, 0.4);
      break;
    case 'wizard':
      if (!back) {
        // a V collar in the trim
        p.beginPath();
        p.moveTo(xF - 1.0, top - 0.1);
        p.lineTo(xF + 0.05, top + 1.25);
        p.lineTo(xF + 1.0, top - 0.1);
        p.lineTo(xF + 0.55, top - 0.1);
        p.lineTo(xF + 0.05, top + 0.6);
        p.lineTo(xF - 0.55, top - 0.1);
        p.closePath();
        p.fillStyle = L.trim;
        p.fill();
        stroke(line * 0.8);
      }
      break;
  }
  print(p, ink, line, px, L, top, bot, xF, back);
}

// The `pattern` trait as a print on the shirt (stripes go all the way round;
// the rest show from the front).
function print(p: Pen, ink: Color, line: number, px: number, L: Look, top: number, bot: number, xF: number, back: boolean): void {
  const trim = L.trim;
  const stroke = (w = line) => {
    p.strokeStyle = ink;
    p.lineWidth = w;
    p.stroke();
  };
  switch (L.pattern) {
    case '▓':
      p.fillStyle = trim;
      for (const y of [top + 1.35, top + 2.6]) p.fillRect(-4, y, 8, 0.55);
      return;
    case '▒':
      if (back) return;
      p.fillStyle = trim;
      for (const [dx, dy] of [[-0.9, 1.3], [0.6, 0.9], [1.2, 2.4], [-0.3, 2.8], [-1.4, 3.6]] as const) {
        p.beginPath();
        if (L.costume === 'wizard') {
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU;
            const r = k % 2 ? 0.14 : 0.36;
            p.lineTo(xF + dx + r * Math.cos(a), top + dy + r * Math.sin(a));
          }
          p.closePath();
        } else p.arc(xF + dx, top + dy, 0.2, 0, TAU);
        p.fill();
      }
      return;
    case '▼':
      if (back || L.costume === 'wizard') return;
      p.beginPath();
      p.moveTo(xF - 0.8, top - 0.1);
      p.lineTo(xF + 0.05, top + 1.3);
      p.lineTo(xF + 0.85, top - 0.1);
      p.closePath();
      p.fillStyle = L.skin;
      p.fill();
      p.strokeStyle = trim;
      p.lineWidth = 0.32;
      p.stroke();
      return;
    case '◆':
      if (back) return;
      p.beginPath();
      p.moveTo(xF + 0.1, top + 1.05);
      p.lineTo(xF + 0.65, top + 1.75);
      p.lineTo(xF + 0.1, top + 2.45);
      p.lineTo(xF - 0.45, top + 1.75);
      p.closePath();
      p.fillStyle = trim;
      p.fill();
      stroke(line * 0.8);
      return;
    case '║':
      if (back || L.costume === 'hacker') return;
      p.beginPath();
      p.moveTo(xF, top);
      p.lineTo(xF + 0.05, bot);
      stroke(line * 0.9);
      p.beginPath();
      p.roundRect(xF - 0.16, top + 0.45, 0.36, 0.6, 0.1);
      p.fillStyle = trim;
      p.fill();
      return;
    case '╋':
      p.fillStyle = '#4a2f22';
      p.fillRect(-4, -0.7, 8, 0.6);
      if (back) return;
      p.beginPath();
      p.roundRect(xF - 0.35, -0.8, 0.7, 0.8, 0.12);
      p.fillStyle = '#ffd166';
      p.fill();
      stroke(line * 0.8);
      return;
    case '♥':
      if (back) return;
      p.beginPath();
      heart(p, xF + 0.05, top + 1.85, 0.62);
      p.fillStyle = trim;
      p.fill();
      stroke(line * 0.8);
      return;
  }
  void px;
}

// A startup's zip hoodie (clipped to the torso, or a ghost's sheet): a
// ribbed hem; from the front open over a white tee, a zip tape down each
// edge, two drawstrings and the slits of its pockets; from behind a seam
// under the hood. On a sheet only the zip and the drawstrings, in its
// colour.
function startupDress(p: Pen, ink: Color, line: number, L: Look, top: number, bot: number, xF: number, back: boolean): void {
  const stroke = (w = line) => {
    p.strokeStyle = ink;
    p.lineWidth = w;
    p.stroke();
  };
  const ghost = L.sp === 'ghost';
  const strings = (c: Color) => {
    for (const dx of [-0.42, 0.42]) {
      p.beginPath();
      p.moveTo(xF + dx, top + 0.35);
      p.lineTo(xF + dx * 1.15, top + 2.15);
      p.strokeStyle = ink;
      p.lineWidth = 0.3 + line;
      p.stroke();
      p.strokeStyle = c;
      p.lineWidth = 0.3;
      p.stroke();
      p.beginPath();
      p.arc(xF + dx * 1.15, top + 2.3, 0.2, 0, TAU);
      p.fillStyle = c;
      p.fill();
      stroke(line * 0.6);
    }
  };
  if (ghost) {
    if (back) return;
    p.beginPath();
    p.moveTo(xF, top + 0.3);
    p.lineTo(xF, bot + 1);
    stroke(line * 0.8);
    strings(L.trim);
    return;
  }
  // the ribbed hem
  p.fillStyle = shade(L.top, -0.12);
  p.fillRect(-4, bot - 0.65, 8, 0.65);
  p.beginPath();
  p.moveTo(-4, bot - 0.65);
  p.lineTo(4, bot - 0.65);
  stroke(line * 0.8);
  if (back) {
    p.beginPath();
    p.moveTo(xF, top + 2.4);
    p.lineTo(xF, bot - 0.65);
    p.strokeStyle = alpha(ink, 0.5);
    p.lineWidth = line * 0.7;
    p.stroke();
    return;
  }
  // the tee in the open front, between the zip tapes
  const gap = (q: Pen) => path(q, [[xF - 0.85, top - 0.4], [xF + 0.85, top - 0.4], [xF + 0.6, bot + 0.5], [xF - 0.55, bot + 0.5]]);
  p.beginPath();
  gap(p);
  p.fillStyle = L.under;
  p.fill();
  stroke();
  p.beginPath();
  p.moveTo(xF - 0.85, top - 0.4);
  p.lineTo(xF - 0.55, bot + 0.5);
  p.moveTo(xF + 0.85, top - 0.4);
  p.lineTo(xF + 0.6, bot + 0.5);
  p.strokeStyle = shade(L.top, -0.3);
  p.lineWidth = 0.22;
  p.stroke();
  // the tee's round neck
  p.beginPath();
  p.ellipse(xF, top - 0.2, 0.75, 0.5, 0, 0, Math.PI);
  stroke(line * 0.7);
  strings(STARTUP.string);
  // the pockets' slits
  p.beginPath();
  p.moveTo(xF - 1.15, -1.9);
  p.quadraticCurveTo(xF - 1.6, -1.35, xF - 1.45, -0.75);
  p.moveTo(xF + 1.15, -1.9);
  p.quadraticCurveTo(xF + 1.65, -1.35, xF + 1.5, -0.75);
  stroke(line * 0.8);
}

// A belt round the waist (clipped to the torso) and, from the front, its
// buckle: a plain square, no emblem. Its edges, in the body frame:
const BELT = { top: -0.8, bot: -0.15 };

function belt(p: Pen, ink: Color, line: number, color: Color, buckle: Color | null, xF: number): void {
  p.fillStyle = color;
  p.fillRect(-4, BELT.top, 8, BELT.bot - BELT.top);
  p.beginPath();
  p.moveTo(-4, BELT.top);
  p.lineTo(4, BELT.top);
  p.moveTo(-4, BELT.bot);
  p.lineTo(4, BELT.bot);
  p.strokeStyle = ink;
  p.lineWidth = line * 0.8;
  p.stroke();
  if (!buckle) return;
  p.beginPath();
  p.roundRect(xF - 0.38, -0.88, 0.76, 0.81, 0.12);
  p.fillStyle = buckle;
  p.fill();
  p.stroke();
}

// A strap round the body (clipped to it): `h` wide, centred at y,
// slanting k units down per unit across, its edges inked.
function strap(p: Pen, ink: Color, line: number, y: number, h: number, k: number): void {
  const at = (x: number, d: number) => [x, y + d + k * x] as const;
  p.beginPath();
  p.moveTo(...at(-4, -h / 2));
  p.lineTo(...at(4, -h / 2));
  p.lineTo(...at(4, h / 2));
  p.lineTo(...at(-4, h / 2));
  p.closePath();
  p.fillStyle = LEATHER;
  p.fill();
  p.beginPath();
  p.moveTo(...at(-4, -h / 2));
  p.lineTo(...at(4, -h / 2));
  p.moveTo(...at(-4, h / 2));
  p.lineTo(...at(4, h / 2));
  p.strokeStyle = ink;
  p.lineWidth = line * 0.8;
  p.stroke();
}

// A drifter's scarf: wrapped round the neck under the chin, one end
// hanging down the front (or the back), striped, with a fringe.
function scarf(sk: Sketch, L: Look, top: number, back: boolean): void {
  const c = L.trim;
  const cd = L.trimD;
  const x = back ? -0.85 : 1.35;
  const tail = (p: Pen) => p.roundRect(x - 0.5, top + 0.55, 1.0, 2.55, 0.4);
  sk.blob(tail, c, { dark: cd, d: 0.2 });
  sk.draw((p, k) => {
    p.save();
    p.beginPath();
    tail(p);
    p.clip();
    p.fillStyle = shade(c, -0.18);
    for (const y of [top + 2.1, top + 2.55]) p.fillRect(x - 1, y, 2, 0.22);
    p.restore();
    p.strokeStyle = k.ink;
    p.lineWidth = k.line * 0.8;
    p.lineCap = 'round';
    p.beginPath();
    for (const dx of [-0.28, 0, 0.28]) {
      p.moveTo(x + dx, top + 3.1);
      p.lineTo(x + dx, top + 3.5);
    }
    p.stroke();
  });
  sk.blob((p) => p.ellipse(0.15, top + 0.45, 2.45, 0.88, back ? 0.04 : -0.04, 0, TAU), c, { dark: cd, d: 0.3 });
}

// A drifter's coat collar: a tall stand collar flaring out and up round
// the jaw either side of the head, over the scarf's ends.
function collar(sk: Sketch, L: Look, top: number, back: boolean): void {
  const c = back ? 0.0 : 0.3;
  for (const e of [-1, 1]) {
    const flap = (p: Pen) =>
      path(p, [[c + e * 1.5, top + 0.95], [c + e * 2.5, top + 0.8], [c + e * 3.6, top - 1.35], [c + e * 2.15, top - 0.65]], 0.22);
    sk.blob(flap, L.top, { dark: L.topD, d: 0.25 });
    sk.draw((p, k) => {
      // where it folds over
      p.beginPath();
      p.moveTo(c + e * 3.25, top - 0.95);
      p.quadraticCurveTo(c + e * 2.55, top - 0.2, c + e * 2.0, top + 0.75);
      p.strokeStyle = alpha(k.ink, 0.55);
      p.lineWidth = k.line * 0.7;
      p.lineCap = 'round';
      p.stroke();
    });
  }
}

// A nord's fur cloak: behind the body seen from the front (its edges show
// at the sides), over the back seen from behind, to the knee. Over a
// ghost's sheet, a short cape, so the sheet's shape and its wavy hem show
// below it.
function cloak(sk: Sketch, r: Rig, top: number, floorY: number, back: boolean, sitting: boolean, ghost: boolean): void {
  const hem = ghost ? top + 3.5 : sitting ? 0.9 : Math.min(floorY - 1.3, 2.3);
  const flare = ghost ? 0.25 : 0.45;
  const sw = r.sway * 0.25;
  const shape = (p: Pen) => path(p, [[-2.45, top + 0.2], [2.6, top + 0.2], [2.6 + flare + sw, hem], [-2.5 - flare + sw, hem]], 0.7);
  sk.blob(shape, CLOAK, { dark: CLOAK_D, d: 0.6 });
  sk.draw((p, k) => {
    if (k.px < 4) return;
    // the fur's lie, in a few soft strokes
    p.save();
    p.beginPath();
    shape(p);
    p.clip();
    p.strokeStyle = alpha(k.ink, back ? 0.3 : 0.22);
    p.lineWidth = k.line * 0.7;
    p.lineCap = 'round';
    p.beginPath();
    for (let x = -2.2; x <= 2.6; x += 0.95) {
      p.moveTo(x + sw * 0.3, hem - 0.15);
      p.lineTo(x + sw * 0.2 - 0.1, hem - 1.0);
    }
    p.stroke();
    p.restore();
  });
}

// The fur mantle round a nord's shoulders, its lower edge in tufts.
function mantle(sk: Sketch, L: Look, top: number, back: boolean): void {
  const cx = back ? 0.0 : 0.15;
  sk.blob((p) => {
    p.moveTo(cx - 2.85, top + 0.35);
    p.quadraticCurveTo(cx - 2.6, top - 0.75, cx, top - 0.8);
    p.quadraticCurveTo(cx + 2.65, top - 0.75, cx + 2.9, top + 0.35);
    const n = 6;
    for (let j = 0; j < n; j++) {
      const xa = cx + 2.9 - (5.75 * (j + 0.5)) / n;
      const xb = cx + 2.9 - (5.75 * (j + 1)) / n;
      p.quadraticCurveTo(xa, top + 1.75 - 0.25 * Math.abs(j - 2.5) / 2.5, xb, top + 1.05 + (j === n - 1 ? -0.7 : 0));
    }
    p.closePath();
  }, L.accent, { dark: L.accentD, d: 0.35 });
}

// An exosuit's chest lamp: a soft glow round it (the lamp itself is on
// the suit, see dress).
function chestGlow(sk: Sketch, top: number): void {
  sk.draw((p) => {
    const x = 0.65;
    const y = top + 1.6;
    const g = p.createRadialGradient(x, y, 0.3, x, y, 1.2);
    g.addColorStop(0, alpha(LAMP, 0.4));
    g.addColorStop(1, alpha(LAMP, 0));
    p.beginPath();
    p.arc(x, y, 1.2, 0, TAU);
    p.fillStyle = g;
    p.fill();
  });
}

export function heart(p: Pen, x: number, y: number, r: number): void {
  p.moveTo(x, y + r * 0.95);
  p.bezierCurveTo(x - r * 1.5, y, x - r * 0.95, y - r * 1.15, x, y - r * 0.4);
  p.bezierCurveTo(x + r * 0.95, y - r * 1.15, x + r * 1.5, y, x, y + r * 0.95);
  p.closePath();
}

function ghostSheet(sk: Sketch, L: Look, top: number, r: Rig, back: boolean, hem: number): void {
  const sw = r.sway * 0.35;
  const ph = r.t * 5;
  const sheet = (p: Pen) => {
    p.moveTo(-1.9, top);
    p.lineTo(2.0, top);
    p.quadraticCurveTo(2.6, top + 2.5, 2.95 + sw, hem - 0.2);
    const n = 4;
    const x0 = 2.95 + sw;
    const x1 = -2.8 + sw;
    for (let j = 0; j < n; j++) {
      const xa = x0 + ((x1 - x0) * (j + 0.5)) / n;
      const xb = x0 + ((x1 - x0) * (j + 1)) / n;
      const wob = 0.15 * Math.sin(ph + j * 1.7);
      p.quadraticCurveTo(xa, hem + 0.75 + wob, xb, hem - 0.05 * (j % 2));
    }
    p.quadraticCurveTo(-2.5, top + 2.5, -1.9, top);
    p.closePath();
  };
  sk.blob(sheet, L.top, { dark: L.topD, d: 0.7 });
  if (L.costume === 'exosuit' || L.costume === 'jumpsuit' || L.costume === 'colonist' || L.costume === 'startup') {
    // a stripe, a chest light, a belt and pouches, a hoodie's zip and
    // drawstrings on the sheet
    const xF = back ? -0.35 : 0.65;
    sk.draw((p, k) => {
      p.save();
      p.beginPath();
      sheet(p);
      p.clip();
      dress(p, k.ink, k.line, k.px, L, top, 0.35, xF, back);
      p.restore();
    });
  }
  if (SHEET_DRESS.has(L.costume)) {
    // overalls' bib, a cord, toggles, a waistcoat, a sash on the sheet
    const xF = back ? -0.35 : 0.65;
    sk.draw((p, k) => {
      p.save();
      p.beginPath();
      sheet(p);
      p.clip();
      settingDress(p, k.ink, k.line, L, top, xF, back);
      p.restore();
    });
  }
  if (L.costume === 'raver' && !back) {
    sk.draw((p) => {
      p.save();
      p.beginPath();
      sheet(p);
      p.clip();
      p.fillStyle = alpha(L.color, 0.5);
      p.fillRect(-4, -0.6, 8, 0.6);
      p.restore();
    });
  }
}

function pack(sk: Sketch, L: Look, top: number, back: boolean): void {
  const c = L.color;
  if (back) {
    sk.blob((p) => p.roundRect(-1.95, top + 0.35, 3.5, 4.0, 0.8), c, { dark: shade(c, -0.22), d: 0.55 });
    sk.draw((p, k) => {
      p.strokeStyle = k.ink;
      p.lineWidth = k.line;
      p.lineCap = 'round';
      p.beginPath();
      for (const y of [top + 1.4, top + 2.1, top + 2.8]) {
        p.moveTo(-1.1, y);
        p.lineTo(0.7, y);
      }
      p.stroke();
    });
  } else {
    sk.blob((p) => p.roundRect(-3.15, top + 0.3, 2.4, 4.0, 0.8), c, { dark: shade(c, -0.22), d: 0.5 });
  }
}

function hoodDown(sk: Sketch, L: Look, top: number, back: boolean): void {
  // (a ghost's startup hood is in its colour, over the sheet)
  const c = L.costume === 'startup' && L.sp === 'ghost' ? L.trim : shade(L.top, -0.08);
  const cd = L.costume === 'startup' && L.sp === 'ghost' ? L.trimD : L.topD;
  if (back) {
    sk.blob((p) => {
      p.moveTo(-2.0, top + 0.1);
      p.quadraticCurveTo(-0.35, top - 0.5, 1.3, top + 0.1);
      p.quadraticCurveTo(1.0, top + 2.4, -0.35, top + 2.7);
      p.quadraticCurveTo(-1.7, top + 2.4, -2.0, top + 0.1);
      p.closePath();
    }, c, { dark: cd, d: 0.4 });
  } else {
    sk.blob((p) => p.ellipse(-0.55, top + 0.1, 2.15, 0.95, -0.1, 0, TAU), c, { dark: cd, d: 0.3 });
  }
}

function tail(sk: Sketch, L: Look, t: number): void {
  const w = Math.sin(t * 2.6) * 0.5;
  sk.limb([-1.6, -0.3, -3.0, -0.6, -3.7 + w * 0.3, -2.0, -3.3 + w, -3.6], 0.85, L.skin, { dark: L.skinD });
}

// ---- arms ---------------------------------------------------------------------

// A long sleeve's cuff: a hoodie's ribbing, a space suit's in its colour,
// a nord's fur, an exosuit's glove cuff in its second colour, a jumpsuit's
// leather; else a shade of the sleeve.
const CUFF: Partial<Record<Costume, (L: Look) => Color>> = {
  hacker: (L) => shade(L.top, -0.12),
  startup: (L) => shade(L.top, -0.12),
  astronaut: (L) => L.color,
  nord: (L) => L.accent,
  exosuit: (L) => L.accent,
  jumpsuit: () => LEATHER,
};
// Where a cuff runs along the forearm (from the elbow, 0..1) and how wide
// it is, where it is more than a band at the wrist: a nord's fur and a
// jumpsuit's leather up the forearm, an exosuit's glove cuff.
const CUFF_SPAN: Partial<Record<Costume, readonly [number, number, number]>> = {
  nord: [0.25, 0.84, 1.6],
  exosuit: [0.62, 0.86, 1.42],
  jumpsuit: [0.3, 0.84, 1.36],
};

function drawArm(sk: Sketch, L: Look, a: ArmRig, grip: 'fist' | 'open' | 'point'): void {
  if (settingArm(sk, L, a, grip)) return;
  const pts = [a.s[0], a.s[1], a.e[0], a.e[1], a.h[0], a.h[1]];
  const ghost = L.sp === 'ghost';
  if (ghost) {
    sk.limb(pts, 1.1, L.top, { dark: L.topD });
    return;
  }
  switch (L.sleeve) {
    case 'tee': {
      sk.limb(pts, 1.0, L.skin, { dark: L.skinD });
      const m = lerp(a.s, a.e, 0.62);
      sk.limb([a.s[0], a.s[1], m[0], m[1]], 1.42, L.top, { dark: L.topD });
      break;
    }
    case 'bare': {
      sk.limb(pts, 1.0, L.skin, { dark: L.skinD });
      const b0 = lerp(a.e, a.h, 0.55);
      const b1 = lerp(a.e, a.h, 0.72);
      sk.draw((p, k) => {
        p.beginPath();
        p.moveTo(b0[0], b0[1]);
        p.lineTo(b1[0], b1[1]);
        p.lineCap = 'round';
        p.strokeStyle = alpha(L.color, 0.35);
        p.lineWidth = 1.9;
        p.stroke();
        p.strokeStyle = k.ink;
        p.lineWidth = 1.12 + k.line;
        p.stroke();
        p.strokeStyle = mix(L.color, '#ffffff', 0.35);
        p.lineWidth = 1.12;
        p.stroke();
      });
      break;
    }
    case 'wide': {
      sk.limb(pts, 1.3, L.top, { dark: L.topD });
      const c0 = lerp(a.e, a.h, 0.5);
      const c1 = lerp(a.e, a.h, 0.8);
      sk.limb([c0[0], c0[1], c1[0], c1[1]], 1.65, L.trim, { dark: L.trimD });
      break;
    }
    default: {
      if (L.costume === 'drifter') {
        rolled(sk, L, a);
        break;
      }
      const astro = L.costume === 'astronaut';
      sk.limb(pts, astro ? 1.4 : 1.18, L.top, { dark: L.topD });
      if (L.costume === 'exosuit') pads(sk, L, a);
      const span = CUFF_SPAN[L.costume];
      const c0 = lerp(a.e, a.h, span ? span[0] : 0.62);
      const c1 = lerp(a.e, a.h, span ? span[1] : 0.82);
      const cuff = CUFF[L.costume]?.(L) ?? shade(L.top, -0.06);
      sk.limb([c0[0], c0[1], c1[0], c1[1]], span ? span[2] : astro ? 1.5 : 1.28, cuff, span ? { dark: shade(cuff, -0.2), line: 0.6 } : { line: 0.6 });
      if (L.costume === 'nord') wraps(sk, a.e, a.h, [0.4, 0.66], 1.6, alpha(LEATHER, 0.9));
    }
  }
  hand(sk, L, a, grip);
}

// Short strokes across a limb from p to q at `at` (0..1 along it), `w`
// wide: the wraps of rags, a fur cuff's laces.
function wraps(sk: Sketch, p0: V, q0: V, at: readonly number[], w: number, color: Color): void {
  const [nx, ny] = norm(p0, q0);
  sk.draw((p, k) => {
    if (k.px < 4) return;
    p.beginPath();
    for (const t of at) {
      const [x, y] = lerp(p0, q0, t);
      p.moveTo(x - (nx * w) / 2, y - (ny * w) / 2 - 0.12);
      p.lineTo(x + (nx * w) / 2, y + (ny * w) / 2 + 0.12);
    }
    p.strokeStyle = color;
    p.lineWidth = k.line * 0.9;
    p.lineCap = 'round';
    p.stroke();
  });
}

// A drifter's sleeve rolled up over the elbow, the arm below wrapped in
// rags.
function rolled(sk: Sketch, L: Look, a: ArmRig): void {
  const r = lerp(a.s, a.e, 0.7);
  const f = lerp(a.e, a.h, 0.86);
  sk.limb([r[0], r[1], a.e[0], a.e[1], f[0], f[1]], 1.08, RAG, { dark: RAG_D });
  wraps(sk, a.e, a.h, [0.25, 0.55], 1.08, RAG_D);
  const m = lerp(a.s, a.e, 0.42);
  sk.limb([a.s[0], a.s[1], m[0], m[1]], 1.22, L.top, { dark: L.topD });
  const ang = Math.atan2(a.e[1] - a.s[1], a.e[0] - a.s[0]);
  sk.at(mul(move(r[0], r[1]), turn(ang)), () => sk.blob((p) => p.roundRect(-0.5, -0.72, 0.62, 1.44, 0.28), shade(L.top, 0.06), { dark: L.topD, d: 0.15 }));
}

// An exosuit's shoulder pad in its second colour, ribs down the sleeve.
function pads(sk: Sketch, L: Look, a: ArmRig): void {
  const [nx, ny] = norm(a.s, a.e);
  sk.draw((p, k) => {
    if (k.px < 4) return;
    p.beginPath();
    for (const t of [0.5, 0.68, 0.86]) {
      const [x, y] = lerp(a.s, a.e, t);
      p.moveTo(x - nx * 0.55, y - ny * 0.55);
      p.lineTo(x + nx * 0.55, y + ny * 0.55);
    }
    p.strokeStyle = alpha(k.ink, 0.5);
    p.lineWidth = k.line * 0.8;
    p.stroke();
  });
  const [x, y] = lerp(a.s, a.e, 0.14);
  const ang = Math.atan2(a.e[1] - a.s[1], a.e[0] - a.s[0]);
  sk.blob((p) => p.ellipse(x, y, 0.64, 0.8, ang, 0, TAU), L.accent, { dark: L.accentD, d: 0.18 });
}

function hand(sk: Sketch, L: Look, a: ArmRig, grip: 'fist' | 'open' | 'point'): void {
  const dx = a.h[0] - a.e[0];
  const dy = a.h[1] - a.e[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const r = L.costume === 'astronaut' ? 0.68 : 0.6;
  if (grip === 'point') {
    sk.limb([a.h[0], a.h[1], a.h[0] + ux * 0.95, a.h[1] + uy * 0.95], 0.38, L.hand, { line: 0.6 });
  }
  if (grip === 'open') {
    // a thumb sticking up off the hand
    const tx = -uy;
    const ty = ux;
    const s = ty > 0 ? -1 : 1;
    sk.limb([a.h[0], a.h[1], a.h[0] + (ux * 0.35 + s * tx * 0.55), a.h[1] + (uy * 0.35 + s * ty * 0.55)], 0.36, L.hand, { line: 0.6 });
  }
  sk.blob((p) => p.arc(a.h[0], a.h[1], grip === 'open' ? r * 1.05 : r, 0, TAU), L.hand, { dark: L.handD, d: 0.2 });
}

// ---- the setting worlds' outfits ------------------------------------------
//
// Work overalls in the mines, a forager's capelet in the caverns, a parka
// in the snows, a guard's uniform in the vault, a devil's robe in hell
// (see dressForSetting in look.ts). What goes on a ghost's sheet as well:
// a bib and straps, a capelet and satchel, a fur ruff, a waistcoat, a
// devil's cape, horns and tail.

type Add = (z: number, fn: () => void, frame?: Mat) => void;
// The costumes whose details go on a ghost's sheet (see settingDress).
const SHEET_DRESS: ReadonlySet<Costume> = new Set(['miner', 'forager', 'parka', 'guard', 'demon']);

// The torso's outline, as torso draws it for these costumes.
function torsoPath(p: Pen, top: number): void {
  path(p, [[0.1 - 1.95, top], [0.1 + 1.95, top], [0.1 + 2.2, 0.35], [0.1 - 2.2, 0.35]], 1.0);
}

// Paints `shape` over the torso (clipped to it) in `c`, shaded as the
// torso is (`cd` on its side away from the light), and along the shape's
// own edges by `d` units.
function cloth(p: Pen, k: Ctx, top: number, shape: (p: Pen) => void, c: Color, cd: Color, d: number): void {
  p.save();
  p.beginPath();
  torsoPath(p, top);
  p.clip();
  p.beginPath();
  shape(p);
  p.clip();
  p.fillStyle = cd;
  p.fillRect(-5, top - 2, 10, 12);
  if (d > 0) {
    p.translate(k.lx * d, k.ly * d);
    p.beginPath();
    shape(p);
    p.clip();
  }
  p.translate(k.lx * (0.65 - d), k.ly * (0.65 - d));
  p.beginPath();
  torsoPath(p, top);
  p.fillStyle = c;
  p.fill();
  p.restore();
}

// The head's shadow on the shoulders, as torso draws it (over what is
// painted on the torso after it).
function headShadow(p: Pen, top: number, back: boolean): void {
  p.beginPath();
  p.ellipse(back ? -0.1 : 0.4, top - 0.3, 2.2, 0.95, 0, 0, TAU);
  p.fillStyle = alpha('#1a1030', 0.17);
  p.fill();
}

// Over the torso, painted in its own colours and shaded as it is: `fn`
// draws (clipped to it), then the head's shadow and the torso's edge.
function overTorso(sk: Sketch, top: number, back: boolean, fn: (p: Pen, k: Ctx) => void): void {
  sk.draw((p, k) => {
    p.lineCap = 'round';
    p.lineJoin = 'round';
    fn(p, k);
    p.save();
    p.beginPath();
    torsoPath(p, top);
    p.clip();
    headShadow(p, top, back);
    p.restore();
    p.beginPath();
    torsoPath(p, top);
    p.strokeStyle = k.ink;
    p.lineWidth = k.line;
    p.stroke();
  });
}

// A ruffled ellipse: n tufts round it, pushed out by amp of its radii.
function tufts(p: Pen, cx: number, cy: number, rx: number, ry: number, n: number, amp: number): void {
  p.moveTo(cx + rx, cy);
  for (let j = 0; j < n; j++) {
    const am = ((j + 0.5) / n) * TAU;
    const ae = ((j + 1) / n) * TAU;
    p.quadraticCurveTo(cx + rx * (1 + amp) * Math.cos(am), cy + ry * (1 + amp) * Math.sin(am), cx + rx * Math.cos(ae), cy + ry * Math.sin(ae));
  }
  p.closePath();
}

function dressedForSetting(sk: Sketch, add: Add, L: Look, r: Rig, top: number, back: boolean): void {
  const ghost = L.sp === 'ghost';
  switch (L.costume) {
    case 'miner':
      if (!ghost) add(5.05, () => overalls(sk, L, top, back));
      add(6.9, () => neckerchief(sk, L, top, back));
      break;
    case 'forager':
      if (!ghost) add(5.05, () => tunic(sk, L, top, back));
      add(5.6, () => satchel(sk, L, top, back));
      add(6.9, () => capelet(sk, L, top, back));
      break;
    case 'parka':
      add(6.9, () => ruff(sk, L, top, back));
      break;
    case 'guard':
      add(5.6, () => keyRing(sk, back));
      break;
    case 'demon':
      add(back ? 7.5 : 6, () => devilCollar(sk, L, top, back));
      add(6.9, () => cape(sk, L, r, top, back));
      add(back ? 6 : 0, () => devilTail(sk, L, r.t));
      break;
    default:
      return;
  }
  // the ★3 badge pinned over all of it (on a guard, the guard's badge)
  if (L.badge && !back) add(6.95, () => badge(sk, top));
}

// A miner's work shirt, and denim bib overalls over it: the bib up the
// front with a pocket and two brass buttons, the straps over the shoulders
// (crossed over the back), the waist all round.
function overalls(sk: Sketch, L: Look, top: number, back: boolean): void {
  const xF = back ? -0.35 : 0.65;
  overTorso(sk, top, back, (p, k) => {
    cloth(p, k, top, (q) => torsoPath(q, top), L.under, shade(L.under, -0.22), 0);
    const bib = (q: Pen) =>
      back
        ? path(q, [[-4, -1.5], [xF - 1.0, -1.5], [xF - 0.8, -2.45], [xF + 0.8, -2.45], [xF + 1.0, -1.5], [4, -1.5], [4, 1], [-4, 1]], 0.2)
        : path(q, [[-4, -1.45], [xF - 0.95, -1.45], [xF - 0.95, top + 1.3], [xF + 0.95, top + 1.3], [xF + 0.95, -1.45], [4, -1.45], [4, 1], [-4, 1]], 0.22);
    cloth(p, k, top, bib, L.kit, L.kitD, 0.25);
    p.save();
    p.beginPath();
    torsoPath(p, top);
    p.clip();
    p.beginPath();
    bib(p);
    p.strokeStyle = k.ink;
    p.lineWidth = k.line * 0.9;
    p.stroke();
    straps(p, k.ink, k.line, L.kit, top, xF, back);
    if (!back) {
      p.beginPath();
      p.roundRect(xF - 0.5, top + 1.85, 1.0, 0.75, 0.12);
      p.moveTo(xF - 0.5, top + 2.08);
      p.lineTo(xF + 0.5, top + 2.08);
      p.lineWidth = k.line * 0.75;
      p.stroke();
    }
    p.restore();
  });
}

// Overall straps: from the bib over the shoulders, brass buttons where
// they meet it; from behind, crossed from the back panel.
function straps(p: Pen, ink: Color, line: number, c: Color, top: number, xF: number, back: boolean): void {
  const s: ReadonlyArray<readonly [number, number, number, number]> = back
    ? [[xF - 0.6, -2.35, 0.1 + 1.4, top - 0.3], [xF + 0.6, -2.35, 0.1 - 1.4, top - 0.3]]
    : [[xF - 0.66, top + 1.4, 0.1 - 1.2, top - 0.3], [xF + 0.66, top + 1.4, 0.1 + 1.45, top - 0.3]];
  p.lineCap = 'butt';
  for (const [x0, y0, x1, y1] of s) {
    p.beginPath();
    p.moveTo(x0, y0);
    p.lineTo(x1, y1);
    p.strokeStyle = ink;
    p.lineWidth = 0.56 + 1.6 * line;
    p.stroke();
    p.strokeStyle = c;
    p.lineWidth = 0.56;
    p.stroke();
  }
  p.lineCap = 'round';
  for (const [x0, y0] of back ? [[xF, -2.45 + 0.05]] : s.map(([x, y]) => [x, y + 0.05])) {
    p.beginPath();
    p.arc(x0, y0, 0.21, 0, TAU);
    p.fillStyle = CLOTHES.brass;
    p.fill();
    p.strokeStyle = ink;
    p.lineWidth = line * 0.7;
    p.stroke();
  }
}

// A miner's neckerchief, in its own colour: knotted at the throat, its
// point down the front (the knot and ends at the nape, from behind).
function neckerchief(sk: Sketch, L: Look, top: number, back: boolean): void {
  const c = L.trim;
  const cd = L.trimD;
  const xF = back ? -0.35 : 0.65;
  if (!back) {
    sk.blob((p) => {
      p.moveTo(xF - 0.8, top + 0.3);
      p.lineTo(xF + 0.85, top + 0.3);
      p.quadraticCurveTo(xF + 0.35, top + 0.95, xF + 0.12, top + 1.55);
      p.quadraticCurveTo(xF - 0.25, top + 0.9, xF - 0.8, top + 0.3);
      p.closePath();
    }, c, { dark: cd, d: 0.15 });
  }
  sk.blob((p) => p.ellipse(0.12, top + 0.3, 2.15, 0.62, back ? 0.04 : -0.04, 0, TAU), c, { dark: cd, d: 0.22 });
  if (back) {
    for (const dx of [-0.4, 0.35]) sk.limb([xF, top + 0.55, xF + dx, top + 1.3], 0.36, c, { dark: cd });
  }
  sk.blob(circ(back ? xF : xF + 0.05, top + 0.45, 0.32), shade(c, -0.06), { dark: cd, d: 0.1 });
}

const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

// A forager's oatmeal tunic, tied with a rope cord.
function tunic(sk: Sketch, L: Look, top: number, back: boolean): void {
  const xF = back ? -0.35 : 0.65;
  overTorso(sk, top, back, (p, k) => {
    cloth(p, k, top, (q) => torsoPath(q, top), L.under, CLOTHES.oatmealD, 0);
    p.save();
    p.beginPath();
    torsoPath(p, top);
    p.clip();
    ropeCord(p, k.ink, k.line, xF, back);
    p.restore();
  });
}

// A rope cord round the waist, knotted at the front, its ends hanging.
function ropeCord(p: Pen, ink: Color, line: number, xF: number, back: boolean): void {
  const y0 = -0.78;
  const y1 = -0.42;
  p.fillStyle = CLOTHES.rope;
  p.fillRect(-4, y0, 8, y1 - y0);
  p.beginPath();
  for (let x = -2.5; x < 2.7; x += 0.42) {
    p.moveTo(x, y1 - 0.03);
    p.lineTo(x + 0.24, y0 + 0.03);
  }
  p.strokeStyle = alpha(ink, 0.4);
  p.lineWidth = line * 0.55;
  p.stroke();
  p.beginPath();
  p.moveTo(-4, y0);
  p.lineTo(4, y0);
  p.moveTo(-4, y1);
  p.lineTo(4, y1);
  p.strokeStyle = ink;
  p.lineWidth = line * 0.7;
  p.stroke();
  if (back) return;
  for (const [x, y] of [[xF - 0.62, 0.4], [xF - 0.25, 0.32]]) {
    p.beginPath();
    p.moveTo(xF - 0.42, (y0 + y1) / 2);
    p.lineTo(x, y);
    p.strokeStyle = ink;
    p.lineWidth = 0.2 + line;
    p.stroke();
    p.strokeStyle = CLOTHES.rope;
    p.lineWidth = 0.2;
    p.stroke();
  }
  p.beginPath();
  p.arc(xF - 0.42, (y0 + y1) / 2, 0.27, 0, TAU);
  p.fillStyle = CLOTHES.rope;
  p.fill();
  p.strokeStyle = ink;
  p.lineWidth = line * 0.7;
  p.stroke();
}

// A forager's satchel, slung across the chest to its left hip (the far one
// from the front, behind the near arm from neither side): its flap in its
// own colour, a little red mushroom poking out.
function satchel(sk: Sketch, L: Look, top: number, back: boolean): void {
  const s = back ? -1 : 1;
  const bx = 0.1 + s * 1.9;
  const by = -0.5;
  sk.limb([0.1 - s * 1.35, top + 0.15, bx - s * 0.1, by - 0.55], 0.4, CLOTHES.satchel, { dark: CLOTHES.satchelD, sil: false });
  sk.limb([bx + s * 0.4, by - 0.55, bx + s * 0.5, by - 1.0], 0.26, CLOTHES.oatmeal, { line: 0.5 });
  sk.blob((p) => p.ellipse(bx + s * 0.5, by - 1.12, 0.44, 0.3, s * 0.15, 0, TAU), CLOTHES.toadstool, { dark: CLOTHES.toadstoolD, d: 0.08, line: 0.5 });
  sk.draw((p) => {
    p.beginPath();
    p.arc(bx + s * 0.38, by - 1.2, 0.09, 0, TAU);
    p.fillStyle = CLOTHES.spots;
    p.fill();
  });
  sk.blob((p) => p.roundRect(bx - 0.95, by - 0.7, 1.9, 1.55, 0.45), CLOTHES.satchel, { dark: CLOTHES.satchelD, d: 0.3 });
  sk.blob((p) => {
    p.moveTo(bx - 0.95, by - 0.3);
    p.quadraticCurveTo(bx - 0.95, by - 0.72, bx - 0.55, by - 0.72);
    p.lineTo(bx + 0.55, by - 0.72);
    p.quadraticCurveTo(bx + 0.95, by - 0.72, bx + 0.95, by - 0.3);
    p.lineTo(bx + 0.95, by + 0.05);
    p.quadraticCurveTo(bx, by + 0.45, bx - 0.95, by + 0.05);
    p.closePath();
  }, L.trim, { dark: L.trimD, d: 0.15, sil: false });
  sk.blob(circ(bx, by + 0.22, 0.16), CLOTHES.toggle, { line: 0.5, sil: false });
}

// A forager's short capelet, moss green, its hem cut in leaves; a leaf
// pinned at the throat; from behind, its hood hanging down the back.
function capelet(sk: Sketch, L: Look, top: number, back: boolean): void {
  const cx = back ? 0.0 : 0.15;
  const c = L.kit;
  const cd = L.kitD;
  const hem = top + 2.1;
  const n = 6;
  const x0 = cx + 2.9;
  const x1 = cx - 2.8;
  const tips: Array<[number, number]> = [];
  const shape = (p: Pen) => {
    p.moveTo(x1, top + 0.6);
    p.quadraticCurveTo(cx - 2.65, top - 0.75, cx, top - 0.8);
    p.quadraticCurveTo(cx + 2.7, top - 0.75, x0, top + 0.6);
    for (let j = 0; j < n; j++) {
      const xa = x0 + ((x1 - x0) * (j + 0.5)) / n;
      const xb = x0 + ((x1 - x0) * (j + 1)) / n;
      const sag = 0.3 * Math.sin((Math.PI * (j + 0.5)) / n);
      p.quadraticCurveTo(xa + 0.3, hem - 0.3 + sag, xa, hem + sag);
      p.quadraticCurveTo(xa - 0.22, hem - 0.42 + sag, xb, j === n - 1 ? top + 0.6 : hem - 0.6 + sag);
      if (tips.length < n) tips.push([xa, hem + sag]);
    }
    p.closePath();
  };
  sk.blob(shape, c, { dark: cd, d: 0.4 });
  sk.draw((p, k) => {
    if (k.px < 5) return;
    // the leaves' midribs
    p.strokeStyle = alpha(k.ink, 0.35);
    p.lineWidth = k.line * 0.6;
    p.lineCap = 'round';
    p.beginPath();
    for (const [x, y] of tips) {
      p.moveTo(x + 0.08, y - 0.12);
      p.lineTo(x + 0.22, y - 0.62);
    }
    p.stroke();
  });
  if (back) {
    sk.blob((p) => {
      p.moveTo(-1.65, top + 0.0);
      p.quadraticCurveTo(-0.3, top - 0.5, 1.05, top + 0.0);
      p.quadraticCurveTo(0.85, top + 1.7, -0.3, top + 2.45);
      p.quadraticCurveTo(-1.45, top + 1.7, -1.65, top + 0.0);
      p.closePath();
    }, shade(c, -0.05), { dark: cd, d: 0.35 });
    return;
  }
  const lx = cx + 0.45;
  const ly = top + 0.4;
  sk.at(mul(move(lx, ly), turn(-0.65)), () => {
    sk.blob((p) => {
      p.moveTo(-0.6, 0);
      p.quadraticCurveTo(0, -0.42, 0.6, 0);
      p.quadraticCurveTo(0, 0.42, -0.6, 0);
      p.closePath();
    }, CLOTHES.leaf, { dark: shade(CLOTHES.leaf, -0.2), d: 0.08, line: 0.55 });
    sk.draw((p, k) => {
      p.beginPath();
      p.moveTo(-0.45, 0);
      p.lineTo(0.5, 0);
      p.strokeStyle = alpha(k.ink, 0.6);
      p.lineWidth = k.line * 0.55;
      p.stroke();
    });
  });
}

// A parka's hood down: its fur a big tufted ruff round the neck; from
// behind, the hood hanging down the back in the parka's cloth.
function ruff(sk: Sketch, L: Look, top: number, back: boolean): void {
  if (back) {
    sk.blob((p) => {
      p.moveTo(-2.05, top + 0.2);
      p.quadraticCurveTo(-0.3, top - 0.4, 1.45, top + 0.2);
      p.quadraticCurveTo(1.2, top + 2.5, -0.3, top + 2.85);
      p.quadraticCurveTo(-1.8, top + 2.5, -2.05, top + 0.2);
      p.closePath();
    }, L.kit, { dark: L.kitD, d: 0.4 });
  }
  const cx = back ? 0.0 : 0.15;
  const fur = (p: Pen) => tufts(p, cx, top + 0.22, 2.75, 0.98, 13, 0.2);
  sk.blob(fur, CLOTHES.snowFur, { dark: CLOTHES.snowFurD, d: 0.3 });
  sk.draw((p, k) => {
    if (k.px < 5) return;
    p.save();
    p.beginPath();
    fur(p);
    p.clip();
    p.strokeStyle = alpha(k.ink, 0.2);
    p.lineWidth = k.line * 0.6;
    p.lineCap = 'round';
    p.beginPath();
    for (let a = 0.15; a < TAU; a += 0.62) {
      const x = cx + 2.1 * Math.cos(a);
      const y = top + 0.22 + 0.72 * Math.sin(a);
      p.moveTo(x, y);
      p.lineTo(x + 0.3 * Math.cos(a), y + 0.22 * Math.sin(a));
    }
    p.stroke();
    p.restore();
  });
}

// A guard's ring of two big brass keys at the belt.
function keyRing(sk: Sketch, back: boolean): void {
  const x = back ? 2.0 : -1.85;
  const y = -0.45;
  const brass = CLOTHES.brass;
  const brassD = shade(brass, -0.28);
  for (const [a, len] of [[0.32, 1.5], [-0.28, 1.3]] as const) {
    const ux = Math.sin(a);
    const uy = Math.cos(a);
    const bx = x + ux * 0.62;
    const by = y + uy * 0.62;
    const ex = x + ux * len;
    const ey = y + uy * len;
    sk.limb([bx, by, ex, ey], 0.22, brass, { dark: brassD, line: 0.5 });
    sk.limb([ex - ux * 0.25, ey - uy * 0.25, ex - ux * 0.25 + uy * 0.3, ey - uy * 0.25 - ux * 0.3], 0.2, brass, { line: 0.5 });
    sk.blob(circ(bx, by, 0.27), brass, { dark: brassD, d: 0.08, line: 0.5 });
  }
  sk.blob((p) => {
    p.arc(x, y, 0.42, 0, TAU);
    p.moveTo(x + 0.25, y);
    p.arc(x, y, 0.25, 0, TAU);
  }, brass, { dark: brassD, d: 0.1, line: 0.55, rule: 'evenodd' });
}

// A devil's high pointed collar: from the front, its scarlet-lined inside
// fanning up behind the head to a point either side of it; from behind,
// its plum outside round the nape.
function devilCollar(sk: Sketch, L: Look, top: number, back: boolean): void {
  const { plum, plumD } = CLOTHES;
  if (back) {
    sk.blob((p) => {
      p.moveTo(-2.15, top + 0.25);
      p.lineTo(-3.4, top - 1.6);
      p.quadraticCurveTo(-1.6, top - 0.8, -0.2, top - 0.95);
      p.quadraticCurveTo(1.3, top - 0.8, 3.2, top - 1.6);
      p.lineTo(2.0, top + 0.25);
      p.closePath();
    }, plum, { dark: plumD, d: 0.3 });
    return;
  }
  const fan = (k: number) => (p: Pen) => {
    p.moveTo(-1.6 + 0.15 * k, top + 0.3);
    p.lineTo(-3.85 + 0.45 * k, top - 2.15 + 0.4 * k);
    p.quadraticCurveTo(-2.2, top - 1.75 + 0.2 * k, -0.6, top - 1.95 + 0.2 * k);
    p.lineTo(1.4, top - 1.95 + 0.2 * k);
    p.quadraticCurveTo(2.75, top - 1.75 + 0.2 * k, 4.2 - 0.45 * k, top - 2.1 + 0.4 * k);
    p.lineTo(2.1 - 0.15 * k, top + 0.3);
    p.closePath();
  };
  sk.blob(fan(0), plum, { dark: plumD, d: 0.25 });
  sk.blob(fan(1), L.kit, { dark: L.kitD, d: 0.2, line: 0.5, sil: false });
}

// A bat-wing hem from (x0, y0) to (x1, y1): points hanging down, scalloped
// up between them (continuing the current subpath).
function batHem(p: Pen, x0: number, y0: number, x1: number, y1: number, n: number): void {
  for (let j = 0; j < n; j++) {
    const xa = x0 + ((x1 - x0) * (j + 0.5)) / n;
    const ya = y0 + ((y1 - y0) * (j + 0.5)) / n;
    const xb = x0 + ((x1 - x0) * (j + 1)) / n;
    const yb = y0 + ((y1 - y0) * (j + 1)) / n;
    p.quadraticCurveTo(xa, ya - 0.7, xb, yb);
  }
}

// A devil's short plum cape over the shoulders, its hem cut like a bat's
// wings, lined in the robe's scarlet: open down the front (two panels), one
// across the back.
function cape(sk: Sketch, L: Look, r: Rig, top: number, back: boolean): void {
  const { plum, plumD } = CLOTHES;
  const sw = r.sway * 0.2;
  const hem = top + 2.75;
  if (back) {
    sk.blob((p) => {
      p.moveTo(-2.75 + sw, hem);
      p.lineTo(-2.55, top + 0.15);
      p.quadraticCurveTo(-2.3, top - 0.55, -0.1, top - 0.6);
      p.quadraticCurveTo(2.4, top - 0.55, 2.6, top + 0.15);
      p.lineTo(2.85 + sw, hem);
      batHem(p, 2.85 + sw, hem, -2.75 + sw, hem, 4);
      p.closePath();
    }, plum, { dark: plumD, d: 0.45 });
    return;
  }
  const near = (p: Pen) => {
    p.moveTo(-0.55, top - 0.25);
    p.quadraticCurveTo(-2.3, top - 0.5, -2.5, top + 0.15);
    p.lineTo(-2.8 + sw, hem);
    batHem(p, -2.8 + sw, hem, -0.6 + sw, hem - 0.55, 2);
    p.quadraticCurveTo(-0.25, top + 1.0, -0.55, top - 0.25);
    p.closePath();
  };
  const far = (p: Pen) => {
    p.moveTo(1.35, top - 0.25);
    p.quadraticCurveTo(2.5, top - 0.45, 2.65, top + 0.15);
    p.lineTo(2.9 + sw, hem - 0.05);
    batHem(p, 2.9 + sw, hem - 0.05, 1.7 + sw, hem - 0.6, 2);
    p.quadraticCurveTo(1.4, top + 1.0, 1.35, top - 0.25);
    p.closePath();
  };
  for (const [panel, edge] of [[near, [-0.55, top - 0.25, -0.25, top + 1.0, -0.6 + sw, hem - 0.55]], [far, [1.35, top - 0.25, 1.4, top + 1.0, 1.7 + sw, hem - 0.6]]] as const) {
    sk.blob(panel, plum, { dark: plumD, d: 0.35 });
    // the lining turned out along the opening
    sk.draw((p, k) => {
      p.save();
      p.beginPath();
      panel(p);
      p.clip();
      p.beginPath();
      p.moveTo(edge[0], edge[1]);
      p.quadraticCurveTo(edge[2], edge[3], edge[4], edge[5]);
      p.strokeStyle = L.kit;
      p.lineWidth = 0.5;
      p.stroke();
      p.strokeStyle = k.ink;
      p.lineWidth = k.line * 0.6;
      p.stroke();
      p.restore();
    });
  }
}

// A devil's thin tail from behind the hip, curving out and up in an S to
// an arrowhead, swinging a little.
function devilTail(sk: Sketch, L: Look, t: number): void {
  const w = Math.sin(t * 2.4) * 0.25;
  const pts = [-1.3, -0.45, -2.1, 0.15, -2.9, 0.32, -3.5, 0.02, -3.8 + w * 0.3, -0.6, -3.75 + w * 0.6, -1.25, -3.45 + w, -1.8];
  sk.limb(pts, 0.42, L.kit, { dark: L.kitD });
  const [x0, y0, x1, y1] = pts.slice(-4);
  const l = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / l;
  const uy = (y1 - y0) / l;
  const nx = -uy;
  const ny = ux;
  const at = (a: number, b: number): [number, number] => [x1 + ux * a + nx * b, y1 + uy * a + ny * b];
  sk.blob((p) => {
    p.moveTo(...at(1.05, 0));
    p.quadraticCurveTo(...at(0.4, 0.62), ...at(-0.3, 0.68));
    p.lineTo(...at(0.05, 0));
    p.lineTo(...at(-0.3, -0.68));
    p.quadraticCurveTo(...at(0.4, -0.62), ...at(1.05, 0));
    p.closePath();
  }, L.kit, { dark: L.kitD, d: 0.12 });
}

// Below the torso: a devil's robe to the shin, a parka's skirt to mid-thigh
// with its cream band, a forager's tunic just past the hips.
function settingHips(sk: Sketch, L: Look, r: Rig, floorY: number, back: boolean, sitting: boolean): boolean {
  const cx = 0.1;
  const seat = (c: Color, cd: Color) => sk.blob((p) => p.roundRect(-2.0, -0.8, 4.25, 1.4, 0.6), c, { dark: cd, d: 0.3 });
  switch (L.costume) {
    case 'demon': {
      if (sitting) {
        seat(L.top, L.topD);
        return true;
      }
      const hem = Math.min(floorY - 1.3, 2.4);
      const sw = r.sway * 0.3;
      const robe = (p: Pen) => path(p, [[cx - 2.1, -1.2], [cx + 2.15, -1.2], [cx + 2.7 + sw, hem], [cx - 2.6 + sw, hem]], 0.5);
      sk.blob(robe, L.top, { dark: L.topD, d: 0.6 });
      if (!back) {
        sk.draw((p, k) => {
          p.beginPath();
          p.moveTo(cx + 0.95, -0.4);
          p.quadraticCurveTo(cx + 1.25 + sw * 0.5, hem - 1.0, cx + 1.1 + sw, hem - 0.05);
          p.strokeStyle = alpha(k.ink, 0.7);
          p.lineWidth = k.line * 0.8;
          p.lineCap = 'round';
          p.stroke();
        });
      }
      return true;
    }
    case 'parka': {
      const hem = sitting ? 0.65 : 1.2;
      const sw = r.sway * 0.15;
      seat(L.legs, L.legsD);
      const skirt = (p: Pen) => path(p, [[cx - 2.25, -1.4], [cx + 2.35, -1.4], [cx + 2.75 + sw, hem], [cx - 2.6 + sw, hem]], 0.55);
      sk.blob(skirt, L.top, { dark: L.topD, d: 0.5 });
      sk.draw((p, k) => {
        p.save();
        p.beginPath();
        skirt(p);
        p.clip();
        p.fillStyle = CLOTHES.snowFur;
        p.fillRect(cx - 4, hem - 0.42, 8, 0.6);
        p.beginPath();
        p.moveTo(cx - 4, hem - 0.42);
        p.lineTo(cx + 4, hem - 0.42);
        p.strokeStyle = k.ink;
        p.lineWidth = k.line * 0.8;
        p.stroke();
        p.restore();
      });
      return true;
    }
    case 'forager': {
      const hem = sitting ? 0.5 : 0.85;
      const sw = r.sway * 0.12;
      seat(L.legs, L.legsD);
      sk.blob((p) => path(p, [[cx - 2.2, -1.2], [cx + 2.3, -1.2], [cx + 2.5 + sw, hem], [cx - 2.4 + sw, hem]], 0.45), L.under, { dark: CLOTHES.oatmealD, d: 0.45 });
      return true;
    }
  }
  return false;
}

// Flat details over the torso (clipped to it, or to a ghost's sheet): a
// parka's quilting and wooden toggles, a guard's shirt, tie, buttons and
// watch chain (a whole waistcoat on a sheet), a devil's sash in its own
// colour; on a sheet, overalls' bib and straps and a forager's cord.
function settingDress(p: Pen, ink: Color, line: number, L: Look, top: number, xF: number, back: boolean): void {
  p.lineCap = 'round';
  p.lineJoin = 'round';
  const stroke = (w = line) => {
    p.strokeStyle = ink;
    p.lineWidth = w;
    p.stroke();
  };
  const ghost = L.sp === 'ghost';
  switch (L.costume) {
    case 'miner':
      if (!ghost) return; // see overalls
      if (back) {
        p.beginPath();
        p.roundRect(xF - 1.0, -2.45, 2.0, 2.2, 0.2);
        p.fillStyle = L.kit;
        p.fill();
        stroke(line * 0.9);
      } else {
        p.beginPath();
        p.roundRect(xF - 0.95, top + 1.3, 1.9, 3.2, 0.22);
        p.fillStyle = L.kit;
        p.fill();
        stroke(line * 0.9);
        p.beginPath();
        p.roundRect(xF - 0.5, top + 1.85, 1.0, 0.75, 0.12);
        stroke(line * 0.75);
      }
      straps(p, ink, line, L.kit, top, xF, back);
      return;
    case 'forager':
      if (ghost) ropeCord(p, ink, line, xF, back);
      return;
    case 'parka':
      p.beginPath();
      for (const y of [top + 1.8, top + 3.2]) {
        p.moveTo(-4, y - 0.15);
        p.quadraticCurveTo(xF, y + 0.3, 4, y - 0.15);
      }
      p.strokeStyle = alpha(ink, 0.55);
      p.lineWidth = line * 0.8;
      p.stroke();
      if (back) return;
      p.beginPath();
      p.moveTo(xF, top + 0.9);
      p.lineTo(xF + 0.05, 0.6);
      stroke(line * 0.8);
      for (const y of [top + 1.4, top + 2.5, top + 3.6]) {
        p.beginPath();
        p.moveTo(xF - 0.55, y + 0.05);
        p.lineTo(xF + 0.5, y - 0.05);
        stroke(line * 0.8);
        p.beginPath();
        p.roundRect(xF - 0.42, y - 0.17, 0.84, 0.34, 0.17);
        p.fillStyle = CLOTHES.toggle;
        p.fill();
        stroke(line * 0.75);
      }
      return;
    case 'guard': {
      if (ghost) {
        // the waistcoat, its points at the front over the sheet
        const vest = (q: Pen) => {
          q.moveTo(-4, top - 1);
          q.lineTo(4, top - 1);
          q.lineTo(4, -0.65);
          if (!back) {
            q.lineTo(xF + 0.6, -0.65);
            q.lineTo(xF + 0.05, -0.1);
            q.lineTo(xF - 0.5, -0.65);
          }
          q.lineTo(-4, -0.65);
          q.closePath();
        };
        p.beginPath();
        vest(p);
        p.fillStyle = L.kit;
        p.fill();
        stroke(line * 0.9);
      }
      if (back) {
        p.beginPath();
        p.roundRect(xF - 0.7, -1.6, 1.4, 0.34, 0.12);
        p.fillStyle = L.kitD;
        p.fill();
        stroke(line * 0.7);
        if (!ghost) {
          p.beginPath();
          p.ellipse(-0.1, top - 0.1, 1.55, 0.55, 0, 0, Math.PI);
          p.fillStyle = CLOTHES.paleShirt;
          p.fill();
          stroke(line * 0.8);
          belt(p, ink, line, '#34323c', null, xF);
        }
        return;
      }
      // the shirt in the waistcoat's V, its collar points, the tie
      p.beginPath();
      p.moveTo(xF - 1.0, top - 0.2);
      p.lineTo(xF + 1.05, top - 0.2);
      p.lineTo(xF + 0.05, top + 2.0);
      p.closePath();
      p.fillStyle = ghost ? L.top : CLOTHES.paleShirt;
      p.fill();
      stroke();
      p.beginPath();
      p.moveTo(xF - 0.12, top + 0.32);
      p.lineTo(xF + 0.24, top + 0.32);
      p.lineTo(xF + 0.22, top + 1.6);
      p.lineTo(xF + 0.05, top + 1.95);
      p.lineTo(xF - 0.12, top + 1.6);
      p.closePath();
      p.fillStyle = L.trim;
      p.fill();
      stroke(line * 0.8);
      p.beginPath();
      p.roundRect(xF - 0.2, top + 0.1, 0.48, 0.34, 0.1);
      p.fillStyle = L.trimD;
      p.fill();
      stroke(line * 0.7);
      for (const s of [-1, 1]) {
        p.beginPath();
        p.moveTo(xF + s * 0.95, top - 0.2);
        p.lineTo(xF + s * 0.12, top + 0.15);
        p.lineTo(xF + s * 0.62, top + 0.62);
        p.closePath();
        p.fillStyle = ghost ? L.top : CLOTHES.paleShirt;
        p.fill();
        stroke(line * 0.7);
      }
      // two columns of brass buttons, a watch chain looped across
      for (const y of [top + 2.35, top + 3.0, top + 3.65]) {
        for (const x of [xF - 0.48, xF + 0.48]) {
          p.beginPath();
          p.arc(x, y, 0.17, 0, TAU);
          p.fillStyle = CLOTHES.brass;
          p.fill();
          stroke(line * 0.6);
        }
      }
      p.beginPath();
      p.moveTo(xF + 0.48, top + 3.0);
      p.quadraticCurveTo(xF - 0.4, top + 3.75, xF - 1.4, top + 3.05);
      p.strokeStyle = CLOTHES.gilt;
      p.lineWidth = Math.max(0.13, line * 0.9);
      p.stroke();
      p.beginPath();
      p.moveTo(xF - 1.75, top + 3.05);
      p.lineTo(xF - 1.05, top + 3.05);
      stroke(line * 0.7);
      if (!ghost) belt(p, ink, line, '#34323c', CLOTHES.brass, xF);
      return;
    }
    case 'demon':
      if (!back && !ghost) {
        // the robe's wrap, crossing over
        p.beginPath();
        p.moveTo(xF - 1.0, top - 0.1);
        p.quadraticCurveTo(xF - 0.1, top + 1.3, xF + 0.35, BELT.top);
        stroke(line * 0.8);
      }
      // a sash in its own colour, a gold clasp
      belt(p, ink, line, L.trim, back ? null : CLOTHES.horn, xF);
      return;
  }
}

// A setting outfit's arms (true when drawn): a miner's shirt rolled to the
// elbow and work gloves; a forager's tunic sleeves, a guard's shirt
// sleeves with white cuffs, a devil's robe sleeves; a parka's puffy
// sleeves, cream cuffs and big mittens in its own colour (a ghost's too).
function settingArm(sk: Sketch, L: Look, a: ArmRig, grip: 'fist' | 'open' | 'point'): boolean {
  const pts = [a.s[0], a.s[1], a.e[0], a.e[1], a.h[0], a.h[1]];
  const ghost = L.sp === 'ghost';
  const sleeve = (c: Color, cd: Color, cuff: Color, w = 1.18) => {
    sk.limb(pts, w, c, { dark: cd });
    const c0 = lerp(a.e, a.h, 0.62);
    const c1 = lerp(a.e, a.h, 0.82);
    sk.limb([c0[0], c0[1], c1[0], c1[1]], w + 0.1, cuff, { line: 0.6 });
  };
  switch (L.costume) {
    case 'miner': {
      if (ghost) return false;
      sk.limb(pts, 1.0, L.skin, { dark: L.skinD });
      const r0 = lerp(a.e, a.h, 0.05);
      const r1 = lerp(a.e, a.h, 0.22);
      const ud = shade(L.under, -0.22);
      sk.limb([a.s[0], a.s[1], a.e[0], a.e[1], r0[0], r0[1]], 1.3, L.under, { dark: ud });
      sk.limb([r0[0], r0[1], r1[0], r1[1]], 1.42, shade(L.under, 0.1), { dark: ud, line: 0.6 });
      const g0 = lerp(a.e, a.h, 0.7);
      sk.limb([g0[0], g0[1], a.h[0], a.h[1]], 1.22, L.hand, { dark: L.handD });
      break;
    }
    case 'forager':
      if (ghost) return false;
      sleeve(L.under, CLOTHES.oatmealD, shade(L.under, -0.08));
      break;
    case 'guard':
      if (ghost) return false;
      sleeve(L.under, shade(L.under, -0.18), '#f6f8fb');
      break;
    case 'demon':
      if (ghost) return false;
      sleeve(L.top, L.topD, shade(L.top, -0.1), 1.25);
      break;
    case 'parka':
      if (ghost) sk.limb(pts, 1.1, L.top, { dark: L.topD });
      else sleeve(L.top, L.topD, L.top, 1.42);
      if (!ghost) {
        const c0 = lerp(a.e, a.h, 0.5);
        const c1 = lerp(a.e, a.h, 0.72);
        sk.limb([c0[0], c0[1], c1[0], c1[1]], 1.62, CLOTHES.snowFur, { dark: CLOTHES.snowFurD });
      }
      mitten(sk, L, a);
      return true;
    default:
      return false;
  }
  hand(sk, L, a, grip);
  return true;
}

// A big round mitten, its thumb up.
function mitten(sk: Sketch, L: Look, a: ArmRig): void {
  const dx = a.h[0] - a.e[0];
  const dy = a.h[1] - a.e[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const s = ux > 0 ? -1 : 1; // the side of the hand that is up on screen
  const nx = -uy * s;
  const ny = ux * s;
  const cx = a.h[0] + ux * 0.15;
  const cy = a.h[1] + uy * 0.15;
  sk.blob(circ(cx + nx * 0.58 - ux * 0.12, cy + ny * 0.58 - uy * 0.12, 0.32), L.hand, { dark: L.handD, d: 0.1 });
  sk.blob((p) => p.ellipse(cx, cy, 0.84, 0.72, Math.atan2(uy, ux), 0, TAU), L.hand, { dark: L.handD, d: 0.22 });
}

// Below the knee: a miner's boots and the knee patches on its overalls; a
// forager's shin wraps and soft boots; a parka's puffy fur-topped boots; a
// guard's gold side stripe; a devil's shoes, pointed (under the shoe).
function settingLeg(sk: Sketch, L: Look, g: LegRig, back: boolean, w: number): void {
  const boot = (from: number, wide: number) => {
    const b0 = lerp(g.kn, g.ft, from);
    sk.limb([b0[0], b0[1], g.ft[0], g.ft[1]], w + wide, L.shoe, { dark: L.shoeD });
    return b0;
  };
  switch (L.costume) {
    case 'miner':
      boot(0.5, 0.12);
      if (!back) sk.blob(circ(g.kn[0] + 0.1, g.kn[1] + 0.05, 0.52), shade(L.legs, -0.12), { line: 0.5, sil: false });
      return;
    case 'forager': {
      boot(0.62, 0.1);
      const w0 = lerp(g.kn, g.ft, 0.12);
      const w1 = lerp(g.kn, g.ft, 0.64);
      sk.limb([w0[0], w0[1], w1[0], w1[1]], w + 0.06, CLOTHES.wraps, { dark: shade(CLOTHES.wraps, -0.16) });
      sk.draw((p, k) => {
        if (k.px < 4) return;
        p.strokeStyle = alpha(k.ink, 0.5);
        p.lineWidth = k.line * 0.6;
        p.lineCap = 'round';
        p.beginPath();
        for (const t of [0.22, 0.4, 0.58]) {
          const [x, y] = lerp(g.kn, g.ft, t);
          p.moveTo(x - 0.75, y + 0.12);
          p.lineTo(x + 0.75, y - 0.2);
        }
        p.stroke();
      });
      return;
    }
    case 'parka': {
      // a fur roll round the boot's top
      const b0 = boot(0.42, 0.38);
      sk.limb([b0[0] - 0.62, b0[1] + 0.05, b0[0] + 0.62, b0[1] - 0.05], 0.62, CLOTHES.snowFur, { dark: CLOTHES.snowFurD });
      return;
    }
    case 'guard': {
      const e = lerp(g.kn, g.ft, 0.8);
      const o = back ? -0.4 : 0.4;
      sk.draw((p, k) => {
        p.beginPath();
        p.moveTo(g.hip[0] + o, g.hip[1] + 0.35);
        p.lineTo(g.kn[0] + o, g.kn[1]);
        p.lineTo(e[0] + o, e[1]);
        p.strokeStyle = CLOTHES.gilt;
        p.lineWidth = Math.max(0.2, 0.9 / k.px);
        p.lineCap = 'round';
        p.lineJoin = 'round';
        p.stroke();
      });
      return;
    }
    case 'demon': {
      const len = back ? 0.55 : 1.1;
      sk.at(mul(move(g.ft[0], g.ft[1]), turn(g.ang)), () => {
        sk.blob((p) => {
          p.moveTo(len - 0.55, 0.6);
          p.lineTo(len - 0.6, -0.42);
          p.quadraticCurveTo(len + 0.35, -0.42, len + 0.9, -0.85);
          p.quadraticCurveTo(len + 0.6, 0.15, len - 0.55, 0.6);
          p.closePath();
        }, L.shoe, { dark: L.shoeD, d: 0.15 });
      });
      return;
    }
  }
}

// On the shoe: a guard's black shoes shine.
function settingFoot(sk: Sketch, L: Look, g: LegRig, back: boolean): void {
  if (L.costume !== 'guard') return;
  const len = back ? 0.55 : 1.1;
  sk.at(mul(move(g.ft[0], g.ft[1]), turn(g.ang)), () => {
    sk.draw((p) => {
      p.beginPath();
      p.ellipse(len - 0.3, -0.18, 0.32, 0.11, -0.25, 0, TAU);
      p.fillStyle = alpha(WHITE, 0.85);
      p.fill();
    });
  });
}
