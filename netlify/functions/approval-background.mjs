// Background function (name ends in "-background", so Netlify gives it up to 15 minutes).
// Reads an uploaded underwriting approval with AI and saves the conditions checklist on the loan.
import { getLoan, updateLoan, files } from './lib/store.mjs';
import { jobKey } from './lib/auth.mjs';
import { readApproval, normalizeApproval } from './lib/approval-ai.mjs';
import { getFormat } from './lib/formats.mjs';

export default async (req) => {
  let b = {};
  try { b = await req.json(); } catch { /* ignore */ }
  if (!process.env.APP_SECRET || !b.id || !b.job || b.key !== jobKey(b.id, b.job)) return new Response('forbidden', { status: 403 });
  const loan = await getLoan(b.id);
  if (!loan || loan.approval?.job !== b.job) return new Response('stale', { status: 200 });
  const v = (loan.versions || []).find((x) => x.v === loan.version);
  try {
    const text = await files().get(loan.approval.textKey, { type: 'text' });
    if (!text) throw new Error('The approval text could not be found. Please upload it again.');
    const fmt = await getFormat('approval');
    const out = await readApproval(text, { lang: loan.inputs?.language, loName: loan.inputs?.loName, processorName: loan.inputs?.processorName, confirmed: v?.terms, formatNotes: fmt.notes });
    await updateLoan(b.id, (l) => {
      if (l.approval?.job !== b.job) return { error: 'stale' };
      const norm = normalizeApproval(out.data, l.approvalPrevious);
      // Files uploaded for conditions that are no longer on the approval: keep track of them so closing still deletes them.
      const kept = new Set(norm.conditions.flatMap((c) => (c.uploads || []).map((u) => u.id)));
      const dropped = (l.approvalPrevious?.conditions || []).flatMap((c) => (c.uploads || []).map((u) => ({ ...u, condNum: c.num }))).filter((u) => !kept.has(u.id));
      if (dropped.length) l.orphanUploads = [...(l.orphanUploads || []), ...dropped];
      l.approval = { ...l.approval, ...norm, status: 'done', error: null, processedAt: new Date().toISOString(), provider: out.provider };
      const open = norm.conditions.filter((c) => c.status !== 'cleared').length;
      // Fill the processor's name/email from the approval when the team hasn't entered them.
      const pc = norm.facts.contacts?.processor;
      if (pc?.name && !l.inputs.processorName) l.inputs.processorName = pc.name;
      if (pc?.email && !l.inputs.processorEmail) l.inputs.processorEmail = pc.email;
      l.events = l.events || [];
      l.events.push({ at: new Date().toISOString(), by: 'system', type: 'approval_read', text: `Approval read: ${norm.conditions.length} conditions (${open} open)${norm.facts.restructureRequired ? '. Restructure indicated: ' + norm.facts.restructureNotes : ''}${norm.removedSincePrevious.length ? `. No longer listed: #${norm.removedSincePrevious.join(', #')}` : ''}.` });
    });
  } catch (e) {
    console.error('[approval-background]', e);
    await updateLoan(b.id, (l) => {
      if (l.approval?.job !== b.job) return { error: 'stale' };
      l.approval = { ...l.approval, status: 'failed', error: e.message || 'Could not read the approval.' };
    });
  }
  return new Response('done', { status: 200 });
};
