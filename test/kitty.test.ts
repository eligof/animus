import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { CELL_SIZE_QUERY, UNDER_CELLS, deleteImages, imageCommand, parseCellSize, supportsImages } from '../src/term/kitty.ts';
import { encodePng, encodePngScaled } from '../src/iso/png.ts';
import { PixelCanvas } from '../src/iso/canvas.ts';
import { DEFAULT, Screen } from '../src/term/screen.ts';
import { Renderer, renderLines } from '../src/term/renderer.ts';

test('kitty images go out in base64 chunks of at most 4096, flagged until the last', () => {
  const data = new Uint8Array(10_000).map((_, i) => (i * 37) & 255);
  const cmd = imageCommand(data, { id: 7, dx: 3, dy: 5 });
  const parts = cmd.split('\x1b\\').filter(Boolean);
  assert.ok(parts.length >= 3);
  assert.match(parts[0], /^\x1b_Ga=T,f=100,i=7,p=1,q=2,C=1,z=-1073741825,X=3,Y=5,m=1;/);
  for (const p of parts.slice(1, -1)) assert.match(p, /^\x1b_Gm=1;/);
  assert.match(parts[parts.length - 1], /^\x1b_Gm=0;/);
  const b64 = parts.map((p) => p.slice(p.indexOf(';') + 1)).join('');
  for (const p of parts) assert.ok(p.slice(p.indexOf(';') + 1).length <= 4096);
  assert.deepEqual(new Uint8Array(Buffer.from(b64, 'base64')), data);
  assert.equal(UNDER_CELLS < -(2 ** 30), true, 'drawn under cell backgrounds');
});

test('a tiny image is still one complete command', () => {
  const cmd = imageCommand(new Uint8Array([1, 2, 3]), { id: 1 });
  assert.equal(cmd.split('\x1b\\').filter(Boolean).length, 1);
  assert.match(cmd, /m=0;AQID\x1b\\$/);
});

test('images can be deleted one by one or all at once', () => {
  assert.equal(deleteImages(3), '\x1b_Ga=d,d=I,i=3,q=2\x1b\\');
  assert.equal(deleteImages(), '\x1b_Ga=d,d=A,q=2\x1b\\');
});

test('image-capable terminals are recognised from their environment', () => {
  assert.equal(supportsImages({ TERM: 'xterm-kitty' }), true);
  assert.equal(supportsImages({ KITTY_WINDOW_ID: '1' }), true);
  assert.equal(supportsImages({ TERM_PROGRAM: 'ghostty' }), true);
  assert.equal(supportsImages({ WEZTERM_PANE: '0' }), true);
  assert.equal(supportsImages({ TERM: 'alacritty', ALACRITTY_WINDOW_ID: '1' }), false);
  assert.equal(supportsImages({ TERM: 'xterm-256color' }), false);
});

test('the cell-size report is parsed out of terminal input', () => {
  assert.equal(CELL_SIZE_QUERY, '\x1b[16t');
  assert.deepEqual(parseCellSize('abc\x1b[6;20;10tq'), { w: 10, h: 20 });
  assert.equal(parseCellSize('\x1b[6;0;10t'), null);
  assert.equal(parseCellSize('nothing'), null);
});

// Concatenated IDAT payload of a PNG.
function idat(png: Buffer): Buffer {
  const parts: Buffer[] = [];
  for (let off = 8; off < png.length; ) {
    const len = png.readUInt32BE(off);
    if (png.subarray(off + 4, off + 8).toString('ascii') === 'IDAT') parts.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  return Buffer.concat(parts);
}

test('scaled PNGs repeat pixels and rows exactly and compress repeated rows away', () => {
  const c = new PixelCanvas(40, 30);
  for (let i = 0; i < c.data.length; i++) c.data[i] = (i * 2654435761) & 0xffffff;
  c.data[0] = -1; // cleared
  const png = encodePngScaled(c, 3, 0x123456);
  assert.equal(png.readUInt32BE(16), 120);
  assert.equal(png.readUInt32BE(20), 90);
  const raw = inflateSync(idat(png));
  const stride = 1 + 3 * 120;
  // Row 0: filter none, first pixel the backdrop, repeated 3 times.
  assert.equal(raw[0], 0);
  assert.deepEqual([...raw.subarray(1, 10)], [0x12, 0x34, 0x56, 0x12, 0x34, 0x56, 0x12, 0x34, 0x56]);
  // Rows 1 and 2 repeat row 0 via the "up" filter.
  assert.equal(raw[stride], 2);
  assert.ok(raw.subarray(stride + 1, 2 * stride).every((b) => b === 0));
  // Second canvas pixel lands at image x 3..5.
  const p = c.data[1];
  assert.deepEqual([...raw.subarray(1 + 9, 1 + 12)], [(p >> 16) & 255, (p >> 8) & 255, p & 255]);
  // Barely bigger than the canvas at 1x.
  assert.ok(png.length < encodePngScaled(c, 1, 0x123456).length * 2, `${png.length} vs ${encodePngScaled(c, 1).length}`);
  assert.ok(encodePng(c, 1).length > 0);
});

test('contour patterns shade the far edges and light the near ones', async () => {
  const { contourPatterns } = await import('../src/cave/texture.ts');
  const pats = contourPatterns(3);
  assert.equal(pats.length, 16);
  assert.equal(pats[0], null);
  const right = pats[1]!;
  assert.ok(right[2] < 1 && right[5] < 1 && right[8] < 1, 'right column darkened');
  assert.equal(right[0], 1);
  const top = pats[8]!;
  assert.ok(top[0] > 1 && top[1] > 1 && top[2] > 1, 'top row lit');
  assert.equal(top[4], 1);
  assert.equal(contourPatterns(3), pats, 'cached');
  // Patterns change the encoded pixels only where the index points at one.
  const c = new PixelCanvas(2, 1);
  c.data[0] = 0x808080;
  c.data[1] = 0x808080;
  const idx = new Uint16Array([1, 0]);
  const raw = inflateSync(idat(encodePngScaled(c, 3, 0, 1, { idx, pats })));
  assert.equal(raw[1 + 3 * 2], (0x80 * 0.62) | 0, 'edge pixel darkened');
  assert.equal(raw[1 + 3 * 3], 0x80, 'flat pixel untouched');
});

test('punched cells use the terminal default colours', () => {
  const s = new Screen(6, 2);
  s.clear([10, 20, 30]);
  s.punch({ x: 1, y: 0, w: 3, h: 2 });
  assert.equal(s.bg[1], DEFAULT);
  assert.equal(s.bg[0], (10 << 16) | (20 << 8) | 30);
  const out = new Renderer('truecolor').render(s);
  assert.ok(out.includes('39;49m'), 'no default-colour SGR');
  assert.ok(renderLines(s, '256').includes('39;49m'));
  assert.ok(out.includes('48;2;10;20;30'), 'normal cells keep their colour');
});

test('in HD mode the stage renders cells at their real pixel density and leaves them blank', async () => {
  const { Stage } = await import('../src/world/stage.ts');
  const { mines } = await import('../src/cave/biomes/mines.ts');
  const stage = new Stage(mines, 'hd');
  stage.setCell(10, 20);
  stage.layout({ x: 0, y: 1, w: 80, h: 30 });
  assert.equal(stage.hdScale(), 2);
  const hd = stage.hdImage()!;
  assert.equal(hd.canvas.w, 80 * 5);
  assert.equal(hd.canvas.h, 30 * 10);
  const s = new Screen(80, 32);
  s.clear([1, 2, 3]);
  stage.draw(s, 0, 1_700_000_000_000, null);
  assert.equal(s.bg[5 * 80 + 40], DEFAULT, 'scene cells not left for the image');
  assert.ok(hd.canvas.data.some((v) => v !== -1), 'nothing rendered');
  // The blow-up grows with the scene: a big one at 10x20 cells gets 3x.
  stage.layout({ x: 0, y: 1, w: 200, h: 60 });
  assert.equal(stage.hdScale(), 3);
  assert.equal(stage.hdImage()!.canvas.w, 200 * 3);
  stage.setMode('sextant');
  assert.equal(stage.hdImage(), null);
});

test('an HD frame is a synchronized, centred kitty PNG under the scene', async () => {
  const { hdFrame } = await import('../src/app.ts');
  const canvas = new PixelCanvas(30, 20);
  canvas.clear([200, 100, 50]);
  const out = hdFrame({ canvas, scale: 2, rect: { x: 4, y: 1, w: 10, h: 3 }, cell: { w: 8, h: 16 }, detail: null, tags: [] });
  assert.ok(out.startsWith('\x1b[?2026h'));
  assert.ok(out.endsWith('\x1b[?2026l'));
  // 60x40 image in an 80x48 px area: 10 px in (col 4+1, x 2), 4 px down (row 1, y 4).
  assert.match(out, /^\x1b\[\?2026h\x1b\[2;6H\x1b_Ga=T,f=100,i=1,p=1,q=2,C=1,z=-1073741825,X=2,Y=4,m=0;iVBORw0KGgo/);
});

test('r cycles into HD only where the terminal shows images', async () => {
  const { World } = await import('../src/world/world.ts');
  const { getTheme } = await import('../src/themes/index.ts');
  const make = (images: boolean) => new World({ theme: getTheme('mines')!, live: null, demo: true, account: null, rootLabel: '~', start: 0, pixels: 'half', images });
  const r = { name: 'r', ch: 'r', ctrl: false, shift: false };
  const plain = make(false);
  plain.handleKey(r);
  plain.handleKey(r);
  assert.equal(plain.pixels, 'half');
  const kitty = make(true);
  kitty.handleKey(r);
  kitty.handleKey(r);
  assert.equal(kitty.pixels, 'hd');
  kitty.handleKey(r);
  assert.equal(kitty.pixels, 'half');
});

test('HD frames are only re-sent when the picture changed or a redraw forces it', async () => {
  const { HdStream } = await import('../src/app.ts');
  const canvas = new PixelCanvas(30, 20);
  canvas.clear([200, 100, 50]);
  const hd = { canvas, scale: 2, rect: { x: 4, y: 1, w: 10, h: 3 }, cell: { w: 8, h: 16 }, detail: null, tags: [] };
  const stream = new HdStream({ patches: false });
  const image = /\x1b_Ga=T,f=100,i=1,/;
  assert.match(stream.step(hd, 0), image);
  assert.equal(stream.step(hd, 50), '', 'at most 10 fps');
  assert.equal(stream.step(hd, 100), '', 'unchanged: nothing sent');
  // With no `hot` boxes to say otherwise, any change is motion: it goes out
  // at the next look (see hdstream.test.ts for ambient changes).
  canvas.data[7] = 0x123456;
  assert.match(stream.step(hd, 200), image, 'one changed pixel goes out');
  assert.equal(stream.step(hd, 300), '');
  assert.equal(stream.step(hd, 400), '');
  stream.invalidate();
  assert.match(stream.step(hd, 500), image, 'a forced redraw goes out');
  // Anything else that shapes the frame counts too.
  assert.match(stream.step({ ...hd, rect: { ...hd.rect, x: 5 } }, 600), image);
  assert.match(stream.step({ ...hd, rect: { ...hd.rect, x: 5 }, detail: { idx: new Uint16Array(600), pats: [] } }, 700), image);
  // Leaving HD deletes the image; coming back sends it even if unchanged.
  assert.equal(stream.step(null, 800), '\x1b_Ga=d,d=I,i=1,q=2\x1b\\');
  assert.equal(stream.step(null, 900), '');
  assert.match(stream.step(hd, 1000), image);
});

test('the HD fingerprint covers the detail patterns', async () => {
  const { hdKey } = await import('../src/app.ts');
  const canvas = new PixelCanvas(4, 3);
  const idx = new Uint16Array(12);
  const hd = { canvas, scale: 2, rect: { x: 0, y: 0, w: 2, h: 1 }, cell: { w: 8, h: 16 }, detail: { idx, pats: [] }, tags: [] };
  const before = hdKey(hd);
  assert.equal(hdKey(hd), before);
  idx[5] = 3;
  assert.notEqual(hdKey(hd), before);
});

// Pixels (packed RGB) and per-row filter types of an encodePngScaled image,
// which only uses filters 0 (none) and 2 (up).
function decodeScaled(png: Buffer): { w: number; h: number; px: Int32Array; filters: number[] } {
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const raw = inflateSync(idat(png));
  const stride = 1 + 3 * w;
  const px = new Int32Array(w * h);
  const line = new Uint8Array(3 * w);
  const filters: number[] = [];
  for (let y = 0; y < h; y++) {
    const f = raw[y * stride];
    assert.ok(f === 0 || f === 2, `row ${y}: filter ${f}`);
    filters.push(f);
    for (let i = 0; i < 3 * w; i++) line[i] = (f === 2 ? line[i] : 0) + raw[y * stride + 1 + i];
    for (let x = 0; x < w; x++) px[y * w + x] = (line[3 * x] << 16) | (line[3 * x + 1] << 8) | line[3 * x + 2];
  }
  return { w, h, px, filters };
}

test('tags are painted over the scaled image at full resolution and nowhere else', async () => {
  const { drawText, textWidth, GLYPH_H } = await import('../src/iso/font.ts');
  const { TAG_PAD } = await import('../src/iso/png.ts');
  const c = new PixelCanvas(40, 30);
  for (let i = 0; i < c.data.length; i++) c.data[i] = (i * 2654435761) & 0xffffff;
  c.data[45] = -1;
  const tags = [
    { x: 5, y: 7, text: 'Hi gj', color: 0xffffff, shadow: 0x000000, bg: 0x102030 },
    // Starts on the last row of a 3x block, runs off the right edge.
    { x: 100, y: 50, text: '✎ ok', color: 0xff0000, shadow: 0x111111 },
    // Off the left and bottom edges, half see-through.
    { x: -4, y: 83, text: 'edge', color: 0x00ff00, bg: 0x000000, bgAlpha: 0.5 },
  ];
  const plain = decodeScaled(encodePngScaled(c, 3, 0x123456, 1));
  const tagged = decodeScaled(encodePngScaled(c, 3, 0x123456, 1, undefined, tags));
  assert.deepEqual(encodePngScaled(c, 3, 0x123456, 1, undefined, []), encodePngScaled(c, 3, 0x123456, 1));

  // Expected: the plain image with each tag drawn by drawText, its box
  // blended by hand where it is see-through.
  const want = { w: plain.w, h: plain.h, data: plain.px.slice() };
  const boxH = GLYPH_H + 2 * TAG_PAD;
  for (const t of tags) {
    const boxW = textWidth(t.text) + 2 * TAG_PAD;
    if (t.bgAlpha !== undefined) {
      for (let y = Math.max(0, t.y); y < Math.min(want.h, t.y + boxH); y++) {
        for (let x = Math.max(0, t.x); x < Math.min(want.w, t.x + boxW); x++) {
          const v = want.data[y * want.w + x];
          const mix = (sh: number) => Math.floor((((v >> sh) & 255) * (1 - t.bgAlpha!) + ((t.bg! >> sh) & 255) * t.bgAlpha!) + 0.5) << sh;
          want.data[y * want.w + x] = mix(16) | mix(8) | mix(0);
        }
      }
    }
    drawText(want, t.x + TAG_PAD, t.y + TAG_PAD, t.text, t.color, { shadow: t.shadow, bg: t.bgAlpha === undefined ? t.bg : undefined, pad: TAG_PAD });
  }
  let changed = 0;
  for (let i = 0; i < want.data.length; i++) {
    assert.equal(tagged.px[i], want.data[i], `pixel ${i % want.w},${Math.floor(i / want.w)}`);
    if (tagged.px[i] !== plain.px[i]) changed++;
  }
  assert.ok(changed > 100, `${changed} pixels changed`);

  // Only rows under a tag (and the one just below it) give up the "up"
  // shortcut; the rest encode exactly as before.
  const near = (y: number) => tags.some((t) => y >= t.y && y <= t.y + boxH);
  for (let y = 0; y < plain.h; y++) {
    if (near(y)) assert.equal(tagged.filters[y], 0, `row ${y}`);
    else assert.equal(tagged.filters[y], plain.filters[y], `row ${y}`);
  }
  assert.ok(plain.filters.filter((f) => f === 2).length > 50);
});

test('in HD, name tags are drawn into the image in the pixel font, not as text cells', async () => {
  const { Stage } = await import('../src/world/stage.ts');
  const { mines } = await import('../src/cave/biomes/mines.ts');
  const { GLYPH_H } = await import('../src/iso/font.ts');
  const stage = new Stage(mines, 'hd');
  stage.setCell(10, 20);
  stage.layout({ x: 0, y: 1, w: 120, h: 34 });
  const NOW = 1_700_000_000_000;
  const acts = ['write', 'read', 'search', 'run', 'think', 'talk'] as const;
  const agents = acts.map((activity, i) => ({ id: `a${i}`, name: `agent${i}`, role: 'sub' as const, project: 'p', activity, detail: `${activity} detail`, since: NOW, lastSeen: NOW }));
  let now = NOW;
  for (let i = 0; i < 160; i++) {
    now += 50;
    stage.sync(agents, now);
    stage.update(0.05, now);
  }
  const s = new Screen(120, 36);
  s.clear([1, 2, 3]);
  stage.draw(s, 8, now, 'a2');
  const hd = stage.hdImage()!;
  const boxes = hd.tags.filter((t) => t.bg !== undefined);
  assert.ok(boxes.length >= 3, `${boxes.length} tags`);
  assert.ok(boxes.some((t) => t.text.includes('agent2') && t.text.includes('search detail')), 'no bubble for the selection');
  const W = hd.canvas.w * hd.scale;
  const H = hd.canvas.h * hd.scale;
  const { textWidth } = await import('../src/iso/font.ts');
  const rects = boxes.map((t) => [t.x, t.y, t.x + textWidth(t.text) + 2, t.y + GLYPH_H + 2]);
  for (const [x0, y0, x1, y1] of rects) assert.ok(x0 >= 0 && y0 >= 0 && x1 <= W && y1 <= H, 'tag off the image');
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const [a, b] = [rects[i], rects[j]];
      assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], `tags overlap: ${boxes[i].text} / ${boxes[j].text}`);
    }
  }
  // The scene's cells stay blank for the image to show through.
  for (let y = 2; y < 34; y++) for (let x = 0; x < 120; x++) assert.equal(s.ch[y * 120 + x], ' ', `text at ${x},${y}`);
  // A tag change alone re-sends the frame.
  const { hdKey } = await import('../src/app.ts');
  const k0 = hdKey(hd);
  assert.notEqual(hdKey({ ...hd, tags: [...hd.tags, { x: 1, y: 1, text: 'x', color: 0xffffff }] }), k0);
  // So does a tag's font scale.
  assert.notEqual(hdKey({ ...hd, tags: hd.tags.map((t, i) => (i ? t : { ...t, scale: (t.scale ?? 1) + 1 })) }), k0);
});

test('a tag at scale 2 is the scale-1 tag blown up, box, padding and shadow included', async () => {
  const { tagSize } = await import('../src/iso/png.ts');
  const c = new PixelCanvas(30, 20);
  for (let i = 0; i < c.data.length; i++) c.data[i] = (i * 2654435761) & 0xffffff;
  const one = [
    { x: 3, y: 2, text: '✎ Hi gj', color: 0xffee00, shadow: 0x000000, bg: 0x203040, bgAlpha: 0.6 },
    { x: 1, y: 13, text: '▶', color: 0x00ff00, shadow: 0x101010, bg: 0x000000 },
  ];
  const two = one.map((t) => ({ ...t, x: 2 * t.x, y: 2 * t.y, scale: 2 }));
  const small = decodeScaled(encodePngScaled(c, 1, 0, 1, undefined, one));
  const big = decodeScaled(encodePngScaled(c, 2, 0, 1, undefined, two));
  for (let y = 0; y < big.h; y++) {
    for (let x = 0; x < big.w; x++) assert.equal(big.px[y * big.w + x], small.px[(y >> 1) * small.w + (x >> 1)], `pixel ${x},${y}`);
  }
  assert.deepEqual(tagSize('✎ Hi gj', 2), { w: 2 * tagSize('✎ Hi gj').w, h: 2 * tagSize('✎ Hi gj').h });
  // Rows under the taller boxes, and the one below each, are written out
  // in full; the rest of each 2x block still repeats the row above.
  const under = (y: number) => two.some((t) => y >= t.y && y <= t.y + tagSize(t.text, 2).h);
  for (let y = 0; y < big.h; y++) assert.equal(big.filters[y], under(y) || y % 2 === 0 ? 0 : 2, `row ${y}`);
});

test('HD tags grow with the picture: x1 at fit, x2 in the x4 close-up, with shorter bubbles', async () => {
  const { Stage } = await import('../src/world/stage.ts');
  const { mines } = await import('../src/cave/biomes/mines.ts');
  const { tagSize } = await import('../src/iso/png.ts');
  const stage = new Stage(mines, 'hd');
  stage.setCell(10, 20);
  stage.layout({ x: 0, y: 1, w: 120, h: 34 });
  assert.equal(stage.hdScale(), 2);
  const NOW = 1_700_000_000_000;
  const long = 'Edit src/world/a-very-long-file-name.ts';
  const agents = ['write', 'read', 'search', 'run'].map((activity, i) => ({ id: `a${i}`, name: `agent${i}`, role: 'sub' as const, project: 'p', activity: activity as 'write', detail: long, since: NOW, lastSeen: NOW }));
  let now = NOW;
  let step = 0;
  const frame = (selected: string | null) => {
    // A fresh detail each time, so there are bubbles to see.
    step++;
    for (let i = 0; i < 20; i++) {
      now += 50;
      stage.sync(agents.map((a) => ({ ...a, detail: `${long} ${step}` })), now);
      stage.update(0.05, now);
    }
    stage.draw(new Screen(120, 36), (now - NOW) / 1000, now, selected);
    return stage.hdImage()!;
  };
  const fit = frame(null);
  assert.ok(fit.tags.length > 0);
  for (const t of fit.tags) assert.equal(t.scale ?? 1, 1, `fit: ${t.text}`);
  assert.ok(fit.tags.some((t) => t.text.includes('· Edit src/world/a-very…')), 'fit bubbles keep 22 characters of detail');
  const close = frame('a1');
  assert.equal(stage.zoomLevel, 2);
  const bubble = close.tags.find((t) => t.text.includes('agent1') && t.bg !== undefined);
  assert.ok(bubble, 'no bubble for the selection');
  for (const t of close.tags) assert.equal(t.scale, 2, `close-up: ${t.text}`);
  const detail = bubble.text.split(' · ')[1];
  assert.ok([...detail].length <= 16, `close-up detail "${detail}"`);
  // Boxes stay on the image and clear of each other at their new size.
  const W = close.canvas.w * close.scale;
  const H = close.canvas.h * close.scale;
  const rects = close.tags.filter((t) => t.bg !== undefined).map((t) => { const { w, h } = tagSize(t.text, t.scale); return [t.x, t.y, t.x + w, t.y + h]; });
  for (const [x0, y0, x1, y1] of rects) assert.ok(x0 >= 0 && y0 >= 0 && x1 <= W && y1 <= H, 'tag off the image');
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const [a, b] = [rects[i], rects[j]];
      assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], 'tags overlap');
    }
  }
});
