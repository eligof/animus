import type { Gain } from '../agents.ts';
import { COMMAND, INTERRUPTED, SYSTEM, resultText } from './transcript.ts';

// What in a transcript earns XP (see pet/crew.ts), read as the source reads
// the records:
//   turn      a lead's turn finished: its final reply stopped with
//             end_turn. Counted once per prompt: a reply in several records,
//             or a stop hook sending it on, is one turn.
//   check     a build or test command that passed: a Bash (or PowerShell)
//             call, not run in the background, whose command is one (see
//             checkRun) and whose result is not an error and shows no
//             failure (see FAILED); where the line hides the check's exit
//             status, its output must show it passed (see PASSED). A
//             failure costs nothing.
// (A finished subagent is the source's to tell: see source.ts.) Each gain
// keeps the record's time and a key from the transcript (the message or
// tool call id), so reading the same records again gives the same gains.

export type Found = Pick<Gain, 'at' | 'key' | 'kind'>;

// Tool calls whose result is awaited, at most (the oldest dropped).
const MAX_CALLS = 200;
// Gains held until taken, at most.
const MAX_FOUND = 500;

// What a build or test that passed never prints: a failure summary, an
// assertion, a crash. A script may swallow its runner's exit code (jest
// || true), not these.
const FAILED: readonly RegExp[] = [
  /ℹ fail [1-9]/, // node --test
  /^✖ failing tests:/m, // node --test
  /# fail [1-9]/, // TAP
  /^Tests:.*\b[1-9]\d* failed/m, // jest
  /^[ \t]*FAIL\b/m, // jest, vitest, go test
  /\b[1-9]\d* (?:failed|failing)\b/, // vitest, pytest, mocha
  /\bERR_ASSERTION\b|AssertionError/, // node:assert, chai
  /test result: FAILED/, // cargo test
  /^error(?:\[E\d+\])?:/m, // cargo, rustc
  /error TS\d+/, // tsc
  /\b[1-9]\d* errors? (?:in|found)\b/i, // tsc, mypy, pytest
  /= [1-9]\d* errors?\b/, // pytest
  /\.go:\d+:\d+: /, // go build, go vet
  /npm ERR!|^npm error /m, // npm
  /make: \*\*\*/, // make
  /FAILED \(/, // unittest, pytest
  /^Traceback \(most recent/m, // python
  /\bBUILD FAIL(?:ED|URE)\b/, // gradle, maven
  /command not found/, // a runner not installed
];

// What a build or test that passed prints at its end. Where the line hides
// the check's exit status (`npm test | tail`, `|| true`, `; echo done`: see
// checkRun), its output must show one of these: no output, or a tail of a
// failure's stack frames, proves nothing.
const PASSED: readonly RegExp[] = [
  /^ℹ fail 0$/m, // node --test
  /^# fail 0$/m, // TAP
  /^(?!.*\b[1-9]\d* (?:failed|errors?)\b).*\b[1-9]\d* passed\b/m, // jest, vitest, pytest, cargo, deno
  /\b[1-9]\d* passing\b/, // mocha
  /test result: ok\./, // cargo test
  /^ok\s+\S+\s+(?:\(cached\)|\d)/m, // go test
  /^OK(?: \(.*\))?$/m, // unittest
  /^Found 0 errors\b/m, // tsc --watch
  /^Success: no issues found/m, // mypy
  /\bBUILD SUCCESS(?:FUL)?\b/, // maven, gradle
  /^\s*Finished\b.* target\(s\) in /m, // cargo build
];

// ── build and test commands ─────────────────────────────────────────────

// A shell line as it runs, what is not run left out: quoted strings (one
// that is a plain word is kept, unquoted: npm run "test:unit"), comments,
// and heredoc bodies. What a shell is given to run is kept, though: the
// string after its -c, read as a subshell's commands (bash -c "npm test"
// as bash -c ( npm test )), and the body of a heredoc it reads (bash
// <<'EOF', or cat <<'EOF' | bash), without the line that ends it.
function commands(line: string, depth = 0): string {
  let out = '';
  // Where in `out` the part being read starts: past the last separator.
  let start = 0;
  // The heredocs opened on this line: their end words, whether a shell
  // reads their bodies, and where in `out` they were opened.
  let docs: Array<{ end: string; shell: boolean; at: number }> = [];
  // The end words of the heredocs a shell reads, their bodies read on as
  // commands: each one's end line is left out.
  const ends: string[] = [];
  let i = 0;
  const pastEnd = () => {
    for (let k = i; ends.length; k = i) {
      while (line[k] === '\t') k++;
      const e = ends[0];
      if (!line.startsWith(e, k) || (k + e.length < line.length && line[k + e.length] !== '\n')) return;
      i = k + e.length + 1;
      ends.shift();
    }
  };
  while (i < line.length) {
    const c = line[i];
    if (c === '\\') {
      // An escaped character is no separator; an escaped line break joins the lines.
      const next = line[i + 1] ?? '';
      out += next === '\n' ? ' ' : /\w/.test(next) ? next : '_';
      i += 2;
    } else if (c === "'" || c === '"' || (c === '$' && line[i + 1] === "'")) {
      // '…' as it is; "…" and $'…' with backslash escapes.
      const ansi = c === '$';
      const q = ansi ? "'" : c;
      let j = ansi ? i + 2 : i + 1;
      let s = '';
      while (j < line.length && line[j] !== q) {
        if (line[j] === '\\' && (ansi || q === '"')) j++;
        s += line[j++] ?? '';
      }
      if (depth < 3 && out.length - start <= 200 && SHELL_C.test(out.slice(start))) {
        out += ` ( ${commands(s, depth + 1)} ) `;
        start = out.length;
      } else out += /^[\w./:@%+=,*-]*$/.test(s) ? s : '_';
      i = j + 1;
    } else if (c === '#' && /^$|[\s;&|(]$/.test(out.slice(-1))) {
      while (i < line.length && line[i] !== '\n') i++;
    } else if (line.startsWith('<<<', i)) {
      out += '<<<';
      i += 3;
    } else if (line.startsWith('<<', i)) {
      const m = /^<<-?[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([A-Za-z_]\w*))/.exec(line.slice(i, i + 200));
      if (!m) {
        out += '<<';
        i += 2;
        continue;
      }
      // A shell and its options are a short part.
      docs.push({ end: m[1] ?? m[2] ?? m[3], shell: out.length - start <= 200 && SHELL.test(out.slice(start)), at: out.length });
      i += m[0].length;
    } else if (c === '\n' && docs.length) {
      out += c;
      start = out.length;
      i++;
      // Fed on to a shell (cat <<'EOF' | bash), they are its commands.
      const [, pipe, next = ''] = out.slice(docs[0].at).split(SEPARATOR, 3);
      const piped = (pipe === '|' || pipe === '|&') && next.length <= 200 && SHELL.test(next);
      // Their bodies follow, in order, each up to a line of its end word;
      // from the first a shell reads, they are read on.
      let k = 0;
      for (; k < docs.length && !docs[k].shell && !piped; k++) {
        while (i < line.length) {
          let j = line.indexOf('\n', i);
          if (j < 0) j = line.length;
          const end = line.slice(i, j).replace(/^\t+/, '') === docs[k].end;
          i = j + 1;
          if (end) break;
        }
      }
      for (; k < docs.length; k++) ends.push(docs[k].end);
      docs = [];
      pastEnd();
    } else {
      out += c;
      if (c === ';' || c === '&' || c === '|' || c === '\n' || c === '(') start = out.length;
      i++;
      if (c === '\n') pastEnd();
    }
  }
  return out;
}

// A shell that reads its commands from a heredoc: bash -s <<EOF.
const SHELL = /^\s*(?:sudo\s+)?(?:\S*\/)?(?:ba|z|da|k)?sh(?:\s+-\S*)*\s*$/;
// A shell given its commands as a string, up to the string: bash -lc,
// bash -euo pipefail -c.
const SHELL_C = /(?:^|\s)(?:\S*\/)?(?:ba|z|da|k)?sh(?:\s+[-+]\w*o\s+\w+|\s+-\w+)*\s+-\w*c\w*\s*$/;

// The parts of a shell line: split at &&, ||, ;, |, |&, line breaks and a
// lone & (a redirection's, as in 2>&1 or &>, is not one), each with the
// separator after it.
const SEPARATOR = /(&&|\|\||\|&|[;|\n]|(?<![<>&])&(?![&>]))/;

// A part's words, without its subshell's parentheses or its redirections
// (2>&1, > out.log).
function words(part: string): string[] {
  const out: string[] = [];
  let a = 0;
  let b = part.length;
  while (a < b && (part[a] === '(' || /\s/.test(part[a]))) a++;
  while (b > a && (part[b - 1] === ')' || /\s/.test(part[b - 1]))) b--;
  const ws = part.slice(a, b).split(/\s+/);
  for (let i = 0; i < ws.length; i++) {
    const m = /^(?:\d*|&)(?:>>?|<)(.*)$/.exec(ws[i]);
    if (!m) {
      if (ws[i]) out.push(ws[i]);
    } else if (!m[1]) i++; // the operator alone: its target is the next word
  }
  return out;
}

// Past the options from a[i] on (and a +toolchain); those in `valued`
// take the next word as their value.
function options(a: readonly string[], i: number, valued: readonly string[] = []): number {
  while (i < a.length && /^[-+]/.test(a[i])) i += valued.includes(a[i]) ? 2 : 1;
  return i;
}

// What runs before the command itself, by its first word or two, with its
// options that take a value: VAR=value, sudo, time, nice, env, timeout
// (and its duration), nohup, xvfb-run, and runners.
const PREFIXES = new Map<string, readonly string[]>([
  ['sudo', ['-u', '-g', '-h', '-p', '-C', '-D', '-U']],
  ['time', []],
  ['nice', ['-n']],
  ['env', ['-u', '-C', '-S']],
  ['command', []],
  ['exec', ['-a']],
  ['timeout', ['-s', '-k', '--signal', '--kill-after']],
  ['nohup', []],
  ['xvfb-run', ['-n', '-s', '-e', '-f', '-w', '-p', '--server-num', '--server-args', '--error-file', '--auth-file', '--wait', '--xauth-protocol']],
  ['npx', ['-p', '--package']],
  ['bunx', ['-p', '--package']],
  ['uvx', ['--from', '--with', '--python', '-p']],
  ['npm exec', ['-p', '--package']],
  ['pnpm exec', []],
  ['pnpm dlx', []],
  ['yarn dlx', []],
  ['yarn exec', []],
  ['uv run', ['--with', '--python', '--directory', '--project']],
  ['poetry run', []],
  ['pipenv run', []],
  ['bundle exec', []],
]);

// A set of words, written as one string.
const set = (words: string) => new Set(words.split(' '));

// The shell's own words before a command: a condition's (if, while, `!`),
// whose failure is taken, and the rest (then, do, else, a group's {, the
// subshell a -c string is read as: see commands).
const CONDITIONS = set('if elif while until !');
const OPENERS = set('then else do { (');
// And after its last: a part of these runs nothing.
const CLOSERS = set('} fi done esac');

// The command a part runs, its prefixes stripped (and a shell running its
// -c string): its words from the program on, and whether it is a
// condition, its exit status not the line's.
function command(w: readonly string[]): { run: readonly string[]; cond: boolean } {
  let i = 0;
  let cond = false;
  while (i < w.length) {
    if (/^[A-Za-z_]\w*=/.test(w[i]) || OPENERS.has(w[i]) || CONDITIONS.has(w[i])) {
      cond ||= CONDITIONS.has(w[i]);
      i++;
      continue;
    }
    if (/^(?:ba|z|da|k)?sh$/.test(w[i].replace(/^.*\//, ''))) {
      // Past its options (-o and -euo take a name: pipefail); -c among them.
      let c = false;
      let j = i + 1;
      for (; j < w.length && /^[-+]/.test(w[j]); j += /^[-+]\w*o$/.test(w[j]) ? 2 : 1) c ||= /^-\w*c/.test(w[j]);
      if (!c) break;
      i = j;
      continue;
    }
    const two = `${w[i]} ${w[i + 1]}`;
    const p = PREFIXES.has(two) ? two : PREFIXES.has(w[i]) ? w[i] : '';
    if (!p) break;
    i = options(w, i + (p === two ? 2 : 1), PREFIXES.get(p));
    if (p === 'timeout' && /^\d/.test(w[i] ?? '')) i++;
  }
  return { run: w.slice(i), cond };
}

type Args = readonly string[];

// Any run of it builds or tests.
const always = () => true;
// Its first word after its options is one of `subs`: cargo +nightly test.
const first = (subs: string, valued: string[] = []) => {
  const s = set(subs);
  return (a: Args) => s.has(a[options(a, 0, valued)] ?? '');
};
// A make-like run: its first target one of `targets`, or none (the
// default); a dry run is none.
const MAKE_ARGS = ['-C', '-f', '-I', '-o', '-W', '--directory', '--file', '--makefile', '--include-dir'];
const DRY = set('-n --dry-run --just-print --recon');
const target = (targets: string) => {
  const s = set(targets);
  return (a: Args) => {
    const named: string[] = [];
    for (let i = 0; i < a.length; i++) {
      if (DRY.has(a[i])) return false;
      if (MAKE_ARGS.includes(a[i]) || (/^-[jl]$/.test(a[i]) && /^\d+$/.test(a[i + 1] ?? ''))) i++;
      else if (!/^-|=/.test(a[i])) named.push(a[i]);
    }
    return !named.length || s.has(named[0]);
  };
};
// A JVM build: any of its goals or tasks is one of `goals` (mvn clean
// install, ./gradlew :app:test).
const JVM_ARGS = ['-pl', '-P', '-f', '-s', '-T', '-rf', '-x', '-p', '-b', '--projects', '--file', '--settings', '--threads', '--exclude-task', '--project-dir'];
const goal = (goals: string) => {
  const s = set(goals);
  return (a: Args) => {
    for (let i = options(a, 0, JVM_ARGS); i < a.length; i = options(a, i + 1, JVM_ARGS)) if (s.has(a[i].split(':').pop()!)) return true;
    return false;
  };
};
// A package manager's script (test:unit too), past its workspace or
// directory: pnpm --filter web test, yarn workspace web run build, npm t.
const PM_ARGS = ['--filter', '-F', '--prefix', '-C', '--dir', '-w', '--workspace', '--cwd'];
const SCRIPTS = set('test t build typecheck tsc check');
const script = (a: Args) => {
  let i = options(a, 0, PM_ARGS);
  if (a[i] === 'workspace') i = options(a, i + 2, PM_ARGS);
  if (a[i] === 'run' || a[i] === 'run-script') i = options(a, i + 1, PM_ARGS);
  return SCRIPTS.has((a[i] ?? '').split(':')[0]);
};
// Or a test runner it runs: pnpm vitest run, yarn jest.
const RUNNERS = set('vitest jest mocha');
const runner = (a: Args) => script(a) || RUNNERS.has(a[options(a, 0, PM_ARGS)] ?? '');
// deno test, deno task build.
const deno = (a: Args) => (a[0] === 'task' ? script(a.slice(1)) : first('test check compile')(a));
// node --test, past its options (node --import tsx --test), or a runner by
// its path (node node_modules/typescript/bin/tsc).
const NODE_ARGS = ['--import', '--require', '-r', '--loader', '--experimental-loader', '-C', '--conditions', '--env-file', '--test-reporter', '--test-reporter-destination', '--test-name-pattern'];
const node = (a: Args) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--test') return true;
    if (!a[i].startsWith('-')) return /^(?:tsc|jest|vitest|mocha)(?:\.[cm]?js)?$/.test(a[i].replace(/^.*\//, ''));
    if (NODE_ARGS.includes(a[i])) i++;
  }
  return false;
};
// python -m with a test or type-check module, or Django's tests.
const MODULES = set('pytest unittest tox mypy compileall');
const python = (a: Args) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '-m') return MODULES.has(a[i + 1] ?? '');
    if (!a[i].startsWith('-')) return /(?:^|\/)manage\.py$/.test(a[i]) && a[i + 1] === 'test';
    if (a[i] === '-X' || a[i] === '-W') i++;
  }
  return false;
};
// turbo run test, turbo build.
const TASKS = 'test build typecheck check';
const turbo = (a: Args) => first(TASKS)(a[0] === 'run' ? a.slice(1) : a);
// nx test web, nx run web:test, nx run-many -t lint,test.
const nx = (a: Args) => {
  const s = set(TASKS);
  if (a[0] === 'run') return s.has((a[1] ?? '').split(':')[1] ?? '');
  if (a[0] !== 'run-many' && a[0] !== 'affected') return s.has(a[0] ?? '');
  const t = a.findIndex((x) => x === '-t' || x === '--target' || x === '--targets');
  const named = t >= 0 ? a[t + 1] ?? '' : (a.find((x) => /^--targets?=/.test(x)) ?? '').replace(/^[^=]*=/, '');
  return named.split(',').some((x) => s.has(x));
};

// The build and test commands, by program (one run by its path goes by
// its name), each with what makes a run of it one.
const CHECKS = new Map<string, (a: Args) => boolean>([
  ['npm', script], ['pnpm', runner], ['yarn', runner], ['bun', script],
  ['tsc', (a) => !a.includes('-v')], ['vitest', always], ['jest', always], ['mocha', always], ['ava', always], ['tap', always],
  ['playwright', first('test')], ['cypress', first('run')],
  ['node', node], ['tsx', node],
  ['deno', deno],
  ['python', python],
  ['pytest', always], ['tox', always], ['nox', always], ['mypy', always], ['pyright', always],
  ['cargo', first('test t build b check c nextest bench')],
  ['go', first('test build vet')],
  ['make', target('all build test tests check')],
  ['mvn', goal('test package verify install compile')], ['mvnw', goal('test package verify install compile')],
  ['gradle', goal('test build check assemble')], ['gradlew', goal('test build check assemble')],
  ['dotnet', first('test build')],
  ['cmake', (a) => a.includes('--build')], ['ctest', always], ['ninja', always], ['meson', first('test compile')],
  ['bazel', first('test build')], ['bazelisk', first('test build')],
  ['swift', first('test build')], ['xcodebuild', always],
  ['mix', first('test compile')], ['rspec', always], ['phpunit', always], ['pest', always],
  ['rake', target('test spec')],
  ['zig', first('test build')], ['stack', first('test build')], ['cabal', first('test build')], ['dune', first('test build')],
  ['turbo', turbo], ['nx', nx],
]);

// Asked only what it is (or to set it up, or what it would run): no run.
// tsc's -v is its version, too (see CHECKS).
const ASKS = set('--version --help -h --init --collect-only --co --listTests');
// The longest command line read; of a longer one, its start.
const MAX_LINE = 16_384;

// Shell options that let no failure by: set -e (one ends the line), set -o
// pipefail (one fails its pipeline).
const ERREXIT = /\bset\s+-[a-zA-Z]*e|\berrexit\b/;
const PIPEFAIL = /\bpipefail\b/;

// Whether the line's exit status can hide part i's (a check that failed,
// the line exiting 0): its pipeline goes on past it (but under pipefail);
// or past it and what runs only if it passed (&&), there is what runs if
// it failed (|| true), or whatever it did (; echo done, a line break; but
// under set -e, which ends the line at a failure not followed by &&).
function hides(parts: readonly string[], i: number, errexit: boolean, pipefail: boolean): boolean {
  let j = i;
  for (; parts[j + 1] === '|' || parts[j + 1] === '|&'; j += 2) if (!pipefail) return true;
  let chained = false;
  for (; parts[j + 1] === '&&' || parts[j + 1] === '|' || parts[j + 1] === '|&'; j += 2) chained = true;
  if (parts[j + 1] === '||') return true;
  if (errexit && !chained) return false;
  for (let k = j + 2; k < parts.length; k += 2) if (sets(words(parts[k]))) return true;
  return false;
}

// A part that sets the line's exit status in place of those before: any
// command but an exit that keeps it (exit, exit $?), or a structure's end
// (fi, done, }).
function sets(w: readonly string[]): boolean {
  return w.length > 0 && !CLOSERS.has(w[0]) && !(w[0] === 'exit' && (w.length === 1 || w[1] === '$?'));
}

// How a shell line runs a build or the tests: not at all ('none'), with
// its exit status the line's ('shown'), or with it hidden ('hidden': see
// hides; or as a condition, if npm test; then …). Any part of it that runs one counts, unless it runs in the
// background (`npm test &` returns at launch). So `cd app && npm test`
// shows its status, `npm test 2>&1 | tail` hides it, and `git commit -m
// "npm test"` runs none.
export function checkRun(line: string): 'none' | 'shown' | 'hidden' {
  const cmds = commands(line.length > MAX_LINE ? line.slice(0, MAX_LINE) : line);
  const parts = cmds.split(SEPARATOR);
  let run: 'none' | 'shown' = 'none';
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i + 1] === '&') continue;
    const {
      run: [program = '', ...args],
      cond,
    } = command(words(parts[i]));
    // A program run by its path goes by its name; python3.12 is python.
    const name = program.replace(/^.*\//, '').replace(/^(?:python[\d.]*|py)$/, 'python');
    if (args.some((a) => ASKS.has(a)) || (args.length === 1 && args[0] === '-V')) continue;
    if (!CHECKS.get(name)?.(args)) continue;
    if (cond || hides(parts, i, ERREXIT.test(cmds), PIPEFAIL.test(cmds))) return 'hidden';
    run = 'shown';
  }
  return run;
}

// Whether a shell line runs a build or the tests (see checkRun).
export function isCheck(line: string): boolean {
  return checkRun(line) !== 'none';
}

type Rec = {
  type?: string;
  timestamp?: string;
  uuid?: unknown;
  isMeta?: boolean;
  isSidechain?: boolean;
  isApiErrorMessage?: boolean;
  message?: { id?: unknown; model?: unknown; stop_reason?: unknown; content?: unknown };
  attachment?: { type?: unknown; prompt?: unknown };
};
type Block = { type?: unknown; id?: unknown; name?: unknown; input?: unknown; text?: unknown; tool_use_id?: unknown; is_error?: unknown; content?: unknown };

const SHELLS = new Set(['Bash', 'PowerShell']);
// A slash command that ran in Claude Code, not the model: its output.
const LOCAL_OUTPUT = /^<local-command-std(?:out|err)>/;

// One transcript's gains as its records are read. `lead`: a session's own
// transcript (its turns count); a subagent's run is the source's to count.
export class GainReader {
  private lead: boolean;
  // Build and test calls awaiting their result, each with whether its
  // line hides its exit status.
  private calls = new Map<string, boolean>();
  // A prompt is being answered. True at first: a tail read from the middle
  // of a turn still sees it finish.
  private open = true;
  // The turn open was opened by a slash command, not answered yet.
  private command = false;
  private found: Found[] = [];

  constructor(lead: boolean) {
    this.lead = lead;
  }

  apply(rec: unknown): void {
    if (!rec || typeof rec !== 'object') return;
    const r = rec as Rec;
    // Hook notes, peer messages and a stop hook's feedback are not the
    // agent's work, nor a prompt. Sidechain records in a lead's transcript
    // are a subagent's; a subagent's own transcript is all sidechain.
    if (r.isMeta || (this.lead && r.isSidechain)) return;
    const t = Date.parse(r.timestamp ?? '');
    // What the user typed while the lead was at work (or a task's
    // notification), handed to it mid-turn.
    if (r.type === 'attachment' && r.attachment?.type === 'queued_command') {
      if (typeof r.attachment.prompt === 'string') this.prompt(r.attachment.prompt);
      return;
    }
    const m = r.message;
    if (!m || typeof m !== 'object') return;
    const blocks = Array.isArray(m.content) ? (m.content as Block[]) : [];
    if (r.type === 'assistant') {
      this.command = false;
      for (const b of blocks) {
        if (b?.type !== 'tool_use' || typeof b.id !== 'string' || !SHELLS.has(String(b.name))) continue;
        const input = b.input as { command?: unknown; run_in_background?: unknown } | null;
        // One run in the background returns at launch, before it passes.
        if (typeof input?.command !== 'string' || input.run_in_background === true) continue;
        const run = checkRun(input.command);
        if (run !== 'none') this.call(b.id, run === 'hidden');
      }
      // An API error's stand-in reply ends nothing.
      if (r.isApiErrorMessage || m.model === '<synthetic>') return;
      if (this.lead && m.stop_reason === 'end_turn' && this.open && Number.isFinite(t)) {
        this.open = false;
        const id = typeof m.id === 'string' ? m.id : typeof r.uuid === 'string' ? r.uuid : String(t);
        this.add({ at: t, key: `turn:${id}`, kind: 'turn' });
      }
      return;
    }
    if (r.type !== 'user') return;
    if (typeof m.content === 'string') {
      this.prompt(m.content);
      return;
    }
    let results = false;
    for (const b of blocks) {
      if (b?.type !== 'tool_result') continue;
      results = true;
      const id = typeof b.tool_use_id === 'string' ? b.tool_use_id : '';
      const hidden = this.calls.get(id);
      if (hidden === undefined) continue;
      this.calls.delete(id);
      if (b.is_error === true || !Number.isFinite(t)) continue;
      const out = resultText(b);
      if (!FAILED.some((re) => re.test(out)) && (!hidden || PASSED.some((re) => re.test(out)))) this.add({ at: t, key: `check:${id}`, kind: 'check' });
    }
    if (results) return;
    // Its text (as the chat reads it), or an image pasted alone.
    const text = blocks.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).join('\n');
    if (text || blocks.some((b) => b?.type === 'image')) this.prompt(text);
  }

  // The gains found since last taken, oldest first.
  take(): Found[] {
    const out = this.found;
    this.found = [];
    return out;
  }

  // A user's prompt opens a turn; their interrupting it closes it
  // unfinished. What Claude Code writes in their place (a task's
  // notification, shell-mode output) does neither: the lead answering a
  // finished subagent is not a turn of yours. A slash command opens one,
  // but one that ran locally (/model) is over with its output: no model
  // call follows.
  private prompt(text: string): void {
    const t = text.trimStart();
    if (LOCAL_OUTPUT.test(t) && this.command) this.open = this.command = false;
    if (SYSTEM.test(t)) return;
    this.open = !t.startsWith(INTERRUPTED);
    this.command = this.open && COMMAND.test(t);
  }

  private call(id: string, hidden: boolean): void {
    if (this.calls.size >= MAX_CALLS) this.calls.delete(this.calls.keys().next().value!);
    this.calls.set(id, hidden);
  }

  private add(f: Found): void {
    if (this.found.length >= MAX_FOUND) this.found.shift();
    this.found.push(f);
  }
}
