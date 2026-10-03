// Borrower document uploads per condition: storage, type checks, the AI first-pass check, and cleanup at closing.
// Files live in the private "terms-files" store under <loanId>/uploads/<uploadId> and are only served to the
// logged-in team. They are deleted when the loan is marked closed (the record of what was uploaded stays).
import crypto from 'node:crypto';
import { files } from './store.mjs';
import { callAIJsonWithFile, pickProvider } from './ai.mjs';

export const MAX_UPLOAD = 5 * 1024 * 1024; // Netlify request bodies top out around 6 MB
export const MAX_PER_CONDITION = 15, MAX_PER_LOAN = 80;
const AI_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const newUploadId = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
export const uploadKey = (loanId, uid) => `${loanId}/uploads/${uid}`;

// Trust the file's bytes, not its name or the browser's label.
export function sniff(bytes) {
  const b = Buffer.from(bytes.subarray(0, 12));
  if (b.subarray(0, 4).toString() === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (b.subarray(4, 8).toString() === 'ftyp' && /heic|heix|mif1|msf1|heif/.test(b.subarray(8, 12).toString())) return { mime: 'image/heic', ext: 'heic' };
  return null;
}

export const cleanName = (n, ext) => {
  const base = String(n || '').replace(/[\\/\r\n\t"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || `document.${ext}`;
  return base;
};

const SYSTEM = `You do a quick first check of a document a mortgage borrower uploaded to satisfy one underwriting condition.
Look at the document and decide whether it appears to satisfy the condition as written. You are a helper, not the underwriter: a team member reviews every document after you.
Check the obvious things: is it the right kind of document; does it look complete (all pages, e.g. "Page 3 of 4" when only some pages are present); is it recent enough or the right period if the condition says so; is it for the right person/property when that's visible; is it readable (not blurry, cut off, or a photo of a screen at an angle); is it signed if the condition asks for a signature.
Do not judge things you can't see. If you are not sure, say "cant_tell" rather than guessing.
Never copy full account numbers, Social Security numbers or other ID numbers into your answer (last 4 digits at most).
Return JSON only:
{"verdict": "looks_good" | "needs_attention" | "cant_tell",
 "summary": "1-2 sentences for the loan team: what the document is (type, who, dates/period, pages) and whether it fits",
 "issues": ["short, specific problems for the loan team, empty if none"],
 "borrower_message": "1-2 short, friendly sentences to the borrower in plain English. If something obvious needs fixing, say exactly what to upload instead. If it looks fine, thank them. No jargon.",
 "borrower_message_he": "the same message in natural Hebrew"}`;

export async function checkDocument({ bytes, mime, name, condition, borrowerName, property }) {
  if (process.env.MOCK_AI) {
    const bad = /bad|blurry|partial/i.test(name || '');
    return bad
      ? { verdict: 'needs_attention', summary: 'Bank statement, pages 1-2 of 4.', issues: ['Pages 3 and 4 are missing.'], borrowerMessage: 'It looks like pages 3 and 4 are missing. Please upload the full statement, including blank pages.', borrowerMessageHe: 'נראה שחסרים עמודים 3 ו-4. נא להעלות את הדוח המלא, כולל עמודים ריקים.', provider: 'mock' }
      : { verdict: 'looks_good', summary: 'Bank statement, all 4 pages, most recent month.', issues: [], borrowerMessage: 'Thanks! This looks right at first glance.', borrowerMessageHe: 'תודה! במבט ראשון זה נראה תקין.', provider: 'mock' };
  }
  if (!pickProvider()) throw new Error('No AI key is set.');
  if (mime !== 'application/pdf' && !AI_IMAGE.has(mime)) return { verdict: 'cant_tell', summary: 'This file type (for example an iPhone HEIC photo) can’t be checked automatically.', issues: [], borrowerMessage: '', borrowerMessageHe: '', provider: 'none' };
  const text = `Today's date: ${new Date().toISOString().slice(0, 10)}
Borrower: ${borrowerName || 'unknown'}${property ? `\nProperty: ${property}` : ''}
CONDITION (underwriter's wording): ${condition.original || condition.plain}
CONDITION (plain English): ${condition.plain}${condition.why ? `\nWhy underwriting asks: ${condition.why}` : ''}
File name: ${name}`;
  const out = await callAIJsonWithFile(SYSTEM, text, { bytes, mime, name });
  const d = out.data || {};
  const verdict = ['looks_good', 'needs_attention', 'cant_tell'].includes(d.verdict) ? d.verdict : 'cant_tell';
  const str = (v, m) => String(v || '').trim().slice(0, m);
  return {
    verdict, summary: str(d.summary, 500),
    issues: (Array.isArray(d.issues) ? d.issues : []).slice(0, 6).map((x) => str(x, 240)).filter(Boolean),
    borrowerMessage: str(d.borrower_message, 400), borrowerMessageHe: str(d.borrower_message_he, 400), provider: out.provider
  };
}

// Delete every uploaded file for a loan (used when the loan is marked closed). Returns how many were removed.
export async function deleteLoanUploads(loan) {
  let n = 0;
  const all = [...(loan.approval?.conditions || []).flatMap((c) => c.uploads || []), ...(loan.approvalPrevious?.conditions || []).flatMap((c) => c.uploads || []), ...(loan.orphanUploads || [])];
  const seen = new Set();
  for (const u of all) {
    if (seen.has(u.id)) continue; seen.add(u.id);
    if (u.deletedAt) continue;
    try { await files().delete(uploadKey(loan.id, u.id)); n++; } catch (e) { console.error('[delete upload]', e); }
  }
  return n;
}
