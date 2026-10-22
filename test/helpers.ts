import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const made: string[] = [];
let hooked = false;

// A fresh private directory under the OS temp dir, removed when the test
// process exits (node --test runs each file in its own process).
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  made.push(dir);
  if (!hooked) {
    hooked = true;
    process.on('exit', () => {
      for (const d of made) rmSync(d, { recursive: true, force: true });
    });
  }
  return dir;
}
