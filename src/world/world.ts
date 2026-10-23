import type { AgentEvent, AgentInfo, AgentSource } from '../agents.ts';
import type { Account } from '../claude/account.ts';
import { DemoSource } from '../demo/source.ts';
import type { Rect, Screen } from '../term/screen.ts';
import type { Key } from '../term/terminal.ts';
import { THEMES } from '../themes/index.ts';
import type { Theme } from '../themes/types.ts';
import { drawFooter, drawHeader, drawRoster } from '../ui/chrome.ts';
import type { ChromeCtx } from '../ui/chrome.ts';
import { computeLayout } from '../ui/layout.ts';
import { drawHelp, drawPicker, drawTooSmall, drawWipe } from '../ui/overlays.ts';
import { Stage } from './stage.ts';
import type { PixelMode } from './stage.ts';

export type WorldOpts = {
  theme: Theme;
  live: AgentSource | null;
  demo: boolean;
  account: Account | null;
  rootLabel: string;
  start: number;
  pixels?: PixelMode;
  // The terminal can show images, so r may cycle into HD.
  images?: boolean;
  lights?: boolean;
};

const MAX_EVENTS = 60;
const WIPE_MS = 700;

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
  private account: Account | null;
  private rootLabel: string;
  private events: AgentEvent[] = [];
  private lastTick: number;
  private simT = 0;
  private liveCount = 0;
  private lastLive: AgentInfo[] = [];
  private sceneKey = '';
  private start: number;
  private themeChangedAt = -Infinity;
  private pickerOrigin = '';
  // The scene fills the whole terminal (f): no header, roster or footer.
  full = false;
  private touched = { pixels: false, lights: false };
  private images: boolean;
  // A passing tip at the start of the ticker row (see flash).
  private tip = { text: '', until: -Infinity };

  constructor(o: WorldOpts) {
    this.theme = o.theme;
    this.stage = new Stage(o.theme, o.pixels ?? 'half');
    this.images = o.images ?? false;
    this.stage.lit = o.lights ?? true;
    this.live = o.live;
    this.demoOn = o.demo;
    this.account = o.account;
    this.rootLabel = o.rootLabel;
    this.lastTick = o.start;
    this.start = o.start;
    if (o.demo) this.demo = new DemoSource(7, o.start);
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
    const demo = this.demoOn && this.demo ? this.demo.poll(now) : [];
    for (const src of [this.live, this.demoOn ? this.demo : null]) {
      try {
        if (src) this.events.push(...src.drainEvents());
      } catch {
        // Events are cosmetic; drop them on failure.
      }
    }
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    return [...live, ...demo];
  }

  tick(now: number): void {
    const dt = Math.max(0, Math.min(0.25, (now - this.lastTick) / 1000));
    this.lastTick = now;
    const agents = this.agents(now);
    if (this.paused || this.sceneKey === '') return;
    this.stage.sync(agents, now);
    this.stage.update(dt, now);
    this.simT += dt;
    if (this.selectedId && !this.stage.actors().some((a) => a.info.id === this.selectedId)) this.selectedId = null;
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
      drawTooSmall(s, this.theme, (now - this.start) / 1000);
      return;
    }
    s.clear(this.theme.palette.bg, this.theme.palette.text);
    this.ensureLayout(L.scene);
    this.stage.draw(s, this.simT, now, this.selectedId);
    if (this.stage.actors().length === 0) this.drawEmptyHint(s, L.scene, now);
    this.drawWipe(s, L.scene, now);
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
    };
    if (L.header.h) drawHeader(s, L.header, ctx);
    if (L.roster) drawRoster(s, L.roster, ctx);
    if (L.footer.h) drawFooter(s, L.footer, ctx);
    if (this.overlay === 'help') drawHelp(s, L.scene, this.theme, this.images);
    else if (this.overlay === 'picker') drawPicker(s, L.scene, THEMES, this.themeIndex(), ctx.t);
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

  get pixels(): PixelMode {
    return this.stage.pixels;
  }

  // Shows `text` in the footer's ticker row until `until`.
  flash(text: string, until: number): void {
    this.tip = { text, until };
  }

  // HD mode: the terminal's cell size, and the image to show this frame.
  setCell(w: number, h: number): void {
    this.stage.setCell(w, h);
  }

  hdImage(): ReturnType<Stage['hdImage']> {
    return this.stage.hdImage();
  }

  get lights(): boolean {
    return this.stage.lit;
  }

  // Display preferences the user changed this session (with r / l), the
  // only ones worth saving: an auto-detected pixel mode stays automatic.
  prefs(): { pixels?: PixelMode; lights?: boolean } {
    const out: { pixels?: PixelMode; lights?: boolean } = {};
    if (this.touched.pixels) out.pixels = this.stage.pixels;
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

  private select(delta: number): void {
    const ids = this.stage.actors().map((a) => a.info.id);
    if (ids.length === 0) return;
    const i = this.selectedId ? ids.indexOf(this.selectedId) : -1;
    this.selectedId = ids[i < 0 ? (delta > 0 ? 0 : ids.length - 1) : (i + delta + ids.length) % ids.length];
  }

  // 'theme' and 'prefs' mean something worth saving to the config changed.
  handleKey(k: Key): 'quit' | 'theme' | 'prefs' | null {
    if (k.name === 'ctrl-c' || k.name === 'q') return 'quit';
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
        if (this.demoOn && !this.demo) this.demo = new DemoSource(7, this.lastTick);
        return null;
      case 'r':
        {
          const cycle: PixelMode[] = this.images ? ['half', 'sextant', 'hd'] : ['half', 'sextant'];
          this.stage.setMode(cycle[(cycle.indexOf(this.stage.pixels) + 1) % cycle.length]);
        }
        this.touched.pixels = true;
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
      case 'f':
        this.full = !this.full;
        return null;
    }
    return null;
  }
}
