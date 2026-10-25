// Routing on the room's floor: a coarse walkability grid with A* for when a
// straight walk would cut through a prop or a build, and string pulling so
// characters walk straight lines between the corners that matter.

export type Spot = { x: number; y: number };

const SQRT2 = Math.SQRT2;
const OPEN = 0;
const NEAR = 1; // close to something: walkable, but avoided
const SHUT = 2;
const NEAR_COST = 3;

export class NavGrid {
  readonly x0: number;
  readonly y0: number;
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  private open: Uint8Array;
  // Search scratch, reused between calls (stamped so nothing needs clearing).
  private g: Float32Array;
  private from: Int32Array;
  private seen: Uint32Array;
  private shut: Uint32Array;
  private stamp = 0;
  private heap: Int32Array;
  private f: Float32Array;

  // Covers [x0, x1) x [y0, y1) in cells `cell` units wide. `blocked` rates
  // each cell centre: true or 2 = shut, 1 = near something (walkable at a
  // cost, so routes keep their distance where they can), else open.
  constructor(x0: number, y0: number, x1: number, y1: number, cell: number, blocked: (x: number, y: number) => boolean | number) {
    this.x0 = x0;
    this.y0 = y0;
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil((x1 - x0) / cell));
    this.rows = Math.max(1, Math.ceil((y1 - y0) / cell));
    const n = this.cols * this.rows;
    this.open = new Uint8Array(n);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const [x, y] = this.centre(c, r);
        const b = blocked(x, y);
        this.open[r * this.cols + c] = b === true || b === SHUT ? SHUT : b === NEAR ? NEAR : OPEN;
      }
    }
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.shut = new Uint32Array(n);
    this.heap = new Int32Array(n * 8 + 8);
  }

  private centre(c: number, r: number): [number, number] {
    return [this.x0 + (c + 0.5) * this.cell, this.y0 + (r + 0.5) * this.cell];
  }

  private cellOf(s: Spot): number {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor((s.x - this.x0) / this.cell)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor((s.y - this.y0) / this.cell)));
    return r * this.cols + c;
  }

  isOpen(s: Spot): boolean {
    return this.open[this.cellOf(s)] !== SHUT;
  }

  // Cell centres from the start's cell to the goal's, or null when the goal
  // cannot be reached. The start and goal are allowed even when shut
  // (characters may stand close to a prop), and so is any shut cell next to
  // one being left, so someone caught inside can walk out.
  find(a: Spot, b: Spot): Spot[] | null {
    const { cols, rows, open, g, f, from, seen, shut, heap } = this;
    const start = this.cellOf(a);
    const goal = this.cellOf(b);
    if (start === goal) return [];
    const st = ++this.stamp;
    const gc = goal % cols;
    const gr = (goal - gc) / cols;
    const h = (i: number) => {
      const dc = Math.abs((i % cols) - gc);
      const dr = Math.abs(((i / cols) | 0) - gr);
      return Math.max(dc, dr) + (SQRT2 - 1) * Math.min(dc, dr);
    };
    let size = 0;
    const push = (i: number) => {
      let k = size++;
      heap[k] = i;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (f[heap[p]] <= f[heap[k]]) break;
        const t = heap[p];
        heap[p] = heap[k];
        heap[k] = t;
        k = p;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      heap[0] = heap[--size];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < size && f[heap[l]] < f[heap[m]]) m = l;
        if (r < size && f[heap[r]] < f[heap[m]]) m = r;
        if (m === k) break;
        const t = heap[m];
        heap[m] = heap[k];
        heap[k] = t;
        k = m;
      }
      return top;
    };
    const passable = (i: number) => open[i] !== SHUT || i === goal || i === start;
    g[start] = 0;
    f[start] = h(start);
    seen[start] = st;
    from[start] = -1;
    push(start);
    while (size > 0) {
      const i = pop();
      if (shut[i] === st) continue;
      shut[i] = st;
      if (i === goal) break;
      const c = i % cols;
      const r = (i - c) / cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const j = nr * cols + nc;
          const out = open[i] === SHUT; // escaping from inside
          if ((!out && !passable(j)) || shut[j] === st) continue;
          // No cutting corners past a shut cell.
          if (!out && dr && dc && (!passable(r * cols + nc) || !passable(nr * cols + c))) continue;
          const ng = g[i] + (dr && dc ? SQRT2 : 1) * (open[j] === OPEN ? 1 : NEAR_COST);
          if (seen[j] === st && ng >= g[j]) continue;
          seen[j] = st;
          g[j] = ng;
          f[j] = ng + h(j);
          from[j] = i;
          if (size < heap.length) push(j);
        }
      }
    }
    if (shut[goal] !== st) return null;
    const out: Spot[] = [];
    for (let i = goal; i !== -1; i = from[i]) {
      const c = i % cols;
      const [x, y] = this.centre(c, (i - c) / cols);
      out.push({ x, y });
    }
    out.reverse();
    return out;
  }
}

// Forward string pulling: from `from` through `pts` (ending at the goal),
// keeps only the waypoints a straight walk cannot skip.
export function smooth(from: Spot, pts: readonly Spot[], clear: (p: Spot, q: Spot) => boolean): Spot[] {
  const out: Spot[] = [];
  let cur = from;
  for (let k = 0; k < pts.length; k++) {
    if (k === pts.length - 1) {
      out.push(pts[k]);
      break;
    }
    if (!clear(cur, pts[k + 1])) {
      out.push(pts[k]);
      cur = pts[k];
    }
  }
  return out;
}
