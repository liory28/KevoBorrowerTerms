// Background function: AI first-pass check of a document the borrower (or team) uploaded for a condition,
// then a heads-up email to whoever receives that condition. Up to 15 minutes on Netlify.
import { getLoan, updateLoan, files } from './lib/store.mjs';
import { jobKey } from './lib/auth.mjs';
import { checkDocument, uploadKey } from './lib/uploads.mjs';
import { deliver, approverRecipients, esc } from './lib/email.mjs';

const VERDICT = { looks_good: 'Looks good', needs_attention: 'Possible issue', cant_tell: 'AI couldn’t tell' };

export default async (req) => {
  let b = {};
  try { b = await req.json(); } catch { /* ignore */ }
  if (!process.env.APP_SECRET || !b.id || !b.uid || b.key !== jobKey(`${b.id}:${b.uid}`, 'upload')) return new Response('forbidden', { status: 403 });
  const loan = await getLoan(b.id);
  const cond = loan?.approval?.conditions?.find((c) => (c.uploads || []).some((u) => u.id === b.uid));
  const up = cond?.uploads.find((u) => u.id === b.uid);
  if (!up || up.deletedAt) return new Response('gone', { status: 200 });
  let ai;
  try {
    const bytes = await files().get(uploadKey(b.id, b.uid), { type: 'arrayBuffer' });
    if (!bytes) throw new Error('The file could not be found.');
    ai = { state: 'done', ...(await checkDocument({ bytes: new Uint8Array(bytes), mime: up.mime, name: up.name, condition: cond, borrowerName: loan.inputs?.borrowerName, property: loan.worksheet?.header?.property })), at: new Date().toISOString() };
  } catch (e) {
    console.error('[upload check]', e);
    ai = /No AI key/.test(e.message) ? { state: 'off', at: new Date().toISOString() } : { state: 'failed', error: String(e.message || e).slice(0, 300), at: new Date().toISOString() };
  }
  await updateLoan(b.id, (l) => {
    const u = l.approval?.conditions?.flatMap((c) => c.uploads || []).find((x) => x.id === b.uid);
    if (!u) return { error: 'gone' };
    u.ai = ai;
  });
  if (b.notify !== false) await notifyReceiver(req, loan, cond, up, ai);
  return new Response('done', { status: 200 });
};

async function notifyReceiver(req, loan, cond, up, ai) {
  const to = cond.receiver === 'processor' && loan.inputs?.processorEmail ? [loan.inputs.processorEmail] : approverRecipients();
  const site = (process.env.SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
  const verdict = ai.state === 'done' ? VERDICT[ai.verdict] : 'AI check didn’t run';
  const html = `<p><b>${esc(loan.inputs?.borrowerName || 'The borrower')}</b> uploaded <b>${esc(up.name)}</b> for condition #${esc(cond.num)}: ${esc(cond.plain)}</p>
    <p><b>AI first check: ${esc(verdict)}.</b>${ai.summary ? ` ${esc(ai.summary)}` : ''}</p>
    ${(ai.issues || []).length ? `<ul>${ai.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <p>Please review it and accept it or send it back: <a href="${site}/#/loan/${loan.id}">open the loan</a>. The file itself stays in the portal.</p>`;
  const e = await deliver({ type: 'upload_review', to, subject: `Document to review: #${cond.num} for ${loan.inputs?.borrowerName || 'borrower'} (${verdict})`, html });
  await updateLoan(loan.id, (l) => { l.notifications = (l.notifications || []).slice(-200); l.notifications.push(e); });
}
