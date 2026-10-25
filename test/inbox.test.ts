import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { dirname, join } from 'node:path';
import type { Bubble } from '../src/agents.ts';
import { findInbox, followAll, followUp, frame, inboxOf, post, sendTo } from '../src/claude/inbox.ts';
import type { Outgoing } from '../src/claude/inbox.ts';
import { ClaudeSource } from '../src/claude/source.ts';
import { tempDir } from './helpers.ts';

// A Claude root whose registry holds the given sessions (pid → entry), each
// in <pid>.json unless the entry names its `file`.
function registry(entries: Record<number, Record<string, unknown> & { file?: string }>): string {
  const root = tempDir('animus-inbox');
  mkdirSync(join(root, 'sessions'));
  for (const [pid, { file, ...e }] of Object.entries(entries)) {
    writeFileSync(join(root, 'sessions', file ?? `${pid}.json`), JSON.stringify({ pid: Number(pid), cwd: '/w', status: 'busy', updatedAt: 1, kind: 'interactive', ...e }));
  }
  return root;
}

// A fake inbox: a Unix socket server in a temp dir that keeps what each
// connection wrote, closed when test `t` ends (passed or not). `hang`: it
// never ends a connection. `deaf`: it never reads one either.
async function fakeInbox(t: TestContext, o: { hang?: boolean; deaf?: boolean } = {}): Promise<{ path: string; got: string[]; close(): Promise<void> }> {
  const path = join(tempDir('animus-sock'), 'in.sock');
  const got: string[] = [];
  const socks = new Set<Socket>();
  const server = createServer({ allowHalfOpen: o.hang === true }, (sock) => {
    socks.add(sock);
    if (o.deaf) return void sock.pause();
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('data', (d) => (buf += d));
    sock.on('end', () => got.push(buf));
  });
  await new Promise<void>((res) => server.listen(path, res));
  // As Claude Code makes it: open to its owner only.
  chmodSync(path, 0o600);
  const close = () =>
    new Promise<void>((res) => {
      for (const s of socks) s.destroy();
      server.close(() => res());
    });
  t.after(close);
  return { path, got, close };
}

test('the inbox is found by session id among live sessions', async (t) => {
  const [a, b] = [await fakeInbox(t), await fakeInbox(t)];
  const root = registry({
    10: { sessionId: 'S1', messagingSocketPath: a.path, peerProtocol: 1 },
    20: { sessionId: 'S2', messagingSocketPath: `uds:${b.path}`, peerProtocol: 1 },
  });
  assert.deepEqual(findInbox(root, 'S1', () => true), { ok: true, socket: a.path });
  assert.deepEqual(findInbox(root, 'S2', () => true), { ok: true, socket: b.path });
  assert.deepEqual(findInbox(root, 'S3', () => true), { ok: false, reason: 'no live session' });
  await a.close();
  await b.close();
});

test('a dead session, one with messaging off, and an old Claude Code take no messages', () => {
  const root = registry({
    10: { sessionId: 'S1', messagingSocketPath: '/s/10.sock', peerProtocol: 1 },
    20: { sessionId: 'S2', peerProtocol: 1 },
    30: { sessionId: 'S3', messagingSocketPath: '/s/30.sock' },
    40: { sessionId: 'S4', messagingSocketPath: '/s/40.sock', peerProtocol: 0 },
  });
  assert.deepEqual(findInbox(root, 'S1', (pid) => pid !== 10), { ok: false, reason: 'no live session' });
  assert.deepEqual(findInbox(root, 'S2', () => true), { ok: false, reason: 'messaging is off in its session' });
  assert.deepEqual(findInbox(root, 'S3', () => true), { ok: false, reason: 'its Claude Code takes no messages' });
  assert.deepEqual(findInbox(root, 'S4', () => true), { ok: false, reason: 'its Claude Code takes no messages' });
});

test('no registry at all: no live session', () => {
  assert.deepEqual(findInbox(join(tempDir('animus-inbox-none'), 'missing'), 'S1', () => true), { ok: false, reason: 'no live session' });
});

// The registry entry `inboxOf` sees for a session whose inbox is `socket`.
const entry = (socket: string, o: { pid?: number; file?: string } = {}) => {
  const pid = o.pid ?? 10;
  return { pid, file: o.file ?? `${pid}.json`, sessionId: 'S1', cwd: '/w', name: '', status: 'busy', updatedAt: 1, kind: 'interactive', socket, peerProtocol: 1 };
};

test('an inbox must be your own private Unix socket at an absolute path, never a link to one', async (t) => {
  const inbox = await fakeInbox(t);
  const dir = tempDir('animus-odd-inbox');
  const link = join(dir, 'link.sock');
  symlinkSync(inbox.path, link);
  const plain = join(dir, 'plain.sock');
  writeFileSync(plain, '');
  const shared = await fakeInbox(t);
  chmodSync(shared.path, 0o660);
  const why = (socket: string) => {
    const box = inboxOf(entry(socket));
    return box.ok ? null : box.reason;
  };
  assert.equal(why(inbox.path), null);
  assert.equal(why(link), 'its inbox is a symlink');
  assert.equal(why('in.sock'), 'its inbox is not an absolute path');
  assert.equal(why('tcp:127.0.0.1:9'), 'its inbox is not a Unix socket (tcp:)');
  assert.equal(why(plain), 'its inbox is not a socket');
  assert.equal(why(join(dir, 'gone.sock')), 'its inbox is not there (ENOENT)');
  assert.equal(why(shared.path), 'its inbox is open to other users');
  // Owned by someone else (a test cannot chown): the owner it must have
  // is this process's user, here made someone else's.
  const me = process.getuid?.() ?? 0;
  assert.deepEqual(inboxOf(entry(inbox.path), me + 1), { ok: false, reason: 'its inbox is not yours' });
  assert.deepEqual(inboxOf(entry(inbox.path), me), { ok: true, socket: inbox.path });
  // Sent through the registry, the refused ones are never connected to.
  for (const [socket, reason] of [[link, 'its inbox is a symlink'], [shared.path, 'its inbox is open to other users']]) {
    const root = registry({ 10: { sessionId: 'S1', messagingSocketPath: socket, peerProtocol: 1 } });
    assert.deepEqual(await sendTo(root, 'S1', 'hi', { alive: () => true }), { ok: false, reason });
  }
  await inbox.close();
  await shared.close();
  assert.deepEqual([inbox.got, shared.got], [[], []], 'nothing was sent anywhere');
});

test('an entry not in the <pid>.json Claude Code writes for its pid is refused, and nothing is sent', async (t) => {
  const inbox = await fakeInbox(t);
  assert.deepEqual(inboxOf(entry(inbox.path, { pid: 10, file: '99.json' })), { ok: false, reason: 'its registry entry is not named for its pid' });
  const root = registry({ 10: { file: '99.json', sessionId: 'S1', messagingSocketPath: inbox.path, peerProtocol: 1 } });
  assert.deepEqual(await sendTo(root, 'S1', 'hi', { alive: () => true }), { ok: false, reason: 'its registry entry is not named for its pid' });
  await inbox.close();
  assert.deepEqual(inbox.got, []);
});

test('of several entries for one session, reach and send take the same: one that can be sent to, then the newest', async (t) => {
  const [old, newer, shared] = [await fakeInbox(t), await fakeInbox(t), await fakeInbox(t)];
  chmodSync(shared.path, 0o660);
  const on = (socket: string, updatedAt: number) => ({ sessionId: 'S1', messagingSocketPath: socket, peerProtocol: 1, updatedAt });
  // The newest cannot be sent to; of the rest, 30 is the newest.
  const root = registry({ 10: on(shared.path, 9), 20: on(old.path, 1), 30: on(newer.path, 5), 40: on(old.path, 2) });
  assert.deepEqual(findInbox(root, 'S1', () => true), { ok: true, socket: newer.path });
  const src = new ClaudeSource(root, { alive: () => true });
  assert.equal(src.poll(Date.now()).filter((a) => a.id === 'S1').length, 1, 'one agent for the session');
  assert.equal(src.reach('S1'), null);
  assert.deepEqual(await src.send('S1', 'hi'), { ok: true });
  assert.deepEqual([old.got.length, newer.got.length, shared.got.length], [0, 1, 0]);
  // None can be sent to: the newest says why, to both.
  const none = registry({ 10: on(shared.path, 1), 20: { sessionId: 'S1', peerProtocol: 1, updatedAt: 2 } });
  assert.deepEqual(findInbox(none, 'S1', () => true), { ok: false, reason: 'messaging is off in its session' });
  const src2 = new ClaudeSource(none, { alive: () => true });
  src2.poll(Date.now());
  assert.equal(src2.reach('S1'), 'messaging is off in its session');
});

test('the frame is one JSON line: the text wrapped as from animus, the session id, nothing else', () => {
  const want = String.raw`{"type":"user","message":{"role":"user","content":"<cross-session-message from-name=\"animus\">\nhello there\n</cross-session-message>"},"priority":"next","session_id":"S1"}` + '\n';
  assert.equal(frame('S1', 'hello there'), want);
  assert.doesNotMatch(want, /from-mode|token|auth/);
  const parsed = JSON.parse(frame('S1', 'say "hi" & <b>')!);
  assert.deepEqual(Object.keys(parsed), ['type', 'message', 'priority', 'session_id']);
  assert.equal(parsed.message.content, '<cross-session-message from-name="animus">\nsay "hi" & <b>\n</cross-session-message>');
});

test('text holding the closing tag, in any case, is never framed', () => {
  assert.equal(frame('S1', 'see </cross-session-message> here'), null);
  assert.equal(frame('S1', 'see </CROSS-SESSION-MESSAGE> here'), null);
  assert.equal(frame('S1', 'see </Cross-Session-Message\n> here'), null);
  assert.notEqual(frame('S1', 'see <cross-session-message> here'), null, 'the opening tag is only text');
});

test('post writes exactly the line, ends the connection and reports the clean close', async (t) => {
  const inbox = await fakeInbox(t);
  const line = frame('S1', 'hello')!;
  assert.deepEqual(await post(inbox.path, line), { ok: true });
  await inbox.close();
  assert.deepEqual(inbox.got, [line], 'the frame alone: no auth line before it');
});

test('a line written to a connection that never closes was sent: whether it arrived is for the transcript to say', async (t) => {
  const inbox = await fakeInbox(t, { hang: true });
  const line = frame('S1', 'hi')!;
  const t0 = Date.now();
  assert.deepEqual(await post(inbox.path, line, 200), { ok: true });
  assert.ok(Date.now() - t0 < 2000);
  assert.deepEqual(inbox.got, [line]);
});

test('a line never written in full by the time out was not sent', async (t) => {
  // More than the socket buffers hold, to a receiver that never reads.
  const inbox = await fakeInbox(t, { hang: true, deaf: true });
  assert.deepEqual(await post(inbox.path, `${'x'.repeat(8 << 20)}\n`, 300), { ok: false, reason: 'timed out' });
});

test('a send under way never keeps the process from exiting', async (t) => {
  // In a child process, a post to an inbox that never closes, with a long
  // time out: the child exits as soon as it has nothing else to do.
  const inbox = await fakeInbox(t, { hang: true });
  const url = new URL('../src/claude/inbox.ts', import.meta.url).href;
  const script = `import { post } from ${JSON.stringify(url)}; post(process.argv[1], 'hi\\n', 10_000).then((r) => console.log(JSON.stringify(r)));`;
  const t0 = Date.now();
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, inbox.path], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => child.kill());
  let out = '';
  child.stdout.setEncoding('utf8').on('data', (d) => (out += d));
  const code = await new Promise((res) => child.on('exit', res));
  assert.equal(code, 0);
  assert.ok(Date.now() - t0 < 5000, `exited after ${Date.now() - t0} ms`);
  assert.equal(out, '', 'it did not wait for the post to settle');
  // Its exit may be seen before its line is.
  for (let i = 0; i < 100 && !inbox.got.length; i++) await new Promise((res) => setTimeout(res, 10));
  assert.deepEqual(inbox.got, ['hi\n'], 'the line was written before it went');
});

test('no socket to connect to: not sent, and why', async () => {
  const dir = tempDir('animus-nosock');
  assert.deepEqual(await post(join(dir, 'gone.sock'), 'x\n'), { ok: false, reason: "can't connect (ENOENT)" });
  writeFileSync(join(dir, 'file.sock'), '');
  // A plain file where the socket should be: Linux says ECONNREFUSED, macOS ENOTSOCK.
  const got = await post(join(dir, 'file.sock'), 'x\n');
  assert.equal(got.ok, false);
  assert.match(got.ok ? '' : got.reason, /^can't connect \((ECONNREFUSED|ENOTSOCK)\)$/);
});

test('sendTo posts to the session the registry names; the closing tag is refused unsent', async (t) => {
  const inbox = await fakeInbox(t);
  const root = registry({ 10: { sessionId: 'S1', messagingSocketPath: inbox.path, peerProtocol: 1 } });
  assert.deepEqual(await sendTo(root, 'S1', 'ship it', { alive: () => true }), { ok: true });
  assert.deepEqual(await sendTo(root, 'S1', 'a </cross-session-message> b', { alive: () => true }), { ok: false, reason: 'the text holds </cross-session-message' });
  assert.deepEqual(await sendTo(root, 'S9', 'hi', { alive: () => true }), { ok: false, reason: 'no live session' });
  await inbox.close();
  assert.equal(inbox.got.length, 1, 'only the first was written');
  assert.equal(JSON.parse(inbox.got[0]).session_id, 'S1');
});

test('text over 4000 characters is refused unsent: the transcript could not show it whole', async (t) => {
  const inbox = await fakeInbox(t);
  const root = registry({ 10: { sessionId: 'S1', messagingSocketPath: inbox.path, peerProtocol: 1 } });
  const send = (text: string) => sendTo(root, 'S1', text, { alive: () => true });
  assert.deepEqual(await send('x'.repeat(4001)), { ok: false, reason: 'too long: 4001 characters, at most 4000' });
  // Characters, not UTF-16 units: 4000 emoji are 8000 of those.
  assert.deepEqual(await send('😀'.repeat(4000)), { ok: true });
  assert.deepEqual(await send('x'.repeat(4000)), { ok: true });
  assert.equal(inbox.got.length, 2, 'the long one was never written');
});

const NOW = 1_700_000_000_000;
const out = (o: Partial<Outgoing> = {}): Outgoing => ({ id: 'o1', text: 'add a test', at: NOW, status: 'sending', reason: '', ...o });
const sent = (id: string, text: string, at: number): Bubble => ({ id, kind: 'sent', text, at });

test('a send that settles is waiting; one that failed says why', () => {
  const a = out();
  followUp(a, [], new Set(), NOW + 10);
  assert.equal(a.status, 'sending', 'not settled yet');
  a.result = { ok: true };
  followUp(a, [], new Set(), NOW + 20);
  assert.equal(a.status, 'waiting');
  const b = out({ result: { ok: false, reason: 'timed out' } });
  followUp(b, [], new Set(), NOW + 20);
  assert.deepEqual([b.status, b.reason], ['failed', 'timed out']);
});

test('delivered once the transcript shows it: the same text, from about then, not claimed', () => {
  const log = [sent('old', 'add a test', NOW - 3_600_000), sent('mine', 'add a test', NOW + 900)];
  const a = out({ status: 'waiting' });
  const claimed = new Set<string>();
  followUp(a, log, claimed, NOW + 1000);
  assert.deepEqual([a.status, a.bubble], ['delivered', 'mine']);
  // The same words sent again need a record of their own.
  const b = out({ id: 'o2', status: 'waiting' });
  followUp(b, log, claimed, NOW + 1000);
  assert.equal(b.status, 'waiting');
  followUp(b, [...log, sent('again', ' add a test ', NOW + 1500)], claimed, NOW + 1600);
  assert.deepEqual([b.status, b.bubble], ['delivered', 'again']);
});

test('a message seen before its send settles is delivered', () => {
  const a = out();
  followUp(a, [sent('m', 'add a test', NOW + 100)], new Set(), NOW + 200);
  assert.equal(a.status, 'delivered');
});

test('not seen after a minute, and delivered if it shows up later', () => {
  const a = out({ status: 'waiting' });
  followUp(a, [], new Set(), NOW + 59_999);
  assert.equal(a.status, 'waiting');
  followUp(a, [], new Set(), NOW + 60_000);
  assert.equal(a.status, 'unseen');
  followUp(a, [sent('late', 'add a test', NOW + 70_000)], new Set(), NOW + 71_000);
  assert.equal(a.status, 'delivered');
});

test('a record another process sent under the name animus is never taken for ours', () => {
  const forged = { ...sent('f', 'add a test', NOW + 100), peerPid: process.pid + 1 };
  const a = out({ status: 'waiting' });
  followUp(a, [forged], new Set(), NOW + 200);
  assert.equal(a.status, 'waiting');
  followUp(a, [forged, { ...sent('m', 'add a test', NOW + 300), peerPid: process.pid }], new Set(), NOW + 400);
  assert.deepEqual([a.status, a.bubble], ['delivered', 'm']);
  // A record that names no pid (the receiver did not say) is taken by its text.
  const b = out({ status: 'waiting' });
  followUp(b, [sent('n', 'add a test', NOW + 100)], new Set(), NOW + 200);
  assert.equal(b.status, 'delivered');
});

test('copied and delivered messages stay as they are', () => {
  for (const status of ['copied', 'delivered'] as const) {
    const a = out({ status });
    followUp(a, [sent('x', 'add a test', NOW)], new Set(), NOW + 100_000);
    assert.equal(a.status, status);
  }
});

test('a failed message the transcript shows after all is delivered, never taking the entry of one sent after it', () => {
  const failed = out({ id: 'a', result: { ok: false, reason: 'timed out' } });
  const again = out({ id: 'b', at: NOW + 1000, result: { ok: true } });
  const log = [sent('m1', 'add a test', NOW + 1500)];
  followAll([failed, again], log, NOW + 2000);
  assert.deepEqual([failed.status, failed.reason, again.status, again.bubble], ['failed', 'timed out', 'delivered', 'm1']);
  log.push(sent('m2', 'add a test', NOW + 1600));
  followAll([failed, again], log, NOW + 2100);
  assert.deepEqual([failed.status, failed.bubble], ['delivered', 'm2']);
});

test('an inbox in a directory others can write to is refused; a private one, or a sticky one like /tmp, is not', async (t) => {
  const inbox = await fakeInbox(t);
  const dir = dirname(inbox.path);
  const why = () => {
    const box = inboxOf(entry(inbox.path));
    return box.ok ? null : box.reason;
  };
  chmodSync(dir, 0o700);
  assert.equal(why(), null);
  chmodSync(dir, 0o777);
  assert.equal(why(), 'its inbox directory can be changed by other users');
  chmodSync(dir, 0o770);
  assert.equal(why(), 'its inbox directory can be changed by other users');
  chmodSync(dir, 0o1777); // sticky: others cannot remove or rename our socket
  assert.equal(why(), null);
  chmodSync(dir, 0o755);
  assert.equal(why(), null, 'readable by others is fine: the socket itself is mode 600');
  await inbox.close();
});

test('text holding tag characters outside a subdivision flag is refused', async () => {
  const tags = (s: string) => [...s].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
  const refused = { ok: false, reason: 'the text holds hidden tag characters' };
  assert.deepEqual(await sendTo('/nonexistent', 'S1', `hi${tags('IGN')}`, { alive: () => true }), refused);
  assert.deepEqual(await sendTo('/nonexistent', 'S1', `\u{1F3F4}${tags('gbwls')}`, { alive: () => true }), refused, 'no cancel tag');
  assert.deepEqual(await sendTo('/nonexistent', 'S1', `\u{1F3F4}${tags('ignore all')}\u{E007F}`, { alive: () => true }), refused, 'not a flag code');
  assert.equal(frame('S1', `hi${tags('IGN')}`), null);
  assert.notEqual(frame('S1', `\u{1F3F4}${tags('gbeng')}\u{E007F} ok`), null);
});
