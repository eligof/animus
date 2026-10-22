// Fails CI on CodeQL findings without uploading them (code scanning uploads
// need GitHub Advanced Security, which this private repository lacks).
//
//   node scripts/sarif-gate.ts <dir-with-.sarif-files>
//
// Exit 0: clean. Exit 1: findings (printed as GitHub error annotations).
// Exit 2: no SARIF found, so the analysis did not really run.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Finding = { ruleId: string; file: string; line: number; message: string };

type SarifResult = {
  ruleId?: string;
  message?: { text?: string };
  suppressions?: unknown[];
  locations?: Array<{ physicalLocation?: { artifactLocation?: { uri?: string }; region?: { startLine?: number } } }>;
};

export function findings(doc: unknown): Finding[] {
  const runs = (doc as { runs?: Array<{ results?: SarifResult[] }> })?.runs ?? [];
  const out: Finding[] = [];
  for (const run of runs) {
    for (const r of run?.results ?? []) {
      if (r.suppressions?.length) continue;
      const loc = r.locations?.[0]?.physicalLocation;
      out.push({
        ruleId: r.ruleId ?? 'unknown',
        file: loc?.artifactLocation?.uri ?? '',
        line: loc?.region?.startLine ?? 1,
        message: r.message?.text ?? '',
      });
    }
  }
  return out;
}

function main(dir: string): number {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.sarif'));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    console.log(`::error::no SARIF files in ${dir}; CodeQL did not produce results`);
    return 2;
  }
  const all = files.flatMap((f) => findings(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
  for (const f of all) {
    const text = f.message.replace(/\r?\n/g, ' ');
    console.log(`::error file=${f.file},line=${f.line}::${f.ruleId}: ${text}`);
  }
  console.log(`${all.length} CodeQL finding${all.length === 1 ? '' : 's'}`);
  return all.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv[2] ?? 'sarif-results');
}
