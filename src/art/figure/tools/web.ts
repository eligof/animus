import type { Costume } from '../../../world/character.ts';
import { alpha } from '../../iso.ts';
import type { Color, Pen } from '../../types.ts';
import { move, type Ctx, type Sketch } from '../paint.ts';
import { BRASS, METAL, METAL_D, SCREEN, SLATE, TAU, WHITE, WOOD, WOOD_D, everyone, type Tool } from './tool.ts';

// The web pose's tools: held at the chest in both hands (from behind, held
// up and out at the side, see ../rig.ts), about 2.7 across, a glow round
// it allowed; `v` is the page (0 or 1) a swipe turns. Each costume's own
// below.

// The page a swipe has turned to.
const pageOf = (v: number) => (v >= 0.5 ? 1 : 0);

// A soft round glow, not part of the outline: drawn first, under what
// gives it off.
function glow(sk: Sketch, x: number, y: number, r: number, c: Color, a: number): void {
  sk.draw((p) => {
    p.beginPath();
    p.arc(x, y, r, 0, TAU);
    p.fillStyle = alpha(c, a);
    p.fill();
  });
}

// Strokes each polyline (x0, y0, x1, y1, ...) in one colour.
function lines(p: Pen, ls: readonly (readonly number[])[], c: Color, w: number): void {
  p.strokeStyle = c;
  p.lineWidth = w;
  p.lineCap = 'round';
  p.lineJoin = 'round';
  p.beginPath();
  for (const l of ls) {
    p.moveTo(l[0], l[1]);
    for (let i = 2; i < l.length; i += 2) p.lineTo(l[i], l[i + 1]);
  }
  p.stroke();
}

// Light lines (signal waves, a voice) with an ink rim, so they show on
// snow as on the dark.
function inked(p: Pen, c: Ctx, path: (p: Pen) => void, col: Color): void {
  const w = Math.max(0.12, 1 / c.px);
  p.lineCap = 'round';
  p.beginPath();
  path(p);
  p.strokeStyle = c.ink;
  p.lineWidth = w + 2 * c.line;
  p.stroke();
  p.beginPath();
  path(p);
  p.strokeStyle = col;
  p.lineWidth = w;
  p.stroke();
}

// A smooth closed shape round the points (x0, y0, x1, y1, ...), through
// the middle of each side.
function pebble(p: Pen, pts: readonly number[]): void {
  const n = pts.length / 2;
  const mid = (i: number): [number, number] => {
    const j = (i + 1) % n;
    return [(pts[2 * i] + pts[2 * j]) / 2, (pts[2 * i + 1] + pts[2 * j + 1]) / 2];
  };
  const [x0, y0] = mid(n - 1);
  p.moveTo(x0, y0);
  for (let i = 0; i < n; i++) {
    const [mx, my] = mid(i);
    p.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], mx, my);
  }
  p.closePath();
}

// A tablet: a slate case, a glowing screen with a picture and lines on it.
const tablet: Tool = {
  name: 'tablet',
  draw(sk, v, L) {
    sk.blob((p) => p.roundRect(-1.35, -1.0, 2.7, 2.0, 0.32), SLATE, { line: 0.6 });
    const page = v % 2;
    sk.draw((p, c) => {
      p.beginPath();
      p.arc(0, 0, 2.6, 0, TAU);
      p.fillStyle = alpha(SCREEN, 0.16);
      p.fill();
      p.beginPath();
      p.roundRect(-1.08, -0.75, 2.16, 1.5, 0.14);
      p.fillStyle = SCREEN;
      p.fill();
      if (c.px < 4.5) return;
      p.fillStyle = page ? L.color : '#ff9f6b';
      p.fillRect(-0.9, -0.58, 0.8, 0.55);
      p.fillStyle = alpha(SLATE, 0.45);
      p.fillRect(0.05, -0.55, 0.85, 0.14);
      p.fillRect(0.05, -0.3, 0.6, 0.14);
      p.fillRect(-0.9, 0.12, 1.8, 0.14);
      p.fillRect(-0.9, 0.38, 1.3, 0.14);
    });
  },
};

// A miner's crank radio: a wooden box, a round cloth speaker, an amber dial
// whose needle moves with the page, brass knobs, a wire aerial, and a crank
// on its side that turns over each swipe.
const AMBER = '#ffd98a';
const crankRadio: Tool = {
  name: 'crankRadio',
  draw(sk, v) {
    const k = pageOf(v);
    glow(sk, 0.55, -0.4, 1.1, '#ffc24a', 0.22);
    sk.limb([0.75, -0.8, 1.5, -2.25], 0.16, METAL, { dark: METAL_D });
    sk.blob((p) => p.arc(1.5, -2.3, 0.17, 0, TAU), METAL, { dark: METAL_D, d: 0.08 });
    // the crank, behind the box's side
    const [ex, ey] = k ? [1.85, 0.75] : [1.85, -0.55];
    sk.limb([1.15, 0.1, ex, ey], 0.24, METAL, { dark: METAL_D });
    sk.blob((p) => p.ellipse(ex + 0.12, ey, 0.24, 0.2, 0, 0, TAU), WOOD, { dark: WOOD_D, d: 0.1 });
    sk.blob((p) => p.roundRect(-1.45, -0.95, 2.65, 1.9, 0.28), WOOD, { dark: WOOD_D, d: 0.22 });
    sk.blob((p) => p.arc(1.15, 0.1, 0.2, 0, TAU), METAL, { dark: METAL_D, d: 0.08 });
    // the speaker: dark cloth behind three slots
    sk.blob((p) => p.arc(-0.65, 0.02, 0.6, 0, TAU), '#6b4a32', { dark: '#4f3524', d: 0.12 });
    sk.draw((p, c) => {
      if (c.px < 4.5) return;
      lines(p, [[-1.0, -0.22, -0.3, -0.22], [-1.08, 0.02, -0.22, 0.02], [-1.0, 0.26, -0.3, 0.26]], WOOD_D, 0.12);
    });
    // the dial: ticks along the top, a red needle
    sk.blob((p) => p.roundRect(0.1, -0.7, 0.9, 0.56, 0.12), AMBER, { line: 0.6 });
    sk.draw((p, c) => {
      if (c.px >= 4.5) {
        p.fillStyle = alpha('#7a4a1c', 0.7);
        for (let i = 0; i < 5; i++) p.fillRect(0.22 + i * 0.16, -0.6, 0.05, 0.14);
      }
      const nx = k ? 0.82 : 0.32;
      lines(p, [[nx, -0.63, nx, -0.21]], '#d8392b', Math.max(0.1, 1 / c.px));
    });
    // two knobs
    sk.blob((p) => p.arc(0.33, 0.43, 0.21, 0, TAU), BRASS, { dark: '#a37b2c', d: 0.1 });
    sk.blob((p) => p.arc(0.82, 0.43, 0.21, 0, TAU), BRASS, { dark: '#a37b2c', d: 0.1 });
  },
};

// A plasma orb: a dark glass globe on a black base, a hot core, tendrils
// of light to the glass that jump about with each swipe (one always to
// each hand on the glass).
const PLASMA = '#e58cff';
const plasmaOrb: Tool = {
  name: 'plasmaOrb',
  draw(sk, v) {
    const k = pageOf(v);
    glow(sk, 0, -0.45, 2.15, PLASMA, 0.2);
    sk.blob((p) => {
      p.moveTo(-0.72, 0.45);
      p.lineTo(0.72, 0.45);
      p.lineTo(1.15, 1.25);
      p.quadraticCurveTo(1.2, 1.45, 0.95, 1.45);
      p.lineTo(-0.95, 1.45);
      p.quadraticCurveTo(-1.2, 1.45, -1.15, 1.25);
      p.closePath();
    }, '#4b4558', { dark: '#2f2b39', d: 0.2 });
    sk.blob((p) => p.arc(0, -0.5, 1.24, 0, TAU), '#3b2a72', { dark: '#271b52', d: 0.3 });
    sk.draw((p, c) => {
      const cx = 0;
      const cy = -0.5;
      // degrees, y down: 155 and 24 reach the hands
      const angs = k ? [-150, -82, -20, 24, 100, 155] : [-118, -40, 24, 66, 155];
      const paths = angs.map((d, i) => {
        const a = (d * Math.PI) / 180;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const j = (i % 2 ? 1 : -1) * 0.16;
        return [cx + ux * 0.25, cy + uy * 0.25, cx + ux * 0.55 - uy * j, cy + uy * 0.55 + ux * j, cx + ux * 0.85 + uy * j, cy + uy * 0.85 - ux * j, cx + ux * 1.1, cy + uy * 1.1];
      });
      lines(p, paths, alpha(PLASMA, 0.45), 0.34);
      lines(p, paths, '#ffd9ff', Math.max(0.1, 1 / c.px));
      p.fillStyle = '#ffd9ff';
      for (const d of angs) {
        const a = (d * Math.PI) / 180;
        p.beginPath();
        p.arc(cx + Math.cos(a) * 1.1, cy + Math.sin(a) * 1.1, 0.12, 0, TAU);
        p.fill();
      }
      // the core
      p.beginPath();
      p.arc(cx, cy, 0.42, 0, TAU);
      p.fillStyle = alpha(PLASMA, 0.55);
      p.fill();
      p.beginPath();
      p.arc(cx, cy, 0.24, 0, TAU);
      p.fillStyle = '#fff0ff';
      p.fill();
      // a glint on the glass
      p.beginPath();
      p.arc(cx, cy, 0.95, 3.6, 4.3);
      p.strokeStyle = alpha(WHITE, 0.6);
      p.lineWidth = 0.14;
      p.stroke();
    });
  },
};

// A phone: a case in the agent's colour, a screen showing a picture (a sun
// over hills) and, a swipe on, a chat. From the front it is held sideways
// in both hands; from behind, upright in the one.
const phone: Tool = {
  name: 'phone',
  draw(sk, v, L, back) {
    const k = pageOf(v);
    // half its size across and up
    const [hw, hh] = back ? [0.72, 1.3] : [1.3, 0.72];
    const cy = back ? -0.2 : 0;
    glow(sk, 0, cy, 2.0, SCREEN, 0.14);
    sk.blob((p) => p.roundRect(-hw, cy - hh, 2 * hw, 2 * hh, 0.36), L.color, { line: 0.6 });
    sk.draw((p, c) => {
      const sw = hw - 0.25;
      const sh = hh - 0.25;
      p.beginPath();
      p.roundRect(-sw - 0.06, cy - sh - 0.06, 2 * sw + 0.12, 2 * sh + 0.12, 0.18);
      p.fillStyle = '#1d1b24';
      p.fill();
      p.save();
      p.beginPath();
      p.roundRect(-sw, cy - sh, 2 * sw, 2 * sh, 0.13);
      p.clip();
      p.fillStyle = k ? '#8ec2f2' : '#3b2f6e';
      p.fillRect(-sw, cy - sh, 2 * sw, 2 * sh);
      if (!k) {
        // a sun over hills, low on the screen
        p.beginPath();
        p.arc(sw * 0.3, cy + sh * 0.05, 0.26, 0, TAU);
        p.fillStyle = '#ff8fb1';
        p.fill();
        const y = cy + sh * 0.45;
        p.beginPath();
        p.moveTo(-sw, cy + sh);
        p.lineTo(-sw, y);
        p.quadraticCurveTo(-sw * 0.45, y - 0.4, sw * 0.05, y);
        p.quadraticCurveTo(sw * 0.55, y - 0.25, sw, y + 0.05);
        p.lineTo(sw, cy + sh);
        p.closePath();
        p.fillStyle = '#4fd1b0';
        p.fill();
      } else {
        // a chat: theirs in white, its own in its colour
        const rows = back ? 4 : 3;
        const gap = (2 * sh) / rows;
        for (let i = 0; i < rows; i++) {
          const mine = i % 2 === 1;
          const w = (mine ? 0.75 : i ? 0.55 : 0.9) * sw * (back ? 1.2 : 0.95);
          p.fillStyle = mine ? L.color : WHITE;
          p.beginPath();
          p.roundRect(mine ? sw - 0.12 - w : -sw + 0.12, cy - sh + gap * i + gap * 0.22, w, gap * 0.56, c.px < 4.5 ? 0 : 0.1);
          p.fill();
        }
      }
      p.restore();
      // the camera, at the screen's end
      p.beginPath();
      if (back) p.arc(0, cy - sh - 0.03, 0.05, 0, TAU);
      else p.arc(-sw - 0.03, 0, 0.05, 0, TAU);
      p.fillStyle = '#4a4757';
      p.fill();
    });
  },
};

// A hacker's laptop, held open: from the front, its lid's back covered in
// stickers (plain shapes) and the edge of the keys under it, the screen's
// light spilling over the top; from behind, over the shoulder, the screen
// (green lines of code a swipe scrolls) and the keys.
const CODE = '#5dff9a';
const LID = '#474c5a';
const DECK = '#9aa1b0';
const DECK_D = '#737a8a';
const laptop: Tool = {
  name: 'laptop',
  draw(sk, v, L, back) {
    const k = pageOf(v);
    if (!back) {
      glow(sk, 0, -1.1, 1.6, CODE, k ? 0.22 : 0.12);
      sk.blob((p) => p.roundRect(-1.65, 0.0, 3.3, 0.5, 0.18), DECK, { dark: DECK_D, d: 0.12 });
      sk.blob((p) => p.roundRect(-1.45, -1.65, 2.9, 1.8, 0.2), LID, { dark: '#353946', d: 0.2 });
      // the stickers
      sk.blob((p) => p.arc(-0.78, -1.08, 0.34, 0, TAU), L.color, { line: 0.5 });
      sk.blob((p) => {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + Math.PI / 6;
          const x = 0.62 + Math.cos(a) * 0.32;
          const y = -1.12 + Math.sin(a) * 0.32;
          if (i) p.lineTo(x, y);
          else p.moveTo(x, y);
        }
        p.closePath();
      }, '#ffd34a', { line: 0.5 });
      sk.blob((p) => p.roundRect(-0.95, -0.52, 0.85, 0.34, 0.12), '#ff7aa2', { line: 0.5 });
      sk.blob((p) => {
        // a bolt
        p.moveTo(0.62, -0.68);
        p.lineTo(0.3, -0.28);
        p.lineTo(0.55, -0.28);
        p.lineTo(0.42, 0.0);
        p.lineTo(0.85, -0.42);
        p.lineTo(0.6, -0.42);
        p.lineTo(0.75, -0.68);
        p.closePath();
      }, '#7fe3ff', { line: 0.5 });
      return;
    }
    glow(sk, 0, -0.85, 1.9, CODE, 0.16);
    // the keys, toward us
    sk.blob((p) => {
      p.moveTo(-1.35, 0.0);
      p.lineTo(1.35, 0.0);
      p.lineTo(1.7, 0.85);
      p.quadraticCurveTo(1.72, 1.02, 1.52, 1.02);
      p.lineTo(-1.52, 1.02);
      p.quadraticCurveTo(-1.72, 1.02, -1.7, 0.85);
      p.closePath();
    }, DECK, { dark: DECK_D, d: 0.12 });
    sk.draw((p, c) => {
      p.fillStyle = '#5d6372';
      if (c.px >= 4.5) {
        for (let r = 0; r < 3; r++) {
          const y = 0.1 + r * 0.18;
          const w = 2.6 + r * 0.25;
          for (let i = 0; i < 10; i++) p.fillRect(-w / 2 + 0.04 + (i * w) / 10, y, w / 10 - 0.08, 0.12);
        }
      }
      p.beginPath();
      p.roundRect(-0.38, 0.66, 0.76, 0.28, 0.06);
      p.fill();
    });
    // the screen
    sk.blob((p) => p.roundRect(-1.45, -1.65, 2.9, 1.75, 0.18), '#2b2f3a', { line: 0.6 });
    sk.draw((p, c) => {
      p.beginPath();
      p.roundRect(-1.27, -1.48, 2.54, 1.42, 0.08);
      p.fillStyle = '#0f2a20';
      p.fill();
      // lines of code: indent, length
      const code: Array<[number, number]> = k
        ? [[0.2, 1.1], [0.4, 0.8], [0.4, 1.4], [0.2, 0.6], [0, 0.9]]
        : [[0, 1.4], [0.2, 0.9], [0.4, 1.5], [0.4, 0.7], [0.2, 1.1]];
      const h = c.px < 4.5 ? 0.16 : 0.11;
      p.fillStyle = CODE;
      code.forEach(([x, w], i) => p.fillRect(-1.1 + x, -1.34 + i * 0.25, w, h));
      // the cursor
      p.fillRect(-1.1 + (k ? 0.95 : 1.35), -1.34 + 4 * 0.25 - 0.02, 0.12, h + 0.04);
    });
  },
};

// A holo projector: a metal puck with a ring of lights, a beam from its
// top and a hologram in it: a globe and, a swipe on, a cube. The emitter
// sits right of the middle, so the hologram clears a face (or, from
// behind, a helmet).
const HOLO = '#8ff6ff';
const holoProjector: Tool = {
  name: 'holoProjector',
  draw(sk, v) {
    const k = pageOf(v);
    const hx = 0.3;
    glow(sk, hx, -0.95, 1.75, HOLO, 0.14);
    sk.blob((p) => p.roundRect(-1.28, 0.32, 2.56, 0.92, 0.38), METAL, { dark: METAL_D, d: 0.15 });
    sk.blob((p) => p.ellipse(0, 0.48, 1.12, 0.26, 0, 0, TAU), '#cdd5e1', { line: 0.5 });
    sk.draw((p, c) => {
      // the lights round its side
      p.fillStyle = HOLO;
      if (c.px >= 4.5) {
        for (const x of [-0.8, -0.27, 0.27, 0.8]) {
          p.beginPath();
          p.arc(x, 0.94, 0.08, 0, TAU);
          p.fill();
        }
      }
      // the emitter and its beam
      p.beginPath();
      p.ellipse(hx, 0.48, 0.34, 0.1, 0, 0, TAU);
      p.fill();
      p.beginPath();
      p.moveTo(hx - 0.28, 0.46);
      p.lineTo(hx - 0.92, -0.5);
      p.lineTo(hx + 0.92, -0.5);
      p.lineTo(hx + 0.28, 0.46);
      p.closePath();
      p.fillStyle = alpha(HOLO, 0.22);
      p.fill();
      // the hologram
      const cx = hx;
      const cy = -1.35;
      const w = Math.max(0.12, 1 / c.px);
      p.strokeStyle = alpha(HOLO, 0.95);
      p.lineWidth = w;
      if (!k) {
        p.beginPath();
        p.arc(cx, cy, 0.9, 0, TAU);
        p.fillStyle = alpha(HOLO, 0.3);
        p.fill();
        p.stroke();
        p.beginPath();
        p.ellipse(cx, cy, 0.9, 0.28, 0, 0, TAU);
        p.moveTo(cx + 0.4, cy);
        p.ellipse(cx, cy, 0.4, 0.9, 0, 0, TAU);
        p.stroke();
      } else {
        // an iso cube: its outline, then the three edges to its near corner
        const r = 0.9;
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU - Math.PI / 2;
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        p.beginPath();
        pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
        p.closePath();
        p.fillStyle = alpha(HOLO, 0.3);
        p.fill();
        p.stroke();
        p.beginPath();
        for (const i of [1, 3, 5]) {
          p.moveTo(cx, cy);
          p.lineTo(pts[i][0], pts[i][1]);
        }
        p.stroke();
      }
    });
  },
};

// A forager's spore pod: a violet pod with a curled tip, its leaves where
// it was picked, glowing spots that brighten in turn with each swipe and
// spores drifting off it.
const POD = '#6a52a8';
const POD_D = '#463379';
const SPORE = '#62e8c4';
const SPORE_HOT = '#c8fff0';
const SPOTS: ReadonlyArray<readonly [number, number, number]> = [[-0.55, -0.5, 0.18], [0.42, -0.9, 0.14], [0.62, 0.12, 0.2], [-0.25, 0.5, 0.16], [-0.8, 0.22, 0.12], [0.08, -0.2, 0.14], [0.25, 0.78, 0.12], [-0.2, -1.15, 0.11]];
const sporeOrb: Tool = {
  name: 'sporeOrb',
  draw(sk, v) {
    const k = pageOf(v);
    glow(sk, 0, -0.2, 2.2, SPORE, 0.2);
    sk.limb([0, -1.55, 0.12, -1.95, 0.42, -2.12, 0.58, -1.92], 0.18, POD_D);
    // its stalk and leaves, where it was picked
    sk.limb([0, 1.2, 0.08, 1.75], 0.24, '#ece2c9', { dark: '#d6c4a2' });
    for (const [x, a] of [[-0.45, 0.7], [0.45, -0.7], [0, 0]] as const) {
      sk.blob((p) => p.ellipse(x, 1.2 + (x ? 0 : 0.12), 0.22, 0.4, a, 0, TAU), '#4f7d52', { dark: '#3a6044', d: 0.1 });
    }
    sk.blob((p) => {
      p.moveTo(0, -1.7);
      p.bezierCurveTo(0.55, -1.45, 1.25, -0.85, 1.22, 0.05);
      p.bezierCurveTo(1.2, 0.85, 0.65, 1.2, 0, 1.2);
      p.bezierCurveTo(-0.65, 1.2, -1.2, 0.85, -1.22, 0.05);
      p.bezierCurveTo(-1.25, -0.85, -0.55, -1.45, 0, -1.7);
      p.closePath();
    }, POD, { dark: POD_D, d: 0.3 });
    sk.draw((p, c) => {
      if (c.px >= 4.5) {
        // the pod's ribs
        p.strokeStyle = POD_D;
        p.lineWidth = 0.1;
        p.beginPath();
        p.moveTo(0, -1.55);
        p.quadraticCurveTo(-0.95, -0.2, -0.05, 1.1);
        p.moveTo(0, -1.55);
        p.quadraticCurveTo(0.95, -0.2, 0.05, 1.1);
        p.stroke();
      }
      SPOTS.forEach(([x, y, r], i) => {
        const hot = i % 2 === k;
        if (hot) {
          p.beginPath();
          p.arc(x, y, r * 2, 0, TAU);
          p.fillStyle = alpha(SPORE, 0.45);
          p.fill();
        }
        p.beginPath();
        p.arc(x, y, r, 0, TAU);
        p.fillStyle = hot ? SPORE_HOT : '#3fbf9e';
        p.fill();
      });
      // spores drifting up
      p.fillStyle = alpha(SPORE_HOT, 0.85);
      const motes = k ? [[-1.45, -1.3], [1.35, -1.75], [-0.85, -2.2], [1.6, -0.6]] : [[-1.5, -0.8], [1.4, -1.25], [-0.95, -1.75], [1.65, -0.1]];
      for (const [x, y] of motes) {
        p.beginPath();
        p.arc(x, y, 0.1, 0, TAU);
        p.fill();
      }
    });
  },
};

// A walkie-talkie: a chunky yellow body, a rubber aerial and knob, a
// little green display over a speaker grille; a swipe on, it talks (a red
// light, waves off the aerial). It sits a little right of the middle, the
// left hand on its talk button.
const CASE = '#f2b134';
const CASE_D = '#c98a1e';
const RUBBER = '#33303a';
const RUBBER_D = '#211f27';
const radio: Tool = {
  name: 'radio',
  draw(sk, v) {
    const k = pageOf(v);
    sk.push(move(0.2, 0));
    sk.limb([0.45, -0.9, 0.45, -1.92], 0.34, RUBBER, { dark: RUBBER_D });
    // the knob on top, the talk button on its side
    sk.blob((p) => p.roundRect(-0.68, -1.34, 0.44, 0.42, 0.1), RUBBER, { dark: RUBBER_D, d: 0.1 });
    sk.blob((p) => p.roundRect(-1.13, -0.55, 0.3, 0.75, 0.1), RUBBER, { dark: RUBBER_D, d: 0.08 });
    sk.blob((p) => p.roundRect(-0.98, -1.05, 1.96, 2.3, 0.36), CASE, { dark: CASE_D, d: 0.25 });
    sk.blob((p) => p.roundRect(-0.62, -0.8, 1.24, 0.48, 0.1), '#bfe6a8', { line: 0.5 });
    sk.blob((p) => p.roundRect(-0.55, -0.06, 1.1, 0.9, 0.18), RUBBER, { line: 0.5 });
    sk.draw((p, c) => {
      // the grille's slots
      if (c.px >= 4.5) lines(p, [[-0.33, 0.16, 0.33, 0.16], [-0.33, 0.39, 0.33, 0.39], [-0.33, 0.62, 0.33, 0.62]], '#5b5866', 0.11);
      // signal bars on the display
      p.fillStyle = '#3d6b3a';
      const n = k ? 4 : 2;
      for (let i = 0; i < n; i++) p.fillRect(-0.47 + i * 0.2, -0.43 - i * 0.07, 0.12, 0.08 + i * 0.07);
      // the light by the aerial
      p.beginPath();
      p.arc(-0.05, -0.92, 0.09, 0, TAU);
      p.fillStyle = k ? '#ff4a3d' : '#5be36a';
      p.fill();
      if (k) {
        // waves off the aerial's tip
        const arcs = (pp: Pen) => {
          for (const r of [0.36, 0.6]) {
            pp.moveTo(0.45 + Math.cos(-1.1) * r, -1.98 + Math.sin(-1.1) * r);
            pp.arc(0.45, -1.98, r, -1.1, -0.1);
            pp.moveTo(0.45 + Math.cos(Math.PI + 0.1) * r, -1.98 + Math.sin(Math.PI + 0.1) * r);
            pp.arc(0.45, -1.98, r, Math.PI + 0.1, Math.PI + 1.1);
          }
        };
        inked(p, c, arcs, '#ffe27a');
      }
    });
    sk.pop();
  },
};

// A guard's telephone handset: black, its back arched between the cups,
// a gloss along it, a curly cord swinging under it; a swipe on, a voice
// at the ear.
const BAKELITE = '#3d3844';
const BAKELITE_D = '#25212b';
const handset: Tool = {
  name: 'handset',
  draw(sk, v) {
    const k = pageOf(v);
    sk.draw((p, c) => {
      // the cord: a coil from the mouthpiece swinging down
      const ax = 1.05;
      const ay = 0.55;
      const bx = k ? 0.55 : -0.05;
      const by = 2.2;
      const N = 7;
      p.beginPath();
      for (let i = 0; i <= 120; i++) {
        const t = i / 120;
        const cx = ax + (bx - ax) * t + Math.sin(t * Math.PI) * 0.25;
        const cy = ay + (by - ay) * t;
        const f = t * N * TAU;
        const x = cx + Math.cos(f) * 0.2;
        const y = cy + Math.sin(f) * 0.12;
        if (i) p.lineTo(x, y);
        else p.moveTo(x, y);
      }
      p.strokeStyle = RUBBER_D;
      p.lineWidth = Math.max(0.13, 1.2 / c.px);
      p.lineJoin = 'round';
      p.stroke();
    });
    sk.blob((p) => {
      p.moveTo(-2.05, 0.75);
      p.quadraticCurveTo(-2.2, -0.05, -1.7, -0.35);
      p.quadraticCurveTo(0, -1.0, 1.7, -0.35);
      p.quadraticCurveTo(2.2, -0.05, 2.05, 0.75);
      p.lineTo(0.95, 0.75);
      p.quadraticCurveTo(0.95, 0.35, 1.15, 0.12);
      p.quadraticCurveTo(0, -0.35, -1.15, 0.12);
      p.quadraticCurveTo(-0.95, 0.35, -0.95, 0.75);
      p.closePath();
    }, BAKELITE, { dark: BAKELITE_D, d: 0.2 });
    sk.draw((p, c) => {
      // the gloss, and the cups' rims
      p.strokeStyle = alpha(WHITE, 0.5);
      p.lineCap = 'round';
      p.lineWidth = 0.13;
      p.beginPath();
      p.moveTo(-1.1, -0.45);
      p.quadraticCurveTo(0, -0.8, 1.1, -0.45);
      p.stroke();
      p.fillStyle = '#5a5463';
      p.fillRect(-1.95, 0.6, 0.95, 0.12);
      p.fillRect(1.0, 0.6, 0.95, 0.12);
      if (k) {
        // a voice at the ear
        inked(p, c, (pp) => {
          for (const r of [0.32, 0.6]) {
            pp.moveTo(-1.5 + Math.cos(0.6) * r, 0.9 + Math.sin(0.6) * r);
            pp.arc(-1.5, 0.9, r, 0.6, 1.9);
          }
        }, '#ffe27a');
      }
    });
  },
};

// A demon's scrying mirror: a gilt hand mirror with little horns on its
// crest and a red stone at its neck; in the dark glass a ghost's face and,
// a swipe on, a slit-pupilled eye.
const GILT = '#e2b03a';
const GILT_D = '#a8761e';
const GHOST = '#c9ffe6';
const scryingMirror: Tool = {
  name: 'scryingMirror',
  draw(sk, v) {
    const k = pageOf(v);
    glow(sk, 0, -0.45, 2.0, k ? '#ff7a4a' : GHOST, 0.16);
    sk.limb([0, 0.8, 0, 2.0], 0.44, GILT, { dark: GILT_D });
    sk.blob((p) => p.arc(0, 2.12, 0.26, 0, TAU), GILT, { dark: GILT_D, d: 0.1 });
    for (const s of [-1, 1]) {
      sk.blob((p) => {
        p.moveTo(s * 0.95, -1.3);
        p.quadraticCurveTo(s * 1.32, -1.8, s * 1.02, -2.4);
        p.quadraticCurveTo(s * 0.72, -2.0, s * 0.22, -1.8);
        p.closePath();
      }, '#ecdfc2', { dark: '#c9b48e', d: 0.12 });
    }
    sk.blob((p) => p.ellipse(0, -0.45, 1.16, 1.38, 0, 0, TAU), GILT, { dark: GILT_D, d: 0.25 });
    sk.blob((p) => p.ellipse(0, -0.45, 0.86, 1.08, 0, 0, TAU), '#2a1838', { dark: '#1b0f26', d: 0.15, line: 0.6 });
    sk.blob((p) => p.arc(0, 0.93, 0.18, 0, TAU), '#d8283a', { line: 0.5 });
    sk.draw((p, c) => {
      p.save();
      p.beginPath();
      p.ellipse(0, -0.45, 0.86, 1.08, 0, 0, TAU);
      p.clip();
      if (!k) {
        // a ghost's face rising in the glass
        p.beginPath();
        p.moveTo(-0.55, 0.45);
        p.lineTo(-0.55, -0.6);
        p.arc(0, -0.6, 0.55, Math.PI, 0);
        p.lineTo(0.55, 0.45);
        p.quadraticCurveTo(0.37, 0.25, 0.18, 0.45);
        p.quadraticCurveTo(0, 0.25, -0.18, 0.45);
        p.quadraticCurveTo(-0.37, 0.25, -0.55, 0.45);
        p.closePath();
        p.fillStyle = alpha(GHOST, 0.85);
        p.fill();
        p.fillStyle = '#2a1838';
        p.beginPath();
        p.ellipse(-0.22, -0.55, 0.11, 0.16, 0, 0, TAU);
        p.ellipse(0.22, -0.55, 0.11, 0.16, 0, 0, TAU);
        p.fill();
        if (c.px >= 4.5) {
          p.beginPath();
          p.ellipse(0, -0.1, 0.1, 0.14, 0, 0, TAU);
          p.fill();
        }
      } else {
        // an eye looking back
        p.beginPath();
        p.moveTo(-0.7, -0.45);
        p.quadraticCurveTo(0, -1.05, 0.7, -0.45);
        p.quadraticCurveTo(0, 0.15, -0.7, -0.45);
        p.closePath();
        p.fillStyle = '#ffe6c8';
        p.fill();
        p.beginPath();
        p.arc(0, -0.45, 0.3, 0, TAU);
        p.fillStyle = '#ff6a2a';
        p.fill();
        p.beginPath();
        p.ellipse(0, -0.45, 0.08, 0.26, 0, 0, TAU);
        p.fillStyle = '#1b0f26';
        p.fill();
      }
      p.restore();
      // a glint
      p.beginPath();
      p.ellipse(0, -0.45, 0.7, 0.92, 0, 3.55, 4.15);
      p.strokeStyle = alpha(WHITE, 0.55);
      p.lineWidth = 0.13;
      p.lineCap = 'round';
      p.stroke();
    });
  },
};

// A nord's rune stone: a grey river stone carved with four runes (lines,
// no letters); two glow cold blue at a time, the other two a swipe on.
const STONE = '#8f8f86';
const STONE_D = '#6a6a62';
const RUNE = '#8fe8ff';
const RUNES: ReadonlyArray<readonly [number, number, readonly (readonly number[])[]]> = [
  [-0.55, -0.55, [[0, -0.38, 0, 0.38], [0, -0.38, 0.3, -0.18], [0, -0.12, 0.3, 0.08]]],
  [0.5, -0.6, [[0, -0.38, 0, 0.38], [-0.27, -0.12, 0, -0.38, 0.27, -0.12]]],
  [-0.5, 0.45, [[-0.25, -0.35, 0.25, 0.35], [0.25, -0.35, -0.25, 0.35]]],
  [0.5, 0.42, [[0, -0.38, 0, 0.38], [-0.28, -0.36, 0, -0.06, 0.28, -0.36]]],
];
const runeStone: Tool = {
  name: 'runeStone',
  draw(sk, v) {
    const k = pageOf(v);
    glow(sk, 0, 0, 2.1, RUNE, 0.15);
    sk.blob((p) => pebble(p, [-1.2, -1.05, -0.35, -1.6, 0.8, -1.42, 1.4, -0.6, 1.32, 0.6, 0.72, 1.38, -0.45, 1.42, -1.32, 0.78, -1.48, -0.22]), STONE, { dark: STONE_D, d: 0.3 });
    // moss in a crack at its foot
    sk.blob((p) => p.ellipse(-0.75, 1.05, 0.42, 0.2, -0.4, 0, TAU), '#6f9a4e', { line: 0.4 });
    sk.draw((p, c) => {
      RUNES.forEach(([x, y, strokes], i) => {
        const ls = strokes.map((l) => l.map((q, j) => q + (j % 2 ? y : x)));
        const lit = k ? i === 1 || i === 2 : i === 0 || i === 3;
        if (lit) {
          lines(p, ls, alpha(RUNE, 0.45), 0.36);
          lines(p, ls, '#e6fbff', Math.max(0.13, 1 / c.px));
        } else lines(p, ls, '#4a4a44', Math.max(0.13, 1 / c.px));
      });
    });
  },
};

export const WEBS: Record<Costume, Tool> = {
  ...everyone(tablet),
  miner: crankRadio,
  scientist: plasmaOrb,
  raver: phone,
  casual: phone,
  hacker: laptop,
  astronaut: holoProjector,
  exosuit: holoProjector,
  forager: sporeOrb,
  parka: radio,
  drifter: radio,
  jumpsuit: radio,
  colonist: radio,
  guard: handset,
  demon: scryingMirror,
  nord: runeStone,
};
