import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characterSprite, SPRITE_W, SPRITE_H } from '../src/iso/sprites.ts';
import type { Facing } from '../src/iso/sprites.ts';
import { traitsFor } from '../src/world/character.ts';
import type { Pose, Traits } from '../src/world/character.ts';

const POSES: Pose[] = ['idle', 'walk', 'write', 'read', 'think', 'run', 'search', 'web', 'delegate', 'talk', 'done', 'error', 'sleep'];
const FACINGS: Facing[] = [
  { back: false, flip: false },
  { back: false, flip: true },
  { back: true, flip: false },
  { back: true, flip: true },
];
const same = (a: readonly number[] | null, b: readonly number[] | null) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const has = (sp: { px: Array<Array<readonly number[] | null>> }, c: readonly number[]) => sp.px.some((row) => row.some((p) => same(p, c)));

test('every pose and facing yields a full-size sprite anchored at the feet', () => {
  for (let i = 0; i < 10; i++) {
    const tr = traitsFor(`px-${i}`, i % 3 === 0 ? 'lead' : 'sub', ['Explore', 'code-reviewer', 'Plan', undefined][i % 4]);
    for (const pose of POSES) {
      for (const facing of FACINGS) {
        for (const t of [0, 0.13, 0.4, 1.1, 2.7]) {
          const sp = characterSprite(tr, pose, t, facing, i);
          assert.equal(sp.w, SPRITE_W);
          assert.equal(sp.h, SPRITE_H);
          assert.equal(sp.px.length, SPRITE_H);
          for (const row of sp.px) assert.equal(row.length, SPRITE_W);
          assert.equal(sp.ay, SPRITE_H - 1);
          assert.ok(sp.px[SPRITE_H - 1].some(Boolean) || tr.species === 'ghost' || sp.dy < 0 || pose === 'sleep', `${pose} has no feet`);
        }
      }
    }
  }
});

test('sprites wear the character colours', () => {
  const tr = traitsFor('colourful', 'sub');
  const sp = characterSprite(tr, 'idle', 0, { back: false, flip: false });
  assert.ok(has(sp, tr.shirt), 'shirt');
  assert.ok(has(sp, tr.skin), 'skin');
});

test('front views show eyes, back views do not', () => {
  const tr = { ...traitsFor('eyes', 'sub'), species: 'human' as const, accessory: 'none' as const, eye: [1, 2, 3] as const };
  assert.ok(has(characterSprite(tr, 'idle', 0.5, { back: false, flip: false }), tr.eye));
  assert.ok(!has(characterSprite(tr, 'idle', 0.5, { back: true, flip: false }), tr.eye));
});

test('walking animates and flipping mirrors', () => {
  const tr = traitsFor('walker', 'sub');
  const a = characterSprite(tr, 'walk', 0, { back: false, flip: false });
  const b = characterSprite(tr, 'walk', 0.13, { back: false, flip: false });
  assert.notDeepEqual(a.px, b.px);
  const f = characterSprite(tr, 'walk', 0, { back: false, flip: true });
  for (let y = 0; y < SPRITE_H; y++) assert.deepEqual(f.px[y], [...a.px[y]].reverse());
});

test('celebrating jumps', () => {
  const tr = traitsFor('jumper', 'sub');
  const dys = new Set<number>();
  for (let t = 0; t < 2; t += 0.05) dys.add(characterSprite(tr, 'done', t, { back: false, flip: false }).dy);
  assert.ok(dys.size > 1);
});

const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test('characters get a dark outline around the silhouette', () => {
  const tr = { ...traitsFor('outlined', 'sub'), species: 'human' as const, accessory: 'none' as const };
  const sp = characterSprite(tr, 'idle', 0.5, { back: false, flip: false });
  // Shirt row: the pixel just left of the body (column 1) is the outline.
  const row = sp.px[9];
  const first = row.findIndex(Boolean);
  const body = row[first + 1]!;
  assert.ok(first >= 0 && row[first], 'no outline pixel');
  assert.ok(luma(row[first]!) < luma(body) * 0.7, `outline ${row[first]} not darker than ${body}`);
  // The top of the head is outlined too.
  const col = sp.px.map((r) => r[5]);
  const top = col.findIndex(Boolean);
  assert.ok(luma(col[top]!) < luma(col[top + 1]!) , 'head not outlined');
});

test('sprites are shaded with several tones per material', () => {
  const tr = { ...traitsFor('shaded', 'sub'), species: 'human' as const, accessory: 'none' as const };
  const sp = characterSprite(tr, 'idle', 0.5, { back: false, flip: false });
  const colours = new Set(sp.px.flat().filter(Boolean).map((c) => c!.join(',')));
  assert.ok(colours.size >= 12, `only ${colours.size} colours`);
  const shirtTones = new Set(sp.px.flat().filter(Boolean).filter((c) => Math.abs(luma(c!) - luma(tr.shirt)) < 60 && Math.abs(c![0] - tr.shirt[0]) < 70).map((c) => c!.join(',')));
  assert.ok(shirtTones.size >= 3, `shirt has ${shirtTones.size} tones`);
});

test('the large rig has more detail: eye whites, a belt and more colours', async () => {
  const { SPRITE_L_W, SPRITE_L_H } = await import('../src/iso/sprites.ts');
  const tr = { ...traitsFor('detailed', 'sub'), species: 'human' as const, accessory: 'none' as const };
  const small = characterSprite(tr, 'idle', 0.5, { back: false, flip: false });
  const large = characterSprite(tr, 'idle', 0.5, { back: false, flip: false }, 0, 'L');
  assert.equal(large.w, SPRITE_L_W);
  assert.equal(large.h, SPRITE_L_H);
  const count = (sp: typeof small) => new Set(sp.px.flat().filter(Boolean).map((c) => c!.join(','))).size;
  assert.ok(count(large) > count(small), `large ${count(large)} vs small ${count(small)}`);
  assert.ok(large.px.some((r) => r.some((c) => c && c[0] > 235 && c[1] > 235 && c[2] > 235)), 'no eye whites');
});

test('every pose and facing works on the large rig', async () => {
  const { SPRITE_L_W, SPRITE_L_H } = await import('../src/iso/sprites.ts');
  for (let i = 0; i < 12; i++) {
    const tr = traitsFor(`L-${i}`, i % 3 === 0 ? 'lead' : 'sub', ['Explore', 'code-reviewer', 'Plan', 'security', 'test-runner', undefined][i % 6]);
    for (const pose of POSES) {
      for (const facing of FACINGS) {
        for (const t of [0, 0.13, 0.4, 1.1]) {
          const sp = characterSprite(tr, pose, t, facing, i, 'L');
          assert.equal(sp.px.length, SPRITE_L_H);
          for (const row of sp.px) assert.equal(row.length, SPRITE_L_W);
          assert.ok(sp.px[SPRITE_L_H - 1].some(Boolean) || tr.species === 'ghost' || sp.dy < 0, `${pose} has no feet`);
        }
      }
    }
  }
});

test('the XL rig is drawn natively: thin outline, eye shine, more colours than the large rig', async () => {
  const { SPRITE_XL_W, SPRITE_XL_H } = await import('../src/iso/sprites.ts');
  const tr = { ...traitsFor('xl', 'sub'), species: 'human' as const, accessory: 'none' as const };
  const sp = characterSprite(tr, 'idle', 0.5, { back: false, flip: false }, 0, 'XL');
  assert.equal(sp.w, SPRITE_XL_W);
  assert.equal(sp.h, SPRITE_XL_H);
  // Outline is one pixel thin: walking in from the left on the shirt row,
  // the pixel after the outline is already lit body colour.
  const row = sp.px[Math.round(SPRITE_XL_H * 0.62)];
  const first = row.findIndex(Boolean);
  assert.ok(luma(row[first]!) < luma(row[first + 1]!) * 0.7, 'outline thicker than one pixel');
  // Eye shine: a near-white pixel touching a dark pupil.
  const shine = sp.px.some((r, y) => r.some((c, x) => c && c[0] > 235 && c[2] > 235 && [sp.px[y + 1]?.[x], sp.px[y]?.[x - 1]].some((n) => n && luma(n) < 80)));
  assert.ok(shine, 'no eye shine');
  const count = (s: typeof sp) => new Set(s.px.flat().filter(Boolean).map((c) => c!.join(','))).size;
  const large = characterSprite(tr, 'idle', 0.5, { back: false, flip: false }, 0, 'L');
  assert.ok(count(sp) >= count(large) + 8, `XL ${count(sp)} colours vs large ${count(large)}`);
  // Native, not a 2x blow-up of the large rig: the body is centred on a
  // pixel column, so the shirt row is an odd number of pixels wide.
  assert.equal(row.filter(Boolean).length % 2, 1, 'even-width body: looks upscaled');
});

test('every pose and facing works on the XL rig, feet on the ground', async () => {
  const { SPRITE_XL_W, SPRITE_XL_H } = await import('../src/iso/sprites.ts');
  for (let i = 0; i < 12; i++) {
    const tr = traitsFor(`XL-${i}`, i % 3 === 0 ? 'lead' : 'sub', ['Explore', 'code-reviewer', 'Plan', 'security', 'test-runner', undefined][i % 6]);
    for (const pose of POSES) {
      for (const facing of FACINGS) {
        for (const t of [0, 0.13, 0.4, 1.1]) {
          const sp = characterSprite(tr, pose, t, facing, i, 'XL');
          assert.equal(sp.px.length, SPRITE_XL_H);
          for (const row of sp.px) assert.equal(row.length, SPRITE_XL_W);
          assert.ok(sp.px[SPRITE_XL_H - 1].some(Boolean) || tr.species === 'ghost' || sp.dy < 0, `${pose} has no feet`);
          for (const edge of [0, SPRITE_XL_W - 1]) assert.ok(sp.px.every((r) => r[edge] === null), `${pose} touches the frame edge`);
          assert.ok(sp.px[0].every((c) => c === null), `${pose} touches the frame top`);
        }
      }
    }
  }
});

test('XL species and accessories all change the silhouette or colours', async () => {
  const base: Traits = { ...traitsFor('kinds', 'sub'), species: 'human', accessory: 'none' };
  const key = (tr: Traits) => JSON.stringify(characterSprite(tr, 'idle', 0.5, { back: false, flip: false }, 0, 'XL').px);
  const seen = new Set([key(base)]);
  for (const species of ['robot', 'cat', 'alien', 'ghost'] as const) seen.add(key({ ...base, species }));
  for (const accessory of ['headset', 'glasses', 'lamp', 'beret', 'goggles', 'hood', 'bow'] as const) seen.add(key({ ...base, accessory }));
  for (let hairStyle = 0; hairStyle < 8; hairStyle++) seen.add(key({ ...base, hairStyle }));
  for (const pattern of ['█', '▓', '▒', '▼', '◆', '║', '╋', '♥']) seen.add(key({ ...base, pattern }));
  assert.equal(seen.size, 1 + 4 + 7 + 7 + 7);
});

test('the large frame has room for props on both sides', () => {
  const tr = { ...traitsFor('lens', 'sub'), species: 'human' as const };
  for (const flip of [false, true]) {
    const sp = characterSprite(tr, 'search', 0.3, { back: false, flip }, 0, 'L');
    const edge = flip ? 0 : sp.w - 1;
    assert.ok(sp.px.every((r) => r[edge] === null), `prop touches the ${flip ? 'left' : 'right'} frame edge`);
  }
});
