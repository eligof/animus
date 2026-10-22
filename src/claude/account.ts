import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type Account = { name: string; plan: string };

// Only the display name and plan label leave this function; tokens and other
// account fields are never copied out of the parsed JSON.
export function readAccount(root: string): Account | null {
  for (const p of [join(root, '.claude.json'), join(dirname(root), '.claude.json')]) {
    let raw: string;
    try {
      raw = readFileSync(p, 'utf8');
    } catch {
      continue; // try the next location
    }
    // The first config that exists decides: falling through could show a
    // different profile's account.
    let data: { oauthAccount?: Record<string, unknown> };
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
    const oa = data.oauthAccount;
    if (!oa || typeof oa !== 'object') return null;
    const full = typeof oa.fullName === 'string' ? oa.fullName.split(' ')[0] : '';
    const name = typeof oa.displayName === 'string' && oa.displayName ? oa.displayName : full || 'you';
    const plan = typeof oa.seatTier === 'string' && oa.seatTier ? oa.seatTier : oa.billingType ? 'subscription' : '';
    return { name, plan };
  }
  return null;
}
