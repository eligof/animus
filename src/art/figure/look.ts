import type { Accessory, Costume, Species, Traits, Wear } from '../../world/character.ts';
import type { RGB } from '../../term/color.ts';
import { hsl } from '../../term/color.ts';
import type { Color } from '../types.ts';
import { hexOf, mix, rgbOf, shade } from '../iso.ts';

// A character's colours for one costume: what each garment is made of,
// with the shaded side of each (light comes from the upper left); and what
// its level lets it wear (see Wear).

// The hat a level brings (★2), one from each costume's set: a knit beanie
// with everyday clothes, a mortarboard with a lab coat, a party cone at the
// club, a cap worn backwards in the den, an antenna on a space helmet, a
// grander hat for a wizard; a low cone of straw with a chin cord over a
// drifter's coat, a rounded iron helm with a nose bar and cheek plates (no
// horns) over a fur mantle, a round helmet with its visor flipped up over
// an exosuit, a newsboy cap with a jumpsuit and a cowboy hat with a duster;
// an old-time leather cap with a brass lamp in the mines, a round toadstool
// cap in the caverns, a trapper hat with fur ear flaps in the snows, a
// peaked cap in the vault and grand curled horns in hell.
export type Prize =
  | 'beanie' | 'mortarboard' | 'party' | 'cap' | 'antenna' | 'grand'
  | 'straw' | 'helm' | 'visor' | 'flatcap' | 'rancher'
  | 'lampcap' | 'mushroom' | 'trapper' | 'peaked' | 'horns';
export const PRIZES: Record<Costume, Prize> = {
  casual: 'beanie',
  scientist: 'mortarboard',
  raver: 'party',
  hacker: 'cap',
  astronaut: 'antenna',
  wizard: 'grand',
  drifter: 'straw',
  nord: 'helm',
  exosuit: 'visor',
  jumpsuit: 'flatcap',
  colonist: 'rancher',
  miner: 'lampcap',
  forager: 'mushroom',
  parka: 'trapper',
  guard: 'peaked',
  demon: 'horns',
};
// The setting worlds' cloth and trimmings (see dressForSetting): a miner's
// denim overalls, work shirt, gloves and boots, and the leather and brass
// of its lamp cap; a forager's moss capelet, oatmeal tunic, satchel,
// leggings and shin wraps, and its toadstool cap; a parka's red and the
// cream of its fur, its wooden toggles, snow trousers and boots, a trapper
// hat's crown; a guard's navy, pale shirt, gilt, black shoes, its cap's
// band, glossy peak, gold cord and brass oval; a devil's scarlet robe and
// tail, plum cape and shoes, bone nubs and grand gold horns. And the
// colours ★8 brings: rust canvas over a slate-blue shirt, a violet or blue
// cap, a mustard or deep teal parka, oxblood or bottle green, violet.
export const CLOTHES = {
  denim: '#3f6fa0',
  denimD: '#2f5479',
  workShirt: '#b5523b',
  glove: '#b98a5a',
  pitBoot: '#4a3222',
  leather: '#4b3a2e',
  leatherD: '#382b22',
  brass: '#d9a94e',
  reflector: '#f4e7c9',
  flame: '#ffc04a',
  glow: '#fff0b0',
  canvas: '#9a5a35',
  slateShirt: '#4e6a8c',
  moss: '#7a9a3c',
  mossD: '#5a7a2a',
  leaf: '#b8d873',
  oatmeal: '#e3d3ae',
  oatmealD: '#bfad86',
  rope: '#9c7a4e',
  satchel: '#8a5a3b',
  satchelD: '#6a4229',
  leggings: '#5e4a3a',
  wraps: '#d9cba8',
  softBoot: '#4a3a2e',
  toadstool: '#c8443a',
  toadstoolD: '#9e3029',
  spots: '#f7f0e0',
  gills: '#e9ddc0',
  violetCap: '#8b55bd',
  blueCap: '#4a7fc0',
  parka: '#d0443a',
  parkaD: '#a3322d',
  snowFur: '#eee6d3',
  snowFurD: '#c9bb9e',
  toggle: '#9b6943',
  snowPants: '#4a4a55',
  snowPantsD: '#383842',
  snowBoot: '#7a5a3e',
  trapper: '#6b4a35',
  mustard: '#e0a93a',
  deepTeal: '#2f7f86',
  navy: '#2a3d6b',
  navyD: '#1e2c50',
  paleShirt: '#dce6f2',
  gilt: '#e8c25a',
  shoe: '#26262c',
  capBand: '#18233f',
  peak: '#1b1d27',
  goldCord: '#d9a93f',
  oval: '#f2c14e',
  oxblood: '#7d2a2e',
  bottle: '#2f5d4a',
  scarlet: '#d8352a',
  scarletD: '#a82620',
  plum: '#3a2433',
  plumD: '#2a1925',
  bone: '#ecdfc2',
  boneD: '#c9b48e',
  horn: '#e2b03a',
  hornD: '#a8761e',
  violet: '#7b3fa6',
} as const;
export const GOLD = '#f5c542';
export const WHITE = '#ffffff';
// The game worlds' cloth: a drifter's rawhide coat, the leather of its
// straps (and of a jumpsuit's cuffs), the rags round its forearms; the
// homespun a nord's tunic is dyed over, its wolf-grey fur (dark wolf at ★8,
// or snow on a dark tunic), its charcoal cloak and iron buckle; the slate
// of an exosuit's gloves, harness and belt; a jumpsuit's deep teal and its
// orange stripe (cream at ★8 on a red or rust suit); the cloth a duster is
// softened toward, the cream shirt under it and slate trousers.
export const COAT = '#865836';
export const RAG = '#e6dcc6';
export const RAG_D = '#c2b79f';
export const LEATHER = '#4a3628';
const HOMESPUN = '#5e4b3a';
export const FUR = '#d3cdc2';
export const FUR_D = '#a39a88';
const WOLF = '#6f6a64';
const SNOW = '#f1eee8';
export const CLOAK = '#4e4a45';
export const CLOAK_D = '#3b3834';
export const IRON = '#9a9c98';
export const SLATE = '#3d4554';
export const SUIT_TEAL = '#1e7480';
const SUIT_TEAL_D = '#155760';
export const STRIPE = '#f08a2c';
const STRIPE_D = '#c76a1c';
export const CREAM = '#efe0c2';
const CLOTH = '#d9cfbb';
export const SHIRT = '#efe4cc';
export const TROUSERS = '#5b6270';
const BAND = '#3b2a20';

export type Look = {
  sp: Species;
  costume: Costume;
  style: number; // hairStyle 0..7
  acc: Accessory;
  pattern: string;
  skin: Color;
  skinD: Color;
  hair: Color;
  hairD: Color;
  eye: Color;
  color: Color; // the character's own bright colour
  top: Color; // the main garment: tee, robe, coat, hoodie, suit
  topD: Color;
  under: Color; // the shirt under an open coat
  sleeve: 'tee' | 'long' | 'bare' | 'wide';
  trim: Color;
  trimD: Color;
  // a costume's second colour: a nord's fur, an exosuit's plates, a
  // jumpsuit's stripe, a cowboy hat's band (else the trim)
  accent: Color;
  accentD: Color;
  legs: Color;
  legsD: Color;
  shoe: Color;
  shoeD: Color;
  sole: Color;
  hand: Color; // skin, or gloves
  handD: Color;
  hat: Color;
  hatD: Color;
  // a setting outfit's own cloth, kept on a ghost's sheet too: overalls, a
  // capelet, a parka, a waistcoat, a devil's robe and tail
  kit: Color;
  kitD: Color;
  hoodUp: boolean;
  prize: Prize | null; // its level's hat (★2)
  badge: boolean; // a star badge on the chest (★3)
  aura: boolean; // a soft glow round it (★10)
};

const dk = (c: Color, k = 0.22) => shade(c, -k);

// A colour's hue, degrees.
function hueOf([r, g, b]: RGB): number {
  const hi = Math.max(r, g, b);
  const d = hi - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = hi === r ? (g - b) / d : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const GHOST = '#eef1f8';

// How far apart two hues are, degrees (0..180).
const apart = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

// A cloth in place of one of a fixed colour, dyed hue h (★8): saturation
// s, lightness l. A hue within `near` of the cloth's own is turned `by`
// round the wheel first, so the change shows: a teal jumpsuit dyed teal
// would stay teal.
function dye(cloth: Color, h: number, s: number, l: number, near = 55, by = 120): Color {
  return hexOf(hsl(apart(h, hueOf(rgbOf(cloth))) < near ? h + by : h, s, l));
}

const luma = (c: Color) => {
  const [r, g, b] = rgbOf(c);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

export function lookOf(tr: Traits, costume: Costume, wear?: Wear): Look {
  const skin = hexOf(tr.skin);
  const shirt = hexOf(tr.shirt);
  const trim = hexOf(tr.trim);
  const pants = hexOf(tr.pants);
  const color = hexOf(tr.color);
  const ghost = tr.species === 'ghost';
  const L: Look = {
    sp: tr.species,
    costume,
    style: ((tr.hairStyle % 8) + 8) % 8,
    acc: tr.accessory,
    pattern: tr.pattern,
    skin,
    skinD: dk(skin, 0.2),
    hair: hexOf(tr.hair),
    hairD: dk(hexOf(tr.hair), 0.28),
    eye: hexOf(tr.eye),
    color,
    top: shirt,
    topD: dk(shirt),
    under: shirt,
    sleeve: 'tee',
    trim,
    trimD: dk(trim),
    accent: trim,
    accentD: dk(trim),
    legs: pants,
    legsD: dk(pants),
    shoe: '#4a3f52',
    shoeD: '#382e40',
    sole: '#efe6da',
    hand: skin,
    handD: dk(skin, 0.2),
    hat: shirt,
    hatD: dk(shirt),
    kit: shirt,
    kitD: dk(shirt),
    hoodUp: false,
    prize: null,
    badge: false,
    aura: false,
  };
  if (tr.species === 'robot') L.hair = '#6c7684';
  switch (costume) {
    case 'wizard':
      L.sleeve = 'wide';
      L.legs = dk(shirt, 0.35);
      L.shoe = '#7a4b30';
      L.shoeD = '#5e3823';
      L.sole = '#4a2c1c';
      L.hat = shade(shirt, -0.06);
      L.hatD = dk(L.hat);
      break;
    case 'scientist':
      L.top = '#f3f5f8';
      L.topD = '#c9d2de';
      L.sleeve = 'long';
      L.shoe = '#3b3a44';
      L.shoeD = '#2b2a33';
      L.sole = '#d9d4cc';
      break;
    case 'raver': {
      const neon = mix(shirt, color, 0.65);
      L.top = neon;
      L.topD = dk(neon);
      L.sleeve = 'bare';
      L.legs = '#2b2540';
      L.legsD = '#1f1a30';
      L.shoe = '#f4f1f6';
      L.shoeD = '#cfc9d8';
      L.sole = trim;
      break;
    }
    case 'hacker': {
      const hood = mix(shirt, '#262a36', 0.42);
      L.top = hood;
      L.topD = dk(hood);
      L.sleeve = 'long';
      L.legs = '#2d2f3b';
      L.legsD = '#22232d';
      L.shoe = '#34333f';
      L.shoeD = '#26252f';
      L.sole = '#e6e4ea';
      L.hoodUp = L.style % 2 === 0;
      L.hat = hood;
      L.hatD = dk(hood);
      break;
    }
    case 'astronaut':
      L.top = '#eceff4';
      L.topD = '#c2cbd8';
      L.sleeve = 'long';
      L.legs = '#eceff4';
      L.legsD = '#c2cbd8';
      L.shoe = '#7d8798';
      L.shoeD = '#626b7b';
      L.sole = '#4c5361';
      L.hand = mix(trim, '#c8d0db', 0.45);
      L.handD = dk(L.hand);
      break;
    case 'drifter':
      // a knee-length rawhide coat strapped shut, its sleeves rolled over
      // forearms and hands wrapped in rags, baggy trousers and scuffed
      // boots; the scarf (in its trim), the collar and straps are drawn on,
      // see body.ts
      L.top = COAT;
      L.topD = dk(COAT);
      L.sleeve = 'long';
      L.legs = '#565048';
      L.legsD = '#423d37';
      L.shoe = '#5a3e2b';
      L.shoeD = '#45301f';
      L.sole = '#2e221a';
      L.hand = RAG;
      L.handD = RAG_D;
      break;
    case 'nord': {
      // a tunic in a homespun shade of its colour, wool trousers, boots
      // fur-topped and cross-strapped; the fur mantle and cuffs (in its
      // accent), the cloak, the belt and its flap and the braids are drawn
      // on, see body.ts and head.ts
      const tunic = mix(shirt, HOMESPUN, 0.25);
      L.top = tunic;
      L.topD = dk(tunic);
      L.accent = FUR;
      L.accentD = FUR_D;
      L.sleeve = 'long';
      L.legs = '#4b4038';
      L.legsD = '#3a312b';
      L.shoe = '#7a5f45';
      L.shoeD = '#5f4833';
      L.sole = '#3e3127';
      break;
    }
    case 'exosuit': {
      // one piece in its colour, lit up, its helmet too; a chest plate,
      // pads and boots in a second colour (its complement, see below), slate
      // gloves, harness and soles
      const suit = mix(shirt, color, 0.55);
      L.top = suit;
      L.topD = dk(suit);
      L.legs = suit;
      L.legsD = L.topD;
      L.hat = suit;
      L.hatD = dk(suit);
      L.sleeve = 'long';
      L.sole = SLATE;
      L.hand = SLATE;
      L.handD = '#2c323e';
      break;
    }
    case 'jumpsuit':
      // one piece in deep teal, a uniform (a plain orange placket and belt
      // are drawn on: no number, no logo), leather cuffs, dark boots
      L.top = SUIT_TEAL;
      L.topD = SUIT_TEAL_D;
      L.legs = L.top;
      L.legsD = L.topD;
      L.accent = STRIPE;
      L.accentD = STRIPE_D;
      L.sleeve = 'long';
      L.shoe = '#3b3640';
      L.shoeD = '#2c2830';
      L.sole = '#6b6470';
      break;
    case 'colonist': {
      // a long duster of its colour, softened toward plain cloth, open
      // over a cream shirt; slate trousers and boots; a dark band round the
      // cowboy hat
      const duster = mix(shirt, CLOTH, 0.4);
      L.top = duster;
      L.topD = dk(duster);
      L.under = SHIRT;
      L.accent = BAND;
      L.accentD = dk(BAND, 0.1);
      L.sleeve = 'long';
      L.legs = TROUSERS;
      L.legsD = '#474d58';
      L.shoe = '#6b4a30';
      L.shoeD = '#52381f';
      L.sole = '#3a2a1e';
      break;
    }
    default:
      // tees for most prints; stripes and V-necks come as sweaters
      L.sleeve = tr.pattern === '▓' || tr.pattern === '▼' || tr.pattern === '║' ? 'long' : 'tee';
  }
  if (tr.accessory === 'hood') L.hoodUp = true;
  if (ghost) {
    // a sheet: pale all over, the costume's colour kept for hats and trim
    L.top = GHOST;
    L.topD = '#c9d1e6';
    L.legs = GHOST;
    L.legsD = '#c9d1e6';
    L.hand = GHOST;
    L.handD = '#c9d1e6';
    L.skin = GHOST;
    L.skinD = '#c9d1e6';
    L.hat = costume === 'hacker' ? mix(color, '#262a36', 0.4) : color;
    L.hatD = dk(L.hat);
    L.trim = color;
    L.trimD = dk(color);
  }
  if (wear?.outfit) {
    // ★8: the outfit in other colours. The main garment takes the trim's
    // hue, full (a white coat or suit is tinted with it), the trim the
    // old colour; a ghost's sheet takes a pastel of it, its trim gold.
    const hue = hueOf(tr.trim);
    const alt = hexOf(hsl(hue, 0.62, 0.5));
    if (ghost) {
      L.top = mix(GHOST, alt, 0.3);
      L.topD = dk(L.top, 0.18);
      L.trim = GOLD;
      L.trimD = dk(GOLD);
    } else {
      // A white coat or suit is tinted with it; a tunic keeps its homespun;
      // a rawhide coat is dyed a faded shade of it, a duster a deep one, a
      // teal jumpsuit a deep one kept out of the blues (never royal blue),
      // each turned to another hue when it is near the cloth's own (see
      // dye).
      if (costume === 'scientist' || costume === 'astronaut') L.top = mix(L.top, alt, 0.5);
      else if (costume === 'drifter') L.top = dye(COAT, hue, 0.34, 0.4);
      else if (costume === 'nord') L.top = mix(alt, HOMESPUN, 0.25);
      else if (costume === 'jumpsuit') L.top = dye(SUIT_TEAL, hue, 0.45, 0.34, 60, 125);
      else if (costume === 'colonist') L.top = dye(L.top, hue, 0.5, 0.42);
      else L.top = alt;
      L.topD = dk(L.top);
      L.trim = shirt;
      L.trimD = dk(shirt);
      if (costume === 'astronaut' || costume === 'jumpsuit' || costume === 'exosuit') {
        L.legs = L.top;
        L.legsD = L.topD;
      }
      if (costume === 'wizard') L.hat = shade(L.top, -0.06);
      if (costume === 'hacker' || costume === 'exosuit') L.hat = L.top;
      L.hatD = dk(L.hat);
    }
    // the fur turns dark wolf (snow on a dark tunic); a jumpsuit's stripe
    // turns cream on a red or rust suit; the cowboy hat's band takes the
    // trim
    if (costume === 'nord') L.accent = luma(L.top) < 90 ? SNOW : WOLF;
    if (costume === 'jumpsuit' && !ghost && apart(hueOf(rgbOf(L.top)), 15) < 42) L.accent = CREAM;
    if (costume === 'colonist') L.accent = L.trim;
    if (costume !== 'exosuit') L.accentD = dk(L.accent);
  }
  if (costume === 'exosuit') {
    // its plates in its complement, a little softer (a ghost's in its own
    // colour, as its helmet)
    L.accent = ghost ? color : hexOf(hsl(hueOf(rgbOf(L.top)) + 180, 0.6, 0.6));
    L.accentD = dk(L.accent);
    L.shoe = L.accent;
    L.shoeD = L.accentD;
  }
  dressForSetting(L, costume, tr, wear);
  if (wear?.hat) {
    // ★2: the hat goes on in place of a lamp, a beret or a hood.
    L.prize = PRIZES[costume];
    if (L.acc === 'lamp' || L.acc === 'beret' || L.acc === 'hood') L.acc = 'none';
    L.hoodUp = false;
  }
  L.badge = wear?.badge ?? false;
  L.aura = wear?.aura ?? false;
  return L;
}

// The setting worlds' outfits, over whatever the steps above made of them
// (a ghost keeps its sheet, its hat and trim colours; ★8 its pastel and
// gold trim; at ★8 the trim takes the old shirt colour, as everywhere):
// each has its kit, the cloth that names it, which a ghost wears on its
// sheet too, and the main garment of the rest. The personal colour (the
// trim) goes on a miner's neckerchief, a forager's satchel flap, a
// parka's mittens, a guard's tie and a devil's sash.
function dressForSetting(L: Look, costume: Costume, tr: Traits, wear?: Wear): void {
  const ghost = tr.species === 'ghost';
  const alt = !!wear?.outfit;
  // which of a pair of ★8 colours, by the trim's hue
  const pick = <T>(a: T, b: T): T => (hueOf(tr.trim) < 180 ? a : b);
  let kit: Color;
  let kitD: Color | null = null;
  switch (costume) {
    case 'miner':
      // denim bib overalls over a rust-red work shirt with its sleeves
      // rolled, work gloves and boots (★8: rust canvas over slate blue)
      kit = alt ? CLOTHES.canvas : CLOTHES.denim;
      if (!alt) kitD = CLOTHES.denimD;
      L.under = alt ? CLOTHES.slateShirt : CLOTHES.workShirt;
      L.legs = kit;
      L.legsD = kitD ?? dk(kit);
      L.shoe = CLOTHES.pitBoot;
      L.shoeD = dk(CLOTHES.pitBoot, 0.25);
      L.sole = '#2a1c14';
      if (!ghost) {
        L.hand = CLOTHES.glove;
        L.handD = dk(CLOTHES.glove, 0.2);
      }
      break;
    case 'forager':
      // a moss capelet over an oatmeal tunic, leggings, shin wraps and
      // soft boots; its toadstool cap red (★8: the capelet takes the trim's
      // hue, the cap goes violet or blue, the caverns' other mushrooms)
      kit = alt ? mix(CLOTHES.moss, dye(CLOTHES.moss, hueOf(tr.trim), 0.62, 0.5), 0.7) : CLOTHES.moss;
      if (!alt) kitD = CLOTHES.mossD;
      L.under = CLOTHES.oatmeal;
      L.legs = CLOTHES.leggings;
      L.legsD = dk(CLOTHES.leggings);
      L.shoe = CLOTHES.softBoot;
      L.shoeD = dk(CLOTHES.softBoot, 0.25);
      L.sole = '#2e241c';
      L.hat = alt ? pick(CLOTHES.violetCap, CLOTHES.blueCap) : CLOTHES.toadstool;
      L.hatD = alt ? dk(L.hat, 0.24) : CLOTHES.toadstoolD;
      break;
    case 'parka':
      // a red puffy parka, snow trousers, fur-cuffed boots, mittens in its
      // own colour (★8: mustard or deep teal)
      kit = alt ? pick(CLOTHES.mustard, CLOTHES.deepTeal) : CLOTHES.parka;
      if (!alt) kitD = CLOTHES.parkaD;
      L.legs = CLOTHES.snowPants;
      L.legsD = CLOTHES.snowPantsD;
      L.shoe = CLOTHES.snowBoot;
      L.shoeD = dk(CLOTHES.snowBoot, 0.25);
      L.sole = '#3a2a1e';
      L.hand = L.trim;
      L.handD = L.trimD;
      break;
    case 'guard':
      // a navy waistcoat over a pale-blue shirt, navy trousers, black
      // shoes; the cap matches (★8: oxblood or bottle green)
      kit = alt ? pick(CLOTHES.oxblood, CLOTHES.bottle) : CLOTHES.navy;
      if (!alt) kitD = CLOTHES.navyD;
      L.under = CLOTHES.paleShirt;
      L.legs = kit;
      L.legsD = kitD ?? dk(kit);
      L.shoe = CLOTHES.shoe;
      L.shoeD = '#18181d';
      L.sole = '#121216';
      L.hat = kit;
      L.hatD = kitD ?? dk(kit);
      break;
    case 'demon':
      // a scarlet robe to the shin, its tail the same, plum tights and
      // pointed shoes (★8: violet)
      kit = alt ? CLOTHES.violet : CLOTHES.scarlet;
      if (!alt) kitD = CLOTHES.scarletD;
      L.legs = CLOTHES.plum;
      L.legsD = CLOTHES.plumD;
      L.shoe = CLOTHES.plum;
      L.shoeD = CLOTHES.plumD;
      L.sole = '#1e121a';
      break;
    default:
      return;
  }
  L.kit = kit;
  L.kitD = kitD ?? dk(kit);
  if (ghost) {
    L.legs = GHOST;
    L.legsD = '#c9d1e6';
    return;
  }
  L.top = L.kit;
  L.topD = L.kitD;
  L.sleeve = 'long';
}
