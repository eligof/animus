import type { Pose, Traits } from '../world/character.ts';

// XL rig, drawn natively for 2x3 sextant cells (pixels about 3:4): the body
// is 17x25 (columns 0..16 about centre column 8, rows 0..24) in a 35x30
// frame, with room for props on either side and hair, ears or antennae
// above (plus their outline). Returns colour keys; sprites.ts owns the
// palette and shading.
export const XL_W = 35;
export const XL_H = 30;
const OX = 9;
const OY = 5;
// Half-width of the head on each of its rows (0..11) about column 8.
const HEAD = [3, 5, 6, 7, 7, 7, 7, 7, 7, 6, 5, 3];

type Keys = string[][];

function put(g: Keys, r: number, c: number, k: string): void {
  const y = r + OY;
  const x = c + OX;
  if (y >= 0 && y < XL_H && x >= 0 && x < XL_W) g[y][x] = k;
}

function row(g: Keys, r: number, c0: number, c1: number, k: string): void {
  for (let c = c0; c <= c1; c++) put(g, r, c, k);
}

function col(g: Keys, c: number, r0: number, r1: number, k: string): void {
  for (let r = r0; r <= r1; r++) put(g, r, c, k);
}

function dots(g: Keys, cells: Array<[number, number]>, k: string): void {
  for (const [r, c] of cells) put(g, r, c, k);
}

// Head rows r0..r1 filled with k, `grow` pixels wider on each side.
function headRows(g: Keys, r0: number, r1: number, k: string, grow = 0): void {
  for (let r = r0; r <= r1; r++) {
    const h = HEAD[Math.max(0, Math.min(11, r))] + grow;
    row(g, r, 8 - h, 8 + h, k);
  }
}

export function xlKeys(tr: Traits, pose: Pose, tp: number, back: boolean, eyesOpen: boolean): { keys: Keys; dy: number } {
  const g: Keys = Array.from({ length: XL_H }, () => Array<string>(XL_W).fill('.'));
  const dy = body(g, tr, pose, tp, back);
  // From behind, raised hands disappear behind the head.
  if (back) arms(g, tr, pose, tp, back);
  head(g, tr, pose, tp, back, eyesOpen);
  accessory(g, tr, pose, back);
  if (!back) arms(g, tr, pose, tp, back);
  return { keys: g, dy };
}

// ── head ─────────────────────────────────────────────────────────────────
function head(g: Keys, tr: Traits, pose: Pose, tp: number, back: boolean, eyesOpen: boolean): void {
  switch (tr.species) {
    case 'robot': return robot(g, back, eyesOpen);
    case 'ghost': return ghostHead(g, pose, back, eyesOpen);
    case 'alien': return alien(g, pose, back, eyesOpen);
    default:
  }
  headRows(g, 0, 11, 'S');
  for (const c of [0, 16]) col(g, c, 6, 8, 'S'); // ears
  if (tr.species === 'cat') catHair(g, back);
  else hair(g, tr.hairStyle, back);
  if (back) return;
  face(g, pose, tp, eyesOpen);
  if (tr.species === 'cat') {
    put(g, 9, 8, 'V');
    dots(g, [[9, 2], [9, 3], [9, 13], [9, 14]], 'M'); // whiskers
  } else if (tr.hairStyle !== 5 && tr.hairStyle !== 7) {
    row(g, 5, 4, 5, 'H'); // eyebrows
    row(g, 5, 11, 12, 'H');
  }
}

function hair(g: Keys, style: number, back: boolean): void {
  const shine = () => { if (!back) { row(g, 1, 5, 7, 'h'); row(g, 2, 4, 5, 'h'); } };
  const fringe = (gaps: number[]) => {
    row(g, 4, 1, 15, 'H');
    for (const c of gaps) put(g, 4, c, 'S');
    for (const c of [1, 15]) col(g, c, 5, 7, 'H'); // sideburns
    row(g, 5, 1, 2, 'H');
    row(g, 5, 14, 15, 'H');
  };
  const backOf = (to: number) => {
    headRows(g, 0, to, 'H');
    for (const c of [0, 16]) col(g, c, 6, 8, 'S');
  };
  switch (style) {
    case 1: // spiky
      for (const c of [3, 8, 13]) { put(g, -2, c, 'H'); row(g, -1, c - 1, c + 1, 'H'); }
      row(g, 0, 2, 14, 'H');
      headRows(g, 1, 3, 'H');
      if (back) backOf(9);
      else { fringe([4, 8, 12]); put(g, 5, 5, 'H'); put(g, 5, 11, 'H'); }
      shine();
      break;
    case 2: // long
      headRows(g, 0, 3, 'H');
      if (back) { backOf(11); for (let r = 12; r <= 16; r++) row(g, r, 3, 13, 'H'); }
      else fringe([6, 10]);
      for (const c of [0, 1, 15, 16]) col(g, c, 4, 15, 'H');
      shine();
      break;
    case 3: // bun
      headRows(g, 0, 3, 'H');
      row(g, -3, 7, 9, 'H'); row(g, -2, 6, 10, 'H'); row(g, -1, 6, 10, 'H');
      if (back) backOf(9); else fringe([6, 10]);
      if (!back) put(g, -3, 7, 'h');
      shine();
      break;
    case 4: // curly
      headRows(g, 0, 4, 'H', 1);
      for (const c of [3, 4, 7, 8, 9, 12, 13]) put(g, -1, c, 'H');
      for (const c of [-1, 0, 16, 17]) for (const r of [5, 7, 9]) put(g, r, c, 'H');
      for (const c of [0, 16]) col(g, c, 4, 9, 'H');
      if (back) backOf(10);
      else for (const c of [3, 7, 9, 13]) put(g, 5, c, 'H');
      shine();
      break;
    case 5: // mohawk
      row(g, -3, 8, 8, 'H');
      for (let r = -2; r <= 3; r++) row(g, r, 7, 9, 'H');
      if (back) col(g, 8, 4, 9, 'H');
      else put(g, -2, 8, 'h');
      for (const c of [1, 15]) col(g, c, 3, 5, 'n'); // shaved sides
      break;
    case 6: // cap
      headRows(g, 0, 3, 'T');
      if (back) { backOf(9); headRows(g, 0, 3, 'T'); row(g, 4, 5, 11, 'D'); }
      else { row(g, 4, 0, 16, 'D'); put(g, 0, 8, 'D'); for (const c of [1, 15]) col(g, c, 5, 6, 'H'); }
      break;
    case 7: // bald
      if (back) for (const c of [2, 14]) col(g, c, 6, 8, 'n');
      break;
    default: // short
      headRows(g, 0, 3, 'H');
      if (back) backOf(9); else fringe([6, 10]);
      shine();
  }
}

function catHair(g: Keys, back: boolean): void {
  headRows(g, 0, 3, 'H');
  for (const [c, s] of [[3, 1], [13, -1]] as const) {
    put(g, -2, c, 'H');
    row(g, -1, c - 1, c + 1, 'H');
    row(g, 0, c - 1 - (s > 0 ? 1 : 0), c + 1 + (s < 0 ? 1 : 0), 'H');
    if (!back) put(g, -1, c, 'C');
  }
  if (back) headRows(g, 4, 11, 'H');
  else row(g, 4, 2, 14, 'H');
}

function face(g: Keys, pose: Pose, tp: number, eyesOpen: boolean): void {
  for (const c of [4, 11]) {
    if (pose === 'done') {
      row(g, 6, c, c + 1, 'E'); put(g, 7, c - 1, 'E'); put(g, 7, c + 2, 'E'); // ^ ^
    } else if (pose === 'error') {
      const m = c + (c < 8 ? 0 : 1);
      dots(g, [[6, m - 1], [6, m + 1], [7, m], [8, m - 1], [8, m + 1]], 'E'); // x x
    } else if (!eyesOpen) {
      row(g, 7, c, c + 1, 'M');
    } else {
      row(g, 6, c, c + 1, 'E'); row(g, 7, c, c + 1, 'E'); row(g, 8, c, c + 1, 'E');
      put(g, 6, c + 1, 'w'); // shine
    }
  }
  row(g, 9, 2, 3, 'C'); row(g, 9, 13, 14, 'C'); // cheeks
  put(g, 8, 8, 'n'); // nose
  const open = Math.floor(tp * 6) % 2 === 0;
  switch (pose) {
    case 'done': row(g, 10, 6, 10, 'M'); row(g, 11, 7, 9, 'm'); break;
    case 'talk': row(g, 10, 7, 9, 'M'); if (open) put(g, 11, 8, 'm'); break;
    case 'error': dots(g, [[10, 6], [11, 7], [10, 8], [11, 9], [10, 10]], 'M'); break;
    case 'sleep': put(g, 10, 8, 'M'); break;
    case 'think': row(g, 10, 8, 9, 'M'); break;
    default: row(g, 10, 7, 9, 'M'); put(g, 9, 6, 'M'); put(g, 9, 10, 'M');
  }
}

function robot(g: Keys, back: boolean, eyesOpen: boolean): void {
  row(g, 0, 2, 14, 'H');
  for (let r = 1; r <= 11; r++) row(g, r, 1, 15, 'H');
  col(g, 8, -2, -1, 'Q'); put(g, -3, 8, 'I'); // antenna
  for (const c of [0, 16]) col(g, c, 5, 7, 'Q'); // bolts
  if (back) { for (const r of [4, 6, 8]) row(g, r, 5, 11, 'G'); return; }
  for (let r = 5; r <= 8; r++) row(g, r, 2, 14, 'G'); // visor
  for (const c of [4, 11]) { if (eyesOpen) { row(g, 6, c, c + 1, 'E'); row(g, 7, c, c + 1, 'E'); } else row(g, 7, c, c + 1, 'E'); }
  for (let c = 5; c <= 11; c++) put(g, 10, c, c % 2 ? 'G' : 'H'); // grille
}

function alien(g: Keys, pose: Pose, back: boolean, eyesOpen: boolean): void {
  headRows(g, 0, 11, 'S', 1);
  for (const [c, s] of [[4, -1], [12, 1]] as const) { put(g, -1, c, 'S'); put(g, -2, c + s, 'S'); put(g, -3, c + s, 'L'); }
  if (back) return;
  for (const c of [3, 10]) {
    if (eyesOpen && pose !== 'done') { for (let r = 5; r <= 8; r++) row(g, r, c, c + 3, 'E'); put(g, 5, c + 2, 'w'); }
    else row(g, 7, c, c + 3, 'M');
  }
  put(g, 10, 8, 'M');
  if (pose === 'done' || pose === 'talk') row(g, 10, 7, 9, 'M');
}

function ghostHead(g: Keys, pose: Pose, back: boolean, eyesOpen: boolean): void {
  headRows(g, 0, 11, 'W');
  if (back) return;
  for (const c of [5, 11]) { if (eyesOpen) { col(g, c, 6, 8, 'E'); put(g, 6, c, 'w'); col(g, c + 1, 6, 8, 'E'); } else row(g, 7, c, c + 1, 'E'); }
  if (pose === 'done' || pose === 'talk') { row(g, 10, 7, 9, 'E'); put(g, 11, 8, 'E'); }
  else col(g, 8, 10, 11, 'E');
}

// ── accessories ──────────────────────────────────────────────────────────
function accessory(g: Keys, tr: Traits, pose: Pose, back: boolean): void {
  const expressive = pose === 'done' || pose === 'error' || pose === 'sleep';
  // Hats and hoods hide whatever stuck up above the head.
  if (tr.accessory === 'lamp' || tr.accessory === 'hood' || tr.accessory === 'beret') {
    for (let r = -OY; r <= 0; r++) row(g, r, -OX, XL_W - OX - 1, '.');
  }
  switch (tr.accessory) {
    case 'headset':
      row(g, -1, 5, 11, 'F'); row(g, 0, 3, 4, 'F'); row(g, 0, 12, 13, 'F');
      dots(g, [[1, 2], [1, 14], [2, 1], [2, 15], [3, 0], [3, 16], [4, 0], [4, 16]], 'F');
      for (const c of [-1, 0, 16, 17]) col(g, c, 5, 8, 'X');
      if (!back) { dots(g, [[9, 15], [10, 14], [10, 13]], 'Q'); put(g, 10, 12, 'F'); }
      break;
    case 'glasses':
      if (back || expressive) break;
      for (const c of [3, 10]) { row(g, 5, c, c + 3, 'G'); row(g, 9, c, c + 3, 'G'); col(g, c, 6, 8, 'G'); col(g, c + 3, 6, 8, 'G'); }
      row(g, 6, 7, 9, 'G'); row(g, 6, 1, 2, 'G'); row(g, 6, 14, 15, 'G');
      break;
    case 'lamp':
      headRows(g, 0, 3, 'Y', 1);
      row(g, 4, 0, 16, 'Y');
      if (!back) { row(g, 1, 7, 9, 'L'); row(g, 2, 7, 9, 'L'); row(g, 0, 7, 9, 'Q'); }
      break;
    case 'beret':
      row(g, -1, 5, 12, 'R'); row(g, 0, 2, 15, 'R'); row(g, 1, 1, 16, 'R'); row(g, 2, 2, 15, 'R');
      put(g, -2, 9, 'R');
      break;
    case 'goggles':
      if (!back && !expressive) {
        row(g, 7, 0, 16, 'G');
        for (const c of [3, 10]) { for (let r = 6; r <= 8; r++) row(g, r, c, c + 3, 'G'); row(g, 7, c + 1, c + 2, 'U'); put(g, 6, c + 2, 'U'); }
      } else {
        row(g, 3, 1, 15, 'G');
        for (const c of [4, 10]) { row(g, 2, c, c + 2, 'U'); row(g, 3, c, c + 2, 'U'); }
      }
      break;
    case 'hood':
      headRows(g, 0, 4, 'B', 1);
      row(g, -1, 5, 11, 'B');
      for (const c of [0, 1, 15, 16]) col(g, c, 5, 11, 'B');
      row(g, 12, 3, 13, 'B');
      if (back) { headRows(g, 5, 11, 'B'); put(g, -2, 8, 'B'); }
      else if (!expressive) {
        for (let r = 5; r <= 11; r++) row(g, r, 9 - HEAD[r], 7 + HEAD[r], 'D');
        row(g, 7, 4, 5, 'Y'); row(g, 7, 11, 12, 'Y');
      }
      if (!back) { col(g, 6, 12, 14, 'T'); col(g, 10, 12, 14, 'T'); }
      break;
    case 'bow':
      dots(g, [[-1, 11], [-1, 12], [-1, 14], [-1, 15], [1, 11], [1, 12], [1, 14], [1, 15]], 'V');
      row(g, 0, 11, 15, 'V');
      put(g, 0, 13, 'R');
      break;
    default:
  }
}

// ── body ─────────────────────────────────────────────────────────────────
function body(g: Keys, tr: Traits, pose: Pose, tp: number, back: boolean): number {
  const walkF = Math.floor(tp * 8) % 4;
  if (tr.species === 'ghost') {
    for (let r = 12; r <= 21; r++) row(g, r, 2 - (r > 16 ? 1 : 0), 14 + (r > 16 ? 1 : 0), 'W');
    const f = Math.floor(tp * (pose === 'walk' ? 8 : 3)) % 2;
    for (let c = 1; c <= 15; c++) if ((c + f) % 3 !== 0) put(g, 22, c, 'W');
    for (let c = 1; c <= 15; c++) if ((c + f) % 3 === 1) put(g, 23, c, 'W');
    return 0;
  }
  row(g, 12, 6, 10, 'n'); // neck
  row(g, 13, 3, 13, 'B');
  for (let r = 14; r <= 18; r++) row(g, r, 2, 14, 'B');
  row(g, 19, 2, 14, 'J');
  if (!back) {
    put(g, 19, 8, 'U'); // buckle
    put(g, 13, 6, 'T'); put(g, 13, 10, 'T'); row(g, 13, 7, 9, 'n'); put(g, 14, 8, 'n'); // collar
    motif(g, tr.pattern);
  } else if (tr.pattern === '║') {
    col(g, 5, 13, 18, 'T'); col(g, 11, 13, 18, 'T');
  }
  row(g, 20, 3, 13, 'P');
  const leg = (c0: number, c1: number, lift: number) => {
    for (let r = 21; r <= 22 - lift; r++) row(g, r, c0, c1, 'P');
    const s0 = c0 < 8 ? c0 - 1 : c0;
    const s1 = c1 > 8 ? c1 + 1 : c1;
    row(g, 23 - lift, s0, s1, 'Z');
    row(g, 24 - lift, s0, s1, 'z');
  };
  let dy = 0;
  if (pose === 'walk' && walkF % 2 === 1) {
    dy = -1;
    leg(3, 7, walkF === 1 ? 1 : 0);
    leg(9, 13, walkF === 1 ? 0 : 1);
  } else {
    leg(3, 7, 0);
    leg(9, 13, 0);
  }
  if (pose === 'done') dy = Math.sin(tp * Math.PI * 3) > 0.2 ? -4 : 0;
  return dy;
}

function motif(g: Keys, pattern: string): void {
  switch (pattern) {
    case '▓': row(g, 15, 2, 14, 'T'); row(g, 17, 2, 14, 'T'); break;
    case '▒': dots(g, [[15, 4], [15, 8], [15, 12], [17, 6], [17, 10]], 'T'); break;
    case '▼': dots(g, [[14, 5], [15, 6], [16, 7], [17, 8], [16, 9], [15, 10], [14, 11]], 'T'); break;
    case '◆': dots(g, [[14, 8], [15, 7], [15, 8], [15, 9], [16, 8]], 'T'); break;
    case '║': col(g, 5, 13, 18, 'T'); col(g, 11, 13, 18, 'T'); break;
    case '╋': col(g, 8, 15, 18, 'T'); row(g, 16, 6, 10, 'T'); break;
    case '♥': dots(g, [[14, 6], [14, 7], [14, 9], [14, 10], [16, 7], [16, 8], [16, 9], [17, 8]], 'V'); row(g, 15, 6, 10, 'V'); break;
    default: col(g, 8, 15, 18, 'D'); // plain: a zip
  }
}

// ── arms and props ───────────────────────────────────────────────────────
function arms(g: Keys, tr: Traits, pose: Pose, tp: number, back: boolean): void {
  const ghost = tr.species === 'ghost';
  const skin = ghost ? 'W' : 'A';
  const sleeve = ghost ? 'W' : 'B';
  // Arm hanging at its side, `short` pixels raised (swinging forward).
  const down = (c: number, short = 0) => {
    put(g, 13, c === 0 ? 1 : 15, sleeve);
    row(g, 14, c, c + 1, sleeve);
    row(g, 15, c, c + 1, sleeve);
    if (ghost) return;
    for (let r = 16; r <= 18 - short; r++) row(g, r, c, c + 1, skin);
  };
  // Right arm up beside the body, ending in a hand at (hr, hc).
  const raised = (hr: number, hc: number) => {
    put(g, 13, 15, sleeve); row(g, 14, 15, 16, sleeve); put(g, 13, 16, sleeve); row(g, 12, 16, 17, sleeve);
    if (hr < 11) col(g, 17, hr + 1, 11, skin);
    row(g, hr, hc, hc + 1, skin);
  };
  const f2 = Math.floor(tp * 2) % 2;
  const f6 = Math.floor(tp * 6) % 2;
  const f8 = Math.floor(tp * 8) % 2;
  switch (pose) {
    case 'walk': {
      const walkF = Math.floor(tp * 8) % 4;
      const swing = walkF === 1 ? 1 : walkF === 3 ? -1 : 0;
      down(0, Math.max(0, swing));
      down(15, Math.max(0, -swing));
      break;
    }
    case 'write':
      down(0, 2); down(15, 2);
      if (!ghost) { row(g, f8 ? 16 : 17, 2, 3, skin); row(g, f8 ? 17 : 16, 13, 14, skin); }
      break;
    case 'read':
      down(0, 2); down(15, 2);
      if (!back) {
        row(g, 13, 4, 12, 'N');
        for (let r = 14; r <= 18; r++) row(g, r, 3, 13, 'O');
        row(g, 15, 6, 10, 'Y'); col(g, 8, 14, 18, 'K');
        row(g, 16, 2, 3, skin); row(g, 16, 13, 14, skin);
      }
      break;
    case 'think':
      down(0);
      put(g, 13, 15, sleeve); row(g, 14, 15, 16, sleeve); row(g, 13, 16, 16, sleeve);
      if (!ghost) { put(g, 12, 15, skin); put(g, 12, 16, skin); row(g, 11, 12, 14, skin); }
      break;
    case 'run':
      down(0, f6 ? 2 : 0);
      down(15, f6 ? 0 : 2);
      if (!ghost) row(g, 19, f6 ? 15 : 0, f6 ? 16 : 1, skin);
      break;
    case 'search':
      down(0);
      raised(10, 17);
      dots(g, [[9, 18], [8, 19]], 'Q');
      row(g, 3, 20, 22, 'Q'); row(g, 7, 20, 22, 'Q');
      for (const c of [19, 23]) col(g, c, 4, 6, 'Q');
      for (let r = 4; r <= 6; r++) row(g, r, 20, 22, 'L');
      put(g, 4, 22, 'w');
      break;
    case 'web':
      down(0);
      raised(10, 16);
      row(g, 5, 17, 19, 'Q'); row(g, 9, 17, 19, 'Q');
      col(g, 17, 6, 8, 'Q'); col(g, 19, 6, 8, 'Q');
      col(g, 18, 6, 8, 'L');
      break;
    case 'delegate': {
      down(0);
      const r = f2 ? 13 : 14;
      put(g, 13, 15, sleeve); row(g, 14, 15, 16, sleeve);
      if (!ghost) row(g, r, 17, 20, skin);
      break;
    }
    case 'talk': {
      const up = f2 ? 0 : 15;
      down(up === 0 ? 15 : 0);
      const c = up === 0 ? 1 : 15;
      const out = up === 0 ? -1 : 1;
      put(g, 13, c, sleeve); row(g, 12, Math.min(c, c + out), Math.max(c, c + out), sleeve);
      if (!ghost) { put(g, 11, c + out, skin); put(g, 10, c + out, skin); put(g, 9, c + 2 * out, skin); }
      break;
    }
    case 'done':
      for (const [c, o] of [[1, -1], [15, 1]] as const) {
        put(g, 13, c, sleeve); put(g, 12, c + o, sleeve); put(g, 12, c, sleeve);
        if (!ghost) { put(g, 11, c + o, skin); put(g, 10, c + o, skin); put(g, 9, c + 2 * o, skin); put(g, 8, c + 2 * o, skin); }
      }
      break;
    default:
      down(0);
      down(15);
  }
}
