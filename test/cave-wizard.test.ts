import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIZARD_H, WIZARD_W, wizardSprite } from '../src/cave/wizard.ts';
import type { Facing, WizardSprite } from '../src/cave/types.ts';
import type { RGB } from '../src/term/color.ts';
import { hex } from '../src/term/color.ts';
import { traitsFor } from '../src/world/character.ts';
import type { Accessory, Pose, Species, Traits } from '../src/world/character.ts';

const POSES: Pose[] = ['idle', 'walk', 'write', 'read', 'think', 'run', 'search', 'web', 'delegate', 'talk', 'done', 'error', 'sleep'];
const SPECIES: Species[] = ['human', 'robot', 'cat', 'alien', 'ghost'];
const ACCESSORIES: Accessory[] = ['none', 'headset', 'glasses', 'lamp', 'beret', 'goggles', 'hood', 'bow'];
const FACINGS: Facing[] = [
  { back: false, flip: false },
  { back: false, flip: true },
  { back: true, flip: false },
  { back: true, flip: true },
];
const TIMES = [0, 0.07, 0.13, 0.26, 0.4, 0.55, 0.9, 1.1, 1.7, 2.7, 3.2];
const AGENT_TYPES = [undefined, 'Explore', 'code-reviewer', 'Plan', 'security-reviewer', 'test-runner', 'general-purpose'];
const FRONT: Facing = { back: false, flip: false };
const BACK: Facing = { back: true, flip: false };

// Characters as the app makes them, plus every species x accessory pairing.
const CREW: Traits[] = [
  ...Array.from({ length: 24 }, (_, i) => traitsFor(`wiz-${i}`, i % 5 === 0 ? 'lead' : 'sub', AGENT_TYPES[i % AGENT_TYPES.length])),
  ...SPECIES.flatMap((species, si) =>
    ACCESSORIES.map((accessory, ai) => ({ ...traitsFor(`mix-${si}-${ai}`, 'sub'), species, accessory, hairStyle: (si + ai) % 8 })),
  ),
];

const key = (sp: WizardSprite) => JSON.stringify([sp.px, sp.glow]);
const filled = (row: Array<RGB | null>, x0: number, x1: number) => row.slice(Math.max(0, x0), x1 + 1).filter(Boolean).length;

function rowsDrawn(sp: WizardSprite): [number, number] {
  let top = -1;
  let bottom = -1;
  sp.px.forEach((r, y) => {
    if (r.some(Boolean)) {
      if (top < 0) top = y;
      bottom = y;
    }
  });
  return [top, bottom];
}

function colsDrawn(sp: WizardSprite): [number, number] {
  let left = sp.w;
  let right = -1;
  for (const r of sp.px) {
    r.forEach((c, x) => {
      if (c) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    });
  }
  return [left, right];
}

test('every pose, facing and look yields a consistent frame anchored inside it', () => {
  for (const tr of CREW) {
    for (const pose of POSES) {
      for (const facing of FACINGS) {
        for (const t of TIMES) {
          const sp = wizardSprite(tr, pose, t, facing, 3);
          assert.equal(sp.w, WIZARD_W);
          assert.equal(sp.h, WIZARD_H);
          assert.equal(sp.px.length, sp.h);
          assert.equal(sp.glow.length, sp.h);
          for (const r of sp.px) assert.equal(r.length, sp.w);
          for (const r of sp.glow) assert.equal(r.length, sp.w);
          assert.ok(Number.isInteger(sp.ax) && sp.ax >= 0 && sp.ax < sp.w, 'ax inside');
          assert.ok(Number.isInteger(sp.ay) && sp.ay >= 0 && sp.ay < sp.h, 'ay inside');
          assert.equal(sp.ay, sp.h - 1, 'anchor on the bottom row');
          assert.ok(Number.isInteger(sp.dx) && Number.isInteger(sp.dy));
          for (const r of [...sp.px, ...sp.glow]) {
            for (const c of r) if (c) assert.ok(c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
          }
        }
      }
    }
  }
});

test('feet stand on the bottom row; ghosts float clear of it', () => {
  for (const tr of CREW) {
    for (const pose of POSES) {
      if (pose === 'sleep') continue;
      for (const facing of FACINGS) {
        for (const t of TIMES) {
          const sp = wizardSprite(tr, pose, t, facing, 1);
          const near = filled(sp.px[sp.h - 1], sp.ax - 3, sp.ax + 3);
          if (tr.species === 'ghost') assert.equal(near, 0, `ghost ${pose} touches the ground`);
          else assert.ok(near >= 2, `${tr.species} ${pose} t=${t} has no feet on the ground`);
        }
      }
    }
  }
});

test('done hops with a negative dy; other standing poses stay put', () => {
  const tr = traitsFor('hopper', 'sub');
  const dys = TIMES.map((t) => wizardSprite(tr, 'done', t, FRONT).dy);
  assert.ok(dys.some((d) => d < 0), 'some hop frames');
  assert.ok(dys.some((d) => d === 0), 'some landed frames');
  for (const pose of POSES) if (pose !== 'done') for (const t of TIMES) assert.equal(wizardSprite(tr, pose, t, FRONT).dy, 0);
});

test('flip mirrors exactly', () => {
  for (const tr of CREW.slice(0, 30)) {
    for (const pose of POSES) {
      for (const back of [false, true]) {
        for (const t of [0.13, 0.4, 1.7]) {
          const a = wizardSprite(tr, pose, t, { back, flip: false }, 2);
          const b = wizardSprite(tr, pose, t, { back, flip: true }, 2);
          for (let y = 0; y < a.h; y++) {
            for (let x = 0; x < a.w; x++) {
              assert.deepEqual(b.px[y][x], a.px[y][a.w - 1 - x]);
              assert.deepEqual(b.glow[y][x], a.glow[y][a.w - 1 - x]);
            }
          }
          assert.equal(b.ax, a.w - 1 - a.ax);
          assert.equal(b.ay, a.ay);
          assert.equal(b.dx, -a.dx);
          assert.equal(b.dy, a.dy);
          assert.equal(!!a.light, !!b.light);
          if (a.light && b.light) {
            assert.equal(b.light.dx, -a.light.dx);
            assert.equal(b.light.dy, a.light.dy);
            assert.deepEqual(b.light.color, a.light.color);
          }
        }
      }
    }
  }
});

// Eyes sit at columns 0 and 2 from the anchor, on frame row 13 (higher for
// floating ghosts; row 14 too for aliens' big eyes and for reading).
const HEAD_ROWS = [10, 11, 12, 13, 14, 15];
const eyeRow = (sp: WizardSprite) => HEAD_ROWS.find((y) => sp.glow[y][sp.ax] && sp.glow[y][sp.ax + 2]);

test('the front view has glowing eyes; the back view has none', () => {
  for (const tr of CREW) {
    // t = 1.1 is never a blink.
    const front = wizardSprite(tr, 'idle', 1.1, FRONT);
    assert.ok(eyeRow(front) !== undefined, `${tr.species}/${tr.accessory} front eyes`);
    for (const pose of POSES) {
      for (const t of TIMES) {
        const sp = wizardSprite(tr, pose, t, BACK, 4);
        for (const y of HEAD_ROWS) for (let x = sp.ax - 1; x <= sp.ax + 2; x++) assert.equal(sp.glow[y][x], null, `${tr.species} ${pose} back view glows at ${x},${y}`);
      }
    }
  }
});

test('eyes blink shut now and then', () => {
  const tr = traitsFor('blinker', 'sub');
  const open = wizardSprite(tr, 'idle', 1.1, FRONT);
  const shut = wizardSprite(tr, 'idle', 3.3 * 2 + 0.05, FRONT);
  assert.ok(eyeRow(open) !== undefined);
  assert.equal(eyeRow(shut), undefined);
});

const dominant = (c: RGB) => c.indexOf(Math.max(...c));

test('the staff tip glows in the character colour and carries the light', () => {
  for (const tr of CREW.filter((x) => x.accessory !== 'lamp')) {
    for (const pose of POSES) {
      const sp = wizardSprite(tr, pose, 0.4, FRONT);
      assert.ok(sp.light, `${pose} carries a light`);
      const L = sp.light!;
      assert.deepEqual(L.color, tr.color);
      assert.ok(L.radius >= 10 && L.radius <= 24, `radius ${L.radius}`);
      assert.ok(L.intensity > 0 && L.intensity <= 1.5);
      const tip = sp.glow[sp.ay + L.dy]?.[sp.ax + L.dx];
      assert.ok(tip, `${pose}: the light sits on a glowing pixel`);
      const spread = Math.max(...tr.color) - Math.min(...tr.color);
      if (spread > 60) assert.equal(dominant(tip!), dominant(tr.color), `${pose}: tip glow keeps the hue`);
    }
  }
});

test('the light colour follows tr.color, pulses, and a lamp shines forward', () => {
  const base = { ...traitsFor('lantern', 'sub'), species: 'human' as const, accessory: 'none' as const };
  const red = { ...base, color: hex('#ff5050') };
  const blue = { ...base, color: hex('#5080ff') };
  assert.notDeepEqual(wizardSprite(red, 'idle', 0, FRONT).light!.color, wizardSprite(blue, 'idle', 0, FRONT).light!.color);
  const radii = TIMES.map((t) => wizardSprite(red, 'idle', t, FRONT).light!.radius);
  assert.ok(new Set(radii).size > 3, 'radius pulses');
  // Delegating makes the tip flare.
  assert.ok(Math.max(...TIMES.map((t) => wizardSprite(red, 'delegate', t, FRONT).light!.intensity)) > wizardSprite(red, 'idle', 0, FRONT).light!.intensity);
  // Miner lamp: forward of the head, wider, tinted by tr.color.
  const lampR = wizardSprite({ ...red, accessory: 'lamp' }, 'idle', 0, FRONT);
  const lampB = wizardSprite({ ...blue, accessory: 'lamp' }, 'idle', 0, FRONT);
  assert.ok(lampR.light!.dx > 0 && lampR.light!.dy < -8, 'lamp light ahead at head height');
  assert.ok(lampR.light!.radius > wizardSprite(red, 'idle', 0, FRONT).light!.radius);
  assert.notDeepEqual(lampR.light!.color, lampB.light!.color);
  assert.ok(wizardSprite({ ...red, accessory: 'lamp' }, 'idle', 0, { back: false, flip: true }).light!.dx < 0);
});

test('species, accessories and hat styles all look different', () => {
  const base = { ...traitsFor('variety', 'sub'), accessory: 'none' as const };
  for (const facing of [FRONT, BACK]) {
    const bySpecies = SPECIES.map((species) => key(wizardSprite({ ...base, species }, 'idle', 1.1, facing)));
    assert.equal(new Set(bySpecies).size, SPECIES.length, 'species');
    const human = { ...base, species: 'human' as const };
    const byAccessory = ACCESSORIES.map((accessory) => key(wizardSprite({ ...human, accessory }, 'idle', 1.1, facing)));
    // From behind, glasses are invisible.
    assert.equal(new Set(byAccessory).size, ACCESSORIES.length - (facing.back ? 1 : 0), 'accessories');
    const byStyle = Array.from({ length: 8 }, (_, hairStyle) => key(wizardSprite({ ...human, hairStyle }, 'idle', 1.1, facing)));
    assert.equal(new Set(byStyle).size, 8, 'hat styles');
  }
});

test('the robe wears the shirt colour, trimmed; patterns vary the trim', () => {
  const tr = { ...traitsFor('tailor', 'sub'), species: 'human' as const, accessory: 'none' as const };
  const looks = ['█', '▓', '▒', '▼', '◆', '║', '╋', '♥'].map((pattern) => key(wizardSprite({ ...tr, pattern }, 'idle', 1.1, FRONT)));
  assert.equal(new Set(looks).size, 8);
  const sp = wizardSprite(tr, 'idle', 1.1, FRONT);
  const flat = sp.px.flat().filter(Boolean).map((c) => JSON.stringify(c));
  assert.ok(flat.includes(JSON.stringify(tr.shirt)), 'shirt');
  assert.ok(flat.includes(JSON.stringify(tr.trim)), 'trim');
});

test('drawn figures are 10..16 px tall; sleepers lie down', () => {
  for (const tr of CREW) {
    for (const pose of POSES) {
      for (const facing of FACINGS) {
        for (const t of [0.13, 0.55, 1.7]) {
          const sp = wizardSprite(tr, pose, t, facing, 0);
          const [top, bottom] = rowsDrawn(sp);
          const [left, right] = colsDrawn(sp);
          const h = bottom - top + 1;
          if (pose === 'sleep') {
            assert.ok(right - left + 1 > 2 * h, `sleep is lying down (${right - left + 1}x${h})`);
          } else {
            assert.ok(h >= 10 && h <= 16, `${tr.species}/${tr.accessory} ${pose} is ${h} px tall`);
          }
        }
      }
    }
  }
});

test('every pose animates', () => {
  const steps = Array.from({ length: 34 }, (_, i) => i * 0.1);
  for (const tr of [traitsFor('anim-a', 'sub'), traitsFor('anim-b', 'lead')]) {
    for (const pose of POSES) {
      const frames = new Set(steps.map((t) => key(wizardSprite(tr, pose, t, FRONT)) + wizardSprite(tr, pose, t, FRONT).dy));
      assert.ok(frames.size >= 2, `${pose} has ${frames.size} frame(s)`);
    }
  }
  // Walk is a four-step cycle.
  const tr = { ...traitsFor('walker', 'sub'), species: 'human' as const };
  const walk = new Set([0, 0.125, 0.25, 0.375].map((t) => key(wizardSprite(tr, 'walk', t + 0.01, FRONT))));
  assert.equal(walk.size, 4);
});

test('error shakes and flashes red', () => {
  const tr = { ...traitsFor('oops', 'sub'), species: 'human' as const };
  const frames = TIMES.map((t) => wizardSprite(tr, 'error', t, FRONT));
  assert.ok(frames.some((f) => f.dx !== 0), 'shake');
  const redness = (sp: WizardSprite) => sp.px.flat().reduce((s, c) => s + (c ? c[0] - (c[1] + c[2]) / 2 : 0), 0);
  const calm = redness(wizardSprite(tr, 'idle', 0.1, FRONT));
  assert.ok(frames.some((f) => redness(f) > calm * 1.5 + 200), 'red flash');
});

test('deterministic for the same inputs; phase desyncs', () => {
  for (const tr of CREW.slice(0, 12)) {
    for (const pose of POSES) {
      const a = wizardSprite(tr, pose, 1.234, FRONT, 5);
      const b = wizardSprite(tr, pose, 1.234, FRONT, 5);
      assert.deepEqual(a, b);
    }
  }
  const tr = traitsFor('phased', 'sub');
  const a = TIMES.map((t) => key(wizardSprite(tr, 'walk', t, FRONT, 0)));
  const b = TIMES.map((t) => key(wizardSprite(tr, 'walk', t, FRONT, 1)));
  assert.notDeepEqual(a, b);
});
