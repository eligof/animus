import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearSprites, critterSprite, emoteSprite, figureSprite, spriteCount, spriteStats, trinketSprite, type Sprite } from '../src/art/figure.ts';
import { GOLD, PRIZES, lookOf } from '../src/art/figure/look.ts';
import { blinkAt, frameOf, LOOP } from '../src/art/figure/rig.ts';
import { traitsFor, type Costume, type Emote, type Feel, type Pose, type Species, type Traits, type Wear } from '../src/world/character.ts';
import { hexOf } from '../src/art/iso.ts';
import { budget } from './helpers.ts';
import type { CritterFrame, FigureFrame } from '../src/world/frame.ts';
import { figureTop } from '../src/world/frame.ts';

const INK = '#2b2233';
const POSES = Object.keys(LOOP) as Pose[];
const SPECIES: Species[] = ['human', 'robot', 'cat', 'alien', 'ghost'];
const COSTUMES: Costume[] = ['casual', 'wizard', 'scientist', 'raver', 'hacker', 'astronaut'];
const EMOTES: Emote[] = ['excl', 'question', 'heart', 'note', 'idea', 'sweat', 'zzz', 'anger', 'star', 'cup'];

// The first few ids that roll each species.
const ids = new Map<Species, string[]>();
for (let i = 0; i < 3000; i++) {
  const t = traitsFor(`agent-${i}`, 'sub');
  const l = ids.get(t.species) ?? [];
  if (l.length < 8) l.push(`agent-${i}`);
  ids.set(t.species, l);
}
const who = (sp: Species, n = 0): Traits => traitsFor(ids.get(sp)![n], n % 3 === 0 ? 'lead' : 'sub');

function fig(tr: Traits, costume: Costume, pose: Pose, o: Partial<FigureFrame> = {}): FigureFrame {
  return { id: 'x', x: 0, y: 0, z: 0, traits: tr, costume, pose, poseT: 0.3, phase: 0.2, facing: { back: false, flip: false }, selected: false, hurt: false, sleeping: false, walking: false, item: [90, 170, 230], ...o };
}

const alphaAt = (sp: Sprite, x: number, y: number) => (x < 0 || y < 0 || x >= sp.img.width || y >= sp.img.height ? 0 : sp.img.data[(y * sp.img.width + x) * 4 + 3]);

function hash(sp: Sprite): string {
  let h = 2166136261;
  const d = sp.img.data;
  for (let i = 0; i < d.length; i += 3) h = Math.imul(h ^ d[i], 16777619);
  return `${sp.img.width}x${sp.img.height}:${h >>> 0}`;
}

function borderClear(sp: Sprite): boolean {
  const { width: w, height: h } = sp.img;
  for (let x = 0; x < w; x++) if (alphaAt(sp, x, 0) || alphaAt(sp, x, h - 1)) return false;
  for (let y = 0; y < h; y++) if (alphaAt(sp, 0, y) || alphaAt(sp, w - 1, y)) return false;
  return true;
}

// Something drawn within `r` px round (x, y).
function inkNear(sp: Sprite, x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (alphaAt(sp, Math.round(x + dx), Math.round(y + dy)) > 0) return true;
  return false;
}

test('every pose, facing, species and costume gives a sane sprite', () => {
  clearSprites();
  const s = 4;
  let n = 0;
  for (const sp of SPECIES) {
    for (const co of COSTUMES) {
      for (const pose of POSES) {
        for (const [back, flip] of [[false, false], [true, false], [false, true], [true, true]] as const) {
          const f = fig(who(sp, n % 4), co, pose, { facing: { back, flip }, sleeping: pose === 'sleep', poseT: 0.3 + (n % 7) * 0.21 });
          n++;
          const what = `${sp}/${co}/${pose}/${back ? 'back' : 'front'}${flip ? '/flip' : ''}`;
          const spr = figureSprite(f, s, INK);
          const { width: w, height: h } = spr.img;
          assert.ok(Number.isInteger(spr.ax) && Number.isInteger(spr.ay), `${what}: whole-pixel anchor`);
          assert.ok(w >= 4 * s && w <= 22 * s + 6, `${what}: width ${w}`);
          assert.ok(h >= 6 * s && h <= 24 * s + 6, `${what}: height ${h}`);
          assert.ok(spr.ax > 0 && spr.ax < w, `${what}: anchor x inside`);
          assert.ok(spr.ay > h * 0.6 && spr.ay < h, `${what}: anchor y near the bottom`);
          assert.ok(inkNear(spr, spr.ax, spr.ay - 1.5 * s, 2.5 * s), `${what}: drawn round the anchor`);
          assert.ok(borderClear(spr), `${what}: clipped at the edge`);
          if (pose !== 'sleep') assert.ok(h - (h - spr.ay) >= 12 * s, `${what}: stands about 14 tall`);
        }
      }
    }
  }
});

test('sprites scale with s and stay unclipped when zoomed in', () => {
  const tr = who('human', 1);
  for (const pose of ['idle', 'carry', 'cheer', 'sleep', 'done'] as Pose[]) {
    const a = figureSprite(fig(tr, 'wizard', pose), 4, INK);
    const b = figureSprite(fig(tr, 'wizard', pose), 16, INK);
    const k = b.img.height / a.img.height;
    assert.ok(k > 3.3 && k < 4.6, `${pose}: height ratio ${k}`);
    assert.ok(borderClear(b), `${pose} at s=16`);
  }
});

test('blinks come every 3 to 5 seconds and change the eyes', () => {
  for (const phase of [0, 0.13, 0.5, 0.77, 0.99]) {
    const starts: number[] = [];
    let was = false;
    for (let t = 0; t < 40; t += 1 / 60) {
      const b = blinkAt(t, phase);
      if (b && !was) starts.push(t);
      was = b;
    }
    assert.ok(starts.length >= 7, `phase ${phase}: ${starts.length} blinks in 40 s`);
    for (let i = 1; i < starts.length; i++) {
      const gap = starts[i] - starts[i - 1];
      assert.ok(gap > 2.9 && gap < 5.1, `phase ${phase}: gap ${gap}`);
    }
  }
  // the same idle frame with and without a blink
  const tr = who('human', 2);
  const phase = 0.3;
  let open = -1;
  let shut = -1;
  for (let t = 0; t < 600 && (open < 0 || shut < 0); t += 1 / 120) {
    if (frameOf('idle', t, phase) !== 0) continue;
    if (blinkAt(t, phase)) shut = shut < 0 ? t : shut;
    else open = open < 0 ? t : open;
  }
  assert.ok(open >= 0 && shut >= 0);
  const a = figureSprite(fig(tr, 'casual', 'idle', { poseT: open, phase }), 8, INK);
  const b = figureSprite(fig(tr, 'casual', 'idle', { poseT: shut, phase }), 8, INK);
  assert.notEqual(hash(a), hash(b));
  let diff = 0;
  for (let i = 0; i < Math.min(a.img.data.length, b.img.data.length); i++) if (a.img.data[i] !== b.img.data[i]) diff++;
  assert.ok(diff > 0 && diff < a.img.data.length * 0.05, `a blink changes only the eyes (${diff})`);
});

test('the walk cycle has eight different frames, and gestures keep walking', () => {
  const tr = who('cat', 1);
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) * (LOOP.walk[0] / 8) + 10 * LOOP.walk[0];
    assert.equal(frameOf('walk', t, 0), i);
    seen.add(hash(figureSprite(fig(tr, 'casual', 'walk', { poseT: t, phase: 0, walking: true }), 6, INK)));
  }
  assert.equal(seen.size, 8);
  const legs = new Set<string>();
  for (let i = 0; i < 8; i++) legs.add(hash(figureSprite(fig(tr, 'casual', 'carry', { poseT: (i * LOOP.walk[0]) / 8, phase: 0, walking: true }), 6, INK)));
  assert.ok(legs.size >= 4, 'carrying on the move walks');
});

test('work poses animate', () => {
  const tr = who('human', 3);
  for (const pose of ['write', 'run', 'search', 'talk', 'cheer', 'dance', 'done', 'wave', 'pet'] as Pose[]) {
    const [per, n] = LOOP[pose];
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) seen.add(hash(figureSprite(fig(tr, 'scientist', pose, { poseT: (i * per) / n + 0.01, phase: 0 }), 5, INK)));
    assert.ok(seen.size >= Math.min(4, n - 1), `${pose}: ${seen.size} different frames`);
  }
});

test('cache hits return the same bitmap; the cache is bounded', () => {
  clearSprites();
  const f = fig(who('robot', 0), 'astronaut', 'idle');
  const a = figureSprite(f, 4, INK);
  const hits = spriteStats.hits;
  const b = figureSprite({ ...f }, 4.01, INK); // same eighth of a px per unit
  assert.equal(a, b);
  assert.equal(a.img, b.img);
  assert.equal(spriteStats.hits, hits + 1);
  const c = figureSprite(f, 4, '#112233'); // another world's ink
  assert.notEqual(a.img, c.img);
  const tr = who('human', 0);
  for (let i = 0; i < 700; i++) figureSprite(fig(tr, 'casual', POSES[i % POSES.length], { poseT: i * 0.37 }), 3 + (i % 9) * 0.125, INK);
  assert.ok(spriteCount() <= 600, `${spriteCount()} cached`);
});

test('a flipped sprite is the mirror image (outline for outline)', () => {
  for (const [sp, co, pose] of [['human', 'casual', 'wave'], ['cat', 'wizard', 'delegate'], ['ghost', 'raver', 'idle']] as const) {
    const tr = who(sp, 2);
    const a = figureSprite(fig(tr, co, pose), 6, INK);
    const b = figureSprite(fig(tr, co, pose, { facing: { back: false, flip: true } }), 6, INK);
    assert.equal(a.img.height, b.img.height);
    assert.equal(a.ay, b.ay);
    assert.ok(Math.abs(a.img.width - b.img.width) <= 1);
    let sum = 0;
    let n = 0;
    for (let y = 0; y < a.img.height; y++) {
      for (let dx = -a.ax; dx < a.img.width - a.ax; dx++) {
        sum += Math.abs(alphaAt(a, a.ax + dx, y) - alphaAt(b, b.ax - dx - 1, y));
        n++;
      }
    }
    assert.ok(sum / n < 1.5, `${sp}: mean alpha difference ${sum / n}`);
    // the shading is not mirrored: light stays upper left
    assert.notEqual(hash(a), hash(b));
  }
});

test('a carried block shows in its colour', () => {
  const spr = figureSprite(fig(who('human', 1), 'casual', 'carry', { item: [20, 200, 90] }), 8, INK);
  let found = false;
  const d = spr.img.data;
  for (let i = 0; i < d.length && !found; i += 4) if (d[i + 3] === 255 && Math.abs(d[i] - 20) < 6 && Math.abs(d[i + 1] - 200) < 6 && Math.abs(d[i + 2] - 90) < 6) found = true;
  assert.ok(found);
});

test('critters: every kind idles and moves, flips, and is anchored on the floor', () => {
  for (const kind of ['cat', 'rat', 'drone', 'slime', 'fox', 'imp'] as const) {
    const c: CritterFrame = { kind, body: [200, 120, 80], x: 0, y: 0, z: 0, flip: false, moving: false };
    const idle = new Set<string>();
    const move = new Set<string>();
    for (let i = 0; i < 8; i++) {
      idle.add(hash(critterSprite(c, i * 0.3 + 0.01, 6, INK)));
      move.add(hash(critterSprite({ ...c, moving: true }, i * 0.1 + 0.01, 6, INK)));
    }
    assert.ok(idle.size >= 3 && move.size >= 3, `${kind}: ${idle.size} idle, ${move.size} moving frames`);
    const a = critterSprite(c, 0.01, 6, INK);
    const b = critterSprite({ ...c, flip: true }, 0.01, 6, INK);
    assert.ok(borderClear(a) && borderClear(b));
    assert.ok(a.img.width >= 3 * 6 && a.img.width <= 10 * 6 + 6, `${kind}: width ${a.img.width}`);
    assert.ok(inkNear(a, a.ax, a.ay - 6, 12), `${kind}: drawn near the anchor`);
    assert.ok(Math.abs(a.img.width - b.img.width) <= 1);
  }
});

test('emotes pop in, overshoot, then bob; about five units across', () => {
  for (const e of EMOTES) {
    const s = 8;
    const early = emoteSprite(e, 0.01, s, INK);
    const pop = emoteSprite(e, 0.13, s, INK);
    const rest = emoteSprite(e, 1.0, s, INK);
    assert.ok(early.img.height < rest.img.height, `${e}: starts small`);
    assert.ok(pop.img.height > rest.img.height, `${e}: overshoots`);
    assert.ok(rest.img.width <= 6.5 * s && rest.img.height <= 7 * s, `${e}: ${rest.img.width}x${rest.img.height}`);
    assert.ok(Math.max(rest.img.width, rest.img.height) >= 3.5 * s, `${e}: big enough`);
    assert.ok(Math.abs(rest.ax - rest.img.width / 2) <= 0.8 * s, `${e}: centred on its anchor`);
    assert.ok(rest.ay >= rest.img.height - s, `${e}: anchored at the bottom`);
    const bob = new Set<string>();
    for (let t = 0.3; t < 2; t += 0.2) bob.add(hash(emoteSprite(e, t, s, INK)));
    assert.ok(bob.size >= 3, `${e}: bobs`);
    assert.ok(borderClear(rest));
  }
});

test('an uncached figure draws in a few ms at s = 4', () => {
  clearSprites();
  const tr = [who('human', 1), who('robot', 1), who('cat', 2), who('alien', 1), who('ghost', 1)];
  for (let i = 0; i < 20; i++) figureSprite(fig(tr[i % 5], COSTUMES[i % 6], POSES[i % 24], { poseT: i }), 4, INK);
  clearSprites();
  const t0 = performance.now();
  const n = 120;
  for (let i = 0; i < n; i++) figureSprite(fig(tr[i % 5], COSTUMES[i % 6], POSES[i % 24], { poseT: i * 0.13 }), 4, INK);
  const ms = (performance.now() - t0) / n;
  // the budget is 3 ms; generous here, the machine is shared
  assert.ok(ms < 9, `${ms.toFixed(2)} ms a figure`);
});

// A sprite drawn within bounds: a whole-pixel anchor near its feet, about a
// figure's size, a clear pixel all round.
function sane(spr: Sprite, s: number, what: string): void {
  const { width: w, height: h } = spr.img;
  assert.ok(Number.isInteger(spr.ax) && Number.isInteger(spr.ay), `${what}: whole-pixel anchor`);
  assert.ok(w >= 4 * s && w <= 22 * s + 6, `${what}: width ${w}`);
  assert.ok(h >= 6 * s && h <= 24 * s + 6, `${what}: height ${h}`);
  assert.ok(spr.ay > h * 0.6 && spr.ay < h, `${what}: anchor y near the bottom`);
  assert.ok(borderClear(spr), `${what}: clipped at the edge`);
}

const FEELS: ReadonlyArray<readonly [string, Feel]> = [
  ['drowsy', { drowsy: true, bandaged: false, bouncy: false }],
  ['bandaged', { drowsy: false, bandaged: true, bouncy: false }],
  ['bouncy', { drowsy: false, bandaged: false, bouncy: true }],
];

test('face states: drowsy eyes, a bandage, a grin, for every costume and species', () => {
  clearSprites();
  const s = 6;
  for (const sp of SPECIES) {
    for (const co of COSTUMES) {
      for (const back of [false, true]) {
        const facing = { back, flip: false };
        const base = figureSprite(fig(who(sp, 1), co, 'idle', { facing }), s, INK);
        const hooded = lookOf(who(sp, 1), co).hoodUp;
        for (const [name, feel] of FEELS) {
          const what = `${sp}/${co}/${name}${back ? '/back' : ''}`;
          const n = spriteCount();
          const spr = figureSprite(fig(who(sp, 1), co, 'idle', { facing, feel }), s, INK);
          sane(spr, s, what);
          if (back && (name !== 'bandaged' || hooded)) {
            // From behind only the bandage shows, and not under a hood: the
            // same sprite as without.
            assert.equal(spr, base, `${what}: shares the plain sprite`);
            continue;
          }
          assert.equal(spriteCount(), n + 1, `${what}: a sprite of its own`);
          assert.notEqual(hash(spr), hash(base), `${what}: looks different`);
          assert.equal(figureSprite(fig(who(sp, 1), co, 'idle', { facing, feel }), s, INK), spr, `${what}: cached`);
        }
      }
    }
  }
});

test('a face state changes the face, not the figure', () => {
  const tr = who('human', 2);
  const base = figureSprite(fig(tr, 'casual', 'idle'), 8, INK);
  for (const [name, feel] of FEELS) {
    const spr = figureSprite(fig(tr, 'casual', 'idle', { feel }), 8, INK);
    assert.equal(spr.img.width, base.img.width, name);
    assert.equal(spr.img.height, base.img.height, name);
    let diff = 0;
    for (let i = 0; i < spr.img.data.length; i++) if (spr.img.data[i] !== base.img.data[i]) diff++;
    assert.ok(diff > 0 && diff < spr.img.data.length * 0.06, `${name}: ${diff} bytes differ`);
  }
  // At work it is still tired: heavy eyes as it ponders.
  assert.notEqual(hash(figureSprite(fig(tr, 'casual', 'think', { feel: FEELS[0][1] }), 8, INK)), hash(figureSprite(fig(tr, 'casual', 'think'), 8, INK)));
  // The grin is for standing about and walking, not for work, nor asleep.
  assert.equal(figureSprite(fig(tr, 'casual', 'write', { feel: FEELS[2][1] }), 8, INK), figureSprite(fig(tr, 'casual', 'write'), 8, INK));
  assert.equal(figureSprite(fig(tr, 'casual', 'idle', { feel: FEELS[2][1], sleeping: true }), 8, INK), figureSprite(fig(tr, 'casual', 'idle', { sleeping: true }), 8, INK));
});

test('a plaster goes on under hats: from behind, none shows on a hood or a level hat', () => {
  const tr = who('human', 1);
  const behind = { facing: { back: true, flip: false } };
  for (const co of COSTUMES) {
    for (const wear of [undefined, WEARS[0][1]]) {
      const what = `${co}${wear ? ` in its ${PRIZES[co]}` : ''}`;
      const plain = figureSprite(fig(tr, co, 'idle', { ...behind, wear }), 6, INK);
      const band = figureSprite(fig(tr, co, 'idle', { ...behind, wear, feel: FEELS[1][1] }), 6, INK);
      // The hood is up in the den; a level's hat goes on in every world
      // (on a space helmet it is an antenna, the head bare under the glass).
      const covered = wear ? co !== 'astronaut' : lookOf(tr, co).hoodUp;
      if (covered) assert.equal(band, plain, `${what}: no plaster over it`);
      else assert.notEqual(hash(band), hash(plain), `${what}: the plaster shows`);
      // From the front it is on its cheek, whatever it wears.
      assert.notEqual(hash(figureSprite(fig(tr, co, 'idle', { wear, feel: FEELS[1][1] }), 6, INK)), hash(figureSprite(fig(tr, co, 'idle', { wear }), 6, INK)), `${what}: on its cheek`);
    }
  }
  // Carrying a block on its head, it has its hat off: the plaster shows.
  const carry = (feel?: Feel) => figureSprite(fig(tr, 'casual', 'carry', { ...behind, wear: WEARS[0][1], feel }), 6, INK);
  assert.notEqual(hash(carry(FEELS[1][1])), hash(carry()));
});

// Whether two sprites are the same picture, pixel for pixel.
const samePixels = (a: Sprite, b: Sprite) =>
  a.ax === b.ax && a.ay === b.ay && a.img.width === b.img.width && a.img.height === b.img.height && a.img.data.every((v, k) => v === b.img.data[k]);

// A sprite's key that changes while its pixels do not costs a redraw and a
// send to the terminal for nothing; one that stays while they change shows
// the wrong picture. So, for each face state and every frame of every
// pose: a sprite of its own exactly where it changes what is drawn.
test('a face state gets a sprite of its own in every frame of every pose where it shows, and nowhere else', () => {
  const s = 4;
  const cases: Array<[string, Traits, Costume, Wear | undefined, boolean, ReadonlyArray<readonly [string, Feel]>]> = [
    ['human in a beanie', who('human', 1), 'casual', WEARS[0][1], false, FEELS],
    ['human in a beanie, from behind', who('human', 1), 'casual', WEARS[0][1], true, [FEELS[1]]],
    ['hooded human, from behind', who('human', 1), 'hacker', undefined, true, [FEELS[1]]],
    ['robot', who('robot', 1), 'scientist', undefined, false, [FEELS[0]]],
    ['alien', who('alien', 2), 'casual', undefined, false, [FEELS[0]]],
  ];
  const shows = new Map<string, number>();
  for (const [name, tr, co, wear, back, feels] of cases) {
    for (const pose of POSES) {
      const [per, n] = LOOP[pose];
      // Asleep in a few poses, and hurt where it shows.
      const states: Array<Partial<FigureFrame>> = [{}];
      if (pose === 'sleep' || pose === 'sit' || pose === 'idle') states.push({ sleeping: true });
      if (pose === 'idle' || pose === 'walk') states.push({ hurt: true });
      for (let i = 0; i < n; i++) {
        for (const st of states) {
          // Mid-frame, so early frames blink.
          const o = { ...st, wear, facing: { back, flip: false }, poseT: ((i + 0.5) * per) / n, phase: 0 };
          clearSprites();
          const plain = figureSprite(fig(tr, co, pose, o), s, INK);
          for (const [state, feel] of feels) {
            const what = `${name}/${pose}/${i}${st.sleeping ? '/asleep' : ''}${st.hurt ? '/hurt' : ''}/${state}`;
            const m = spriteStats.misses;
            let spr = figureSprite(fig(tr, co, pose, { ...o, feel }), s, INK);
            const own = spriteStats.misses > m;
            if (!own) {
              // The same key: drawn afresh, it must be the same picture.
              clearSprites();
              spr = figureSprite(fig(tr, co, pose, { ...o, feel }), s, INK);
            }
            assert.equal(!samePixels(spr, plain), own, `${what}: ${own ? 'a key of its own, the same pixels' : 'the plain key, other pixels'}`);
            if (own) shows.set(state, (shows.get(state) ?? 0) + 1);
          }
        }
      }
    }
  }
  // Tired, it shows at work too (eyes down at a desk), not only standing
  // about; the grin in every frame of standing about and walking.
  assert.ok(shows.get('drowsy')! > 300, `drowsy in ${shows.get('drowsy')} frames`);
  assert.ok(shows.get('bandaged')! > 240, `bandaged in ${shows.get('bandaged')} frames`);
  assert.equal(shows.get('bouncy'), LOOP.idle[1] + LOOP.walk[1]);
  const tr = who('human', 1);
  for (const pose of ['write', 'read', 'web', 'place'] as Pose[]) {
    assert.notEqual(hash(figureSprite(fig(tr, 'casual', pose, { feel: FEELS[0][1], poseT: 0.4 }), s, INK)), hash(figureSprite(fig(tr, 'casual', pose, { poseT: 0.4 }), s, INK)), `${pose}: drowsy at work`);
  }
});

// The same for a blink: in every frame of every pose, each species facing
// us or turned away, a sprite of its own exactly where the blink shows.
test('a blink gets a sprite of its own in every frame of every pose where it shows, and nowhere else', () => {
  const s = 4;
  const phase = 0.3;
  const costumes: Record<Species, Costume> = { human: 'casual', robot: 'scientist', cat: 'wizard', alien: 'astronaut', ghost: 'raver' };
  // A moment in each frame of each pose with the eyes open, and one with them shut.
  const moments = new Map<string, [number, number]>();
  for (const pose of POSES) {
    const [per, n] = LOOP[pose];
    for (let i = 0; i < n; i++) {
      let open = -1;
      let shut = -1;
      for (let k = 0; k < 400_000 && (open < 0 || shut < 0); k++) {
        // Eight moments through frame i, then the same a loop later, and so on.
        const t = ((k >> 3) + 1 + (i + ((k & 7) + 0.5) / 8) / n - phase * 0.618) * per;
        if (frameOf(pose, t, phase) !== i) continue;
        if (blinkAt(t, phase)) shut = shut < 0 ? t : shut;
        else open = open < 0 ? t : open;
      }
      assert.ok(open >= 0 && shut >= 0, `${pose}/${i}: no blink found`);
      moments.set(`${pose}/${i}`, [open, shut]);
    }
  }
  const shows = new Map<string, number>();
  const wrong: string[] = [];
  for (const sp of SPECIES) {
    for (const back of [false, true]) {
      for (const pose of POSES) {
        for (let i = 0; i < LOOP[pose][1]; i++) {
          const [open, shut] = moments.get(`${pose}/${i}`)!;
          const o = { facing: { back, flip: false }, phase, sleeping: pose === 'sleep' };
          const as = `${sp}${back ? '/back' : ''}`;
          const what = `${as}/${pose}/${i}`;
          clearSprites();
          const plain = figureSprite(fig(who(sp, 1), costumes[sp], pose, { ...o, poseT: open }), s, INK);
          const m = spriteStats.misses;
          let blink = figureSprite(fig(who(sp, 1), costumes[sp], pose, { ...o, poseT: shut }), s, INK);
          const own = spriteStats.misses > m;
          if (!own) {
            clearSprites();
            blink = figureSprite(fig(who(sp, 1), costumes[sp], pose, { ...o, poseT: shut }), s, INK);
          }
          if (!samePixels(blink, plain) !== own) wrong.push(`${what}: ${own ? 'a key of its own, the same pixels' : 'the plain key, other pixels'}`);
          else if (own) shows.set(as, (shows.get(as) ?? 0) + 1);
        }
      }
    }
  }
  assert.deepEqual(wrong, []);
  // Facing us, every species blinks standing about and at work; from behind, none.
  for (const sp of SPECIES) {
    assert.ok(shows.get(sp)! > 80, `${sp} blinks in ${shows.get(sp)} frames`);
    assert.equal(shows.get(`${sp}/back`), undefined, `${sp} blinks from behind`);
  }
});


const NONE: Wear = { hat: false, badge: false, outfit: false, aura: false };
const WEARS: ReadonlyArray<readonly [string, Wear]> = [
  ['hat', { ...NONE, hat: true }],
  ['badge', { ...NONE, badge: true }],
  ['outfit', { ...NONE, outfit: true }],
  ['aura', { ...NONE, aura: true }],
  ['all', { hat: true, badge: true, outfit: true, aura: true }],
];

test('cosmetics: every costume and species wears each unlock, both ways round, within bounds', () => {
  clearSprites();
  const s = 5;
  for (const sp of SPECIES) {
    for (const co of COSTUMES) {
      for (const pose of ['idle', 'done', 'cheer', 'sleep'] as Pose[]) {
        for (const back of [false, true]) {
          const o = { facing: { back, flip: back }, sleeping: pose === 'sleep', poseT: 0.45 };
          const plain = figureSprite(fig(who(sp, 2), co, pose, o), s, INK);
          for (const [name, wear] of WEARS) {
            const what = `${sp}/${co}/${pose}/${name}${back ? '/back' : ''}`;
            const spr = figureSprite(fig(who(sp, 2), co, pose, { ...o, wear }), s, INK);
            sane(spr, s, what);
            // A badge is pinned on the front: from behind it does not show,
            // and a sleeper's arms may cover it. Everything else shows.
            if (name === 'badge' && back && pose !== 'sleep') assert.equal(hash(spr), hash(plain), what);
            else if (!(name === 'badge' && pose === 'sleep')) assert.notEqual(hash(spr), hash(plain), `${what}: shows`);
            assert.equal(figureSprite(fig(who(sp, 2), co, pose, { ...o, wear }), s, INK), spr, `${what}: cached`);
          }
        }
      }
    }
  }
});

// How high a sprite reaches over its anchor, units.
function heightOf(sp: Sprite, s: number): number {
  const { width: w, height: h, data } = sp.img;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 0) return (sp.ay - y) / s;
  return 0;
}

test("each world's costume has its own hat, on top of the head, as high as figureTop says", () => {
  const tr = who('human', 1);
  const hats = new Set<string>();
  for (const co of COSTUMES) {
    const what = `${co}: the ${PRIZES[co]}`;
    const plain = figureSprite(fig(tr, co, 'idle'), 6, INK);
    const hat = figureSprite(fig(tr, co, 'idle', { wear: WEARS[0][1] }), 6, INK);
    assert.notEqual(hash(hat), hash(plain), `${what} shows`);
    assert.ok(hat.ay > plain.ay, `${what} stands above the head (${hat.ay} vs ${plain.ay})`);
    hats.add(PRIZES[co]);
    // Labels and emotes go over figureTop: no hat (nor a wizard's own)
    // reaches past it on any species, standing about, walking or at work,
    // and the tallest comes within a unit of it.
    for (const wear of co === 'wizard' ? [undefined, WEARS[0][1]] : [WEARS[0][1]]) {
      let most = 0;
      for (const sp of SPECIES) {
        for (const pose of ['idle', 'walk', 'write', 'think'] as Pose[]) {
          for (const s of [3, 16]) {
            for (const back of [false, true]) {
              const g = fig(who(sp, 0), co, pose, { wear, facing: { back, flip: false } });
              const h = heightOf(figureSprite(g, s, INK), s);
              assert.ok(h <= figureTop(g), `${what}: ${sp} ${pose} at ${s} reaches ${h}, past ${figureTop(g)}`);
              most = Math.max(most, h);
            }
          }
        }
      }
      const top = figureTop({ costume: co, wear });
      assert.ok(most > top - 1, `${co}${wear ? ` in its ${PRIZES[co]}` : ''}: ${most} at most, under ${top}`);
    }
  }
  assert.equal(hats.size, COSTUMES.length);
});

test('the hat takes the place of a lamp, a beret or a hood; a headset stays under it', () => {
  const lamp = traitsFor('x', 'sub', 'Explore');
  assert.equal(lamp.accessory, 'lamp');
  const L = lookOf(lamp, 'wizard', WEARS[0][1]);
  assert.equal(L.prize, 'grand');
  assert.equal(L.acc, 'none');
  const hood = lookOf(traitsFor('y', 'sub', 'security-reviewer'), 'hacker', WEARS[0][1]);
  assert.equal(hood.hoodUp, false);
  assert.equal(hood.prize, 'cap');
  const lead = lookOf(traitsFor('z', 'lead'), 'casual', WEARS[0][1]);
  assert.equal(lead.acc, 'headset');
  assert.equal(lookOf(lamp, 'wizard').prize, null, 'no hat before ★2');
});

// Pixels of a colour (within a few levels) in a sprite, where it is
// opaque or nearly (a ghost is drawn see-through; the pixels are
// premultiplied).
function pixelsOf(sp: Sprite, color: string): number {
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16));
  const d = sp.img.data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a >= 200 && Math.abs((d[i] * 255) / a - r) < 8 && Math.abs((d[i + 1] * 255) / a - g) < 8 && Math.abs((d[i + 2] * 255) / a - b) < 8) n++;
  }
  return n;
}

test('the outfit swap puts the main garment in the trim\'s hue and the old colour in the trim', () => {
  const s = 8;
  const swap = (tr: Traits, co: Costume) => {
    const was = lookOf(tr, co);
    const now = lookOf(tr, co, WEARS[2][1]);
    const plain = figureSprite(fig(tr, co, 'idle'), s, INK);
    const dressed = figureSprite(fig(tr, co, 'idle', { wear: WEARS[2][1] }), s, INK);
    return { was, now, plain, dressed };
  };
  for (const co of COSTUMES) {
    const { was, now, plain, dressed } = swap(who('human', 0), co);
    assert.ok(pixelsOf(dressed, now.top) > pixelsOf(plain, now.top) + 4 * s * s, `${co}: the main garment in its new colour`);
    assert.ok(pixelsOf(dressed, was.top) < pixelsOf(plain, was.top) / 2, `${co}: little of the old colour left on it`);
    assert.equal(now.trim, hexOf(who('human', 0).shirt), `${co}: the old shirt colour for the trim`);
  }
  // A ghost's sheet takes a pastel, its trim gold.
  const { was, now, plain, dressed } = swap(who('ghost', 0), 'casual');
  assert.ok(pixelsOf(dressed, now.top) > 4 * s * s && pixelsOf(dressed, was.top) < pixelsOf(plain, was.top) / 2, 'a sheet takes a pastel');
  assert.equal(now.trim, GOLD);
});

test('a figure with every cosmetic and face state draws within the figure budget, at most twice as long as a plain one', () => {
  const tr = [who('human', 1), who('robot', 1), who('cat', 2), who('alien', 1), who('ghost', 1)];
  const all = { wear: WEARS[4][1], feel: { drowsy: true, bandaged: true, bouncy: true } };
  // Uncached each time: the cache is emptied at the start of every run.
  budget(
    'figure with cosmetics',
    (i) => {
      if (i === 0) clearSprites();
      figureSprite(fig(tr[i % 5], COSTUMES[i % 6], POSES[i % 24], { poseT: i * 0.13, ...all }), 4, INK);
    },
    3,
    { calls: 48 },
  );
  // Zoomed in, where the aura's glow covers the most pixels: timed in
  // turns with plain figures, the best of several runs each, so a busy
  // machine slows both alike.
  const run = (o: Partial<FigureFrame>) => {
    clearSprites();
    const t = performance.now();
    for (let i = 0; i < 24; i++) figureSprite(fig(tr[i % 5], COSTUMES[i % 6], POSES[i % 24], { poseT: i * 0.13, ...o }), 16, INK);
    return performance.now() - t;
  };
  let plain = Infinity;
  let dressed = Infinity;
  for (let k = 0; k < 7; k++) {
    plain = Math.min(plain, run({}));
    dressed = Math.min(dressed, run(all));
  }
  assert.ok(dressed <= 2 * plain, `dressed ${(dressed / 24).toFixed(2)} ms a figure, plain ${(plain / 24).toFixed(2)} ms`);
});


test("desk upgrades: a plant, a mug on a stool and a trophy, standing on their foot, in their owner's colour", () => {
  for (const kind of ['plant', 'mug', 'trophy'] as const) {
    for (const s of [3, 6, 14]) {
      const spr = trinketSprite(kind, [200, 40, 160], s, INK);
      const { width: w, height: h } = spr.img;
      assert.ok(borderClear(spr), `${kind} at ${s}: clipped`);
      assert.ok(h >= 4 * s && h <= 7 * s + 6, `${kind} at ${s}: height ${h}`);
      assert.ok(w >= 2 * s && w <= 6 * s + 6, `${kind} at ${s}: width ${w}`);
      let foot = false;
      for (let x = 0; x < w && !foot; x++) foot = alphaAt(spr, x, spr.ay - 1) > 0;
      assert.ok(h - spr.ay <= s + 3 && foot, `${kind} at ${s}: standing on its anchor`);
      assert.equal(trinketSprite(kind, [200, 40, 160], s, INK), spr, 'cached');
    }
    const a = trinketSprite(kind, [200, 40, 160], 8, INK);
    const b = trinketSprite(kind, [40, 200, 90], 8, INK);
    assert.notEqual(hash(a), hash(b), `${kind}: in its owner's colour`);
    let found = false;
    for (let i = 0; i < a.img.data.length && !found; i += 4) if (a.img.data[i + 3] === 255 && Math.abs(a.img.data[i] - 200) < 8 && Math.abs(a.img.data[i + 1] - 40) < 8 && Math.abs(a.img.data[i + 2] - 160) < 8) found = true;
    assert.ok(found, `${kind}: the colour shows`);
  }
});
