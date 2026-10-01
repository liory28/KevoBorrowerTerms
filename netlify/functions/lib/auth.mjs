import crypto from 'node:crypto';

const SECRET = () => process.env.APP_SECRET || '';
const hmac = (v) => crypto.createHmac('sha256', SECRET()).update(v).digest('base64url');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function approverEnabled() { return Boolean(process.env.APPROVER_PASSWORD); }

export function checkPassword(role, password) {
  const expected = role === 'approver' ? process.env.APPROVER_PASSWORD : role === 'team' ? process.env.TEAM_PASSWORD : null;
  return Boolean(expected) && safeEq(password || '', expected);
}

export function makeSessionCookie(role, name, secure) {
  const exp = Date.now() + 12 * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ role, name: String(name || '').slice(0, 60), exp })).toString('base64url');
  const token = `${payload}.${hmac(payload)}`;
  return `tt_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure ? '; Secure' : ''}`;
}
export const clearCookie = 'tt_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure';

export function session(req) {
  if (!SECRET()) return null;
  const raw = req.headers.get('cookie') || '';
  const m = raw.match(/(?:^|;\s*)tt_session=([^;]+)/);
  if (!m) return null;
  const [payload, sig] = decodeURIComponent(m[1]).split('.');
  if (!payload || !sig || !safeEq(sig, hmac(payload))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!s.exp || Date.now() > s.exp) return null;
    if (!['team', 'approver'].includes(s.role)) return null;
    return s;
  } catch { return null; }
}

// Approver-only actions fall back to the team login when no approver password is configured.
export function canApprove(s) { return Boolean(s) && (s.role === 'approver' || !approverEnabled()); }
