import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearSprites, critterSprite, emoteSprite, figureSprite, spriteCount, spriteStats, trinketSprite, type Sprite } from '../src/art/figure.ts';
import { CLOAK, COAT, CREAM, FUR, GOLD, IRON, LEATHER, PRIZES, RAG, SHIRT, SLATE, STRIPE, SUIT_TEAL, TROUSERS, lookOf } from '../src/art/figure/look.ts';
import { CLOTHES, STARTUP } from '../src/art/figure/look.ts';
import { blinkAt, frameOf, LOOP, MUG_POSES } from '../src/art/figure/rig.ts';
import { traitsFor, type Costume, type Emote, type Feel, type Pose, type Species, type Traits, type Wear } from '../src/world/character.ts';
import { hexOf, mix, rgbOf } from '../src/art/iso.ts';
import { budget } from './helpers.ts';
import type { CritterFrame, FigureFrame } from '../src/world/frame.ts';
import { figureTop } from '../src/world/frame.ts';

const INK = '#2b2233';
const POSES = Object.keys(LOOP) as Pose[];
const SPECIES: Species[] = ['human', 'robot', 'cat', 'alien', 'ghost'];
const COSTUMES: Costume[] = ['casual', 'wizard', 'scientist', 'raver', 'hacker', 'astronaut', 'drifter', 'nord', 'exosuit', 'jumpsuit', 'colonist', 'miner', 'forager', 'parka', 'guard', 'demon', 'startup'];
const EMOTES: Emote[] = ['excl', 'question', 'heart', 'note', 'idea', 'sweat', 'zzz', 'anger', 'star', 'cup', 'speech'];
// The game worlds' costumes: the outpost, the longhall, the base, the
// shelter and the colony.
const GAME: Costume[] = ['drifter', 'nord', 'exosuit', 'jumpsuit', 'colonist'];
// The setting worlds' costumes: the mines, the caverns, the snows, the
// vault and hell.
const SETTING: Costume[] = ['miner', 'forager', 'parka', 'guard', 'demon'];

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
  for (const kind of ['cat', 'rat', 'drone', 'slime', 'fox', 'imp', 'beetle', 'hopper', 'husky', 'corgi'] as const) {
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
  for (let i = 0; i < 20; i++) figureSprite(fig(tr[i % 5], COSTUMES[i % COSTUMES.length], POSES[i % 24], { poseT: i }), 4, INK);
  clearSprites();
  const t0 = performance.now();
  const n = 120;
  for (let i = 0; i < n; i++) figureSprite(fig(tr[i % 5], COSTUMES[i % COSTUMES.length], POSES[i % 24], { poseT: i * 0.13 }), 4, INK);
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

// The poses it stands about, walks or works in: not a hop for joy ('done',
// 'cheer'), up on its toes for a stretch, a block carried on its head (its
// hat off) or lying asleep. Its label stays put over these.
const UPRIGHT = POSES.filter((p) => !['done', 'cheer', 'stretch', 'carry', 'sleep'].includes(p));

// A moment in each frame of a pose's loop, for a character at `phase`.
function everyFrame(pose: Pose, phase: number): number[] {
  const [per, n] = LOOP[pose];
  return Array.from({ length: n }, (_, i) => {
    const t = ((((i + 0.5) / n - phase * 0.618) % 1) + 1) % 1 * per;
    assert.equal(frameOf(pose, t, phase), i, `${pose} at phase ${phase}: frame ${i}`);
    return t;
  });
}

test("each world's costume has its own hat, on top of the head, as high as figureTop says", () => {
  const tr = who('human', 1);
  const hats = new Set<string>();
  COSTUMES.forEach((co, c) => {
    const what = `${co}: the ${PRIZES[co]}`;
    const plain = figureSprite(fig(tr, co, 'idle'), 6, INK);
    const hat = figureSprite(fig(tr, co, 'idle', { wear: WEARS[0][1] }), 6, INK);
    assert.notEqual(hash(hat), hash(plain), `${what} shows`);
    assert.ok(hat.ay > plain.ay, `${what} stands above the head (${hat.ay} vs ${plain.ay})`);
    hats.add(PRIZES[co]);
    // Labels and emotes go over figureTop: no hat (nor a wizard's own)
    // reaches past it on any species, standing about, walking or at work,
    // and the tallest comes within a unit of it. A ghost floats over the
    // same frames as the rest, rising and falling: on it, every frame of
    // every such pose (at a phase of its own); on the rest, and zoomed in,
    // a frame of each of a few.
    const phase = (c * 0.37) % 1;
    for (const wear of co === 'wizard' ? [undefined, WEARS[0][1]] : [WEARS[0][1]]) {
      let most = 0;
      const check = (g: FigureFrame, s: number) => {
        const h = heightOf(figureSprite(g, s, INK), s);
        assert.ok(h <= figureTop(g), `${what}: ${g.traits.species} ${g.pose} at ${g.poseT.toFixed(2)} s${g.facing.back ? ' from behind' : ''} at ${s} reaches ${h}, past ${figureTop(g)}`);
        most = Math.max(most, h);
      };
      for (const sp of SPECIES) {
        for (const back of [false, true]) {
          const facing = { back, flip: false };
          if (sp === 'ghost') for (const pose of UPRIGHT) for (const poseT of everyFrame(pose, phase)) check(fig(who(sp, 0), co, pose, { wear, poseT, phase, facing }), 3);
          for (const pose of ['idle', 'walk', 'write', 'think'] as Pose[]) for (const s of [3, 16]) check(fig(who(sp, 0), co, pose, { wear, facing }), s);
        }
      }
      const top = figureTop({ costume: co, wear });
      assert.ok(most > top - 1, `${co}${wear ? ` in its ${PRIZES[co]}` : ''}: ${most} at most, under ${top}`);
    }
  });
  assert.equal(hats.size, COSTUMES.length);
});

// Each row of a sprite: the first and last pixel drawn in it, or null.
function spans(sp: Sprite): Array<[number, number] | null> {
  return Array.from({ length: sp.img.height }, (_, y) => {
    let a = -1;
    let b = -1;
    for (let x = 0; x < sp.img.width; x++) if (alphaAt(sp, x, y) > 0) [a, b] = [a < 0 ? x : a, x];
    return a < 0 ? null : [a, b];
  });
}

// How wide a sprite is at its widest, units, in rows from `y0` to `y1` px.
function widest(sp: Sprite, s: number, y0: number, y1: number): number {
  return Math.max(0, ...spans(sp).slice(Math.max(0, y0), y1).map((r) => (r ? r[1] - r[0] + 1 : 0))) / s;
}

// Pixels of a colour in the rows of a sprite from `y0` to `y1` px, in
// square units.
function areaOf(sp: Sprite, s: number, color: string, y0 = 0, y1 = sp.img.height): number {
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(y1, sp.img.height); y++) for (let x = 0; x < sp.img.width; x++) if (isColor(sp, x, y, color)) n++;
  return n / (s * s);
}

// The colour a species' eyes are drawn in, facing us (an alien's are
// glossy black whatever its traits).
const eyeOf = (tr: Traits) => (tr.species === 'alien' ? '#16131c' : lookOf(tr, 'casual').eye);

test("the game worlds' hats: a straw cone and a cowboy hat with wide brims, a rounded iron helm, a helmet with its visor up, a newsboy cap", () => {
  const s = 8;
  const hat = WEARS[0][1];
  for (const sp of SPECIES) {
    for (const back of [false, true]) {
      const facing = { back, flip: false };
      const what = `${sp}${back ? ' from behind' : ''}`;
      const tr = who(sp, 1);
      const at = (co: Costume, wear?: Wear) => figureSprite(fig(tr, co, 'idle', { wear, facing }), s, INK);
      // The rows over the head, from the brow up (the shoulders and a nord's
      // fur mantle are lower).
      const over = (spr: Sprite) => spr.ay - Math.round(10.5 * s);
      // Over the top half of the head a brim is wider than the head (and
      // its hair) anywhere.
      const head = widest(at('drifter'), s, 0, at('drifter').ay - Math.round(8.5 * s));
      for (const co of ['drifter', 'colonist'] as Costume[]) {
        const spr = at(co, hat);
        const brim = widest(spr, s, 0, spr.ay - Math.round(11.5 * s));
        assert.ok(brim > head + 0.5 && brim >= 10.5, `${what}: the ${PRIZES[co]} is ${brim} across, the head ${head}`);
      }
      // The straw hat is a shallow cone: it comes to a point (an alien's
      // antennae poke out over it), in straw, its weave in rings.
      const straw = at('drifter', hat);
      const tip = spans(straw).findIndex((r) => r);
      const wide = widest(straw, s, 0, straw.ay - Math.round(11.5 * s));
      if (sp !== 'alien') assert.ok(widest(straw, s, tip, tip + s) < 0.4 * wide, `${what}: the straw hat is ${widest(straw, s, tip, tip + s)} across a unit under its top, ${wide} at the brim`);
      assert.ok(areaOf(straw, s, '#d9b25e', 0, over(straw)) >= 6, `${what}: ${areaOf(straw, s, '#d9b25e', 0, over(straw))} square units of straw`);
      // The cowboy hat: tan felt and its dark band.
      const cowboy = at('colonist', hat);
      assert.ok(areaOf(cowboy, s, '#c49a63', 0, over(cowboy)) >= 4, `${what}: ${areaOf(cowboy, s, '#c49a63', 0, over(cowboy))} square units of felt`);
      assert.ok(areaOf(cowboy, s, '#3b2a20', 0, over(cowboy)) >= 0.5, `${what}: ${areaOf(cowboy, s, '#3b2a20', 0, over(cowboy))} square units of band`);
      // A helm is rounded, narrowing to its top: no horns stand up off it;
      // a fur rim at the brow.
      const helm = at('nord', hat);
      const top = spans(helm).findIndex((r) => r);
      const band = widest(helm, s, 0, helm.ay - Math.round(11.5 * s));
      const crown = widest(helm, s, top, top + 2 * s);
      assert.ok(crown < 0.9 * band, `${what}: the helm is ${crown} across at the top, ${band} at the brow`);
      assert.ok(areaOf(helm, s, '#8e908c', 0, over(helm)) >= 4, `${what}: ${areaOf(helm, s, '#8e908c', 0, over(helm))} square units of iron`);
      assert.ok(areaOf(helm, s, FUR, 0, over(helm)) >= 1, `${what}: ${areaOf(helm, s, FUR, 0, over(helm))} square units of fur rim`);
      // A helmet in the suit's colour (see below), its visor raised over
      // the brow, a disc in the second colour at its side.
      const visor = at('exosuit', hat);
      const L = lookOf(tr, 'exosuit', hat);
      assert.ok(areaOf(visor, s, L.hat, 0, over(visor)) >= 4, `${what}: ${areaOf(visor, s, L.hat, 0, over(visor))} square units of the helmet's ${L.hat}`);
      if (!back) assert.ok(areaOf(visor, s, '#1e2a4a', 0, over(visor)) >= 2, `${what}: ${areaOf(visor, s, '#1e2a4a', 0, over(visor))} square units of visor`);
      if (sp !== 'ghost') assert.ok(areaOf(visor, s, L.accent, 0, over(visor)) >= 0.2, `${what}: ${areaOf(visor, s, L.accent, 0, over(visor))} square units of the side disc's ${L.accent}`);
      // A newsboy cap of rust tweed.
      const cap = at('jumpsuit', hat);
      assert.ok(areaOf(cap, s, '#8a5a3c', 0, over(cap)) >= 5, `${what}: ${areaOf(cap, s, '#8a5a3c', 0, over(cap))} square units of tweed`);
      // Worn at the brow, none hides the eyes (seen without glasses).
      if (!back) {
        const bare: Traits = { ...tr, accessory: 'none' };
        const eyes = (co: Costume, wear?: Wear) => pixelsOf(figureSprite(fig(bare, co, 'idle', { wear, facing }), s, INK), eyeOf(bare));
        for (const co of GAME) {
          const [a, b] = [eyes(co, hat), eyes(co)];
          assert.ok(b > s && a >= 0.85 * b, `${what}: ${a} pixels of eye under the ${PRIZES[co]}, ${b} without`);
        }
      }
    }
  }
});

test("an exosuit's helmet takes the suit's colour, in its other colours too (★8); a ghost's, its own", () => {
  for (const sp of SPECIES) {
    for (const wear of [WEARS[0][1], { ...WEARS[0][1], outfit: true }]) {
      const L = lookOf(who(sp, 1), 'exosuit', wear);
      const what = `${sp}${wear.outfit ? ' (★8)' : ''}`;
      if (sp === 'ghost') assert.equal(L.hat, L.color, what);
      else assert.equal(L.hat, L.top, what);
    }
  }
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

// Whether a sprite's pixel is of a colour (within a few levels), opaque or
// nearly (a ghost is drawn see-through; the pixels are premultiplied).
function isColor(sp: Sprite, x: number, y: number, color: string): boolean {
  if (x < 0 || y < 0 || x >= sp.img.width || y >= sp.img.height) return false;
  const d = sp.img.data;
  const i = (y * sp.img.width + x) * 4;
  const a = d[i + 3];
  return a >= 200 && rgbOf(color).every((v, k) => Math.abs((d[i + k] * 255) / a - v) < 8);
}

// Pixels of a colour in a sprite.
function pixelsOf(sp: Sprite, color: string): number {
  let n = 0;
  for (let y = 0; y < sp.img.height; y++) for (let x = 0; x < sp.img.width; x++) if (isColor(sp, x, y, color)) n++;
  return n;
}

// A lead wears a headset, and it shows whatever goes on its head: its
// cup over a level's hat, a helmet's shell included, from in front and
// from behind (under a space helmet's glass it is tinted: not counted).
test("a lead's headset shows on every costume, with its level's hat or without, both ways round", () => {
  const s = 8;
  const leads = new Map<Species, Traits>();
  for (let i = 0; leads.size < SPECIES.length; i++) {
    const tr = traitsFor(`lead-${i}`, 'lead');
    if (!leads.has(tr.species)) leads.set(tr.species, tr);
  }
  // Pixels of the headset's dark grey above the shoulders.
  const grey = (spr: Sprite) => {
    let n = 0;
    for (let y = 0; y < spr.ay - 8.5 * s; y++) for (let x = 0; x < spr.img.width; x++) if (isColor(spr, x, y, '#3c3a48')) n++;
    return n / (s * s);
  };
  for (const co of COSTUMES) {
    if (co === 'astronaut') continue;
    for (const [sp, tr] of leads) {
      for (const back of [false, true]) {
        for (const wear of [undefined, WEARS[0][1]]) {
          const o = { wear, facing: { back, flip: false } };
          const bare: Traits = { ...tr, accessory: 'none' };
          const shows: number = grey(figureSprite(fig(tr, co, 'idle', o), s, INK)) - grey(figureSprite(fig(bare, co, 'idle', o), s, INK));
          assert.ok(shows >= 0.3, `${sp} in ${co}${wear ? ` and its ${PRIZES[co]}` : ''}${back ? ' from behind' : ''}: ${shows.toFixed(2)} square units of headset`);
        }
      }
    }
  }
});

test("the game worlds' costumes dress every species in clothes of their own, front and back", () => {
  for (const sp of SPECIES) {
    for (const back of [false, true]) {
      const looks = new Map(COSTUMES.map((co) => [co, hash(figureSprite(fig(who(sp, 1), co, 'idle', { facing: { back, flip: false } }), 6, INK))]));
      for (const co of GAME) {
        for (const other of COSTUMES) if (other !== co) assert.notEqual(looks.get(co), looks.get(other), `${sp}${back ? ' from behind' : ''}: ${co} looks like ${other}`);
      }
    }
  }
});

test('each outfit shows what it is made of: a rawhide coat strapped shut over rag-wrapped forearms, wolf-grey fur and an iron buckle, a slate harness and plates in a second colour, a wide orange placket on teal with leather cuffs, a cream shirt under a duster over slate trousers', () => {
  const s = 8;
  for (const sp of ['human', 'robot', 'cat', 'alien'] as Species[]) {
    for (const back of [false, true]) {
      const tr = who(sp, 1);
      const what = (co: Costume) => `${sp} ${co}${back ? ' from behind' : ''}`;
      const at = (co: Costume) => figureSprite(fig(tr, co, 'idle', { facing: { back, flip: false } }), s, INK);
      // Square units of each colour, at least.
      const marks: ReadonlyArray<readonly [Costume, string, number]> = [
        ['drifter', COAT, 8],
        ['drifter', RAG, 0.6],
        ['drifter', LEATHER, 1.5],
        ['nord', FUR, 1.5],
        ...(back ? [] : [['nord', IRON, 0.3] as const]),
        ['exosuit', SLATE, 1.5],
        ['exosuit', lookOf(tr, 'exosuit').accent, back ? 1 : 3],
        ['exosuit', lookOf(tr, 'exosuit').top, 2.5],
        ...(back ? [] : [['jumpsuit', STRIPE, 3] as const]),
        ['jumpsuit', SUIT_TEAL, 8],
        ['jumpsuit', LEATHER, 0.4],
        ...(back ? [] : [['colonist', SHIRT, 1] as const, ['colonist', TROUSERS, 0.2] as const]),
      ];
      for (const [co, color, least] of marks) {
        const a = areaOf(at(co), s, color);
        assert.ok(a >= least, `${what(co)}: ${a.toFixed(2)} square units of ${color}`);
      }
      // A one-piece exosuit: no white legs.
      const exo = at('exosuit');
      assert.equal(areaOf(exo, s, '#eef1f5', exo.ay - Math.round(3.4 * s)), 0, `${what('exosuit')}: white legs`);
    }
  }
});

// From behind, an exosuit's harness straps run down its back to the belt
// and stop; a ghost's sheet has none (on the white, straps crossed by the
// belt read as a cross upside down).
test("an exosuit's harness runs down its back to its belt and stops there, and a ghost's sheet has none", () => {
  const s = 8;
  for (const sp of SPECIES) {
    const spr = figureSprite(fig(who(sp, 1), 'exosuit', 'idle', { facing: { back: true, flip: false } }), s, INK);
    // Each row's pixels of the dark grey down the middle (the gloves are
    // off to the sides): the belt runs across, the straps are narrow bands.
    const n: number[] = [];
    for (let y = 0; y < spr.img.height; y++) {
      let k = 0;
      for (let x = spr.ax - Math.round(1.2 * s); x <= spr.ax + Math.round(1.2 * s); x++) if (isColor(spr, x, y, SLATE)) k++;
      n.push(k);
    }
    const belt = n.flatMap((k, y) => (k >= 2 * s ? [y] : []));
    assert.ok(belt.length >= 2, `${sp}: a belt`);
    const [b0, b1] = [Math.min(...belt), Math.max(...belt)];
    // Down to a unit under the belt (the boots are further down).
    const seam = n.flatMap((k, y) => (k >= 0.3 * s && k < 2 * s && y <= b1 + s ? [y] : []));
    if (sp === 'ghost') {
      assert.deepEqual(seam, [], 'ghost: no straps on the sheet');
      continue;
    }
    assert.ok(seam.filter((y) => y < b0).length >= 1.5 * s, `${sp}: straps down the back`);
    assert.ok(Math.max(...seam.filter((y) => y < b0)) >= b0 - 0.5 * s, `${sp}: the straps run down to the belt`);
    assert.deepEqual(seam.filter((y) => y > b1), [], `${sp}: the straps stop at the belt`);
  }
});

// A nord's fur cloak hangs to its knees, but over a ghost's sheet it is a
// short cape: from behind, the sheet still shows below it to its wavy hem.
test("over a ghost's sheet a nord's cloak is a short cape: from behind the sheet shows below it", () => {
  const s = 8;
  const tr = who('ghost', 1);
  const sheet = lookOf(tr, 'nord');
  for (const [pose, up] of [['idle', 3.5], ['walk', 3.5], ['sit', 2]] as const) {
    const behind = (co: Costume) => figureSprite(fig(tr, co, pose, { facing: { back: true, flip: false } }), s, INK);
    // Pixels of a colour in the sprite's bottom `up` units (the lower half
    // of the sheet, to its hem; seated, it is shorter).
    const low = (spr: Sprite, color: string) => {
      const bottom = spans(spr).findLastIndex((r) => r);
      let n = 0;
      for (let y = bottom - Math.round(up * s); y <= bottom; y++) for (let x = 0; x < spr.img.width; x++) if (isColor(spr, x, y, color)) n++;
      return n;
    };
    const [nord, plain] = [behind('nord'), behind('casual')];
    assert.equal(low(nord, CLOAK), 0, `${pose}: the cloak hangs to the hem`);
    const [a, b] = [low(nord, sheet.top) + low(nord, sheet.topD), low(plain, sheet.top) + low(plain, sheet.topD)];
    assert.ok(a >= 0.85 * b, `${pose}: ${a} pixels of the sheet low down, ${b} in everyday clothes`);
  }
});

test('a jumpsuit is one teal piece on everyone; at ★8 the legs take its new colour too', () => {
  for (const n of [0, 1, 2]) {
    const was = lookOf(who('human', n), 'jumpsuit');
    assert.deepEqual([was.top, was.legs], [SUIT_TEAL, SUIT_TEAL]);
    const now = lookOf(who('human', n), 'jumpsuit', WEARS[2][1]);
    assert.equal(now.legs, now.top);
  }
});

// The shelter's suits are their own: never royal blue with a yellow or
// gold stripe. At ★8 the suit keeps out of the blues, its stripe orange or
// cream.
test('at ★8 a jumpsuit is never royal blue, its stripe orange or cream', () => {
  const hue = (c: string) => {
    const [r, g, b] = rgbOf(c);
    const hi = Math.max(r, g, b);
    const d = hi - Math.min(r, g, b);
    if (d === 0) return 0;
    const h = hi === r ? (g - b) / d : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  for (let i = 0; i < 600; i++) {
    const tr = traitsFor(`agent-${i}`, i % 3 ? 'sub' : 'lead');
    if (tr.species === 'ghost') continue;
    const L = lookOf(tr, 'jumpsuit', WEARS[2][1]);
    assert.ok(hue(L.top) < 190 || hue(L.top) > 245, `agent-${i}: a ${L.top} suit (${hue(L.top).toFixed(0)}°)`);
    assert.ok(L.accent === STRIPE || L.accent === CREAM, `agent-${i}: a ${L.accent} stripe`);
  }
  assert.equal(lookOf(who('human', 0), 'jumpsuit').accent, STRIPE);
});

// ★8 must show whatever the trim: a jumpsuit's teal dyed a teal, or a
// rawhide coat dyed a rust, would hardly change.
test('the outfit swap changes the main garment by a good way on every costume, whatever the trim', () => {
  const far = (a: string, b: string) => Math.hypot(...rgbOf(a).map((v, k) => v - rgbOf(b)[k]));
  for (const co of COSTUMES) {
    let least = { d: Infinity, id: '' };
    for (let i = 0; i < 600; i++) {
      const id = `agent-${i}`;
      const tr = traitsFor(id, i % 3 ? 'sub' : 'lead');
      const d = far(lookOf(tr, co).top, lookOf(tr, co, WEARS[2][1]).top);
      if (d < least.d) least = { d, id };
    }
    assert.ok(least.d >= 45, `${co}: ${least.id}'s changes by ${least.d.toFixed(1)}`);
  }
});

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
      figureSprite(fig(tr[i % 5], COSTUMES[i % COSTUMES.length], POSES[i % 24], { poseT: i * 0.13, ...all }), 4, INK);
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
    for (let i = 0; i < 24; i++) figureSprite(fig(tr[i % 5], COSTUMES[i % COSTUMES.length], POSES[i % 24], { poseT: i * 0.13, ...o }), 16, INK);
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

// ---- the setting worlds: the mines, the caverns, the snows, the vault, hell

test("the setting worlds' hats: a miner's lamp cap, a toadstool cap, a trapper hat, a peaked cap and curled horns", () => {
  assert.deepEqual(SETTING.map((co) => PRIZES[co]), ['lampcap', 'mushroom', 'trapper', 'peaked', 'horns']);
});

// A sprite's pixels of any of some colours: x and height over its anchor,
// units.
function pixelsAt(sp: Sprite, s: number, ...colors: string[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < sp.img.height; y++) for (let x = 0; x < sp.img.width; x++) if (colors.some((c) => isColor(sp, x, y, c))) out.push([(x - sp.ax) / s, (sp.ay - y) / s]);
  return out;
}
const highest = (pts: Array<[number, number]>) => Math.max(...pts.map((p) => p[1]));
const lowest = (pts: Array<[number, number]>) => Math.min(...pts.map((p) => p[1]));
const leftmost = (pts: Array<[number, number]>) => Math.min(...pts.map((p) => p[0]));
const rightmost = (pts: Array<[number, number]>) => Math.max(...pts.map((p) => p[0]));
// How far across they reach, at most, in any one row from height h0 to h1.
function across(pts: Array<[number, number]>, h0 = -Infinity, h1 = Infinity): number {
  const rows = new Map<number, [number, number]>();
  for (const [x, h] of pts) {
    if (h < h0 || h > h1) continue;
    const r = rows.get(h) ?? [x, x];
    rows.set(h, [Math.min(r[0], x), Math.max(r[1], x)]);
  }
  return Math.max(0, ...[...rows.values()].map(([a, b]) => b - a));
}

test("the setting worlds' hats: a lamp over a leather cap's peak, a dome wider than the head, a trapper's flaps, a peaked cap's flat crown, curled horns", () => {
  const s = 8;
  const hat = WEARS[0][1];
  for (const sp of SPECIES) {
    for (const back of [false, true]) {
      const facing = { back, flip: false };
      const what = `${sp}${back ? ' from behind' : ''}`;
      const draw = (co: Costume, wear?: Wear) => figureSprite(fig(who(sp, 1), co, 'idle', { wear, facing }), s, INK);

      // A soft leather cap, not the explorer's yellow hard hat: from the
      // front a flame over a reflector stands over its crown and its peak
      // juts toward the face; from behind the dish shows over the crown.
      const cap = draw('miner', hat);
      const leather = pixelsAt(cap, s, CLOTHES.leather, CLOTHES.leatherD);
      const flame = pixelsAt(cap, s, CLOTHES.flame);
      const brass = [...pixelsAt(cap, s, CLOTHES.brass, CLOTHES.reflector), ...flame];
      assert.ok(leather.length > 4 * s * s, `${what}: ${leather.length} pixels of leather`);
      assert.ok(highest(brass) > highest(leather), `${what}: the lamp stands over the crown (${highest(brass)} vs ${highest(leather)})`);
      assert.equal(pixelsAt(cap, s, '#f2c230').length, 0, `${what}: no yellow hard hat`);
      if (back) assert.equal(flame.length, 0, `${what}: the flame is round the front`);
      else {
        assert.ok(flame.length >= s && highest(flame) > highest(leather), `${what}: a flame over the crown`);
        assert.ok(rightmost(leather) > 4.2, `${what}: the peak reaches ${rightmost(leather)} toward the face`);
      }

      // A toadstool's round dome, wider than the head, broad near its top
      // (no point), spotted; its gills show under the front edge.
      const fl = lookOf(who(sp, 1), 'forager', hat);
      const toad = draw('forager', hat);
      const dome = pixelsAt(toad, s, fl.hat, fl.hatD);
      assert.ok(across(dome) >= 7.6, `${what}: the dome is ${across(dome)} across`);
      assert.ok(across(dome, highest(dome) - 1.1, highest(dome) - 0.9) >= 3.5, `${what}: a dome, not a point`);
      assert.ok(pixelsAt(toad, s, CLOTHES.spots).length >= s, `${what}: spots`);
      const gills = pixelsAt(toad, s, CLOTHES.gills).length;
      if (back) assert.equal(gills, 0, `${what}: no gills from behind`);
      else assert.ok(gills >= s / 2, `${what}: ${gills} pixels of gills`);

      // A trapper hat: fur ear flaps hang well below its crown on both
      // sides; nothing (no pom-pom) on top of it.
      const trap = draw('parka', hat);
      const crown = pixelsAt(trap, s, CLOTHES.trapper);
      const fur = pixelsAt(trap, s, CLOTHES.snowFur, CLOTHES.snowFurD);
      const mid = (leftmost(crown) + rightmost(crown)) / 2;
      const low = fur.filter(([, h]) => h < highest(crown) - 4.2);
      assert.ok(low.some(([x]) => x < mid - 2.6) && low.some(([x]) => x > mid + 2.6), `${what}: ear flaps either side`);
      assert.ok(highest(fur) < highest(crown), `${what}: no fur over the crown`);
      if (sp === 'human' || sp === 'ghost') assert.ok(heightOf(trap, s) - highest(crown) < 0.62, `${what}: nothing on top (${heightOf(trap, s) - highest(crown)})`);

      // A peaked cap: a flat crown wider than its band, a glossy peak and a
      // plain brass oval over it, round the front.
      const gl = lookOf(who(sp, 1), 'guard', hat);
      const peaked = draw('guard', hat);
      const navy = pixelsAt(peaked, s, gl.hat, gl.hatD, CLOTHES.capBand);
      const t = highest(navy);
      assert.ok(across(navy, t - 0.9, t) > across(navy, t - 2.9, t - 2.2) + 0.3, `${what}: the crown ${across(navy, t - 0.9, t)} across, the band ${across(navy, t - 2.9, t - 2.2)}`);
      // (over the shoulders: black shoes are near enough the peak's black)
      const peak = pixelsAt(peaked, s, CLOTHES.peak).filter(([, h]) => h > 9).length;
      const oval = pixelsAt(peaked, s, CLOTHES.oval).filter(([, h]) => h > 9).length;
      if (back) assert.deepEqual([peak, oval], [0, 0], `${what}: no peak nor oval from behind`);
      else assert.ok(peak >= 2 * s && oval > 0, `${what}: ${peak} pixels of peak, ${oval} of oval`);

      // A devil: little bone horns over the head; at ★2 gold ones in their
      // place, curling down beside it, wider than the head.
      const nubs = pixelsAt(draw('demon'), s, CLOTHES.bone, CLOTHES.boneD);
      assert.ok(nubs.length > 0 && highest(nubs) > 14.1, `${what}: horns over the head (${highest(nubs)})`);
      const grand = draw('demon', hat);
      const gold = pixelsAt(grand, s, CLOTHES.horn, CLOTHES.hornD);
      assert.equal(pixelsAt(grand, s, CLOTHES.bone, CLOTHES.boneD).length, 0, `${what}: the gold horns replace the bone`);
      assert.ok(highest(gold) > highest(nubs), `${what}: bigger horns`);
      assert.ok(highest(gold) - lowest(gold) >= 2.4, `${what}: curling down, ${highest(gold) - lowest(gold)} tall`);
      assert.ok(rightmost(gold) - leftmost(gold) >= 7.5, `${what}: ${rightmost(gold) - leftmost(gold)} across`);
    }
  }
});

test("a devil's arrow-tipped tail shows behind every species, front and back", () => {
  const s = 8;
  for (const sp of SPECIES) {
    for (const back of [false, true]) {
      const spr = figureSprite(fig(who(sp, 1), 'demon', 'idle', { facing: { back, flip: false } }), s, INK);
      const tail = pixelsAt(spr, s, CLOTHES.scarlet, CLOTHES.scarletD).filter(([x]) => x < -3.0);
      assert.ok(tail.length >= s, `${sp}${back ? ' from behind' : ''}: ${tail.length} pixels of tail out behind`);
    }
  }
});

test("the setting worlds' costumes dress every species in clothes of their own, front and back", () => {
  for (const sp of SPECIES) {
    for (const back of [false, true]) {
      const looks = new Map(COSTUMES.map((co) => [co, hash(figureSprite(fig(who(sp, 1), co, 'idle', { facing: { back, flip: false } }), 6, INK))]));
      for (const co of SETTING) {
        for (const other of COSTUMES) if (other !== co) assert.notEqual(looks.get(co), looks.get(other), `${sp}${back ? ' from behind' : ''}: ${co} looks like ${other}`);
      }
    }
  }
});

test("each setting outfit shows what it is made of, a ghost's sheet too: denim, a moss capelet, a fur ruff, navy, a devil's cape", () => {
  const s = 8;
  const marks: ReadonlyArray<readonly [Costume, string]> = [['miner', CLOTHES.denim], ['forager', CLOTHES.moss], ['parka', CLOTHES.snowFur], ['guard', CLOTHES.navy], ['demon', CLOTHES.plum]];
  for (const [co, color] of marks) {
    for (const sp of SPECIES) {
      for (const back of [false, true]) {
        const spr = figureSprite(fig(who(sp, 1), co, 'idle', { facing: { back, flip: false } }), s, INK);
        assert.ok(pixelsOf(spr, color) > 2 * s, `${sp} ${co}${back ? ' from behind' : ''}: ${pixelsOf(spr, color)} pixels of ${color}`);
      }
    }
  }
  // Work shirts and a tunic under them; mittens in its own colour.
  for (const sp of ['human', 'robot', 'cat', 'alien'] as Species[]) {
    const tr = who(sp, 1);
    const on = (co: Costume, color: string) => pixelsOf(figureSprite(fig(tr, co, 'idle'), s, INK), color);
    assert.ok(on('miner', CLOTHES.workShirt) > 2 * s, `${sp}: a work shirt`);
    assert.ok(on('forager', CLOTHES.oatmeal) > 2 * s, `${sp}: a tunic`);
    assert.ok(on('guard', CLOTHES.paleShirt) > 2 * s, `${sp}: a shirt under the waistcoat`);
    assert.ok(on('parka', lookOf(tr, 'parka').trim) > s, `${sp}: mittens`);
  }
});

test('★8 puts the setting outfits in other colours: rust overalls, a capelet in its hue, a mustard or teal parka, an oxblood or green uniform, a violet robe', () => {
  const both = { ...WEARS[0][1], outfit: true };
  const seen = new Map<Costume, Set<string>>();
  const saw = (co: Costume, c: string) => seen.set(co, (seen.get(co) ?? new Set()).add(c));
  for (let i = 0; i < 40; i++) {
    const tr = traitsFor(`agent-${i}`, 'sub');
    const off = (co: Costume) => lookOf(tr, co, WEARS[0][1]);
    const on = (co: Costume) => lookOf(tr, co, both);
    const what = `agent-${i} (${tr.species})`;
    assert.equal(off('miner').kit, CLOTHES.denim, what);
    assert.equal(on('miner').kit, CLOTHES.canvas, what);
    assert.equal(off('forager').kit, CLOTHES.moss, what);
    assert.notEqual(on('forager').kit, CLOTHES.moss, what);
    assert.equal(off('forager').hat, CLOTHES.toadstool, what);
    assert.ok(([CLOTHES.violetCap, CLOTHES.blueCap] as string[]).includes(on('forager').hat), `${what}: a violet or blue cap`);
    assert.equal(off('parka').kit, CLOTHES.parka, what);
    assert.ok(([CLOTHES.mustard, CLOTHES.deepTeal] as string[]).includes(on('parka').kit), `${what}: a mustard or teal parka`);
    assert.equal(off('guard').kit, CLOTHES.navy, what);
    assert.ok(([CLOTHES.oxblood, CLOTHES.bottle] as string[]).includes(on('guard').kit), `${what}: oxblood or green`);
    assert.equal(off('demon').kit, CLOTHES.scarlet, what);
    assert.equal(on('demon').kit, CLOTHES.violet, what);
    if (tr.species !== 'ghost') {
      for (const co of SETTING) assert.equal(on(co).top, on(co).kit, `${what} ${co}: its main garment`);
      assert.deepEqual([off('miner').under, on('miner').under], [CLOTHES.workShirt, CLOTHES.slateShirt], `${what}: a slate shirt under rust`);
      assert.deepEqual([on('miner').legs, on('guard').legs, on('guard').hat], [CLOTHES.canvas, on('guard').kit, on('guard').kit], `${what}: the trousers and the cap match`);
    }
    for (const co of ['forager', 'parka', 'guard'] as Costume[]) saw(co, co === 'forager' ? on(co).hat : on(co).kit);
  }
  for (const co of ['forager', 'parka', 'guard'] as Costume[]) assert.equal(seen.get(co)?.size, 2, `${co}: both of its ★8 colours turn up`);
});

// ---- the startup --------------------------------------------------------

test("the startup's hat: a snapback worn backwards", () => {
  assert.equal(PRIZES.startup, 'snapback');
});

test("the startup's hoodie, jeans and sneakers look unlike every other costume on every species, front and back", () => {
  for (const sp of SPECIES) {
    for (const back of [false, true]) {
      const looks = new Map(COSTUMES.map((co) => [co, hash(figureSprite(fig(who(sp, 1), co, 'idle', { facing: { back, flip: false } }), 6, INK))]));
      for (const other of COSTUMES) if (other !== 'startup') assert.notEqual(looks.get('startup'), looks.get(other), `${sp}${back ? ' from behind' : ''}: startup looks like ${other}`);
    }
  }
});

test('a startup hoodie is open over a white tee, over jeans and white sneakers, the jeans black at ★8; on a ghost its drawstrings and hood are in its colour', () => {
  const s = 8;
  // Square units of a colour from h0 to h1 units over the feet.
  const area = (spr: Sprite, color: string, h0 = -Infinity, h1 = Infinity) => pixelsAt(spr, s, color).filter(([, h]) => h > h0 && h < h1).length / (s * s);
  for (const sp of SPECIES) {
    for (const back of [false, true]) {
      const tr = who(sp, 1);
      const what = `${sp}${back ? ' from behind' : ''}`;
      const at = (wear?: Wear) => figureSprite(fig(tr, 'startup', 'idle', { wear, facing: { back, flip: false } }), s, INK);
      if (sp === 'ghost') {
        const trim = lookOf(tr, 'startup').trim;
        assert.ok(area(at(), trim) >= (back ? 1.5 : 0.3), `${what}: ${area(at(), trim).toFixed(2)} square units of its colour`);
        continue;
      }
      if (!back) assert.ok(area(at(), STARTUP.tee, 2) >= 2, `${what}: ${area(at(), STARTUP.tee, 2).toFixed(2)} square units of tee`);
      assert.ok(area(at(), STARTUP.sneaker, -Infinity, 2) >= 0.5, `${what}: ${area(at(), STARTUP.sneaker, -Infinity, 2).toFixed(2)} square units of sneaker`);
      const jeans = area(at(), STARTUP.jeans) + area(at(), STARTUP.jeansD);
      assert.ok(jeans >= 1.5, `${what}: ${jeans.toFixed(2)} square units of jeans`);
      const alt = at(WEARS[2][1]);
      assert.ok(area(alt, STARTUP.black) >= 1.5, `${what}: ${area(alt, STARTUP.black).toFixed(2)} square units of black jeans at ★8`);
      assert.equal(area(alt, STARTUP.jeans) + area(alt, STARTUP.jeansD), 0, `${what}: blue jeans at ★8`);
    }
  }
});

test('a snapback is worn backwards: from the front its flat brim juts out behind the head, from behind it points at us; the crown is in its colour', () => {
  const s = 8;
  for (const sp of SPECIES) {
    for (const back of [false, true]) {
      const tr = who(sp, 1);
      const what = `${sp}${back ? ' from behind' : ''}`;
      const spr = figureSprite(fig(tr, 'startup', 'idle', { wear: WEARS[0][1], facing: { back, flip: false } }), s, INK);
      // over the shoulders
      const brim = pixelsAt(spr, s, STARTUP.brim, STARTUP.brimD).filter(([, h]) => h > 10);
      const crown = pixelsAt(spr, s, lookOf(tr, 'startup', WEARS[0][1]).color).filter(([, h]) => h > 12);
      assert.ok(crown.length >= 10 * s * s, `${what}: ${(crown.length / (s * s)).toFixed(2)} square units of crown`);
      if (back) {
        assert.ok(brim.length >= 6 * s * s, `${what}: ${(brim.length / (s * s)).toFixed(2)} square units of brim`);
        assert.ok(leftmost(brim) > -4.5 && rightmost(brim) < 4.5, `${what}: the brim from ${leftmost(brim)} to ${rightmost(brim)}`);
      } else assert.ok(leftmost(brim) < -5, `${what}: the brim reaches ${leftmost(brim)} behind the head`);
    }
  }
});

test("a corgi: long and low, its coat nearer the floor than a husky's, on short white legs", () => {
  const s = 8;
  const body: [number, number, number] = [217, 138, 60];
  const at = (kind: 'corgi' | 'husky') => critterSprite({ kind, body, x: 0, y: 0, z: 0, flip: false, moving: false }, 0.01, s, INK);
  const [corgi, husky] = [at('corgi'), at('husky')];
  const low = (spr: Sprite) => lowest(pixelsAt(spr, s, hexOf(body)));
  assert.ok(low(corgi) < low(husky) - 0.4, `its coat comes down to ${low(corgi)}, a husky's to ${low(husky)}`);
  assert.ok(corgi.img.width > 1.3 * corgi.img.height, `${corgi.img.width} x ${corgi.img.height} px`);
  const paws = pixelsAt(corgi, s, mix(hexOf(body), '#ffffff', 0.88)).filter(([, h]) => h < 1);
  assert.ok(paws.length >= s, `${paws.length} pixels of white paw`);
});

// ---- office life: a high-five, a sip, a carried mug -----------------------

const MUG = '#f3ede2'; // a mug's glaze (see props.ts)

test('a high-five: an open hand up and out toward the other, on every species', () => {
  const s = 8;
  for (const sp of SPECIES) {
    const tr = who(sp, 1);
    for (let i = 0; i < LOOP.highfive[1]; i++) {
      const spr = figureSprite(fig(tr, 'casual', 'highfive', { poseT: ((i + 0.5) * LOOP.highfive[0]) / LOOP.highfive[1], phase: 0 }), s, INK);
      const hand = pixelsAt(spr, s, lookOf(tr, 'casual').hand).filter(([x, h]) => x > 3.3 && h > 8.5);
      assert.ok(hand.length >= s, `${sp} frame ${i}: ${hand.length} pixels of hand up and out`);
    }
  }
});

test('a sip: the mug up at the lips in both hands, the eyes shut, then down again', () => {
  const s = 8;
  const [per, n] = LOOP.sip;
  const at = (i: number) => figureSprite(fig(who('human', 1), 'casual', 'sip', { poseT: ((i + 0.5) * per) / n, phase: 0 }), s, INK);
  const high = (spr: Sprite) => Math.max(...pixelsAt(spr, s, MUG).map(([, h]) => h));
  // up by the face half way through, down by the chest at the start
  assert.ok(high(at(n / 2)) > 9.5, `the mug reaches ${high(at(n / 2))} mid-sip`);
  assert.ok(high(at(0)) < 8.5, `the mug at ${high(at(0))} before the sip`);
});

test('a carried mug shows in a free hand standing about, walking, pondering, sitting and chatting, on every species and costume, both ways round', () => {
  const s = 5;
  for (const sp of SPECIES) {
    for (const co of COSTUMES) {
      for (const pose of MUG_POSES) {
        for (const back of [false, true]) {
          const o = { facing: { back, flip: false }, walking: pose === 'walk' };
          const what = `${sp}/${co}/${pose}${back ? '/back' : ''}`;
          const plain = figureSprite(fig(who(sp, 1), co, pose, o), s, INK);
          const mug = figureSprite(fig(who(sp, 1), co, pose, { ...o, mug: true }), s, INK);
          sane(mug, s, what);
          assert.notEqual(hash(mug), hash(plain), `${what}: no mug`);
          assert.ok(pixelsOf(mug, MUG) > 0, `${what}: no mug to be seen`);
        }
      }
    }
  }
});

// As for a face state and a blink: a mug gets a sprite of its own exactly
// where it changes what is drawn.
test('a carried mug gets a sprite of its own in every frame of every pose where it shows, and nowhere else', () => {
  const s = 4;
  const costumes: Record<Species, Costume> = { human: 'startup', robot: 'scientist', cat: 'hacker', alien: 'astronaut', ghost: 'casual' };
  const wrong: string[] = [];
  let shows = 0;
  for (const sp of SPECIES) {
    for (const back of [false, true]) {
      for (const pose of POSES) {
        const [per, n] = LOOP[pose];
        for (let i = 0; i < n; i++) {
          const o = { facing: { back, flip: false }, poseT: ((i + 0.5) * per) / n, phase: 0, sleeping: pose === 'sleep' };
          const what = `${sp}${back ? '/back' : ''}/${pose}/${i}`;
          clearSprites();
          const plain = figureSprite(fig(who(sp, 1), costumes[sp], pose, o), s, INK);
          const m = spriteStats.misses;
          let mug = figureSprite(fig(who(sp, 1), costumes[sp], pose, { ...o, mug: true }), s, INK);
          const own = spriteStats.misses > m;
          if (!own) {
            clearSprites();
            mug = figureSprite(fig(who(sp, 1), costumes[sp], pose, { ...o, mug: true }), s, INK);
          }
          if (!samePixels(mug, plain) !== own) wrong.push(`${what}: ${own ? 'a key of its own, the same pixels' : 'the plain key, other pixels'}`);
          else if (own) shows++;
        }
      }
    }
  }
  assert.deepEqual(wrong, []);
  // in every frame of the poses that show one, for every species, both ways round
  assert.equal(shows, 2 * SPECIES.length * [...MUG_POSES].reduce((k, p) => k + LOOP[p][1], 0));
});
