import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composite } from '../src/art/plate.ts';
import type { Pic, Placed, Plate } from '../src/art/plate.ts';
import { encodeRgb } from '../src/art/png.ts';
import { encodeRgba } from '../src/art/scene/front.ts';
import { PlateStream } from '../src/term/plates.ts';
import { Term, same } from './kitty-term.ts';

const SYNC_ON = '\x1b[?2026h';
const SYNC_OFF = '\x1b[?2026l';

// Odd cell sizes and a scene away from the corner, so cells and pixels
// never line up by luck.
const CELL = { w: 7, h: 13 };
const RECT = { x: 3, y: 2, w: 16, h: 9 };
const W = RECT.w * CELL.w;
const H = RECT.h * CELL.h;

const plate = (layers: Placed[]): Plate => ({ width: W, height: H, rect: RECT, cell: CELL, backdrop: [24, 32, 48], layers });

// Deterministic noise (mulberry32).
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A picture of noise: opaque, or a sprite of clear, faint, soft and solid
// pixels (premultiplied, as the canvas draws them).
const ALPHAS = [0, 0, 0, 255, 255, 1, 64, 128, 200, 254];
function pic(key: string, w: number, h: number, seed: number, opaque = false): Pic {
  const r = rng(seed);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let o = 0; o < data.length; o += 4) {
    const a = opaque ? 255 : ALPHAS[Math.floor(r() * ALPHAS.length)];
    data[o] = Math.floor(r() * (a + 1));
    data[o + 1] = Math.floor(r() * (a + 1));
    data[o + 2] = Math.floor(r() * (a + 1));
    data[o + 3] = a;
  }
  return { key, img: { width: w, height: h, data }, opaque };
}

// A stream into a model terminal. Each `go` steps it and checks the
// terminal shows exactly what `composite` draws (nothing for no plate).
// Opaque pictures go out as RGB flattened on magenta, so a sprite sent as
// opaque by mistake shows.
function rig(budget?: number) {
  const s = new PlateStream({ encode: (b, opaque) => (opaque ? encodeRgb(b, 0xff00ff) : encodeRgba(b, 1)), budget });
  const term = new Term(RECT, CELL);
  let n = 0;
  const go = (p: Plate | null): string => {
    const out = s.step(p);
    n++;
    if (out) assert.ok(out.startsWith(SYNC_ON) && out.endsWith(SYNC_OFF), 'one synchronized update');
    term.play(out);
    if (p) same(term.view(p), composite(p).data, W, `step ${n}`);
    else assert.equal(term.spots.size, 0, 'nothing on screen without a scene');
    return out;
  };
  return { s, term, go };
}

// The image ids sent in `out`, in order.
const sentIds = (out: string) => [...out.matchAll(/a=t,f=100,i=(\d+)/g)].map((m) => +m[1]);

const BASE: Placed = { id: 'base', pic: pic('base', W, H, 1, true), x: 0, y: 0 };

test('sprites that only move go out as placements, without pixels', () => {
  const { s, term, go } = rig();
  const a = pic('a', 20, 30, 2);
  const b = pic('b', 15, 15, 3);
  const frame = (k: number) =>
    plate([BASE, { id: 'a', pic: a, x: 10 + 3 * k, y: 20 + k }, { id: 'b', pic: b, x: 60 - 2 * k, y: 70 + k }]);
  go(frame(0));
  assert.equal(term.sent, 3);
  assert.equal(term.placed, 3);
  for (let k = 1; k <= 12; k++) {
    const out = go(frame(k));
    assert.doesNotMatch(out, /a=[tT]/, 'no pixels');
    assert.equal(term.placed, 2, 'the two sprites, not the base');
    assert.equal(term.dropped, 0);
    assert.ok(out.length < 200, `${out.length} bytes`);
  }
  assert.equal(s.step(frame(12)), '', 'nothing changed');
  assert.equal(s.step(frame(12)), '');
});

test('a base bigger than the canvas pans through a source rectangle', () => {
  const { term, go } = rig();
  const MX = 30;
  const MY = 40;
  const base = pic('base+', W + 2 * MX, H + 2 * MY, 4, true);
  const fig = pic('fig', 12, 20, 5);
  const frame = (dx: number, dy: number) =>
    plate([{ id: 'base', pic: base, x: -MX + dx, y: -MY + dy }, { id: 'fig', pic: fig, x: 50 + dx, y: 60 + dy }]);
  const first = go(frame(0, 0));
  assert.match(first, new RegExp(`a=p,i=\\d+,p=\\d+,X=0,Y=0,z=-\\d+,C=1,q=2,x=${MX},y=${MY},w=${W},h=${H}\\x1b`));
  for (const [dx, dy] of [[1, 0], [5, 3], [-7, 11], [29, -39], [-30, 40], [13, -17], [0, 0]]) {
    const out = go(frame(dx, dy));
    assert.doesNotMatch(out, /a=[tT]/, 'the base is never sent again');
    assert.equal(term.placed, 2);
    assert.match(out, new RegExp(`,x=${MX - dx},y=${MY - dy},w=${W},h=${H}\\x1b`));
  }
});

test('placements are cut at all four edges, and taken off when wholly outside', () => {
  const { term, go } = rig();
  const sprite = pic('sprite', 20, 30, 7);
  const at = (x: number, y: number) => plate([BASE, { id: 'sprite', pic: sprite, x, y }]);
  go(at(40, 40));
  const path = [
    [5, 40], [-1, 40], [-8, 40], [-19, 40], [-20, 40], [-60, 40],
    [W - 21, 40], [W - 20, 40], [W - 7, 40], [W - 1, 40], [W, 40], [W + 30, 40],
    [40, 3], [40, -1], [40, -29], [40, -30], [40, -100],
    [40, H - 31], [40, H - 30], [40, H - 1], [40, H], [40, H + 5],
    [-5, -7], [W - 3, -11], [-9, H - 2], [W - 19, H - 29], [-20, -30], [W, H], [-19, -29], [40, 40],
  ];
  for (const [x, y] of path) {
    const out = go(at(x, y));
    const inside = x > -20 && x < W && y > -30 && y < H;
    assert.equal(term.spots.size, inside ? 2 : 1, `at ${x}, ${y}`);
    assert.doesNotMatch(out, /a=[tT]/, 'the sprite is never sent again');
  }
  assert.match(go(at(-8, 40)), /,x=8,y=0,w=12,h=30\x1b/, 'cut on the left');
  assert.match(go(at(W - 7, -4)), /,x=0,y=4,w=7,h=26\x1b/, 'cut at the top right');
  assert.match(go(at(3, H - 10)), /,x=0,y=0,w=20,h=10\x1b/, 'cut at the bottom');
});

test('a volatile layer replaces its picture under its own image id', () => {
  const { s, term, go } = rig();
  const bits = (k: number) => pic(`bits ${k}`, 20 + (k % 3) * 5, 16 + k, 100 + k);
  const frame = (k: number, x: number) => plate([BASE, { id: 'bits:0', pic: bits(k), x, y: 30, volatile: true }]);
  const own = sentIds(go(frame(0, 10)))[1];
  for (let k = 1; k <= 8; k++) {
    const out = go(frame(k, 10 + 4 * k));
    assert.deepEqual(sentIds(out), [own], 'the same id, again');
    assert.doesNotMatch(out, /a=d/, 'the new picture takes the old one off');
    assert.equal(term.imgs.size, 2, 'the old picture is not kept');
  }
  assert.equal(s.step(frame(8, 42)), '', 'the same key is the same picture');
  const out = go(frame(8, 50));
  assert.doesNotMatch(out, /a=[tT]/);
  assert.equal(term.placed, 1);
  // Animated in place (new pixels, same size, same spot): placed again, as
  // the new picture took the old placement with it.
  const anim = (k: number) => pic(`anim ${k}`, 20, 20, 200 + k);
  for (let k = 0; k < 3; k++) {
    const out = go(plate([BASE, { id: 'bits:0', pic: anim(k), x: 50, y: 30, volatile: true }]));
    assert.deepEqual(sentIds(out), [own]);
    assert.equal(term.placed, 1);
  }
  // Volatile pictures are not shared: another id with the same picture
  // gets one of its own.
  go(plate([BASE, { id: 'bits:0', pic: anim(2), x: 50, y: 30, volatile: true }, { id: 'bits:1', pic: anim(2), x: 5, y: 60, volatile: true }]));
  assert.equal(term.sent, 1);
  assert.equal(term.imgs.size, 3);
});

test('one picture under many placements goes out once', () => {
  const { term, go } = rig();
  const shadow = pic('shadow', 16, 6, 9);
  const fig = pic('fig', 10, 14, 10);
  const frame = (dx: number) =>
    plate([
      BASE,
      ...[0, 1, 2].map((n) => ({ id: `shadow:${n}`, pic: shadow, x: 10 + 30 * n + (n === 1 ? dx : 0), y: 80 })),
      // The same id twice is a slip, but it still shows.
      { id: 'twin', pic: fig, x: 5, y: 5 },
      { id: 'twin', pic: fig, x: 70 + dx, y: 9 },
    ]);
  go(frame(0));
  assert.equal(term.sent, 3);
  assert.equal(term.spots.size, 6);
  const byImage = new Map<number, number>();
  for (const s of term.spots.values()) byImage.set(s.i, (byImage.get(s.i) ?? 0) + 1);
  assert.deepEqual([...byImage.values()].sort(), [1, 2, 3]);
  go(frame(4));
  assert.equal(term.sent, 0);
  assert.equal(term.placed, 2);
});

test('layers come, go and change places; only those affected are placed', () => {
  const { term, go } = rig();
  const L = Array.from({ length: 8 }, (_, n): Placed => ({ id: `l${n}`, pic: pic(`p${n}`, 14 + n, 18 - n, 20 + n), x: 8 + 9 * n, y: 10 + 8 * n }));
  const check = (layers: Placed[], placed: number, dropped: number, why: string) => {
    go(plate(layers));
    assert.equal(term.placed, placed, `${why}: placed`);
    assert.equal(term.dropped, dropped, `${why}: dropped`);
  };
  check([BASE, L[0], L[1], L[2], L[3]], 5, 0, 'first');
  check([BASE, L[0], L[4], L[1], L[2], L[3]], 1, 0, 'one comes mid-stack');
  check([L[5], BASE, L[0], L[4], L[1], L[2], L[3]], 1, 0, 'one comes at the bottom');
  check([L[5], BASE, L[0], L[4], L[1], L[2], L[3], L[6]], 1, 0, 'one comes on top');
  check([L[5], BASE, L[0], L[1], L[2], L[3], L[6]], 0, 1, 'one goes');
  check([L[5], BASE, L[1], L[2], L[3], L[6], L[0]], 1, 0, 'one moves to the top');
  check([L[5], BASE, L[2], L[1], L[3], L[6], L[0]], 1, 0, 'two swap');
  check([BASE, L[2], L[1], L[3], L[5], L[6], L[0]], 1, 0, 'the bottom one moves up');
  go(plate([L[6], L[5], L[3], L[2], L[1], L[0], BASE]));
  assert.ok(term.placed <= 6, `reversed: ${term.placed} placed`);
  check([BASE], 0, 6, 'all but the base go');
});

test('a new picture under a placement id takes the old placement off; the old picture stays kept', () => {
  const { term, go } = rig();
  const idle = pic('idle', 18, 26, 30);
  const walk = pic('walk', 20, 24, 31);
  const frame = (p: Pic, x: number, volatile = false) => plate([BASE, { id: 'fig', pic: p, x, y: 50, volatile }]);
  const idleId = sentIds(go(frame(idle, 30)))[1];
  let out = go(frame(walk, 30));
  assert.match(out, new RegExp(`\\x1b_Ga=d,d=i,i=${idleId},p=\\d+,q=2\\x1b\\\\`));
  assert.deepEqual([term.sent, term.placed, term.dropped], [1, 1, 1]);
  out = go(frame(idle, 34));
  assert.deepEqual([term.sent, term.placed, term.dropped], [0, 1, 1], 'kept, so not sent again');
  go(frame(walk, 38));
  assert.equal(term.sent, 0);
  // Turning volatile: a picture of its own...
  go(frame(idle, 38, true));
  assert.deepEqual([term.sent, term.placed, term.dropped], [1, 1, 1]);
  assert.equal(term.imgs.size, 4);
  // ...let go when it stops being.
  go(frame(walk, 38));
  assert.deepEqual([term.sent, term.placed, term.dropped], [0, 1, 1]);
  assert.equal(term.imgs.size, 3);
});

test('past the budget the least recently used pictures go, never one on screen', () => {
  const sprites = Array.from({ length: 6 }, (_, n) => pic(`s${n}`, 20, 20, 40 + n));
  const { term, go } = rig(3 * 20 * 20 * 4);
  const frame = (...ns: number[]) => plate(ns.map((n, k) => ({ id: `s${k}`, pic: sprites[n], x: 5 + 26 * k, y: 30 })));
  go(frame(0));
  const s1 = sentIds(go(frame(1)))[0];
  go(frame(2));
  assert.equal(term.imgs.size, 3);
  go(frame(0));
  assert.equal(term.sent, 0);
  // 1 is now the least recently used.
  let out = go(frame(3));
  assert.match(out, new RegExp(`a=d,d=I,i=${s1},q=2`));
  assert.equal(term.imgs.size, 3);
  // A frame that needs more than the budget keeps all it shows (the model
  // fails a placement of a deleted picture).
  out = go(frame(0, 2, 4, 5));
  assert.equal(term.imgs.size, 4);
  out = go(frame(1));
  assert.equal(term.sent, 1, 'what was let go is sent again');
  assert.equal(term.imgs.size, 3);
});

test('no scene takes the placements off and keeps the pictures', () => {
  const { s, term, go } = rig();
  const fig = pic('fig', 12, 20, 11);
  const frame = (x: number) =>
    plate([BASE, { id: 'fig', pic: fig, x, y: 30 }, { id: 'bits:0', pic: pic('bits', 9, 9, 12), x: 40, y: 40, volatile: true }]);
  go(frame(20));
  const out = go(null);
  assert.doesNotMatch(out, /d=A|a=[tTp]/);
  assert.equal(term.imgs.size, 2, 'kept pictures stay; the volatile one goes');
  assert.equal(s.step(null), '');
  go(frame(24));
  assert.equal(term.sent, 1, 'only the volatile picture again');
  assert.equal(term.placed, 3);
  // An empty plate is no scene too.
  go(plate([]));
  assert.equal(term.spots.size, 0);
});

test('invalidate deletes every image and sends the plate afresh; clear deletes everything', () => {
  const { s, term, go } = rig();
  const fig = pic('fig', 12, 20, 13);
  const frame = plate([BASE, { id: 'fig', pic: fig, x: 20, y: 30 }, { id: 'v', pic: pic('v', 9, 9, 14), x: 40, y: 40, volatile: true }]);
  go(frame);
  s.invalidate();
  let out = go(frame);
  assert.ok(out.startsWith(`${SYNC_ON}\x1b_Ga=d,d=A,q=2\x1b\\`));
  assert.deepEqual([term.sent, term.placed], [3, 3]);
  assert.equal(s.step(frame), '');
  // Invalidated with no scene to follow: the screen is cleared at once.
  s.invalidate();
  assert.equal(go(null), `${SYNC_ON}\x1b_Ga=d,d=A,q=2\x1b\\${SYNC_OFF}`);
  out = go(frame);
  assert.doesNotMatch(out, /d=A/);
  assert.equal(term.sent, 3);
  assert.equal(s.clear(), '\x1b_Ga=d,d=A,q=2\x1b\\');
  term.play(`${SYNC_ON}\x1b_Ga=d,d=A,q=2\x1b\\${SYNC_OFF}`);
  assert.equal(term.imgs.size, 0);
  go(frame);
  assert.equal(term.sent, 3);
});

test('preloaded pictures show later with placements only; held ones are not sent twice', () => {
  const { s, term, go } = rig();
  go(plate([BASE]));
  const near = pic('near', 30, 20, 21);
  const far = pic('far', 25, 25, 22);
  const out = s.preload([near, far, BASE.pic]);
  term.play(out);
  assert.deepEqual(sentIds(out).length, 2, 'the base is held already');
  assert.equal(term.spots.size, 1, 'nothing placed');
  assert.equal(s.preload([near, far]), '');
  const shown = go(plate([BASE, { id: 'near', pic: near, x: 5, y: 6 }, { id: 'far', pic: far, x: 50, y: 40 }]));
  assert.doesNotMatch(shown, /a=[tT]/, 'no pixels');
  assert.equal(term.placed, 2);
  // While a wipe is due, nothing is preloaded (it would be deleted).
  s.invalidate();
  assert.equal(s.preload([pic('later', 8, 8, 23)]), '');
});

test('on the wire: whole numbers only, chunks of at most 4096 with the keys on the first', () => {
  const { s, term } = rig();
  const big = pic('big', 90, 70, 50);
  // Fractional positions are rounded, never sent.
  const p = plate([BASE, { id: 'big', pic: big, x: 3.5, y: -4.4 }, { id: 'dot', pic: pic('dot', 5, 5, 51), x: 60.49, y: 7.51 }]);
  const out = s.step(p);
  assert.doesNotMatch(out, /=-?\d*\.\d/);
  term.play(out);
  const rounded = plate(p.layers.map((l) => ({ ...l, x: Math.round(l.x), y: Math.round(l.y) })));
  same(term.view(rounded), composite(rounded).data, W, 'rounded');
  // The noisy sprite spans many chunks; all but the last of each picture full.
  const chunks = [...out.matchAll(/\x1b_G([^;\x1b]*);([^\x1b]*)\x1b\\/g)];
  assert.ok(chunks.length > 8, `${chunks.length} chunks`);
  for (let k = 0; k < chunks.length; k++) {
    const last = /m=0$/.test(chunks[k][1]);
    if (!last) assert.equal(chunks[k][2].length, 4096);
    if (k > 0 && !/m=0$/.test(chunks[k - 1][1])) assert.match(chunks[k][1], /^m=[01]$/);
    else assert.match(chunks[k][1], /^a=t,f=100,i=\d+,q=2,m=[01]$/);
  }
});

test('the same gap filled again and again renumbers the stack once in a while', () => {
  const { term, go } = rig();
  const top: Placed = { id: 'top', pic: pic('top', 30, 30, 60), x: 40, y: 40 };
  const pool = [pic('q0', 12, 12, 61), pic('q1', 9, 15, 62), pic('q2', 14, 8, 63)];
  const inserted: Placed[] = [];
  go(plate([BASE, top]));
  let renumbered = 0;
  for (let n = 0; n < 30; n++) {
    // Each new one right above the base, under all the earlier ones.
    inserted.unshift({ id: `i${n}`, pic: pool[n % 3], x: 20 + 2 * n, y: 30 + n });
    go(plate([BASE, ...inserted, top]));
    if (term.placed > 1) renumbered++;
  }
  assert.ok(renumbered >= 1 && renumbered <= 2, `${renumbered} renumberings`);
});

// A random walk of plates from `seed`: layers come, go, move (off the
// canvas too), change places, pictures and volatility, the same id shows up
// twice, the base pans; now and then no scene or an invalidation. Every
// step is checked against composite; returns what the walk went through.
function walk(seed: number, steps: number): Record<string, number> {
  const r = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  // A budget small enough that pictures keep being let go.
  const { s, term, go } = rig(5 * 20 * 20 * 4);
  const pool = Array.from({ length: 10 }, (_, n) => pic(`f${n}`, int(4, 36), int(4, 36), seed + n, n % 4 === 0));
  const base: Placed = { id: 'base', pic: pic('wide', W + 40, H + 40, seed - 1, true), x: -20, y: -20 };
  let layers: Placed[] = [base];
  let made = 0;
  const seen: Record<string, number> = { sent: 0, placed: 0, cut: 0, unplaced: 0, freed: 0 };
  for (let step = 0; step < steps; step++) {
    for (let ops = int(1, 3); ops > 0; ops--) {
      const k = r();
      const i = int(0, layers.length - 1);
      const l = layers[i];
      if (k < 0.2 && layers.length < 14) {
        const fresh: Placed = { id: `L${made++}`, pic: pool[int(0, 9)], x: int(-40, W + 5), y: int(-40, H + 5) };
        layers.splice(int(0, layers.length), 0, fresh);
      } else if (k < 0.32 && layers.length > 1) layers.splice(i, 1);
      else if (k < 0.55) layers[i] = { ...l, x: l.x + int(-15, 15), y: l.y + int(-15, 15) };
      else if (k < 0.65) layers.splice(int(0, layers.length - 1), 0, ...layers.splice(i, 1));
      else if (k < 0.75) layers[i] = { ...l, pic: pool[int(0, 9)], volatile: false };
      else if (k < 0.8) layers[i] = { ...l, pic: pic(`v${made++}`, int(3, 30), int(3, 30), seed + 1000 + made), volatile: true };
      else if (k < 0.85) layers[i] = { ...l, pic: pic(`v${made++}`, l.pic.img.width, l.pic.img.height, seed + 1000 + made), volatile: true };
      else if (k < 0.92) layers = layers.map((m) => (m.id === 'base' ? { ...m, x: int(-40, 0), y: int(-40, 0) } : m));
      else if (k < 0.95) layers.push({ ...l, x: l.x + int(-9, 9) });
    }
    const odd = r();
    if (odd < 0.04) go(null);
    else if (odd < 0.07) s.invalidate();
    const out = go(plate(layers));
    seen.sent += term.sent;
    seen.placed += term.placed;
    seen.cut += out.split(',x=').length - 1;
    seen.unplaced += out.split('a=d,d=i,').length - 1;
    seen.freed += out.split('a=d,d=I,').length - 1;
  }
  return seen;
}

test('a random walk of plates always shows what composite draws', () => {
  for (const seed of [2026, 7, 31337]) {
    const seen = walk(seed, 150);
    for (const [what, n] of Object.entries(seen)) assert.ok(n > 5, `seed ${seed}: only ${n} ${what}`);
  }
});

test('an unchanged plate of 150 layers costs well under half a millisecond', (t) => {
  const s = new PlateStream({ encode: (b) => encodeRgba(b, 1) });
  const pics = Array.from({ length: 30 }, (_, n) => pic(`t${n}`, 8, 8, 500 + n));
  const layout = (dx: number) =>
    plate(Array.from({ length: 150 }, (_, n) => ({ id: `fig:${n}`, pic: pics[n % 30], x: ((n * 37) % (W - 8)) + dx, y: (n * 53) % (H - 8) })));
  const p = layout(0);
  assert.notEqual(s.step(p), '');
  for (let k = 0; k < 300; k++) assert.equal(s.step(p), '');
  const N = 2000;
  let t0 = performance.now();
  for (let k = 0; k < N; k++) if (s.step(p) !== '') assert.fail('changed');
  const still = (performance.now() - t0) / N;
  // Every layer moving (a pan): placements only.
  let bytes = 0;
  t0 = performance.now();
  for (let k = 1; k <= 200; k++) bytes += s.step(layout(k % 2)).length;
  const moving = (performance.now() - t0) / 200;
  t.diagnostic(`150 layers: unchanged ${(still * 1000).toFixed(1)} us a step; all moving ${(moving * 1000).toFixed(0)} us, ${Math.round(bytes / 200)} bytes`);
  assert.ok(still < 0.5, `${still} ms`);
});
