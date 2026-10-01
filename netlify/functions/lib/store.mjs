import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

// Tests can inject an in-memory store via globalThis.__TEST_STORES__.
function store(name) {
  if (globalThis.__TEST_STORES__) return globalThis.__TEST_STORES__(name);
  return getStore({ name, consistency: 'strong' });
}
export const loans = () => store('terms-loans');
export const tokens = () => store('terms-tokens');
export const files = () => store('terms-files');

export function newId() {
  // Time-ordered so the dashboard can list newest first from key order.
  return Date.now().toString(36).padStart(9, '0') + crypto.randomBytes(5).toString('hex');
}
export function newToken() { return crypto.randomBytes(24).toString('base64url'); }
export function hashToken(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }

export async function getLoan(id) {
  if (!/^[a-z0-9]{10,40}$/.test(String(id || ''))) return null;
  return loans().get(id, { type: 'json' });
}

// Read-modify-write with an etag check so two people (or a borrower and the team) can't
// overwrite each other's changes. `fn` mutates the loan; return false from it to abort.
export async function updateLoan(id, fn) {
  const st = loans();
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await st.getWithMetadata(id, { type: 'json' });
    if (!cur || !cur.data) return { error: 'not_found' };
    const loan = cur.data;
    const result = await fn(loan);
    if (result && result.error) return result;
    loan.updatedAt = new Date().toISOString();
    const w = await st.setJSON(id, loan, { onlyIfMatch: cur.etag });
    if (w && w.modified === false) { await new Promise((r) => setTimeout(r, 40 + attempt * 60)); continue; }
    return { loan, result };
  }
  return { error: 'conflict' };
}

export async function listLoans(limit = 200) {
  const st = loans();
  const { blobs } = await st.list();
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit);
  const out = [];
  for (const k of keys) { const l = await st.get(k, { type: 'json' }); if (l) out.push(l); }
  return out;
}
