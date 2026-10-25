import type { Accessory, Costume, Species, Traits, Wear } from '../../world/character.ts';
import type { RGB } from '../../term/color.ts';
import { hsl } from '../../term/color.ts';
import type { Color } from '../types.ts';
import { hexOf, mix, shade } from '../iso.ts';

// A character's colours for one costume: what each garment is made of,
// with the shaded side of each (light comes from the upper left); and what
// its level lets it wear (see Wear).

// The hat a level brings (★2), one from each costume's set: a knit beanie
// with everyday clothes, a mortarboard with a lab coat, a party cone at the
// club, a cap worn backwards in the den, an antenna on a space helmet, a
// grander hat for a wizard.
export type Prize = 'beanie' | 'mortarboard' | 'party' | 'cap' | 'antenna' | 'grand';
export const PRIZES: Record<Costume, Prize> = { casual: 'beanie', scientist: 'mortarboard', raver: 'party', hacker: 'cap', astronaut: 'antenna', wizard: 'grand' };
export const GOLD = '#f5c542';
export const WHITE = '#ffffff';

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
  legs: Color;
  legsD: Color;
  shoe: Color;
  shoeD: Color;
  sole: Color;
  hand: Color; // skin, or gloves
  handD: Color;
  hat: Color;
  hatD: Color;
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
    legs: pants,
    legsD: dk(pants),
    shoe: '#4a3f52',
    shoeD: '#382e40',
    sole: '#efe6da',
    hand: skin,
    handD: dk(skin, 0.2),
    hat: shirt,
    hatD: dk(shirt),
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
    const alt = hexOf(hsl(hueOf(tr.trim), 0.62, 0.5));
    if (ghost) {
      L.top = mix(GHOST, alt, 0.3);
      L.topD = dk(L.top, 0.18);
      L.trim = GOLD;
      L.trimD = dk(GOLD);
    } else {
      L.top = costume === 'scientist' || costume === 'astronaut' ? mix(L.top, alt, 0.5) : alt;
      L.topD = dk(L.top);
      L.trim = shirt;
      L.trimD = dk(shirt);
      if (costume === 'astronaut') {
        L.legs = L.top;
        L.legsD = L.topD;
      }
      if (costume === 'wizard') L.hat = shade(L.top, -0.06);
      if (costume === 'hacker') L.hat = L.top;
      L.hatD = dk(L.hat);
    }
  }
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
