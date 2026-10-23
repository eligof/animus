import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { HdStream, coalesce } from '../src/app.ts';
import { PixelCanvas } from '../src/iso/canvas.ts';
import { encodePngScaled } from '../src/iso/png.ts';
import type { Tag } from '../src/iso/png.ts';
import { frameCommand, supportsFramePatches } from '../src/term/kitty.ts';
import { Glow } from '../src/cave/glow.ts';
import type { PointLight } from '../src/cave/types.ts';
import type { Rect as Box } from '../src/cave/layout.ts';

// An HD frame as the stage hands it over: nothing moving (`hot` empty)
// unless a test says so, ambient step 0.
function scene(w = 120, h = 80, scale = 2) {
  const canvas = new PixelCanvas(w, h);
  for (let i = 0; i < canvas.data.length; i++) canvas.data[i] = 0x203040 + ((i * 7919) % 64);
  return { canvas, scale, rect: { x: 0, y: 1, w: 40, h: 12 }, cell: { w: 10, h: 20 }, detail: null as { idx: Uint16Array; pats: Array<Float32Array | null> } | null, tags: [] as Tag[], hot: [] as Box[], view: 'fit', ambient: 0 };
}

// The kitty escapes in `out`: keys and payload, chunks joined.
function commands(out: string): Array<{ keys: Record<string, string>; chunks: string[]; data: Buffer }> {
  const cmds: Array<{ keys: Record<string, string>; chunks: string[]; data: Buffer }> = [];
  let open: { keys: Record<string, string>; chunks: string[]; b64: string } | null = null;
  for (const m of out.matchAll(/\x1b_G([^;\x1b]*)(?:;([^\x1b]*))?\x1b\\/g)) {
    const keys = Object.fromEntries(m[1].split(',').map((kv) => kv.split('=')));
    if (!open) open = { keys, chunks: [], b64: '' };
    open.chunks.push(m[1]);
    open.b64 += m[2] ?? '';
    if (keys.m === '1') continue;
    cmds.push({ keys: open.keys, chunks: open.chunks, data: Buffer.from(open.b64, 'base64') });
    open = null;
  }
  assert.equal(open, null, 'unfinished chunked command');
  return cmds;
}

// Pixels of an encodePngScaled image (filters 0 and 2 only).
function decode(png: Buffer): { w: number; h: number; px: Int32Array } {
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const parts: Buffer[] = [];
  for (let off = 8; off < png.length; ) {
    const len = png.readUInt32BE(off);
    if (png.subarray(off + 4, off + 8).toString('ascii') === 'IDAT') parts.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = 1 + 3 * w;
  const px = new Int32Array(w * h);
  const line = new Uint8Array(3 * w);
  for (let y = 0; y < h; y++) {
    const f = raw[y * stride];
    for (let i = 0; i < 3 * w; i++) line[i] = (f === 2 ? line[i] : 0) + raw[y * stride + 1 + i];
    for (let x = 0; x < w; x++) px[y * w + x] = (line[3 * x] << 16) | (line[3 * x + 1] << 8) | line[3 * x + 2];
  }
  return { w, h, px };
}

// A model terminal: a=T shows a new image, a=f r=1 patches it in place.
class Term {
  img: { w: number; h: number; px: Int32Array } | null = null;
  patches = 0;
  whole = 0;
  play(out: string): void {
    for (const c of commands(out)) {
      if (c.keys.a === 'T') {
        this.img = decode(c.data);
        this.whole++;
      } else if (c.keys.a === 'f') {
        const img = this.img;
        assert.ok(img, 'patch before any image');
        const p = decode(c.data);
        const [x, y, s, v] = [+c.keys.x, +c.keys.y, +c.keys.s, +c.keys.v];
        assert.deepEqual([s, v], [p.w, p.h], 's, v: the patch size');
        assert.ok(x >= 0 && y >= 0 && x + s <= img.w && y + v <= img.h, `patch ${x},${y} ${s}x${v} off a ${img.w}x${img.h} image`);
        for (let r = 0; r < v; r++) img.px.set(p.px.subarray(r * s, (r + 1) * s), (y + r) * img.w + x);
        this.patches++;
      }
    }
  }
}

const truth = (hd: ReturnType<typeof scene>) => decode(encodePngScaled(hd.canvas, hd.scale, 0, 2, hd.detail ?? undefined, hd.tags));

test('frame patches are a=f edits of the root frame, chunked with a=f on every chunk', () => {
  const data = new Uint8Array(9000).map((_, i) => (i * 31) & 255);
  const cmd = frameCommand(data, { id: 1, x: 66, y: 33, w: 99, h: 132 });
  const parts = cmd.split('\x1b\\').filter(Boolean);
  assert.ok(parts.length >= 3);
  assert.match(parts[0], /^\x1b_Ga=f,r=1,f=100,i=1,x=66,y=33,s=99,v=132,X=1,q=2,m=1;/);
  for (const p of parts.slice(1, -1)) assert.match(p, /^\x1b_Ga=f,q=2,m=1;/);
  assert.match(parts[parts.length - 1], /^\x1b_Ga=f,q=2,m=0;/);
  for (const p of parts) assert.ok(p.slice(p.indexOf(';') + 1).length <= 4096);
  const b64 = parts.map((p) => p.slice(p.indexOf(';') + 1)).join('');
  assert.deepEqual(new Uint8Array(Buffer.from(b64, 'base64')), data);
});

test('only kitty is trusted to patch a shown image', () => {
  assert.equal(supportsFramePatches({ TERM: 'xterm-kitty' }), true);
  assert.equal(supportsFramePatches({ KITTY_WINDOW_ID: '3', TERM: 'xterm-256color' }), true);
  assert.equal(supportsFramePatches({ TERM_PROGRAM: 'ghostty', TERM: 'xterm-ghostty' }), false);
  assert.equal(supportsFramePatches({ GHOSTTY_RESOURCES_DIR: '/usr/share/ghostty' }), false);
  assert.equal(supportsFramePatches({ WEZTERM_PANE: '0', TERM_PROGRAM: 'WezTerm' }), false);
  // Started from a kitty window, but running in another terminal.
  assert.equal(supportsFramePatches({ KITTY_WINDOW_ID: '1', TERM_PROGRAM: 'WezTerm' }), false);
  assert.equal(supportsFramePatches({ KITTY_WINDOW_ID: '1', TERM: 'xterm-ghostty' }), false);
  assert.equal(supportsFramePatches({ TERM: 'alacritty' }), false);
});

test('a scene where only ambient animation moves goes out at most 3 times a second', () => {
  const hd = scene();
  const stream = new HdStream({ patches: true });
  const term = new Term();
  const sent: number[] = [];
  let patched = 0;
  for (let i = 0; i <= 54; i++) {
    const now = i * (1000 / 18);
    // The sky (top rows) twinkles every frame; ambient steps 3 times a second.
    for (let x = 0; x < hd.canvas.w; x += 5) hd.canvas.data[(i % 6) * hd.canvas.w + x] = 0x808080 + i;
    hd.ambient = Math.floor((now * 3) / 1000);
    const out = stream.step(hd, now);
    if (!out) continue;
    sent.push(now);
    if (out.includes('a=f')) patched++;
    term.play(out);
  }
  // The first frame, then one per ambient step: about 3 a second, never
  // closer together than 250 ms.
  assert.ok(sent.length >= 9 && sent.length <= 11, `${sent.length} sent in 3 s`);
  for (let k = 2; k < sent.length; k++) assert.ok(sent[k] - sent[k - 1] >= 250, `${sent[k - 1]} -> ${sent[k]}`);
  assert.equal(term.whole, 1);
  assert.equal(patched, sent.length - 1, 'the rest as patches');
  // Whatever waited went out with the last step: the terminal is up to date.
  hd.ambient++;
  term.play(stream.step(hd, 4000));
  assert.deepEqual(term.img!.px, truth(hd).px);
});

test('a figure on the move goes out at full rate, and only around it until the ambient step', () => {
  const hd = scene();
  const stream = new HdStream({ patches: true });
  const term = new Term();
  term.play(stream.step(hd, 0));
  let sent = 0;
  for (let i = 1; i <= 36; i++) {
    const now = i * (1000 / 18);
    // A 6 x 10 figure walking right, one pixel a frame, and the sky.
    const fx = 20 + i;
    for (let y = 40; y < 50; y++) for (let x = fx; x < fx + 6; x++) hd.canvas.data[y * hd.canvas.w + x] = 0xff0000 + i;
    hd.canvas.data[3 * hd.canvas.w + 100] = 0x404040 + i;
    hd.hot = [{ x0: fx - 4, y0: 36, x1: fx + 10, y1: 54 }];
    hd.ambient = Math.floor((now * 3) / 1000);
    const was = term.img!.px.slice();
    const out = stream.step(hd, now);
    if (!out) continue;
    sent++;
    term.play(out);
    // Between ambient steps the sky waits; the figure is always current.
    const t = truth(hd);
    const W = t.w;
    for (let y = 40 * 2; y < 50 * 2; y++) for (let x = fx * 2; x < (fx + 6) * 2; x++) assert.equal(term.img!.px[y * W + x], t.px[y * W + x]);
    const sky = 3 * 2 * W + 100 * 2;
    if (term.img!.px[sky] !== t.px[sky]) assert.equal(term.img!.px[sky], was[sky], 'the sky only ever changes to the truth');
  }
  assert.ok(sent >= 17, `${sent} frames in 2 s`);
  const cmds = commands(stream.step({ ...hd, ambient: hd.ambient }, 2100));
  assert.equal(cmds.length, 0, 'nothing left to send');
});

test('patches tile the change exactly, tags and surface patterns included, inside the image', () => {
  // Scale 3: tiles are 11 canvas px (33 image px), not a divisor of the canvas.
  const hd = scene(100, 70, 3);
  const pats = [null, new Float32Array(9).fill(0.5), new Float32Array(9).map((_, i) => (i % 2 ? 1.2 : 0.8))];
  hd.detail = { idx: new Uint16Array(100 * 70).map((_, i) => (i % 13 === 0 ? 1 : i % 17 === 0 ? 2 : 0)), pats };
  hd.tags = [{ x: 30, y: 31, text: 'atlas · write', color: 0xffffff, shadow: 0, bg: 0x102030, bgAlpha: 0.7 }];
  const stream = new HdStream({ patches: true });
  const term = new Term();
  term.play(stream.step(hd, 0));
  // A figure at the left edge, a tag that moves (straddling tiles), a
  // pattern flipping bottom right, and a pixel in the last partial tile.
  for (let y = 20; y < 40; y++) for (let x = 0; x < 8; x++) hd.canvas.data[y * 100 + x] = 0x00ff00;
  hd.hot = [{ x0: -4, y0: 16, x1: 12, y1: 44 }];
  hd.tags = [{ ...hd.tags[0], x: 41, y: 29 }];
  hd.detail.idx[65 * 100 + 90] = 2;
  hd.canvas.data[69 * 100 + 99] = 0x123456;
  hd.ambient = 1;
  const out = stream.step(hd, 400);
  assert.ok(out.startsWith('\x1b[?2026h') && out.endsWith('\x1b[?2026l'), 'one synchronized update');
  const cmds = commands(out);
  assert.ok(cmds.length >= 2 && cmds.length <= 6, `${cmds.length} patches`);
  for (const c of cmds) {
    assert.equal(c.keys.a, 'f');
    assert.equal(c.keys.r, '1');
    assert.equal(c.keys.f, '100');
    assert.equal(c.keys.i, '1');
    for (const k of c.chunks.slice(1)) assert.match(k, /^a=f,q=2,m=[01]$/);
  }
  term.play(out);
  assert.deepEqual(term.img!.px, truth(hd).px);
  const area = cmds.reduce((sum, c) => sum + +c.keys.s * +c.keys.v, 0);
  assert.ok(area < 0.5 * term.img!.px.length, `${area} px patched`);
});

test('the whole frame goes out when most of it changed, on a new shape, and every 5 s after patches', () => {
  const hd = scene();
  const stream = new HdStream({ patches: true });
  const term = new Term();
  term.play(stream.step(hd, 0));
  // Over 60 % changed: one whole frame, not patches.
  for (let i = 0; i < 0.7 * hd.canvas.data.length; i++) hd.canvas.data[i] = 0x777777;
  hd.ambient = 1;
  let out = stream.step(hd, 400);
  assert.match(out, /\x1b_Ga=T,f=100,i=1,/);
  assert.doesNotMatch(out, /a=f/);
  // A small change is a patch...
  hd.canvas.data[5] = 0x010203;
  hd.ambient = 2;
  out = stream.step(hd, 800);
  assert.match(out, /\x1b_Ga=f,r=1,/);
  // ...and 5 s after the last whole frame one comes anyway, even if nothing changed.
  assert.equal(stream.step(hd, 5000), '');
  assert.match(stream.step(hd, 5400), /\x1b_Ga=T,/);
  assert.equal(stream.step(hd, 5600), '');
  // Resized (another rect or cell size), re-laid out (a new canvas) or
  // invalidated: whole.
  assert.match(stream.step({ ...hd, rect: { ...hd.rect, w: 41 } }, 5800), /a=T/);
  assert.match(stream.step({ ...hd, rect: { ...hd.rect, w: 41 }, cell: { w: 9, h: 18 } }, 6000), /a=T/);
  const fresh = { ...hd, rect: { ...hd.rect, w: 41 }, cell: { w: 9, h: 18 }, canvas: new PixelCanvas(120, 80) };
  assert.match(stream.step(fresh, 6200), /a=T/);
  stream.invalidate();
  assert.match(stream.step(fresh, 6400), /a=T/);
  // A camera move shifts everything: whole, at once.
  fresh.canvas.data.fill(0x445566);
  assert.match(stream.step({ ...fresh, view: 'panned' }, 6600), /a=T/);
});

test('without patches (Ghostty, WezTerm) changes go out as whole frames at the same pace', () => {
  const hd = scene();
  const stream = new HdStream({ patches: false });
  assert.match(stream.step(hd, 0), /a=T/);
  // Ambient only: waits for the next step.
  hd.canvas.data[0] = 1;
  assert.equal(stream.step(hd, 100), '');
  hd.ambient = 1;
  assert.match(stream.step(hd, 400), /a=T/);
  // Motion: at once.
  hd.canvas.data[50 * 120 + 50] = 2;
  hd.hot = [{ x0: 45, y0: 45, x1: 55, y1: 55 }];
  const out = stream.step(hd, 500);
  assert.match(out, /a=T/);
  assert.doesNotMatch(out, /a=f/);
});

test('a tag that moves goes out at once, even where no pixel changed', () => {
  const hd = scene();
  hd.tags = [{ x: 10, y: 10, text: 'nova', color: 0xffffff, bg: 0 }];
  const stream = new HdStream({ patches: true });
  const term = new Term();
  term.play(stream.step(hd, 0));
  hd.tags = [{ ...hd.tags[0], x: 120 }];
  const out = stream.step(hd, 100);
  assert.match(out, /a=f/);
  term.play(out);
  assert.deepEqual(term.img!.px, truth(hd).px);
});

test('ambient updates take what room the byte budget leaves, but never wait past a second', () => {
  // Noise everywhere every frame: each update is a whole frame of ~1 MB.
  const hd = scene(400, 300, 2);
  const stream = new HdStream({ patches: true });
  let seed = 1;
  const noise = () => {
    for (let i = 0; i < hd.canvas.data.length; i++) hd.canvas.data[i] = (seed = Math.imul(seed, 1103515245) + 12345) & 0xffffff;
  };
  let bytes = 0;
  let sent = 0;
  for (let i = 0; i < 50; i++) {
    const now = i * 100;
    noise();
    hd.ambient = Math.floor((now * 3) / 1000);
    const out = stream.step(hd, now);
    if (!out) continue;
    sent++;
    bytes += out.length;
  }
  assert.ok(bytes / 5 < 2_000_000, `${(bytes / 5e6).toFixed(2)} MB/s`);
  assert.ok(sent >= 5 && sent < 15, `${sent} updates in 5 s`);
});

test('changed tiles coalesce into a few rectangles that cover them all', () => {
  const tw = 20;
  const th = 12;
  const mask = new Uint8Array(tw * th);
  const set = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * tw + x] = 1;
  };
  set(1, 1, 4, 5); // a figure
  set(12, 2, 15, 6); // another
  set(5, 9, 6, 10); // a torch
  set(7, 9, 8, 10); // one tile over: bridged
  set(18, 11, 20, 12); // a corner
  const rects = coalesce(mask, tw, th, 4);
  assert.ok(rects.length <= 4);
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    const [x, y] = [k % tw, Math.floor(k / tw)];
    assert.ok(rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1), `tile ${x},${y} left out`);
  }
  const area = rects.reduce((sum, r) => sum + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
  assert.ok(area <= 40, `${area} tiles for 28 changed`);
  assert.deepEqual(coalesce(new Uint8Array(tw * th), tw, th, 4), []);
});

test('held lights keep their flicker for the ambient step; moving ones follow', () => {
  const w = 40;
  const h = 30;
  const albedo = new Int32Array(w * h).fill(0x808080);
  const emit = new Int32Array(w * h);
  const grade = { ambient: [40, 40, 40] as [number, number, number], illum: 1, bloom: 0, vignette: 0 };
  const light = (intensity: number, x = 10): PointLight => ({ x, y: 10, z: 0, color: [255, 200, 120], radius: 20, intensity });
  const shot = (g: Glow, lights: PointLight[], hold: number | null) => {
    const out = new PixelCanvas(w, h);
    g.compose(out, albedo, emit, { ox: 10, oy: 0 }, lights, grade, true, [0, 0, 0], hold);
    return out.data;
  };
  const g = new Glow();
  const a = shot(g, [light(0.8)], 30);
  assert.deepEqual(shot(g, [light(1.0)], 30), a, 'same step: the flicker holds');
  assert.notDeepEqual(shot(g, [light(1.0)], 31), a, 'next step: it moves on');
  // A light that moved is drawn as it is now.
  assert.deepEqual(shot(g, [light(0.5, 14)], 31), shot(new Glow(), [light(0.5, 14)], 31));
  // Outside HD (no hold) every frame is as given.
  const free = new Glow();
  assert.notDeepEqual(shot(free, [light(1.0)], null), shot(free, [light(0.8)], null));
});

test('the stage boxes what moves and holds the sky for the ambient step in HD only', async () => {
  const { Stage } = await import('../src/world/stage.ts');
  const { station } = await import('../src/cave/biomes/station.ts');
  const { Screen } = await import('../src/term/screen.ts');
  const NOW = 1_700_000_000_000;
  const agents = (['write', 'read', 'think'] as const).map((activity, i) => ({ id: `a${i}`, name: `agent${i}`, role: 'sub' as const, project: 'p', activity, detail: activity, since: NOW, lastSeen: NOW }));
  const make = (mode: 'hd' | 'sextant', crew = agents) => {
    const stage = new Stage(station, mode);
    stage.setCell(10, 20);
    stage.layout({ x: 0, y: 1, w: 120, h: 34 });
    let now = NOW;
    for (let i = 0; i < 80; i++) {
      now += 50;
      stage.sync(crew, now);
      stage.update(0.05, now);
    }
    // The drone hovers and blinks on its own clock; leave it out.
    (stage as unknown as { critter: null }).critter = null;
    const shot = (t: number) => {
      stage.draw(new Screen(120, 36), t, now, null);
      return (stage as unknown as { screen: PixelCanvas }).screen.data.slice();
    };
    return { stage, shot };
  };
  const { stage, shot } = make('hd');
  const a = shot(10.05);
  const hd = stage.hdImage()!;
  assert.equal(hd.ambient, 30, 'the step of t = 10.05 s at 3 a second');
  assert.equal(typeof hd.view, 'string');
  assert.equal(hd.hot.length, agents.length, 'one box a figure');
  // Later in the same step only the figures (and their emotes and lights)
  // change, all inside their boxes; the stars hold.
  const b = shot(10.25);
  const { w } = hd.canvas;
  let moved = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    moved++;
    const [x, y] = [i % w, Math.floor(i / w)];
    assert.ok(hd.hot.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1), `pixel ${x},${y} changed outside the boxes`);
  }
  assert.ok(moved > 0, 'the figures animate');
  // The next step moves the sky.
  const c = shot(10.4);
  let sky = 0;
  for (let i = 0; i < c.length; i++) if (c[i] !== b[i] && !hd.hot.some((r) => i % w >= r.x0 && i % w < r.x1 && Math.floor(i / w) >= r.y0 && Math.floor(i / w) < r.y1)) sky++;
  assert.ok(sky > 0, 'the stars twinkle on the next step');
  // Nobody home: nothing at all changes within a step in HD, while
  // sextant keeps the sky moving every frame.
  const empty = make('hd', []);
  assert.deepEqual(empty.shot(10.25), empty.shot(10.05));
  assert.equal(empty.stage.hdImage()!.hot.length, 0);
  const sx = make('sextant', []);
  assert.notDeepEqual(sx.shot(10.25), sx.shot(10.05));
  assert.equal(sx.stage.hdImage(), null);
});
