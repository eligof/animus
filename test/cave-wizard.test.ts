import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emoteSprite, WIZARD_H, WIZARD_W, wizardSprite } from '../src/cave/wizard.ts';
import type { Facing, WizardSprite } from '../src/cave/types.ts';
import type { RGB } from '../src/term/color.ts';
import { hex } from '../src/term/color.ts';
import { traitsFor } from '../src/world/character.ts';
import type { Accessory, Costume, Emote, Pose, Species, Traits } from '../src/world/character.ts';

// The work poses (the wizard's originals) and the little life in between.
const POSES: Pose[] = ['idle', 'walk', 'write', 'read', 'think', 'run', 'search', 'web', 'delegate', 'talk', 'done', 'error', 'sleep'];
const LIFE: Pose[] = ['sit', 'carry', 'place', 'cheer', 'wave', 'drink', 'stretch', 'chat', 'flinch', 'dance', 'pet'];
const ALL_POSES: Pose[] = [...POSES, ...LIFE];
const COSTUMES: Costume[] = ['wizard', 'scientist', 'raver', 'hacker', 'astronaut', 'casual'];
const EMOTES: Emote[] = ['excl', 'question', 'heart', 'note', 'idea', 'sweat', 'zzz', 'anger', 'star', 'cup'];
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

// ── costumes and the new poses ───────────────────────────────────────────
// A spread of the crew for the bigger matrices: app-made characters and
// every species with a few accessories.
const SAMPLE: Traits[] = CREW.filter((_, i) => i % 3 === 0);
const FEW = [0.07, 0.4, 1.1, 2.7];
const dress = (costume: Costume, item?: RGB) => ({ costume, item });

test('every costume, pose, facing and look yields a consistent frame anchored inside it', () => {
  for (const costume of COSTUMES) {
    for (const tr of SAMPLE) {
      for (const pose of ALL_POSES) {
        for (const facing of FACINGS) {
          for (const t of FEW) {
            const sp = wizardSprite(tr, pose, t, facing, 3, dress(costume));
            assert.equal(sp.w, WIZARD_W);
            assert.equal(sp.h, WIZARD_H);
            assert.equal(sp.px.length, sp.h);
            assert.equal(sp.glow.length, sp.h);
            for (const r of sp.px) assert.equal(r.length, sp.w);
            for (const r of sp.glow) assert.equal(r.length, sp.w);
            assert.equal(sp.ax, (WIZARD_W - 1) / 2, 'anchor centred');
            assert.equal(sp.ay, sp.h - 1, 'anchor on the bottom row');
            assert.ok(Number.isInteger(sp.dx) && Number.isInteger(sp.dy));
            for (const r of [...sp.px, ...sp.glow]) {
              for (const c of r) if (c) assert.ok(c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
            }
            if (sp.light) {
              const y = sp.ay + sp.light.dy;
              const x = sp.ax + sp.light.dx;
              assert.ok(y >= 0 && y < sp.h && x >= 0 && x < sp.w, `${costume} ${pose}: light inside the frame`);
              assert.ok(sp.light.radius >= 10 && sp.light.radius <= 24 && sp.light.intensity > 0 && sp.light.intensity <= 1.5);
            }
          }
        }
      }
    }
  }
});

test('in every costume and pose feet stand on the bottom row; ghosts float clear', () => {
  for (const costume of COSTUMES) {
    for (const tr of SAMPLE) {
      for (const pose of ALL_POSES) {
        if (pose === 'sleep') continue;
        for (const back of [false, true]) {
          for (const t of FEW) {
            const sp = wizardSprite(tr, pose, t, { back, flip: false }, 1, dress(costume));
            const near = filled(sp.px[sp.h - 1], sp.ax - 3, sp.ax + 3);
            if (tr.species === 'ghost') assert.equal(near, 0, `ghost ${costume} ${pose} touches the ground`);
            else assert.ok(near >= 2, `${costume} ${tr.species} ${pose} t=${t} has no feet on the ground`);
          }
        }
      }
    }
  }
});

test('costumes look different from each other, front and back, in every pose', () => {
  for (const tr of [...SAMPLE.slice(0, 6), traitsFor('dresser', 'lead')]) {
    for (const pose of ALL_POSES) {
      for (const facing of [FRONT, BACK]) {
        const looks = COSTUMES.map((costume) => key(wizardSprite(tr, pose, 1.1, facing, 0, dress(costume))));
        assert.equal(new Set(looks).size, COSTUMES.length, `${tr.species}/${tr.accessory} ${pose} back=${facing.back}`);
      }
    }
  }
  // Without opts, or with no costume named, the figure is a wizard.
  const tr = traitsFor('robed', 'sub');
  for (const pose of ALL_POSES) {
    const plain = key(wizardSprite(tr, pose, 0.7, FRONT));
    assert.equal(key(wizardSprite(tr, pose, 0.7, FRONT, 0, {})), plain);
    assert.equal(key(wizardSprite(tr, pose, 0.7, FRONT, 0, dress('wizard'))), plain);
  }
});

// Swapping the eye colour changes the eyes and nothing else.
const eyed = (tr: Traits, eye: string): Traits => ({ ...tr, eye: hex(eye) });
const fixedEyes = (tr: Traits) => tr.species === 'robot' && tr.hairStyle % 2 === 1;

test('every costume has glowing eyes in front (or a light); back views show no eyes', () => {
  for (const costume of COSTUMES) {
    for (const tr of SAMPLE) {
      // t = 1.1 is never a blink.
      const a = wizardSprite(eyed(tr, '#ff2020'), 'idle', 1.1, FRONT, 0, dress(costume));
      const b = wizardSprite(eyed(tr, '#20ff20'), 'idle', 1.1, FRONT, 0, dress(costume));
      const glows = a.glow.flat().some(Boolean);
      assert.ok(glows, `${costume} ${tr.species}/${tr.accessory} glows somewhere`);
      if (!fixedEyes(tr)) assert.notEqual(key(a), key(b), `${costume} ${tr.species}/${tr.accessory}: eyes show in front`);
      for (const pose of ALL_POSES) {
        for (const t of FEW) {
          const c = wizardSprite(eyed(tr, '#ff2020'), pose, t, BACK, 4, dress(costume));
          const d = wizardSprite(eyed(tr, '#20ff20'), pose, t, BACK, 4, dress(costume));
          assert.equal(key(c), key(d), `${costume} ${tr.species} ${pose}: eyes seen from behind`);
        }
      }
    }
  }
});

test('each costume carries its own light, from a glowing source', () => {
  const plain = { ...traitsFor('glowy', 'sub'), species: 'human' as const, accessory: 'none' as const, hairStyle: 1 };
  // Lights everywhere except casual clothes (only the phone, while browsing).
  for (const costume of COSTUMES) {
    for (const pose of ALL_POSES) {
      const sp = wizardSprite(plain, pose, 0.4, FRONT, 0, dress(costume));
      if (costume === 'casual') assert.equal(!!sp.light, pose === 'web', `casual ${pose}`);
      else assert.ok(sp.light, `${costume} ${pose} carries a light`);
    }
    // Standing about, the light sits on a glowing pixel (the astronaut's
    // lamp shines from just ahead of its lens).
    const sp = wizardSprite(plain, costume === 'casual' ? 'web' : 'idle', 0.4, FRONT, 0, dress(costume));
    const L = sp.light!;
    const g = sp.glow[sp.ay + L.dy][sp.ax + L.dx] ?? sp.glow[sp.ay + L.dy][sp.ax + L.dx - 1];
    assert.ok(g, `${costume}: the light sits on a glowing pixel`);
  }
  // Glow sticks, vials and headbands take the character's colour; the helmet lamp is wide.
  const red = { ...plain, color: hex('#ff5050') };
  const blue = { ...plain, color: hex('#5080ff') };
  for (const costume of ['scientist', 'raver', 'hacker'] as const) {
    assert.deepEqual(wizardSprite(red, 'idle', 0.4, FRONT, 0, dress(costume === 'hacker' ? 'raver' : costume)).light!.color, red.color);
    assert.notDeepEqual(wizardSprite(red, 'idle', 0.4, FRONT, 0, dress(costume)).light!.color, wizardSprite(blue, 'idle', 0.4, FRONT, 0, dress(costume)).light!.color);
  }
  const helmet = wizardSprite(red, 'idle', 0.4, FRONT, 0, dress('astronaut')).light!;
  assert.ok(helmet.radius >= 16 && helmet.dy < -8 && helmet.dx > 0, 'helmet lamp ahead at head height');
});

test('carrying holds a block of the item colour over the head', () => {
  for (const costume of COSTUMES) {
    for (const tr of SAMPLE.slice(0, 8)) {
      for (const item of [hex('#c9a66b'), hex('#3a7bd5')]) {
        for (const t of [0.05, 0.2, 0.33]) {
          const sp = wizardSprite(tr, 'carry', t, FRONT, 0, dress(costume, item));
          const rows = sp.px.map((r) => r.some((c) => c && c[0] === item[0] && c[1] === item[1] && c[2] === item[2]));
          const top = rows.indexOf(true);
          assert.ok(top >= 0, `${costume} carry shows the item colour`);
          assert.ok(top < sp.ay - 12, `${costume} block is overhead (row ${top})`);
        }
      }
      // Without an item it is a stone grey, and placing shows it too.
      const stone = wizardSprite(tr, 'carry', 0.1, FRONT, 0, dress(costume));
      assert.notEqual(key(stone), key(wizardSprite(tr, 'carry', 0.1, FRONT, 0, dress(costume, hex('#3a7bd5')))));
      const place = wizardSprite(tr, 'place', 1, FRONT, 0, dress(costume, hex('#3a7bd5')));
      assert.ok(place.px.flat().some((c) => c && c[0] === 0x3a && c[1] === 0x7b && c[2] === 0xd5), `${costume} place shows the block`);
    }
  }
});

test('flip mirrors exactly in every costume and pose', () => {
  for (const costume of COSTUMES) {
    for (const tr of SAMPLE.slice(0, 10)) {
      for (const pose of ALL_POSES) {
        for (const back of [false, true]) {
          for (const t of [0.13, 0.4, 1.7]) {
            const a = wizardSprite(tr, pose, t, { back, flip: false }, 2, dress(costume));
            const b = wizardSprite(tr, pose, t, { back, flip: true }, 2, dress(costume));
            for (let y = 0; y < a.h; y++) {
              assert.deepEqual(b.px[y], a.px[y].slice().reverse());
              assert.deepEqual(b.glow[y], a.glow[y].slice().reverse());
            }
            assert.equal(b.dx, -a.dx);
            assert.equal(b.dy, a.dy);
            assert.equal(!!a.light, !!b.light);
            if (a.light && b.light) {
              assert.equal(b.light.dx, -a.light.dx);
              assert.equal(b.light.dy, a.light.dy);
            }
          }
        }
      }
    }
  }
});

test('the new poses animate in every costume', () => {
  const steps = Array.from({ length: 36 }, (_, i) => i * 0.1);
  for (const costume of COSTUMES) {
    for (const tr of [traitsFor('life-a', 'sub'), traitsFor('life-b', 'lead')]) {
      for (const pose of ALL_POSES) {
        const frames = new Set(steps.map((t) => {
          const sp = wizardSprite(tr, pose, t, FRONT, 0, dress(costume));
          return key(sp) + sp.dx + sp.dy;
        }));
        assert.ok(frames.size >= 2, `${costume} ${pose} has ${frames.size} frame(s)`);
      }
    }
  }
  // Walking with a block is a four-step cycle too.
  const tr = { ...traitsFor('porter', 'sub'), species: 'human' as const };
  for (const costume of COSTUMES) {
    const steps4 = new Set([0, 0.125, 0.25, 0.375].map((t) => key(wizardSprite(tr, 'carry', t + 0.01, FRONT, 0, dress(costume)))));
    assert.equal(steps4.size, 4, `${costume} carry`);
  }
});

// ── pose legibility ──────────────────────────────────────────────────────
// The poses an agent spends its time in at work, and figures that hold
// still apart from the pose: no ghost tail rippling, no lead's twinkling
// star. Over t = 0.2..1.4 s (phase 0) nobody blinks.
const WORK: Pose[] = ['walk', 'read', 'write', 'search', 'run', 'web', 'think', 'talk'];
const STILL: Traits[] = (['human', 'robot', 'cat', 'alien'] as const).map((species, i) => ({
  ...traitsFor(`still-${species}`, 'sub'),
  species,
  accessory: (['none', 'glasses', 'goggles', 'hood'] as const)[i],
  hairStyle: i * 2,
}));
const SECOND = Array.from({ length: 13 }, (_, i) => 0.2 + i * 0.1);
const solidKey = (sp: WizardSprite) => JSON.stringify(sp.px);

// [rows, cols] spanned by the pixels (glow aside) that change over the frames.
function motionBox(frames: WizardSprite[]): [number, number] {
  const [first, ...rest] = frames.map((sp) => sp.px.map((r) => r.map((c) => JSON.stringify(c))));
  let top = Infinity;
  let bottom = -1;
  let left = Infinity;
  let right = -1;
  for (const px of rest) {
    px.forEach((r, y) => r.forEach((c, x) => {
      if (c === first[y][x]) return;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }));
  }
  return bottom < 0 ? [0, 0] : [bottom - top + 1, right - left + 1];
}

test('every working pose moves solid pixels within 1.2 s, in every costume', () => {
  for (const costume of COSTUMES) {
    for (const tr of STILL) {
      for (const pose of WORK) {
        const frames = SECOND.map((t) => wizardSprite(tr, pose, t, FRONT, 0, dress(costume)));
        const looks = new Set(frames.map(solidKey));
        assert.ok(looks.size >= 2, `${costume} ${tr.species} ${pose} holds still (only its glow changes)`);
        const [h, w] = motionBox(frames);
        assert.ok(Math.max(h, w) >= 2, `${costume} ${tr.species} ${pose} moves only ${h}x${w}`);
      }
    }
  }
});

test('walking: the legs swing apart and together and the body bobs a pixel', () => {
  // The four steps, 1/8 s apart: contact, passing, contact, passing.
  const at = [0.51, 0.635, 0.76, 0.885];
  const legs = (sp: WizardSprite) => JSON.stringify(sp.px.slice(sp.ay - 3));
  const stride = (sp: WizardSprite) => {
    const xs = sp.px[sp.ay].flatMap((c, x) => (c ? [x] : []));
    return Math.max(...xs) - Math.min(...xs) + 1;
  };
  for (const costume of COSTUMES) {
    for (const tr of STILL) {
      const [c0, p0, c1, p1] = at.map((t) => wizardSprite(tr, 'walk', t, FRONT, 0, dress(costume)));
      const who = `${costume} ${tr.species}`;
      assert.notEqual(legs(c0), legs(p0), `${who}: the legs move between steps`);
      assert.notEqual(legs(c0), legs(c1), `${who}: the legs alternate`);
      assert.ok(stride(c0) > stride(p0) && stride(c1) > stride(p1), `${who}: feet apart on contact, together passing`);
      assert.equal(rowsDrawn(p0)[0], rowsDrawn(c0)[0] - 1, `${who}: the passing step lifts the head a pixel`);
      assert.equal(rowsDrawn(p1)[0], rowsDrawn(c1)[0] - 1, `${who}: and again on the other foot`);
    }
  }
  // A ghost has no legs but bobs all the same.
  const ghost = { ...STILL[0], species: 'ghost' as const };
  const [c0, p0] = at.map((t) => wizardSprite(ghost, 'walk', t, FRONT));
  assert.equal(rowsDrawn(p0)[0], rowsDrawn(c0)[0] - 1, 'ghost bobs');
});

test('reading turns a page every 0.8 s; writing swings the tool at least three pixels', () => {
  for (const costume of COSTUMES) {
    for (const tr of STILL) {
      const who = `${costume} ${tr.species}`;
      const read = (t: number) => solidKey(wizardSprite(tr, 'read', t, FRONT, 0, dress(costume)));
      // Mid-turn vs. settled; and the same again a page later.
      assert.notEqual(read(0.85), read(1.3), `${who}: no page turns`);
      assert.equal(read(0.4), read(1.2), `${who}: pages turn every 0.8 s`);
      assert.equal(read(0.85), read(1.65), `${who}: pages turn every 0.8 s`);
      // The hammer, glow stick or Enter-key hand travels three pixels or more
      // up and down: six rows with the pixel itself and its rim at both ends.
      const [h] = motionBox(SECOND.map((t) => wizardSprite(tr, 'write', t, FRONT, 0, dress(costume))));
      assert.ok(h >= 6, `${who}: write swings over only ${h} rows`);
    }
  }
});

test('cheering hops, flinching jumps back; the rest keep still', () => {
  const tr = { ...traitsFor('jumpy', 'sub'), species: 'human' as const };
  const steps = Array.from({ length: 30 }, (_, i) => i * 0.05);
  for (const costume of COSTUMES) {
    const cheer = steps.map((t) => wizardSprite(tr, 'cheer', t, FRONT, 0, dress(costume)));
    assert.ok(cheer.some((s) => s.dy < 0) && cheer.some((s) => s.dy === 0), `${costume} cheer hops`);
    const flinch = steps.map((t) => wizardSprite(tr, 'flinch', t, FRONT, 0, dress(costume)));
    assert.ok(flinch.some((s) => s.dy < 0), `${costume} flinch jumps`);
    assert.ok(flinch.every((s) => s.dx < 0), `${costume} flinch leans back, away from where it faces`);
    assert.ok(wizardSprite(tr, 'flinch', 0.5, { back: false, flip: true }, 0, dress(costume)).dx > 0, 'and mirrors');
    for (const pose of LIFE) {
      if (pose === 'cheer' || pose === 'flinch') continue;
      for (const t of steps) {
        const sp = wizardSprite(tr, pose, t, FRONT, 0, dress(costume));
        assert.equal(sp.dy, 0, `${costume} ${pose} dy`);
        assert.equal(sp.dx, 0, `${costume} ${pose} dx`);
      }
    }
  }
});

test('sitting and crouching are lower, carrying taller, sleeping lies down', () => {
  const height = (sp: WizardSprite) => {
    const [top, bottom] = rowsDrawn(sp);
    return bottom - top + 1;
  };
  for (const costume of COSTUMES) {
    for (const tr of SAMPLE) {
      const stand = height(wizardSprite(tr, 'idle', 1.1, FRONT, 0, dress(costume)));
      for (const t of [0.13, 0.55, 1.7]) {
        for (const pose of ALL_POSES) {
          const sp = wizardSprite(tr, pose, t, FRONT, 0, dress(costume));
          const h = height(sp);
          if (pose === 'sleep') {
            const [left, right] = colsDrawn(sp);
            assert.ok(right - left + 1 > 2 * h, `${costume} sleep is lying down`);
          } else {
            assert.ok(h >= 8 && h <= 19, `${costume} ${tr.species} ${pose} is ${h} px tall`);
          }
        }
        if (tr.species === 'ghost') continue;
        for (const pose of ['sit', 'place', 'pet'] as const) {
          assert.ok(height(wizardSprite(tr, pose, t, FRONT, 0, dress(costume))) < stand, `${costume} ${pose} is lower`);
        }
        // (A pointed hat, a crown or feelers can reach as high as the block.)
        assert.ok(height(wizardSprite(tr, 'carry', t, FRONT, 0, dress(costume))) >= stand, `${costume} carry is no shorter`);
      }
    }
  }
});

test('costumes and the new poses are deterministic; phase desyncs them', () => {
  for (const costume of COSTUMES) {
    for (const tr of SAMPLE.slice(0, 6)) {
      for (const pose of ALL_POSES) {
        const a = wizardSprite(tr, pose, 1.234, FRONT, 5, dress(costume, hex('#aa5500')));
        const b = wizardSprite(tr, pose, 1.234, FRONT, 5, dress(costume, hex('#aa5500')));
        assert.deepEqual(a, b);
      }
    }
    const tr = traitsFor('phased', 'sub');
    const a = TIMES.map((t) => key(wizardSprite(tr, 'dance', t, FRONT, 0, dress(costume))));
    const b = TIMES.map((t) => key(wizardSprite(tr, 'dance', t, FRONT, 1, dress(costume))));
    assert.notDeepEqual(a, b);
  }
});

test('lab coats and space suits wear the character colour, so a white floor cannot hide it', () => {
  const base = { ...traitsFor('identity', 'sub'), species: 'human' as const, accessory: 'none' as const, hairStyle: 0 };
  const cyan = { ...base, color: hex('#4fe3f0') };
  const magenta = { ...base, color: hex('#f04fd8') };
  // Body rows r (frame row ay - 12 + r), columns c0..c1 from the anchor.
  const region = (sp: WizardSprite, r0: number, r1: number, c0: number, c1: number) =>
    sp.px.slice(sp.ay - 12 + r0, sp.ay - 11 + r1).flatMap((r) => r.slice(sp.ax + c0, sp.ax + c1 + 1));
  // The clothes from the neck to the knee, the back arm and pack included.
  const torso = (sp: WizardSprite) => region(sp, 7, 10, -4, 2);
  const same = (a: RGB | null, b: RGB | null) => JSON.stringify(a) === JSON.stringify(b);
  for (const costume of ['scientist', 'astronaut'] as const) {
    for (const facing of [FRONT, BACK]) {
      for (const pose of ['idle', 'walk', 'talk'] as const) {
        const a = torso(wizardSprite(cyan, pose, 1.1, facing, 0, dress(costume)));
        const b = torso(wizardSprite(magenta, pose, 1.1, facing, 0, dress(costume)));
        const differ = a.filter((c, i) => !same(c, b[i])).length;
        assert.ok(differ >= 5, `${costume} ${pose} back=${facing.back}: only ${differ} pixel(s) show the colour`);
      }
    }
    // The astronaut keeps its white suit everywhere else (legs here).
    if (costume === 'astronaut') {
      const legs = (tr: Traits) => region(wizardSprite(tr, 'idle', 1.1, FRONT, 0, dress(costume)), 10, 11, -2, 2);
      assert.deepEqual(legs(cyan), legs(magenta), 'the suit stays white below the band');
    }
  }
  // The coat itself is tinted toward the character's own colour, no longer white.
  const chroma = (c: RGB) => Math.max(...c) - Math.min(...c);
  const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const commonest = (px: Array<RGB | null>): RGB => {
    const n = new Map<string, number>();
    for (const c of px) if (c) n.set(JSON.stringify(c), (n.get(JSON.stringify(c)) ?? 0) + 1);
    return JSON.parse([...n].sort((a, b) => b[1] - a[1])[0][0]);
  };
  for (const facing of [FRONT, BACK]) {
    const coat = (tr: Traits) => commonest(torso(wizardSprite(tr, 'idle', 1.1, facing, 0, dress('scientist'))));
    const [a, b] = [coat(cyan), coat(magenta)];
    assert.ok(chroma(a) > 30 && chroma(b) > 30, `the coat is tinted, not white (${a}, ${b})`);
    assert.ok(dist(a, cyan.color) < dist(a, magenta.color), 'a cyan coat for a cyan character');
    assert.ok(dist(b, magenta.color) < dist(b, cyan.color), 'a magenta coat for a magenta character');
  }
});

// ── emotes ───────────────────────────────────────────────────────────────
const luma = (c: RGB) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

test('emotes are small framed icons anchored at the bottom centre', () => {
  for (const e of EMOTES) {
    const first = emoteSprite(e, 0);
    for (const t of [0, 0.2, 0.45, 0.9, 1.3, 7.7]) {
      const sp = emoteSprite(e, t);
      assert.ok(sp.w >= 4 && sp.w <= 9 && sp.h >= 4 && sp.h <= 9, `${e} is ${sp.w}x${sp.h}`);
      assert.equal(sp.w, first.w, `${e} keeps its size`);
      assert.equal(sp.h, first.h, `${e} keeps its size`);
      assert.equal(sp.px.length, sp.h);
      assert.equal(sp.glow.length, sp.h);
      for (const r of [...sp.px, ...sp.glow]) assert.equal(r.length, sp.w);
      assert.equal(sp.ax, Math.floor(sp.w / 2));
      assert.equal(sp.ay, sp.h - 1);
      const px = sp.px.flat().filter((c): c is RGB => !!c);
      assert.ok(px.some((c) => luma(c) < 40), `${e} has a dark rim`);
      assert.ok(px.some((c) => luma(c) > 120), `${e} has a bright face`);
      // The rim surrounds the picture: nothing bright on the frame's edge.
      for (let y = 0; y < sp.h; y++) {
        for (let x = 0; x < sp.w; x++) {
          const edge = y === 0 || x === 0 || y === sp.h - 1 || x === sp.w - 1;
          const c = sp.px[y][x];
          if (edge && c && e !== 'cup') assert.ok(luma(c) < 60, `${e} edge pixel ${x},${y} is bright`);
        }
      }
    }
  }
});

test('emotes are UI, not lights: bright colours, no glow; they animate and are deterministic', () => {
  const bright = new Set<Emote>(['heart', 'idea', 'star', 'excl']);
  for (const e of EMOTES) {
    const frames = [0, 0.45].map((t) => emoteSprite(e, t));
    for (const sp of frames) {
      assert.equal(sp.glow.flat().filter(Boolean).length, 0, `${e} glows (it would tint the floor)`);
      const top = Math.max(...sp.px.flat().filter((c): c is RGB => !!c).map(luma));
      assert.ok(top > (bright.has(e) ? 180 : 120), `${e} is bright (${Math.round(top)})`);
    }
    assert.notEqual(JSON.stringify(frames[0]), JSON.stringify(frames[1]), `${e} animates`);
    assert.deepEqual(emoteSprite(e, 3.21), emoteSprite(e, 3.21));
  }
  assert.equal(new Set(EMOTES.map((e) => JSON.stringify(emoteSprite(e, 0).px))).size, EMOTES.length, 'all different');
});
