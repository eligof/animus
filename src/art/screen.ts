import type { Screen } from '../world/frame.ts';
import type { Quad } from '../worlds/types.ts';
import type { At } from './iso.ts';
import { inkWidth } from './iso.ts';
import type { Color, Pen } from './types.ts';

// The shared activity layer: what an agent is doing, drawn on its
// workstation's screen alike in every world (see WorkstationArt.screen):
// code lines for writing, an open page for reading, a magnifier over a
// list for searching, a terminal with sparks for running things, a globe
// for the web, a lightbulb for thinking, speech marks for talking or
// handing work out; a dim screen with a glint of glass while it waits, is
// away or is left. No text or digits: lines, bars and shapes. Static (the
// workstation's sprite is kept, see art/scene/desk.ts).

type Pt = [number, number];

// Each screen's backdrop.
const BACK: Record<Screen, Color> = {
  write: '#e8f4ff',
  read: '#fbf6e9',
  search: '#ecf6ea',
  run: '#1c2230',
  web: '#e6f0ff',
  think: '#fff4d6',
  talk: '#f2ecff',
  off: '#1e232d',
};

export function drawScreen(pen: Pen, at: At, q: Quad, kind: Screen, ink: string): void {
  // A point of the quad: fu across from its left edge, fz up from its foot.
  const on = (fu: number, fz: number): Pt => {
    const p = (k: number) => q[0][k] + (q[1][k] - q[0][k]) * fu + (q[3][k] - q[0][k]) * fz;
    return at(p(0), p(1), p(2));
  };
  const [x0, y0] = on(0, 0);
  const [x1, y1] = on(1, 0);
  const [x3, y3] = on(0, 1);
  const s = Math.max(Math.hypot(x1 - x0, y1 - y0), Math.hypot(x3 - x0, y3 - y0)) / 3;
  const line = Math.max(1, inkWidth(s) * 0.5);
  const poly = (pts: Pt[], fill: Color | null, stroke: Color | null = null, w = line) => {
    pen.beginPath();
    pts.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
    pen.closePath();
    if (fill) {
      pen.fillStyle = fill;
      pen.fill();
    }
    if (stroke) {
      pen.strokeStyle = stroke;
      pen.lineWidth = w;
      pen.stroke();
    }
  };
  // A bar from fu0 to fu1 at height fz, fh tall.
  const bar = (fu0: number, fu1: number, fz: number, fh: number, c: Color) => poly([on(fu0, fz), on(fu1, fz), on(fu1, fz + fh), on(fu0, fz + fh)], c);
  // A ring of n points round (fu, fz), radii ru across and rz up.
  const ring = (fu: number, fz: number, ru: number, rz: number, n = 14): Pt[] => Array.from({ length: n }, (_, k) => on(fu + ru * Math.cos((k / n) * Math.PI * 2), fz + rz * Math.sin((k / n) * Math.PI * 2)));
  pen.save();
  pen.lineJoin = 'round';
  pen.lineCap = 'round';
  poly([on(0, 0), on(1, 0), on(1, 1), on(0, 1)], BACK[kind]);
  switch (kind) {
    case 'write': {
      // indented code lines in a few colours, a cursor on the last
      const rows: Array<[number, number, Color]> = [[0.1, 0.55, '#2b6f9c'], [0.22, 0.75, '#c0507a'], [0.22, 0.6, '#3f8f5a'], [0.34, 0.8, '#7a5ab0'], [0.1, 0.45, '#2b6f9c']];
      rows.forEach(([a, b, c], i) => bar(a, b, 0.8 - i * 0.15, 0.08, c));
      bar(0.5, 0.56, 0.2, 0.1, '#2b3446');
      break;
    }
    case 'read': {
      // an open page: two columns of grey lines and a spine
      bar(0.48, 0.52, 0.08, 0.84, '#d6cdb6');
      for (let i = 0; i < 5; i++) {
        bar(0.08, i === 4 ? 0.3 : 0.42, 0.8 - i * 0.15, 0.06, '#8a8476');
        bar(0.58, i === 2 ? 0.75 : 0.92, 0.8 - i * 0.15, 0.06, '#8a8476');
      }
      break;
    }
    case 'search': {
      // a list, one row picked out, a magnifier over it
      for (let i = 0; i < 5; i++) bar(0.1, 0.62, 0.8 - i * 0.16, 0.07, i === 2 ? '#3f8f5a' : '#9aa79a');
      poly(ring(0.66, 0.46, 0.17, 0.2), '#ffffffaa', ink);
      poly([on(0.77, 0.3), on(0.82, 0.34), on(0.95, 0.12), on(0.9, 0.08)], ink);
      break;
    }
    case 'run': {
      // a dark terminal: a prompt, output lines, and sparks of success
      bar(0.08, 0.16, 0.78, 0.08, '#7ee08a');
      bar(0.2, 0.6, 0.78, 0.08, '#cfd8e6');
      bar(0.08, 0.5, 0.6, 0.06, '#7f8aa0');
      bar(0.08, 0.38, 0.46, 0.06, '#7f8aa0');
      bar(0.08, 0.16, 0.28, 0.08, '#7ee08a');
      bar(0.2, 0.26, 0.28, 0.08, '#cfd8e6');
      for (const [fu, fz, r] of [[0.72, 0.4, 0.09], [0.86, 0.62, 0.07], [0.82, 0.24, 0.05]] as const) {
        poly([on(fu - r, fz), on(fu, fz + r * 1.4), on(fu + r, fz), on(fu, fz - r * 1.4)], '#ffd34a');
      }
      break;
    }
    case 'web': {
      // a globe: a blue disc, its meridian and parallels
      poly(ring(0.5, 0.5, 0.3, 0.36), '#5aa6e8', ink);
      poly(ring(0.5, 0.5, 0.12, 0.36), null, '#e6f0ff');
      bar(0.21, 0.79, 0.49, 0.04, '#e6f0ff');
      bar(0.27, 0.73, 0.68, 0.03, '#e6f0ff');
      bar(0.27, 0.73, 0.3, 0.03, '#e6f0ff');
      break;
    }
    case 'think': {
      // a lightbulb with its rays
      poly(ring(0.5, 0.58, 0.2, 0.24), '#ffd34a', ink);
      bar(0.42, 0.58, 0.2, 0.14, '#9aa0aa');
      for (const [a, b] of [[0.18, 0.86], [0.82, 0.86], [0.12, 0.58], [0.88, 0.58]] as const) poly(ring(a, b, 0.035, 0.045, 6), '#f0a830');
      break;
    }
    case 'talk': {
      // two speech balloons, each with its tail
      poly([...ring(0.36, 0.64, 0.24, 0.2), on(0.24, 0.42), on(0.2, 0.32), on(0.34, 0.46)], '#ffffff', ink);
      poly([...ring(0.66, 0.34, 0.22, 0.18), on(0.78, 0.16), on(0.86, 0.08), on(0.72, 0.18)], '#c9b8ff', ink);
      for (const fu of [0.27, 0.36, 0.45]) poly(ring(fu, 0.64, 0.025, 0.035, 6), '#6b5aa8');
      break;
    }
    case 'off': {
      // glass with nothing on it: a glint across
      poly([on(0.55, 0.1), on(0.7, 0.1), on(0.35, 0.9), on(0.2, 0.9)], '#ffffff14');
      break;
    }
  }
  poly([on(0, 0), on(1, 0), on(1, 1), on(0, 1)], null, ink);
  pen.restore();
}
