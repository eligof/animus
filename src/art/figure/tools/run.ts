import type { Costume } from '../../../world/character.ts';
import type { Color, Pen } from '../../types.ts';
import { alpha, shade } from '../../iso.ts';
import { hole, move, mul, turn, type Sketch } from '../paint.ts';
import { BRASS, METAL, METAL_D, SLATE, TAU, WHITE, WOOD, WOOD_D, everyone, type Tool } from './tool.ts';

// The run pose's tools: swung, the handle at the hand along +x, the head
// out to about 3.2; `v` is 1 on the strike (marks of the blow, a spill, a
// stamp's print). The swing comes down on the +y side, so the blow lands
// there. Raised over the head it shows from behind. Each costume's own
// below.

// ---- the strike's marks ------------------------------------------------------

// Lines drawn over everything (no outline of their own): `color` over a
// line of ink, or ink alone.
function lines(sk: Sketch, segs: readonly (readonly number[])[], color: Color | null = null): void {
  sk.draw((p, c) => {
    const w = Math.max(c.line, 1 / c.px);
    p.lineCap = 'round';
    p.lineJoin = 'round';
    const path = () => {
      p.beginPath();
      for (const s of segs) {
        p.moveTo(s[0], s[1]);
        for (let i = 2; i < s.length; i += 2) p.lineTo(s[i], s[i + 1]);
      }
    };
    path();
    p.strokeStyle = c.ink;
    p.lineWidth = color ? w * 2.6 : w;
    p.stroke();
    if (color) {
      path();
      p.strokeStyle = color;
      p.lineWidth = w * 1.3;
      p.stroke();
    }
  });
}

// Marks of a blow: short strokes fanning out from (x, y) at angles `as`,
// from r0 to r1.
const fan = (x: number, y: number, as: readonly number[], r0: number, r1: number): number[][] =>
  as.map((a) => [x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1]);

// The bits a blow throws (sparks, drops, chips) stay out of the outline
// round the figure and have only a thin edge, so small ones are not all ink.
const BIT = { sil: false, line: 0.4 } as const;

// A four-pointed spark.
function spark(sk: Sketch, x: number, y: number, r: number, fill: Color): void {
  sk.blob((p) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU - Math.PI / 2;
      const rr = k % 2 ? r * 0.42 : r;
      if (k === 0) p.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
      else p.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    p.closePath();
  }, fill, BIT);
}

// A round drop, a bubble.
function dot(sk: Sketch, x: number, y: number, r: number, fill: Color, dark: Color | null = null): void {
  sk.blob((p) => p.arc(x, y, r, 0, TAU), fill, { ...BIT, dark, d: r * 0.3 });
}

// A chip (wood, soil, ice) flying off, w by h, turned a.
function chip(sk: Sketch, x: number, y: number, w: number, h: number, a: number, fill: Color, dark: Color): void {
  sk.at(mul(move(x, y), turn(a)), () => {
    sk.blob((p) => {
      p.moveTo(-w / 2, -h / 2);
      p.lineTo(w / 2, -h * 0.3);
      p.lineTo(w * 0.35, h / 2);
      p.lineTo(-w * 0.45, h * 0.35);
      p.closePath();
    }, fill, { ...BIT, dark, d: 0.06 });
  });
}

const YELLOW = '#ffd34a';
const ORANGE = '#ff9b3d';

// A grip wrapped round a handle: bands of `color` across it from x0 to x1.
function wrap(sk: Sketch, x0: number, x1: number, r: number, color: Color, dark: Color): void {
  sk.blob((p) => p.roundRect(x0, -r, x1 - x0, 2 * r, r * 0.5), color, { dark, d: 0.12 });
  sk.draw((p, c) => {
    p.strokeStyle = alpha(c.ink, 0.55);
    p.lineWidth = c.line * 0.8;
    p.beginPath();
    for (let x = x0 + 0.3; x < x1 - 0.1; x += 0.3) {
      p.moveTo(x - 0.08, -r);
      p.lineTo(x + 0.08, r);
    }
    p.stroke();
  });
}

// ---- the tools ---------------------------------------------------------------

// A mallet: a wooden handle, a steel head, marks of the blow on the strike.
const mallet: Tool = {
  name: 'mallet',
  draw(sk, v) {
    sk.limb([-0.45, 0, 2.3, 0], 0.42, WOOD, { dark: WOOD_D, line: 0.6 });
    sk.blob((p) => p.roundRect(2.05, -0.82, 1.15, 1.64, 0.3), METAL, { dark: METAL_D, d: 0.25 });
    if (v) {
      sk.draw((p, c) => {
        p.strokeStyle = c.ink;
        p.lineWidth = Math.max(c.line, 1 / c.px);
        p.lineCap = 'round';
        p.beginPath();
        for (const a of [-0.9, 0, 0.9]) {
          const dx = Math.cos(a);
          const dy = Math.sin(a);
          p.moveTo(3.55 + dx * 0.3, dy * 1.2);
          p.lineTo(3.55 + dx * 1.0, dy * 1.9);
        }
        p.stroke();
      });
    }
  },
};

// A miner's pick: a long ash handle, an iron head arching over its end to
// two points that curve back toward the hand; sparks off the struck point.
const pickaxe: Tool = {
  name: 'pickaxe',
  draw(sk, v) {
    sk.limb([-0.5, 0, 2.95, 0], 0.42, WOOD, { dark: WOOD_D, line: 0.6 });
    sk.blob((p) => {
      p.moveTo(2.45, -2.1);
      p.quadraticCurveTo(3.35, -1.65, 3.62, -0.5);
      p.lineTo(3.62, 0.5);
      p.quadraticCurveTo(3.35, 1.65, 2.45, 2.1);
      p.quadraticCurveTo(2.95, 1.2, 2.85, 0.45);
      p.lineTo(2.85, -0.45);
      p.quadraticCurveTo(2.95, -1.2, 2.45, -2.1);
      p.closePath();
    }, '#8d96a6', { dark: '#5f6676', d: 0.22 });
    // the eye's wedge
    lines(sk, [[3.22, -0.32, 3.22, 0.32]]);
    if (v) {
      lines(sk, fan(2.9, 1.95, [-0.5, 0.1, 0.65], 0.4, 0.8), YELLOW);
      spark(sk, 4.0, 1.4, 0.45, YELLOW);
      spark(sk, 1.85, 2.15, 0.3, ORANGE);
    }
  },
};

// A conical flask of something green, held by its corked neck; shaken on
// the strike, it sloshes up the glass, fizzes and bubbles over.
const GLASS = '#dff2f4';
const GLASS_D = '#b4d6dc';
const BREW = '#86dd4f';
const BREW_D = '#58b437';
function flaskPath(p: Pen): void {
  p.moveTo(-0.2, -0.5);
  p.lineTo(0.12, -0.5);
  p.lineTo(0.12, -0.38);
  p.lineTo(1.25, -0.38);
  p.lineTo(2.95, -1.5);
  p.quadraticCurveTo(3.4, -1.75, 3.4, -1.25);
  p.lineTo(3.4, 1.25);
  p.quadraticCurveTo(3.4, 1.75, 2.95, 1.5);
  p.lineTo(1.25, 0.38);
  p.lineTo(0.12, 0.38);
  p.lineTo(0.12, 0.5);
  p.lineTo(-0.2, 0.5);
  p.closePath();
}
const flask: Tool = {
  name: 'flask',
  draw(sk, v) {
    sk.blob((p) => p.roundRect(-0.75, -0.34, 0.65, 0.68, 0.14), '#c9955c', { dark: '#a0703f', d: 0.1 });
    sk.blob(flaskPath, GLASS, { dark: GLASS_D, d: 0.2 });
    sk.draw((p, c) => {
      p.save();
      p.beginPath();
      flaskPath(p);
      p.clip();
      // the brew, flung to the base; sloshed up the glass on the strike
      p.beginPath();
      if (v) {
        p.moveTo(1.5, -1.8);
        p.bezierCurveTo(2.4, -0.9, 1.4, -0.3, 2.0, 0.2);
        p.bezierCurveTo(2.5, 0.6, 1.9, 1.2, 2.3, 1.8);
      } else {
        p.moveTo(2.2, -1.8);
        p.quadraticCurveTo(2.05, 0, 2.2, 1.8);
      }
      p.lineTo(3.6, 1.8);
      p.lineTo(3.6, -1.8);
      p.closePath();
      p.fillStyle = BREW;
      p.fill();
      p.strokeStyle = BREW_D;
      p.lineWidth = c.line * 1.2;
      p.stroke();
      p.fillStyle = BREW_D;
      p.fillRect(3.05, -1.8, 0.6, 3.6);
      // bubbles in it
      p.strokeStyle = alpha(WHITE, 0.9);
      p.lineWidth = Math.max(c.line * 0.9, 1 / c.px);
      const bs: Array<[number, number, number]> = v ? [[2.55, -0.6, 0.2], [2.9, 0.3, 0.15], [2.5, 0.95, 0.12], [2.25, 0.35, 0.1]] : [[2.7, -0.35, 0.14], [2.85, 0.55, 0.1]];
      for (const [x, y, r] of bs) {
        p.beginPath();
        p.arc(x, y, r, 0, TAU);
        p.stroke();
      }
      p.restore();
      // a glint down the glass, and two marks of measure
      p.lineCap = 'round';
      p.strokeStyle = alpha(WHITE, 0.95);
      p.lineWidth = Math.max(c.line * 1.4, 1 / c.px);
      p.beginPath();
      p.moveTo(1.55, -0.5);
      p.lineTo(2.65, -1.2);
      p.stroke();
      p.strokeStyle = alpha(c.ink, 0.7);
      p.lineWidth = c.line;
      p.beginPath();
      p.moveTo(2.4, 0.95);
      p.lineTo(2.4, 0.55);
      p.moveTo(1.95, 0.65);
      p.lineTo(1.95, 0.35);
      p.stroke();
    });
    if (v) {
      dot(sk, 3.95, -1.25, 0.34, '#c8f2a6', BREW);
      dot(sk, 4.5, -0.4, 0.26, '#c8f2a6', BREW);
      dot(sk, 3.95, 0.4, 0.2, '#c8f2a6', BREW);
      lines(sk, [[3.85, 1.15, 4.35, 1.45], [3.75, 1.7, 4.1, 2.05]]);
    }
  },
};

// A hickory drumstick, tapering to a bead, the butt taped in the raver's
// colour; the beat rings out from the tip on the strike.
const drumstick: Tool = {
  name: 'drumstick',
  draw(sk, v, L) {
    sk.blob((p) => {
      p.moveTo(-0.7, -0.3);
      p.lineTo(3.25, -0.15);
      p.lineTo(3.25, 0.15);
      p.lineTo(-0.7, 0.3);
      p.arc(-0.7, 0, 0.3, Math.PI / 2, (3 * Math.PI) / 2);
      p.closePath();
    }, '#e8c287', { dark: '#bd8f55', d: 0.12 });
    sk.blob((p) => p.ellipse(3.48, 0, 0.36, 0.28, 0, 0, TAU), '#e8c287', { dark: '#bd8f55', d: 0.1 });
    wrap(sk, -0.75, 0.75, 0.31, L.color, shade(L.color, -0.25));
    if (v) {
      sk.draw((p, c) => {
        const w = Math.max(c.line, 1 / c.px);
        p.lineCap = 'round';
        for (const [color, lw] of [[c.ink, w * 2.6], [L.color, w * 1.3]] as const) {
          p.beginPath();
          for (const r of [0.85, 1.45]) {
            p.moveTo(3.55 + r * Math.cos(-0.5), 0.25 + r * Math.sin(-0.5));
            p.arc(3.55, 0.25, r, -0.5, 2.1);
          }
          p.strokeStyle = color;
          p.lineWidth = lw;
          p.stroke();
        }
      });
    }
  },
};

// A screwdriver: a chunky amber handle with grooves, a steel shaft, a flat
// tip; it zaps a live wire on the strike.
const screwdriver: Tool = {
  name: 'screwdriver',
  draw(sk, v) {
    sk.limb([1.4, 0, 3.05, 0], 0.26, METAL, { dark: METAL_D, line: 0.6 });
    sk.blob((p) => {
      p.moveTo(3.0, -0.13);
      p.lineTo(3.32, -0.24);
      p.lineTo(3.32, 0.24);
      p.lineTo(3.0, 0.13);
      p.closePath();
    }, METAL, { dark: METAL_D, d: 0.05 });
    sk.blob((p) => {
      p.moveTo(-0.55, -0.42);
      p.quadraticCurveTo(0.45, -0.62, 1.25, -0.42);
      p.lineTo(1.45, -0.3);
      p.lineTo(1.45, 0.3);
      p.lineTo(1.25, 0.42);
      p.quadraticCurveTo(0.45, 0.62, -0.55, 0.42);
      p.quadraticCurveTo(-0.85, 0, -0.55, -0.42);
      p.closePath();
    }, '#f2b52c', { dark: '#c88a12', d: 0.18 });
    lines(sk, [[-0.3, -0.12, 1.0, -0.14], [-0.3, 0.18, 1.0, 0.2]]);
    if (v) {
      lines(sk, [[3.45, 0.1, 3.85, -0.45, 3.95, 0.15, 4.4, -0.35], [3.4, 0.4, 3.65, 0.95, 4.0, 0.8, 4.15, 1.35]], '#c6ff5a');
      spark(sk, 4.5, 0.55, 0.36, '#c6ff5a');
    }
  },
};

// A pipe wrench: a red cast handle, a steel frame ending in a toothed heel
// jaw, and a hook jaw on a shank along the back, set by a knurled brass
// nut; the jaws open away from the swing, whose blow lands on the back
// with a clank.
const STEEL = '#a9b2c1';
const wrench: Tool = {
  name: 'wrench',
  draw(sk, v) {
    sk.blob((p) => {
      p.moveTo(-0.65, -0.3);
      p.lineTo(1.95, -0.4);
      p.lineTo(1.95, 0.4);
      p.lineTo(-0.65, 0.3);
      p.quadraticCurveTo(-0.9, 0, -0.65, -0.3);
      p.closePath();
      hole(p, -0.35, 0, 0.13, 0.13);
    }, '#cf4331', { dark: '#982d20', d: 0.14 });
    // the hook jaw: its shank along the back, the jaw hooked at the end
    sk.blob((p) => {
      p.moveTo(2.4, 0.15);
      p.lineTo(3.25, 0.15);
      p.lineTo(3.25, -1.35);
      p.lineTo(3.05, -1.6);
      p.lineTo(3.12, -1.85);
      p.lineTo(3.6, -1.85);
      p.quadraticCurveTo(3.8, -1.85, 3.8, -1.6);
      p.lineTo(3.8, 0.7);
      p.lineTo(2.4, 0.7);
      p.closePath();
    }, STEEL, { dark: METAL_D, d: 0.16 });
    // the frame and its heel jaw
    sk.blob((p) => {
      p.moveTo(1.7, 0.6);
      p.lineTo(1.7, -0.5);
      p.lineTo(2.25, -0.5);
      p.lineTo(2.25, -1.25);
      p.lineTo(2.5, -1.45);
      p.lineTo(2.72, -1.3);
      p.lineTo(2.72, 0.6);
      p.closePath();
    }, STEEL, { dark: METAL_D, d: 0.16 });
    // teeth facing each other
    lines(sk, [[2.72, -1.15, 2.86, -1.0, 2.72, -0.85, 2.86, -0.7, 2.72, -0.55], [3.25, -1.25, 3.11, -1.1, 3.25, -0.95, 3.11, -0.8, 3.25, -0.65]]);
    // the knurled nut
    sk.blob((p) => p.roundRect(1.82, -0.3, 0.52, 1.18, 0.14), BRASS, { dark: '#a8823a', d: 0.12 });
    lines(sk, [[1.99, -0.2, 1.99, 0.78], [2.17, -0.2, 2.17, 0.78]]);
    if (v) {
      lines(sk, fan(3.1, 1.0, [0.35, 0.95, 1.55, 2.15], 0.45, 1.1));
      spark(sk, 4.3, 0.95, 0.4, YELLOW);
    }
  },
};

// A whisk: a mint handle, a steel band, a balloon of wire loops; batter
// flies off the strike.
const WIRES = [1.05, 0.62, 0.2];
function wire(p: Pen, w: number): void {
  p.moveTo(1.45, -0.12);
  p.bezierCurveTo(2.2, -w * 1.4, 3.65, -w * 1.4, 3.65, 0);
  p.bezierCurveTo(3.65, w * 1.4, 2.2, w * 1.4, 1.45, 0.12);
}
const whisk: Tool = {
  name: 'whisk',
  draw(sk, v) {
    sk.draw(
      (p, c) => {
        p.lineCap = 'round';
        p.lineJoin = 'round';
        p.beginPath();
        for (const w of WIRES) wire(p, w);
        p.strokeStyle = c.ink;
        p.lineWidth = 0.17 + c.line;
        p.stroke();
        p.beginPath();
        for (const w of WIRES) wire(p, w);
        p.strokeStyle = '#c3cad6';
        p.lineWidth = 0.17;
        p.stroke();
      },
      (p, c) => {
        p.lineCap = 'round';
        p.lineJoin = 'round';
        p.beginPath();
        for (const w of WIRES) wire(p, w);
        p.lineWidth = 0.17 + c.line / 0.3;
        p.stroke();
      },
    );
    sk.blob((p) => p.roundRect(-0.7, -0.36, 2.0, 0.72, 0.34), '#8fd0b8', { dark: '#5fa58c', d: 0.12 });
    sk.blob((p) => p.roundRect(1.15, -0.3, 0.42, 0.6, 0.1), METAL, { dark: METAL_D, d: 0.08 });
    if (v) {
      const BATTER = '#f7e3a4';
      dot(sk, 4.15, 0.95, 0.24, BATTER, '#e0c070');
      dot(sk, 4.4, -0.35, 0.18, BATTER, '#e0c070');
      dot(sk, 3.7, 1.75, 0.16, BATTER, '#e0c070');
      dot(sk, 3.95, -1.35, 0.13, BATTER, '#e0c070');
    }
  },
};

// A garden trowel: a moss-green handle, a short steel neck, a pointed
// scoop with a crease down it and soil on its tip; clods fly on the strike.
const SOIL = '#8a5f3c';
const SOIL_D = '#63432a';
const trowel: Tool = {
  name: 'trowel',
  draw(sk, v) {
    sk.limb([0.85, 0, 1.6, 0], 0.24, METAL, { dark: METAL_D, line: 0.6 });
    sk.blob((p) => {
      p.moveTo(1.35, 0);
      p.bezierCurveTo(1.45, -1.35, 2.6, -1.3, 3.8, 0);
      p.bezierCurveTo(2.6, 1.3, 1.45, 1.35, 1.35, 0);
      p.closePath();
    }, '#b3bcc9', { dark: METAL_D, d: 0.22 });
    sk.draw((p, c) => {
      p.save();
      p.beginPath();
      p.moveTo(1.35, 0);
      p.bezierCurveTo(1.45, -1.35, 2.6, -1.3, 3.8, 0);
      p.bezierCurveTo(2.6, 1.3, 1.45, 1.35, 1.35, 0);
      p.clip();
      p.beginPath();
      p.ellipse(3.75, 0.1, 0.75, 0.9, 0, 0, TAU);
      p.fillStyle = SOIL;
      p.fill();
      p.restore();
      p.strokeStyle = alpha(c.ink, 0.7);
      p.lineWidth = c.line;
      p.lineCap = 'round';
      p.beginPath();
      p.moveTo(1.6, 0);
      p.lineTo(3.0, 0);
      p.stroke();
    });
    sk.blob((p) => {
      p.moveTo(-0.55, -0.3);
      p.quadraticCurveTo(0.2, -0.55, 0.95, -0.3);
      p.lineTo(0.95, 0.3);
      p.quadraticCurveTo(0.2, 0.55, -0.55, 0.3);
      p.quadraticCurveTo(-0.85, 0, -0.55, -0.3);
      p.closePath();
    }, '#6f9d4c', { dark: '#4c7533', d: 0.14 });
    if (v) {
      chip(sk, 4.3, 0.75, 0.6, 0.48, 0.6, SOIL, SOIL_D);
      chip(sk, 3.65, 1.6, 0.5, 0.4, -0.4, SOIL, SOIL_D);
      chip(sk, 4.55, -0.3, 0.4, 0.32, 1.2, SOIL, SOIL_D);
      dot(sk, 2.95, 1.85, 0.16, SOIL);
    }
  },
};

// An ice axe: a blue shaft with a rubber grip and a spike at its foot, a
// steel head with a toothed pick curving back on the swing's side and a
// flat adze on the other; ice chips fly on the strike.
const ICE = '#bfe8fb';
const ICE_D = '#7dbfe0';
const iceAxe: Tool = {
  name: 'iceAxe',
  draw(sk, v) {
    sk.blob((p) => {
      p.moveTo(-0.5, -0.22);
      p.lineTo(-1.0, 0);
      p.lineTo(-0.5, 0.22);
      p.closePath();
    }, METAL, { dark: METAL_D, d: 0.06 });
    sk.limb([-0.5, 0, 3.0, 0], 0.4, '#3f86cf', { dark: '#2c639e', line: 0.6 });
    sk.blob((p) => p.roundRect(-0.45, -0.27, 1.35, 0.54, 0.2), SLATE, { dark: '#1d212c', d: 0.08 });
    // the pick
    sk.blob((p) => {
      p.moveTo(2.75, 0.3);
      p.quadraticCurveTo(3.4, 1.0, 2.55, 2.2);
      p.lineTo(2.62, 1.75);
      p.lineTo(2.45, 1.7);
      p.lineTo(2.62, 1.4);
      p.lineTo(2.48, 1.32);
      p.quadraticCurveTo(2.75, 0.85, 2.65, 0.3);
      p.closePath();
    }, '#a9b2c1', { dark: METAL_D, d: 0.12 });
    // the adze
    sk.blob((p) => {
      p.moveTo(2.68, -0.3);
      p.lineTo(2.68, -1.2);
      p.lineTo(2.45, -1.72);
      p.lineTo(3.45, -1.72);
      p.lineTo(3.3, -1.2);
      p.lineTo(3.3, -0.3);
      p.closePath();
    }, '#a9b2c1', { dark: METAL_D, d: 0.14 });
    // the head's top over the shaft
    sk.blob((p) => p.roundRect(2.6, -0.42, 0.85, 0.84, 0.16), '#a9b2c1', { dark: METAL_D, d: 0.1 });
    sk.draw((p, c) => {
      p.beginPath();
      p.arc(3.03, 0, 0.16, 0, TAU);
      p.fillStyle = c.ink;
      p.fill();
    });
    if (v) {
      chip(sk, 3.4, 1.95, 0.6, 0.42, 0.5, ICE, ICE_D);
      chip(sk, 4.05, 1.2, 0.5, 0.36, -0.7, ICE, ICE_D);
      chip(sk, 1.85, 2.1, 0.44, 0.32, 1.1, ICE, ICE_D);
      spark(sk, 4.35, 0.55, 0.34, WHITE);
    }
  },
};

// A rubber stamp: a turned knob in the hand, a waisted neck, a brass band,
// a wooden mount and the inked rubber; red ink splats on the strike.
const INK_RED = '#c8333f';
const INK_RED_D = '#94232f';
const rubberStamp: Tool = {
  name: 'rubberStamp',
  draw(sk, v) {
    sk.blob((p) => {
      p.moveTo(0.3, -0.42);
      p.quadraticCurveTo(0.95, -0.2, 1.65, -0.48);
      p.lineTo(1.65, 0.48);
      p.quadraticCurveTo(0.95, 0.2, 0.3, 0.42);
      p.closePath();
    }, '#8a4e2e', { dark: '#663720', d: 0.12 });
    sk.blob((p) => p.arc(-0.05, 0, 0.62, 0, TAU), '#8a4e2e', { dark: '#663720', d: 0.2 });
    sk.blob((p) => p.roundRect(1.55, -0.62, 0.3, 1.24, 0.08), BRASS, { dark: '#a8823a', d: 0.08 });
    sk.blob((p) => p.roundRect(1.85, -1.15, 0.85, 2.3, 0.16), '#c58f58', { dark: '#9a6b3d', d: 0.16 });
    sk.blob((p) => p.rect(2.7, -1.05, 0.42, 2.1), INK_RED, { dark: INK_RED_D, d: 0.08 });
    if (v) {
      sk.blob((p) => {
        const rs = [0.9, 0.5, 1.05, 0.55, 0.75, 0.45, 1.0, 0.5, 0.85, 0.55, 1.05, 0.5, 0.8, 0.5, 0.9];
        const n = rs.length - 1;
        for (let k = 0; k <= n; k++) {
          const a = -Math.PI / 2 + (k / n) * Math.PI;
          const r = rs[k];
          const x = 3.12 + Math.cos(a) * r;
          const y = Math.sin(a) * r * 1.5;
          if (k === 0) p.moveTo(x, y);
          else p.lineTo(x, y);
        }
        p.closePath();
      }, INK_RED, { dark: INK_RED_D, d: 0.1 });
      dot(sk, 4.4, -1.15, 0.2, INK_RED);
      dot(sk, 4.55, 0.35, 0.16, INK_RED);
      dot(sk, 4.2, 1.5, 0.24, INK_RED);
    }
  },
};

// A devil's trident: a dark shaft, a brass collar, a red head of three
// barbed tines; embers fly off on the strike.
const HELL = '#e0473a';
const HELL_D = '#a8302a';
function barb(sk: Sketch, x: number, y: number): void {
  sk.blob((p) => {
    p.moveTo(x + 0.85, y);
    p.lineTo(x - 0.05, y - 0.42);
    p.lineTo(x + 0.15, y);
    p.lineTo(x - 0.05, y + 0.42);
    p.closePath();
  }, HELL, { dark: HELL_D, d: 0.08 });
}
const trident: Tool = {
  name: 'trident',
  draw(sk, v) {
    sk.limb([-0.95, 0, 2.5, 0], 0.36, '#5a3d48', { dark: '#3d2831', line: 0.6 });
    sk.limb([3.15, -1.35, 2.6, -1.25, 2.4, 0, 2.6, 1.25, 3.15, 1.35], 0.34, HELL, { dark: HELL_D, line: 0.6 });
    sk.limb([2.4, 0, 3.85, 0], 0.34, HELL, { dark: HELL_D, line: 0.6 });
    barb(sk, 3.8, 0);
    barb(sk, 3.1, -1.35);
    barb(sk, 3.1, 1.35);
    sk.blob((p) => p.roundRect(2.05, -0.3, 0.38, 0.6, 0.1), BRASS, { dark: '#a8823a', d: 0.08 });
    if (v) {
      spark(sk, 4.5, 0.85, 0.42, ORANGE);
      spark(sk, 4.25, 2.0, 0.3, YELLOW);
      dot(sk, 3.4, 2.05, 0.2, ORANGE);
      dot(sk, 4.55, -0.85, 0.18, YELLOW);
    }
  },
};

// A drifter's spanner: a flat, dusty steel bar with an open jaw at each
// end, set at an angle; sparks and a puff of dust on the strike.
const DUSTY = '#b1aba0';
const DUSTY_D = '#7f796e';
function jaw(sk: Sketch, x: number, r: number, a: number): void {
  const g = r * 0.45;
  const e = Math.asin(g / r);
  sk.at(mul(move(x, 0), turn(a)), () => {
    sk.blob((p) => {
      p.moveTo(Math.sqrt(r * r - g * g), -g);
      p.arc(0, 0, r, -e, e, true);
      p.lineTo(0.1, g);
      p.quadraticCurveTo(-0.25 * r, g, -0.25 * r, 0);
      p.quadraticCurveTo(-0.25 * r, -g, 0.1, -g);
      p.closePath();
    }, DUSTY, { dark: DUSTY_D, d: 0.16 });
  });
}
const spanner: Tool = {
  name: 'spanner',
  draw(sk, v) {
    sk.blob((p) => p.roundRect(-0.4, -0.27, 2.75, 0.54, 0.2), DUSTY, { dark: DUSTY_D, d: 0.1 });
    jaw(sk, 2.8, 0.92, -0.26);
    jaw(sk, -0.45, 0.6, Math.PI + 0.26);
    // rust
    sk.draw((p) => {
      p.fillStyle = alpha('#a4532c', 0.75);
      p.beginPath();
      p.ellipse(1.2, 0.08, 0.32, 0.12, 0.2, 0, TAU);
      p.ellipse(2.45, -0.55, 0.18, 0.12, 0, 0, TAU);
      p.fill();
    });
    if (v) {
      const DUST = '#dcc9a0';
      dot(sk, 3.0, 1.6, 0.36, DUST, '#bda77c');
      dot(sk, 3.65, 1.75, 0.28, DUST, '#bda77c');
      dot(sk, 2.4, 1.85, 0.22, DUST, '#bda77c');
      spark(sk, 4.3, 0.55, 0.4, YELLOW);
      lines(sk, fan(3.85, 0.6, [-0.6, 0.2], 0.5, 0.95), YELLOW);
    }
  },
};

// A bearded axe: a wrapped ash haft, a steel head with a poll behind and a
// long blade sweeping back into its beard, a bright edge; wood chips fly
// on the strike.
const axe: Tool = {
  name: 'axe',
  draw(sk, v) {
    sk.limb([-0.6, 0, 3.35, 0], 0.44, WOOD, { dark: WOOD_D, line: 0.6 });
    wrap(sk, -0.6, 0.8, 0.27, '#6b4a33', '#4f3523');
    sk.blob((p) => {
      p.moveTo(2.6, 0.4);
      p.quadraticCurveTo(2.45, 1.15, 1.7, 1.7);
      p.quadraticCurveTo(2.6, 2.3, 3.7, 1.9);
      p.quadraticCurveTo(3.4, 1.1, 3.3, 0.4);
      p.closePath();
    }, '#a9b2c1', { dark: METAL_D, d: 0.16 });
    sk.draw((p, c) => {
      p.lineCap = 'round';
      p.strokeStyle = '#eef2f7';
      p.lineWidth = Math.max(c.line * 2, 1.5 / c.px);
      p.beginPath();
      p.moveTo(1.95, 1.75);
      p.quadraticCurveTo(2.65, 2.08, 3.5, 1.8);
      p.stroke();
    });
    sk.blob((p) => p.roundRect(2.55, -0.95, 0.8, 1.45, 0.18), '#a9b2c1', { dark: METAL_D, d: 0.14 });
    if (v) {
      const CHIP = '#e6bd85';
      const CHIP_D = '#b88b52';
      chip(sk, 4.25, 1.45, 0.7, 0.42, 0.5, CHIP, CHIP_D);
      chip(sk, 4.5, 0.35, 0.55, 0.36, -0.6, CHIP, CHIP_D);
      chip(sk, 1.15, 2.0, 0.5, 0.32, 1.0, CHIP, CHIP_D);
    }
  },
};

// A sci-fi multitool: a ridged gunmetal grip, a pale plated housing with a
// light in the wearer's colour, two prongs round a glowing core; it
// discharges on the strike.
const CORE = '#7df4ff';
const multitool: Tool = {
  name: 'multitool',
  draw(sk, v, L) {
    sk.blob((p) => p.roundRect(-0.65, -0.4, 2.0, 0.8, 0.32), '#4d5566', { dark: '#363c49', d: 0.12 });
    lines(sk, [[-0.2, -0.32, -0.2, 0.32], [0.2, -0.32, 0.2, 0.32], [0.6, -0.32, 0.6, 0.32]]);
    sk.blob((p) => {
      p.moveTo(2.8, -0.75);
      p.lineTo(3.65, -0.75);
      p.lineTo(3.65, -0.38);
      p.lineTo(2.8, -0.38);
      p.closePath();
      p.moveTo(2.8, 0.38);
      p.lineTo(3.65, 0.38);
      p.lineTo(3.65, 0.75);
      p.lineTo(2.8, 0.75);
      p.closePath();
    }, '#5f6878', { dark: '#424956', d: 0.06 });
    sk.blob((p) => {
      p.moveTo(1.15, -0.5);
      p.lineTo(2.55, -0.9);
      p.quadraticCurveTo(2.95, -0.9, 2.95, -0.5);
      p.lineTo(2.95, 0.5);
      p.quadraticCurveTo(2.95, 0.9, 2.55, 0.9);
      p.lineTo(1.15, 0.5);
      p.closePath();
    }, '#d3dae4', { dark: '#9aa3b2', d: 0.18 });
    sk.draw((p, c) => {
      p.beginPath();
      p.roundRect(1.6, -0.18, 0.75, 0.36, 0.12);
      p.fillStyle = L.color;
      p.fill();
      p.strokeStyle = c.ink;
      p.lineWidth = c.line;
      p.stroke();
      // the core's glow between the prongs
      p.beginPath();
      p.arc(3.3, 0, v ? 0.9 : 0.55, 0, TAU);
      p.fillStyle = alpha(CORE, v ? 0.45 : 0.35);
      p.fill();
    });
    sk.blob((p) => p.arc(3.3, 0, 0.27, 0, TAU), '#e6fdff', { line: 0.5 });
    if (v) {
      lines(sk, [[3.6, -0.15, 4.0, -0.55, 4.15, -0.1, 4.6, -0.45], [3.6, 0.2, 3.95, 0.7, 4.2, 0.45, 4.55, 0.95]], CORE);
      spark(sk, 4.2, 1.55, 0.36, CORE);
    }
  },
};

// A claw hammer: a hickory handle, a steel head with a flared face on the
// swing's side and a claw curving back on the other; a ringing blow.
const hammer: Tool = {
  name: 'hammer',
  draw(sk, v) {
    sk.limb([-0.55, 0, 3.0, 0], 0.42, '#d2a066', { dark: '#a57643', line: 0.6 });
    sk.blob((p) => {
      p.moveTo(2.62, -0.45);
      p.quadraticCurveTo(2.7, -1.35, 2.05, -2.0);
      p.quadraticCurveTo(3.3, -1.6, 3.28, -0.45);
      p.closePath();
    }, '#a9b2c1', { dark: METAL_D, d: 0.14 });
    lines(sk, [[2.95, -0.6, 2.55, -1.6]]);
    sk.blob((p) => {
      p.moveTo(2.68, 0.3);
      p.lineTo(2.68, 1.15);
      p.lineTo(2.48, 1.3);
      p.lineTo(2.48, 1.75);
      p.lineTo(3.42, 1.75);
      p.lineTo(3.42, 1.3);
      p.lineTo(3.22, 1.15);
      p.lineTo(3.22, 0.3);
      p.closePath();
    }, '#a9b2c1', { dark: METAL_D, d: 0.14 });
    sk.blob((p) => p.roundRect(2.55, -0.55, 0.8, 1.1, 0.16), '#a9b2c1', { dark: METAL_D, d: 0.12 });
    if (v) {
      lines(sk, fan(2.95, 1.75, [0.1, 0.6, 2.55, 3.05], 0.75, 1.15));
      spark(sk, 4.3, 1.0, 0.38, YELLOW);
    }
  },
};

// A ping-pong paddle: a laminated wooden handle flaring into a round blade
// with a red rubber face; on the strike a ball pings away off it.
const pingPongPaddle: Tool = {
  name: 'pingPongPaddle',
  draw(sk, v) {
    sk.blob((p) => {
      p.moveTo(-0.6, -0.34);
      p.lineTo(0.95, -0.36);
      p.quadraticCurveTo(1.25, -0.4, 1.45, -0.7);
      p.lineTo(1.45, 0.7);
      p.quadraticCurveTo(1.25, 0.4, 0.95, 0.36);
      p.lineTo(-0.6, 0.34);
      p.quadraticCurveTo(-0.82, 0, -0.6, -0.34);
      p.closePath();
    }, '#dcae73', { dark: '#b08248', d: 0.12 });
    lines(sk, [[-0.45, 0, 1.0, 0]], '#7b4f2c');
    sk.blob((p) => p.arc(2.5, 0, 1.32, 0, TAU), '#c99a62', { dark: '#9c7040', d: 0.1 });
    sk.blob((p) => p.arc(2.5, 0, 1.12, 0, TAU), '#d8463b', { dark: '#a9302a', d: 0.2 });
    sk.draw((p, c) => {
      p.lineCap = 'round';
      p.strokeStyle = alpha(WHITE, 0.6);
      p.lineWidth = Math.max(c.line * 1.4, 1 / c.px);
      p.beginPath();
      p.arc(2.5, 0, 0.78, Math.PI * 1.05, Math.PI * 1.45);
      p.stroke();
    });
    if (v) {
      // the ball off the face, a trail behind it
      lines(sk, [[3.15, 1.45, 3.7, 1.85], [3.4, 1.05, 3.95, 1.45]]);
      sk.blob((p) => p.arc(4.35, 1.75, 0.38, 0, TAU), '#ffb347', { dark: '#e8892b', d: 0.12 });
    }
  },
};

export const RUNS: Record<Costume, Tool> = {
  ...everyone(mallet),
  miner: pickaxe,
  scientist: flask,
  raver: drumstick,
  hacker: screwdriver,
  astronaut: wrench,
  jumpsuit: wrench,
  casual: whisk,
  forager: trowel,
  parka: iceAxe,
  guard: rubberStamp,
  demon: trident,
  drifter: spanner,
  nord: axe,
  exosuit: multitool,
  colonist: hammer,
  startup: pingPongPaddle,
};
