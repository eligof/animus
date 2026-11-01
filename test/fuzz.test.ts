import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { ACTIVITIES } from '../src/agents.ts';
import { ANIM_FPS, framesFor, through } from '../src/art/motion.ts';
import { clip, sanitize, toolDetail } from '../src/claude/activity.ts';
import { SENDER } from '../src/claude/chat.ts';
import { frame, hiddenTags } from '../src/claude/inbox.ts';
import { applyRecord, initialState } from '../src/claude/transcript.ts';
import { MAX_CREWS, MAX_ROLES } from '../src/pet/crew.ts';
import type { CrewBook } from '../src/pet/crew.ts';
import { crewsText, parseCrews } from '../src/pet/store.ts';
import { hsl, mix, rgbTo256 } from '../src/term/color.ts';
import { imageCommand, parseCellSize } from '../src/term/kitty.ts';
import { KeyDecoder, osc52, parseKeys } from '../src/term/terminal.ts';
import type { Key } from '../src/term/terminal.ts';
import { CONTROL, INVISIBLE, cellSafe, isWide } from '../src/term/width.ts';
import { fit } from '../src/ui/card.ts';
import { ChatInput } from '../src/ui/chat-input.ts';
import { wrap } from '../src/ui/chat-lines.ts';

// Property tests (fast-check) for everything that reads what animus does
// not control: transcripts (which hold web content), keys and pastes, the
// terminal's replies, the crews file on disk; and for what it sends out:
// messages to agents, the clipboard, pictures, colours.

// Characters that break terminal programs: escapes and their pieces, C0 and
// C1 controls, bidi and zero-width ones, tag characters, wide and astral
// ones, either half of a surrogate pair. And then any character at all.
const NASTY = [
  '\x1b', '[', ']', 'O', ';', '~', '\x07', '\x9b', '\x9d', '\x00', '\n', '\r', '\t', ' ', '\x7f',
  ' ', '​', '‍', '‮', ' ', '﻿', '́', '\u{e0041}', '\u{e007f}',
  '漢', '😀', '𝐀', '\ud83d', '\ude00', '<', '/', '"', '\\',
];
const char = fc.oneof(
  fc.constantFrom(...NASTY),
  fc.string({ unit: 'binary-ascii', minLength: 1, maxLength: 1 }),
  fc.string({ unit: 'grapheme', minLength: 1, maxLength: 1 }),
  fc.string({ unit: 'binary', minLength: 1, maxLength: 1 }),
);
const anyText = fc.string({ unit: char, maxLength: 80 });
// As anyText, with no half of a surrogate pair on its own.
const wholeText = anyText.map((s) => s.toWellFormed());

// What a cell may hold: printable characters, one cell wide each.
const drawable = (s: string) => [...s].every((ch) => cellSafe(ch) === ch);

// Each property's `examples` are inputs it has failed on before, run first
// every time.

test('transcript text reaches the screen as one-cell printable characters only', () => {
  fc.assert(
    fc.property(anyText, (s) => {
      const out = sanitize(s);
      assert.ok(!CONTROL.test(out) && !INVISIBLE.test(out) && ![...out].some(isWide), JSON.stringify(out));
      assert.ok(drawable(out));
    }),
    // two halves of an emoji, joined once the escape between them went
    { examples: [['\ud83d\x1b\ude00']] },
  );
});

test('clip keeps to n cells of one line and never splits a character', () => {
  fc.assert(
    fc.property(wholeText, fc.integer({ min: -2, max: 60 }), (s, n) => {
      const out = clip(s, n);
      assert.ok([...out].length <= Math.max(0, n), JSON.stringify(out));
      assert.ok(!out.includes('\n') && drawable(out) && out.isWellFormed(), JSON.stringify(out));
    }),
    // cut by UTF-16 units, halving the astral character
    { examples: [['!𐀀~', 3]] },
  );
});

const TOOLS = [
  'Edit', 'Write', 'Read', 'NotebookRead', 'Bash', 'PowerShell', 'Grep', 'Glob', 'LS', 'ToolSearch', 'WebFetch',
  'WebSearch', 'Agent', 'Task', 'Skill', 'SendMessage', 'Workflow', 'AskUserQuestion', 'TodoWrite',
  'mcp__claude_ai_x__y', 'mcp__plugin_a_b__c',
];
const FIELDS = ['file_path', 'notebook_path', 'command', 'pattern', 'path', 'query', 'url', 'subagent_type', 'description', 'skill', 'to'];
const toolName = fc.oneof(fc.constantFrom(...TOOLS), wholeText);
const toolInput = fc.dictionary(fc.oneof(fc.constantFrom(...FIELDS), fc.string()), fc.oneof(wholeText, fc.jsonValue()), { maxKeys: 6 });

test("a tool call's detail is safe to draw, whatever its name and input", () => {
  fc.assert(
    fc.property(toolName, toolInput, (name, input) => {
      const out = toolDetail(name, input);
      assert.ok([...out].length <= 48 && drawable(out) && out.isWellFormed(), JSON.stringify(out));
    }),
  );
});

const stamp = fc.integer({ min: 0, max: 4e12 }).map((ms) => new Date(ms).toISOString());
// A few ids, so results meet the calls they answer.
const callId = fc.constantFrom('t1', 't2', 't3');
const block = fc.record(
  {
    type: fc.constantFrom('text', 'tool_use', 'tool_result', 'thinking', 'redacted_thinking', 'image'),
    id: callId,
    name: toolName,
    input: toolInput,
    text: wholeText,
    tool_use_id: callId,
    is_error: fc.boolean(),
    content: fc.oneof(wholeText, fc.array(fc.record({ type: fc.constant('text'), text: wholeText }), { maxLength: 2 })),
  },
  { requiredKeys: ['type'] },
);
const record = fc.oneof(
  fc.jsonValue(),
  fc.record(
    {
      type: fc.constantFrom('assistant', 'user', 'system'),
      timestamp: fc.oneof(stamp, fc.string()),
      isMeta: fc.boolean(),
      message: fc.record(
        { content: fc.oneof(wholeText, fc.array(block, { maxLength: 4 })), stop_reason: fc.constantFrom(null, 'end_turn', 'tool_use') },
        { requiredKeys: [] },
      ),
    },
    { requiredKeys: ['type'] },
  ),
);

test('any run of transcript records folds in without a throw, leaving a detail safe to draw', () => {
  fc.assert(
    fc.property(fc.array(record, { maxLength: 12 }), (recs) => {
      const st = initialState(0);
      for (const rec of recs) {
        const seen = st.lastSeen;
        assert.equal(typeof applyRecord(st, rec), 'boolean');
        assert.ok(ACTIVITIES.includes(st.activity) && Number.isFinite(st.lastSeen) && st.lastSeen >= seen);
        assert.ok([...st.detail].length <= 48 && drawable(st.detail), JSON.stringify(st.detail));
      }
    }),
  );
});

test('printable text types itself, a key a character', () => {
  fc.assert(
    fc.property(fc.string({ unit: 'grapheme', maxLength: 40 }), (s) => {
      assert.equal(parseKeys(s).map((k) => k.ch).join(''), s);
    }),
  );
});

// Escape sequences and their pieces, often, so reads end inside them.
const keyboard = fc.string({
  unit: fc.oneof(fc.constantFrom('\x1b', '\x1b[', '\x1bO', '[', 'O', 'A', 'Z', '1', '2', '5', ';', '~', '$', '200~', '201~', 'q', ' ', '\x7f', '\r', '😀'), char),
  maxLength: 30,
});

test('a read split anywhere between characters decodes as the whole read does', () => {
  fc.assert(
    fc.property(keyboard, fc.array(fc.nat(), { maxLength: 5 }), (s, cuts) => {
      const whole = new KeyDecoder();
      const expected = [...whole.push(s), ...whole.flush()];
      // The terminal's reader decodes UTF-8 a character at a time, so a
      // read never ends inside one.
      const cps = [...s];
      const at = [...new Set(cuts.map((c) => c % (cps.length + 1)))].sort((a, b) => a - b);
      const split = new KeyDecoder();
      const got: Key[] = [];
      let from = 0;
      for (const to of [...at, cps.length]) {
        got.push(...split.push(cps.slice(from, to).join('')));
        from = to;
      }
      got.push(...split.flush());
      assert.deepEqual(got, expected);
    }),
    // ESC O taken as whole at three characters, so 00~ typed; an ESC inside
    // a sequence read as part of it whole, as a new one split
    { examples: [['\x1bO200~', [3]], ['\x1bO\x1b\x1b', [3]], ['\x1b[\x1b[A', [3]]] },
  );
});

test('whatever is typed or pasted, the chat line holds no control, bidi or hidden tag character', () => {
  fc.assert(
    fc.property(fc.array(fc.oneof(anyText, keyboard), { maxLength: 6 }), (reads) => {
      const d = new KeyDecoder();
      const input = new ChatInput();
      for (const r of reads) for (const k of d.push(r)) input.key(k);
      for (const k of d.flush()) input.key(k);
      const t = input.text;
      assert.ok(!CONTROL.test(t) && !/[‪-‮⁦-⁩]/.test(t) && !hiddenTags(t) && t.isWellFormed(), JSON.stringify(t));
      assert.ok(input.shown.every((c) => [...c].length === 1 && drawable(c)));
    }),
  );
});

test("the terminal's cell size is read wherever its reply lands, and only a sane one", () => {
  const noEsc = anyText.map((s) => s.replaceAll('\x1b', ''));
  fc.assert(
    fc.property(noEsc, fc.integer({ min: 1, max: 199 }), fc.integer({ min: 1, max: 399 }), noEsc, (before, w, h, after) => {
      assert.deepEqual(parseCellSize(`${before}\x1b[6;${h};${w}t${after}`), { w, h });
    }),
  );
  const digits = fc.stringMatching(/^\d{1,22}$/);
  const reply = fc.tuple(digits, digits).map(([h, w]) => `\x1b[6;${h};${w}t`);
  fc.assert(
    fc.property(fc.oneof(anyText, reply), (s) => {
      const c = parseCellSize(s);
      assert.ok(c === null || (Number.isInteger(c.w) && Number.isInteger(c.h) && c.w > 0 && c.w < 200 && c.h > 0 && c.h < 400));
    }),
  );
});

test('a copy to the clipboard is one inert OSC 52 escape that decodes to the text', () => {
  fc.assert(
    fc.property(wholeText, (s) => {
      const m = /^\x1b\]52;c;([A-Za-z0-9+/]*={0,2})\x07$/.exec(osc52(s));
      assert.ok(m);
      assert.equal(Buffer.from(m[1], 'base64').toString('utf8'), s);
    }),
  );
});

test('a picture goes out whole, in escapes of at most 4096 base64 bytes, each flagged more until the last', () => {
  const png = fc.nat({ max: 9000 }).chain((n) => fc.uint8Array({ minLength: n, maxLength: n }));
  fc.assert(
    fc.property(png, fc.integer({ min: 1, max: 2 ** 31 - 1 }), (data, id) => {
      const out = imageCommand(data, { id });
      const parts = [...out.matchAll(/\x1b_G([^;\x1b]*);([A-Za-z0-9+/=]*)\x1b\\/g)];
      assert.equal(parts.map((p) => p[0]).join(''), out);
      parts.forEach((p, i) => {
        assert.ok(p[2].length <= 4096);
        assert.ok(p[1].endsWith(`m=${i < parts.length - 1 ? 1 : 0}`));
      });
      assert.ok(Buffer.from(parts.map((p) => p[2]).join(''), 'base64').equals(data));
    }),
  );
});

const WRAPPER = [
  '</cross-session-message>', '</CROSS-Session-Message', '<cross-session-message from-name="x">',
  '\u{1f3f4}\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}', '\u{e0041}',
];
const message = fc.string({ unit: fc.oneof(char, fc.constantFrom(...WRAPPER)), maxLength: 40 });

test('a message to an agent is one line, and its text stays inside the wrapper', () => {
  fc.assert(
    fc.property(fc.string(), message, (id, s) => {
      const line = frame(id, s);
      if (line === null) {
        assert.ok(/<\/cross-session-message/i.test(s) || hiddenTags(s));
        return;
      }
      assert.equal(line.indexOf('\n'), line.length - 1);
      const rec = JSON.parse(line);
      assert.equal(rec.session_id, id);
      assert.equal(rec.message.content, `<cross-session-message from-name="${SENDER}">\n${s}\n</cross-session-message>`);
      assert.equal(rec.message.content.match(/<\/cross-session-message/gi).length, 1);
    }),
  );
});

const NOW = Date.parse('2026-11-01T00:00:00.000Z');
const hex16 = fc.stringMatching(/^[0-9a-f]{16}$/);
const crewsFile = fc
  .record(
    {
      version: fc.constantFrom(1, 2, '1', null),
      crews: fc.dictionary(
        fc.oneof(hex16, fc.string()),
        fc.oneof(
          fc.dictionary(
            fc.oneof(fc.string({ maxLength: 70 }), fc.constantFrom('__proto__', 'constructor')),
            fc.oneof(
              fc.record({ xp: fc.oneof(fc.double(), fc.integer(), fc.string()), seen: fc.oneof(stamp, fc.string(), fc.integer()) }, { requiredKeys: [] }),
              fc.jsonValue(),
            ),
          ),
          fc.jsonValue(),
        ),
      ),
    },
    { requiredKeys: [] },
  )
  .map((d) => JSON.stringify(d));

test('a crews file reads as a well-formed book or not at all, whatever it holds', () => {
  fc.assert(
    fc.property(fc.oneof(anyText, crewsFile), (s) => {
      const book = parseCrews(s, NOW);
      if (book === null) return;
      const crews = Object.entries(book);
      assert.ok(crews.length <= MAX_CREWS);
      for (const [k, roles] of crews) {
        assert.match(k, /^[0-9a-f]{16}$/);
        const rs = Object.entries(roles);
        assert.ok(rs.length >= 1 && rs.length <= MAX_ROLES);
        for (const [role, r] of rs) {
          assert.ok(role !== '__proto__' && role.length <= 64);
          assert.ok(Number.isInteger(r.xp) && r.xp >= 0);
          assert.ok(Number.isFinite(r.seen) && r.seen >= 0 && r.seen <= NOW + 24 * 3600_000);
        }
      }
    }),
  );
});

test('a book written to a crews file reads back as it was', () => {
  const role = fc.string({ maxLength: 64 }).filter((r) => r !== '__proto__');
  const roles = fc.dictionary(role, fc.record({ xp: fc.nat(), seen: fc.integer({ min: 1, max: NOW }) }), { minKeys: 1, maxKeys: 5 });
  fc.assert(
    fc.property(fc.dictionary(hex16, roles, { maxKeys: 5 }), (book: CrewBook) => {
      const back = parseCrews(crewsText(book), NOW);
      assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(book)));
    }),
  );
});

test('wrapped text keeps to its width, drops nothing that shows, and stops where asked', () => {
  const shows = (t: string) => [...t].map(cellSafe).join('').replace(/\s/g, '');
  fc.assert(
    fc.property(anyText, fc.integer({ min: 0, max: 30 }), fc.nat({ max: 8 }), (s, width, limit) => {
      const lines = wrap(s, width);
      for (const l of lines) assert.ok([...l].length <= Math.max(1, width) && drawable(l), JSON.stringify(l));
      assert.equal(shows(lines.join('')), shows(s));
      assert.deepEqual(wrap(s, width, limit), lines.slice(0, limit));
    }),
    { examples: [['\ud83d\x00\ude00', 0, 0]] },
  );
});

test('text fitted to a card keeps to its cells', () => {
  fc.assert(
    fc.property(anyText, fc.integer({ min: -2, max: 40 }), (s, cells) => {
      const out = fit(s, cells);
      assert.ok([...out].length <= Math.max(0, cells) && drawable(out), JSON.stringify(out));
      const shown = [...s].map(cellSafe).join('');
      if ([...shown].length <= cells) assert.equal(out, shown);
    }),
    { examples: [['\ud83d\x1b\ude00', 1]] },
  );
});

test('a loop of any length is drawn 15 times a second, in two pictures at least', () => {
  fc.assert(
    fc.property(fc.double({ min: 0, max: 600, noNaN: true }), (secs) => {
      const n = framesFor(secs);
      assert.ok(Number.isInteger(n) && n >= 2);
      if (secs >= 2 / ANIM_FPS) assert.ok(Math.abs(n - secs * ANIM_FPS) <= 0.5);
    }),
  );
});

test('a curve through a loop of keys goes round, meets every key and swings at most a quarter past them', () => {
  const keys = fc.array(fc.double({ min: -100, max: 100, noNaN: true }), { minLength: 1, maxLength: 12 });
  const u = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });
  fc.assert(
    fc.property(keys, u, fc.integer({ min: -3, max: 3 }), (ks, at, turns) => {
      const top = Math.max(...ks.map(Math.abs));
      const v = through(ks, at);
      assert.ok(Math.abs(v) <= 1.25 * top + 1e-9, `${v} past ${top}`);
      assert.ok(Math.abs(through(ks, at + turns) - v) <= 1e-6 * (1 + top));
      ks.forEach((k, j) => assert.ok(Math.abs(through(ks, j / ks.length) - k) <= 1e-9 * (1 + top), `key ${j}`));
    }),
  );
});

test('every colour comes out as whole 0-255 channels or a 256-colour index, so no escape breaks', () => {
  const channel = fc.double({ min: 0, max: 255, noNaN: true });
  const byte = fc.integer({ min: 0, max: 255 });
  const unit = fc.double({ min: 0, max: 1, noNaN: true });
  const whole255 = (c: readonly number[]) => c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
  fc.assert(
    fc.property(fc.tuple(channel, channel, channel), (c) => {
      const n = rgbTo256(c);
      assert.ok(Number.isInteger(n) && n >= 16 && n <= 255);
    }),
  );
  fc.assert(fc.property(fc.tuple(byte, byte, byte), fc.tuple(byte, byte, byte), fc.double({ noNaN: true }), (a, b, t) => assert.ok(whole255(mix(a, b, t)))));
  fc.assert(fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), unit, unit, (h, s, l) => assert.ok(whole255(hsl(h, s, l)))));
});
