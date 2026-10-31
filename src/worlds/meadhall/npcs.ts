import { shade } from '../../art/iso.ts';
import { ease, env, rest, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import { apply, type Mat, move, mul, turn } from '../../art/figure/paint.ts';
import type { Sketch } from '../../art/figure/paint.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, Puppet, Swing } from '../types.ts';
import { C } from './kit.ts';
import type { P3 } from './kit.ts';
import { BAR, SKALD, THRONE } from './stations.ts';

// The Longhall's locals (see Npc in ../types.ts), on the shared puppet, in
// the figures' style and the hall's smoky brown ink: the skald on the
// bench behind the long table with her lyre, the smith at the anvil before
// the forge, the chieftain in the high seat (the table and the forge leave
// them room: see SKALD, ANVIL and THRONE in ./stations.ts). None wears
// the hall's iron helm or braids.

const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => (p: Pen) => p.ellipse(cx, cy, rx, ry, rot, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);
type Pt = [number, number];

// The inverse of a sketch frame: draws in the local's own frame from
// inside a part (the puppet's frames are similarities).
function inv(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

// Draws `fn` in the local's own frame (its feet at the origin, upright,
// unleaned), from inside any part.
const inFrame = (sk: Sketch, fn: () => void) => sk.at(inv(sk.m), fn);

// A point of the station's frame (u, v, z) in the frame of a local at
// (u0, v0), its frame lifted z0, facing +u (`along`): x along the screen
// toward where it faces, y down. A step along u is a unit across the
// screen and half a unit down; a step out (+v) a unit back and half down.
function along(u0: number, v0: number, z0: number, p: P3): Pt {
  const du = p[0] - u0;
  const dv = p[1] - v0;
  return [du - dv, (du + dv) / 2 - (p[2] - z0)];
}

// The swing that puts the hand of an arm `a` + `b` long, its shoulder at s,
// on t (both in the body's frame), the elbow kept low (bent forward, or
// back for a hand across the chest, which a three-quarter view shows so).
function reach(s: Pt, t: Pt, a: number, b: number): Swing {
  const dx = t[0] - s[0];
  const dy = t[1] - s[1];
  const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, Math.hypot(dx, dy)));
  const phi = Math.atan2(dx, dy);
  const at = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const el = Math.PI - Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - d * d) / (2 * a * b))));
  return Math.cos(phi - at) >= Math.cos(phi + at) ? { sh: phi - at, el } : { sh: phi + at, el: -el };
}

// A point of the local's own frame in its body's frame (the body lifted
// `bob` and leaning `lean`, see art/npc/puppet.ts).
function toBody(p: Puppet, t: Pt): Pt {
  return apply(turn(-p.lean), t[0], t[1] + p.bob);
}

// The turn that stands a drawing upright in the current part's frame:
// inside sk.at(turn(upTurn(sk))), -y is straight up on screen.
function upTurn(sk: Sketch): number {
  return -Math.atan2(sk.m[1], sk.m[0]);
}

// ── the skald ────────────────────────────────────────────────────────────
// On the back bench at the end of the long table, behind it: a skald with
// a mane of red hair loose down her back, freckles, a blue gown belted in
// leather, a green cloak pinned at the shoulder with a gold brooch, and a
// lyre of pale wood on her lap. At work she strums it, swaying, humming;
// her show is a saga: she rises, the lyre held high, her other arm sweeping
// wide as she sings.

const S = {
  skin: '#efc29c',
  skinD: '#cf9a72',
  freckle: '#c4805a',
  hair: '#c8502a',
  hairD: '#943618',
  gown: C.blue,
  gownD: '#2a4268',
  cloak: C.green,
  cloakD: '#2c4e32',
  belt: C.leatherDark,
  lyre: '#c08a52',
  lyreD: '#94643a',
  string: '#f3e6c0',
  boot: C.leather,
};
const SKALD_BONES: Bones = { neck: [0.3, -5.95], shoulders: [[-1.5, -5.4], [1.85, -5.45]], upper: 1.75, fore: 1.7 };

// A Germanic lyre, its foot at the origin, standing up -y: a soundbox, two
// arms joined by a rounded yoke, six strings from the tailpiece to the
// yoke.
function lyre(sk: Sketch): void {
  sk.blob((q) => {
    q.moveTo(-0.95, 0);
    q.lineTo(-1.05, -3.6);
    q.quadraticCurveTo(-1.05, -4.75, 0, -4.8);
    q.quadraticCurveTo(1.05, -4.75, 1.05, -3.6);
    q.lineTo(0.95, 0);
    q.quadraticCurveTo(0, 0.25, -0.95, 0);
    q.closePath();
    q.moveTo(-0.55, -2.25);
    q.lineTo(-0.6, -3.55);
    q.quadraticCurveTo(-0.55, -4.15, 0, -4.2);
    q.quadraticCurveTo(0.55, -4.15, 0.6, -3.55);
    q.lineTo(0.55, -2.25);
    q.closePath();
  }, S.lyre, { dark: S.lyreD, d: 0.25, rule: 'evenodd' });
  // a carved ring on the soundbox, the strings and the tailpiece
  sk.blob(circ(0, -1.25, 0.32), S.lyreD, { line: 0.4, sil: false });
  sk.draw((q, c) => {
    q.lineWidth = Math.max(0.09, 0.6 / c.px);
    q.strokeStyle = S.string;
    q.beginPath();
    for (let i = 0; i < 6; i++) {
      const x = -0.42 + i * 0.168;
      q.moveTo(x * 0.9, -0.35);
      q.lineTo(x, -3.95);
    }
    q.stroke();
  });
  sk.blob((q) => q.roundRect(-0.5, -0.45, 1.0, 0.3, 0.1), S.lyreD, { line: 0.5, sil: false });
}

// Where the lyre stands on her lap (its foot and its lean), and where her
// near hand strums across its strings.
const LAP: Pt = [1.25, -1.6];
const LYRE_LEAN = 0.18;
const STRUM: Pt = [1.95, -3.6];

const skaldParts: NpcParts = {
  body(sk, p, back) {
    // the cloak hanging behind her, the hair over it
    sk.blob((q) => {
      q.moveTo(-1.6, -5.9);
      q.quadraticCurveTo(-3.0, -3.8, -2.7, -0.6);
      q.lineTo(-0.6, -0.8);
      q.lineTo(-0.2, -5.4);
      q.closePath();
    }, S.cloak, { dark: S.cloakD, d: 0.3 });
    // the legs, seated: thighs forward, shins down, soft boots
    for (const [dy, near] of [[-0.3, false], [0.15, true]] as const) {
      sk.limb([-0.3, -1.6 + dy, 2.4, -1.35 + dy], 1.4, near ? S.gown : S.gownD, { dark: near ? S.gownD : null });
      sk.limb([2.5, -1.3 + dy, 2.75 + (near ? 0 : 0.35), 1.4 + dy], 1.0, near ? S.boot : C.leatherDark);
      sk.blob((q) => q.roundRect(2.25 + (near ? 0 : 0.35), 1.15 + dy, 1.6, 0.95, 0.42), near ? S.boot : C.leatherDark, { dark: C.leatherDark, d: 0.2 });
    }
    // the gown
    sk.blob((q) => {
      q.moveTo(-1.65, -5.75);
      q.quadraticCurveTo(0.35, -6.3, 2.1, -5.8);
      q.quadraticCurveTo(2.5, -3.6, 2.2, -2.3);
      q.lineTo(2.9, -1.6);
      q.lineTo(2.9, -0.5);
      q.quadraticCurveTo(0.8, -0.3, -1.55, -0.75);
      q.quadraticCurveTo(-2.0, -3.2, -1.65, -5.75);
      q.closePath();
    }, S.gown, { dark: S.gownD, d: 0.45 });
    sk.limb([-1.75, -2.55, 0.3, -2.7, 2.25, -2.55], 0.55, S.belt);
    if (!back) {
      sk.blob((q) => q.roundRect(0.55, -2.95, 0.6, 0.55, 0.12), C.gold, { line: 0.5, sil: false });
      // the cloak's edge over the near shoulder, the brooch pinning it
      sk.limb([-1.5, -5.75, -1.75, -4.4, -1.85, -3.0], 0.7, S.cloak, { dark: S.cloakD });
      sk.blob(circ(-1.15, -5.15, 0.5), C.gold, { dark: '#b08a2a', d: 0.12 });
      sk.blob(circ(-1.15, -5.15, 0.2), C.red, { line: 0.4, sil: false });
    }
    // the lyre on her lap (held high in her show)
    if (p.act !== 'show') sk.at(mul(move(...LAP), turn(LYRE_LEAN)), () => lyre(sk));
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    // the mane down her back
    sk.blob((q) => {
      q.moveTo(cx - 2.2, cy - 2.4);
      q.quadraticCurveTo(cx - 4.0, cy - 0.5, cx - 3.7, cy + 3.6);
      q.quadraticCurveTo(cx - 3.3, cy + 5.2, cx - 1.6, cy + 4.6);
      q.quadraticCurveTo(cx - 1.0, cy + 2.0, cx + 0.3, cy + 0.5);
      q.closePath();
    }, S.hair, { dark: S.hairD, d: 0.35 });
    sk.blob(ell(cx + (back ? 2.95 : -2.95), cy + 0.65, 0.6, 0.76), S.skin, { dark: S.skinD, d: 0.25 });
    sk.blob(ell(cx, cy, 3.2, 3.05), S.skin, { dark: S.skinD, d: 0.45 });
    // the hair over the top, parted, a lock over the near ear
    sk.blob((q) => {
      q.moveTo(cx - 3.25, cy + 1.6);
      q.quadraticCurveTo(cx - 3.75, cy - 3.0, cx + 0.3, cy - 3.45);
      q.quadraticCurveTo(cx + 3.4, cy - 3.3, cx + 3.35, cy - 0.7);
      q.quadraticCurveTo(cx + 2.4, cy - 2.05, cx + 0.9, cy - 2.2);
      q.quadraticCurveTo(cx - 0.3, cy - 1.6, cx - 1.6, cy - 1.5);
      q.quadraticCurveTo(cx - 2.5, cy - 0.6, cx - 2.35, cy + 1.6);
      q.closePath();
    }, S.hair, { dark: S.hairD, d: 0.3 });
    if (back) return;
    face(sk, { x: cx + 0.6, y: cy + 0.7, eyes: p.eyes, mouth: p.mouth, iris: '#3a5a3a' });
    for (const [dx, dy] of [[-0.95, 1.3], [-0.55, 1.55], [-0.75, 1.0], [2.1, 1.25], [2.35, 1.5]] as const) sk.blob(circ(cx + dx, cy + dy, 0.09), S.freckle, { line: 0, sil: false });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, SKALD_BONES.upper], 1.15, k ? S.gownD : S.gown, { dark: k ? null : S.gownD });
  },
  fore(sk, p, k) {
    const f = SKALD_BONES.fore;
    sk.limb([0, 0, 0, f - 0.4], 1.0, k ? S.gownD : S.gown, { dark: k ? null : S.gownD });
    sk.blob(circ(0, f - 0.05, 0.55), k ? S.skinD : S.skin, { dark: S.skinD, d: 0.18 });
    // the lyre raised high in her show, upright in her far hand
    if (k === 1 && p.act === 'show') sk.at(mul(move(0, f), turn(upTurn(sk) + 0.25)), () => sk.at(move(0, 0.6), () => lyre(sk)));
  },
};

// Strumming: the near hand sweeping down across the strings twice a loop,
// the far one behind the lyre's arm, swaying and humming.
const skaldWork: NpcLoop = {
  secs: 1.6,
  frames: 8,
  pose(u) {
    const sweep = (u * 2) % 1;
    const down = ease(sweep, 0, 0.5) - ease(sweep, 0.5, 1);
    const sway = Math.sin(u * TAU);
    const p: Puppet = { ...rest(), u, lean: 0.03 * sway, tilt: 0.08 * sway + 0.04, eyes: u > 0.4 && u < 0.62 ? 'shut' : 'open', mouth: sweep < 0.5 ? 'o' : 'smile' };
    const [s0, s1] = SKALD_BONES.shoulders as [Pt, Pt];
    const top: Pt = [LAP[0] + Math.sin(LYRE_LEAN) * 4.0, LAP[1] - Math.cos(LYRE_LEAN) * 4.0];
    return { ...p, arms: [reach(s0, toBody(p, [STRUM[0] - 0.2 * down, STRUM[1] + 1.1 * down]), SKALD_BONES.upper, SKALD_BONES.fore), reach(s1, toBody(p, [top[0] + 0.35, top[1] + 0.6]), SKALD_BONES.upper, SKALD_BONES.fore)] };
  },
};

// The saga: she rises from the bench, the lyre high, her near arm sweeping
// wide and back, singing out, swaying.
const skaldShow: NpcLoop & { crowd: 'watch' } = {
  secs: 3.2,
  frames: 16,
  crowd: 'watch',
  pose(u) {
    const sw = Math.sin(u * TAU * 2);
    const beat = Math.abs(Math.sin(u * TAU * 2));
    return {
      ...rest(),
      bob: 2.2 + 0.2 * beat,
      lean: -0.05 + 0.05 * sw,
      tilt: -0.14 + 0.06 * sw,
      arms: [{ sh: -1.75 - 0.45 * sw, el: 0.25 + 0.2 * beat }, { sh: 2.3 + 0.08 * sw, el: 0.2 }],
      eyes: beat > 0.7 ? 'shut' : 'happy',
      mouth: ['open', 'o', 'open', 'open'][Math.floor(u * 8) % 4] as Puppet['mouth'],
    };
  },
};

const skald: Npc = {
  name: 'skald',
  station: 'idle',
  // on the back bench at the table's end, the table hiding her lap
  place: { mode: 'seated', u: SKALD.u, v: SKALD.v, z: SKALD.z, top: SKALD.top, edge: SKALD.edge },
  tall: 12.5,
  bones: SKALD_BONES,
  parts: skaldParts,
  work: skaldWork,
  show: skaldShow,
};

// ── the smith ────────────────────────────────────────────────────────────
// Before the forge, at the anvil: a big bald smith with a bushy black beard,
// heavy brows, a soot smudge on its brow, bare arms in leather bracers, a
// charcoal shirt under a long leather apron. At work it holds the glowing
// bar on the anvil in its tongs (its near hand) and brings the hammer in
// its right hand down on it, two blows a loop, sparks flying off each.

const F = {
  skin: '#d99a70',
  skinD: '#b0744e',
  beard: '#3a2618',
  beardD: '#24160c',
  shirt: '#4a4644',
  shirtD: '#34302e',
  apron: C.leather,
  apronD: C.leatherDark,
  legs: '#5a4634',
  boot: '#3a2a1e',
  soot: '#5a4a44',
  iron: C.iron,
  ironD: C.ironDark,
};
const SMITH_BONES: Bones = { neck: [0.2, -7.95], shoulders: [[-2.05, -7.35], [2.1, -7.4]], upper: 1.85, fore: 1.75 };
const SMITH_AT = { u: 7.4, v: 12.5 };
// The bar on the anvil, in the smith's frame, and the spot it is struck.
const BAR_AT: [Pt, Pt] = [along(SMITH_AT.u, SMITH_AT.v, 0, BAR[0]), along(SMITH_AT.u, SMITH_AT.v, 0, BAR[1])];
const STRIKE: Pt = [BAR_AT[0][0] * 0.4 + BAR_AT[1][0] * 0.6, BAR_AT[0][1] * 0.4 + BAR_AT[1][1] * 0.6 - 0.2];
// The hammer's haft, hand to head; its angle (radians in the local's
// frame) on the bar and raised before its face.
const HAFT = 2.1;
const DOWN = 0.45;
const UP = -1.95;
// Where its tongs' grip is, in front of its apron, the jaws on the bar's
// near end.
const GRIP: Pt = [0.85, -5.55];

// How far up the hammer is (0 on the bar, 1 raised) at u of its work: two
// blows a loop, slow up, quick down.
function lift(u: number): number {
  const s = (u * 2) % 1;
  return s < 0.6 ? ease(s, 0, 0.6) : 1 - ease(s, 0.6, 1);
}
// Its hammer hand (the far one, its right) and the hammer's angle, `w` of
// the way up: from the blow up before its face and back down.
function swingAt(w: number): { hand: Pt; dir: number } {
  const dir = DOWN + (UP - DOWN) * w;
  const h0: Pt = [STRIKE[0] - HAFT * Math.cos(DOWN), STRIKE[1] - HAFT * Math.sin(DOWN)];
  const h1: Pt = [4.1, -10.2];
  const k = ease(w, 0, 1);
  return { hand: [h0[0] + (h1[0] - h0[0]) * k + 0.5 * Math.sin(w * Math.PI), h0[1] + (h1[1] - h0[1]) * k], dir };
}

// A spray of sparks off the blow at (x, y), `k` 1 at the blow, fading out.
function sparks(sk: Sketch, x: number, y: number, k: number): void {
  sk.draw((q, c) => {
    q.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * (0.08 + (i / 8) * 0.84) + (i % 2 ? 0.12 : -0.05);
      const r0 = 0.35 + (1 - k) * 1.2;
      const r1 = r0 + 0.6 + (i % 3) * 0.35;
      q.strokeStyle = i % 3 ? '#ffd36a' : '#fff4c8';
      q.lineWidth = Math.max(0.16, (k > 0.5 ? 1.0 : 0.7) / c.px) * (k > 0.5 ? 1.6 : 1.1);
      q.beginPath();
      q.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      q.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      q.stroke();
    }
    if (k > 0.5) {
      q.fillStyle = '#fff8e0';
      q.beginPath();
      q.arc(x, y, 0.45, 0, TAU);
      q.fill();
    }
  });
}

const smithParts: NpcParts = {
  body(sk, _p, back) {
    // legs and heavy boots
    for (const [x, near] of [[1.05, false], [-0.85, true]] as const) {
      sk.limb([x, -4.0, x + 0.1, -1.0], 1.5, near ? F.legs : shade(F.legs, -0.15), { dark: near ? shade(F.legs, -0.15) : null });
      sk.blob((q) => q.roundRect(x - 0.65, -1.3, 1.9, 1.3, 0.5), F.boot, { dark: shade(F.boot, -0.25), d: 0.2 });
    }
    // the shirt, broad in the shoulders
    sk.blob((q) => {
      q.moveTo(-2.35, -7.75);
      q.quadraticCurveTo(0.1, -8.45, 2.5, -7.8);
      q.quadraticCurveTo(2.85, -5.6, 2.35, -3.8);
      q.quadraticCurveTo(0.1, -3.3, -2.2, -3.8);
      q.quadraticCurveTo(-2.75, -5.6, -2.35, -7.75);
      q.closePath();
    }, F.shirt, { dark: F.shirtD, d: 0.45 });
    if (back) return;
    // the long apron, its strap round the neck, soot on it
    sk.blob((q) => {
      q.moveTo(-0.6, -7.4);
      q.lineTo(1.9, -7.45);
      q.quadraticCurveTo(2.75, -5.0, 2.7, -1.9);
      q.quadraticCurveTo(0.8, -1.5, -1.4, -1.9);
      q.quadraticCurveTo(-1.2, -5.0, -0.6, -7.4);
      q.closePath();
    }, F.apron, { dark: F.apronD, d: 0.35 });
    sk.limb([-0.4, -7.5, 0.6, -8.4, 1.7, -7.55], 0.3, F.apronD);
    sk.blob(ell(1.5, -3.6, 0.55, 0.32, 0.3), F.soot, { line: 0, sil: false });
    sk.blob(ell(0.3, -2.7, 0.4, 0.25, -0.2), F.soot, { line: 0, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    sk.blob(ell(cx + (back ? 2.95 : -2.95), cy + 0.6, 0.62, 0.78), F.skin, { dark: F.skinD, d: 0.25 });
    sk.blob(ell(cx, cy, 3.3, 3.15), F.skin, { dark: F.skinD, d: 0.45 });
    // the shine on its bald dome
    sk.blob(ell(cx - 1.1, cy - 2.2, 0.85, 0.4, -0.5), shade(F.skin, 0.25), { line: 0, sil: false });
    if (back) {
      sk.blob((q) => q.roundRect(cx - 2.6, cy + 0.2, 5.2, 2.6, 1.2), F.beard, { dark: F.beardD, d: 0.2 });
      return;
    }
    // the bushy beard from ear to ear, down over its chest
    sk.blob((q) => {
      q.moveTo(cx - 2.55, cy + 0.2);
      q.quadraticCurveTo(cx - 2.6, cy + 3.6, cx + 0.1, cy + 4.6);
      q.quadraticCurveTo(cx + 1.4, cy + 5.2, cx + 2.4, cy + 4.3);
      q.quadraticCurveTo(cx + 3.6, cy + 3.0, cx + 3.25, cy + 0.6);
      q.quadraticCurveTo(cx + 2.4, cy + 1.6, cx + 0.8, cy + 1.6);
      q.quadraticCurveTo(cx - 1.2, cy + 1.6, cx - 1.7, cy + 0.0);
      q.closePath();
    }, F.beard, { dark: F.beardD, d: 0.3 });
    face(sk, { x: cx + 0.65, y: cy + 0.55, eyes: p.eyes, mouth: p.mouth, drop: 1.6 });
    // heavy brows, soot on its brow
    sk.limb([cx - 0.95, cy - 0.5, cx + 0.25, cy - 0.35], 0.42, F.beard, { line: 0.4 });
    sk.limb([cx + 1.15, cy - 0.35, cx + 2.25, cy - 0.5], 0.38, F.beard, { line: 0.4 });
    sk.blob(ell(cx + 1.7, cy - 1.45, 0.55, 0.22, 0.2), F.soot, { line: 0, sil: false });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, SMITH_BONES.upper], 1.35, k ? F.skinD : F.skin, { dark: k ? null : F.skinD });
    sk.limb([0, 0, 0, 0.35], 1.45, k ? F.shirtD : F.shirt);
  },
  fore(sk, p, k) {
    const f = SMITH_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 1.15, k ? F.skinD : F.skin, { dark: k ? null : F.skinD });
    sk.limb([0, f - 1.15, 0, f - 0.45], 1.3, C.leather, { dark: C.leatherDark });
    if (p.act === 'work' && k === 0) {
      // the tongs from its near fist to the bar's near end
      const [hx, hy] = sk.where(0, f);
      inFrame(sk, () => {
        const [jx, jy] = BAR_AT[0];
        sk.limb([hx - 0.45, hy + 0.3, jx + 0.1, jy - 0.1], 0.2, F.iron, { dark: F.ironD });
        sk.limb([hx - 0.4, hy + 0.55, hx + 0.6, hy + 0.3, jx + 0.1, jy + 0.12], 0.2, F.iron, { dark: F.ironD });
      });
    }
    sk.blob(circ(0, f, 0.72), k ? F.skinD : F.skin, { dark: F.skinD, d: 0.2 });
    if (p.act !== 'work' || k !== 1) return;
    // the hammer in its far fist, and the sparks off a blow
    const w = lift(p.u);
    const { dir } = swingAt(w);
    const [hx, hy] = sk.where(0, f);
    inFrame(sk, () => {
      const [ex, ey] = [hx + HAFT * Math.cos(dir), hy + HAFT * Math.sin(dir)];
      sk.limb([hx - 0.45 * Math.cos(dir), hy - 0.45 * Math.sin(dir), ex, ey], 0.32, C.timberLight, { dark: C.timber });
      sk.at(mul(move(ex, ey), turn(dir)), () => sk.blob((q) => q.roundRect(-0.45, -0.95, 0.9, 1.9, 0.18), F.iron, { dark: F.ironD, d: 0.2 }));
      const s = (p.u * 2) % 1;
      if (s < 0.05) sparks(sk, STRIKE[0] + 0.35, STRIKE[1] + 0.25, 1);
      else if (s < 0.25) sparks(sk, STRIKE[0] + 0.35, STRIKE[1] + 0.25, 0.3);
    });
  },
};

// Two blows a loop: the hammer raised before its face and brought down on
// the bar, a lean into each, its eyes on the work; the tongs steady.
const smithWork: NpcLoop = {
  secs: 1.6,
  frames: 10,
  pose(u) {
    const w = lift(u);
    const s = (u * 2) % 1;
    const p: Puppet = { ...rest(), u, bob: -0.12 * (1 - w) * (s < 0.1 ? 1 : 0), lean: 0.08 - 0.12 * w, tilt: 0.14 - 0.08 * w, eyes: s < 0.1 ? 'shut' : 'open', mouth: s < 0.1 ? 'closed' : w > 0.8 ? 'o' : 'smile' };
    const [s0, s1] = SMITH_BONES.shoulders as [Pt, Pt];
    return { ...p, arms: [reach(s0, toBody(p, GRIP), SMITH_BONES.upper, SMITH_BONES.fore), reach(s1, toBody(p, swingAt(w).hand), SMITH_BONES.upper, SMITH_BONES.fore)] };
  },
};

const smith: Npc = {
  name: 'smith',
  station: 'run',
  // on the floor before the forge, at the anvil (deeper than it, so up and
  // to the right on screen)
  place: { mode: 'standing', u: SMITH_AT.u, v: SMITH_AT.v, look: 'along' },
  tall: 14.5,
  bones: SMITH_BONES,
  parts: smithParts,
  work: smithWork,
};

// ── the chieftain ────────────────────────────────────────────────────────
// In the high seat: a big old chieftain with a long white beard in two
// braids beaded in gold, a gold circlet with a red stone, a grey wolf-fur
// mantle over a blue tunic trimmed in gold, a red cloak and gold arm rings.
// At work it strokes its beard, then lifts its drinking horn in a toast;
// it celebrates holding the horn high, roaring.

const K = {
  skin: '#e2a982',
  skinD: '#c08560',
  beard: '#efeae0',
  beardD: '#c9c0ae',
  tunic: C.blue,
  tunicD: '#2a4268',
  cloak: C.red,
  cloakD: C.redDark,
  fur: C.wolf,
  furD: C.wolfDark,
  belt: C.leatherDark,
  legs: '#4a3a30',
  boot: C.leather,
  bootD: C.leatherDark,
};
const CHIEF_BONES: Bones = { neck: [0.2, -6.55], shoulders: [[-2.3, -5.95], [2.35, -6.0]], upper: 1.9, fore: 1.75 };

// A drinking horn held by its middle (the hand at the origin), its mouth up
// -y with a gold rim, curling down to a dark tip; `full` shows mead in it.
function drinkingHorn(sk: Sketch, full: boolean): void {
  sk.blob((q) => {
    q.moveTo(-0.6, -1.7);
    q.quadraticCurveTo(-0.65, 0.2, 0.3, 1.2);
    q.quadraticCurveTo(0.9, 1.7, 1.35, 1.55);
    q.quadraticCurveTo(0.85, 1.2, 0.55, 0.4);
    q.quadraticCurveTo(0.35, -0.6, 0.6, -1.7);
    q.closePath();
  }, C.horn, { dark: '#b89c6a', d: 0.25 });
  sk.limb([0.95, 1.4, 1.35, 1.55], 0.32, '#7a5a3a', { line: 0.5, sil: false });
  sk.blob(ell(0, -1.7, 0.62, 0.22), C.gold, { line: 0.6 });
  if (full) sk.blob(ell(0, -1.72, 0.45, 0.13), '#e8b04a', { line: 0, sil: false });
}

const chiefParts: NpcParts = {
  body(sk, _p, back) {
    // the red cloak behind, falling to the seat
    sk.blob((q) => {
      q.moveTo(-2.4, -6.7);
      q.quadraticCurveTo(-3.6, -3.6, -3.2, -0.6);
      q.lineTo(-0.8, -0.8);
      q.lineTo(-0.6, -6.2);
      q.closePath();
    }, K.cloak, { dark: K.cloakD, d: 0.35 });
    // the legs, seated: thighs forward, shins down to the footstool
    for (const [dy, near] of [[-0.3, false], [0.2, true]] as const) {
      sk.limb([-0.3, -1.6 + dy, 2.5, -1.35 + dy], 1.65, near ? K.legs : shade(K.legs, -0.15), { dark: near ? shade(K.legs, -0.15) : null });
      sk.limb([2.6, -1.3 + dy, 2.8 + (near ? 0 : 0.35), 1.3 + dy], 1.3, near ? K.boot : K.bootD, { dark: near ? K.bootD : null });
      sk.blob((q) => q.roundRect(2.2 + (near ? 0 : 0.35), 1.1 + dy, 1.95, 1.0, 0.45), near ? K.boot : K.bootD, { dark: K.bootD, d: 0.2 });
    }
    // the tunic, its skirt over the thighs, gold at the hem
    sk.blob((q) => {
      q.moveTo(-2.5, -6.3);
      q.quadraticCurveTo(0.2, -6.9, 2.65, -6.35);
      q.quadraticCurveTo(3.1, -4.0, 2.6, -2.3);
      q.lineTo(3.25, -1.6);
      q.lineTo(3.2, -0.4);
      q.quadraticCurveTo(0.8, -0.1, -2.1, -0.6);
      q.quadraticCurveTo(-2.9, -3.4, -2.5, -6.3);
      q.closePath();
    }, K.tunic, { dark: K.tunicD, d: 0.45 });
    sk.limb([3.2, -1.5, 3.15, -0.45, 0.8, -0.2, -2.0, -0.65], 0.32, C.gold, { line: 0.5 });
    sk.limb([-2.65, -2.7, 0.3, -2.85, 2.85, -2.7], 0.62, K.belt);
    if (!back) sk.blob((q) => q.roundRect(0.75, -3.2, 0.8, 0.7, 0.15), C.gold, { dark: '#b08a2a', d: 0.1 });
    // the wolf-fur mantle over its shoulders
    sk.blob((q) => {
      q.moveTo(-2.9, -6.2);
      q.quadraticCurveTo(0.2, -7.6, 3.0, -6.3);
      q.lineTo(3.05, -5.4);
      q.lineTo(2.5, -5.0);
      q.lineTo(2.1, -5.35);
      q.lineTo(1.5, -4.75);
      q.lineTo(0.9, -5.2);
      q.lineTo(0.2, -4.6);
      q.lineTo(-0.5, -5.15);
      q.lineTo(-1.2, -4.65);
      q.lineTo(-1.8, -5.2);
      q.lineTo(-2.5, -4.85);
      q.lineTo(-3.0, -5.4);
      q.closePath();
    }, K.fur, { dark: K.furD, d: 0.35 });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    // white hair down the back
    sk.blob((q) => {
      q.moveTo(cx - 2.0, cy - 2.6);
      q.quadraticCurveTo(cx - 3.9, cy - 0.6, cx - 3.4, cy + 3.4);
      q.lineTo(cx - 1.4, cy + 3.0);
      q.lineTo(cx + 0.2, cy + 0.4);
      q.closePath();
    }, K.beard, { dark: K.beardD, d: 0.3 });
    sk.blob(ell(cx + (back ? 2.95 : -2.95), cy + 0.6, 0.62, 0.78), K.skin, { dark: K.skinD, d: 0.25 });
    sk.blob(ell(cx, cy, 3.3, 3.15), K.skin, { dark: K.skinD, d: 0.45 });
    // white hair over the top, swept back
    sk.blob((q) => {
      q.moveTo(cx - 3.3, cy + 0.9);
      q.quadraticCurveTo(cx - 3.6, cy - 3.3, cx + 0.4, cy - 3.45);
      q.quadraticCurveTo(cx + 3.3, cy - 3.3, cx + 3.35, cy - 1.1);
      q.quadraticCurveTo(cx + 1.6, cy - 1.95, cx - 0.4, cy - 1.75);
      q.quadraticCurveTo(cx - 2.0, cy - 1.2, cx - 2.4, cy + 0.9);
      q.closePath();
    }, K.beard, { dark: K.beardD, d: 0.3 });
    // the gold circlet, a red stone on its brow
    sk.limb([cx - 3.15, cy - 0.6, cx - 1.0, cy - 1.75, cx + 1.5, cy - 1.95, cx + 3.25, cy - 1.35], 0.4, C.gold, { dark: '#b08a2a' });
    if (back) {
      sk.blob((q) => q.roundRect(cx - 2.7, cy + 0.4, 5.4, 3.6, 1.4), K.beard, { dark: K.beardD, d: 0.2 });
      return;
    }
    sk.blob(ell(cx + 1.05, cy - 1.85, 0.32, 0.38), C.red, { dark: C.redDark, d: 0.1 });
    // the long beard down over its chest, two braids at its foot beaded
    // in gold
    for (const bx of [cx + 0.0, cx + 1.7]) {
      sk.limb([bx, cy + 5.0, bx + 0.1, cy + 6.3], 0.5, K.beard, { dark: K.beardD });
      sk.blob((q) => q.roundRect(bx - 0.3, cy + 5.95, 0.65, 0.45, 0.12), C.gold, { line: 0.5 });
    }
    sk.blob((q) => {
      q.moveTo(cx - 2.6, cy + 0.0);
      q.quadraticCurveTo(cx - 2.8, cy + 3.6, cx - 0.4, cy + 5.4);
      q.quadraticCurveTo(cx + 1.0, cy + 6.0, cx + 2.3, cy + 5.3);
      q.quadraticCurveTo(cx + 3.7, cy + 3.4, cx + 3.25, cy + 0.4);
      q.quadraticCurveTo(cx + 2.4, cy + 1.4, cx + 0.8, cy + 1.45);
      q.quadraticCurveTo(cx - 1.2, cy + 1.4, cx - 1.8, cy - 0.1);
      q.closePath();
    }, K.beard, { dark: K.beardD, d: 0.3 });
    face(sk, { x: cx + 0.65, y: cy + 0.5, eyes: p.eyes, mouth: p.mouth, drop: 1.75 });
    // bushy white brows and the moustache over its mouth
    sk.limb([cx - 0.95, cy - 0.45, cx - 0.4, cy - 0.85, cx + 0.2, cy - 0.6], 0.42, K.beard, { line: 0.5 });
    sk.limb([cx + 1.2, cy - 0.6, cx + 1.75, cy - 0.85, cx + 2.3, cy - 0.5], 0.4, K.beard, { line: 0.5 });
    sk.blob((q) => {
      q.moveTo(cx + 0.7, cy + 1.25);
      q.quadraticCurveTo(cx - 0.7, cy + 1.15, cx - 1.1, cy + 2.4);
      q.quadraticCurveTo(cx - 0.2, cy + 1.85, cx + 0.7, cy + 1.85);
      q.quadraticCurveTo(cx + 1.7, cy + 1.85, cx + 2.5, cy + 2.35);
      q.quadraticCurveTo(cx + 2.1, cy + 1.15, cx + 0.7, cy + 1.25);
      q.closePath();
    }, K.beard, { dark: K.beardD, d: 0.15 });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, CHIEF_BONES.upper], 1.35, k ? K.tunicD : K.tunic, { dark: k ? null : K.tunicD });
  },
  fore(sk, p, k) {
    const f = CHIEF_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 1.15, k ? K.tunicD : K.tunic, { dark: k ? null : K.tunicD });
    sk.limb([0, f - 0.95, 0, f - 0.55], 1.3, C.gold, { dark: '#b08a2a' });
    sk.blob(circ(0, f, 0.72), k ? K.skinD : K.skin, { dark: K.skinD, d: 0.2 });
    // the horn of mead in its far hand, upright
    if (k === 1 && (p.act === 'work' || p.act === 'celebrate')) sk.at(mul(move(0, f), turn(upTurn(sk))), () => drinkingHorn(sk, true));
  },
};

// How far up in a toast the horn is, at u of its work.
const quaff = (u: number) => ease(u, 0.56, 0.68) - ease(u, 0.86, 0.96);
// Where its far hand holds the horn on its knee, and up beside its head.
const KNEE: Pt = [2.9, -2.6];
const TOAST: Pt = [3.3, -9.35];

// Two strokes down its beard with the near hand, the horn on its knee in
// the other, then the horn lifted beside its head in a toast and a nod.
const chiefWork: NpcLoop = {
  secs: 3.6,
  frames: 12,
  pose(u) {
    const q = quaff(u);
    const stroke = u < 0.5 ? (u / 0.25) % 1 : 0;
    const p: Puppet = { ...rest(), u, lean: -0.02, tilt: 0.05 + 0.1 * q, eyes: q > 0.5 ? 'happy' : u < 0.5 && stroke > 0.5 ? 'blink' : 'open', mouth: q > 0.5 ? 'open' : 'smile' };
    const [s0, s1] = CHIEF_BONES.shoulders as [Pt, Pt];
    const beard: Pt = [1.0 + 0.2 * stroke, -6.0 + 2.2 * Math.sin(stroke * Math.PI * 0.5)];
    const near = u < 0.5 ? beard : ([-1.6, -2.9] as Pt);
    const far: Pt = [KNEE[0] + (TOAST[0] - KNEE[0]) * q, KNEE[1] + (TOAST[1] - KNEE[1]) * q];
    return { ...p, arms: [reach(s0, toBody(p, near), CHIEF_BONES.upper, CHIEF_BONES.fore), reach(s1, toBody(p, far), CHIEF_BONES.upper, CHIEF_BONES.fore)] };
  },
};

// The horn held high and a roar, the other fist shaking.
const chiefCelebrate: NpcLoop = {
  secs: 2.0,
  frames: 10,
  pose(u) {
    const k = env(u, 0.2, 0.8);
    const shake = Math.sin(u * TAU * 3);
    return {
      ...rest(),
      lean: -0.05 * k,
      tilt: -0.12 * k,
      arms: [{ sh: 0.12 + (1.7 + 0.25 * shake) * k, el: 0.2 + 1.4 * k }, { sh: 0.12 + 2.65 * k, el: 0.2 - 0.05 * k }],
      eyes: k > 0.4 ? 'happy' : 'open',
      mouth: k > 0.4 ? 'open' : 'smile',
    };
  },
};

const chieftain: Npc = {
  name: 'chieftain',
  station: 'think',
  // in the high seat, on its fur, its boots on the footstool
  place: { mode: 'seated', u: THRONE.u, v: THRONE.v, z: THRONE.z },
  tall: 13.5,
  bones: CHIEF_BONES,
  parts: chiefParts,
  work: chiefWork,
  celebrate: chiefCelebrate,
};

export const NPCS: readonly Npc[] = [skald, smith, chieftain];
