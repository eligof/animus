import type { Activity } from '../agents.ts';
import { cellSafe } from '../term/width.ts';

const WRITE = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ = new Set(['Read', 'NotebookRead']);
const SEARCH = new Set(['Grep', 'Glob', 'LS', 'ToolSearch']);
const WEB = new Set(['WebFetch', 'WebSearch']);
const DELEGATE = new Set(['Agent', 'Task', 'Workflow', 'SendMessage', 'Skill']);
const TALK = new Set(['AskUserQuestion', 'ExitPlanMode']);
const PLAN = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'EnterPlanMode']);

export function toolActivity(name: string): Activity {
  if (WRITE.has(name)) return 'write';
  if (READ.has(name) || name.startsWith('ReadMcpResource') || name.startsWith('ListMcpResources')) return 'read';
  if (SEARCH.has(name)) return 'search';
  if (WEB.has(name) || name.startsWith('mcp__')) return 'web';
  if (DELEGATE.has(name)) return 'delegate';
  if (TALK.has(name)) return 'talk';
  if (PLAN.has(name)) return 'think';
  return 'run';
}

// Transcript text is untrusted (it can contain web content): no escape
// sequences may reach the terminal and every glyph must be one cell wide.
export function sanitize(s: string): string {
  let out = '';
  for (const ch of s) out += cellSafe(ch);
  return out;
}

export function clip(s: string, n: number): string {
  if (n <= 0) return '';
  const line = sanitize((String(s).split('\n').find((l) => l.trim() !== '') ?? '')).trim();
  if (line.length <= n) return line;
  let cut = line.slice(0, n - 1);
  const space = cut.lastIndexOf(' ');
  if (space >= n * 0.6) cut = cut.slice(0, space);
  return cut.trimEnd() + '…';
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

function host(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return clip(url, 30);
  }
}

function describe(name: string, input: Record<string, unknown>): string {
  if (WRITE.has(name) || READ.has(name)) {
    const file = str(input.file_path) || str(input.notebook_path);
    return file ? `${name} ${base(file)}` : name;
  }
  switch (name) {
    case 'Bash':
    case 'PowerShell':
      return input.command ? `$ ${clip(str(input.command), 44)}` : name;
    case 'Grep':
      return input.pattern ? `Grep "${clip(str(input.pattern), 30)}"` : name;
    case 'Glob':
      return input.pattern ? `Glob ${clip(str(input.pattern), 36)}` : name;
    case 'LS':
      return input.path ? `ls ${base(str(input.path))}` : 'ls';
    case 'ToolSearch':
      return input.query ? `tools "${clip(str(input.query), 30)}"` : name;
    case 'WebFetch':
      return input.url ? `fetch ${host(str(input.url))}` : name;
    case 'WebSearch':
      return input.query ? `search "${clip(str(input.query), 34)}"` : name;
    case 'Agent':
    case 'Task':
      return `→ ${str(input.subagent_type) || clip(str(input.description), 30) || 'agent'}`;
    case 'Skill':
      return input.skill ? `skill ${str(input.skill)}` : name;
    case 'SendMessage':
      return input.to ? `msg → ${str(input.to)}` : name;
    case 'Workflow':
      return 'workflow';
    case 'AskUserQuestion':
      return 'asking you…';
    case 'ExitPlanMode':
      return 'plan ready';
  }
  if (PLAN.has(name)) return 'planning';
  if (name.startsWith('mcp__')) {
    const [, server = '', ...rest] = name.split('__');
    return `${server.replace(/^claude_ai_/, '').replace(/^plugin_[^_]+_/, '')} ${rest.join('__')}`.trim();
  }
  return name;
}

export function toolDetail(name: string, input: Record<string, unknown>): string {
  return clip(describe(name, input ?? {}), 48);
}
