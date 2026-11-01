import type { Pen } from '../art/types.ts';
import type { Layout, Particle, Poi, SlotKind } from '../world/types.ts';
import type { RGB } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { Costume } from '../world/character.ts';
import type { Sketch } from '../art/figure/paint.ts';

// An illustrated world: a room drawn as outlined cartoon art in 2:1
// isometric, its props, and how the characters live in it.
//
// World units: x and y on the floor, z up; the floor is z = 0 and the two
// back walls are slabs x < T and y < T. The scene projects a unit point to
// canvas pixels with `s` pixels per unit:
//
//   px = ox + (x - y) * s
//   py = oy + (x + y) * s / 2 - z * s
//
// Larger x + y is nearer the viewer.
export type Project = (x: number, y: number, z: number) => [number, number];

// What a prop draws with. `at(u, v, z)` maps prop-local units to canvas
// pixels: u runs along its wall (0..len), v out from the wall into the
// room (0..dep), z up from the floor. One drawing serves both walls and
// free-standing islands (which are drawn as if backed onto `wall`, front
// toward the viewer). `t` is the scene clock in seconds; `active` is true
// while an agent works the prop; `seed` varies the details per placement.
// `lit` is false at night, with the lights off (the `l` key): a lamp is
// drawn switched off then (its shade unlit, no glow). The scene always
// says; a view made without it (a test's) counts as lit, so read it as
// `v.lit !== false` (see lampsOn in art/scene/light.ts).
export type PropView = {
  pen: Pen;
  s: number;
  at(u: number, v: number, z: number): [number, number];
  len: number;
  dep: number;
  wall: 'left' | 'right';
  island: boolean;
  t: number;
  active: boolean;
  seed: number;
  lit?: boolean;
};

// A piece of furniture or machinery. `len` x `dep` is its footprint on the
// floor (units), `height` how tall it stands (units); characters walk
// around the footprint. Props that are not `animated` are drawn once and
// cached; animated ones are redrawn every frame (keep them small). `emit`
// may spawn particles each frame (steam off a cup, sparks while active).
export type PropArt = {
  len: number;
  dep: number;
  height: number;
  // A station a local works (see Npc) is shown worked as a loop of two
  // seconds, its pictures drawn once and kept (see CYCLE in art/scene.ts):
  // what moves on it while worked (beats, turns) should repeat within 2 s.
  animated?: boolean;
  // An animated prop that moves while nobody works it (`v.active` false: a
  // lava pool, a hearth, a cabinet's attract screen), so it is drawn again
  // every ambient step. Without it, one idle draws the same whatever the
  // clock, and is drawn once until it is worked.
  movesIdle?: boolean;
  // The light it gives, in its own frame (see PropLight): the scene lays
  // the pools, washes and spill on the room's base and the glow round the
  // light itself over everything, all drawn once (see art/scene/light.ts).
  light?: readonly PropLight[];
  draw(v: PropView): void;
  emit?(v: PropView, dt: number, spawn: (p: Particle) => void): void;
};

// A point, and a quad (four corners going round, the first at its bottom
// left as the viewer sees it), in a prop's frame (u, v, z).
export type P3 = readonly [number, number, number];
export type Quad = readonly [P3, P3, P3, P3];

// A small thing that may stand on a workstation's top (see
// WorkstationArt.clutter), in the world's style: `r` is the radius of its
// footprint (at most 0.5) and `h` how tall it stands (units, at most 1.5),
// round where it stands. `draw` paints it standing at `at` (u, v on the top,
// z the top's surface) with the desk's view (`v.active` while its screen is
// on: a candle may be lit). It never reads `v.t`: it is drawn once and
// kept. `name` tells it apart (camelCase, unique in its world).
export type Clutter = { name: string; r: number; h: number; draw(v: PropView, at: P3): void };

// Something on a workstation that moves while its agent works (a
// lantern's flame, a cauldron's bubbles, steam off a cup): a loop `secs`
// seconds long (0.4 to 3), drawn 15 pictures a second (see framesFor in
// art/motion.ts), standing at `at` in the desk's frame, inside `r` round it
// and `h` over it. `draw` paints it `u` round the loop (0 to 1, a smooth
// function of u); u = 0 is also the still one shown while the screen is
// off (`v.active` false: unlit). It never reads `v.t`, and every frame paints
// something, lit or not (a loop of steam draws its cup too). Loops draw the
// same on every look of the desk (they get look 0), and stand clear of the
// clutter's spots. The desk's own draw leaves out what its loops paint.
export type DeskLoop = { name: string; at: P3; r: number; h: number; secs: number; draw(v: PropView, u: number): void };

// A world's workstation (see world/desks.ts): a prop DESK.len x DESK.dep
// that stands at most DESK.height tall. Its own picture is never animated
// (it is drawn once a scale, frame, look and pick of clutter, and kept; see
// art/scene/desk.ts); its loops are pictures of their own. Its agent stands
// at DESK_SPOT, in front. It names where its screen is (`screen`, upright on
// its body, to the right of where its agent stands: the shared activity
// layer draws on it, see art/screen.ts) and where a desk upgrade stands on
// it (`top`, on its top surface). `v.active` is true while its screen is on;
// `v.seed` is 0, 1 or 2: the world's few looks of it. `clutter`: things a
// place's desk picks a few of (see clutterOf in ./workstation.ts) and the
// spots on the top they may stand on, clear of the screen, the upgrade and
// the agent at work; `loops`: one or two things that move on it while its
// agent works, clear of the same and of the clutter's spots.
export type WorkstationArt = PropArt & {
  screen: Quad;
  top: P3;
  clutter?: { items: readonly Clutter[]; spots: readonly P3[] };
  loops?: readonly DeskLoop[];
};

// ── the locals (see world/npcs.ts) ───────────────────────────────────────
// Three people in every world who are not agents: each works one of its
// stations all the time (a DJ at the booth, a barista at the espresso
// bar), drawn by the world on a puppet of its own parts (see
// art/npc/puppet.ts), in the figures' style and units (see
// art/figure/rig.ts): its frame's origin between its feet on the floor, x
// toward where it faces, y down; about an agent's height.

// What a local is doing: its own loops (`work`, always, under everything
// else; `show`, a performance a crowd gathers round; `celebrate`, its own
// way of cheering a finish) or one of the acts every local shares (see
// art/npc/acts.ts).
export type NpcAct = 'work' | 'show' | 'celebrate' | 'wave' | 'cheer' | 'flinch' | 'applaud' | 'talk' | 'nod' | 'handOver' | 'beckon';
export type NpcEyes = 'open' | 'blink' | 'happy' | 'shut';
export type NpcMouth = 'closed' | 'open' | 'smile' | 'o';

// An arm: swung `sh` radians at the shoulder from hanging straight down
// (+ forward, toward where it faces; PI straight up), bent `el` radians at
// the elbow the same way. Never changed once made: puppets share them.
export type Swing = { readonly sh: number; readonly el: number };

// A local's puppet in one frame: which act it plays (a celebration with
// none of its own plays the shared cheer, so is 'cheer') and how far into
// it (`u`, 0 to 1), its body lifted (`bob`, units) and leaning about its feet (`lean`,
// radians, + toward where it faces), its head tilted about the neck
// (`tilt`, + a nod forward), its arms (0 the near one, on the side away
// from where it faces: it hands things over; 1 the far one: it waves and
// beckons), its eyes and mouth, and whether its near hand holds out what
// it serves (`hold`).
export type Puppet = { act: NpcAct; u: number; bob: number; lean: number; tilt: number; arms: readonly [Swing, Swing]; eyes: NpcEyes; mouth: NpcMouth; hold: boolean };

// Where a local's parts join, in its frame: its neck, its shoulders (0
// near, 1 far) and its arm's two lengths (shoulder to elbow, elbow to
// hand).
export type Bones = { neck: readonly [number, number]; shoulders: readonly [readonly [number, number], readonly [number, number]]; upper: number; fore: number };

// A local's parts, each drawn with the sketch API (see art/figure/paint.ts)
// in its own frame, from behind when `back`: `body` in the local's frame
// (it bobs and leans with the puppet: legs, torso, what hangs on it);
// `head` with its origin at the neck (the head above it, toward -y; its
// eyes and mouth from the puppet, see art/npc/face.ts); `upper` and `fore`,
// arm k's upper arm and forearm, origin at the shoulder and at the elbow,
// the arm along +y (the hand at (0, fore)). A part may read the puppet's
// act and `u` for what moves in it (a page turning, a record spinning).
// Its hands hold its tools (what it works with: a pot, a hammer, a quill)
// only in its own loops, its work, its show and its celebration, which
// hold what they show (see own in art/npc/acts.ts). In a shared act (a
// wave, a cheer, a flinch, applause, a word, a nod, a beckon) its hands
// are empty, and in the hand-over the near one holds only what it serves,
// which the puppet draws (see Npc.serve).
export type NpcParts = {
  body(sk: Sketch, p: Puppet, back: boolean): void;
  head(sk: Sketch, p: Puppet, back: boolean): void;
  upper(sk: Sketch, p: Puppet, k: 0 | 1, back: boolean): void;
  fore(sk: Sketch, p: Puppet, k: 0 | 1, back: boolean): void;
};

// A loop of a local's own: `secs` seconds long, drawn in framesOf (see
// art/npc/acts.ts: 15 pictures a second); `pose` its puppet at `u` (its act
// and u are set for it: start from rest() there). Work and a show go round,
// frame i at i / frames; the rest play once, frame i at i / (frames - 1),
// so the last frame shown is the end (u = 1): a celebration ends as it
// began. Make every motion a smooth function of u: it is seen 15 times a
// second.
export type NpcLoop = { secs: number; pose(u: number): Omit<Puppet, 'act' | 'u'> };

// Which way a local faces (see facingOf in world/npc-place.ts): `out` into
// the room and `along` its station (+u) show its front; `back` (into its
// station) its back.
export type NpcLook = 'out' | 'along' | 'back';

// Where a local works, in its station's frame (u along it, v out from its
// back, z up, as PropView): `behind` its counter, inside the station's
// footprint at its back, the counter's top (`top` high, its back edge at
// v = `edge`) hiding its legs (its picture is cut there: see cutOf in
// world/npc-place.ts); `seated` on a seat that is part of its station,
// inside its footprint, its frame lifted `z` (and cut as one behind is,
// if something of its station stands in front: `top` and `edge` both, or
// neither); `standing` on the floor beside its station, outside every
// footprint, on floor the room planner keeps clear (or leaves it out where
// the room is too small for it: see placeNpcs in world/room.ts).
export type NpcPlace =
  | { mode: 'behind'; u: number; v: number; top: number; edge: number; look?: NpcLook }
  | ({ mode: 'seated'; u: number; v: number; z: number; look?: NpcLook } & ({ top: number; edge: number } | { top?: undefined; edge?: undefined }))
  | { mode: 'standing'; u: number; v: number; look?: NpcLook };

// What a local hands over (see the handOver act), drawn upright at its
// near hand (origin at the hand, up -y, whatever the arm's angle): a `drink`
// goes back with whoever it served as a mug of coffee while office life
// is on; anything else (or a drink with office life off) as a heart.
export type NpcServe = { name: string; drink: boolean; draw(sk: Sketch): void };

// A local: its name (camelCase, unique in its world), the station it
// works (one local a station), where, how tall it stands (units, 11 to 16:
// its emotes show over that), its bones and parts, its loops (a show with
// the crowd it draws: dancing or watching) and what it serves, if
// anything.
export type Npc = {
  name: string;
  station: SlotKind;
  place: NpcPlace;
  tall: number;
  bones: Bones;
  parts: NpcParts;
  work: NpcLoop;
  show?: NpcLoop & { crowd: 'dance' | 'watch' };
  celebrate?: NpcLoop;
  serve?: NpcServe;
};

// What the room shell draws with: the floor and the two back walls.
// `W` x `D` is the floor (units), `H` the wall height, `T` the wall
// thickness.
// `lit` as PropView's: false at night, absent counts as lit.
export type RoomView = {
  pen: Pen;
  s: number;
  at: Project;
  W: number;
  D: number;
  H: number;
  T: number;
  t: number;
  seed: number;
  lit?: boolean;
};

// `draw` paints the static shell once; `overlay`, when given, paints over
// the finished frame every frame (rain on the windows, a flicker);
// `lights` names the light its shell gives (see RoomLight), asked once a
// room.
export type RoomArt = {
  draw(v: RoomView): void;
  overlay?(v: RoomView): void;
  lights?(v: { W: number; D: number; H: number; T: number; seed: number }): readonly RoomLight[];
};

// ── light (see art/scene/light.ts) ───────────────────────────────────────
// Light a world declares; the scene draws it with one set of rules for
// every room, baked into the base and the glows (nothing per frame).
//
// A 'lamp' is switched: on with the lights, off at night (the `l` key).
// 'fire', 'lava', 'glow' (crystals, tanks, neon) and 'screen' always
// shine: at night they are what lights the room. Each throws a pool on
// the floor (pushed out into the room when it hangs on a wall), washes a
// wall it stands within 6 units of, and glows round itself.
export type LightKind = 'lamp' | 'fire' | 'lava' | 'glow' | 'screen';

// A light at a point (u, v, z) of its frame: a prop's own (as PropView),
// or for the room a wall's (u along `wall` from the back corner, v out
// from its face, z up). `color` is a '#rrggbb' (each kind has its own:
// warm lamps, orange fire). `r`: how far its pool reaches on the floor,
// units (by kind and height when left out); `strength` scales the pool,
// the wash and the glow (1 as it comes, 0 to 2); `halo` is the glow's
// radius round the light itself, units (0: none).
export type PointLight = { kind: LightKind; u: number; v: number; z: number; color?: string; r?: number; strength?: number; halo?: number };

// A window: an opening `w` wide centred at `u` along its wall (or its
// prop's back), its sill at `z0` and its top at `z1`. With the lights on
// it lets in `color` at `strength` (warm late sun, 1, as it comes), at
// night `night` at `moon` (moonlight, 0.85): a patch on the floor in the
// light's direction (from the upper left), cut by `bars` upright glazing
// bars and `rails` across. A strength of 0 lets none in (a window dark
// outside with the lights on, or curtained at night).
export type WindowLight = { kind: 'window'; u: number; w: number; z0: number; z1: number; bars?: number; rails?: number; color?: string; strength?: number; night?: string; moon?: number };

export type PropLight = PointLight | WindowLight;
export type RoomLight = (PointLight | WindowLight) & { wall: 'left' | 'right' };

// How the scene lights a world's room, each a share of the shared rule
// (1 as it comes, 0 none, up to 2): `ao` the shade where the floor meets
// the walls and in the back corner, `falloff` the floor darkening toward
// its far corners (kept light where the crew walks), `top` the walls
// darkening toward their tops, `turn` the left wall's shade (it faces away
// from the light), `backs` the soft shadows on the wall behind what stands
// against it, `pools` every declared light's pool, wash and spill. `night`
// is how the room looks with the lights off: multiplied toward `tint` by
// `strength` (cool and dim as it comes), the crew and the locals by
// `figures` of that (0 to 1).
export type WorldLight = {
  ao?: number;
  falloff?: number;
  top?: number;
  turn?: number;
  backs?: number;
  pools?: number;
  night?: { tint?: RGB; strength?: number; figures?: number };
};

export type CritterKind = 'cat' | 'rat' | 'drone' | 'slime' | 'fox' | 'imp' | 'beetle' | 'hopper' | 'husky' | 'corgi';
export type BuildShape = 'tower' | 'house' | 'pyramid' | 'statue' | 'machine';

export type WorldDef = {
  id: string;
  name: string;
  tagline: string;
  palette: Palette; // UI chrome colours
  backdrop: RGB; // around the room
  ink?: string; // the one outline colour of its art (default: derived from the palette)
  room: RoomArt;
  // The prop at each station slot (and the entrance).
  stations: Record<SlotKind, PropArt>;
  // Extra furniture scattered by the room planner along the walls or on
  // the open floor, clear of the stations and walkways.
  decor?: ReadonlyArray<{ art: PropArt; count: number; place: 'wall' | 'floor' }>;
  // Each agent's own workstation (a plain desk with a screen in the
  // world's colours when it has none: see worlds/workstation.ts).
  workstation?: WorkstationArt;
  // Its locals (see Npc): three, each at a station of its own.
  npcs?: readonly Npc[];
  // A colour multiplied over the scene (0 = none, 1 = full): the room,
  // its props and builds; the crew, the locals and the critter by
  // `figures` of it (half as it comes), emotes and labels not at all.
  // Declared lights shine over it (an evening the lamps warm).
  ambient?: { tint: RGB; strength: number; figures?: number };
  // How the scene lights its room (see WorldLight); all on as it comes.
  light?: WorldLight;
  costume: Costume;
  critter: { kind: CritterKind; body: RGB };
  finale: { colors: RGB[] };
  build: { colors: RGB[]; shape: BuildShape };
  pois?(L: Layout): Poi[];

  // ── keep-clear walls (see world/room.ts) ──
  // Stretches of wall the room planner keeps decor from standing in front
  // of, for a world's hero pieces (a hearth, a mural, a video wall): on
  // `wall`, from `a0` to `a1` along it (x on the right wall, y on the left,
  // as wallGaps counts), out to `out` units into the room from its face. No
  // decor there stands where it would hide the wall over `z` (a piece h
  // tall standing d out hides the wall d nearer the corner, up to h - d);
  // with `z` 0 (the default: a piece that comes down to the floor, as a
  // hearth does), none stands on the floor before it either. Or a patch of
  // floor (x0, y0 to x1, y1) no decor stands on (a dance floor). Worked out
  // from L, from the same plan the shell draws its pieces from; a room the
  // world plans meanwhile (planRoom, to see where the furniture stands) is
  // planned without any of it kept clear. See world/room.ts.
  reserve?(L: Layout): ReadonlyArray<{ wall: 'left' | 'right'; a0: number; a1: number; out: number; z?: number } | { x0: number; y0: number; x1: number; y1: number }>;
};
