import type { Costume } from '../../../world/character.ts';
import type { Color, Pen } from '../../types.ts';
import { alpha, mix, shade } from '../../iso.ts';
import { zoom, type Ctx, type Sketch } from '../paint.ts';
import { BRASS, COVER, METAL, PAGE, PAGE_D, SCREEN, TAU, WHITE, WOOD, WOOD_D, everyone, type Tool } from './tool.ts';

// The read pose's tools: held open in both hands, about 4 across and 2.6
// tall, pages toward the viewer; `v` (0 to 1) turns a page over from right
// to left. From the front before the chest; from behind at the side (see
// the read pose in ../rig.ts), where the near arm crosses the left half,
// so what tells one from another sits on the right page and along the
// top. Each costume's own below.

// An open book.
const book: Tool = { name: 'book', draw: (sk, v) => sk.at(zoom(1.15), () => openBook(sk, v)) };

// An open book, pages toward the viewer; `flip` (0..1) flips a page over
// from right to left.
function openBook(sk: Sketch, flip: number): void {
  sk.blob((p) => {
    p.moveTo(-1.75, -0.95);
    p.quadraticCurveTo(-0.85, -1.3, 0, -1.0);
    p.quadraticCurveTo(0.85, -1.3, 1.75, -0.95);
    p.lineTo(1.75, 1.05);
    p.quadraticCurveTo(0.85, 0.75, 0, 1.1);
    p.quadraticCurveTo(-0.85, 0.75, -1.75, 1.05);
    p.closePath();
  }, COVER, { dark: shade(COVER, -0.2), d: 0.2 });
  for (const s of [-1, 1]) {
    sk.blob((p) => {
      p.moveTo(0, -0.88);
      p.quadraticCurveTo(s * 0.75, -1.12, s * 1.55, -0.88);
      p.lineTo(s * 1.55, 0.85);
      p.quadraticCurveTo(s * 0.75, 0.62, 0, 0.92);
      p.closePath();
    }, PAGE, { dark: s > 0 ? PAGE_D : null, d: 0.25, sil: false });
  }
  sk.draw((p, c) => {
    if (c.px < 5) return;
    p.strokeStyle = alpha(c.ink, 0.35);
    p.lineWidth = Math.max(c.line * 0.5, 0.5 / c.px);
    p.beginPath();
    for (const s of [-1, 1]) {
      for (const y of [-0.45, -0.05, 0.35]) {
        p.moveTo(s * 0.3, y - 0.05);
        p.quadraticCurveTo(s * 0.75, y - 0.18, s * 1.25, y - 0.05);
      }
    }
    p.stroke();
  });
  if (flip > 0 && flip < 1) {
    const ex = 1.55 * Math.cos(Math.PI * flip);
    const lift = 0.5 * Math.sin(Math.PI * flip);
    sk.blob((p) => {
      p.moveTo(0, -0.88);
      p.lineTo(ex, -0.88 - lift);
      p.lineTo(ex, 0.85 - lift);
      p.lineTo(0, 0.92);
      p.closePath();
    }, mix(PAGE, WHITE, 0.4), { line: 0.6, sil: false });
  }
}

// ---- open books of other kinds -----------------------------------------------

// The make of an open book: a page `w` across from the spine and `2h`
// tall, its top bowing up by `lift`; the boards standing `over` past the
// pages; a page block `block` thick showing under them.
type Spread = { w: number; h: number; lift: number; cover: Color; over: number; block: number; page: Color; pageD: Color };

// One page, side s (-1 left of the spine, 1 right), `dy` lower.
function leaf(p: Pen, s: number, b: Spread, dy = 0): void {
  p.moveTo(0, -b.h + dy);
  p.quadraticCurveTo(s * b.w * 0.48, -b.h - b.lift + dy, s * b.w, -b.h + dy);
  p.lineTo(s * b.w, b.h - 0.03 + dy);
  p.quadraticCurveTo(s * b.w * 0.48, b.h - b.lift - 0.02 + dy, 0, b.h + 0.07 + dy);
  p.closePath();
}

// The boards round the pages, both halves.
function boards(p: Pen, b: Spread): void {
  const W = b.w + b.over;
  const top = -b.h - 0.08;
  const bot = b.h + b.block + Math.max(b.over * 0.8, 0.1);
  p.moveTo(-W, top);
  p.quadraticCurveTo(-W * 0.49, top - b.lift - 0.1, 0, top - 0.04);
  p.quadraticCurveTo(W * 0.49, top - b.lift - 0.1, W, top);
  p.lineTo(W, bot);
  p.quadraticCurveTo(W * 0.49, bot - b.lift - 0.06, 0, bot + 0.06);
  p.quadraticCurveTo(-W * 0.49, bot - b.lift - 0.06, -W, bot);
  p.closePath();
}

// Boards, the page block and the two pages, the right one shaded.
function spread(sk: Sketch, b: Spread): void {
  sk.blob((p) => boards(p, b), b.cover, { dark: shade(b.cover, -0.22), d: 0.2 });
  for (const s of [-1, 1]) {
    if (b.block > 0) sk.blob((p) => leaf(p, s, b, b.block), b.pageD, { line: 0.45, sil: false });
    sk.blob((p) => leaf(p, s, b), b.page, { dark: s > 0 ? b.pageD : null, d: 0.25, sil: false });
  }
}

// A page turning over from right to left, `v` of the way (0..1).
function turning(sk: Sketch, v: number, b: Spread): void {
  if (v <= 0 || v >= 1) return;
  const ex = b.w * Math.cos(Math.PI * v);
  const up = 0.5 * Math.sin(Math.PI * v);
  sk.blob((p) => {
    p.moveTo(0, -b.h);
    p.lineTo(ex, -b.h - up);
    p.lineTo(ex, b.h - 0.03 - up);
    p.lineTo(0, b.h + 0.07);
    p.closePath();
  }, mix(b.page, WHITE, 0.4), { line: 0.6, sil: false });
}

// A fine line's width, `k` of the inner line, never under half a pixel.
const fine = (c: Ctx, k = 0.5) => Math.max(c.line * k, 0.5 / c.px);

// Lines of writing from x0 to x1, a row at each y, bowed like a page;
// only where there are pixels enough to show them.
function rows(p: Pen, c: Ctx, x0: number, x1: number, ys: readonly number[], col: Color, k = 0.5): void {
  if (c.px < 5) return;
  p.strokeStyle = col;
  p.lineWidth = fine(c, k);
  p.lineCap = 'round';
  p.beginPath();
  for (const y of ys) {
    p.moveTo(x0, y);
    p.quadraticCurveTo((x0 + x1) / 2, y - 0.13, x1, y);
  }
  p.stroke();
}

const circle = (cx: number, cy: number, r: number) => (p: Pen) => {
  p.moveTo(cx + r, cy);
  p.arc(cx, cy, r, 0, TAU);
};

// A café's recipe book: teal boards, a ribbon marker, a list of what goes
// in on the left and a frosted cake with a cherry on the right.
const RECIPE: Spread = { w: 1.6, h: 1.0, lift: 0.24, cover: '#2f6e6a', over: 0.18, block: 0, page: '#fbf2df', pageD: '#e6d5b8' };
const recipeBook: Tool = {
  name: 'recipeBook',
  draw(sk, v) {
    sk.limb([0.1, 0.9, 0.2, 1.55], 0.18, '#d8443a', { line: 0.6 });
    spread(sk, RECIPE);
    sk.draw((p, c) => {
      rows(p, c, -0.45, -1.35, [-0.66], alpha(c.ink, 0.6), 1.1);
      rows(p, c, -0.4, -1.15, [-0.28, 0.06, 0.4, 0.74], alpha(c.ink, 0.35));
      if (c.px < 5) return;
      p.fillStyle = '#d8443a';
      for (const y of [-0.28, 0.06, 0.4, 0.74]) {
        p.beginPath();
        p.arc(-1.3, y - 0.06, 0.07, 0, TAU);
        p.fill();
      }
    });
    // the cake on its plate
    sk.blob((p) => p.ellipse(0.82, 0.66, 0.66, 0.12, 0, 0, TAU), WHITE, { line: 0.45, sil: false });
    sk.blob((p) => p.roundRect(0.38, -0.02, 0.88, 0.66, 0.06), '#d08f55', { dark: '#ad6e3e', d: 0.14, line: 0.45, sil: false });
    sk.draw((p) => {
      p.fillStyle = '#fff1d0';
      p.fillRect(0.39, 0.28, 0.86, 0.09);
    });
    sk.blob((p) => {
      p.moveTo(0.32, 0.12);
      p.quadraticCurveTo(0.34, -0.36, 0.82, -0.36);
      p.quadraticCurveTo(1.3, -0.36, 1.32, 0.12);
      p.quadraticCurveTo(1.27, 0.34, 1.16, 0.14);
      p.quadraticCurveTo(1.04, 0.06, 0.94, 0.14);
      p.quadraticCurveTo(0.86, 0.4, 0.76, 0.14);
      p.quadraticCurveTo(0.64, 0.06, 0.54, 0.14);
      p.quadraticCurveTo(0.44, 0.32, 0.36, 0.16);
      p.closePath();
    }, '#f59cc2', { dark: '#e07aa6', d: 0.12, line: 0.45, sil: false });
    sk.draw((p, c) => {
      p.strokeStyle = '#5f8a3a';
      p.lineWidth = fine(c, 0.8);
      p.lineCap = 'round';
      p.beginPath();
      p.moveTo(0.84, -0.54);
      p.quadraticCurveTo(0.86, -0.72, 0.98, -0.8);
      p.stroke();
    });
    sk.blob(circle(0.82, -0.47, 0.15), '#d8343a', { dark: '#b02a2e', d: 0.07, line: 0.45, sil: false });
    turning(sk, v, RECIPE);
  },
};

// A forager's field guide: a small book of tall pages in moss cloth with
// an elastic band, a leaf drawn on the left and a toadstool on the right.
const GUIDE: Spread = { w: 1.3, h: 1.2, lift: 0.22, cover: '#5a7a2a', over: 0.16, block: 0, page: '#f6efd9', pageD: '#e2d5b4' };
const fieldGuide: Tool = {
  name: 'fieldGuide',
  draw(sk, v) {
    spread(sk, GUIDE);
    sk.limb([1.38, -1.32, 1.38, 1.36], 0.14, '#3a2a1e', { line: 0.4, sil: false });
    // a leaf
    sk.blob((p) => {
      p.moveTo(-1.05, 0.2);
      p.quadraticCurveTo(-1.08, -0.62, -0.3, -0.78);
      p.quadraticCurveTo(-0.36, 0.0, -1.05, 0.2);
      p.closePath();
    }, '#79a85c', { dark: '#5a8a44', d: 0.12, line: 0.45, sil: false });
    sk.draw((p, c) => {
      p.strokeStyle = '#4a7a3a';
      p.lineWidth = fine(c, 0.7);
      p.lineCap = 'round';
      p.beginPath();
      p.moveTo(-1.16, 0.36);
      p.lineTo(-1.05, 0.2);
      p.quadraticCurveTo(-0.75, -0.25, -0.38, -0.68);
      p.stroke();
      rows(p, c, -0.3, -1.1, [0.62, 0.9], alpha(c.ink, 0.35));
    });
    // a toadstool
    sk.blob((p) => {
      p.moveTo(0.52, 0.0);
      p.lineTo(0.8, 0.0);
      p.quadraticCurveTo(0.8, 0.5, 0.9, 0.74);
      p.lineTo(0.42, 0.74);
      p.quadraticCurveTo(0.52, 0.5, 0.52, 0.0);
      p.closePath();
    }, '#ece2c9', { dark: '#d6c4a2', d: 0.1, line: 0.45, sil: false });
    sk.blob((p) => {
      p.moveTo(0.18, 0.06);
      p.quadraticCurveTo(0.2, -0.66, 0.66, -0.66);
      p.quadraticCurveTo(1.12, -0.66, 1.14, 0.06);
      p.quadraticCurveTo(0.66, -0.08, 0.18, 0.06);
      p.closePath();
    }, '#c8443a', { dark: '#a0332c', d: 0.14, line: 0.45, sil: false });
    sk.draw((p, c) => {
      p.fillStyle = WHITE;
      for (const [x, y, r] of [[0.46, -0.3, 0.09], [0.78, -0.46, 0.08], [0.94, -0.16, 0.065]] as const) {
        p.beginPath();
        p.arc(x, y, r, 0, TAU);
        p.fill();
      }
      p.strokeStyle = '#5a8a44';
      p.lineWidth = fine(c, 0.8);
      p.lineCap = 'round';
      p.beginPath();
      p.moveTo(0.22, 0.78);
      p.lineTo(1.1, 0.78);
      p.stroke();
    });
    turning(sk, v, GUIDE);
  },
};

// A scientist's lab manual: spiral bound, so its pages lie flat in two
// halves with the coil between; a graph on the left, a flask of something
// green on the right.
const LAB: Spread = { w: 1.82, h: 1.0, lift: 0, cover: '#2a8f84', over: 0, block: 0, page: '#fbfdfc', pageD: '#dfeae6' };
const labManual: Tool = {
  name: 'labManual',
  draw(sk, v) {
    sk.blob((p) => {
      p.roundRect(-1.94, -1.08, 1.88, 2.24, 0.1);
      p.roundRect(0.06, -1.08, 1.88, 2.24, 0.1);
    }, LAB.cover, { dark: shade(LAB.cover, -0.22), d: 0.18 });
    for (const s of [-1, 1]) {
      sk.blob((p) => p.rect(s > 0 ? 0.14 : -1.82, -1.0, 1.68, 2.04), LAB.page, { dark: s > 0 ? LAB.pageD : null, d: 0.2, sil: false });
    }
    // the coil
    sk.draw((p, c) => {
      p.lineCap = 'round';
      for (const [col, w] of [[c.ink, 0.17], [METAL, 0.08]] as const) {
        p.strokeStyle = col;
        p.lineWidth = Math.max(w, (col === c.ink ? 2 : 1) / c.px);
        p.beginPath();
        for (let y = -0.84; y < 0.9; y += 0.28) {
          p.moveTo(-0.24, y + 0.05);
          p.quadraticCurveTo(0, y - 0.16, 0.24, y + 0.05);
        }
        p.stroke();
      }
    });
    // a graph on the left
    sk.draw((p, c) => {
      p.lineCap = 'round';
      p.lineJoin = 'round';
      p.strokeStyle = alpha(c.ink, 0.6);
      p.lineWidth = fine(c, 0.7);
      p.beginPath();
      p.moveTo(-1.55, -0.78);
      p.lineTo(-1.55, -0.12);
      p.lineTo(-0.45, -0.12);
      p.stroke();
      p.strokeStyle = '#d8343a';
      p.lineWidth = fine(c, 1.0);
      p.beginPath();
      p.moveTo(-1.45, -0.24);
      p.lineTo(-1.15, -0.4);
      p.lineTo(-0.9, -0.32);
      p.lineTo(-0.55, -0.7);
      p.stroke();
      rows(p, c, -0.45, -1.55, [0.28, 0.54, 0.8], alpha(c.ink, 0.35));
    });
    // a flask
    const flask = (p: Pen) => {
      p.moveTo(0.86, -0.72);
      p.lineTo(1.08, -0.72);
      p.lineTo(1.08, -0.24);
      p.lineTo(1.46, 0.6);
      p.quadraticCurveTo(1.5, 0.76, 1.34, 0.76);
      p.lineTo(0.6, 0.76);
      p.quadraticCurveTo(0.44, 0.76, 0.48, 0.6);
      p.lineTo(0.86, -0.24);
      p.closePath();
    };
    sk.blob(flask, '#e3f4f6', { line: 0.45, sil: false });
    sk.draw((p, c) => {
      p.save();
      p.beginPath();
      flask(p);
      p.clip();
      p.fillStyle = '#7ed957';
      p.fillRect(0.4, 0.2, 1.2, 0.6);
      p.fillStyle = alpha(WHITE, 0.6);
      p.fillRect(0.62, -0.7, 0.1, 1.4);
      p.restore();
      p.strokeStyle = '#4fae3a';
      p.lineWidth = fine(c, 0.7);
      p.beginPath();
      for (const [x, y, r] of [[0.92, 0.02, 0.07], [1.06, -0.2, 0.05], [0.95, -0.4, 0.045]] as const) {
        p.moveTo(x + r, y);
        p.arc(x, y, r, 0, TAU);
      }
      p.stroke();
      p.strokeStyle = alpha(c.ink, 0.7);
      p.beginPath();
      p.moveTo(0.8, -0.72);
      p.lineTo(1.14, -0.72);
      p.stroke();
    });
    turning(sk, v, LAB);
  },
};

// A guard's ledger: a thick account book, navy boards with brass corners,
// the page block deep under the pages, ruled rows and red money columns.
const LEDGER: Spread = { w: 1.85, h: 0.98, lift: 0.16, cover: '#2c3a5c', over: 0.17, block: 0.28, page: '#f8f2e0', pageD: '#e4d8bc' };
const ledgerBook: Tool = {
  name: 'ledgerBook',
  draw(sk, v) {
    const b = LEDGER;
    spread(sk, b);
    sk.draw((p, c) => {
      // the page block's edges
      p.strokeStyle = shade(b.pageD, -0.18);
      p.lineWidth = fine(c, 0.5);
      p.beginPath();
      for (const s of [-1, 1]) {
        for (const k of [0.1, 0.19]) {
          p.moveTo(s * b.w, b.h - 0.03 + k);
          p.quadraticCurveTo(s * b.w * 0.48, b.h - b.lift - 0.02 + k, 0, b.h + 0.07 + k);
        }
      }
      p.stroke();
      // ruled rows and money columns
      p.strokeStyle = alpha('#5f8fc8', 0.55);
      p.lineWidth = fine(c, 0.5);
      p.beginPath();
      for (const s of [-1, 1]) {
        for (let y = -0.62; y < 0.9; y += 0.26) {
          p.moveTo(s * 0.12, y + 0.06);
          p.quadraticCurveTo(s * b.w * 0.48, y - 0.06, s * (b.w - 0.08), y + 0.02);
        }
      }
      p.stroke();
      p.strokeStyle = '#d0503f';
      p.lineWidth = fine(c, 0.7);
      p.beginPath();
      for (const s of [-1, 1]) {
        for (const x of [0.45, 1.3, 1.38]) {
          p.moveTo(s * x, -0.95 - 0.06 * Math.sin((x / b.w) * Math.PI));
          p.lineTo(s * x, 0.92 - 0.06 * Math.sin((x / b.w) * Math.PI));
        }
      }
      p.stroke();
      if (c.px < 5) return;
      p.strokeStyle = alpha(c.ink, 0.55);
      p.beginPath();
      for (const s of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const y = -0.56 + i * 0.26;
          const w = [0.5, 0.35, 0.6, 0.42, 0.55, 0.3][(i + (s > 0 ? 2 : 0)) % 6];
          p.moveTo(s * 0.58, y);
          p.lineTo(s * (0.58 + w), y);
          p.moveTo(s * 1.46, y);
          p.lineTo(s * (1.46 + 0.22), y);
        }
      }
      p.stroke();
    });
    // brass corners
    sk.draw((p, c) => {
      const W = b.w + b.over;
      const top = -b.h - 0.08;
      const bot = b.h + b.block + Math.max(b.over * 0.8, 0.1);
      p.save();
      p.beginPath();
      boards(p, b);
      p.clip();
      p.beginPath();
      for (const s of [-1, 1]) {
        p.moveTo(s * W, top + 0.42);
        p.lineTo(s * W, top - 0.3);
        p.lineTo(s * (W - 0.46), top - 0.3);
        p.closePath();
        p.moveTo(s * W, bot - 0.42);
        p.lineTo(s * W, bot + 0.3);
        p.lineTo(s * (W - 0.46), bot + 0.3);
        p.closePath();
      }
      p.fillStyle = BRASS;
      p.fill();
      p.strokeStyle = c.ink;
      p.lineWidth = fine(c, 0.6);
      p.stroke();
      p.restore();
    });
    turning(sk, v, b);
  },
};

// A demon's grimoire: black boards with bone spikes at the corners,
// old yellow pages, red scrawl on the left and a glowing sigil on the
// right.
const GRIM: Spread = { w: 1.5, h: 1.1, lift: 0.28, cover: '#4d3a58', over: 0.24, block: 0.06, page: '#ecd7a6', pageD: '#cfb27a' };
const grimoire: Tool = {
  name: 'grimoire',
  draw(sk, v) {
    const b = GRIM;
    const W = b.w + b.over;
    const top = -b.h - 0.08;
    const bot = b.h + b.block + Math.max(b.over * 0.8, 0.1);
    spread(sk, b);
    // bone caps on the corners, each drawn out to a point
    sk.blob((p) => {
      for (const s of [-1, 1]) {
        for (const [y, u] of [[top, -1], [bot, 1]] as const) {
          p.moveTo(s * (W - 0.46), y);
          p.quadraticCurveTo(s * (W + 0.05), y + u * 0.02, s * (W + 0.42), y + u * 0.42);
          p.quadraticCurveTo(s * (W + 0.02), y + u * 0.05, s * W, y - u * 0.46);
          p.lineTo(s * (W - 0.24), y - u * 0.24);
          p.closePath();
        }
      }
    }, '#eadfc4', { dark: '#c9b994', d: 0.08 });
    sk.draw((p, c) => {
      rows(p, c, -0.3, -1.25, [-0.6, -0.26, 0.08, 0.42, 0.76], alpha('#8a2a20', 0.6), 0.7);
      // the sigil's glow
      for (const [r, a] of [[0.74, 0.16], [0.58, 0.2]] as const) {
        p.beginPath();
        p.arc(0.76, 0.0, r, 0, TAU);
        p.fillStyle = alpha('#ff6a2a', a);
        p.fill();
      }
      p.strokeStyle = '#d0302a';
      p.lineWidth = Math.max(0.1, 1 / c.px);
      p.lineJoin = 'round';
      p.beginPath();
      p.moveTo(0.76 + 0.5, 0.0);
      p.arc(0.76, 0.0, 0.5, 0, TAU);
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * TAU) / 3;
        const x = 0.76 + 0.5 * Math.cos(a);
        const y = 0.5 * Math.sin(a);
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      p.closePath();
      p.stroke();
      p.beginPath();
      p.arc(0.76, 0.0, 0.1, 0, TAU);
      p.fillStyle = '#ffb347';
      p.fill();
    });
    turning(sk, v, b);
  },
};

// A shelter manual: a thin booklet in safety orange, a hazard stripe across
// the head of each page, numbered steps on the left, a gear on the right.
const MANUAL: Spread = { w: 1.55, h: 1.0, lift: 0.2, cover: '#e8833a', over: 0.13, block: 0, page: '#f3f1e7', pageD: '#dcd8c6' };
const manual: Tool = {
  name: 'manual',
  draw(sk, v) {
    const b = MANUAL;
    spread(sk, b);
    sk.draw((p, c) => {
      for (const s of [-1, 1]) {
        const x0 = s > 0 ? 0.16 : -1.4;
        p.save();
        p.beginPath();
        p.rect(x0, -0.9, 1.24, 0.28);
        p.clip();
        p.fillStyle = '#f2c230';
        p.fillRect(x0, -0.9, 1.24, 0.28);
        p.fillStyle = '#2b2633';
        p.beginPath();
        for (let x = x0 - 0.3; x < x0 + 1.3; x += 0.3) {
          p.moveTo(x, -0.62);
          p.lineTo(x + 0.15, -0.62);
          p.lineTo(x + 0.43, -0.9);
          p.lineTo(x + 0.28, -0.9);
          p.closePath();
        }
        p.fill();
        p.restore();
        p.strokeStyle = c.ink;
        p.lineWidth = fine(c, 0.5);
        p.beginPath();
        p.rect(x0, -0.9, 1.24, 0.28);
        p.stroke();
      }
      rows(p, c, -0.35, -1.12, [-0.24, 0.12, 0.48, 0.84], alpha(c.ink, 0.35));
      if (c.px < 4) return;
      p.fillStyle = '#3f9e9a';
      for (const y of [-0.24, 0.12, 0.48, 0.84]) {
        p.beginPath();
        p.arc(-1.28, y - 0.06, 0.09, 0, TAU);
        p.fill();
      }
    });
    sk.blob((p) => gear(p, 0.8, 0.22, 0.5, 8), '#8e9c9a', { dark: '#5f6e6b', d: 0.12, line: 0.5, sil: false, rule: 'evenodd' });
    turning(sk, v, b);
  },
};

// A gear of n teeth round (cx, cy), r to the tips, with a hole.
function gear(p: Pen, cx: number, cy: number, r: number, n: number): void {
  const ri = r * 0.76;
  const w = Math.PI / n;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    for (const [rr, aa] of [[ri, a - w * 0.95], [r, a - w * 0.5], [r, a + w * 0.5], [ri, a + w * 0.95]] as const) {
      const x = cx + rr * Math.cos(aa);
      const y = cy + rr * Math.sin(aa);
      if (i === 0 && aa === a - w * 0.95) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
  }
  p.closePath();
  p.moveTo(cx + r * 0.28, cy);
  p.arc(cx, cy, r * 0.28, 0, TAU);
}

// A colonist's almanac: a paper-covered booklet hung up by a loop of twine
// through its corner, tables on the left, the sun and the moon's phases
// on the right.
const ALMANAC: Spread = { w: 1.5, h: 1.05, lift: 0.2, cover: '#b98a4e', over: 0.08, block: 0, page: '#f1e2bd', pageD: '#dcc697' };
const almanac: Tool = {
  name: 'almanac',
  draw(sk, v) {
    const b = ALMANAC;
    spread(sk, b);
    sk.draw((p, c) => {
      // a table
      p.strokeStyle = alpha(c.ink, 0.45);
      p.lineWidth = fine(c, 0.5);
      p.beginPath();
      for (let y = -0.55; y < 0.9; y += 0.3) {
        p.moveTo(-0.16, y);
        p.lineTo(-1.36, y);
      }
      for (const x of [-0.6, -1.0]) {
        p.moveTo(x, -0.55);
        p.lineTo(x, 0.65);
      }
      p.stroke();
      rows(p, c, -0.3, -1.3, [-0.74], alpha(c.ink, 0.6), 1.1);
      // the sun
      const sx = 0.75;
      const sy = -0.32;
      p.strokeStyle = '#e8833a';
      p.lineWidth = Math.max(0.08, 0.8 / c.px);
      p.lineCap = 'round';
      p.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        p.moveTo(sx + 0.38 * Math.cos(a), sy + 0.38 * Math.sin(a));
        p.lineTo(sx + 0.52 * Math.cos(a), sy + 0.52 * Math.sin(a));
      }
      p.stroke();
    });
    sk.blob(circle(0.75, -0.32, 0.29), '#f2c230', { dark: '#d9a020', d: 0.1, line: 0.45, sil: false });
    // the moon's phases
    sk.draw((p, c) => {
      const night = '#3a3a52';
      for (let i = 0; i < 4; i++) {
        const x = 0.3 + i * 0.32;
        const y = 0.44;
        p.beginPath();
        p.arc(x, y, 0.13, 0, TAU);
        p.fillStyle = i === 2 ? '#fffbe8' : night;
        p.fill();
        if (i === 1 || i === 3) {
          p.beginPath();
          p.arc(x, y, 0.13, i === 1 ? -Math.PI / 2 : Math.PI / 2, i === 1 ? Math.PI / 2 : (3 * Math.PI) / 2);
          p.closePath();
          p.fillStyle = '#fffbe8';
          p.fill();
        }
        p.beginPath();
        p.arc(x, y, 0.13, 0, TAU);
        p.strokeStyle = c.ink;
        p.lineWidth = fine(c, 0.5);
        p.stroke();
      }
      rows(p, c, 0.25, 1.3, [0.8], alpha(c.ink, 0.35));
      // the holes the twine goes through
      p.fillStyle = alpha(c.ink, 0.7);
      for (const s of [-1, 1]) {
        p.beginPath();
        p.arc(s * 0.17, -0.84, 0.055, 0, TAU);
        p.fill();
      }
    });
    sk.limb([-0.17, -0.84, -0.25, -1.12, -0.26, -1.36, -0.2, -1.58, -0.1, -1.69, 0, -1.71, 0.1, -1.69, 0.2, -1.58, 0.26, -1.36, 0.25, -1.12, 0.17, -0.84], 0.07, '#b08a58', { line: 0.5 });
    turning(sk, v, b);
  },
};

// ---- sheets, rolls and slates ------------------------------------------------

// A miner's claim map, folded like a fan and opened: tan panels turned
// to and from the light, the workings drawn on it (a shaft, two levels
// and a drift), gold where it was found and a red cross on the claim.
const foldedMap: Tool = {
  name: 'foldedMap',
  draw(sk) {
    const X = [-2.0, -1.0, 0.0, 1.0, 2.0];
    const T = [-1.22, -1.02, -1.22, -1.02, -1.22];
    const B = [1.1, 1.3, 1.1, 1.3, 1.1];
    sk.blob((p) => {
      p.moveTo(X[0], T[0]);
      for (let i = 1; i < 5; i++) p.lineTo(X[i], T[i]);
      for (let i = 4; i >= 0; i--) p.lineTo(X[i], B[i]);
      p.closePath();
    }, '#efdcab', { line: 0.5 });
    for (const i of [1, 3]) {
      sk.blob((p) => {
        p.moveTo(X[i], T[i]);
        p.lineTo(X[i + 1], T[i + 1]);
        p.lineTo(X[i + 1], B[i + 1]);
        p.lineTo(X[i], B[i]);
        p.closePath();
      }, '#d6bd86', { line: 0.4, sil: false });
    }
    sk.draw((p, c) => {
      p.strokeStyle = '#6b4a2e';
      p.lineWidth = Math.max(0.13, 1 / c.px);
      p.lineCap = 'round';
      p.lineJoin = 'round';
      p.beginPath();
      p.moveTo(-0.55, -0.92);
      p.lineTo(-0.55, 0.85);
      p.moveTo(-1.65, -0.32);
      p.lineTo(0.9, -0.32);
      p.lineTo(1.45, -0.7);
      p.moveTo(-1.2, 0.42);
      p.lineTo(1.6, 0.42);
      p.moveTo(0.9, -0.32);
      p.lineTo(1.15, 0.42);
      p.stroke();
      // the headframe over the shaft
      p.lineWidth = Math.max(0.09, 0.8 / c.px);
      p.beginPath();
      p.moveTo(-0.8, -0.86);
      p.lineTo(-0.55, -1.08);
      p.lineTo(-0.3, -0.86);
      p.stroke();
      p.fillStyle = '#e2b03a';
      for (const [x, y] of [[-1.65, -0.32], [1.6, 0.42], [-1.2, 0.42]] as const) {
        p.beginPath();
        p.arc(x, y, 0.13, 0, TAU);
        p.fill();
      }
      p.strokeStyle = '#d0302a';
      p.lineWidth = Math.max(0.15, 1.2 / c.px);
      p.beginPath();
      p.moveTo(1.38, -0.98);
      p.lineTo(1.78, -0.62);
      p.moveTo(1.78, -0.98);
      p.lineTo(1.38, -0.62);
      p.stroke();
    });
  },
};

// A paper map: a pale sheet folded in four and opened, a corner turned
// over; the sea and a river in blue, snowy peaks, a wood, a compass and a
// red trail to a ringed spot.
const map: Tool = {
  name: 'map',
  draw(sk) {
    const sheet = (p: Pen) => {
      p.moveTo(-2.05, -1.24);
      p.quadraticCurveTo(0, -1.4, 2.05, -1.24);
      p.lineTo(2.05, 0.84);
      p.lineTo(1.6, 1.3);
      p.quadraticCurveTo(0, 1.2, -2.05, 1.3);
      p.closePath();
    };
    sk.blob(sheet, '#f4efe0', { dark: '#e0d8c2', d: 0.14 });
    sk.draw((p, c) => {
      p.save();
      p.beginPath();
      sheet(p);
      p.clip();
      // the sea, top right, and a river out of it
      p.beginPath();
      p.moveTo(0.55, -1.4);
      p.quadraticCurveTo(0.85, -0.42, 2.1, -0.34);
      p.lineTo(2.1, -1.4);
      p.closePath();
      p.fillStyle = '#8cc4e8';
      p.fill();
      p.strokeStyle = '#5aa0d8';
      p.lineWidth = Math.max(0.13, 1 / c.px);
      p.lineCap = 'round';
      p.beginPath();
      p.moveTo(1.0, -0.62);
      p.quadraticCurveTo(0.4, 0.05, -0.3, 0.2);
      p.quadraticCurveTo(-1.0, 0.38, -1.35, 1.35);
      p.stroke();
      // the folds
      p.strokeStyle = alpha(c.ink, 0.25);
      p.lineWidth = fine(c, 0.6);
      p.beginPath();
      p.moveTo(0, -1.4);
      p.lineTo(0, 1.4);
      p.moveTo(-2.1, 0.02);
      p.lineTo(2.1, 0.02);
      p.stroke();
      p.restore();
      // a wood
      p.fillStyle = '#6f9e4c';
      for (const [x, y] of [[1.0, 0.52], [1.22, 0.4], [1.3, 0.66], [1.52, 0.5]] as const) {
        p.beginPath();
        p.arc(x, y, 0.13, 0, TAU);
        p.fill();
      }
      // a trail, dashed, to a ringed spot
      const q = (t: number, a: number, b: number, d: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * d;
      p.strokeStyle = '#d0302a';
      p.lineWidth = Math.max(0.1, 0.9 / c.px);
      p.beginPath();
      for (let i = 0; i < 14; i += 2) {
        const t0 = i / 14;
        const t1 = (i + 1) / 14;
        p.moveTo(q(t0, -1.6, -0.4, 0.62), q(t0, -0.2, 1.1, 0.72));
        p.lineTo(q(t1, -1.6, -0.4, 0.62), q(t1, -0.2, 1.1, 0.72));
      }
      p.stroke();
      p.lineWidth = Math.max(0.11, 1 / c.px);
      p.beginPath();
      p.arc(0.62, 0.72, 0.16, 0, TAU);
      p.stroke();
    });
    // snowy peaks
    for (const [x, y, r] of [[-0.95, -0.42, 0.36], [-0.45, -0.5, 0.28], [0.5, -0.12, 0.26]] as const) {
      sk.blob((p) => {
        p.moveTo(x - r, y + r * 0.2);
        p.lineTo(x, y - r);
        p.lineTo(x + r, y + r * 0.2);
        p.closePath();
      }, '#9a8a78', { dark: '#7a6c5e', d: 0.08, line: 0.45, sil: false });
      sk.draw((p) => {
        p.beginPath();
        p.moveTo(x - r * 0.42, y - r * 0.42);
        p.lineTo(x, y - r);
        p.lineTo(x + r * 0.42, y - r * 0.42);
        p.lineTo(x + r * 0.15, y - r * 0.3);
        p.lineTo(x - r * 0.1, y - r * 0.45);
        p.closePath();
        p.fillStyle = WHITE;
        p.fill();
      });
    }
    // a compass
    sk.blob((p) => {
      const [cx, cy, r] = [-1.55, -0.78, 0.3];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU - Math.PI / 2;
        const rr = k % 2 ? r * 0.3 : r;
        if (k === 0) p.moveTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
        else p.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
      }
      p.closePath();
    }, '#5a6070', { line: 0.4, sil: false });
    sk.draw((p) => {
      p.beginPath();
      p.moveTo(-1.55, -1.08);
      p.lineTo(-1.48, -0.8);
      p.lineTo(-1.62, -0.8);
      p.closePath();
      p.fillStyle = '#d0302a';
      p.fill();
    });
    // the turned corner
    sk.blob((p) => {
      p.moveTo(1.6, 1.3);
      p.lineTo(2.05, 0.84);
      p.lineTo(1.68, 0.9);
      p.closePath();
    }, '#d8cfb4', { line: 0.5, sil: false });
  },
};

// A nord's scroll: parchment unrolled between two rolls on wooden rods,
// a red rule along its head and foot, rows of runes cut in brown ink.
const RUNES: readonly (readonly number[])[][] = [
  [[0, 1, 0, -1], [0, -0.3, 0.55, -0.8], [0, 0.2, 0.55, -0.3]], // fehu
  [[0, 1, 0, -1], [-0.55, -0.45, 0, -1, 0.55, -0.45]], // tiwaz
  [[0, 1, 0, -1, 0.5, -0.5, 0, 0, 0.55, 1]], // raido
  [[-0.5, -1, 0.5, 1], [0.5, -1, -0.5, 1]], // gebo
  [[0, 1, 0, -1], [0, 0.05, -0.55, -0.75], [0, 0.05, 0.55, -0.75]], // algiz
  [[-0.45, 1, -0.45, -1, 0.45, -0.4, 0.45, 1]], // uruz
  [[0.35, -1, -0.3, -0.3, 0.3, 0.3, -0.35, 1]], // sowilo
];
const scroll: Tool = {
  name: 'scroll',
  draw(sk) {
    sk.blob((p) => {
      p.moveTo(-1.9, -1.02);
      p.quadraticCurveTo(0, -1.14, 1.9, -1.02);
      p.lineTo(1.9, 1.02);
      p.quadraticCurveTo(0, 0.92, -1.9, 1.02);
      p.closePath();
    }, '#efdcb0', { dark: '#d6bb84', d: 0.2 });
    sk.draw((p, c) => {
      p.strokeStyle = '#a8402c';
      p.lineWidth = Math.max(0.08, 0.7 / c.px);
      p.beginPath();
      for (const [y, b] of [[-0.82, -0.1], [0.84, -0.08]] as const) {
        p.moveTo(-1.6, y);
        p.quadraticCurveTo(0, y + b, 1.6, y);
      }
      p.stroke();
      p.strokeStyle = '#4a2e1c';
      p.lineWidth = Math.max(c.line * 0.6, 0.8 / c.px);
      p.lineCap = 'round';
      p.lineJoin = 'round';
      p.beginPath();
      [-0.42, 0.06, 0.54].forEach((y, row) => {
        for (let i = 0; i < 5; i++) {
          const x = -1.3 + i * 0.65;
          for (const pts of RUNES[(i * 3 + row * 2) % RUNES.length]) {
            p.moveTo(x + pts[0] * 0.13, y - 0.04 + pts[1] * 0.2);
            for (let k = 2; k < pts.length; k += 2) p.lineTo(x + pts[k] * 0.13, y - 0.04 + pts[k + 1] * 0.2);
          }
        }
      });
      p.stroke();
    });
    for (const s of [-1, 1]) {
      sk.limb([s * 1.98, -1.56, s * 1.98, 1.56], 0.2, WOOD, { dark: WOOD_D, line: 0.6 });
      sk.limb([s * 1.98, -1.22, s * 1.98, 1.22], 0.5, '#e6cf9c', { dark: '#c4a56c', line: 0.6 });
      for (const y of [-1.58, 1.58]) sk.blob(circle(s * 1.98, y, 0.15), WOOD, { dark: WOOD_D, d: 0.06, line: 0.5 });
    }
  },
};

// A raver's record sleeve: violet card printed with a banded sunset over
// a line in the agent's colour, the black disc peeking out of the top;
// as the page would turn, the disc slides a little further out.
const SLEEVE = '#5b3c99';
const vinylSleeve: Tool = {
  name: 'vinylSleeve',
  draw(sk, v, L) {
    const k = v > 0 && v < 1 ? Math.sin(Math.PI * v) : 0;
    const dx = 0.5 + 0.1 * k;
    const dy = -0.6 - 0.15 * k;
    sk.blob(circle(dx, dy, 1.25), '#1f1b26', { line: 0.6 });
    sk.draw((p, c) => {
      p.strokeStyle = '#3d3748';
      p.lineWidth = fine(c, 0.6);
      p.beginPath();
      for (const r of [1.05, 0.88]) {
        p.moveTo(dx + r, dy);
        p.arc(dx, dy, r, 0, TAU);
      }
      p.stroke();
      p.strokeStyle = alpha(WHITE, 0.4);
      p.lineWidth = Math.max(0.08, 0.8 / c.px);
      p.lineCap = 'round';
      p.beginPath();
      p.arc(dx, dy, 0.98, -2.5, -1.75);
      p.stroke();
    });
    sk.blob((p) => p.roundRect(-1.55, -1.05, 2.85, 2.85, 0.1), SLEEVE, { dark: shade(SLEEVE, -0.25), d: 0.16 });
    sk.draw((p, c) => {
      const cx = 0.12;
      const cy = 0.24;
      const r = 0.88;
      p.save();
      p.beginPath();
      p.arc(cx, cy, r, 0, TAU);
      p.clip();
      ['#ff5fa2', '#ff7f86', '#ff9f5a', '#ffc04a'].forEach((col, i) => {
        p.fillStyle = col;
        p.fillRect(cx - r, cy - r + i * r * 0.5, 2 * r, r * 0.5 + 0.02);
      });
      p.fillStyle = SLEEVE;
      for (const [y, h] of [[0.14, 0.07], [0.4, 0.1], [0.64, 0.13]] as const) p.fillRect(cx - r, cy + y, 2 * r, h);
      p.restore();
      p.strokeStyle = L.color;
      p.lineWidth = Math.max(0.12, 1 / c.px);
      p.lineCap = 'round';
      p.beginPath();
      p.moveTo(-1.3, 1.4);
      p.lineTo(1.05, 1.4);
      p.stroke();
    });
  },
};

// A hacker's printout: fan-folded paper off a line printer, a torn top,
// green bars, sprocket holes down both margins and lines of code; the
// rest of it stacked in folds below.
const printout: Tool = {
  name: 'printout',
  draw(sk) {
    const Y = [0.5, 0.86, 1.18, 1.48, 1.74];
    const S = [0, 0.12, -0.02, 0.1, 0.0];
    for (let i = 0; i < 4; i++) {
      sk.blob((p) => {
        p.moveTo(-1.45 + S[i], Y[i]);
        p.lineTo(1.45 + S[i], Y[i]);
        p.lineTo(1.45 + S[i + 1], Y[i + 1]);
        p.lineTo(-1.45 + S[i + 1], Y[i + 1]);
        p.closePath();
      }, i % 2 ? '#f6f7ef' : '#d3d6c8', { line: 0.45 });
    }
    sk.blob((p) => {
      p.moveTo(-1.45, -1.62);
      for (let i = 1; i <= 10; i++) p.lineTo(-1.45 + i * 0.29, i % 2 ? -1.74 : -1.62);
      p.lineTo(1.45, 0.5);
      p.lineTo(-1.45, 0.5);
      p.closePath();
    }, '#fbfbf6', { dark: '#e3e4da', d: 0.14 });
    sk.draw((p, c) => {
      p.fillStyle = '#bfe2ba';
      for (let y = -1.44; y < 0.4; y += 0.48) p.fillRect(-1.18, y, 2.36, 0.24);
      p.fillStyle = '#bfe2ba';
      p.fillRect(-1.18 + S[1], Y[1] + 0.06, 2.36, 0.16);
      p.fillRect(-1.18 + S[3], Y[3] + 0.06, 2.36, 0.12);
      p.strokeStyle = alpha(c.ink, 0.3);
      p.lineWidth = fine(c, 0.4);
      p.beginPath();
      for (const x of [-1.2, 1.2]) {
        p.moveTo(x, -1.6);
        p.lineTo(x, 0.5);
      }
      p.stroke();
      if (c.px < 5) return;
      p.fillStyle = alpha(c.ink, 0.45);
      for (const x of [-1.33, 1.33]) {
        for (let y = -1.45; y < 0.45; y += 0.27) {
          p.beginPath();
          p.arc(x, y, 0.065, 0, TAU);
          p.fill();
        }
      }
      p.strokeStyle = alpha('#2a2f33', 0.6);
      p.lineWidth = fine(c, 0.55);
      p.lineCap = 'round';
      p.beginPath();
      const indent = [0, 0.25, 0.25, 0.5, 0.5, 0.25, 0, 0.25, 0.5];
      const len = [1.3, 1.1, 1.6, 0.9, 1.2, 0.8, 1.5, 1.0, 0.7];
      for (let i = 0; i < indent.length; i++) {
        const y = -1.38 + i * 0.22;
        p.moveTo(-1.02 + indent[i], y);
        p.lineTo(-1.02 + indent[i] + len[i], y);
      }
      p.stroke();
    });
  },
};

// A data slate for space: a rugged pale frame with rubber grips at the
// sides, a dark screen glowing with a wave, a radar sweep and bars, three
// lamps along the foot; `v` moves the sweep on.
const dataSlate: Tool = {
  name: 'dataSlate',
  draw(sk, v, L) {
    sk.draw((p) => {
      p.beginPath();
      p.ellipse(0, 0, 2.7, 1.95, 0, 0, TAU);
      p.fillStyle = alpha(SCREEN, 0.14);
      p.fill();
    });
    for (const s of [-1, 1]) sk.blob((p) => p.roundRect(s > 0 ? 1.72 : -2.32, -0.78, 0.6, 1.56, 0.24), '#2a2f3d', { dark: '#1c2029', d: 0.12 });
    sk.blob((p) => p.roundRect(-2.0, -1.3, 4.0, 2.6, 0.42), '#dfe5ee', { dark: '#b3bdcc', d: 0.2 });
    sk.blob((p) => p.roundRect(-1.6, -0.98, 3.2, 1.78, 0.16), '#14223a', { line: 0.5, sil: false });
    sk.draw((p, c) => {
      p.strokeStyle = SCREEN;
      p.lineWidth = Math.max(0.09, 0.9 / c.px);
      p.lineCap = 'round';
      p.lineJoin = 'round';
      // a wave
      p.beginPath();
      for (let i = 0; i <= 16; i++) {
        const x = -1.42 + i * 0.075;
        const y = -0.5 + 0.2 * Math.sin(i * 0.9);
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      p.stroke();
      // a radar
      const [rx, ry] = [0.85, -0.1];
      p.beginPath();
      p.moveTo(rx + 0.6, ry);
      p.arc(rx, ry, 0.6, 0, TAU);
      p.moveTo(rx + 0.3, ry);
      p.arc(rx, ry, 0.3, 0, TAU);
      p.stroke();
      const a = -0.9 + Math.PI * (v > 0 && v < 1 ? v : 0);
      p.beginPath();
      p.moveTo(rx, ry);
      p.lineTo(rx + 0.6 * Math.cos(a), ry + 0.6 * Math.sin(a));
      p.stroke();
      p.fillStyle = '#ffb04a';
      p.beginPath();
      p.arc(rx - 0.28, ry + 0.22, 0.08, 0, TAU);
      p.fill();
      // bars
      p.fillStyle = SCREEN;
      [0.3, 0.5, 0.22, 0.4].forEach((h, i) => p.fillRect(-1.42 + i * 0.26, 0.62 - h, 0.16, h));
      // lamps along the foot
      [L.color, '#7ed957', '#ffb04a'].forEach((col, i) => {
        p.beginPath();
        p.arc(-0.3 + i * 0.3, 1.06, 0.08, 0, TAU);
        p.fillStyle = col;
        p.fill();
      });
    });
  },
};

export const READS: Record<Costume, Tool> = {
  ...everyone(book),
  miner: foldedMap,
  scientist: labManual,
  raver: vinylSleeve,
  hacker: printout,
  startup: printout,
  astronaut: dataSlate,
  exosuit: dataSlate,
  casual: recipeBook,
  forager: fieldGuide,
  parka: map,
  drifter: map,
  guard: ledgerBook,
  demon: grimoire,
  nord: scroll,
  jumpsuit: manual,
  colonist: almanac,
};
