import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findings } from '../scripts/sarif-gate.ts';
import { tempDir } from './helpers.ts';

const result = (ruleId: string, uri: string, line: number, suppressed = false) => ({
  ruleId,
  message: { text: `${ruleId} here` },
  locations: [{ physicalLocation: { artifactLocation: { uri }, region: { startLine: line } } }],
  ...(suppressed ? { suppressions: [{ kind: 'external' }] } : {}),
});

const sarif = (...results: unknown[]) => ({ version: '2.1.0', runs: [{ tool: { driver: { name: 'CodeQL' } }, results }] });

test('findings lists unsuppressed results with locations', () => {
  const f = findings(sarif(result('js/a', 'src/x.ts', 3), result('js/b', 'src/y.ts', 9, true)));
  assert.deepEqual(f, [{ ruleId: 'js/a', file: 'src/x.ts', line: 3, message: 'js/a here' }]);
});

test('findings tolerates empty and odd documents', () => {
  assert.deepEqual(findings({}), []);
  assert.deepEqual(findings({ runs: [{}] }), []);
  assert.deepEqual(findings(sarif({ ruleId: 'js/c' })), [{ ruleId: 'js/c', file: '', line: 1, message: '' }]);
});

function dirWith(doc: unknown): string {
  const dir = tempDir('animus-sarif');
  writeFileSync(join(dir, 'javascript.sarif'), JSON.stringify(doc));
  return dir;
}

const gate = (dir: string) => spawnSync(process.execPath, ['scripts/sarif-gate.ts', dir], { encoding: 'utf8' });

test('gate exits 1 and annotates when there are findings', () => {
  const r = gate(dirWith(sarif(result('js/insecure-temporary-file', 'src/a.ts', 12))));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error file=src\/a\.ts,line=12::js\/insecure-temporary-file/);
  assert.match(r.stdout, /1 CodeQL finding/);
});

test('gate exits 0 on a clean scan', () => {
  const r = gate(dirWith(sarif()));
  assert.equal(r.status, 0);
  assert.match(r.stdout, /0 CodeQL findings/);
});

test('gate fails when no SARIF was produced', () => {
  const r = gate(tempDir('animus-sarif-empty'));
  assert.equal(r.status, 2);
});
