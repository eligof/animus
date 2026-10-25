import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GainReader, checkRun, isCheck } from '../src/claude/gains.ts';
import { budget } from './helpers.ts';

const T0 = Date.UTC(2026, 9, 25, 10, 0, 0);
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const prompt = (s: number, text = 'go', extra: object = {}) => ({ type: 'user', uuid: `u${s}`, timestamp: at(s), message: { role: 'user', content: text }, ...extra });
// One record per content block, as Claude Code writes them.
const reply = (s: number, id: string, stop: string | null, ...content: object[]) => ({ type: 'assistant', uuid: `a${s}`, timestamp: at(s), message: { id, role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, content } });
const bash = (s: number, id: string, command: string) => reply(s, `m${s}`, 'tool_use', { type: 'tool_use', id, name: 'Bash', input: { command } });
const result = (s: number, id: string, isError = false, content = 'ok') => ({ type: 'user', uuid: `r${s}`, timestamp: at(s), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } });
// As a subagent's transcript holds it.
const side = (rec: object) => ({ ...rec, isSidechain: true });
const read = (lead: boolean, ...recs: unknown[]) => {
  const r = new GainReader(lead);
  for (const rec of recs) r.apply(rec);
  return r.take().map((g) => `${g.kind}@${(g.at - T0) / 1000}:${g.key}`);
};

test('build and test commands are told from the rest', () => {
  const yes = [
    'npm test', 'npm run test:unit', 'npm run build', 'pnpm test', 'yarn build', 'bun test', 'npm t',
    'npx tsc --noEmit', 'tsc -p tsconfig.json', 'node node_modules/typescript/bin/tsc -p tsconfig.json', 'node --test "test/**/*.test.ts"',
    'npx vitest run', './node_modules/.bin/jest --ci', 'pytest -q', 'python -m pytest tests/', 'uv run pytest', 'poetry run pytest -x',
    'cargo test', 'cargo build --release', 'cargo check', 'go test ./...', 'go build ./cmd/x', 'make', 'make test', 'make -j8', 'make -j8 build V=1',
    'mvn -q test', './gradlew build', 'dotnet test', 'cmake --build build', 'ctest', 'bazel test //...', 'swift build', 'mix test',
    'bundle exec rspec', 'vendor/bin/phpunit', 'rake', 'zig build', 'deno test', 'tox', 'mypy src',
    'cd app && npm test 2>&1 | tail -20', 'FOO=1 timeout 600 npm test', '(cd web && make)', 'git status; npm run typecheck',
  ];
  const no = [
    'git status', 'ls -la', 'npm install', 'npm ci', 'npm run lint', 'npm run dev', 'make clean', 'make lint', 'cargo fmt', 'go mod tidy',
    'echo npm test', 'git commit -m "npm test"', 'cat Makefile', 'docker compose up', 'rm -rf build', 'grep -r test src', 'nodemon', 'node server.js',
  ];
  for (const c of yes) assert.ok(isCheck(c), `should count: ${c}`);
  for (const c of no) assert.ok(!isCheck(c), `should not count: ${c}`);
});

test('quoted strings and heredoc bodies are not commands, unless a shell reads the heredoc', () => {
  const no = [
    "cat > run.sh <<'EOF'\nnpm test\nEOF",
    'cat <<EOF > notes.md\nset -e\nnpm test && cargo build\nEOF',
    'git commit -m "fix: tidy the parser\n\ngo build ./... passes"',
    "git commit -m \"$(cat <<'EOF'\nfix(x): tidy\n\ncargo test passes\nEOF\n)\"",
    'echo "a; npm test b"',
    "echo 'done && npm test'",
    "echo $'it\\'s done; npm test now'",
    'gh pr create --title "Speed up" --body "Ran: make test | tail"',
    'git status # then npm test',
  ];
  const yes = [
    "bash <<'EOS'\nset -e\nnpm test\nEOS",
    'sh -s <<EOF\ncd app\nmake test\nEOF',
    "zsh -s <<'X'\npytest -q\nX",
    "cat > run.sh <<'EOF'\necho hi\nEOF\nnpm run build",
    'npm run "test:unit"',
    "node --test 'test/a b.test.ts'",
    'git commit -m "wip"; npm test',
    'FOO="a b" npm test',
  ];
  for (const c of yes) assert.ok(isCheck(c), `should count: ${JSON.stringify(c)}`);
  for (const c of no) assert.ok(!isCheck(c), `should not count: ${JSON.stringify(c)}`);
});

test('the common ways of running a build or the tests are told', () => {
  const yes = [
    // Workspaces and directories.
    'pnpm -r test', 'pnpm --filter web test', 'pnpm --filter=web run build', 'pnpm -C packages/web test', 'npm --prefix app test', 'npm -w api test',
    'npm test --workspaces', 'yarn workspace web test', 'yarn workspace web run build', 'make -C build test', 'make -C build',
    // What runs before them.
    'timeout 600 npm test', 'timeout -s KILL 60 cargo test', 'timeout --preserve-status 5m go test ./...', 'sudo npm test', 'sudo -E make test',
    'nice -n 10 cargo build', 'nice -5 make', 'env CI=1 npm test', 'env -i PATH=/usr/bin make', 'CI=1 NODE_ENV=test npm test',
    // Runners and how they are run.
    'npx tsx --test test/*.test.ts', 'node --import tsx --test test/a.test.ts', 'node --experimental-strip-types --test', 'python3.12 -m pytest -q', 'python3 -X dev -m unittest',
    'turbo run test', 'turbo build --filter=web', 'nx test web', 'nx run web:test', 'nx run-many -t lint,test',
    './gradlew :app:test', 'mvn clean install', 'mvn -pl core test', 'cargo +nightly test', 'make 2>&1 | tail -20',
  ];
  const no = [
    'pnpm -r install', 'npm --prefix app run lint', 'yarn workspace web run dev', 'timeout 60 npm run dev', 'sudo apt install make', 'env',
    'npx tsx scripts/gen.ts', 'node --import tsx scripts/gen.ts', 'python3.12 scripts/test.py', 'turbo run lint', 'nx lint web', 'nx run web:serve',
    'mvn clean', './gradlew clean', 'make -C build lint',
  ];
  for (const c of yes) assert.ok(isCheck(c), `should count: ${c}`);
  for (const c of no) assert.ok(!isCheck(c), `should not count: ${c}`);
});

test('runners by their short names, what wraps them, shells and their control structures are seen through', () => {
  const yes = [
    // Short names, and runners run by a package manager.
    'cargo t', 'cargo b --release', 'cargo c', 'pnpm vitest run', 'pnpm --filter web jest --ci', 'yarn jest', 'yarn vitest', 'yarn mocha',
    'pnpm exec vitest run', 'yarn exec jest', 'npm exec -- jest', 'uvx pytest -q', 'deno test -A', 'deno task test', 'deno task build',
    'python manage.py test', 'python3 manage.py test shop.tests',
    // What runs them.
    'nohup npm test', 'xvfb-run npm test', 'xvfb-run -a npx playwright test', 'xvfb-run -a -s "-screen 0 1280x1024x24" npm test',
    'bash -c "npm test"', "sh -c 'cd app && make test'", 'bash -lc "pytest -q"', 'sudo bash -c "make"', 'timeout 600 bash -c "cargo test"', 'bash -euo pipefail -c "npm test | tail -3"',
    "cat <<'EOF' | bash\nset -e\nnpm test\nEOF", 'cat <<EOF | sh -s\nmake test\nEOF',
    // The shell's control structures.
    'if npm test; then echo ok; fi', 'if ! npm test; then exit 1; fi', 'while ! npm test; do sleep 1; done', '! npm test', '{ npm test; }', '( npm test )',
    'for f in a b; do npm test; done', 'if [ -d app ]\nthen\n  npm test\nfi', 'if [ -x x ]; then :; else npm test; fi',
  ];
  const no = [
    'tsc -v', 'npx tsc -v', 'tsc --init', 'pytest --collect-only', 'pytest --co -q', 'python -m pytest --co', 'jest --listTests',
    'bash -c "echo npm test"', 'bash run.sh', "sh -c 'npm install'", 'echo bash -c "npm test"', "git commit -m \"bash -c 'npm test'\"",
    "cat <<'EOF' | grep test\nnpm test\nEOF", 'python manage.py migrate', 'deno task dev', 'uvx ruff check', 'nohup npm run dev &',
    'if [ -f x ]; then echo npm test; fi', 'yarn add jest', 'pnpm add -D vitest',
  ];
  for (const c of yes) assert.ok(isCheck(c), `should count: ${JSON.stringify(c)}`);
  for (const c of no) assert.ok(!isCheck(c), `should not count: ${JSON.stringify(c)}`);
  // A condition's failure is taken, and `!` makes it success: hidden. A
  // group's, a branch's, a loop body's and a shell's last command's is the line's.
  const runs: Array<[string, string]> = [
    ['if npm test; then echo ok; fi', 'hidden'], ['while ! npm test; do sleep 1; done', 'hidden'], ['! npm test', 'hidden'],
    ['{ npm test; }', 'shown'], ['( npm test )', 'shown'], ['if [ -d app ]; then npm test; fi', 'shown'], ['for f in a b; do npm test; done', 'shown'],
    ['bash -c "npm test"', 'shown'], ['bash -c "npm test | tail -5"', 'hidden'], ["sh -c 'npm test; echo done'", 'hidden'], ['bash -c "npm test" | tail', 'hidden'], ['bash -euo pipefail -c "npm test | tail -3"', 'shown'],
    ["cat <<'EOF' | bash\nnpm test\nEOF", 'shown'], ["bash <<'EOF'\nnpm test\nEOF", 'shown'], ["cat <<'EOF' | bash\nnpm test\necho done\nEOF", 'hidden'],
  ];
  for (const [c, run] of runs) assert.equal(checkRun(c), run, JSON.stringify(c));
});

test('asking a tool its version or for help, a dry run and a clean are not a build or test', () => {
  const no = [
    'npm --version', 'node --version', 'npx tsc --version', 'tsc --help', 'jest -h', 'cargo -V', 'pytest --help', 'python3 -m pytest --version', 'go test -h',
    'make --dry-run', 'make -n test', 'make --just-print', 'make clean', 'make -C build clean', 'cargo clean',
  ];
  for (const c of no) assert.ok(!isCheck(c), `should not count: ${c}`);
  // -V alone asks the version; with more, it runs (mvn -V shows it, then builds).
  assert.ok(isCheck('mvn -V test'));
});

test('a long or hostile command line is read in time linear in its length, up to 16 KB of it', () => {
  const n = 80_000;
  const lines = [
    'npm' + ' '.repeat(n) + 'x',
    'npm test' + '\t'.repeat(n) + 'y',
    'npm ' + ')'.repeat(n) + 'x',
    'cat ' + '<<A '.repeat(n / 4),
    'bash ' + '<<A '.repeat(n / 4),
    'cat ' + '<<A '.repeat(n / 4) + '\n' + 'x\n'.repeat(n / 2),
  ];
  for (const l of lines) budget(`isCheck(${JSON.stringify(l.slice(0, 10))}…)`, () => isCheck(l), 25);
  // Past the first 16 KB, nothing is read.
  assert.ok(isCheck('npm test; ' + 'x'.repeat(20_000)));
  assert.ok(!isCheck('x'.repeat(20_000) + '; npm test'));
});

test("a lead's turn counts once, when its final reply ends", () => {
  assert.deepEqual(
    read(
      true,
      prompt(0),
      reply(1, 'm1', 'tool_use', { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/a' } }),
      result(2, 't1'),
      // The final reply: its thinking and its text, each a record ending the turn.
      reply(3, 'm3', 'end_turn', { type: 'thinking', thinking: '' }),
      reply(3, 'm3', 'end_turn', { type: 'text', text: 'Done.' }),
      // A stop hook sends it on: still the same turn.
      prompt(4, 'Stop hook feedback: run the tests', { isMeta: true }),
      reply(5, 'm5', 'end_turn', { type: 'text', text: 'Now done.' }),
      prompt(9, 'next'),
      reply(10, 'm10', 'end_turn', { type: 'text', text: 'ok' }),
    ),
    ['turn@3:turn:m3', 'turn@10:turn:m10'],
  );
});

test('an interrupted turn and an API error earn nothing', () => {
  assert.deepEqual(read(true, prompt(0), prompt(1, '[Request interrupted by user]'), reply(2, 'm2', 'end_turn', { type: 'text', text: 'ok' })), []);
  assert.deepEqual(read(true, prompt(0), { ...reply(1, 'm1', 'end_turn', { type: 'text', text: 'API Error' }), isApiErrorMessage: true }), []);
  assert.deepEqual(read(true, prompt(0), reply(1, 'm1', 'end_turn', { type: 'text', text: 'x' }), { ...reply(2, 'm2', 'end_turn', { type: 'text', text: 'x' }), message: { id: 'm2', model: '<synthetic>', stop_reason: 'end_turn', content: [] } }), ['turn@1:turn:m1']);
});

const done = (s: number) => reply(s, `m${s}`, 'end_turn', { type: 'text', text: 'ok' });

test("what Claude Code writes in the user's place neither opens a turn nor ends one; a slash command does open one", () => {
  assert.deepEqual(
    read(
      true,
      prompt(0),
      done(1),
      // A background subagent finished: the lead answers it, but that is no turn of yours.
      prompt(2, '<task-notification>\n<task-id>a1b2</task-id>\n<status>completed</status>\n<summary>Agent "Map it" completed</summary>\n</task-notification>'),
      done(3),
      // Shell mode, and a local command's output.
      prompt(4, '<bash-input>git status</bash-input>'),
      prompt(5, '<bash-stdout>On branch main</bash-stdout><bash-stderr></bash-stderr>'),
      prompt(6, '<local-command-stdout>Set model to opus</local-command-stdout>'),
      done(7),
      // A slash command the user typed is a prompt.
      prompt(10, '<command-message>review</command-message>\n<command-name>/review</command-name>\n<command-args></command-args>'),
      done(11),
    ),
    ['turn@1:turn:m1', 'turn@11:turn:m11'],
  );
  // Nor does a notification that lands mid-turn close it.
  assert.deepEqual(read(true, prompt(0), prompt(1, '<task-notification>\n<task-id>a1</task-id>\n<status>completed</status>\n</task-notification>'), done(2)), ['turn@2:turn:m2']);
});

test('a slash command that ran locally is no turn: its output closes what the command opened', () => {
  const model = '<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args></command-args>';
  assert.deepEqual(
    read(
      true,
      prompt(0, 'fix it'),
      done(1),
      // /model runs in Claude Code, no model call: its output is the whole of it.
      prompt(2, model),
      prompt(2, '<local-command-stdout>Set model to opus</local-command-stdout>'),
      // A background subagent finishes later; the lead answers it.
      prompt(30, '<task-notification>\n<task-id>x</task-id>\n<status>completed</status>\n</task-notification>'),
      done(31),
    ),
    ['turn@1:turn:m1'],
  );
  // Its error output, too.
  assert.deepEqual(read(true, prompt(0, model), prompt(0, '<local-command-stderr>Unknown model</local-command-stderr>'), done(5)), []);
  // A user's prompt is not closed by a local command's output, nor is a slash command the model answers.
  assert.deepEqual(read(true, prompt(0), prompt(1, '<local-command-stdout>x</local-command-stdout>'), done(2)), ['turn@2:turn:m2']);
  assert.deepEqual(
    read(true, prompt(0, '<command-name>/review</command-name>'), reply(1, 'm1', 'tool_use', { type: 'tool_use', id: 't', name: 'Read', input: {} }), prompt(2, '<local-command-stdout>x</local-command-stdout>'), done(3)),
    ['turn@3:turn:m3'],
  );
});

test('what the user typed while the lead was at work, handed to it as an attachment, opens a turn; a notification so handed does not', () => {
  const queued = (s: number, text: string, mode: string) => ({ type: 'attachment', uuid: `q${s}`, timestamp: at(s), attachment: { type: 'queued_command', prompt: text, commandMode: mode } });
  const notification = '<task-notification>\n<task-id>a1</task-id>\n<status>completed</status>\n</task-notification>';
  // The lead answers a finished subagent (no turn of yours) and is handed your prompt on the way.
  assert.deepEqual(read(true, prompt(0), done(1), prompt(2, notification), queued(3, 'and fix the docs', 'prompt'), done(4)), ['turn@1:turn:m1', 'turn@4:turn:m4']);
  assert.deepEqual(read(true, prompt(0), done(1), prompt(2, notification), queued(3, notification, 'task-notification'), done(4)), ['turn@1:turn:m1']);
});

test('an image pasted alone is a prompt', () => {
  const image = (s: number) => ({ type: 'user', uuid: `u${s}`, timestamp: at(s), message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } }] } });
  assert.deepEqual(read(true, prompt(0), done(1), image(5), done(6)), ['turn@1:turn:m1', 'turn@6:turn:m6']);
});

test('a build or test that passed earns; one that failed or was refused, or another command, does not', () => {
  assert.deepEqual(
    read(
      false,
      bash(1, 'b1', 'npm test'),
      result(2, 'b1'),
      bash(3, 'b2', 'cargo build'),
      result(4, 'b2', true, 'Exit code 101'),
      bash(5, 'b3', 'git status'),
      result(6, 'b3'),
      bash(7, 'b4', 'make test'),
      result(8, 'b4', true, 'Permission to use Bash with command make test has been denied.'),
      result(9, 'b1'), // a result already seen: nothing more
    ),
    ['check@2:check:b1'],
  );
});

test('a check whose output says it failed earns nothing, though the command exited 0', () => {
  // A pipe to tail, `; echo` or `|| true` hides the exit code; the summary does not.
  const runs: Array<[string, string | object[], boolean]> = [
    ['npm test 2>&1 | tail -5', 'ℹ tests 12\nℹ pass 11\nℹ fail 1\nℹ cancelled 0', false],
    ['npm test 2>&1 | tail -5', 'ℹ tests 12\nℹ pass 12\nℹ fail 0\nℹ cancelled 0', true],
    ['node --test --test-reporter=tap | tail -4', '# pass 9\n# fail 2', false],
    ['npx jest; echo done', 'Tests:       1 failed, 41 passed, 42 total\ndone', false],
    ['npx jest | tail -3', 'Tests:       42 passed, 42 total', true],
    ['npx vitest run | tail', ' FAIL  src/cart.test.ts > totals\n Test Files  1 failed | 3 passed (4)', false],
    ['npx mocha | tail -3', '  40 passing (2s)\n  2 failing', false],
    ['cargo test || true', 'test result: FAILED. 3 passed; 1 failed; 0 ignored', false],
    ['cargo test | tail -2', 'test result: ok. 4 passed; 0 failed; 0 ignored', true],
    ['cargo build 2>&1 | tail', 'error[E0425]: cannot find value `x` in this scope\nerror: could not compile `app`', false],
    ['npx tsc --noEmit | head', "src/a.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.", false],
    ['pytest -q | tail -1', '1 failed, 20 passed in 0.52s', false],
    ['python -m unittest 2>&1 | tail -1', 'FAILED (failures=1)', false],
    ['go test ./... | tail -1', 'FAIL\tgithub.com/u/app/cart\t0.012s', false],
    ['go test ./... | tail -1', 'ok  \tgithub.com/u/app/cart\t0.012s', true],
    ['npm run build | tail -2', 'npm ERR! code ELIFECYCLE\nnpm ERR! errno 2', false],
    ['make 2>&1 | tail -1', 'make: *** [Makefile:3: all] Error 1', false],
    // As a block list, too.
    ['npm test | tail -2', [{ type: 'text', text: 'ℹ pass 3\nℹ fail 2' }], false],
    // A script can swallow its runner's exit code ("test": "jest || true").
    ['npm test', '✖ failing tests:\n\ntest at test/a.test.ts:3:1\n✖ adds (1.1ms)', false],
    ['npm test', 'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n\n1 !== 2\n', false],
    ['python -m pytest', 'Traceback (most recent call last):\n  File "<frozen runpy>", line 198, in _run_module_as_main\nModuleNotFoundError: No module named pytest', false],
    ['npm test', 'sh: 1: vitest: command not found', false],
    ['mypy src', 'src/a.py:3: error: Incompatible types in assignment\nFound 1 error in 1 file (checked 4 source files)', false],
    ['pytest -q', '_____________ ERROR collecting tests/test_a.py _____________\n=============================== 1 error in 0.08s ===============================', false],
    ['go build ./...', '# github.com/u/app\n./main.go:3:2: undefined: total', false],
  ];
  runs.forEach(([command, out, earns], k) => {
    const id = `b${k}`;
    const rec = result(2, id, false, out as string);
    assert.deepEqual(read(false, bash(1, id, command), rec), earns ? [`check@2:check:${id}`] : [], `${command} → ${JSON.stringify(out)}`);
  });
});

test('a check whose exit status the line hides earns only if its output shows it passed', () => {
  // Piped on, or followed by what runs whatever it did, a failing check
  // exits 0: no output, or a tail of stack frames, proves nothing.
  const frames = '    at Test.run (node:internal/test_runner/test:1047:25)\n    at async Test.processPendingSubtests (node:internal/test_runner/test:744:7)';
  const runs: Array<[string, string, boolean]> = [
    ['node --test 2>&1 | tail -2', frames, false],
    ['npx tsc --noEmit | head', '', false],
    ['npx tsc --noEmit 2>&1 | grep -v warning', '', false],
    ['make test | tee test.log', 'cc -o app main.c\n./app --selftest', false],
    ['npm test 2>&1 | sed -n 1,3p', '> app@1.0.0 test\n> node --test', false],
    ['npm test | cat', frames, false],
    ['pytest -q || true', '..F.', false],
    ['pytest -q || :', '..F.', false],
    ['go test ./...; true', '', false],
    ['npm run build; echo done', 'done', false],
    ['npm test; exit 0', frames, false],
    ['cargo build && echo built || echo broken', 'built', false],
    // Unless what it printed shows it passed.
    ['node --test 2>&1 | tail -5', 'ℹ pass 12\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0', true],
    ['node --test --test-reporter=tap | tail -3', '# pass 9\n# fail 0\n# cancelled 0', true],
    ['npx jest 2>&1 | tail -4', 'Test Suites: 3 passed, 3 total\nTests:       12 passed, 12 total\nSnapshots:   0 total\nTime:        1.2 s', true],
    ['npx vitest run | tail -3', ' Test Files  4 passed (4)\n      Tests  42 passed (42)\n   Duration  1.20s', true],
    ['pytest -q || true', '....\n4 passed in 0.12s', true],
    ['npx mocha | tail -2', '\n  40 passing (2s)', true],
    ['cargo test 2>&1 | tail -1', 'test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s', true],
    ['go test ./... | tail -1', 'ok  \tgithub.com/u/app/cart\t(cached)', true],
    ['python -m unittest 2>&1 | tail -3', 'Ran 12 tests in 0.004s\n\nOK', true],
    ['mypy src | tail -1', 'Success: no issues found in 12 source files', true],
    ['./gradlew build | tail -2', 'BUILD SUCCESSFUL in 4s\n7 actionable tasks: 7 executed', true],
    ['cargo build --release 2>&1 | tail -1', '    Finished `release` profile [optimized] target(s) in 0.05s', true],
    // An exit status that shows (the line's last, or followed only by what
    // runs if it passed; under pipefail or set -e) needs no word of it.
    ['npx tsc --noEmit', '', true],
    ['cd app && npx tsc --noEmit && echo typed', 'typed', true],
    ['npm test 2>&1', 'done', true],
    ['npm test > test.log 2>&1', '', true],
    ['git status | head -1; npm test', 'On branch main', true],
    ['set -o pipefail; npx tsc --noEmit | head', '', true],
    ['set -e\nnpm run build\necho built', 'built', true],
  ];
  runs.forEach(([command, out, earns], k) => {
    const id = `h${k}`;
    assert.deepEqual(read(false, bash(1, id, command), result(2, id, false, out)), earns ? [`check@2:check:${id}`] : [], `${command} → ${JSON.stringify(out)}`);
  });
});

test('a check run in the background earns nothing: its call returns at launch', () => {
  const background = reply(1, 'm1', 'tool_use', { type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test', run_in_background: true } });
  assert.deepEqual(read(false, background, result(2, 'b1', false, 'Command running in background with ID: bash_1')), []);
  for (const c of ['npm test &', 'npm test > test.log 2>&1 &', 'cd app && cargo build &']) assert.ok(!isCheck(c), `should not count: ${c}`);
  for (const c of ['npm test 2>&1', 'npm test &> test.log', 'npm test >&2', 'npm run dev & npm test']) assert.ok(isCheck(c), `should count: ${c}`);
});

test("a subagent's transcript counts its checks, not turns", () => {
  // Every record of a subagent's own transcript is a sidechain record.
  const recs = [prompt(0, 'task'), bash(1, 'b1', 'pytest -q'), result(2, 'b1'), reply(3, 'm3', 'end_turn', { type: 'text', text: 'All green.' })];
  assert.deepEqual(read(false, ...recs.map(side)), ['check@2:check:b1']);
});

test("meta records, and sidechain records in a lead's transcript, are not the agent at work", () => {
  assert.deepEqual(read(true, prompt(0), { ...reply(1, 'm1', 'end_turn', { type: 'text', text: 'x' }), isSidechain: true }, { ...bash(2, 'b', 'npm test'), isMeta: true }, result(3, 'b')), []);
});

test('read again, the same records give the same gains', () => {
  const recs = [prompt(0), bash(1, 'b1', 'go test ./...'), result(2, 'b1'), reply(3, 'm3', 'end_turn', { type: 'text', text: 'ok' })];
  assert.deepEqual(read(true, ...recs), ['check@2:check:b1', 'turn@3:turn:m3']);
  assert.deepEqual(read(true, ...recs), read(true, ...recs));
  // From the middle of the turn (a tail read): the turn still counts.
  assert.deepEqual(read(true, ...recs.slice(2)), ['turn@3:turn:m3']);
});

test('records it cannot read leave it as it was', () => {
  assert.deepEqual(read(true, null, 7, 'x', {}, { type: 'assistant' }, { type: 'user', message: { content: [null, 3] } }, { type: 'assistant', message: { stop_reason: 'end_turn' } }), []);
});
