import type { Activity, AgentEvent } from '../agents.ts';
import type { Account } from '../claude/account.ts';
import { clip } from '../claude/activity.ts';
import type { RGB } from '../term/color.ts';
import { mix } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import type { Theme } from '../themes/types.ts';
import { spriteFor } from '../world/character.ts';
import type { Actor } from '../world/stage.ts';

export type ChromeCtx = {
  theme: Theme;
  actors: Actor[];
  selectedId: string | null;
  account: Account | null;
  mode: string;
  events: AgentEvent[];
  notice: string;
  // A passing tip, at the start of the ticker row.
  tip?: string;
  t: number;
  now: number;
  paused: boolean;
  // No roster on screen: show the selected agent in the ticker row instead.
  selectionInFooter?: boolean;
};

const GLYPHS: Record<Activity, string> = {
  write: '✎', read: '▤', search: '◎', run: '▶', web: '≋', delegate: '⇢', think: '…', talk: '»', done: '✔', idle: '◌', error: '✖',
};

export function activityGlyph(a: Activity): string {
  return GLYPHS[a];
}

export function activityColor(a: Activity, theme: Theme): RGB {
  const p = theme.palette;
  switch (a) {
    case 'done': return p.good;
    case 'error': return p.bad;
    case 'idle': return p.dim;
    case 'run': return p.warn;
    case 'web':
    case 'delegate': return p.accent2;
    default: return p.accent;
  }
}

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const working = (a: Actor) => a.info.activity !== 'idle' && a.info.activity !== 'done';

function fillRow(s: Screen, r: Rect, y: number, bg: RGB): void {
  s.fill({ x: r.x, y, w: r.w, h: 1 }, ' ', undefined, bg);
}

export function drawHeader(s: Screen, r: Rect, c: ChromeCtx): void {
  const p = c.theme.palette;
  fillRow(s, r, r.y, p.panel);
  const end = r.x + r.w;
  let x = r.x + 1;
  const brand = '◆ ANIMUS';
  [...brand].forEach((ch, i) => {
    const k = (Math.sin(c.t * 2.2 - i * 0.55) + 1) / 2;
    s.put(x + i, r.y, ch, mix(p.accent, p.accent2, k), p.panel, BOLD);
  });
  x += brand.length + 1;
  x = s.text(x, r.y, '▸ ', p.dim, p.panel, 0, end);
  x = s.text(x, r.y, c.theme.name, p.panelText, p.panel, BOLD, end);
  if (c.paused) x = s.text(x + 2, r.y, '❚❚ paused', p.warn, p.panel, BOLD, end);

  const busy = c.actors.filter(working).length;
  const idle = c.actors.length - busy;
  const clock = new Date(c.now);
  const hhmm = `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;
  const parts: Array<[string, RGB]> = [
    [`● ${busy} working`, p.good],
    [`○ ${idle} idle`, p.dim],
    [c.account ? `◉ ${c.account.name}${c.account.plan ? ` · ${c.account.plan}` : ''}` : '◉ not signed in', p.panelText],
    [` ${c.mode.toUpperCase()} `, p.panel],
    [hhmm, p.panelText],
  ];
  const total = parts.reduce((n, [str]) => n + [...str].length + 2, 0);
  let rx = Math.max(x + 3, end - total);
  for (const [str, color] of parts) {
    if (rx >= end) break;
    const badge = str.startsWith(' ');
    // The mode badge is an outline, not a block: it labels, it doesn't shout.
    if (badge) rx = s.text(rx, r.y, `[${str.trim()}]`, c.mode === 'demo' ? p.warn : p.good, p.panel, BOLD, end) + 2;
    else rx = s.text(rx, r.y, str, color, p.panel, 0, end) + 2;
  }
}

export function drawRoster(s: Screen, r: Rect, c: ChromeCtx): void {
  const p = c.theme.palette;
  const bg = mix(p.panel, p.bg, 0.35);
  for (let y = r.y; y < r.y + r.h; y++) {
    fillRow(s, r, y, bg);
    s.put(r.x, y, '│', p.border, bg);
  }
  const end = r.x + r.w;
  s.text(r.x + 2, r.y, 'CREW', p.panelText, bg, BOLD, end);
  s.text(r.x + 7, r.y, `${c.actors.length}`, p.dim, bg, 0, end);
  let y = r.y + 1;
  const bottom = r.y + r.h;
  for (let i = 0; i < c.actors.length; i++) {
    const a = c.actors[i];
    // A gap between teams (each lead and its subagents), when there's room.
    if (i > 0 && a.info.role === 'lead' && y + 3 <= bottom) y++;
    if (y + 2 > bottom) {
      s.text(r.x + 2, Math.min(y, bottom - 1), `+${c.actors.length - i} more`, p.dim, bg, 0, end);
      break;
    }
    const sel = a.info.id === c.selectedId;
    const rowBg = sel ? mix(bg, a.traits.color, 0.28) : bg;
    s.fill({ x: r.x + 1, y, w: end - r.x - 1, h: 2 }, ' ', undefined, rowBg);
    const indent = a.info.role === 'lead' ? r.x + 2 : r.x + 3;
    if (a.info.role !== 'lead') s.put(r.x + 2, y, '└', p.dim, rowBg);
    const face = spriteFor(a.traits, 'idle', c.t, 1, a.phase).cells[1];
    for (let k = 1; k <= 3; k++) {
      const cell = face[k];
      if (cell) s.put(indent + k - 1, y, cell.ch, cell.fg, cell.bg ?? rowBg);
    }
    const age = elapsed(c.now - a.info.since);
    const nameEnd = end - age.length - 2;
    // Waiting and finished agents step back so the busy ones stand out.
    const quiet = !working(a) && !sel;
    s.text(indent + 4, y, clip(a.info.name, Math.max(1, nameEnd - indent - 4)), quiet ? mix(a.traits.color, rowBg, 0.45) : a.traits.color, rowBg, BOLD, nameEnd);
    s.text(end - age.length - 1, y, age, p.dim, rowBg, 0, end);
    const act = a.info.activity;
    s.put(indent + 1, y + 1, activityGlyph(act), activityColor(act, c.theme), rowBg);
    s.text(indent + 3, y + 1, clip(a.info.detail || act, end - indent - 4), sel ? p.panelText : mix(p.panelText, bg, 0.35), rowBg, 0, end - 1);
    y += 2;
  }
}

const KEYS: Array<[string, string]> = [
  ['t', 'theme'], ['p', 'pick'], ['tab', 'select'], ['+/-', 'zoom'], ['r', 'pixels'], ['space', 'pause'], ['?', 'help'], ['q', 'quit'],
];

export function drawFooter(s: Screen, r: Rect, c: ChromeCtx): void {
  const p = c.theme.palette;
  const end = r.x + r.w;
  const tickerBg = mix(p.panel, p.bg, 0.5);
  fillRow(s, r, r.y, tickerBg);
  fillRow(s, r, r.y + 1, p.panel);
  let x = r.x + 1;
  if (c.tip) {
    x = s.text(x, r.y, c.tip, p.accent, tickerBg, BOLD, end);
    x = s.text(x, r.y, '  ·  ', p.dim, tickerBg, 0, end);
  }
  const sel = c.selectionInFooter ? c.actors.find((a) => a.info.id === c.selectedId) : undefined;
  if (sel) {
    x = s.text(x, r.y, '▸ ', sel.traits.color, tickerBg, BOLD, end);
    x = s.text(x, r.y, sel.info.name, sel.traits.color, tickerBg, BOLD, end);
    x = s.text(x, r.y, ` ${activityGlyph(sel.info.activity)} `, activityColor(sel.info.activity, c.theme), tickerBg, 0, end);
    x = s.text(x, r.y, sel.info.detail || sel.info.activity, p.panelText, tickerBg, 0, end);
    s.text(x, r.y, `  · ${sel.info.project} · ${elapsed(c.now - sel.info.since)}`, p.dim, tickerBg, 0, end);
  }
  const recent = sel ? [] : c.events.slice(-12).reverse();
  if (!sel && recent.length === 0) s.text(x, r.y, 'waiting for agent activity…', p.dim, tickerBg, 0, end);
  const colorOf = new Map(c.actors.map((a) => [a.info.id, a.traits.color] as const));
  recent.forEach((e, i) => {
    if (x >= end - 4) return;
    const fresh = c.now - e.at < 1500;
    if (i > 0) x = s.text(x, r.y, '  ·  ', p.dim, tickerBg, 0, end);
    // How long ago, on the newest entry only: the rest read in order.
    if (i === 0) x = s.text(x, r.y, `${elapsed(c.now - e.at)} `, p.dim, tickerBg, 0, end);
    const who = colorOf.get(e.agentId) ?? p.panelText;
    x = s.text(x, r.y, clip(e.name, 12), fresh ? who : mix(who, tickerBg, 0.25), tickerBg, BOLD, end);
    x = s.text(x, r.y, ` ${activityGlyph(e.activity)} `, activityColor(e.activity, c.theme), tickerBg, 0, end);
    x = s.text(x, r.y, clip(e.detail, 32), fresh ? p.panelText : mix(p.panelText, tickerBg, 0.4), tickerBg, 0, end);
  });
  x = r.x + 1;
  for (const [k, label] of KEYS) {
    if (x >= end) break;
    x = s.text(x, r.y + 1, ` ${k} `, p.panelText, mix(p.panel, p.accent, 0.35), BOLD, end);
    x = s.text(x, r.y + 1, ` ${label}  `, p.panelText, p.panel, 0, end);
  }
  if (c.notice) {
    // Keep the end of the notice (the actionable hint) when space is short.
    const room = Math.max(10, end - x - 2);
    const chars = [...c.notice];
    const n = chars.length > room ? '…' + chars.slice(chars.length - room + 1).join('') : c.notice;
    s.text(Math.max(x, end - [...n].length - 1), r.y + 1, n, p.warn, p.panel, BOLD, end);
  }
}
