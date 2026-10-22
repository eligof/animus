import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolActivity, toolDetail, clip } from '../src/claude/activity.ts';
import { ACTIVITIES } from '../src/agents.ts';

test('tools map to activities', () => {
  const table: Record<string, string> = {
    Edit: 'write', Write: 'write', MultiEdit: 'write', NotebookEdit: 'write',
    Read: 'read', NotebookRead: 'read',
    Grep: 'search', Glob: 'search', LS: 'search', ToolSearch: 'search',
    Bash: 'run', BashOutput: 'run', Monitor: 'run', KillShell: 'run',
    WebFetch: 'web', WebSearch: 'web', mcp__x__y: 'web',
    Agent: 'delegate', Task: 'delegate', Workflow: 'delegate', SendMessage: 'delegate', Skill: 'delegate',
    Frobnicate: 'run',
  };
  for (const [tool, act] of Object.entries(table)) assert.equal(toolActivity(tool), act, tool);
});

test('ACTIVITIES lists every activity once', () => {
  assert.equal(new Set(ACTIVITIES).size, ACTIVITIES.length);
  assert.ok(ACTIVITIES.includes('done') && ACTIVITIES.includes('idle'));
});

test('tool details are short and human', () => {
  assert.equal(toolDetail('Edit', { file_path: '/a/b/cli.ts' }), 'Edit cli.ts');
  assert.equal(toolDetail('Read', { file_path: '/a/README.md' }), 'Read README.md');
  assert.equal(toolDetail('Bash', { command: 'git status\nls' }), '$ git status');
  assert.equal(toolDetail('Grep', { pattern: 'TODO' }), 'Grep "TODO"');
  assert.equal(toolDetail('Glob', { pattern: '**/*.ts' }), 'Glob **/*.ts');
  assert.equal(toolDetail('WebFetch', { url: 'https://docs.x.com/a' }), 'fetch docs.x.com');
  assert.equal(toolDetail('WebSearch', { query: 'q' }), 'search "q"');
  assert.equal(toolDetail('Agent', { subagent_type: 'Explore', description: 'look' }), '→ Explore');
  assert.equal(toolDetail('Agent', { description: 'look around' }), '→ look around');
  assert.equal(toolDetail('Skill', { skill: 'superpowers:brainstorming' }), 'skill superpowers:brainstorming');
  assert.equal(toolDetail('mcp__claude_ai_Firecrawl__firecrawl_search', {}), 'Firecrawl firecrawl_search');
  assert.equal(toolDetail('Frobnicate', {}), 'Frobnicate');
  assert.equal(toolDetail('Edit', {}), 'Edit');
});

test('clip keeps first line and adds ellipsis', () => {
  assert.equal(clip('abcdef', 4), 'abc…');
  assert.equal(clip('  hi\nthere', 10), 'hi');
  assert.equal(clip('abc', 3), 'abc');
  assert.equal(clip('Review rocket fuel module', 18), 'Review rocket…');
  assert.equal(clip('x', 0), '');
});

test('conversation and planning tools', () => {
  assert.equal(toolActivity('AskUserQuestion'), 'talk');
  assert.equal(toolDetail('AskUserQuestion', {}), 'asking you…');
  assert.equal(toolActivity('TodoWrite'), 'think');
  assert.equal(toolActivity('TaskCreate'), 'think');
  assert.equal(toolDetail('TodoWrite', {}), 'planning');
  assert.equal(toolActivity('ExitPlanMode'), 'talk');
});

test('sanitize strips controls, bidi and zero-width, replaces wide glyphs', async () => {
  const { sanitize } = await import('../src/claude/activity.ts');
  assert.equal(sanitize('a\x1b]0;x\x07b'), 'a]0;xb');
  assert.equal(sanitize('tab\there'), 'tab here');
  assert.equal(sanitize('x‮y​z'), 'xyz');
  assert.equal(sanitize('é'), 'e');
  assert.equal(sanitize('漢😀ok'), '??ok');
  assert.equal(sanitize('\x9b31m'), '31m');
});

test('sanitize drops tag characters, format characters and medial jamo', async () => {
  const { sanitize } = await import('../src/claude/activity.ts');
  assert.equal(sanitize('a\u{E0041}\u{E007F}b'), 'ab');
  assert.equal(sanitize('xᅡᆨy'), 'xy');
  assert.equal(sanitize('soft­hyphen⁡'), 'softhyphen');
});
