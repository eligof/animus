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
};

// `draw` paints the static shell once; `overlay`, when given, paints over
// the finished frame every frame (rain on the windows, a flicker).
export type RoomArt = {
  draw(v: RoomView): void;
  overlay?(v: RoomView): void;
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
  // A colour multiplied over the finished scene (0 = none, 1 = full).
  ambient?: { tint: RGB; strength: number };
  costume: Costume;
  critter: { kind: CritterKind; body: RGB };
  finale: { colors: RGB[] };
  build: { colors: RGB[]; shape: BuildShape };
  pois?(L: Layout): Poi[];
};
