import type { Costume } from '../../../world/character.ts';
import { alpha, mix, shade } from '../../iso.ts';
import type { Color } from '../../types.ts';
import { hole, move, mul, turn, type Sketch } from '../paint.ts';
import { BRASS, METAL, METAL_D, SCREEN, TAU, WHITE, everyone, type Tool } from './tool.ts';

// The search pose's tools: held out at arm's length, the handle at the
// hand along +x, the business end round x 2 (it sweeps in small circles);
// out at the side, so it shows from behind too. Each costume's own below.

// How a tool is held on screen, read off the sketch's frame: `up` is the
// way up as an angle in the tool's own frame (so a lantern hangs plumb and
// a flame rises however the arm turns it), `a` how far its +x is turned
// (it changes as the hand sweeps, so a needle can twitch with it).
function held(sk: Sketch): { up: number; a: number } {
  const [a, b, c, d] = sk.m;
  const det = a * d - b * c || 1;
  return { up: Math.atan2(-a / det, c / det), a: Math.atan2(b, a) };
}

// A frame whose -y is up on screen.
const upright = (sk: Sketch) => turn(held(sk).up + Math.PI / 2);

// A soft glow round (x, y), r units out.
function halo(sk: Sketch, x: number, y: number, r: number, c: Color, a: number): void {
  sk.draw((p) => {
    const g = p.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, alpha(c, a));
    g.addColorStop(1, alpha(c, 0));
    p.beginPath();
    p.arc(x, y, r, 0, TAU);
    p.fillStyle = g;
    p.fill();
  });
}

// A short bright stroke: a glint on glass, a glow stick's core.
function glint(sk: Sketch, pts: readonly number[], c: Color = alpha(WHITE, 0.9), w = 0.2): void {
  sk.draw((p, k) => {
    p.strokeStyle = c;
    p.lineWidth = Math.max(w, 1 / k.px);
    p.lineCap = 'round';
    p.lineJoin = 'round';
    p.beginPath();
    p.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    p.stroke();
  });
}

// A magnifying glass with a brass rim.
const magnifier: Tool = {
  name: 'magnifier',
  draw(sk) {
    sk.limb([-0.3, 0, 1.0, 0], 0.42, '#7a4a2c', { line: 0.6 });
    sk.blob((p) => {
      p.arc(2.05, 0, 1.05, 0, TAU);
      hole(p, 2.05, 0, 0.72, 0.72);
    }, BRASS, { dark: shade(BRASS, -0.2), d: 0.18 });
    sk.draw((p, c) => {
      p.beginPath();
      p.arc(2.05, 0, 0.72, 0, TAU);
      p.fillStyle = alpha('#d6f2ff', 0.45);
      p.fill();
      p.beginPath();
      p.arc(2.05, 0, 0.5, Math.PI * 1.05, Math.PI * 1.5);
      p.strokeStyle = alpha(WHITE, 0.9);
      p.lineWidth = Math.max(0.2, 1 / c.px);
      p.lineCap = 'round';
      p.stroke();
    });
  },
};

// A hand lantern held out by its wire bail, hanging (swung a little out)
// whatever way the arm turns: a red tin cap and base, a flame in the glass.
const TIN = '#c2452f';
const TIN_D = '#8c2f22';
const lantern: Tool = {
  name: 'lantern',
  draw(sk) {
    sk.at(mul(mul(upright(sk), turn(-0.4)), move(0, -0.12)), () => {
      halo(sk, 0, 1.18, 1.22, '#ffcf6a', 0.55);
      const bail: number[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = Math.PI * (1 + k / 12);
        bail.push(0.72 * Math.cos(t), 0.5 + 1.05 * Math.sin(t));
      }
      sk.limb(bail, 0.14, METAL_D, { line: 0.6 });
      sk.blob((p) => p.ellipse(0, 1.22, 0.76, 0.6, 0, 0, TAU), '#fff1b8', { dark: '#ffd36a', d: 0.2 });
      // the flame in the glass
      sk.blob((p) => {
        p.moveTo(0, 0.84);
        p.quadraticCurveTo(0.32, 1.27, 0.17, 1.5);
        p.quadraticCurveTo(0, 1.62, -0.17, 1.5);
        p.quadraticCurveTo(-0.32, 1.27, 0, 0.84);
        p.closePath();
      }, '#ff9c3a', { line: 0, sil: false });
      sk.blob((p) => p.roundRect(-0.2, 0.1, 0.4, 0.3, 0.08), TIN_D, { line: 0.6 });
      sk.blob((p) => {
        p.moveTo(-0.94, 0.72);
        p.lineTo(-0.44, 0.3);
        p.lineTo(0.44, 0.3);
        p.lineTo(0.94, 0.72);
        p.closePath();
      }, TIN, { dark: TIN_D, d: 0.14 });
      sk.blob((p) => p.roundRect(-0.94, 1.72, 1.88, 0.36, 0.12), TIN, { dark: TIN_D, d: 0.12 });
      glint(sk, [-0.48, 1.24, -0.38, 0.98], alpha(WHITE, 0.95), 0.16);
    });
  },
};

// A geiger counter: a yellow box with a dial, its probe out in front, held
// by the grip at its back; the needle jumps as the hand sweeps.
const HAZARD = '#efc23a';
const HAZARD_D = '#c48c26';
const geigerCounter: Tool = {
  name: 'geigerCounter',
  draw(sk) {
    const { a } = held(sk);
    sk.at(turn(-0.3), () => {
      sk.limb([2.3, 0, 3.4, 0.08], 0.46, METAL, { dark: METAL_D, line: 0.6 });
      sk.limb([3.35, 0.08, 3.7, 0.1], 0.56, '#3c3f48', { line: 0.6 });
      sk.limb([-0.35, 0.1, 0.7, 0.1], 0.5, '#3c3f48', { dark: '#2a2c33', line: 0.6 });
      sk.blob((p) => p.roundRect(0.35, -1.3, 2.2, 1.75, 0.32), HAZARD, { dark: HAZARD_D, d: 0.22 });
      sk.blob((p) => p.arc(1.3, -0.45, 0.6, 0, TAU), '#f6f0dc', { line: 0.6 });
      sk.blob((p) => p.arc(2.2, -0.95, 0.17, 0, TAU), '#ff5a4a', { line: 0.6 });
      sk.draw((p, c) => {
        const cx = 1.3;
        const cy = -0.2;
        p.lineCap = 'round';
        p.lineWidth = Math.max(0.1, 0.8 / c.px);
        p.strokeStyle = c.ink;
        p.beginPath();
        p.arc(cx, cy, 0.4, -Math.PI / 2 - 0.95, -Math.PI / 2 + 0.45);
        p.stroke();
        p.strokeStyle = '#e0402f';
        p.lineWidth = Math.max(0.14, 1 / c.px);
        p.beginPath();
        p.arc(cx, cy, 0.4, -Math.PI / 2 + 0.5, -Math.PI / 2 + 0.95);
        p.stroke();
        const n = -Math.PI / 2 + 0.85 * Math.sin(a * 11);
        p.strokeStyle = c.ink;
        p.lineWidth = Math.max(0.12, 1 / c.px);
        p.beginPath();
        p.moveTo(cx, cy);
        p.lineTo(cx + 0.5 * Math.cos(n), cy + 0.5 * Math.sin(n));
        p.stroke();
      });
    });
  },
};

// A glow stick in the raver's own colour, raised: a soft glow round a
// bright tube, a white-hot core, a clear cap.
const glowStick: Tool = {
  name: 'glowStick',
  draw(sk, _v, L) {
    const hot = mix(L.color, WHITE, 0.35);
    sk.at(turn(-0.85), () => {
      sk.draw((p) => {
        p.lineCap = 'round';
        p.beginPath();
        p.moveTo(0.4, 0);
        p.lineTo(2.75, 0);
        p.strokeStyle = alpha(L.color, 0.2);
        p.lineWidth = 1.5;
        p.stroke();
        p.strokeStyle = alpha(L.color, 0.3);
        p.lineWidth = 1.05;
        p.stroke();
      });
      sk.limb([-0.25, 0, 2.85, 0], 0.6, hot, { dark: L.color, line: 0.6 });
      glint(sk, [0.6, -0.1, 2.5, -0.1], alpha(WHITE, 0.9), 0.16);
      sk.blob((p) => p.roundRect(2.75, -0.34, 0.4, 0.68, 0.14), '#eef2f4', { dark: '#c9d0d6', d: 0.08 });
    });
  },
};

// A flashlight: a dark barrel with a switch in the agent's colour, a
// flared head, a soft cone of light from the lens.
const BARREL = '#4f586b';
const BARREL_D = '#363d4c';
const flashlight: Tool = {
  name: 'flashlight',
  draw(sk, _v, L) {
    sk.draw((p) => {
      const g = p.createLinearGradient(2.6, 0, 4.15, 0);
      g.addColorStop(0, alpha('#ffe680', 0.8));
      g.addColorStop(1, alpha('#ffe680', 0.15));
      p.beginPath();
      p.moveTo(2.6, -0.58);
      p.lineTo(4.05, -1.4);
      p.quadraticCurveTo(4.3, 0, 4.05, 1.4);
      p.lineTo(2.6, 0.58);
      p.closePath();
      p.fillStyle = g;
      p.fill();
    });
    sk.limb([-0.5, 0, 1.6, 0], 0.74, BARREL, { dark: BARREL_D, line: 0.6 });
    sk.draw((p, c) => {
      p.strokeStyle = alpha(c.ink, 0.6);
      p.lineWidth = c.line;
      p.beginPath();
      for (const x of [-0.2, 0.08]) {
        p.moveTo(x, -0.3);
        p.lineTo(x, 0.3);
      }
      p.stroke();
    });
    sk.blob((p) => {
      p.moveTo(1.35, -0.38);
      p.lineTo(2.35, -0.74);
      p.quadraticCurveTo(2.62, -0.76, 2.62, -0.48);
      p.lineTo(2.62, 0.48);
      p.quadraticCurveTo(2.62, 0.76, 2.35, 0.74);
      p.lineTo(1.35, 0.38);
      p.closePath();
    }, METAL, { dark: METAL_D, d: 0.16 });
    sk.blob((p) => p.ellipse(2.63, 0, 0.16, 0.56, 0, 0, TAU), '#fff8d0', { line: 0.6 });
    sk.blob((p) => p.roundRect(0.5, -0.64, 0.55, 0.26, 0.08), L.color, { line: 0.6 });
  },
};

// A handheld scanner: a white shell on a dark grip, a screen with a blip,
// and a little fan of scan rings from its emitter (they ride out as the
// hand sweeps).
const SHELL = '#e3e8f0';
const SHELL_D = '#b5bfce';
const CYAN = '#5ce8ff';
const scanner: Tool = {
  name: 'scanner',
  draw(sk, _v, L) {
    const { a } = held(sk);
    sk.at(turn(-0.2), () => {
      sk.draw((p, c) => {
        const x = 2.8;
        const y = -0.25;
        p.beginPath();
        p.moveTo(x, y);
        p.arc(x, y, 1.3, -0.55, 0.55);
        p.closePath();
        p.fillStyle = alpha(CYAN, 0.22);
        p.fill();
        p.strokeStyle = alpha(CYAN, 0.9);
        p.lineWidth = Math.max(0.13, 1 / c.px);
        p.lineCap = 'round';
        const off = (((a * 7) % 1) + 1) % 1;
        for (let k = 0; k < 3; k++) {
          const r = 0.4 + (k + off) * 0.3;
          p.beginPath();
          p.arc(x, y, r, -0.5, 0.5);
          p.stroke();
        }
      });
      sk.limb([-0.35, 0.15, 0.8, 0.15], 0.52, '#3a4152', { dark: '#2a2f3d', line: 0.6 });
      sk.blob((p) => p.roundRect(0.35, -1.05, 2.35, 1.6, 0.42), SHELL, { dark: SHELL_D, d: 0.2 });
      sk.blob((p) => p.roundRect(0.68, -0.8, 1.3, 0.9, 0.16), '#13283a', { line: 0.6 });
      sk.draw((p, c) => {
        p.strokeStyle = SCREEN;
        p.lineWidth = Math.max(0.1, 0.9 / c.px);
        p.lineCap = 'round';
        p.beginPath();
        p.moveTo(0.85, -0.3);
        p.lineTo(1.1, -0.3);
        p.lineTo(1.22, -0.58);
        p.lineTo(1.38, -0.06);
        p.lineTo(1.5, -0.3);
        p.lineTo(1.82, -0.3);
        p.stroke();
      });
      sk.blob((p) => p.roundRect(2.18, -0.66, 0.24, 0.44, 0.08), L.color, { line: 0.6 });
      sk.blob((p) => p.roundRect(2.62, -0.62, 0.3, 0.74, 0.12), CYAN, { dark: '#2fb6d6', d: 0.08 });
    });
  },
};

// A big glowing mushroom held by its stem: a pale stalk, a bright cap
// with paler spots, a soft glow round it.
const STALK = '#ece2c9';
const STALK_D = '#c8b994';
const CAP = '#55dcc2';
const CAP_D = '#2a9f92';
const glowingMushroom: Tool = {
  name: 'glowingMushroom',
  draw(sk) {
    // the stem curving out from the fist to the cap, out at the side
    sk.limb([-0.05, 0.75, 0.15, -0.15, 0.8, -0.95], 0.66, STALK, { dark: STALK_D, line: 0.6 });
    sk.at(move(0.85, -1.0), () => {
      halo(sk, 0, -0.5, 1.45, '#62e8c4', 0.5);
      // the gills under the cap
      sk.blob((p) => p.ellipse(0, 0, 1.25, 0.28, 0, 0, TAU), '#d8f6e4', { line: 0.6 });
      sk.blob((p) => {
        p.moveTo(-1.55, -0.02);
        p.bezierCurveTo(-1.5, -1.6, 1.5, -1.6, 1.55, -0.02);
        p.quadraticCurveTo(0, 0.3, -1.55, -0.02);
        p.closePath();
      }, CAP, { dark: CAP_D, d: 0.3 });
      sk.draw((p) => {
        p.fillStyle = '#e4fff6';
        for (const [x, y, r] of [[-0.7, -0.5, 0.22], [0.25, -0.9, 0.2], [0.93, -0.36, 0.17], [-0.15, -0.3, 0.13]] as const) {
          p.beginPath();
          p.arc(x, y, r, 0, TAU);
          p.fill();
        }
      });
    });
  },
};

// A jeweller's loupe on a short handle: a silver handle and gold collar,
// a stubby black barrel seen a little from the side, a small bright lens.
const CHROME = '#cdd5dc';
const CHROME_D = '#97a3af';
const GOLD = '#f2c14e';
const GOLD_D = '#c48f2a';
const BLACK = '#5a5866';
const BLACK_D = '#3e3c48';
const loupe: Tool = {
  name: 'loupe',
  draw(sk) {
    sk.limb([-0.3, 0, 1.05, 0], 0.38, CHROME, { dark: CHROME_D, line: 0.6 });
    sk.blob((p) => p.roundRect(0.95, -0.3, 0.36, 0.6, 0.1), GOLD, { dark: GOLD_D, d: 0.1 });
    // the barrel, seen a little from the side and narrowing to its back,
    // a gold band round it; then its face, a thick black rim round a
    // small lens
    sk.limb([1.68, 0.36, 2.28, -0.04], 1.3, BLACK, { dark: BLACK_D, line: 0.6 });
    sk.draw((p, c) => {
      p.strokeStyle = GOLD;
      p.lineWidth = Math.max(0.2, 1.4 / c.px);
      p.beginPath();
      p.ellipse(1.86, 0.24, 0.24, 0.65, Math.atan2(-0.4, 0.6), Math.PI / 2, (Math.PI * 3) / 2);
      p.stroke();
    });
    sk.blob((p) => p.arc(2.28, -0.04, 0.84, 0, TAU), BLACK, { dark: BLACK_D, d: 0.14 });
    sk.blob((p) => p.arc(2.28, -0.04, 0.58, 0, TAU), GOLD, { dark: GOLD_D, d: 0.08, line: 0.4 });
    sk.draw((p) => {
      p.beginPath();
      p.arc(2.28, -0.04, 0.42, 0, TAU);
      p.fillStyle = '#c8ecff';
      p.fill();
    });
    glint(sk, [2.1, 0.04, 2.12, -0.14, 2.22, -0.24], alpha(WHITE, 0.95), 0.14);
  },
};

// A crystal ball held out on a short iron rod, gold talons gripping it: a
// violet glass with smoke curling inside and a glow round it.
const BALL = '#b55ee0';
const BALL_D = '#7c34b0';
const IRON = '#4a3f48';
const IRON_D = '#2f262e';
const crystalBall: Tool = {
  name: 'crystalBall',
  draw(sk) {
    sk.at(turn(-0.75), () => {
      halo(sk, 2.1, 0, 1.45, '#d77bff', 0.45);
      sk.limb([-0.35, 0, 1.25, 0], 0.4, IRON, { dark: IRON_D, line: 0.6 });
      sk.blob((p) => p.arc(-0.45, 0, 0.3, 0, TAU), GOLD, { dark: GOLD_D, d: 0.1 });
      sk.blob((p) => p.arc(2.1, 0, 0.92, 0, TAU), BALL, { dark: BALL_D, d: 0.3 });
      sk.draw((p, c) => {
        p.strokeStyle = alpha('#f6d2ff', 0.85);
        p.lineWidth = Math.max(0.16, 1 / c.px);
        p.lineCap = 'round';
        p.beginPath();
        p.moveTo(1.7, 0.35);
        p.bezierCurveTo(2.0, -0.45, 2.55, 0.1, 2.25, 0.3);
        p.bezierCurveTo(2.0, 0.45, 2.2, -0.1, 2.5, -0.25);
        p.stroke();
      });
      glint(sk, [2.55, -0.45, 2.75, -0.12], alpha(WHITE, 0.95), 0.18);
      // the talons, curling up round the ball
      for (const s of [-1, 1]) {
        sk.blob((p) => {
          p.moveTo(1.1, 0.12 * s);
          p.quadraticCurveTo(1.1, 0.95 * s, 1.95, 1.0 * s);
          p.quadraticCurveTo(1.45, 0.72 * s, 1.35, 0.06 * s);
          p.closePath();
        }, GOLD, { dark: GOLD_D, d: 0.1 });
      }
      sk.blob((p) => {
        p.moveTo(1.05, -0.2);
        p.lineTo(1.6, 0);
        p.lineTo(1.05, 0.2);
        p.closePath();
      }, GOLD, { dark: GOLD_D, d: 0.08 });
    });
  },
};

// A dowsing rod: a forked stick, both prongs in the hand, the stem out
// level with its tip twitching.
const ROD = '#b48450';
const ROD_D = '#7e5630';
const dowsingRod: Tool = {
  name: 'dowsingRod',
  draw(sk) {
    sk.at(turn(-0.45), () => {
      sk.limb([-0.15, 0.5, 0.75, 0.25, 1.55, 0.02], 0.32, ROD, { dark: ROD_D, line: 0.6 });
      sk.limb([-0.15, -0.5, 0.75, -0.25, 1.55, 0, 2.6, 0.08, 3.5, 0.35], 0.34, ROD, { dark: ROD_D, line: 0.6 });
      sk.draw((p, c) => {
        p.strokeStyle = c.ink;
        p.lineWidth = Math.max(c.line * 1.4, 1 / c.px);
        p.lineCap = 'round';
        p.beginPath();
        p.moveTo(3.45, -0.15);
        p.lineTo(3.6, -0.5);
        p.moveTo(3.85, 0.0);
        p.lineTo(4.15, -0.25);
        p.moveTo(3.8, 0.7);
        p.lineTo(4.1, 0.9);
        p.stroke();
      });
    });
  },
};

// A burning torch: a timber shaft, a head wrapped in pitch-soaked cloth,
// a flame that rises (and flickers) whichever way the torch points.
const TIMBER = '#94693f';
const TIMBER_D = '#664624';
const PITCH = '#5a3a24';
const PITCH_D = '#3c2616';
const torch: Tool = {
  name: 'torch',
  draw(sk) {
    const h = held(sk);
    const t = -0.45;
    sk.at(turn(t), () => {
      sk.limb([-0.55, 0, 1.75, 0], 0.46, TIMBER, { dark: TIMBER_D, line: 0.6 });
      sk.blob((p) => p.roundRect(1.5, -0.46, 1.05, 0.92, 0.32), PITCH, { dark: PITCH_D, d: 0.12 });
      sk.draw((p, c) => {
        p.strokeStyle = alpha(c.ink, 0.7);
        p.lineWidth = c.line;
        p.beginPath();
        for (const x of [1.78, 2.12]) {
          p.moveTo(x - 0.12, -0.42);
          p.lineTo(x + 0.16, 0.42);
        }
        p.stroke();
      });
    });
    const f = 0.2 * Math.sin(h.a * 23);
    sk.at(mul(move(2.05 * Math.cos(t), 2.05 * Math.sin(t)), turn(h.up + Math.PI / 2)), () => {
      halo(sk, 0, -0.75, 1.25, '#ff9a3d', 0.45);
      sk.blob((p) => {
        p.moveTo(-0.66, -0.1);
        p.quadraticCurveTo(-0.8, -0.9, -0.25 + f * 0.5, -1.2);
        p.quadraticCurveTo(-0.12, -1.5, f, -1.8);
        p.quadraticCurveTo(0.55, -1.25, 0.36 + f * 0.5, -1.02);
        p.quadraticCurveTo(0.84, -0.66, 0.66, -0.1);
        p.quadraticCurveTo(0, 0.3, -0.66, -0.1);
        p.closePath();
      }, '#ff8a3d', { dark: '#e8602a', d: 0.14 });
      sk.blob((p) => {
        p.moveTo(-0.38, -0.18);
        p.quadraticCurveTo(-0.44, -0.8, f * 0.6, -1.22);
        p.quadraticCurveTo(0.5, -0.74, 0.38, -0.18);
        p.quadraticCurveTo(0, 0.06, -0.38, -0.18);
        p.closePath();
      }, '#ffc94a', { line: 0, sil: false });
      sk.blob((p) => p.ellipse(0, -0.34, 0.18, 0.3, 0, 0, TAU), '#fff0b0', { line: 0, sil: false });
    });
  },
};

// A brass spyglass, drawn out: the eyepiece and two draw tubes stepping
// out to a leather-bound barrel, its flared end and lens; held level.
const BRASS_D = shade(BRASS, -0.22);
const LEATHER = '#6e4630';
const LEATHER_D = '#4c2e1e';
const spyglass: Tool = {
  name: 'spyglass',
  draw(sk) {
    sk.at(turn(-0.5), () => {
      sk.limb([-0.95, 0, -0.45, 0], 0.38, BRASS_D, { line: 0.6 });
      sk.limb([-0.5, 0, 0.85, 0], 0.56, BRASS, { dark: BRASS_D, line: 0.6 });
      sk.limb([0.85, 0, 1.95, 0], 0.78, BRASS, { dark: BRASS_D, line: 0.6 });
      sk.blob((p) => p.roundRect(1.9, -0.55, 1.55, 1.1, 0.14), LEATHER, { dark: LEATHER_D, d: 0.14 });
      for (const [x, r] of [[0.72, 0.4], [1.85, 0.6]] as const) sk.blob((p) => p.roundRect(x, -r, 0.24, 2 * r, 0.08), BRASS, { dark: BRASS_D, d: 0.08 });
      sk.blob((p) => {
        p.moveTo(3.35, -0.6);
        p.lineTo(3.85, -0.72);
        p.lineTo(3.85, 0.72);
        p.lineTo(3.35, 0.6);
        p.closePath();
      }, BRASS, { dark: BRASS_D, d: 0.1 });
      sk.blob((p) => p.ellipse(3.86, 0, 0.12, 0.6, 0, 0, TAU), '#bfe6ff', { line: 0.6 });
    });
  },
};

export const SEARCHES: Record<Costume, Tool> = {
  ...everyone(magnifier),
  miner: lantern,
  parka: lantern,
  scientist: geigerCounter,
  jumpsuit: geigerCounter,
  raver: glowStick,
  hacker: flashlight,
  astronaut: scanner,
  exosuit: scanner,
  forager: glowingMushroom,
  guard: loupe,
  demon: crystalBall,
  drifter: dowsingRod,
  nord: torch,
  colonist: spyglass,
};
