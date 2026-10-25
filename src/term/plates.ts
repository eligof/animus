// The scene in a kitty-protocol terminal as a stack of placed pictures (see
// docs/superpowers/specs/2026-10-24-sprite-compositor-design.md). Each
// picture goes out once, as PNG, and the terminal keeps it; a frame is then
// only the placements that changed, so a figure walking or the camera
// panning costs a few dozen bytes, not a picture. What the terminal shows is
// exactly what `composite` (src/art/plate.ts) draws.

import type { Pic, Placed, Plate } from '../art/plate.ts';
import type { Bitmap } from '../art/types.ts';
import { UNDER_CELLS, deleteImages } from './kitty.ts';

const SYNC_ON = '\x1b[?2026h';
const SYNC_OFF = '\x1b[?2026l';
const CHUNK = 4096; // base64 bytes per escape, the protocol's limit

// The kept pictures, decoded (4 bytes a pixel), before the least recently
// used are let go: well under Ghostty's own image storage limit (320 MB).
const BUDGET = 192 * 1024 * 1024;

// z: every placement is under the text (at or below UNDER_CELLS, the
// highest z drawn under cell backgrounds) and they rise in layer order.
// A placement keeps its z for as long as it can: when layers come, go or
// change places, those still in order keep theirs (the longest rising run
// of them) and only the rest take new values in the gaps around them. So
// a burst of particles appearing mid-stack re-places one layer, not every
// layer above it, as z = index would. A new stack is spread STRIDE apart
// around the middle of the range; when a gap runs out (some 20 inserts
// into the same spot) the whole stack is renumbered once.
const Z_TOP = UNDER_CELLS;
const Z_BOTTOM = -(2 ** 31) + 1;
const Z_MID = Z_BOTTOM + Math.floor((Z_TOP - Z_BOTTOM) / 2);
const STRIDE = 1 << 20;

// A picture the terminal holds, under image id `id`. `key` names the
// pixels (null: nothing sent yet); `used` is the last frame it was placed.
type Img = { id: number; key: string | null; w: number; h: number; used: number };

// One placement id and what the terminal shows for it: `img` placed as
// placement `p` at cell (col, row), 1-based, offset (X, Y) inside it, cut
// to the source rectangle (sx, sy, sw, sh) of the image, at `z`. `own` is
// the image a volatile layer replaces in place; `seen` the last frame the
// id was in the plate.
type Slot = {
  p: number;
  own: Img | null;
  img: Img | null;
  col: number;
  row: number;
  X: number;
  Y: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  z: number;
  seen: number;
};

export class PlateStream {
  private readonly encode: (img: Bitmap, opaque: boolean) => Uint8Array;
  private readonly budget: number;
  private kept = new Map<string, Img>(); // by pic key
  private held = 0; // decoded bytes of the kept
  private slots = new Map<string, Slot>(); // by placement id
  private frame = 0;
  private nextId = 1;
  private nextP = 1;
  private wipe = false;
  // Per layer, reused from frame to frame: its slot; where it goes, 8
  // numbers a layer (col, row, X, Y, sx, sy, sw, sh; sw 0 when it is cut
  // away whole); its z (NaN: none yet). Then the visible layers' indices
  // and the scratch for finding the longest rising run of their z.
  private at: Slot[] = [];
  private G = new Int32Array(0);
  private Z = new Float64Array(0);
  private V = new Int32Array(0);
  private tails = new Int32Array(0);
  private links = new Int32Array(0);
  private keep = new Uint8Array(0);

  // `encode` turns a picture (premultiplied RGBA) into PNG: straight-alpha
  // RGBA, or RGB when `opaque` says every pixel is. `budget`: decoded bytes
  // of kept pictures the terminal may hold.
  constructor(o: { encode: (img: Bitmap, opaque: boolean) => Uint8Array; budget?: number }) {
    this.encode = o.encode;
    this.budget = o.budget ?? BUDGET;
  }

  // The escapes that make the terminal show `p` (nothing when null), as one
  // synchronized update; '' when it already does.
  // Every delete goes in `drop`, ahead of the pictures and placements in
  // `put`: the terminal frees memory before it takes in more, and nothing
  // is deleted twice (a picture let go after its placement came off).
  step(p: Plate | null): string {
    const drop: string[] = [];
    const put: string[] = [];
    if (this.wipe) {
      drop.push(deleteImages());
      this.wipe = false;
    }
    this.frame++;
    if (p) {
      this.measure(p);
      for (let i = 0; i < p.layers.length; i++) this.show(p.layers[i], i, drop, put);
    }
    this.sweep(drop);
    this.evict(drop);
    if (!drop.length && !put.length) return '';
    return SYNC_ON + drop.join('') + put.join('') + SYNC_OFF;
  }

  // Sends pictures a plate will likely show soon (see Scene.warm), kept but
  // not placed, so showing them later costs only a placement; those held
  // already are skipped. Nothing while a wipe is due (it would delete
  // them). '' when there is nothing to send.
  preload(pics: readonly Pic[]): string {
    if (this.wipe) return '';
    const out: string[] = [];
    for (const pic of pics) if (!this.kept.has(pic.key)) this.keptOf(pic, out);
    return out.join('');
  }

  // Forgets everything (after a resize, a new cell size, a new theme): the
  // next step deletes every image and sends the plate afresh.
  invalidate(): void {
    this.forget();
    this.wipe = true;
  }

  // The escape that deletes every image (on exit). Forgets everything too,
  // so a later step sends the plate afresh.
  clear(): string {
    this.forget();
    this.wipe = false;
    return deleteImages();
  }

  private forget(): void {
    this.kept.clear();
    this.slots.clear();
    this.held = 0;
  }

  // Finds each layer's slot and where it goes on the canvas, and gives the
  // visible ones their z.
  private measure(p: Plate): void {
    const { layers } = p;
    this.grow(layers.length);
    const { G, Z, V, at } = this;
    // Whole numbers everywhere: Ghostty rejects a command with any
    // fractional key.
    const cw = Math.max(1, Math.round(p.cell.w));
    const ch = Math.max(1, Math.round(p.cell.h));
    const W = Math.round(p.width);
    const H = Math.round(p.height);
    const col = Math.round(p.rect.x) + 1;
    const row = Math.round(p.rect.y) + 1;
    let m = 0;
    let rising = true;
    let last = -Infinity;
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      const s = (at[i] = this.slot(l.id));
      const x = Math.round(l.x);
      const y = Math.round(l.y);
      const x0 = Math.max(0, x);
      const y0 = Math.max(0, y);
      const x1 = Math.min(W, x + l.pic.img.width);
      const y1 = Math.min(H, y + l.pic.img.height);
      const g = i * 8;
      if (!(x1 > x0 && y1 > y0)) {
        G[g + 6] = 0;
        continue;
      }
      G[g] = col + Math.floor(x0 / cw);
      G[g + 1] = row + Math.floor(y0 / ch);
      G[g + 2] = x0 % cw;
      G[g + 3] = y0 % ch;
      G[g + 4] = x0 - x;
      G[g + 5] = y0 - y;
      G[g + 6] = x1 - x0;
      G[g + 7] = y1 - y0;
      V[m++] = i;
      const z = s.img ? s.z : NaN;
      Z[i] = z;
      if (z > last) last = z;
      else rising = false;
    }
    if (!rising) this.restack(m);
  }

  // The slot of placement id `id`, marked seen this frame. The same id twice
  // in one plate is a slip, but each copy still gets a slot of its own.
  private slot(id: string): Slot {
    let key = id;
    let s = this.slots.get(key);
    for (let k = 2; s && s.seen === this.frame; k++) s = this.slots.get((key = `${id}\u0000${k}`));
    if (!s) {
      s = { p: this.nextP++, own: null, img: null, col: 0, row: 0, X: 0, Y: 0, sx: 0, sy: 0, sw: 0, sh: 0, z: 0, seen: 0 };
      this.slots.set(key, s);
    }
    s.seen = this.frame;
    return s;
  }

  // Layer `i` as the terminal should show it: its picture sent if the
  // terminal lacks it, then placed if anything about the placement changed.
  private show(l: Placed, i: number, drop: string[], out: string[]): void {
    const s = this.at[i];
    const G = this.G;
    const g = i * 8;
    if (!l.volatile && s.own) this.disown(s, drop);
    if (!G[g + 6]) {
      if (s.img) this.unplace(s, drop);
      return;
    }
    const img = l.volatile ? this.owned(s, l.pic, out) : this.keptOf(l.pic, out);
    // Placement numbers belong to an image: under a new one, the old
    // placement would stay on screen.
    if (s.img && s.img !== img) this.unplace(s, drop);
    const z = this.Z[i];
    if (
      s.img === img &&
      s.z === z &&
      s.col === G[g] &&
      s.row === G[g + 1] &&
      s.X === G[g + 2] &&
      s.Y === G[g + 3] &&
      s.sx === G[g + 4] &&
      s.sy === G[g + 5] &&
      s.sw === G[g + 6] &&
      s.sh === G[g + 7]
    )
      return;
    s.img = img;
    s.z = z;
    s.col = G[g];
    s.row = G[g + 1];
    s.X = G[g + 2];
    s.Y = G[g + 3];
    s.sx = G[g + 4];
    s.sy = G[g + 5];
    s.sw = G[g + 6];
    s.sh = G[g + 7];
    out.push(placement(s, img));
  }

  // The kept image of `pic`, sent the first time it is seen.
  private keptOf(pic: Pic, out: string[]): Img {
    let m = this.kept.get(pic.key);
    if (!m) {
      m = { id: this.nextId++, key: null, w: 0, h: 0, used: 0 };
      this.send(m, pic, out);
      this.kept.set(pic.key, m);
      this.held += m.w * m.h * 4;
    }
    m.used = this.frame;
    return m;
  }

  // The image a volatile layer owns, showing `pic`: a new picture is sent
  // under the same id, which takes the old one's placement with it.
  private owned(s: Slot, pic: Pic, out: string[]): Img {
    const m = (s.own ??= { id: this.nextId++, key: null, w: 0, h: 0, used: 0 });
    if (m.key !== pic.key) {
      this.send(m, pic, out);
      if (s.img === m) s.img = null;
    }
    return m;
  }

  private send(m: Img, pic: Pic, out: string[]): void {
    m.key = pic.key;
    m.w = pic.img.width;
    m.h = pic.img.height;
    out.push(transmit(this.encode(pic.img, pic.opaque === true), m.id));
  }

  // Takes slot `s`'s placement off the screen; its image stays.
  private unplace(s: Slot, out: string[]): void {
    out.push(`\x1b_Ga=d,d=i,i=${s.img!.id},p=${s.p},q=2\x1b\\`);
    s.img = null;
  }

  // Deletes the image a no longer volatile (or gone) layer owned, and with
  // it its placement.
  private disown(s: Slot, out: string[]): void {
    out.push(deleteImages(s.own!.id));
    if (s.img === s.own) s.img = null;
    s.own = null;
  }

  // Placements whose ids left the plate come off the screen.
  private sweep(out: string[]): void {
    this.slots.forEach((s, id) => {
      if (s.seen === this.frame) return;
      if (s.img && s.img !== s.own) this.unplace(s, out);
      if (s.own) this.disown(s, out);
      this.slots.delete(id);
    });
  }

  // Past the budget, the least recently used kept pictures go; never one
  // shown this frame, even when those alone are over it.
  private evict(out: string[]): void {
    if (this.held <= this.budget) return;
    const idle = [...this.kept.values()].filter((m) => m.used !== this.frame).sort((a, b) => a.used - b.used);
    for (const m of idle) {
      if (this.held <= this.budget) break;
      out.push(deleteImages(m.id));
      this.kept.delete(m.key!);
      this.held -= m.w * m.h * 4;
    }
  }

  // New z for the `m` visible layers, rising bottom to top: those on screen
  // that are still in order (the longest rising run of them) keep theirs,
  // the rest fill the gaps between.
  private restack(m: number): void {
    const { Z, V, tails, links, keep } = this;
    let len = 0;
    for (let j = 0; j < m; j++) {
      keep[j] = 0;
      const z = Z[V[j]];
      if (Number.isNaN(z)) continue;
      let lo = 0;
      let hi = len;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (Z[V[tails[mid]]] < z) lo = mid + 1;
        else hi = mid;
      }
      links[j] = lo ? tails[lo - 1] : -1;
      tails[lo] = j;
      if (lo === len) len++;
    }
    for (let j = len ? tails[len - 1] : -1; j >= 0; j = links[j]) keep[j] = 1;
    let below = -1;
    for (let j = 0; j <= m; j++) {
      if (j < m && !keep[j]) continue;
      if (!this.between(below, j, m)) return this.renumber(m);
      below = j;
    }
  }

  // z for the visible layers strictly between the a-th and the b-th (which
  // keep theirs; -1 and m stand for the bottom and the top of the range),
  // false when they do not fit.
  private between(a: number, b: number, m: number): boolean {
    const k = b - a - 1;
    if (k === 0) return true;
    const { Z, V } = this;
    let first: number;
    let step: number;
    if (a >= 0 && b < m) {
      // Spread evenly, leaving room for more on either side.
      const lo = Z[V[a]];
      const hi = Z[V[b]];
      if (hi - lo <= k) return false;
      for (let t = 1; t <= k; t++) Z[V[a + t]] = lo + Math.floor((t * (hi - lo)) / (k + 1));
      return true;
    }
    if (a >= 0) {
      step = Math.min(STRIDE, Math.floor((Z_TOP - Z[V[a]]) / k));
      first = Z[V[a]] + step;
    } else if (b < m) {
      step = Math.min(STRIDE, Math.floor((Z[V[b]] - Z_BOTTOM) / k));
      first = Z[V[b]] - k * step;
    } else return false;
    if (step < 1) return false;
    for (let t = 0; t < k; t++) Z[V[a + 1 + t]] = first + t * step;
    return true;
  }

  // Every visible layer a fresh z, STRIDE apart (closer if they would not
  // fit), around the middle of the range.
  private renumber(m: number): void {
    const step = Math.min(STRIDE, Math.floor((Z_TOP - Z_BOTTOM) / (m + 1)));
    const first = Z_MID - Math.floor(((m - 1) * step) / 2);
    for (let j = 0; j < m; j++) this.Z[this.V[j]] = first + j * step;
  }

  private grow(n: number): void {
    if (this.Z.length >= n) return;
    const c = Math.max(64, 2 * n);
    this.G = new Int32Array(8 * c);
    this.Z = new Float64Array(c);
    this.V = new Int32Array(c);
    this.tails = new Int32Array(c);
    this.links = new Int32Array(c);
    this.keep = new Uint8Array(c);
  }
}

// Places image `img` as slot `s` says, the cursor moved to its cell first
// (and left there: C=1); the source rectangle only when it is cut.
function placement(s: Slot, img: Img): string {
  const cut = s.sx || s.sy || s.sw !== img.w || s.sh !== img.h ? `,x=${s.sx},y=${s.sy},w=${s.sw},h=${s.sh}` : '';
  return `\x1b[${s.row};${s.col}H\x1b_Ga=p,i=${img.id},p=${s.p},X=${s.X},Y=${s.Y},z=${s.z},C=1,q=2${cut}\x1b\\`;
}

// Sends `png` to be kept under image `id`, without showing it: base64 in
// escapes of at most CHUNK bytes, only the first with the keys, each
// flagged m=1 until the last.
function transmit(png: Uint8Array, id: number): string {
  const b64 = Buffer.from(png.buffer, png.byteOffset, png.byteLength).toString('base64');
  const out: string[] = [];
  for (let i = 0; i < b64.length || i === 0; i += CHUNK) {
    const more = i + CHUNK < b64.length ? 1 : 0;
    out.push(`\x1b_G${i === 0 ? `a=t,f=100,i=${id},q=2,` : ''}m=${more};${b64.slice(i, i + CHUNK)}\x1b\\`);
  }
  return out.join('');
}
