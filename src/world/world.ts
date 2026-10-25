import type { AgentEvent, AgentInfo, AgentSource, Bubble, Gain } from '../agents.ts';
import type { Account } from '../claude/account.ts';
import { followAll } from '../claude/inbox.ts';
import type { Outgoing } from '../claude/inbox.ts';
import { DEMO_XP, DemoSource } from '../demo/source.ts';
import { Crews, roleOf } from '../pet/crew.ts';
import type { Award } from '../pet/crew.ts';
import type { CrewStore } from '../pet/store.ts';
import type { Rect, Screen } from '../term/screen.ts';
import type { Key } from '../term/terminal.ts';
import { THEMES } from '../themes/index.ts';
import type { Theme } from '../themes/types.ts';
import { drawFooter, drawHeader, drawRoster } from '../ui/chrome.ts';
import type { ChromeCtx } from '../ui/chrome.ts';
import { Dashboard } from '../ui/dashboard.ts';
import { computeLayout } from '../ui/layout.ts';
import { drawHelp, drawPicker, drawTooSmall, drawWipe } from '../ui/overlays.ts';
import { meters } from '../pet/meters.ts';
import { drawCard } from '../ui/card.ts';
import type { Box, Side } from '../ui/card.ts';
import { chatKey, closeChat, drawChat, newChatView } from '../ui/chat.ts';
import type { ChatView } from '../ui/chat.ts';
import { figureBox } from './frame.ts';
import type { SceneFrame } from './frame.ts';
import { Stage } from './stage.ts';

// What fills the scene's rect: the illustrated scene (an image drawn under
// the cells, with the labels as text over it), or the agent dashboard
// (text, for terminals without images).
export type View = 'scene' | 'dashboard';

export type WorldOpts = {
  theme: Theme;
  live: AgentSource | null;
  demo: boolean;
  account: Account | null;
  rootLabel: string;
  start: number;
  // Default: the scene where the terminal shows images, else the dashboard.
  view?: View;
  // The terminal can show images, so r may switch to the scene.
  images?: boolean;
  lights?: boolean;
  // Where the live agents' crews are kept (see pet/store.ts): read at the
  // start, written as they grow. None: they live in memory only.
  crews?: CrewStore;
};

// The side of its character an agent's card took (null: docked).
type CardSide = { id: string; side: Side | null };

const MAX_EVENTS = 60;
const WIPE_MS = 700;
const TIP_MS = 3000;
// Sent messages kept per agent.
const MAX_SENT = 50;
// Messages still to follow: a failed one too, which its transcript may
// show after all.
const inFlight = (o: Outgoing) => o.status !== 'delivered' && o.status !== 'copied';

// The agent with its role's level in its crew: a copy, made again only
// when the source hands over a new object or the level moves.
const copies = new WeakMap<AgentInfo, AgentInfo>();
function ranked(a: AgentInfo, crews: Crews): AgentInfo {
  if (!a.crew) return a;
  const level = crews.level(a.crew, roleOf(a));
  let out = copies.get(a);
  if (out?.level !== level) copies.set(a, (out = { ...a, level }));
  return out;
}

// The demo's crews, some way along already (a throwaway, never saved).
function demoCrews(): Crews {
  const c = new Crews();
  for (const [crew, roles] of Object.entries(DEMO_XP)) for (const [role, xp] of Object.entries(roles)) c.give(crew, role, xp);
  return c;
}

// Everything on screen: sources → stage simulation → chrome and overlays.
// Pure with respect to time (callers pass `now`), so snapshots are
// reproducible and the interactive loop is a thin IO wrapper.
export class World {
  theme: Theme;
  selectedId: string | null = null;
  overlay: 'none' | 'help' | 'picker' = 'none';
  paused = false;
  demoOn: boolean;
  private stage: Stage;
  private live: AgentSource | null;
  private demo: DemoSource | null = null;
  // The live agents' crews (kept in `store`) and the demo's.
  private crews: Crews;
  private store: CrewStore | null;
  private demoCrew = demoCrews();
  // Level-ups since the last tick, to celebrate in the scene: the highest
  // of each crew role.
  private ups = new Map<string, Award>();
  private account: Account | null;
  private rootLabel: string;
  private events: AgentEvent[] = [];
  private lastTick: number;
  private liveCount = 0;
  private lastLive: AgentInfo[] = [];
  // The live source's agents as of the last poll (see owner).
  private liveIds = new Set<string>();
  private sceneKey = '';
  private start: number;
  private themeChangedAt = -Infinity;
  private pickerOrigin = '';
  // The scene fills the whole terminal (f): no header, roster or footer.
  full = false;
  // The selected agent's card shows (i turns it off and on).
  card = true;
  // The side of its character the card took last frame, kept while it
  // fits there so the card does not flip back and forth (null: no card
  // last frame).
  private cardSide: CardSide | null = null;
  // The chat window open for the selected agent (Enter on its card), and
  // each agent's window state, kept while closed so a draft stays.
  private chatId: string | null = null;
  private chats = new Map<string, ChatView>();
  // The last frame had no room for the open chat window (the screen too
  // small, say): until one shows it, keys are the app's, not its.
  private chatHidden = false;
  private sentSeq = 0;
  // Text for the terminal's clipboard (OSC 52), until the app takes it.
  private clip: string | null = null;
  // Inside a bracketed paste: in the chat's input it types, its line
  // breaks as spaces, so a pasted block is one message; anywhere else it
  // is ignored, so pasted letters never act as keys.
  private pasting = false;
  private touched = { view: false, lights: false };
  private images: boolean;
  private shown: View;
  private last: SceneFrame | null = null;
  private dashboard = new Dashboard();
  // A passing tip at the start of the ticker row (see flash).
  private tip = { text: '', until: -Infinity };

  constructor(o: WorldOpts) {
    this.theme = o.theme;
    this.stage = new Stage(o.theme);
    this.images = o.images ?? false;
    this.shown = o.view ?? (this.images ? 'scene' : 'dashboard');
    this.stage.lit = o.lights ?? true;
    this.live = o.live;
    this.demoOn = o.demo;
    this.account = o.account;
    this.rootLabel = o.rootLabel;
    this.lastTick = o.start;
    this.start = o.start;
    if (o.demo) this.demo = new DemoSource(7, o.start);
    this.store = o.crews ?? null;
    this.crews = new Crews(this.store?.load(o.start) ?? {});
  }

  private agents(now: number): AgentInfo[] {
    let live = this.lastLive;
    try {
      live = this.live ? this.live.poll(now) : [];
      this.lastLive = live;
    } catch {
      // Keep showing the last good snapshot of live agents.
    }
    this.liveCount = live.length;
    this.liveIds = new Set(live.map((a) => a.id));
    const demo = this.demoOn && this.demo ? this.demo.poll(now) : [];
    for (const src of [this.live, this.demoOn ? this.demo : null]) {
      try {
        if (src) this.events.push(...src.drainEvents());
      } catch {
        // Events are cosmetic; drop them on failure.
      }
    }
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    this.grow(now);
    return [...live.map((a) => ranked(a, this.crews)), ...demo.map((a) => ranked(a, this.demoCrew))];
  }

  // XP from what the agents did, counted into their crews (each event
  // once). A level-up is celebrated in the scene, unless it came from what
  // the start read of the past. The live crews are saved a while after
  // they change.
  private grow(now: number): void {
    // Each source with its crews and where they are kept (the demo's
    // nowhere).
    const from: Array<[AgentSource | null, Crews, CrewStore | null]> = [
      [this.live, this.crews, this.store],
      [this.demoOn ? this.demo : null, this.demoCrew, null],
    ];
    for (const [src, crews, store] of from) {
      let gains: Gain[] = [];
      try {
        gains = src?.drainGains?.() ?? [];
      } catch {
        // Growth is cosmetic: a failing source earns nothing this time.
      }
      for (const g of gains) {
        const a = crews.count(g);
        if (!a) continue;
        store?.changed(now);
        if (a.level <= a.was || a.at < this.start) continue;
        const k = `${a.crew}\n${a.role}`;
        if (a.level > (this.ups.get(k)?.level ?? 0)) this.ups.set(k, a);
      }
    }
    this.store?.tick(now, this.crews.data());
  }

  // Writes the live crews now if they changed since they were last
  // written (on the way out; again does nothing).
  flushCrews(): void {
    this.store?.flush(this.crews.data());
  }

  // Why the live crews are not being saved this run (null: they are, or
  // there are none to save).
  crewsNote(): string | null {
    const why = this.store?.readError;
    return why ? `crews.json unreadable (${why}): progress not saved this run` : null;
  }

  tick(now: number): void {
    const dt = Math.max(0, Math.min(0.25, (now - this.lastTick) / 1000));
    this.lastTick = now;
    const agents = this.agents(now);
    // The dashboard's history runs in both views, so it has no gaps.
    this.dashboard.observe(agents, now);
    // Sent messages move along as their sends settle and their agents'
    // transcripts show them, paused or not.
    for (const v of this.chats.values()) {
      if (v.sent.some(inFlight)) followAll(v.sent, this.logOf(v.id), now);
    }
    if (this.paused || this.sceneKey === '') {
      this.ups.clear();
      return;
    }
    this.stage.sync(agents, now);
    this.stage.update(dt, now);
    // Everyone of the role that levelled up celebrates, once the stage has
    // moved on (so what that set off is there for the word to keep down).
    for (const up of this.ups.values()) {
      for (const x of this.stage.actors()) if (x.info.crew === up.crew && roleOf(x.info) === up.role) this.stage.levelUp(x.info.id, up.level);
    }
    this.ups.clear();
    if (this.selectedId && !this.stage.actors().some((a) => a.info.id === this.selectedId)) this.selectedId = null;
    // Chat windows go with their agents.
    if (this.chats.size) {
      const here = new Set(this.stage.actors().map((a) => a.info.id));
      for (const id of [...this.chats.keys()]) if (!here.has(id)) this.chats.delete(id);
    }
  }

  // Lays the stage out for a terminal size; call before the first tick and
  // on every resize so agents spawn on real floors.
  resize(cols: number, rows: number): void {
    const L = computeLayout(cols, rows, this.full);
    if (!L.tooSmall) this.ensureLayout(L.scene);
  }

  private ensureLayout(scene: Rect): void {
    const key = `${scene.x},${scene.y},${scene.w},${scene.h},${this.theme.id}`;
    if (key === this.sceneKey) return;
    this.sceneKey = key;
    this.stage.layout(scene);
  }

  private mode(): string {
    if (this.live && this.demoOn) return 'live+demo';
    return this.live ? 'live' : 'demo';
  }

  private notice(): string {
    if (this.live && this.liveCount === 0 && !this.demoOn) return `no live claude agents in ${this.rootLabel} — press d for demo`;
    return '';
  }

  draw(s: Screen, now: number): void {
    const L = computeLayout(s.width, s.height, this.full);
    if (L.tooSmall) {
      this.last = null;
      this.chatHidden = true;
      drawTooSmall(s, this.theme, (now - this.start) / 1000);
      return;
    }
    s.clear(this.theme.palette.bg, this.theme.palette.text);
    this.ensureLayout(L.scene);
    this.last = null;
    const dash = this.shown === 'dashboard';
    // The cards repeat the roster, so the dashboard takes its columns too.
    const body = dash && L.roster ? { ...L.scene, w: L.scene.w + L.roster.w } : L.scene;
    const empty = this.stage.actors().length === 0;
    // Kept only from one frame with a card to the next.
    const side = this.cardSide;
    this.cardSide = null;
    const chat = this.chatView();
    let chatShown = false;
    if (dash) {
      if (!empty) this.dashboard.draw(s, body, { palette: this.theme.palette, now, selectedId: this.selectedId });
      // No characters here: the chat docks.
      if (chat) chatShown = this.showChat(s, body, null, side, chat);
    } else {
      // Blank cells for the image under them (see scene()), the labels over.
      s.punch(L.scene);
      // The card, or the chat it grew into, stands in for the agent's label.
      this.last = this.stage.frame(now, this.selectedId, { card: this.card || chat !== null });
      if (this.last) {
        this.stage.drawLabels(s, this.last);
        if (chat) chatShown = this.showChat(s, L.scene, this.last, side, chat);
        else if (this.card && this.selectedId) this.showCard(s, L.scene, this.last, now, side);
      }
    }
    this.chatHidden = chat !== null && !chatShown;
    if (empty) this.drawEmptyHint(s, body, now);
    this.drawWipe(s, body, now);
    const ctx: ChromeCtx = {
      theme: this.theme,
      actors: this.stage.actors(),
      selectedId: this.selectedId,
      account: this.account,
      mode: this.mode(),
      events: this.events,
      notice: this.notice(),
      tip: now < this.tip.until ? this.tip.text : '',
      t: (now - this.start) / 1000,
      now,
      paused: this.paused,
      selectionInFooter: !L.roster,
      chat: this.chatFocus,
    };
    if (L.header.h) drawHeader(s, L.header, ctx);
    if (L.roster && !dash) drawRoster(s, L.roster, ctx);
    if (L.footer.h) drawFooter(s, L.footer, ctx);
    if (this.overlay === 'help') drawHelp(s, L.scene, this.theme, this.images, this.crewsNote());
    else if (this.overlay === 'picker') drawPicker(s, L.scene, THEMES, this.themeIndex(), ctx.t);
  }

  // The selected agent's card, beside its character and clear of it
  // (docked when the character is out of view).
  private showCard(s: Screen, scene: Rect, f: SceneFrame, now: number, last: CardSide | null): void {
    const actors = this.stage.actors();
    const a = actors.find((x) => x.info.id === this.selectedId);
    if (!a) return;
    const box = this.boxOf(f, scene, a.info.id);
    const v = a.info.vitals;
    const prefer = last?.id === a.info.id ? last.side : null;
    const at = drawCard(
      s,
      scene,
      {
        info: a.info,
        meters: v ? meters(v, now) : null,
        // Live ones only: not finished, nor on their way out.
        subs: actors.filter((x) => x.info.parentId === a.info.id && x.info.activity !== 'done' && x.state !== 'leave').length,
        color: a.traits.color,
        palette: this.theme.palette,
        now,
      },
      box,
      prefer,
    );
    this.cardSide = { id: a.info.id, side: at?.side ?? null };
  }

  // The cells an agent's character covers, when it is in view in `scene`.
  private boxOf(f: SceneFrame, scene: Rect, id: string): Box | null {
    const g = f.figures.find((x) => x.id === id);
    if (!g) return null;
    const b = figureBox(f.camera, g);
    return b.x1 >= scene.x && b.x0 < scene.x + scene.w && b.y1 >= scene.y && b.y0 < scene.y + scene.h ? b : null;
  }

  // The chat window open for the selected agent (null: none). It closes
  // when the selection moves on.
  private chatView(): ChatView | null {
    if (this.chatId !== null && this.chatId !== this.selectedId) this.closeChat();
    return this.chatId === null ? null : (this.chats.get(this.chatId) ?? null);
  }

  // Closes the chat window; its view stays, without what it kept for drawing.
  private closeChat(): void {
    const v = this.chatId === null ? undefined : this.chats.get(this.chatId);
    if (v) closeChat(v);
    this.chatId = null;
  }

  // The chat window keys go to: the open one, unless an overlay has them
  // or the last frame had no room for it.
  private chatForKeys(): ChatView | null {
    return this.overlay === 'none' && !this.chatHidden ? this.chatView() : null;
  }

  // Where keys go in the chat window ('input' or 'log'; null: to none, it
  // is closed or out of sight).
  get chatFocus(): 'input' | 'log' | null {
    return this.chatHidden ? null : (this.chatView()?.focus ?? null);
  }

  // Grows the agent's card into its chat window, the input ready.
  private openChat(id: string): void {
    let v = this.chats.get(id);
    if (!v) {
      v = newChatView(id);
      this.chats.set(id, v);
    }
    v.focus = 'input';
    v.top = null;
    // The window grows with the conversation while open; opened afresh it
    // sizes to it again.
    v.h = 0;
    this.chatId = id;
    this.overlay = 'none';
  }

  // The chat window beside the agent's character, by the card's rules
  // (docked when there is no frame, as in the dashboard). Says whether it
  // found room for it.
  private showChat(s: Screen, r: Rect, f: SceneFrame | null, last: CardSide | null, v: ChatView): boolean {
    const a = this.stage.actors().find((x) => x.info.id === v.id);
    if (!a) return false;
    const prefer = last?.id === v.id ? last.side : null;
    const at = drawChat(s, r, v, { info: a.info, log: this.logOf(v.id) ?? [], reach: this.reachOf(v.id), color: a.traits.color, palette: this.theme.palette }, f ? this.boxOf(f, r, v.id) : null, prefer);
    this.cardSide = { id: v.id, side: at?.side ?? null };
    return at !== null;
  }

  // The draft goes to the agent's session; when it takes no messages, to
  // the clipboard instead, to paste in its terminal. The frame loop never
  // waits on a send: its outcome is taken up on a later tick (followUp).
  private submit(v: ChatView): void {
    const text = v.input.text.trim();
    if (!text) return;
    v.input.clear();
    v.top = null;
    const src = this.owner(v.id);
    const why = this.reachOf(v.id);
    const o: Outgoing = { id: `out-${++this.sentSeq}`, text, at: this.lastTick, status: 'sending', reason: '' };
    v.sent.push(o);
    if (v.sent.length > MAX_SENT) v.sent.splice(0, v.sent.length - MAX_SENT);
    if (why !== null || !src?.send) {
      Object.assign(o, { status: 'copied', reason: why ?? 'it takes no messages' });
      this.clip = text;
      return;
    }
    // Not sent: the text goes back in the input to try again, unless
    // another draft has been begun since.
    const retry = () => {
      if (v.input.text) return;
      for (const ch of text) v.input.type(ch);
    };
    src.send(v.id, text).then(
      (r) => {
        o.result = r;
        if (!r.ok) retry();
      },
      () => {
        o.result = { ok: false, reason: 'send failed' };
        retry();
      },
    );
  }

  // The text to put on the terminal's clipboard, once (null: none).
  takeClipboard(): string | null {
    const c = this.clip;
    this.clip = null;
    return c;
  }

  // The source an agent comes from (a live session counts before it has
  // a transcript).
  private owner(id: string): AgentSource | null {
    if (this.live && this.liveIds.has(id)) return this.live;
    return this.demoOn && this.demo?.chat(id) ? this.demo : null;
  }

  private logOf(id: string): readonly Bubble[] | null {
    return this.owner(id)?.chat?.(id) ?? null;
  }

  // Why the agent cannot be sent a message (null: it can).
  private reachOf(id: string): string | null {
    const src = this.owner(id);
    if (!src) return 'nothing read of it yet';
    return src.reach?.(id) ?? (src.send ? null : 'it takes no messages');
  }

  private drawEmptyHint(s: Screen, r: Rect, now: number): void {
    const p = this.theme.palette;
    const dots = '.'.repeat(1 + (Math.floor((now - this.start) / 400) % 3)).padEnd(3, ' ');
    const lines = [`waiting for Claude agents${dots}`, this.live ? 'start Claude Code anywhere, or press d for a demo crew' : 'press d to bring the demo crew back'];
    const w = Math.max(...lines.map((l) => [...l].length)) + 4;
    const x = r.x + Math.floor((r.w - w) / 2);
    const y = r.y + Math.floor(r.h / 3);
    lines.forEach((l, i) => {
      for (let k = 0; k < w; k++) s.put(x + k, y + i, ' ', undefined, p.panel);
      s.text(x + 2, y + i, l, i === 0 ? p.panelText : p.dim, p.panel);
    });
  }

  // Curtain sweep across the scene for a moment after switching presets.
  private drawWipe(s: Screen, r: Rect, now: number): void {
    drawWipe(s, r, (now - this.themeChangedAt) / WIPE_MS, this.theme.palette.accent, this.theme.palette.bg);
  }

  get view(): View {
    return this.shown;
  }

  // Shows `text` in the footer's ticker row until `until`.
  flash(text: string, until: number): void {
    this.tip = { text, until };
  }

  // The terminal's cell size in pixels: the scene's canvas is its cells at
  // this size.
  setCell(w: number, h: number): boolean {
    return this.stage.setCell(w, h);
  }

  // The scene as of the last draw, for the renderer to paint under the
  // cells (null in the dashboard, or with nothing to show).
  scene(): SceneFrame | null {
    return this.last;
  }

  get lights(): boolean {
    return this.stage.lit;
  }

  // Display preferences the user changed this session (with r / l), the
  // only ones worth saving: an automatic view stays automatic.
  prefs(): { view?: View; lights?: boolean } {
    const out: { view?: View; lights?: boolean } = {};
    if (this.touched.view) out.view = this.shown;
    if (this.touched.lights) out.lights = this.stage.lit;
    return out;
  }

  private themeIndex(): number {
    return Math.max(0, THEMES.findIndex((t) => t.id === this.theme.id));
  }

  setTheme(id: string): void {
    const th = THEMES.find((t) => t.id === id);
    if (!th || th === this.theme) return;
    this.theme = th;
    this.stage.setTheme(th);
    this.sceneKey = '';
    this.themeChangedAt = this.lastTick;
  }

  private shiftTheme(delta: number): 'theme' {
    const i = (this.themeIndex() + delta + THEMES.length) % THEMES.length;
    this.setTheme(THEMES[i].id);
    return 'theme';
  }

  // Walks the actors in the scene, the cards in the dashboard.
  private select(delta: number): void {
    const ids = this.shown === 'dashboard' ? this.dashboard.order() : this.stage.actors().map((a) => a.info.id);
    if (ids.length === 0) return;
    const i = this.selectedId ? ids.indexOf(this.selectedId) : -1;
    this.selectedId = ids[i < 0 ? (delta > 0 ? 0 : ids.length - 1) : (i + delta + ids.length) % ids.length];
  }

  // 'theme' and 'prefs' mean something worth saving to the config changed.
  handleKey(k: Key): 'quit' | 'theme' | 'prefs' | null {
    if (k.name === 'ctrl-c') return 'quit';
    if (k.name === 'paste-start' || k.name === 'paste-end') {
      this.pasting = k.name === 'paste-start';
      return null;
    }
    if (this.pasting) {
      const v = this.chatForKeys();
      // Only keys that type a character count: an escape in a paste (alt-b,
      // alt-backspace) must not move the cursor or delete a word.
      if (v?.focus === 'input') {
        if (k.name === 'enter' || k.name === 'tab') v.input.key({ ...k, name: 'space', ch: ' ' });
        else if (k.ch !== '') v.input.key(k);
      }
      return null;
    }
    // The chat window takes the keys it uses; while its input has focus,
    // every key (q types q).
    const chat = this.chatForKeys();
    if (chat) {
      const act = chatKey(chat, k);
      if (act === 'submit') this.submit(chat);
      else if (act === 'close') this.closeChat();
      if (act !== 'pass') return null;
    }
    if (k.name === 'q') return 'quit';
    if (/^[0-9]$/.test(k.name)) {
      const i = k.name === '0' ? 9 : Number(k.name) - 1;
      if (i >= THEMES.length) return null;
      this.setTheme(THEMES[i].id);
      return this.overlay === 'picker' ? null : 'theme';
    }
    if (this.overlay === 'picker') {
      // Moving previews; enter (or p) keeps the preview, esc restores.
      if (k.name === 'up' || k.name === 'left' || k.name === 'k') this.shiftTheme(-1);
      else if (k.name === 'down' || k.name === 'right' || k.name === 'j' || k.name === 'tab') this.shiftTheme(1);
      else if (k.name === 'escape') {
        this.setTheme(this.pickerOrigin);
        this.overlay = 'none';
      } else if (k.name === 'enter' || k.name === 'p') {
        this.overlay = 'none';
        return this.theme.id === this.pickerOrigin ? null : 'theme';
      }
      return null;
    }
    switch (k.name) {
      case 't':
        return this.shiftTheme(1);
      case 'T':
        return this.shiftTheme(-1);
      case 'p':
        this.overlay = 'picker';
        this.pickerOrigin = this.theme.id;
        return null;
      case '?':
        this.overlay = this.overlay === 'help' ? 'none' : 'help';
        return null;
      case 'escape':
        if (this.overlay !== 'none') this.overlay = 'none';
        else {
          this.selectedId = null;
          this.stage.zoomAuto();
        }
        return null;
      case 'tab':
      case 'right':
        this.select(1);
        return null;
      case 'shift-tab':
      case 'left':
        this.select(-1);
        return null;
      case 'd':
        this.demoOn = !this.demoOn;
        if (this.demoOn && !this.demo) {
          this.demo = new DemoSource(7, this.lastTick);
          this.demoCrew = demoCrews();
        }
        return null;
      case 'r':
        // The scene needs images; without, say where it is.
        if (!this.images) {
          this.flash('the scene needs kitty, Ghostty or WezTerm', this.lastTick + TIP_MS);
          return null;
        }
        this.shown = this.shown === 'scene' ? 'dashboard' : 'scene';
        this.touched.view = true;
        return 'prefs';
      case 'l':
        this.stage.lit = !this.stage.lit;
        this.touched.lights = true;
        return 'prefs';
      case 'space':
        this.paused = !this.paused;
        return null;
      case '+':
      case '=':
        this.stage.zoomBy(1);
        return null;
      case '-':
      case '_':
        this.stage.zoomBy(-1);
        return null;
      case 'z':
        this.stage.zoomAuto();
        return null;
      case 'i':
        this.card = !this.card;
        return null;
      case 'c':
        if (this.selectedId) this.stage.cheer(this.selectedId);
        return null;
      case 'f':
        this.full = !this.full;
        return null;
      case 'enter':
        if (this.selectedId) this.openChat(this.selectedId);
        return null;
    }
    return null;
  }
}
