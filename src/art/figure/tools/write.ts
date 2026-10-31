import type { Costume } from '../../../world/character.ts';
import { alpha, shade } from '../../iso.ts';
import type { Color, Pen } from '../../types.ts';
import type { Sketch } from '../paint.ts';
import { BRASS, COVER, METAL, METAL_D, PAGE, PAGE_D, SLATE, TAU, WHITE, WOOD, WOOD_D, everyone, type Tool } from './tool.ts';

// The write pose's tools (surface and writer): a surface held in one hand,
// upright in its own frame, about 1.7 across and 2.1 tall, its top toward
// -y; a writer in the other, pointing along +x, its tip at about 1.9. From
// the front a pad before the chest; from behind held out at the side (see
// the write pose in ../rig.ts), its working face still toward us. Each
// costume's own below.

// Marks over a part (rules, chalk, scribbles, runes): `w` units wide, never
// under most of a pixel.
function marks(sk: Sketch, color: Color, w: number, path: (p: Pen) => void): void {
  sk.draw((p, c) => {
    p.strokeStyle = color;
    p.lineWidth = Math.max(w, 0.7 / c.px);
    p.lineCap = 'round';
    p.lineJoin = 'round';
    p.beginPath();
    path(p);
    p.stroke();
  });
}

// Ruled lines across a page, x0 to x1, one at each y.
const rules = (x0: number, x1: number, ys: readonly number[]) => (p: Pen) => {
  for (const y of ys) {
    p.moveTo(x0, y);
    p.lineTo(x1, y);
  }
};

// ---- surfaces ---------------------------------------------------------------

// A pad of lined paper on a spiral.
const notepad: Tool = {
  name: 'notepad',
  draw(sk) {
    sk.blob((p) => p.roundRect(-0.85, -1.05, 1.7, 2.1, 0.22), PAGE, { dark: PAGE_D, d: 0.2 });
    sk.draw((p, c) => {
      p.strokeStyle = alpha(c.ink, 0.45);
      p.lineWidth = Math.max(c.line * 0.6, 0.6 / c.px);
      p.beginPath();
      for (const y of [-0.3, 0.15, 0.6]) {
        p.moveTo(-0.55, y);
        p.lineTo(0.55, y);
      }
      p.stroke();
      p.fillStyle = c.ink;
      for (const x of [-0.5, 0, 0.5]) {
        p.beginPath();
        p.arc(x, -1.05, 0.14, 0, TAU);
        p.fill();
      }
    });
  },
};

// A school slate in a wooden frame, a tally and a squiggle in chalk on it.
const CHALK = '#f6f3ec';
const slate: Tool = {
  name: 'slate',
  draw(sk) {
    sk.blob((p) => p.roundRect(-0.98, -1.15, 1.96, 2.3, 0.2), WOOD, { dark: WOOD_D, d: 0.2 });
    sk.blob((p) => p.rect(-0.7, -0.87, 1.4, 1.74), '#465066', { dark: SLATE, d: 0.14, line: 0.5 });
    marks(sk, alpha(CHALK, 0.92), 0.13, (p) => {
      for (const x of [-0.45, -0.28, -0.11, 0.06]) {
        p.moveTo(x, -0.62);
        p.lineTo(x, -0.2);
      }
      p.moveTo(-0.55, -0.24);
      p.lineTo(0.17, -0.58);
      p.moveTo(-0.45, 0.22);
      p.quadraticCurveTo(-0.27, 0.02, -0.08, 0.22);
      p.quadraticCurveTo(0.11, 0.42, 0.42, 0.18);
      p.moveTo(-0.45, 0.58);
      p.lineTo(0.25, 0.58);
    });
  },
};

// A clipboard: a hardboard back, a sheet with tick boxes, a steel clip.
const BOARD = '#c48c52';
const clipboard: Tool = {
  name: 'clipboard',
  draw(sk) {
    sk.blob((p) => p.roundRect(-0.92, -1.08, 1.84, 2.24, 0.2), BOARD, { dark: shade(BOARD, -0.25), d: 0.2 });
    sk.blob((p) => p.rect(-0.7, -0.8, 1.4, 1.76), WHITE, { dark: '#e2e6ee', d: 0.12, line: 0.5 });
    marks(sk, '#9aa7bd', 0.07, rules(-0.18, 0.5, [-0.38, 0.06, 0.5]));
    sk.draw((p, c) => {
      p.strokeStyle = alpha(c.ink, 0.7);
      p.lineWidth = Math.max(0.07, 0.7 / c.px);
      p.beginPath();
      for (const y of [-0.38, 0.06, 0.5]) p.rect(-0.52, y - 0.12, 0.24, 0.24);
      p.stroke();
      // ticks in the first two boxes
      p.strokeStyle = '#3f9a5a';
      p.lineWidth = Math.max(0.1, 0.8 / c.px);
      p.lineCap = 'round';
      p.lineJoin = 'round';
      p.beginPath();
      for (const y of [-0.38, 0.06]) {
        p.moveTo(-0.5, y);
        p.lineTo(-0.41, y + 0.1);
        p.lineTo(-0.24, y - 0.16);
      }
      p.stroke();
    });
    // the clip: a steel plate over the top edge, a loop on it
    sk.blob((p) => {
      p.moveTo(-0.55, -0.82);
      p.lineTo(0.55, -0.82);
      p.lineTo(0.42, -1.22);
      p.lineTo(-0.42, -1.22);
      p.closePath();
    }, METAL, { dark: METAL_D, d: 0.12 });
    sk.limb([-0.24, -1.22, -0.2, -1.42, 0.2, -1.42, 0.24, -1.22], 0.13, METAL_D, { line: 0.5 });
  },
};

// A club flyer: a violet sheet, a neon sun striped like a horizon, two bars
// of neon under it, a corner dog-eared.
const FLYER = '#3d2370';
const flyer: Tool = {
  name: 'flyer',
  draw(sk) {
    const sheet = (p: Pen) => {
      p.moveTo(-0.85, -1.08);
      p.lineTo(0.85, -1.08);
      p.lineTo(0.85, 0.72);
      p.lineTo(0.5, 1.08);
      p.lineTo(-0.85, 1.08);
      p.closePath();
    };
    sk.blob(sheet, FLYER, { dark: shade(FLYER, -0.3), d: 0.14 });
    sk.draw((p) => {
      // the glow round the sun
      p.fillStyle = alpha('#ff4fb8', 0.35);
      p.beginPath();
      p.arc(0, -0.35, 0.68, 0, TAU);
      p.fill();
      // the sun: yellow over pink
      const g = p.createLinearGradient(0, -0.85, 0, 0.15);
      g.addColorStop(0, '#ffe95a');
      g.addColorStop(1, '#ff3fae');
      p.fillStyle = g;
      p.beginPath();
      p.arc(0, -0.35, 0.5, 0, TAU);
      p.fill();
      // the horizon's stripes cut through its lower half
      p.fillStyle = FLYER;
      for (const [y, h] of [[-0.3, 0.06], [-0.16, 0.09], [0.0, 0.12]] as const) p.fillRect(-0.55, y, 1.1, h);
    });
    marks(sk, '#4ff0ff', 0.14, rules(-0.5, 0.5, [0.4]));
    marks(sk, '#4ff0ff', 0.11, rules(-0.35, 0.25, [0.68]));
    // the dog-ear, its back paler
    sk.blob((p) => {
      p.moveTo(0.85, 0.72);
      p.lineTo(0.5, 1.08);
      p.lineTo(0.52, 0.74);
      p.closePath();
    }, '#8c6fd0', { line: 0.5 });
  },
};

// A pad of sticky notes: a yellow square on its stack, two lines of marker
// on it, the top note's corner curling up.
const STICKY = '#ffd84a';
const STICKY_D = '#e2b52c';
const stickyNotes: Tool = {
  name: 'stickyNotes',
  draw(sk) {
    // the stack under the top note
    sk.blob((p) => p.rect(-0.92, -0.92, 1.84, 1.9), STICKY_D, { dark: shade(STICKY_D, -0.15), d: 0.1 });
    marks(sk, shade(STICKY_D, -0.3), 0.05, rules(-0.9, 0.9, [0.9]));
    const top = (p: Pen) => {
      p.moveTo(-0.92, -0.92);
      p.lineTo(0.92, -0.92);
      p.lineTo(0.92, 0.32);
      p.quadraticCurveTo(0.62, 0.52, 0.42, 0.84);
      p.lineTo(-0.92, 0.84);
      p.closePath();
    };
    sk.blob(top, STICKY, { dark: '#f2c63a', d: 0.14, line: 0.5 });
    // the glue strip along its top
    sk.draw((p) => {
      p.fillStyle = alpha('#f0b92c', 0.55);
      p.fillRect(-0.9, -0.9, 1.8, 0.24);
    });
    marks(sk, '#2f3550', 0.12, (p) => {
      p.moveTo(-0.6, -0.35);
      p.lineTo(0.5, -0.35);
      p.moveTo(-0.6, 0.0);
      p.lineTo(0.2, 0.0);
      p.moveTo(-0.6, 0.35);
      p.quadraticCurveTo(-0.4, 0.5, -0.2, 0.35);
    });
    // the curl, its underside paler
    sk.blob((p) => {
      p.moveTo(0.92, 0.32);
      p.quadraticCurveTo(0.62, 0.52, 0.42, 0.84);
      p.quadraticCurveTo(0.58, 0.46, 0.92, 0.32);
      p.closePath();
    }, '#fff3b0', { line: 0.5 });
  },
};

// A space datapad: a chunky white case with its corners cut, a glowing
// screen with a trace and bars on it, a light in the agent's colour.
const CASE = '#e9edf3';
const datapad: Tool = {
  name: 'datapad',
  draw(sk, _v, L) {
    const k = 0.32;
    sk.blob((p) => {
      p.moveTo(-0.92 + k, -1.1);
      p.lineTo(0.92 - k, -1.1);
      p.lineTo(0.92, -1.1 + k);
      p.lineTo(0.92, 1.1 - k);
      p.lineTo(0.92 - k, 1.1);
      p.lineTo(-0.92 + k, 1.1);
      p.lineTo(-0.92, 1.1 - k);
      p.lineTo(-0.92, -1.1 + k);
      p.closePath();
    }, CASE, { dark: '#aeb7c6', d: 0.18 });
    sk.blob((p) => p.roundRect(-0.66, -0.82, 1.32, 1.3, 0.1), '#8fe9ff', { dark: '#5cc8ea', d: 0.12, line: 0.5 });
    sk.draw((p, c) => {
      // the screen's glow
      p.fillStyle = alpha(WHITE, 0.35);
      p.beginPath();
      p.ellipse(-0.1, -0.35, 0.45, 0.3, 0, 0, TAU);
      p.fill();
      p.strokeStyle = '#1d6f8c';
      p.lineWidth = Math.max(0.09, 0.8 / c.px);
      p.lineCap = 'round';
      p.lineJoin = 'round';
      p.beginPath();
      p.moveTo(-0.5, -0.4);
      p.lineTo(-0.28, -0.4);
      p.lineTo(-0.16, -0.66);
      p.lineTo(0.0, -0.14);
      p.lineTo(0.12, -0.5);
      p.lineTo(0.2, -0.4);
      p.lineTo(0.5, -0.4);
      p.stroke();
      p.fillStyle = '#1d6f8c';
      p.fillRect(-0.5, 0.0, 0.62, 0.11);
      p.fillRect(-0.5, 0.2, 0.86, 0.11);
      // the light under the screen
      p.fillStyle = L.color;
      p.beginPath();
      p.arc(0, 0.79, 0.13, 0, TAU);
      p.fill();
    });
  },
};

// A waiter's order pad: narrow, a red band along its top, ruled, a price
// column down the right, the stub's perforation near the foot.
const CHECK = '#eef6e6';
const orderPad: Tool = {
  name: 'orderPad',
  draw(sk) {
    sk.blob((p) => p.roundRect(-0.74, -1.08, 1.48, 2.18, 0.1), CHECK, { dark: '#cfdcc4', d: 0.16 });
    sk.blob((p) => {
      p.moveTo(-0.74, -0.66);
      p.lineTo(-0.74, -0.98);
      p.quadraticCurveTo(-0.74, -1.08, -0.64, -1.08);
      p.lineTo(0.64, -1.08);
      p.quadraticCurveTo(0.74, -1.08, 0.74, -0.98);
      p.lineTo(0.74, -0.66);
      p.closePath();
    }, '#d3473b', { dark: '#a8322a', d: 0.1, line: 0.5 });
    marks(sk, '#8fb0c8', 0.07, rules(-0.55, 0.55, [-0.36, -0.1, 0.16, 0.42]));
    marks(sk, '#d3473b', 0.07, (p) => {
      p.moveTo(0.22, -0.55);
      p.lineTo(0.22, 0.55);
    });
    sk.draw((p, c) => {
      p.fillStyle = alpha(c.ink, 0.5);
      for (let x = -0.6; x <= 0.61; x += 0.2) p.fillRect(x - 0.04, 0.72, 0.08, 0.06);
    });
  },
};

// A broad leaf for paper, its tip up: a midrib and veins, a stalk, a line
// written across it.
const LEAF = '#79a85c';
const LEAF_D = '#4f7d52';
const leaf: Tool = {
  name: 'leaf',
  draw(sk) {
    sk.limb([0, 0.85, 0.12, 1.25, 0.3, 1.42], 0.18, LEAF_D, { line: 0.5 });
    sk.blob((p) => {
      p.moveTo(0, -1.3);
      p.bezierCurveTo(0.55, -1.0, 1.05, -0.35, 0.95, 0.25);
      p.bezierCurveTo(0.85, 0.75, 0.35, 0.95, 0, 1.0);
      p.bezierCurveTo(-0.35, 0.95, -0.85, 0.75, -0.95, 0.25);
      p.bezierCurveTo(-1.05, -0.35, -0.55, -1.0, 0, -1.3);
      p.closePath();
    }, LEAF, { dark: LEAF_D, d: 0.22 });
    marks(sk, '#b9dd8a', 0.09, (p) => {
      p.moveTo(0, 0.95);
      p.quadraticCurveTo(0.04, -0.2, 0, -1.15);
      for (const [y, s] of [[-0.55, 1], [-0.55, -1], [0.0, 1], [0.0, -1], [0.5, 1], [0.5, -1]] as const) {
        p.moveTo(0.02 * s, y + 0.15);
        p.quadraticCurveTo(0.4 * s, y + 0.05, 0.7 * s, y - 0.25);
      }
    });
    marks(sk, '#3a2a2e', 0.08, (p) => {
      p.moveTo(-0.55, 0.28);
      p.quadraticCurveTo(-0.4, 0.14, -0.25, 0.28);
      p.quadraticCurveTo(-0.12, 0.4, 0.05, 0.26);
    });
  },
};

// A pocket notebook, open: its leather cover round a lined page, the
// elastic band down its side and a ribbon hanging from its foot.
const notebook: Tool = {
  name: 'notebook',
  draw(sk) {
    sk.limb([-0.3, 0.95, -0.34, 1.45], 0.18, '#d6493c', { line: 0.5 });
    sk.blob((p) => p.roundRect(-0.88, -1.14, 1.76, 2.26, 0.26), COVER, { dark: shade(COVER, -0.3), d: 0.16 });
    sk.blob((p) => p.rect(-0.6, -0.8, 1.2, 1.64), PAGE, { dark: PAGE_D, d: 0.12, line: 0.5 });
    marks(sk, '#9db0c8', 0.07, rules(-0.45, 0.2, [-0.45, -0.15, 0.15, 0.45]));
    marks(sk, alpha('#3a3040', 0.7), 0.08, (p) => {
      p.moveTo(-0.45, -0.52);
      p.quadraticCurveTo(-0.3, -0.64, -0.15, -0.52);
      p.quadraticCurveTo(-0.02, -0.42, 0.12, -0.54);
    });
    // the elastic band, round the cover and over the page's edge
    sk.limb([0.42, -1.14, 0.42, 1.12], 0.15, '#3a3040', { line: 0.4 });
  },
};

// An account ledger, open: a ruled page with its red money columns, on
// boards of bottle-green cloth with a leather spine and brass corners.
const LEDGER = '#2f5d4a';
const ledger: Tool = {
  name: 'ledger',
  draw(sk) {
    sk.blob((p) => p.roundRect(-0.96, -1.12, 1.92, 2.24, 0.12), LEDGER, { dark: shade(LEDGER, -0.3), d: 0.16 });
    sk.blob((p) => p.rect(-0.62, -0.95, 1.43, 1.9), '#f6f1dc', { dark: '#ddd3b2', d: 0.12, line: 0.5 });
    marks(sk, '#9db6d4', 0.06, rules(-0.55, 0.75, [-0.55, -0.3, -0.05, 0.2, 0.45, 0.7]));
    marks(sk, '#d0473e', 0.07, (p) => {
      p.moveTo(-0.6, -0.75);
      p.lineTo(0.79, -0.75);
      for (const x of [-0.3, 0.3, 0.5]) {
        p.moveTo(x, -0.75);
        p.lineTo(x, 0.9);
      }
    });
    // the spine, its gilt bands
    sk.blob((p) => p.roundRect(-0.96, -1.12, 0.4, 2.24, 0.12), '#7d2a2e', { dark: '#5a1c20', d: 0.1, line: 0.5 });
    marks(sk, BRASS, 0.09, rules(-0.9, -0.62, [-0.7, -0.5, 0.5, 0.7]));
    // brass corners at the fore-edge
    for (const s of [-1, 1]) {
      sk.blob((p) => {
        p.moveTo(0.96, s * 1.12);
        p.lineTo(0.5, s * 1.12);
        p.lineTo(0.96, s * 0.66);
        p.closePath();
      }, BRASS, { dark: shade(BRASS, -0.25), d: 0.06, line: 0.5 });
    }
  },
};

// A demon's scroll: parchment between two rolls with dark knobs, lines of
// red ink on it.
const SKIN = '#ecd3a0';
const SKIN_D = '#c9a56c';
const scroll: Tool = {
  name: 'scroll',
  draw(sk) {
    sk.blob((p) => {
      p.moveTo(-0.72, -0.95);
      p.lineTo(0.72, -0.95);
      p.quadraticCurveTo(0.64, 0, 0.72, 0.95);
      p.lineTo(-0.72, 0.95);
      p.quadraticCurveTo(-0.64, 0, -0.72, -0.95);
      p.closePath();
    }, SKIN, { dark: SKIN_D, d: 0.16 });
    marks(sk, '#a3261f', 0.1, (p) => {
      for (const [y, w] of [[-0.5, 0.48], [-0.2, 0.4], [0.1, 0.48], [0.4, 0.3]] as const) {
        p.moveTo(-0.45, y);
        p.quadraticCurveTo(-0.45 + w * 0.5, y - 0.12, -0.45 + w, y);
        p.quadraticCurveTo(-0.45 + w * 1.5, y + 0.12, -0.45 + w * 2, y);
      }
    });
    for (const y of [-1.0, 1.0]) {
      sk.limb([-0.9, y, 0.9, y], 0.4, shade(SKIN, -0.08), { dark: SKIN_D, line: 0.5 });
      for (const x of [-1.12, 1.12]) sk.blob((p) => p.arc(x, y, 0.2, 0, TAU), '#7a1f2b', { dark: '#4e1420', d: 0.08, line: 0.5 });
    }
  },
};

// A nord's parchment: a rough-edged sheet of hide with four runes cut in.
const HIDE = '#e3c996';
const HIDE_D = '#bf9d66';
const parchment: Tool = {
  name: 'parchment',
  draw(sk) {
    sk.blob((p) => {
      const pts = [
        -0.82, -1.12, -0.4, -1.02, -0.05, -1.14, 0.38, -1.04, 0.86, -1.12,
        0.78, -0.62, 0.92, -0.15, 0.8, 0.35, 0.9, 0.82, 0.84, 1.12,
        0.4, 1.02, 0.02, 1.14, -0.42, 1.04, -0.86, 1.12,
        -0.78, 0.6, -0.92, 0.12, -0.8, -0.4, -0.9, -0.8,
      ];
      p.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
      p.closePath();
    }, HIDE, { dark: HIDE_D, d: 0.18 });
    marks(sk, '#5e3a24', 0.12, (p) => {
      // fehu: a stave, two branches up and right
      p.moveTo(-0.42, -0.78);
      p.lineTo(-0.42, -0.14);
      p.moveTo(-0.42, -0.6);
      p.lineTo(-0.16, -0.78);
      p.moveTo(-0.42, -0.4);
      p.lineTo(-0.16, -0.58);
      // algiz: a stave, two arms up
      p.moveTo(0.36, -0.78);
      p.lineTo(0.36, -0.14);
      p.moveTo(0.36, -0.48);
      p.lineTo(0.12, -0.74);
      p.moveTo(0.36, -0.48);
      p.lineTo(0.6, -0.74);
      // dagaz: two staves crossed
      p.moveTo(-0.58, 0.14);
      p.lineTo(-0.58, 0.72);
      p.moveTo(-0.22, 0.14);
      p.lineTo(-0.22, 0.72);
      p.moveTo(-0.58, 0.14);
      p.lineTo(-0.22, 0.72);
      p.moveTo(-0.22, 0.14);
      p.lineTo(-0.58, 0.72);
      // tiwaz: an arrow up
      p.moveTo(0.36, 0.14);
      p.lineTo(0.36, 0.72);
      p.moveTo(0.14, 0.36);
      p.lineTo(0.36, 0.14);
      p.lineTo(0.58, 0.36);
    });
  },
};

// ---- writers ----------------------------------------------------------------

// A yellow pencil, its rubber at the hand.
const pencil: Tool = {
  name: 'pencil',
  draw(sk) {
    sk.limb([0, 0, 1.55, 0], 0.34, '#f6c544', { line: 0.5 });
    sk.limb([1.55, 0, 1.95, 0], 0.2, '#3a3040', { line: 0.4 });
    sk.limb([-0.25, 0, 0, 0], 0.36, '#ff8fa8', { line: 0.5 });
  },
};

// A stub of white chalk, thick and short, a puff of dust off its tip.
const chalk: Tool = {
  name: 'chalk',
  draw(sk) {
    sk.blob((p) => {
      p.moveTo(0.32, -0.26);
      p.lineTo(1.52, -0.26);
      p.quadraticCurveTo(1.86, -0.24, 1.96, 0.04);
      p.quadraticCurveTo(1.9, 0.26, 1.6, 0.26);
      p.lineTo(0.32, 0.26);
      p.quadraticCurveTo(0.14, 0, 0.32, -0.26);
      p.closePath();
    }, CHALK, { dark: '#cec8bb', d: 0.12 });
    sk.draw((p) => {
      p.fillStyle = '#d8d2c4';
      for (const [x, y, r] of [[2.25, -0.3, 0.08], [2.45, 0.02, 0.06], [2.2, 0.32, 0.05]] as const) {
        p.beginPath();
        p.arc(x, y, r, 0, TAU);
        p.fill();
      }
    });
  },
};

// A fat felt marker: a white barrel, its cap end and nib in the agent's
// colour.
const marker: Tool = {
  name: 'marker',
  draw(sk, _v, L) {
    sk.limb([1.3, 0, 1.78, 0], 0.26, L.color, { line: 0.5 });
    sk.limb([1.1, 0, 1.42, 0], 0.36, '#5a5f6e', { line: 0.5 });
    sk.limb([0.05, 0, 1.15, 0], 0.5, '#f2f3f6', { dark: '#c3c8d2', line: 0.5 });
    sk.limb([-0.55, 0, 0.05, 0], 0.54, L.color, { dark: shade(L.color, -0.3), line: 0.5 });
  },
};

// A slim space stylus: steel, a band in the agent's colour, its tip
// glowing.
const stylus: Tool = {
  name: 'stylus',
  draw(sk, _v, L) {
    sk.limb([1.4, 0, 1.8, 0], 0.15, '#4a5160', { line: 0.4 });
    sk.limb([-0.5, 0, 1.45, 0], 0.26, METAL, { dark: METAL_D, line: 0.5 });
    sk.blob((p) => p.rect(0.0, -0.17, 0.24, 0.34), L.color, { line: 0.4 });
    sk.draw((p) => {
      p.fillStyle = alpha('#7ff0ff', 0.45);
      p.beginPath();
      p.arc(1.9, 0, 0.3, 0, TAU);
      p.fill();
      p.fillStyle = '#e4feff';
      p.beginPath();
      p.arc(1.9, 0, 0.13, 0, TAU);
      p.fill();
    });
  },
};

// A click pen: a blue barrel, a steel clip and button, a steel tip.
const PEN = '#3d6fd0';
const pen: Tool = {
  name: 'pen',
  draw(sk) {
    sk.limb([-0.62, 0, -0.38, 0], 0.18, METAL, { line: 0.4 });
    sk.blob((p) => {
      p.moveTo(1.38, -0.16);
      p.lineTo(1.84, -0.05);
      p.lineTo(1.84, 0.05);
      p.lineTo(1.38, 0.16);
      p.closePath();
    }, METAL, { dark: METAL_D, d: 0.06, line: 0.5 });
    sk.limb([-0.4, 0, 1.42, 0], 0.34, PEN, { dark: shade(PEN, -0.3), line: 0.5 });
    sk.limb([-0.3, -0.2, 0.55, -0.2], 0.1, METAL, { line: 0.4 });
    sk.blob((p) => p.arc(1.9, 0, 0.06, 0, TAU), '#3a3040', { line: 0 });
  },
};

// A feather quill, its nib dipped: a tawny feather for a forager, a black
// one for a devil (its ink red), a white one barred grey for a nord.
const FEATHER: Partial<Record<Costume, [Color, Color, Color]>> = {
  demon: ['#3a3242', '#1f1a26', '#c23a2e'],
  nord: ['#f1efe9', '#c3c7cf', '#2b2233'],
};
const quill: Tool = {
  name: 'quill',
  draw(sk, _v, L) {
    const [vane, vaneD, ink] = FEATHER[L.costume] ?? ['#d2a868', '#a07845', '#2b2233'];
    // the bare shaft and its nib
    sk.limb([0.85, -0.05, 1.68, 0], 0.16, '#f2e6c8', { line: 0.4 });
    sk.blob((p) => {
      p.moveTo(1.62, -0.08);
      p.lineTo(1.98, 0);
      p.lineTo(1.62, 0.08);
      p.closePath();
    }, ink, { line: 0.4 });
    // the vane, sweeping back and up from the hand, split here and there
    const vanePath = (p: Pen) => {
      p.moveTo(1.02, -0.02);
      p.quadraticCurveTo(0.8, -0.46, 0.38, -0.6);
      p.lineTo(0.18, -0.44);
      p.lineTo(0.06, -0.68);
      p.quadraticCurveTo(-0.45, -0.76, -0.84, -0.6);
      p.quadraticCurveTo(-0.55, -0.3, -0.12, -0.06);
      p.lineTo(0.2, 0.08);
      p.lineTo(0.32, -0.04);
      p.lineTo(0.44, 0.13);
      p.quadraticCurveTo(0.8, 0.14, 1.02, -0.02);
      p.closePath();
    };
    sk.blob(vanePath, vane, { dark: vaneD, d: 0.12 });
    sk.draw((p, c) => {
      p.save();
      p.beginPath();
      vanePath(p);
      p.clip();
      if (L.costume === 'nord') {
        // a dark tip to the feather
        p.fillStyle = '#5b5f6b';
        p.fillRect(-0.9, -0.9, 0.5, 1.2);
      }
      // the rachis and the barbs off it
      p.strokeStyle = alpha(vaneD, 0.95);
      p.lineWidth = Math.max(0.06, 0.6 / c.px);
      p.lineCap = 'round';
      p.beginPath();
      p.moveTo(1.0, -0.03);
      p.quadraticCurveTo(0.15, -0.16, -0.8, -0.58);
      for (const x of [0.62, 0.0, -0.45]) {
        const y = -0.04 - 0.3 * ((1 - x) / 1.8) ** 1.4;
        p.moveTo(x, y);
        p.lineTo(x - 0.3, y - 0.36);
        p.moveTo(x, y);
        p.lineTo(x - 0.22, y + 0.2);
      }
      p.stroke();
      p.restore();
    });
  },
};

// A fountain pen: a black barrel banded in gold, a gold clip, a gold nib
// with its slit.
const LACQUER = '#2e2c38';
const GILT = '#e8c25a';
const fountainPen: Tool = {
  name: 'fountainPen',
  draw(sk) {
    sk.blob((p) => {
      p.moveTo(1.32, -0.17);
      p.quadraticCurveTo(1.72, -0.15, 1.98, 0);
      p.quadraticCurveTo(1.72, 0.15, 1.32, 0.17);
      p.closePath();
    }, GILT, { dark: shade(GILT, -0.25), d: 0.06, line: 0.5 });
    marks(sk, '#5a4520', 0.04, (p) => {
      p.moveTo(1.6, 0);
      p.lineTo(1.92, 0);
    });
    sk.limb([1.0, 0, 1.36, 0], 0.3, LACQUER, { line: 0.5 });
    sk.limb([-0.55, 0, 1.05, 0], 0.42, '#45424f', { dark: LACQUER, line: 0.5 });
    sk.blob((p) => p.rect(0.36, -0.24, 0.14, 0.48), GILT, { line: 0.4 });
    sk.limb([-0.4, -0.24, 0.3, -0.24], 0.1, GILT, { line: 0.4 });
  },
};

export const SURFACES: Record<Costume, Tool> = {
  ...everyone(notepad),
  miner: slate,
  scientist: clipboard,
  raver: flyer,
  hacker: stickyNotes,
  astronaut: datapad,
  casual: orderPad,
  forager: leaf,
  parka: notebook,
  guard: ledger,
  demon: scroll,
  drifter: notebook,
  nord: parchment,
  exosuit: datapad,
  jumpsuit: clipboard,
  colonist: notebook,
  startup: stickyNotes,
};
export const WRITERS: Record<Costume, Tool> = {
  ...everyone(pencil),
  miner: chalk,
  raver: marker,
  hacker: marker,
  astronaut: stylus,
  casual: pen,
  forager: quill,
  demon: quill,
  nord: quill,
  exosuit: stylus,
  startup: marker,
  guard: fountainPen,
};
