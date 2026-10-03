// Single API function for the terms-confirmation portal. Routes live under /api/*.
import { buildTerms, scenario, fmt, r2 } from '../../public/js/calc.mjs';
import { loans, tokens, files, newId, newToken, hashToken, getLoan, updateLoan, listLoans } from './lib/store.mjs';
import { session, checkPassword, makeSessionCookie, clearCookie, canApprove, approverEnabled, jobKey } from './lib/auth.mjs';
import { deliver, borrowerEmail, copySubject, teamRecipients, approverRecipients, allInternal, esc, textToHtml, button } from './lib/email.mjs';
import { systemPrompt, askAI, aiConfigured, polishText, polishModes, toneKeys } from './lib/ai.mjs';
import { deliverSms, borrowerText, smsEnabled, normalizePhone } from './lib/sms.mjs';
import { PROVIDERS, RECEIVERS, TIMINGS, STATUSES } from './lib/approval-ai.mjs';
import { getAllFormats, saveFormat, resetFormat, FORMAT_KINDS } from './lib/formats.mjs';
import { createJob, jobsStore, JOB_KINDS } from './lib/jobs.mjs';
import { MAX_UPLOAD, MAX_PER_CONDITION, MAX_PER_LOAN, newUploadId, uploadKey, sniff, cleanName, deleteLoanUploads } from './lib/uploads.mjs';
import { draftsView, DRAFT_KINDS } from './lib/drafts.mjs';

export const config = { path: '/api/*' };

const EDITABLE = new Set(['draft', 'ready', 'discuss', 'uw_restructure', 'uw_declined']);
const SENDABLE = new Set(['draft', 'ready', 'discuss', 'uw_restructure', 'uw_declined']);
const MAX_PDF = 4 * 1024 * 1024;

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const err = (msg, status = 400) => json({ error: msg }, status);
const now = () => new Date().toISOString();
const siteUrl = (req) => (process.env.SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
const borrowerUrl = (req, token) => `${siteUrl(req)}/r/${token}`;
const loanUrl = (req, id) => `${siteUrl(req)}/#/loan/${id}`;

function event(loan, by, type, text, extra) {
  loan.events = loan.events || [];
  loan.events.push({ at: now(), by: by?.name ? `${by.name} (${by.role === 'approver' ? 'LO' : by.role})` : (by || 'system'), type, text: String(text || '').slice(0, 2000), ...(extra || {}) });
}

function computed(loan) {
  const { terms, checks } = buildTerms(loan.worksheet, loan.inputs);
  return { terms, checks, blocking: checks.filter((c) => c.level === 'block') };
}

function summary(l) {
  return { id: l.id, borrower: l.inputs?.borrowerName || l.worksheet?.header?.borrower || '', property: l.worksheet?.header?.property || '', loanNumber: l.worksheet?.header?.loanNumber || '', status: l.status, version: l.version || 0, updatedAt: l.updatedAt, response: l.response ? { action: l.response.action, at: l.response.at } : null, toReview: (l.approval?.conditions || []).flatMap((c) => c.uploads || []).filter((u) => !u.review && !u.deletedAt).length };
}

// What the borrower is allowed to see.
function borrowerView(loan, { preview = false } = {}) {
  const v = preview ? null : (loan.versions || []).find((x) => x.v === loan.version);
  const terms = preview ? computed(loan).terms : v?.terms;
  const stageByStatus = { sent: 'request', discuss: 'request', confirmed: 'request', uw_approved: 'approved', uw_restructure: 'restructure', uw_declined: 'restructure', locked: 'locked', closed: 'closed', draft: 'updating', ready: 'updating' };
  const stage = preview ? 'request' : (stageByStatus[loan.status] || 'request');
  const uw = loan.uw && ['uw_approved', 'uw_restructure', 'uw_declined', 'locked', 'closed'].includes(loan.status) ? {
    result: loan.uw.result, approvedLtv: loan.uw.approvedLtv ?? null, approvedLoanAmount: loan.uw.approvedLoanAmount ?? null,
    approvedRate: loan.uw.approvedRate ?? null, reason: loan.uw.reason || '', rateAtSubmission: terms?.rate ?? null
  } : null;
  const lock = ['locked', 'closed'].includes(loan.status) && loan.lock ? { rate: loan.lock.rate, expires: loan.lock.expires, payment: loan.lock.payment, conditions: loan.lock.conditions || [], items: borrowerItems(loan) } : null;
  return {
    stage, status: loan.status, version: loan.version || 0, preview,
    lang: loan.inputs?.language === 'he' ? 'he' : 'en',
    terms, uw, lock,
    response: preview ? null : (loan.response && loan.response.v === loan.version ? { action: loan.response.action, choices: loan.response.choices, at: loan.response.at, numbers: loan.response.numbers } : null),
    aiEnabled: aiConfigured()
  };
}

// The borrower's checklist: their items from the approval (plain English + why, with what they've uploaded),
// plus any extra lines the team added at lock.
function borrowerUploadView(u) {
  const ai = u.ai || {};
  return {
    id: u.id, name: u.name, at: u.at, fromTeam: u.byRole !== 'borrower', deleted: Boolean(u.deletedAt),
    ai: ai.state === 'done' ? { state: 'done', verdict: ai.verdict, message: ai.borrowerMessage || '', messageHe: ai.borrowerMessageHe || '' } : { state: ai.state || 'off' },
    review: u.review ? { decision: u.review.decision, reason: u.review.reason || '', reasonHe: u.review.reasonHe || '' } : null
  };
}
function borrowerItems(loan) {
  // While a newer approval is being read, keep showing the current checklist.
  const conds = loan.approval?.status === 'done' ? loan.approval.conditions : loan.approval?.status === 'processing' ? loan.approvalPrevious?.conditions : null;
  const fromApproval = conds ? (conds || []).filter((c) => c.borrowerVisible).map((c) => ({
    id: c.id, text: c.plain, why: c.why, textHe: c.plainHe || '', whyHe: c.whyHe || '', timing: c.timing,
    status: c.status, done: ['received', 'cleared'].includes(c.status), cleared: c.status === 'cleared',
    canUpload: loan.status === 'locked' && loan.approval?.status === 'done' && c.status !== 'cleared',
    uploads: (c.uploads || []).map(borrowerUploadView)
  })) : [];
  const extra = (loan.lock?.conditions || []).map((t) => ({ text: t, why: '', textHe: '', whyHe: '', timing: 'other', done: false, uploads: [] }));
  return [...fromApproval, ...extra];
}

async function record(id, entry, text) {
  await updateLoan(id, (l) => { l.notifications = (l.notifications || []).slice(-200); l.notifications.push(entry); if (text) event(l, 'system', 'email', text); });
}

async function readBody(req) { try { return await req.json(); } catch { return {}; } }

async function tokenLookup(t) {
  if (!t || typeof t !== 'string' || t.length < 20 || t.length > 80) return null;
  const rec = await tokens().get(hashToken(t), { type: 'json' });
  return rec || null;
}

// ---------------- Team handlers ----------------
async function createLoan(req, s) {
  const b = await readBody(req);
  if (!b.worksheet || !b.worksheet.header) return err('Upload a worksheet first.');
  let bytes = null;
  if (b.file?.base64) {
    bytes = Buffer.from(b.file.base64, 'base64');
    if (bytes.length > MAX_PDF) return err('The PDF must be 4 MB or smaller.', 413);
    if (bytes.subarray(0, 4).toString() !== '%PDF') return err('That file is not a PDF.');
  }
  const id = newId();
  const loan = {
    id, createdAt: now(), updatedAt: now(), createdBy: { name: s.name, role: s.role },
    status: 'draft', version: 0, worksheet: b.worksheet, inputs: sanitizeInputs(b.inputs || {}),
    sourceFile: bytes ? { name: String(b.file.name || 'worksheet.pdf').slice(0, 120), size: bytes.length, key: `${id}/1` } : null,
    versions: [], response: null, uw: null, lock: null, chat: [], events: [], notifications: [], views: []
  };
  event(loan, s, 'created', `Worksheet uploaded${loan.sourceFile ? ` (${loan.sourceFile.name})` : ''}.`);
  if (bytes) await files().set(loan.sourceFile.key, bytes, { metadata: { name: loan.sourceFile.name } });
  await loans().setJSON(id, loan);
  return json({ id });
}

const INPUT_KEYS = ['smsConsent', 'processorName', 'processorEmail', 'titleEmail', 'insuranceEmail', 'appraiserEmail', 'borrowerName', 'borrowerEmail', 'borrowerPhone', 'language', 'transaction', 'estimatedValue', 'lockStatus', 'foreignNational', 'pppYears', 'pppSchedule', 'interestOnly', 'ioYears', 'impounds', 'loName', 'calendlyUrl', 'noteToBorrower'];
function sanitizeInputs(x) {
  const o = {};
  for (const k of INPUT_KEYS) if (k in x) o[k] = x[k];
  const str = (v, n = 200) => (v === null || v === undefined ? '' : String(v).trim().slice(0, n));
  const numOrNull = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  if ('borrowerName' in o) o.borrowerName = str(o.borrowerName, 120);
  if ('borrowerEmail' in o) { o.borrowerEmail = str(o.borrowerEmail, 160); if (o.borrowerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.borrowerEmail)) o.borrowerEmail = ''; }
  if ('borrowerPhone' in o) o.borrowerPhone = str(o.borrowerPhone, 40);
  if ('language' in o) o.language = o.language === 'he' ? 'he' : 'en';
  if ('transaction' in o) o.transaction = o.transaction === 'refi' ? 'refi' : 'purchase';
  if ('estimatedValue' in o) o.estimatedValue = numOrNull(o.estimatedValue);
  if ('lockStatus' in o) o.lockStatus = o.lockStatus === 'locked' ? 'locked' : 'not_locked';
  if ('foreignNational' in o) o.foreignNational = Boolean(o.foreignNational);
  if ('pppYears' in o) o.pppYears = numOrNull(o.pppYears);
  if ('pppSchedule' in o) o.pppSchedule = str(o.pppSchedule, 120);
  if ('interestOnly' in o) o.interestOnly = Boolean(o.interestOnly);
  if ('ioYears' in o) o.ioYears = numOrNull(o.ioYears);
  if ('impounds' in o) o.impounds = ['included', 'not_included'].includes(o.impounds) ? o.impounds : 'auto';
  if ('loName' in o) o.loName = str(o.loName, 80);
  if ('calendlyUrl' in o) { o.calendlyUrl = str(o.calendlyUrl, 300); if (o.calendlyUrl && !/^https:\/\//.test(o.calendlyUrl)) o.calendlyUrl = ''; }
  if ('noteToBorrower' in o) o.noteToBorrower = str(o.noteToBorrower, 600);
  if ('smsConsent' in o) o.smsConsent = Boolean(o.smsConsent);
  if ('processorName' in o) o.processorName = str(o.processorName, 80);
  for (const k of ['processorEmail', 'titleEmail', 'insuranceEmail', 'appraiserEmail']) if (k in o) { o[k] = str(o[k], 160); if (o[k] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o[k])) o[k] = ''; }
  return o;
}

async function loanDetail(req, s, id) {
  const loan = await getLoan(id);
  if (!loan) return err('Not found', 404);
  const c = computed(loan);
  const cur = (loan.versions || []).find((x) => x.v === loan.version);
  return json({ loan, ...c, sentTerms: cur?.terms || null, scenarioNow: scenario(c.terms, {}), borrowerUrl: loan.currentToken ? borrowerUrl(req, loan.currentToken) : null, approvalDrafts: draftsView(loan, loan.currentToken ? borrowerUrl(req, loan.currentToken) : null), me: { ...s, canApprove: canApprove(s) }, aiEnabled: aiConfigured() || Boolean(process.env.MOCK_AI), emailEnabled: Boolean((process.env.RESEND_API_KEY && process.env.FROM_EMAIL) || process.env.MOCK_EMAIL), smsEnabled: smsEnabled() || Boolean(process.env.MOCK_SMS) });
}

async function saveInputs(req, s, id) {
  const b = await readBody(req);
  const r = await updateLoan(id, (loan) => {
    if (!EDITABLE.has(loan.status)) return { error: 'This loan is with the borrower. Use "Revise terms" first.' };
    const before = JSON.stringify(loan.inputs);
    loan.inputs = { ...loan.inputs, ...sanitizeInputs(b.inputs || {}) };
    if (JSON.stringify(loan.inputs) !== before) event(loan, s, 'edited', 'Loan details updated.');
  });
  if (r.error) return err(r.error === 'not_found' ? 'Not found' : r.error, r.error === 'not_found' ? 404 : 409);
  return json({ ok: true });
}

async function replaceWorksheet(req, s, id) {
  const b = await readBody(req);
  if (!b.worksheet?.header) return err('Upload a worksheet first.');
  let bytes = null;
  if (b.file?.base64) { bytes = Buffer.from(b.file.base64, 'base64'); if (bytes.length > MAX_PDF) return err('The PDF must be 4 MB or smaller.', 413); if (bytes.subarray(0, 4).toString() !== '%PDF') return err('That file is not a PDF.'); }
  let key = null;
  const r = await updateLoan(id, (loan) => {
    if (!EDITABLE.has(loan.status)) return { error: 'This loan is with the borrower. Use "Revise terms" first.' };
    loan.worksheet = b.worksheet;
    if (bytes) { const n = (Number(String(loan.sourceFile?.key || '').split('/')[1]) || 0) + 1; key = `${id}/${n}`; loan.sourceFile = { name: String(b.file.name || 'worksheet.pdf').slice(0, 120), size: bytes.length, key }; }
    event(loan, s, 'worksheet', `New worksheet uploaded${bytes ? ` (${loan.sourceFile.name})` : ''}.`);
  });
  if (r.error) return err(r.error, 409);
  if (bytes && key) await files().set(key, bytes, { metadata: { name: b.file.name } });
  return json({ ok: true });
}

async function markReady(req, s, id) {
  const r = await updateLoan(id, (loan) => {
    if (!['draft', 'discuss', 'uw_restructure', 'uw_declined'].includes(loan.status)) return { error: 'Only a draft can be marked ready.' };
    const c = computed(loan);
    if (c.blocking.length) return { error: 'Fix the required items first: ' + c.blocking.map((x) => x.text).join(' ') };
    loan.status = 'ready';
    event(loan, s, 'ready', 'Marked ready for the loan officer to review and send.');
  });
  if (r.error) return err(r.error, 409);
  const loan = r.loan;
  const e = await deliver({ type: 'ready_for_lo', to: approverRecipients(), subject: `Ready to send: ${loan.inputs.borrowerName || 'loan'} terms`, html: `<p>${esc(s.name)} prepared the loan request for <b>${esc(loan.inputs.borrowerName)}</b> (${esc(loan.worksheet.header.property)}). Please review and send it to the borrower.</p><p><a href="${loanUrl(req, id)}">Open in the portal</a></p>` });
  await record(id, e);
  return json({ ok: true });
}

async function sendToBorrower(req, s, id) {
  if (!canApprove(s)) return err('Only the loan officer login can send to the borrower.', 403);
  const token = newToken();
  let previousHash = null, version = 0;
  const r = await updateLoan(id, (loan) => {
    if (!SENDABLE.has(loan.status)) return { error: 'This loan can\'t be sent from its current status.' };
    const c = computed(loan);
    if (c.blocking.length) return { error: 'Fix the required items first: ' + c.blocking.map((x) => x.text).join(' ') };
    previousHash = loan.currentTokenHash || null;
    const prev = (loan.versions || []).find((x) => x.v === loan.version);
    if (prev && loan.uw) prev.uw = loan.uw;
    loan.version = (loan.version || 0) + 1; version = loan.version;
    loan.versions = loan.versions || [];
    loan.versions.push({ v: loan.version, sentAt: now(), sentBy: s.name, terms: c.terms, checksAtSend: c.checks, worksheetFile: loan.sourceFile?.key || null });
    loan.currentToken = token; loan.currentTokenHash = hashToken(token);
    loan.status = 'sent'; loan.response = null; loan.uw = null; loan.lock = null;
    event(loan, s, 'sent', `Version ${loan.version} sent to the borrower.`);
  });
  if (r.error) return err(r.error, 409);
  await tokens().setJSON(hashToken(token), { id, v: version, createdAt: now() });
  if (previousHash) { const old = await tokens().get(previousHash, { type: 'json' }); if (old) await tokens().setJSON(previousHash, { ...old, superseded: true }); }
  const url = borrowerUrl(req, token);
  const loan = r.loan;
  const mail = borrowerEmail(version > 1 ? 'requestV2' : 'request', loan.inputs.language, { name: loan.inputs.borrowerName, url, lo: loan.inputs.loName });
  const e = await deliver({ type: 'borrower_request', to: loan.inputs.borrowerEmail, subject: mail.subject, html: mail.html, replyTo: approverRecipients()[0] });
  await record(id, e, e.sent ? `Request emailed to ${loan.inputs.borrowerEmail}.` : `Email not sent: ${e.error} Copy the link and send it yourself.`);
  const t = await textBorrower(id, loan, version > 1 ? 'requestV2' : 'request', url);
  return json({ ok: true, url, emailed: e.sent, emailError: e.error, texted: t?.sent ?? null, textError: t?.error || null });
}

// Re-send the borrower's current link (email + text if they agreed) at any stage. Nothing changes on
// their page; any team member can do it. Before they confirm it reads as a reminder, after that as "here's your link again".
export const LINK_STATUSES = ['sent', 'discuss', 'confirmed', 'uw_approved', 'uw_restructure', 'uw_declined', 'locked'];
async function resendLink(req, s, id) {
  const loan = await getLoan(id);
  if (!loan) return err('Not found', 404);
  if (!loan.currentToken || !LINK_STATUSES.includes(loan.status)) return err('There is no active borrower link to resend. Send the request first.', 409);
  const url = borrowerUrl(req, loan.currentToken);
  const kind = ['sent', 'discuss'].includes(loan.status) ? 'reminder' : 'link';
  const mail = borrowerEmail(kind, loan.inputs.language, { name: loan.inputs.borrowerName, url, lo: loan.inputs.loName });
  const e = await deliver({ type: `borrower_${kind}`, to: loan.inputs.borrowerEmail, subject: mail.subject, html: mail.html, replyTo: approverRecipients()[0] });
  await record(id, e, e.sent ? `Link re-sent by ${s.name} (same link, nothing changed).` : `Link email not sent: ${e.error}`);
  const t = await textBorrower(id, loan, kind, url);
  return json({ ok: true, emailed: e.sent, emailError: e.error, texted: t?.sent ?? null, textError: t?.error || null });
}

async function revise(req, s, id) {
  const b = await readBody(req);
  const reason = String(b.reason || '').trim().slice(0, 1000);
  if (!reason) return err('Enter a reason for revising the terms.');
  const r = await updateLoan(id, (loan) => {
    if (!['sent', 'confirmed', 'discuss', 'uw_restructure', 'uw_declined', 'uw_approved'].includes(loan.status)) return { error: 'Nothing to revise.' };
    loan.status = 'draft';
    event(loan, s, 'revise', `Revising terms: ${reason}. The borrower's link now says updated terms are coming.`);
  });
  if (r.error) return err(r.error, 409);
  return json({ ok: true });
}

async function recordUW(req, s, id) {
  const b = await readBody(req);
  const result = ['approved', 'restructure', 'declined'].includes(b.result) ? b.result : null;
  if (!result) return err('Choose the underwriting result.');
  const n = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const uw = { result, approvedLtv: n(b.approvedLtv), approvedRate: n(b.approvedRate), approvedLoanAmount: n(b.approvedLoanAmount), reason: String(b.reason || '').trim().slice(0, 1500), recordedAt: now(), recordedBy: s.name };
  if (result !== 'approved' && !uw.reason) return err('Explain in plain English what underwriting asked for. The borrower will see it.');
  if (b.notify && !canApprove(s)) return err('Only the loan officer login can notify the borrower.', 403);
  const r = await updateLoan(id, (loan) => {
    if (!['confirmed', 'uw_approved', 'uw_restructure', 'uw_declined'].includes(loan.status)) return { error: 'Record the underwriting result after the borrower confirms the request.' };
    loan.uw = uw;
    if (b.notify) {
      loan.status = result === 'approved' ? 'uw_approved' : result === 'restructure' ? 'uw_restructure' : 'uw_declined';
      event(loan, s, 'uw', `Underwriting: ${result === 'approved' ? 'approved as requested' : result}. ${uw.reason}`.trim());
    } else event(loan, s, 'uw_draft', 'Underwriting result saved (borrower not notified yet).');
  });
  if (r.error) return err(r.error, 409);
  const e = b.notify ? await notifyBorrower(req, id, result === 'approved' ? 'approved' : result) : null;
  return json({ ok: true, emailed: e ? e.sent : null, emailError: e?.error || null });
}

async function recordLock(req, s, id) {
  const b = await readBody(req);
  const rate = Number(b.rate);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 25) return err('Enter the locked rate.');
  if (!b.expires || !/^\d{4}-\d{2}-\d{2}$/.test(b.expires)) return err('Enter the lock expiration date.');
  const conditions = (Array.isArray(b.conditions) ? b.conditions : String(b.conditions || '').split('\n')).map((x) => String(x).trim()).filter(Boolean).slice(0, 40).map((x) => x.slice(0, 300));
  if (b.notify && !canApprove(s)) return err('Only the loan officer login can notify the borrower.', 403);
  const r = await updateLoan(id, (loan) => {
    if (!['uw_approved', 'locked'].includes(loan.status)) return { error: 'Lock after underwriting approves the loan as requested.' };
    const v = loan.versions.find((x) => x.v === loan.version);
    const confirmedPayment = loan.response?.numbers?.payment ?? v?.terms?.monthly?.payment;
    const payment = b.payment !== '' && b.payment !== null && b.payment !== undefined && Number.isFinite(Number(b.payment)) ? r2(b.payment) : (Math.abs(rate - (v?.terms?.rate ?? rate)) < 1e-9 ? confirmedPayment : null);
    if (payment === null) return { error: 'The locked rate differs from the confirmed rate, so enter the new monthly payment.' };
    loan.lock = { rate, expires: b.expires, payment, conditions, recordedAt: now(), recordedBy: s.name };
    if (b.notify) { loan.status = 'locked'; event(loan, s, 'locked', `Rate locked at ${rate}% until ${b.expires}. ${borrowerItems(loan).length} borrower item(s) on the checklist.`); }
    else event(loan, s, 'lock_draft', 'Lock details saved (borrower not notified yet).');
  });
  if (r.error) return err(r.error, 409);
  const e = b.notify ? await notifyBorrower(req, id, 'locked') : null;
  return json({ ok: true, emailed: e ? e.sent : null, emailError: e?.error || null });
}

async function notifyBorrower(req, id, kind) {
  const loan = await getLoan(id);
  const mail = borrowerEmail(kind, loan.inputs.language, { name: loan.inputs.borrowerName, url: borrowerUrl(req, loan.currentToken), lo: loan.inputs.loName });
  const e = await deliver({ type: `borrower_${kind}`, to: loan.inputs.borrowerEmail, subject: mail.subject, html: mail.html, replyTo: approverRecipients()[0] });
  await record(id, e, e.sent ? `Borrower emailed: ${mail.subject}.` : `Borrower email not sent: ${e.error} Copy the link and send it yourself.`);
  await textBorrower(id, loan, kind, borrowerUrl(req, loan.currentToken));
  return e;
}

// Texts the borrower only if they agreed to texts and have a valid mobile number.
async function textBorrower(id, loan, kind, url) {
  if (!loan.inputs?.smsConsent || !normalizePhone(loan.inputs?.borrowerPhone)) return null;
  const t = await deliverSms({ type: `borrower_${kind}_sms`, to: loan.inputs.borrowerPhone, body: borrowerText(kind, loan.inputs.language, { name: loan.inputs.borrowerName, lo: loan.inputs.loName, url }) });
  await record(id, t, t.sent ? `Text sent to ${loan.inputs.borrowerPhone}.` : `Text not sent: ${t.error}`);
  return t;
}

// ---------------- Underwriting approval + conditions ----------------
const APPROVAL_STATUSES = ['confirmed', 'uw_approved', 'uw_restructure', 'uw_declined', 'locked'];

async function startApprovalJob(req, id, job) {
  const url = `${new URL(req.url).origin}/.netlify/functions/approval-background`;
  try { await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, job, key: jobKey(id, job) }) }); }
  catch (e) { console.error('[approval trigger]', e); }
}

async function uploadApproval(req, s, id) {
  const b = await readBody(req);
  const text = String(b.text || '');
  if (text.replace(/\s/g, '').length < 200) return err('Could not read text from this PDF. Is it a scanned image? Upload the approval exported from the loan system.');
  let bytes = null;
  if (b.file?.base64) { bytes = Buffer.from(b.file.base64, 'base64'); if (bytes.length > MAX_PDF) return err('The PDF must be 4 MB or smaller.', 413); if (bytes.subarray(0, 4).toString() !== '%PDF') return err('That file is not a PDF.'); }
  if (!aiConfigured() && !process.env.MOCK_AI) return err('Reading approvals needs an AI key (OPENAI_API_KEY or ANTHROPIC_API_KEY) in Netlify.', 503);
  const job = newToken().slice(0, 16);
  let n = 1;
  const r = await updateLoan(id, (loan) => {
    if (!APPROVAL_STATUSES.includes(loan.status)) return { error: 'Upload the approval after the borrower confirms the request.' };
    n = (loan.approvalUploads || 0) + 1; loan.approvalUploads = n;
    if (loan.approval?.status === 'done') loan.approvalPrevious = { conditions: loan.approval.conditions, uploadedAt: loan.approval.uploadedAt };
    loan.approval = { status: 'processing', job, n, uploadedAt: now(), uploadedBy: s.name, textKey: `${id}/approval/${n}.txt`, file: bytes ? { name: String(b.file.name || 'approval.pdf').slice(0, 120), key: `${id}/approval/${n}.pdf`, size: bytes.length } : null };
    event(loan, s, 'approval_upload', `Underwriting approval uploaded${bytes ? ` (${b.file.name})` : ''}${n > 1 ? ` (upload #${n}; progress on matching conditions is kept)` : ''}.`);
  });
  if (r.error) return err(r.error, 409);
  await files().set(`${id}/approval/${n}.txt`, text.slice(0, 300000));
  if (bytes) await files().set(`${id}/approval/${n}.pdf`, bytes, { metadata: { name: b.file.name } });
  await startApprovalJob(req, id, job);
  return json({ ok: true });
}

async function retryApproval(req, s, id) {
  const job = newToken().slice(0, 16);
  const r = await updateLoan(id, (loan) => {
    if (!loan.approval || loan.approval.status === 'done') return { error: 'Nothing to retry.' };
    loan.approval = { ...loan.approval, status: 'processing', job, error: null, retriedAt: now() };
  });
  if (r.error) return err(r.error, 409);
  await startApprovalJob(req, id, job);
  return json({ ok: true });
}

function saveDraftSettings(loan, drafts) {
  const store = loan.approval.draftEdits = loan.approval.draftEdits || {};
  for (const [k, d] of Object.entries(drafts || {})) {
    if (!DRAFT_KINDS.includes(k) || !d || typeof d !== 'object') continue;
    const prev = store[k] || {};
    const next = {
      note: typeof d.note === 'string' ? d.note.trim().slice(0, 2000) : prev.note || '',
      subject: typeof d.subject === 'string' ? d.subject.trim().slice(0, 200) : prev.subject || '',
      to: typeof d.to === 'string' ? d.to.trim().slice(0, 300) : prev.to || ''
    };
    if (d.reset) { next.note = ''; next.subject = ''; }
    if (next.note || next.subject || next.to) store[k] = next; else delete store[k];
  }
}

// Saves condition edits (the page autosaves each change) and hand edits to request drafts.
// Returns the fresh conditions and drafts so the page can update in place.
async function saveConditions(req, s, id) {
  const b = await readBody(req);
  const updates = Array.isArray(b.updates) ? b.updates.slice(0, 200) : [];
  const current = await getLoan(id);
  if (!current) return err('Not found', 404);
  const url = current.currentToken ? borrowerUrl(req, current.currentToken) : null;
  // Hebrew loans: when the English wording or "why" changes and the Hebrew wasn't edited too, re-translate it.
  const heFailed = new Set();
  if (current.inputs?.language === 'he' && current.approval?.status === 'done' && (aiConfigured() || process.env.MOCK_AI)) {
    const byId = new Map(current.approval.conditions.map((c) => [c.id, c]));
    for (const u of updates) {
      const c = byId.get(u.id); if (!c) continue;
      for (const [en, he] of [['plain', 'plainHe'], ['why', 'whyHe']]) {
        const changed = typeof u[en] === 'string' && u[en].trim() !== c[en];
        const heTouched = typeof u[he] === 'string' && u[he].trim() !== (c[he] || '');
        if (!changed || heTouched) continue;
        if (!u[en].trim()) { u[he] = ''; u[`${he}Auto`] = true; continue; }
        try { u[he] = (await polishText({ text: u[en].trim(), mode: 'hebrew', audience: 'borrower' })).text; u[`${he}Auto`] = true; } catch (e) { console.error('[translate]', e); heFailed.add(u.id); }
      }
    }
  }
  const r = await updateLoan(id, (loan) => {
    if (loan.approval?.status !== 'done') return { error: 'No conditions to update yet.' };
    const byId = new Map(loan.approval.conditions.map((c) => [c.id, c]));
    const statusChanges = [], edits = [];
    for (const u of updates) {
      const c = byId.get(u.id); if (!c) continue;
      for (const [k, max] of [['plain', 800], ['why', 300], ['plainHe', 800], ['whyHe', 300]]) if (typeof u[k] === 'string' && u[k].trim() !== (c[k] || '')) {
        c[k] = u[k].trim().slice(0, max);
        if (!u[`${k}Auto`]) c.edited = { ...(c.edited || {}), [k]: true };
        edits.push(`#${c.num}`);
      }
      if (heFailed.has(c.id)) c.heStale = true; else if (u.plainHeAuto || u.whyHeAuto || typeof u.plainHe === 'string') delete c.heStale;
      for (const [k, list] of [['provider', PROVIDERS], ['receiver', RECEIVERS], ['timing', TIMINGS]]) if (list.includes(u[k]) && u[k] !== c[k]) { c[k] = u[k]; c.edited = { ...(c.edited || {}), [k]: true }; edits.push(`#${c.num}`); }
      if (typeof u.borrowerVisible === 'boolean' && u.borrowerVisible !== c.borrowerVisible) { c.borrowerVisible = u.borrowerVisible; c.edited = { ...(c.edited || {}), borrowerVisible: true }; edits.push(`#${c.num}`); }
      if (STATUSES.includes(u.status) && u.status !== c.status) { statusChanges.push(`#${c.num} ${c.status} → ${u.status}`); c.status = u.status; c.statusAt = now(); c.statusBy = s.name; }
    }
    // Request settings: the team's note, subject and recipient per request. The item list is never stored.
    if (b.drafts && typeof b.drafts === 'object') saveDraftSettings(loan, b.drafts);
    if (statusChanges.length || edits.length) event(loan, s, 'conditions', [statusChanges.length ? `Checklist updated: ${statusChanges.join(', ')}.` : '', edits.length ? `Edited ${[...new Set(edits)].join(', ')}.` : ''].filter(Boolean).join(' '));
  });
  if (r.error) return err(r.error, 409);
  return json({ ok: true, conditions: r.loan.approval.conditions, drafts: draftsView(r.loan, url), translateFailed: [...heFailed] });
}

async function sendMessage(req, s, id) {
  const b = await readBody(req);
  let loan = await getLoan(id);
  if (!loan) return err('Not found', 404);
  const portal = loan.currentToken ? borrowerUrl(req, loan.currentToken) : null;
  // Requests built from the checklist: save the note/subject/recipient sent with this click, then build
  // the message from the conditions as they are right now, so what goes out is never out of date.
  if (DRAFT_KINDS.includes(b.kind) && loan.approval?.status === 'done') {
    const r = await updateLoan(id, (l) => { saveDraftSettings(l, { [b.kind]: { note: b.note, subject: b.subject, to: b.to } }); });
    loan = r.loan;
    const d = draftsView(loan, portal)[b.kind];
    if (!d) return err('Nothing is open for this request anymore.', 409);
    b.body = d.body; b.subject = d.subject;
  }
  const toBorrower = b.channel === 'sms' || /^borrower/.test(b.kind || '') || String(b.to || '').toLowerCase().includes(String(loan.inputs?.borrowerEmail || '~').toLowerCase());
  // Every message to the borrower ends with the way back to their loan page.
  if (toBorrower && portal && !String(b.body || '').includes(portal)) {
    const he = loan.inputs?.language === 'he';
    b.body = `${String(b.body || '').trim()}${b.channel === 'sms' ? ' ' : '\n\n'}${he ? 'עמוד ההלוואה שלך (תנאים, אישור ורשימת מסמכים מעודכנים)' : 'Your loan page (latest terms, approval and checklist)'}: ${portal}`;
  }
  const body = String(b.body || '').trim();
  if (!body) return err('The message is empty.');
  if (b.channel === 'sms') {
    if (!loan.inputs?.smsConsent) return err('The borrower has not agreed to receive texts. Tick "Borrower agreed to texts" in Loan details first.');
    const t = await deliverSms({ type: `manual_${b.kind || 'text'}`, to: loan.inputs.borrowerPhone, body: body.slice(0, 1200) });
    await record(id, t, t.sent ? `${s.name} texted the borrower.` : `Text not sent: ${t.error}`);
    return t.sent ? json({ ok: true }) : err(t.error, 502);
  }
  const to = String(b.to || '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)).slice(0, 10);
  if (!to.length) return err('Enter a valid email address to send to.');
  const subject = String(b.subject || '').trim().slice(0, 200) || 'Loan update';
  const replyTo = loan.inputs?.processorEmail && b.kind !== 'borrowerEmail' ? loan.inputs.processorEmail : approverRecipients()[0];
  const cc = [...new Set([loan.inputs?.processorEmail, ...approverRecipients()].filter((x) => x && !to.includes(x)))];
  const e = await deliver({ type: `manual_${b.kind || 'email'}`, to, subject, html: textToHtml(body), replyTo, cc: b.kind === 'internalEmail' ? [] : cc });
  await record(id, e, e.sent ? `${s.name} emailed "${subject}" to ${to.join(', ')}.` : `Email not sent: ${e.error}`);
  return e.sent ? json({ ok: true }) : err(e.error, 502);
}

async function notifyChecklist(req, s, id) {
  const loan = await getLoan(id);
  if (!loan) return err('Not found', 404);
  if (loan.status !== 'locked') return err('The borrower sees the checklist once the rate is locked.', 409);
  const e = await notifyBorrower(req, id, 'conditions');
  return json({ ok: true, emailed: e.sent, emailError: e.error });
}

// ---------------- Document uploads (per condition) ----------------
// The borrower uploads from their page (or the team on their behalf). The item flips to "received", an AI
// first-pass check runs in the background, and whoever receives that condition gets an email to review it.
async function readUpload(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_UPLOAD) return { error: err('That file is larger than 5 MB. Try a photo of each page, or a smaller PDF.', 413) };
  const bytes = Buffer.from(await req.arrayBuffer());
  if (!bytes.length) return { error: err('The file is empty.') };
  if (bytes.length > MAX_UPLOAD) return { error: err('That file is larger than 5 MB. Try a photo of each page, or a smaller PDF.', 413) };
  const kind = sniff(bytes);
  if (!kind) return { error: err('Please upload a PDF or a photo (JPG or PNG).', 415) };
  return { bytes, kind };
}

async function startUploadCheck(req, id, uid, notify) {
  const url = `${new URL(req.url).origin}/.netlify/functions/upload-check-background`;
  try { await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, uid, notify, key: jobKey(`${id}:${uid}`, 'upload') }) }); } catch (e) { console.error('[upload check trigger]', e); }
}

async function storeUpload(req, id, cid, rawName, by, byRole) {
  const f = await readUpload(req); if (f.error) return f;
  const uid = newUploadId(), name = cleanName(rawName, f.kind.ext);
  await files().set(uploadKey(id, uid), f.bytes, { metadata: { name, mime: f.kind.mime } });
  const r = await updateLoan(id, (loan) => {
    if (loan.status === 'closed') return { error: 'This loan is closed.' };
    if (loan.approval?.status === 'processing') return { error: 'We’re updating your checklist right now. Please try again in a minute.' };
    const c = loan.approval?.status === 'done' && (loan.approval.conditions || []).find((x) => x.id === cid);
    if (!c || (byRole === 'borrower' && !c.borrowerVisible)) return { error: 'That item is no longer on the checklist.' };
    if (c.status === 'cleared') return { error: 'This item is already cleared. Nothing more is needed.' };
    if ((c.uploads || []).length >= MAX_PER_CONDITION || loan.approval.conditions.flatMap((x) => x.uploads || []).length >= MAX_PER_LOAN) return { error: 'Too many files on this item. Please email the rest to your loan team.' };
    c.uploads = c.uploads || [];
    c.uploads.push({ id: uid, name, mime: f.kind.mime, size: f.bytes.length, at: now(), by, byRole, ai: { state: 'pending' }, review: null });
    if (['open', 'requested'].includes(c.status)) { c.status = 'received'; c.statusAt = now(); c.statusBy = by; }
    event(loan, byRole === 'borrower' ? 'borrower' : by, 'upload', `${byRole === 'borrower' ? 'Borrower' : by} uploaded "${name}" for #${c.num}.`);
  });
  if (r.error) { try { await files().delete(uploadKey(id, uid)); } catch { /* ignore */ } return { error: err(r.error === 'not_found' ? 'Not found' : r.error, r.error === 'not_found' ? 404 : 409) }; }
  await startUploadCheck(req, id, uid, byRole === 'borrower');
  return { loan: r.loan, uid };
}

async function borrowerUpload(req) {
  const u = new URL(req.url), t = u.searchParams.get('t');
  const rec = await tokenLookup(t);
  if (!rec || rec.superseded) return err('This link is no longer active.', 410);
  const loan = await getLoan(rec.id);
  if (!loan || loan.currentTokenHash !== hashToken(t)) return err('This link is no longer active.', 410);
  if (loan.status !== 'locked') return err('Uploads open once your rate is locked.', 409);
  const out = await storeUpload(req, rec.id, u.searchParams.get('cid'), u.searchParams.get('name'), loan.inputs?.borrowerName || 'Borrower', 'borrower');
  return out.error || json(borrowerView(out.loan));
}

async function teamUpload(req, s, id) {
  const out = await storeUpload(req, id, new URL(req.url).searchParams.get('cid'), new URL(req.url).searchParams.get('name'), s.name, 'team');
  return out.error || json({ ok: true, uid: out.uid });
}

function findUpload(loan, uid) {
  for (const c of loan?.approval?.conditions || []) { const u = (c.uploads || []).find((x) => x.id === uid); if (u) return { c, u }; }
  return null;
}

async function uploadFile(id, uid) {
  const loan = await getLoan(id); const f = findUpload(loan, uid);
  if (!f) return err('Not found', 404);
  if (f.u.deletedAt) return err('This file was deleted when the loan closed.', 410);
  const data = await files().get(uploadKey(id, uid), { type: 'arrayBuffer' });
  if (!data) return err('Not found', 404);
  return new Response(data, { headers: { 'content-type': f.u.mime, 'content-disposition': `inline; filename="${f.u.name.replace(/[^\w.\- ]/g, '_')}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

// Accept, or send back with a reason (the borrower gets the reason by email/text, with their link).
async function reviewUpload(req, s, id, uid) {
  const b = await readBody(req);
  const decision = b.decision === 'accept' ? 'accepted' : b.decision === 'return' ? 'returned' : null;
  if (!decision) return err('Choose accept or send back.');
  const reason = String(b.reason || '').trim().slice(0, 600);
  if (decision === 'returned' && !reason) return err('Say what the borrower needs to fix.');
  const pre = await getLoan(id);
  let reasonHe = '';
  if (decision === 'returned' && pre?.inputs?.language === 'he' && (aiConfigured() || process.env.MOCK_AI)) { try { reasonHe = (await polishText({ text: reason, mode: 'hebrew', audience: 'borrower' })).text; } catch (e) { console.error('[translate]', e); } }
  const r = await updateLoan(id, (loan) => {
    const f = findUpload(loan, uid); if (!f) return { error: 'Not found' };
    f.u.review = { decision, reason, reasonHe, by: s.name, at: now() };
    if (decision === 'returned') {
      const othersOk = f.c.uploads.some((x) => x.id !== uid && x.review?.decision !== 'returned');
      if (!othersOk && f.c.status !== 'cleared') { f.c.status = 'requested'; f.c.statusAt = now(); f.c.statusBy = s.name; }
    }
    event(loan, s, 'upload_review', `${decision === 'accepted' ? 'Accepted' : 'Sent back'} "${f.u.name}" for #${f.c.num}${reason ? `: ${reason}` : ''}.`);
  });
  if (r.error) return err(r.error, 404);
  let emailed = null, texted = null;
  if (decision === 'returned' && b.notify !== false && r.loan.currentToken) {
    const loan = r.loan, f = findUpload(loan, uid), he = loan.inputs?.language === 'he';
    const url = borrowerUrl(req, loan.currentToken), first = esc(String(loan.inputs?.borrowerName || '').split(/\s+/)[0]);
    const item = he ? (f.c.plainHe || f.c.plain) : f.c.plain, why = he ? (reasonHe || reason) : reason;
    const html = he
      ? `<div dir="rtl"><p>שלום ${first},</p><p>בדקנו את הקובץ שהעלית עבור: <b>${esc(item)}</b></p><p>${esc(why)}</p><p>אפשר להעלות קובץ מתוקן ישירות בעמוד ההלוואה שלך:</p></div>${button(url, 'העלאת קובץ מתוקן')}`
      : `<p>Hi ${first},</p><p>We reviewed the file you uploaded for: <b>${esc(item)}</b></p><p>${esc(why)}</p><p>You can upload a corrected file right on your loan page:</p>${button(url, 'Upload a corrected file')}`;
    const e = await deliver({ type: 'upload_returned', to: loan.inputs.borrowerEmail, subject: he ? 'צריך עוד משהו קטן לגבי מסמך ששלחת' : 'One quick fix on a document you sent', html, replyTo: approverRecipients()[0] });
    await record(id, e, e.sent ? 'Borrower emailed about the document that was sent back.' : `Email not sent: ${e.error}`);
    emailed = e.sent;
    if (loan.inputs?.smsConsent && normalizePhone(loan.inputs?.borrowerPhone)) {
      const t = await deliverSms({ type: 'upload_returned_sms', to: loan.inputs.borrowerPhone, body: he ? `שלום ${first}, צריך תיקון קטן במסמך ששלחת: ${why} אפשר להעלות קובץ חדש כאן: ${url} להסרה השב STOP.` : `Hi ${first}, one quick fix on a document you sent: ${why} Upload a new file here: ${url} Reply STOP to opt out.` });
      await record(id, t, t.sent ? 'Borrower texted about the document that was sent back.' : `Text not sent: ${t.error}`);
      texted = t.sent;
    }
  }
  return json({ ok: true, emailed, texted });
}

async function recheckUpload(req, s, id, uid) {
  const r = await updateLoan(id, (loan) => { const f = findUpload(loan, uid); if (!f || f.u.deletedAt) return { error: 'Not found' }; f.u.ai = { state: 'pending' }; });
  if (r.error) return err(r.error, 404);
  await startUploadCheck(req, id, uid, false);
  return json({ ok: true });
}

// Closing: the loan is done, so the borrower's uploaded documents are deleted from the portal.
async function closeLoan(req, s, id) {
  if (!canApprove(s)) return err('Only the loan officer login can mark a loan closed.', 403);
  const loan = await getLoan(id);
  if (!loan) return err('Not found', 404);
  if (loan.status !== 'locked') return err('Only a locked loan can be marked closed.', 409);
  const n = await deleteLoanUploads(loan);
  const r = await updateLoan(id, (l) => {
    l.status = 'closed'; l.closedAt = now();
    for (const u of [...(l.approval?.conditions || []).flatMap((c) => c.uploads || []), ...(l.approvalPrevious?.conditions || []).flatMap((c) => c.uploads || []), ...(l.orphanUploads || [])]) if (!u.deletedAt) u.deletedAt = now();
    event(l, s, 'closed', `Loan marked closed. ${n} uploaded document${n === 1 ? '' : 's'} deleted from the portal.`);
  });
  if (r.error) return err(r.error, 409);
  return json({ ok: true, deleted: n });
}

// ---------------- Borrower handlers ----------------
async function borrowerGet(req, context) {
  const t = new URL(req.url).searchParams.get('t');
  const rec = await tokenLookup(t);
  if (!rec) return err('This link is not valid.', 404);
  if (rec.superseded) { const l = await getLoan(rec.id); return json({ superseded: true, lang: l?.inputs?.language === 'he' ? 'he' : 'en' }); }
  if (new URL(req.url).searchParams.get('poll')) {
    const loan = await getLoan(rec.id);
    if (!loan || loan.currentTokenHash !== hashToken(t)) return err('This link is not valid.', 404);
    return json(borrowerView(loan));
  }
  const r = await updateLoan(rec.id, (loan) => {
    if (loan.currentTokenHash !== hashToken(t)) return { error: 'gone' };
    loan.views = (loan.views || []).slice(-50);
    const first = !loan.views.some((x) => x.v === loan.version);
    loan.views.push({ v: loan.version, at: now(), ip: context?.ip || null });
    if (first) event(loan, 'borrower', 'opened', `Borrower opened version ${loan.version}.`);
  });
  if (r.error) return err('This link is not valid.', 404);
  return json(borrowerView(r.loan));
}

function validChoices(terms, c = {}) {
  return {
    impounds: terms.options?.impoundWaiver && c.impounds === 'waive' ? 'waive' : 'keep',
    ppp: terms.options?.pppBuydown && c.ppp === 'buydown' ? 'buydown' : 'keep'
  };
}

async function borrowerRespond(req, context) {
  const b = await readBody(req);
  const rec = await tokenLookup(b.t);
  if (!rec || rec.superseded) return err('This link is no longer active. Please use the newest email from your loan team.', 410);
  const action = b.action === 'confirm' ? 'confirm' : b.action === 'discuss' ? 'discuss' : null;
  if (!action) return err('Unknown action.');
  const r = await updateLoan(rec.id, (loan) => {
    if (loan.currentTokenHash !== hashToken(b.t)) return { error: 'This link is no longer active.' };
    if (!['sent', 'discuss'].includes(loan.status)) return { error: loan.status === 'confirmed' ? 'You already confirmed this request.' : 'This request is not open right now.' };
    const v = loan.versions.find((x) => x.v === loan.version);
    const choices = validChoices(v.terms, b.choices);
    const s = scenario(v.terms, choices);
    loan.response = { v: loan.version, action, choices, numbers: { totalCosts: s.totalCosts, funds: s.funds, payment: s.payment }, lang: b.lang === 'he' ? 'he' : 'en', at: now(), ip: context?.ip || null, userAgent: (req.headers.get('user-agent') || '').slice(0, 300) };
    v.responses = v.responses || [];
    v.responses.push(loan.response);
    loan.status = action === 'confirm' ? 'confirmed' : 'discuss';
    const ch = `${choices.ppp === 'buydown' ? '2-year prepayment penalty' : 'prepayment penalty as offered'}; ${choices.impounds === 'waive' ? 'waive impounds' : 'impounds as offered'}`;
    event(loan, 'borrower', action === 'confirm' ? 'confirmed' : 'discuss', action === 'confirm' ? `Borrower confirmed version ${loan.version} (${ch}). Cash ${s.funds.direction === 'to_borrower' ? 'to borrower' : 'to close'} $${fmt(s.funds.amount)}.` : `Borrower asked to discuss before submitting (${ch}).`, { ip: loan.response.ip });
  });
  if (r.error) return err(r.error, 409);
  const id = rec.id, loan = r.loan, name = loan.inputs.borrowerName;
  if (action === 'confirm') {
    const e1 = await deliver({ type: 'borrower_copy', to: loan.inputs.borrowerEmail, subject: copySubject(loan.response.lang), html: confirmationCopy(loan, borrowerUrl(req, loan.currentToken)), replyTo: approverRecipients()[0] });
    await record(id, e1, e1.sent ? 'Copy of the confirmed request emailed to the borrower.' : `Borrower copy not sent: ${e1.error}`);
    const e2 = await deliver({ type: 'team_confirmed', to: allInternal(), subject: `Confirmed: ${name} approved the loan request (v${loan.version})`, html: `<p><b>${esc(name)}</b> confirmed the loan request for ${esc(loan.worksheet.header.property)}. You can submit to underwriting.</p><p><a href="${loanUrl(req, id)}">Open in the portal</a></p>` });
    await record(id, e2);
  } else {
    const e3 = await deliver({ type: 'team_discuss', to: allInternal(), subject: `Call needed: ${name} wants to discuss before submitting`, html: `<p><b>${esc(name)}</b> wants to talk before we submit. They were offered your Calendly link. Please reach out.</p><p><a href="${loanUrl(req, id)}">Open in the portal</a></p>` });
    await record(id, e3);
  }
  return json(borrowerView(loan));
}

function confirmationCopy(loan, url) {
  const v = loan.versions.find((x) => x.v === loan.version), t = v.terms, res = loan.response, n = res.numbers;
  const he = res.lang === 'he';
  const rows = he ? [
    ['נכס', t.property], ['סכום ההלוואה', `$${fmt(t.loanAmount)}`], ['ריבית (לא ננעלה)', `${t.rate}%`], ['תשלום חודשי משוער', `$${fmt(n.payment)}`],
    ['עלויות סגירה משוערות', `$${fmt(n.totalCosts)}`], [n.funds.direction === 'to_borrower' ? 'סכום משוער אליך' : 'סכום משוער להבאה לסגירה', `$${fmt(n.funds.amount)}`],
    ['קנס פירעון מוקדם', res.choices.ppp === 'buydown' ? 'שנתיים' : (t.ppp.years ? `${t.ppp.years} שנים` : 'אין')], ['חשבון נאמנות', res.choices.impounds === 'waive' ? 'בוטל' : (t.impoundsIncluded ? 'כלול' : 'לא כלול')]
  ] : [
    ['Property', t.property], ['Loan amount', `$${fmt(t.loanAmount)}`], ['Interest rate (not locked)', `${t.rate}%`], ['Est. monthly payment', `$${fmt(n.payment)}`],
    ['Est. closing costs', `$${fmt(n.totalCosts)}`], [n.funds.direction === 'to_borrower' ? 'Est. cash to you' : 'Est. cash to close', `$${fmt(n.funds.amount)}`],
    ['Prepayment penalty', res.choices.ppp === 'buydown' ? '2 years' : (t.ppp.years ? `${t.ppp.years} years` : 'None')], ['Impounds', res.choices.impounds === 'waive' ? 'Waived' : (t.impoundsIncluded ? 'Included' : 'Not included')]
  ];
  const when = new Date(res.at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' }) + ' PT';
  const table = `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([a, b]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #EEF1F0;color:#3B4652">${esc(a)}</td><td style="padding:8px 0;border-bottom:1px solid #EEF1F0;text-align:${he ? 'left' : 'right'};font-weight:bold">${esc(b)}</td></tr>`).join('')}</table>`;
  return he
    ? `<div dir="rtl"><p>תודה. זה עותק של בקשת ההלוואה שאישרת ב-${esc(when)} (גרסה ${loan.version}).</p>${table}<p style="font-size:13px;color:#55606B">אלה תנאים מוצעים. הם יכולים להשתנות אם המידע משתנה, כולל שווי השמאות, דירוג האשראי או מחירי השוק. הריבית אינה סופית עד שהיא ננעלת.</p>${button(url, 'לעמוד ההלוואה שלך')}<p style="font-size:13px;color:#55606B">שמור את הקישור הזה: העמוד תמיד מציג את המצב העדכני של ההלוואה.</p></div>`
    : `<p>Thank you. This is a copy of the loan request you confirmed on ${esc(when)} (version ${loan.version}).</p>${table}<p style="font-size:13px;color:#55606B">These are proposed terms. They can change if your information changes, including the appraised value, your credit, or market pricing. Your rate is not final until it is locked.</p>${button(url, 'Open my loan page')}<p style="font-size:13px;color:#55606B">Keep this link: your loan page always shows the latest status of your loan.</p>`;
}

async function borrowerAsk(req) {
  const b = await readBody(req);
  const rec = await tokenLookup(b.t);
  if (!rec || rec.superseded) return err('This link is no longer active.', 410);
  if (!aiConfigured()) return err('not_configured', 503);
  const q = String(b.question || '').trim().slice(0, 600);
  if (!q) return err('Type a question.');
  const loan = await getLoan(rec.id);
  if (!loan || loan.currentTokenHash !== hashToken(b.t)) return err('This link is no longer active.', 410);
  const asked = (loan.chat || []).filter((c) => c.v === loan.version).length;
  if (asked >= 40) return err('Question limit reached for this page. Please schedule a call.', 429);
  const view = borrowerView(loan);
  const history = (Array.isArray(b.history) ? b.history : []).slice(-6).filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.text === 'string').map((m) => ({ role: m.role, content: m.text.slice(0, 1500) }));
  while (history.length && history[0].role !== 'user') history.shift();
  try {
    const out = await askAI(systemPrompt(view, validChoices(view.terms, b.choices), b.lang === 'he' ? 'he' : 'en'), [...history, { role: 'user', content: q }]);
    await updateLoan(rec.id, (l) => { l.chat = (l.chat || []).slice(-300); l.chat.push({ v: l.version, at: now(), q, a: out.answer, provider: out.provider }); });
    return json(out);
  } catch (e) { console.error('[ask]', e); return err('ai_failed', 502); }
}

// ---------------- Router ----------------
export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const m = req.method;
  try {
    // Borrower routes (token-based, no login)
    if (path === 'b' && m === 'GET') return borrowerGet(req, context);
    if (path === 'b/respond' && m === 'POST') return borrowerRespond(req, context);
    if (path === 'b/ask' && m === 'POST') return borrowerAsk(req);
    if (path === 'b/upload' && m === 'POST') return borrowerUpload(req);

    // Auth
    if (path === 'login' && m === 'POST') {
      if (!process.env.APP_SECRET) return err('Set APP_SECRET in Netlify before logging in.', 500);
      const b = await readBody(req);
      const role = b.role === 'approver' ? 'approver' : 'team';
      const name = String(b.name || '').trim();
      if (!name) return err('Enter your name.');
      if (!checkPassword(role, b.password)) { await new Promise((r) => setTimeout(r, 600)); return err('Wrong password.', 401); }
      return json({ ok: true }, 200, { 'set-cookie': makeSessionCookie(role, name, url.protocol === 'https:') });
    }
    if (path === 'logout') return json({ ok: true }, 200, { 'set-cookie': clearCookie });

    const s = session(req);
    if (path === 'me') return json(s ? { role: s.role, name: s.name, canApprove: canApprove(s), approverEnabled: approverEnabled() } : { role: null, approverEnabled: approverEnabled() });
    if (!s) return err('Please log in.', 401);

    if (path === 'ai/polish' && m === 'POST') {
      const b = await readBody(req);
      const text = String(b.text || '').trim();
      if (!text) return err('Nothing to polish yet.');
      if (!aiConfigured() && !process.env.MOCK_AI) return err('Add an AI key (OPENAI_API_KEY or ANTHROPIC_API_KEY) in Netlify to use this.', 503);
      const mode = polishModes.includes(b.mode) ? b.mode : 'polish';
      if (mode === 'tone' && !toneKeys.includes(b.tone)) return err('Pick a tone.');
      const instruction = String(b.instruction || '').trim();
      if (mode === 'custom' && !instruction) return err('Tell the AI what to change.');
      try { return json(await polishText({ text, mode, tone: b.tone, instruction, audience: ['borrower', 'party', 'internal'].includes(b.audience) ? b.audience : 'borrower' })); }
      catch (e) { console.error('[polish]', e); return err(`The AI could not rewrite this. ${e.message === 'not_configured' ? 'No AI key is set.' : e.message}`, 502); }
    }
    // Document formats (Settings) and background AI jobs
    if (path === 'formats' && m === 'GET') return json({ formats: await getAllFormats(), canEdit: canApprove(s), aiEnabled: aiConfigured() || Boolean(process.env.MOCK_AI) });
    const fm = path.match(/^formats\/([a-z]+)(\/reset)?$/);
    if (fm && m === 'POST') {
      if (!canApprove(s)) return err('Only the loan officer login can change document formats.', 403);
      if (!FORMAT_KINDS[fm[1]]) return err('Unknown document type.', 404);
      if (fm[2]) { await resetFormat(fm[1], s.name); return json({ ok: true }); }
      const b = await readBody(req);
      const notes = String(b.notes || '').trim();
      if (notes.length < 40) return err('The format notes look empty.');
      await saveFormat(fm[1], notes, s.name);
      return json({ ok: true });
    }
    if (path === 'jobs' && m === 'POST') {
      const b = await readBody(req);
      if (!JOB_KINDS.includes(b.kind)) return err('Unknown job.');
      if (b.kind === 'learn-format' && (!canApprove(s) || !FORMAT_KINDS[b.formatKind])) return err('Only the loan officer login can teach a new format.', 403);
      if (String(b.text || '').replace(/\s/g, '').length < 200) return err('Could not read text from this PDF. Is it a scanned image?');
      if (!aiConfigured() && !process.env.MOCK_AI) return err('This needs an AI key (OPENAI_API_KEY or ANTHROPIC_API_KEY) in Netlify.', 503);
      const id = await createJob({ kind: b.kind, formatKind: b.formatKind, text: b.text, by: s.name });
      try { await fetch(`${new URL(req.url).origin}/.netlify/functions/jobs-background`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, key: jobKey(id, 'job') }) }); } catch (e) { console.error('[job trigger]', e); }
      return json({ id });
    }
    const jm = path.match(/^jobs\/([a-z0-9]+)$/);
    if (jm && m === 'GET') { const j = await jobsStore().get(jm[1], { type: 'json' }); return j ? json({ status: j.status, result: j.result || null, error: j.error || null }) : err('Not found', 404); }

    if (path === 'loans' && m === 'GET') return json({ loans: (await listLoans()).map(summary) });
    if (path === 'loans' && m === 'POST') return createLoan(req, s);
    const um = path.match(/^loans\/([a-z0-9]+)\/uploads\/([a-z0-9]+)(?:\/(review|recheck))?$/);
    if (um) {
      const [, id, uid, act] = um;
      if (!act && m === 'GET') return uploadFile(id, uid);
      if (act === 'review' && m === 'POST') return reviewUpload(req, s, id, uid);
      if (act === 'recheck' && m === 'POST') return recheckUpload(req, s, id, uid);
      return err('Not found', 404);
    }
    const lm = path.match(/^loans\/([a-z0-9]+)(?:\/([a-z-]+))?$/);
    if (lm) {
      const [, id, action] = lm;
      if (!action && m === 'GET') return loanDetail(req, s, id);
      if (action === 'preview' && m === 'GET') { const loan = await getLoan(id); return loan ? json(borrowerView(loan, { preview: true })) : err('Not found', 404); }
      if (action === 'approval-file' && m === 'GET') {
        const loan = await getLoan(id); if (!loan?.approval?.file) return err('No file', 404);
        const data = await files().get(loan.approval.file.key, { type: 'arrayBuffer' });
        if (!data) return err('No file', 404);
        return new Response(data, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${loan.approval.file.name.replace(/[^\w.\- ]/g, '')}"`, 'cache-control': 'no-store' } });
      }
      if (action === 'file' && m === 'GET') {
        const loan = await getLoan(id); if (!loan?.sourceFile) return err('No file', 404);
        const data = await files().get(loan.sourceFile.key, { type: 'arrayBuffer' });
        if (!data) return err('No file', 404);
        return new Response(data, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${loan.sourceFile.name.replace(/[^\w.\- ]/g, '')}"`, 'cache-control': 'no-store' } });
      }
      if (m !== 'POST') return err('Method not allowed', 405);
      if (action === 'inputs') return saveInputs(req, s, id);
      if (action === 'worksheet') return replaceWorksheet(req, s, id);
      if (action === 'ready') return markReady(req, s, id);
      if (action === 'send') return sendToBorrower(req, s, id);
      if (action === 'resend') return resendLink(req, s, id);
      if (action === 'revise') return revise(req, s, id);
      if (action === 'uw') return recordUW(req, s, id);
      if (action === 'lock') return recordLock(req, s, id);
      if (action === 'approval') return uploadApproval(req, s, id);
      if (action === 'approval-retry') return retryApproval(req, s, id);
      if (action === 'conditions') return saveConditions(req, s, id);
      if (action === 'message') return sendMessage(req, s, id);
      if (action === 'notify-checklist') return notifyChecklist(req, s, id);
      if (action === 'upload') return teamUpload(req, s, id);
      if (action === 'close') return closeLoan(req, s, id);
    }
    return err('Not found', 404);
  } catch (e) {
    console.error('[api]', e);
    return err('Something went wrong. Please try again.', 500);
  }
};
