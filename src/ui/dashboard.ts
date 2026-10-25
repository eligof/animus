import type { Activity, AgentInfo } from '../agents.ts';
import { clip } from '../claude/activity.ts';
import type { RGB } from '../term/color.ts';
import { mix } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import { cellSafe } from '../term/width.ts';
import type { Palette } from '../themes/types.ts';

// The text fallback for terminals that cannot show images: one card per
// agent in a responsive grid (status, current tool/file, activity sparkline).

export const CARD_MIN_W = 34;
export const CARD_H = 5;
const MAX_COLS = 4;
const GAP_X = 2;
const GAP_Y = 1;
const WINDOW_MS = 10 * 60_000; // the sparkline's span
const RATE_MS = 60_000; // each sample counts the minute before it
const ERROR_MS = 60_000; // a past error stays flagged this long
const KEEP_MS = 60_000; // history of a vanished agent, in case it comes back
const MIN_SCALE = 6; // events per minute that fill a sparkline bar, at least
const BARS = '▁▂▃▄▅▆▇█';
const RATE_W = 8; // ' 120/min'

// Same glyphs as the roster and ticker (chrome.ts), kept local so the
// dashboard does not depend on the scene's types.
const GLYPHS: Record<Activity, string> = {
  write: '✎', read: '▤', search: '◎', run: '▶', web: '≋', delegate: '⇢', think: '…', talk: '»', done: '✔', idle: '◌', error: '✖',
};

const LABELS: Record<Activity, string> = {
  write: 'writing', read: 'reading', search: 'searching', run: 'running', web: 'on the web', delegate: 'delegating',
  think: 'thinking', talk: 'talking', done: 'done', idle: 'idle', error: 'error',
};

function tone(a: Activity, p: Palette): RGB {
  switch (a) {
    case 'done': return p.good;
    case 'error': return p.bad;
    case 'idle': return p.dim;
    case 'run': return p.warn;
    case 'web':
    case 'delegate': return p.accent2;
    case 'think':
    case 'talk': return mix(p.accent, p.panelText, 0.45);
    default: return p.accent;
  }
}

function age(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// Columns and card width for a rect `w` cells wide; `left` is the first
// card's offset, which centres the grid.
export function grid(w: number): { cols: number; cardW: number; left: number } {
  const margin = w >= CARD_MIN_W + 2 ? 1 : 0;
  const inner = Math.max(1, w - 2 * margin);
  const cols = Math.max(1, Math.min(MAX_COLS, Math.floor((inner + GAP_X) / (CARD_MIN_W + GAP_X))));
  const cardW = Math.max(1, Math.floor((inner - (cols - 1) * GAP_X) / cols));
  const used = cols * cardW + (cols - 1) * GAP_X;
  return { cols, cardW, left: margin + Math.max(0, Math.floor((inner - used) / 2)) };
}

// Events per minute at `n` moments spread evenly over the last ten minutes
// (oldest first, the last one at `now`), each counting the minute before
// it; -1 where the agent had not been seen yet. `times` is ascending.
export function activityRates(times: readonly number[], now: number, n: number, firstSeen = -Infinity): number[] {
  const out: number[] = [];
  const step = WINDOW_MS / Math.max(1, n);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const at = now - (n - 1 - i) * step;
    while (hi < times.length && times[hi] <= at) hi++;
    while (lo < hi && times[lo] <= at - RATE_MS) lo++;
    out.push(at < firstSeen ? -1 : hi - lo);
  }
  return out;
}

// One bar per rate, scaled so `max` fills a cell; unseen (-1) is blank and
// any activity shows at least the lowest bar.
export function sparkline(rates: readonly number[], max: number): string {
  const top = Math.max(1, max);
  return rates
    .map((v) => {
      if (v < 0) return ' ';
      const level = v === 0 ? 0 : Math.max(1, Math.min(8, Math.round((v / top) * 8)));
      return BARS[Math.max(0, level - 1)];
    })
    .join('');
}

type Track = {
  seq: number;
  info: AgentInfo;
  firstSeen: number;
  lastSeen: number;
  changes: number[];
  error: { text: string; at: number } | null;
};

type Entry = { t: Track; depth: number; team: number; teamSize: number; parent: string; subs: number };

type Ink = {
  put(x: number, y: number, ch: string, fg: RGB, bg: RGB, attr?: number): void;
  text(x: number, y: number, s: string, fg: RGB, bg: RGB, attr?: number, maxX?: number): number;
  fill(q: Rect, bg: RGB): void;
};

// Draws through `r` only: cells outside it are never touched.
function inkFor(s: Screen, r: Rect): Ink {
  const put = (x: number, y: number, ch: string, fg: RGB, bg: RGB, attr = 0) => {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) s.put(x, y, ch, fg, bg, attr);
  };
  return {
    put,
    text(x, y, str, fg, bg, attr = 0, maxX = Infinity) {
      let cx = x;
      for (const ch of str) {
        if (cx >= maxX) break;
        const safe = cellSafe(ch);
        if (!safe) continue;
        put(cx, y, safe, fg, bg, attr);
        cx++;
      }
      return cx;
    },
    fill(q, bg) {
      for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) put(x, y, ' ', bg, bg);
    },
  };
}

const len = (s: string) => [...s].length;

// Cards in reading order; a team with subagents starts on a fresh row (and
// so does the team after it) when `breaks` is on.
function place(list: Entry[], cols: number, breaks: boolean): { at: Array<{ row: number; col: number }>; rows: number } {
  const at: Array<{ row: number; col: number }> = [];
  let row = 0;
  let col = 0;
  list.forEach((e, i) => {
    if (i > 0) {
      col++;
      const fresh = breaks && e.depth === 0 && (e.teamSize > 1 || list[i - 1].teamSize > 1);
      if (col >= cols || (fresh && col > 0)) {
        row++;
        col = 0;
      }
    }
    at.push({ row, col });
  });
  return { at, rows: list.length ? row + 1 : 0 };
}

export type DashboardOpts = {
  palette: Palette;
  now: number;
  selectedId: string | null;
  // Highlight for the selected card (defaults to the palette's accent).
  accent?: RGB;
};

export class Dashboard {
  private tracks = new Map<string, Track>();
  private ids: string[] = [];
  private seq = 0;
  // First visible card row when the grid overflows its rect.
  private scroll = 0;

  // Call every tick with the current agents: records activity and detail
  // changes for the sparklines and remembers each agent's first sighting,
  // which fixes its place in the order.
  observe(agents: AgentInfo[], now: number): void {
    const seen = new Set<string>();
    for (const a of agents) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      let t = this.tracks.get(a.id);
      if (!t) {
        t = { seq: this.seq++, info: a, firstSeen: now, lastSeen: now, changes: [], error: null };
        this.tracks.set(a.id, t);
        if (a.activity === 'error') t.error = { text: a.detail, at: now };
      } else if (t.info.activity !== a.activity || t.info.detail !== a.detail) {
        t.changes.push(now);
        if (a.activity === 'error') t.error = { text: a.detail, at: now };
      }
      t.info = { ...a };
      t.lastSeen = now;
      const cut = now - WINDOW_MS - RATE_MS;
      let k = 0;
      while (k < t.changes.length && t.changes[k] <= cut) k++;
      if (k) t.changes.splice(0, k);
    }
    for (const [id, t] of this.tracks) if (!seen.has(id) && now - t.lastSeen > KEEP_MS) this.tracks.delete(id);
    this.ids = [...seen];
  }

  // Agent ids in card order (for cycling the selection the way it reads).
  order(): string[] {
    return this.entries().map((e) => e.t.info.id);
  }

  // Leads in the order they were first seen, each followed by its
  // subagents; subagents whose lead is gone come after all teams.
  private entries(): Entry[] {
    const live = this.ids.map((id) => this.tracks.get(id)).filter((t): t is Track => !!t).sort((a, b) => a.seq - b.seq);
    const byId = new Map(live.map((t) => [t.info.id, t] as const));
    const kids = new Map<string, Track[]>();
    const roots: Track[] = [];
    const orphans: Track[] = [];
    for (const t of live) {
      const pid = t.info.role === 'sub' ? t.info.parentId : undefined;
      if (pid && pid !== t.info.id && byId.has(pid)) {
        const list = kids.get(pid) ?? [];
        list.push(t);
        kids.set(pid, list);
      } else if (t.info.role === 'lead') roots.push(t);
      else orphans.push(t);
    }
    const out: Entry[] = [];
    const done = new Set<string>();
    let team = -1;
    const visit = (t: Track, depth: number, parent: string) => {
      if (done.has(t.info.id)) return;
      done.add(t.info.id);
      const sub = kids.get(t.info.id) ?? [];
      out.push({ t, depth, team, teamSize: 0, parent, subs: sub.length });
      for (const k of sub) visit(k, depth + 1, t.info.name);
    };
    // Parent links that loop never reach a root; they still get cards.
    for (const t of [...roots, ...orphans, ...live]) {
      if (done.has(t.info.id)) continue;
      team++;
      visit(t, 0, '');
    }
    const sizes = new Map<number, number>();
    for (const e of out) sizes.set(e.team, (sizes.get(e.team) ?? 0) + 1);
    for (const e of out) e.teamSize = sizes.get(e.team) ?? 1;
    return out;
  }

  // Draws inside `r` only (the header, roster and footer stay the caller's).
  draw(s: Screen, r: Rect, o: DashboardOpts): void {
    if (r.w <= 0 || r.h <= 0) return;
    const p = o.palette;
    const ink = inkFor(s, r);
    ink.fill(r, p.bg);
    const list = this.entries();
    if (list.length === 0) {
      this.drawEmpty(ink, r, p);
      return;
    }
    if (r.h < CARD_H || r.w < 12) {
      this.drawList(ink, r, list, o);
      return;
    }
    const g = grid(r.w);
    const top = r.h >= CARD_H + 2 ? 1 : 0;
    const avail = r.h - top;
    const pitch = CARD_H + GAP_Y;
    const fits = Math.max(1, Math.floor((avail + GAP_Y) / pitch));
    let cells = place(list, g.cols, true);
    if (cells.rows > fits) cells = place(list, g.cols, false);
    const over = cells.rows > fits;
    // No room for the "more" rows around a single card row: list instead.
    if (over && top === 0) {
      this.drawList(ink, r, list, o);
      return;
    }
    // Overflowing, every card row keeps the gap row under it for "▼ more".
    const visible = over ? Math.max(1, Math.floor(avail / pitch)) : fits;
    const sel = list.findIndex((e) => e.t.info.id === o.selectedId);
    if (sel >= 0) {
      const row = cells.at[sel].row;
      if (row < this.scroll) this.scroll = row;
      else if (row >= this.scroll + visible) this.scroll = row - visible + 1;
    }
    this.scroll = over ? Math.max(0, Math.min(this.scroll, cells.rows - visible)) : 0;

    const sw = g.cardW - 4 >= 16 ? g.cardW - 4 - RATE_W : Math.max(0, g.cardW - 4);
    const rates = list.map((e) => activityRates(e.t.changes, o.now, sw, e.t.firstSeen));
    const max = Math.max(MIN_SCALE, ...rates.flat());
    let above = 0;
    let below = 0;
    list.forEach((e, i) => {
      const { row, col } = cells.at[i];
      if (row < this.scroll) above++;
      else if (row >= this.scroll + visible) below++;
      else {
        const x = r.x + g.left + col * (g.cardW + GAP_X);
        const y = r.y + top + (row - this.scroll) * pitch;
        this.drawCard(ink, x, y, g.cardW, e, o, rates[i], max);
      }
    });
    const more = (n: number, arrow: string, y: number) => {
      const t = `${arrow} +${n} more`;
      ink.text(r.x + Math.max(0, Math.floor((r.w - len(t)) / 2)), y, t, p.dim, p.bg, 0, r.x + r.w);
    };
    if (above) more(above, '▲', r.y);
    if (below) more(below, '▼', r.y + top + visible * pitch - GAP_Y);
  }

  private drawCard(ink: Ink, x: number, y: number, w: number, e: Entry, o: DashboardOpts, rates: number[], max: number): void {
    const p = o.palette;
    const a = e.t.info;
    const acc = o.accent ?? p.accent;
    const sel = a.id === o.selectedId;
    const err = a.activity === 'error';
    // Waiting and finished agents step back so the busy ones stand out.
    const quiet = (a.activity === 'idle' || a.activity === 'done') && !sel;
    const bg = sel ? mix(p.panel, acc, 0.1) : p.panel;
    const fade = (c: RGB) => (quiet ? mix(c, bg, 0.5) : c);
    let edge = a.role === 'lead' ? p.border : mix(p.border, p.bg, 0.3);
    if (err) edge = p.bad;
    if (quiet) edge = mix(edge, p.bg, 0.45);
    if (sel) edge = acc;
    const right = x + w - 1;
    const bottom = y + CARD_H - 1;

    ink.fill({ x, y, w, h: CARD_H }, bg);
    for (let cx = x + 1; cx < right; cx++) {
      ink.put(cx, y, '─', edge, bg);
      ink.put(cx, bottom, '─', edge, bg);
    }
    for (let cy = y + 1; cy < bottom; cy++) {
      ink.put(x, cy, '│', edge, bg);
      ink.put(right, cy, '│', edge, bg);
    }
    ink.put(x, y, '╭', edge, bg);
    ink.put(right, y, '╮', edge, bg);
    ink.put(x, bottom, '╰', edge, bg);
    ink.put(right, bottom, '╯', edge, bg);

    // Border labels, "╭─ left ──── right ─╮": each side is the first of its
    // forms that fits (else the last, clipped); the right one always keeps
    // room for its shortest form.
    const room = w - 6;
    const fit = (forms: string[], n: number) => forms.find((f) => len(f) <= n) ?? clip(forms[forms.length - 1], n);
    const label = (yy: number, lefts: string[], lf: RGB, la: number, rights: string[], rf: RGB) => {
      if (room <= 0) return;
      const least = rights.length ? len(rights[rights.length - 1]) + 3 : 0;
      const l = fit(lefts, Math.max(1, room - least));
      const rt = rights.length ? fit(rights, room - len(l) - 3) : '';
      if (l) ink.text(x + 2, yy, ` ${l} `, lf, bg, la, right - 1);
      if (rt) ink.text(right - 2 - len(rt) - 1, yy, ` ${rt} `, rf, bg, 0, right - 1);
    };
    const recent = !err && e.t.error && o.now - e.t.error.at < ERROR_MS ? e.t.error : null;
    const ago = recent ? `${age(o.now - recent.at)} ago` : '';
    const flags = recent ? [`✖ ${clip(recent.text || 'error', 24)} · ${ago}`, `✖ ${clip(recent.text || 'error', 12)}`, `✖ ${ago}`, '✖'] : [];
    label(y, [clip(a.name || a.id, 60)], sel ? acc : fade(p.panelText), BOLD, flags, p.bad);

    const project = clip(a.project, 40);
    const lead = project ? `lead · ${project}` : 'lead';
    const kind = clip(a.agentType || 'subagent', 30);
    const parent = clip(e.parent, 30);
    const subs = `${e.subs} sub${e.subs > 1 ? 's' : ''}`;
    let context = e.subs ? [`${lead} · ${subs}`, lead] : [lead];
    if (a.role === 'sub') context = parent ? [`${kind} · sub of ${parent}`, `${kind} · ↳ ${parent}`] : [project ? `${kind} · ${project}` : kind];
    label(bottom, context, fade(p.dim), 0, [], p.dim);

    const cx = x + 2;
    const end = right - 1;
    if (end <= cx) return;
    // Status: glyph and label in the activity's colour, time in it on the right.
    const act = a.activity;
    const c = fade(tone(act, p));
    const since = age(o.now - a.since);
    const tail = end - cx >= len(since) + 4 ? since : '';
    ink.put(cx, y + 1, GLYPHS[act], c, bg);
    ink.text(cx + 2, y + 1, LABELS[act], c, bg, BOLD, tail ? end - len(tail) - 1 : end);
    if (tail) ink.text(end - len(tail), y + 1, tail, fade(p.dim), bg, 0, end);

    // What it is doing: tool and file, command or query.
    const detail = clip(a.detail, end - cx);
    ink.text(cx, y + 2, detail || '—', err ? p.bad : detail ? fade(p.panelText) : fade(p.dim), bg, 0, end);

    // Activity: events a minute over the last ten minutes.
    const bars = sparkline(rates, max);
    const lit = fade(mix(p.accent, p.panelText, 0.15));
    const base = mix(p.dim, bg, 0.55);
    [...bars].forEach((ch, i) => {
      if (rates[i] < 0) ink.put(cx + i, y + 3, '·', mix(p.dim, bg, 0.75), bg);
      else ink.put(cx + i, y + 3, ch, rates[i] > 0 ? lit : base, bg);
    });
    if (bars.length && end - cx - bars.length >= RATE_W) {
      const now = rates[rates.length - 1];
      const rate = `${Math.max(0, now)}/min`;
      ink.text(end - len(rate), y + 3, rate, fade(p.dim), bg, 0, end);
    }
  }

  // One line per agent, for rects too small for cards.
  private drawList(ink: Ink, r: Rect, list: Entry[], o: DashboardOpts): void {
    const p = o.palette;
    const acc = o.accent ?? p.accent;
    const end = r.x + r.w;
    const n = list.length;
    const over = n > r.h;
    const slots = over ? Math.max(1, r.h - 1) : n;
    const sel = list.findIndex((e) => e.t.info.id === o.selectedId);
    const start = over && sel >= slots ? sel - slots + 1 : 0;
    for (let i = 0; i < slots && start + i < n; i++) {
      const e = list[start + i];
      const a = e.t.info;
      const y = r.y + i;
      const isSel = a.id === o.selectedId;
      const bg = isSel ? mix(p.bg, acc, 0.18) : p.bg;
      const quiet = (a.activity === 'idle' || a.activity === 'done') && !isSel;
      const fade = (c: RGB) => (quiet ? mix(c, bg, 0.5) : c);
      ink.fill({ x: r.x, y, w: r.w, h: 1 }, bg);
      let x = r.x + (e.depth > 0 && r.w >= 16 ? 2 : 0);
      ink.put(x, y, GLYPHS[a.activity], fade(tone(a.activity, p)), bg);
      x = ink.text(x + 2, y, clip(a.name || a.id, Math.max(1, end - x - 2)), isSel ? acc : fade(p.panelText), bg, BOLD, end);
      if (end - x > 3) ink.text(x + 1, y, clip(a.detail, end - x - 1), a.activity === 'error' ? p.bad : fade(p.dim), bg, 0, end);
    }
    if (over && r.h >= 2) ink.text(r.x, r.y + r.h - 1, `+${n - slots} more`, p.dim, p.bg, 0, end);
  }

  private drawEmpty(ink: Ink, r: Rect, p: Palette): void {
    const head = 'no agents yet';
    const rest = 'start Claude Code in another terminal';
    const one = `${head} — ${rest}`;
    const mid = r.y + Math.floor((r.h - 1) / 2);
    const centre = (y: number, t: string, fg: RGB, attr = 0) => {
      const s = clip(t, r.w);
      ink.text(r.x + Math.max(0, Math.floor((r.w - len(s)) / 2)), y, s, fg, p.bg, attr, r.x + r.w);
    };
    if (len(one) + 4 <= r.w) {
      const x = r.x + Math.floor((r.w - len(one)) / 2);
      const after = ink.text(x, mid, head, p.text, p.bg, BOLD);
      ink.text(after, mid, ` — ${rest}`, p.dim, p.bg);
    } else if (r.h >= 2) {
      centre(mid, head, p.text, BOLD);
      centre(mid + 1, rest, p.dim);
    } else centre(mid, head, p.text, BOLD);
  }
}
