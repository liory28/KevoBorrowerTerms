// Loan page panel: upload the underwriting approval, review the AI-built conditions checklist,
// track status per condition, and copy/send the request drafts to each party.
import { fmt } from './calc.mjs';
import { enhancePolish } from './polish.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $$ = (n, d = 2) => (n === null || n === undefined ? '—' : '$' + fmt(n, d));
const when = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const dateLong = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const daysUntil = (d) => d ? Math.round((new Date(d + 'T12:00:00') - new Date()) / 86400000) : null;

export const PROVIDER_LABEL = { borrower: 'Borrower', insurance: 'Insurance agent', title: 'Title / escrow', appraiser: 'Appraiser / AMC', seller: 'Seller (through title)', hoa: 'HOA', third_party: 'Other third parties', lender: 'Lender / internal' };
const RECEIVER_LABEL = { processor: 'Processor', lo: 'LO' };
const TIMING_LABEL = { prior_to_docs: 'Before docs', prior_to_funding: 'Before funding', at_closing: 'At closing', post_closing: 'After closing', other: 'Other' };
const STATUS_LABEL = { open: 'Open', requested: 'Requested', received: 'Received', cleared: 'Cleared' };
const DRAFT_META = {
  borrowerEmail: { label: 'Borrower email', audience: 'borrower', toKey: 'borrowerEmail' },
  borrowerText: { label: 'Borrower text message', audience: 'borrower', sms: true },
  insuranceEmail: { label: 'Insurance agent', audience: 'party', toKey: 'insuranceEmail' },
  titleEmail: { label: 'Title / escrow', audience: 'party', toKey: 'titleEmail' },
  appraiserEmail: { label: 'Appraiser / AMC', audience: 'party', toKey: 'appraiserEmail' },
  internalEmail: { label: 'Internal: processor follow-up', audience: 'internal', toKey: 'processorEmail' }
};
const sel = (name, map, val) => `<select name="${name}">${Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

function ctextHtml(c, L) {
  return `<div>${esc(c.plain)}${c.isNew ? ' <span class="st alert">New</span>' : ''}</div>${c.why ? `<div class="cwhy">Why: ${esc(c.why)}</div>` : ''}
    <div class="cmeta"><span class="st">${esc(PROVIDER_LABEL[c.provider] || '')}</span><span class="st">${TIMING_LABEL[c.timing]}</span><span class="st">${RECEIVER_LABEL[c.receiver]} receives</span>${c.borrowerVisible ? '<span class="st good">Borrower sees this</span>' : '<span class="st">Hidden from borrower</span>'}${L?.inputs?.language === 'he' && c.heStale ? '<span class="st alert">Hebrew may be out of date</span>' : ''}</div>`;
}

// Done = cleared, or received with nothing left to review.
const condDone = (c) => c.status === 'cleared' || (c.status === 'received' && !(c.uploads || []).some((u) => !u.review && !u.deletedAt));

// Files uploaded for a condition, with the AI's first check and the team's review.
const VERDICT = { looks_good: ['AI: looks good', 'good'], needs_attention: ['AI: possible issue', 'alert'], cant_tell: ['AI: couldn’t tell', ''] };
function uploadsHtml(c, L) {
  const ups = c.uploads || [];
  const closed = L.status === 'closed';
  const list = ups.map((u) => {
    const ai = u.ai || {};
    const chip = ai.state === 'pending' ? '<span class="st wait">AI checking…</span>' : ai.state === 'failed' ? `<span class="st">AI check failed</span> <button class="btn link" data-urecheck="${u.id}" style="min-height:0;padding:0;font-size:12px">Try again</button>` : ai.state === 'off' ? '<span class="st">No AI check</span>' : `<span class="st ${VERDICT[ai.verdict]?.[1] || ''}">${VERDICT[ai.verdict]?.[0] || 'AI'}</span>`;
    const rv = u.review ? `<span class="st ${u.review.decision === 'accepted' ? 'good' : 'alert'}">${u.review.decision === 'accepted' ? 'Accepted' : 'Sent back'} by ${esc(u.review.by)}</span>` : '<span class="st alert">Needs review</span>';
    return `<div class="upl" data-uid="${u.id}">
      <div class="upl-top">${u.deletedAt ? `<span>📄 ${esc(u.name)} <span class="small" style="padding:0">(deleted at closing)</span></span>` : `<a href="/api/loans/${L.id}/uploads/${u.id}" target="_blank" rel="noopener">📄 ${esc(u.name)}</a>`}<span class="small" style="padding:0">${esc(when(u.at))} · ${u.byRole === 'borrower' ? 'borrower' : esc(u.by)}</span>${chip}${rv}</div>
      ${ai.state === 'done' && (ai.summary || (ai.issues || []).length) ? `<div class="upl-ai">${esc(ai.summary || '')}${(ai.issues || []).length ? `<ul>${ai.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>` : ''}
      ${u.review?.decision === 'returned' && u.review.reason ? `<div class="small" style="padding:2px 0 0">Told the borrower: “${esc(u.review.reason)}”</div>` : ''}
      ${!u.review && !closed && !u.deletedAt ? `<div class="row-actions" style="margin-top:6px"><button class="btn secondary" data-uaccept="${u.id}" style="min-height:34px;font-size:13px">Accept</button><button class="btn link" data-ureturnopen="${u.id}" style="min-height:34px;font-size:13px">Send back…</button></div>
        <div class="upl-return" hidden><label class="field">What does the borrower need to fix? (sent to them with their link)<textarea rows="2" data-polish="borrower" placeholder="e.g. Page 3 of the statement is missing. Please upload all pages.">${esc(ai.state === 'done' && ai.verdict === 'needs_attention' ? ai.borrowerMessage || '' : '')}</textarea></label><div class="row-actions"><button class="btn primary" data-ureturn="${u.id}" style="min-height:34px;font-size:13px">Send back to borrower</button></div></div>` : ''}
    </div>`;
  }).join('');
  const canAdd = !closed && c.status !== 'cleared';
  return `<div class="uploads">${list}${canAdd ? `<label class="btn link upl-add" style="min-height:0;padding:4px 0;font-size:13px;cursor:pointer"><input type="file" accept="application/pdf,image/*" data-uadd="${c.id}" hidden>+ Upload a file for this item</label>` : ''}</div>`;
}

// Request cards: the item list is built from the live checklist (edit a condition to change it);
// the team adds a personal note and can change the subject and recipient.
function draftCard(k, d, D) {
  const inputs = D.loan.inputs || {}, m = DRAFT_META[k];
  const to = d.to || (m.toKey ? inputs[m.toKey] || '' : '');
  return `<div class="draft" data-draft="${k}"><div class="dhead"><strong>${esc(m.label)}</strong> <span class="st good">Items update with the checklist</span></div>
      ${m.sms ? `<div class="small" style="padding:0">To: ${esc(inputs.borrowerPhone || 'no phone on file')}${inputs.smsConsent ? '' : ' · borrower has not agreed to texts'}</div>` : `<div class="grid-f" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr)"><label class="field">To<input name="to" value="${esc(to)}" placeholder="email address"></label><label class="field">Subject<input name="subject" value="${esc(d.subject)}" placeholder="${esc(d.defaultSubject)}"></label></div>`}
      <label class="field">Your note (optional, added at the top)<textarea name="note" rows="2" data-polish="${m.audience}" placeholder="${m.audience === 'borrower' ? 'e.g. Congrats again on the approval! Just a few items left.' : 'e.g. Please send by Friday so we can stay on schedule.'}">${esc(d.note)}</textarea></label>
      <div class="dprev-label small">What will be sent</div>
      <div class="dpreview" ${/[\u0590-\u05FF]/.test(d.body) ? 'dir="rtl"' : ''}>${esc(d.body)}</div>
      <div class="row-actions"><button class="btn secondary" data-copy="${k}" style="min-height:40px;font-size:13px">Copy</button>${m.sms ? `<button class="btn primary" data-sendsms="${k}" style="min-height:40px;font-size:13px" ${D.smsEnabled && inputs.smsConsent ? '' : 'disabled'}>Send text</button>` : `<button class="btn primary" data-sendmail="${k}" style="min-height:40px;font-size:13px" ${D.emailEnabled ? '' : 'disabled'}>Send email</button>`}<span class="dmsg small" style="padding:0"></span></div></div>`;
}
function draftsHtml(drafts, D) {
  const keys = Object.keys(drafts || {}).filter((k) => DRAFT_META[k]);
  if (!keys.length) return '<p class="small" style="padding:0">Nothing open that needs a request right now.</p>';
  return keys.map((k) => draftCard(k, drafts[k], D)).join('');
}

export function showApprovalPanel(status) {
  return ['confirmed', 'uw_approved', 'uw_restructure', 'uw_declined', 'locked', 'closed'].includes(status);
}

export function renderApproval(D) {
  const L = D.loan, A = L.approval, sent = D.sentTerms || {};
  const drop = (label) => `<label class="drop" id="approval-drop" style="padding:22px"><strong>${esc(label)}</strong><span class="small" style="padding:0">Drop the approval PDF here or click to choose it. AI reads every condition; you review everything before anything goes out.</span><input type="file" accept="application/pdf" hidden></label>`;
  let body = '';
  if (!A) body = drop('Upload the underwriting approval');
  else if (A.status === 'processing') {
    const stuck = Date.now() - new Date(A.retriedAt || A.uploadedAt).getTime() > 4 * 60 * 1000;
    body = `<div class="banner-ok"><strong>Reading the approval…</strong> <span class="small" style="padding:0">This usually takes 30–90 seconds. This page refreshes on its own.</span></div>
      ${stuck ? '<div class="row-actions" style="margin-top:10px"><span class="small" style="padding:0">Taking longer than usual.</span><button class="btn secondary" data-ap="retry">Try again</button></div>' : ''}`;
  } else if (A.status === 'failed') {
    body = `<div class="msgline err">Could not read the approval: ${esc(A.error)}</div><div class="row-actions" style="margin-top:10px"><button class="btn secondary" data-ap="retry">Try again</button></div><div style="margin-top:12px">${drop('Or upload it again')}</div>`;
  } else {
    const f = A.facts || {};
    const lockDays = daysUntil(f.lockExpires);
    const facts = [
      ['Loan amount', $$(f.loanAmount)], ['LTV', f.ltv !== null && f.ltv !== undefined ? `${f.ltv}%` : '—'], ['Rate', f.rate ? `${f.rate}%` : '—'], ['DSCR', f.dscr ?? '—'],
      ['Rate lock expires', f.lockExpires ? `${dateLong(f.lockExpires)}${lockDays !== null ? ` (${lockDays} days)` : ''}` : '—'], ['Approval expires', dateLong(f.approvalExpires)],
      ['Reserves required', $$(f.reservesRequired)], ['Max cash to close', $$(f.maxCashToClose)]
    ];
    const diff = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && Math.abs(Number(a) - Number(b)) > 0.005;
    const cmp = [['Loan amount', sent.loanAmount, f.loanAmount, $$], ['LTV', sent.ltv, f.ltv, (x) => `${x}%`], ['Rate', sent.rate, f.rate, (x) => `${x}%`]];
    const structureChanged = diff(sent.loanAmount, f.loanAmount) || diff(sent.ltv, f.ltv) || f.restructureRequired;
    const conds = A.conditions || [];
    const done = conds.filter((c) => ['received', 'cleared'].includes(c.status)).length;
    const groups = Object.keys(PROVIDER_LABEL).map((p) => [p, conds.filter((c) => c.provider === p)]).filter(([, xs]) => xs.length);
    const row = (c) => `<div class="cond ${condDone(c) ? 'cond-done' : ''}" data-cid="${c.id}">
        <div class="cond-top">
          <span class="cnum">#${esc(c.num)}</span>
          <div class="ctext">${ctextHtml(c, L)}</div>
          <label class="sr-only" for="st-${c.id}">Status for #${esc(c.num)}</label>
          <select id="st-${c.id}" class="cstatus" data-cid="${c.id}">${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${k === c.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        ${uploadsHtml(c, L)}
        <details class="cedit"><summary>Edit · original wording</summary>
          <div class="small" style="padding:6px 0">Approval says: “${esc(c.original)}”</div>
          <label class="field">What's needed (plain English)<textarea name="plain" rows="2" data-polish="borrower">${esc(c.plain)}</textarea></label>
          <label class="field">Why (optional, short)<input name="why" value="${esc(c.why)}"></label>
          ${L.inputs?.language === 'he' ? `<label class="field">Hebrew wording<textarea name="plainHe" rows="2" dir="rtl">${esc(c.plainHe)}</textarea></label><label class="field">Hebrew why<input name="whyHe" dir="rtl" value="${esc(c.whyHe)}"></label>` : ''}
          <div class="grid-f" style="grid-template-columns:repeat(3,minmax(0,1fr))"><label class="field">Provided by${sel('provider', PROVIDER_LABEL, c.provider)}</label><label class="field">Received by${sel('receiver', RECEIVER_LABEL, c.receiver)}</label><label class="field">When${sel('timing', TIMING_LABEL, c.timing)}</label></div>
          <label class="field check"><input type="checkbox" name="borrowerVisible" ${c.borrowerVisible ? 'checked' : ''}> Show on the borrower's checklist</label>
        </details></div>`;
    body = `<div class="small" style="padding:0 0 10px">${A.file ? `<a href="/api/loans/${L.id}/approval-file" target="_blank" rel="noopener">${esc(A.file.name)}</a> · ` : ''}uploaded ${esc(when(A.uploadedAt))} by ${esc(A.uploadedBy)} · read by ${esc(A.provider || 'AI')}${A.n > 1 ? ` · upload #${A.n}` : ''}</div>
      <div class="facts">${facts.map(([k, v]) => `<div><div class="fk">${k}</div><div class="fv">${esc(v)}</div></div>`).join('')}</div>
      <div style="margin-top:14px"><div class="kv" style="border-top:none;font-size:12px;font-weight:600;color:var(--muted)"><div>Compared with what the borrower confirmed</div><div>Confirmed</div><div>Approval</div></div>
        ${cmp.map(([k, a, b, fm]) => `<div class="kv"><div class="k">${k}</div><div class="v">${a === null || a === undefined ? '—' : esc(fm(a))}</div><div class="v ${diff(a, b) ? (k === 'Rate' ? '' : 'bad') : 'ok'}">${b === null || b === undefined ? '—' : esc(fm(b))}${diff(a, b) ? (k === 'Rate' ? ' (market)' : ' (changed)') : ' ✓'}</div></div>`).join('')}</div>
      ${structureChanged ? `<div class="banner-alert" style="margin-top:12px"><strong>Looks like a restructure.</strong> <span class="small" style="padding:0">${esc(f.restructureNotes || 'The approved loan amount or LTV differs from what the borrower confirmed.')}</span></div>` : '<div class="banner-ok" style="margin-top:12px"><strong>Approved as requested:</strong> loan amount and LTV match what the borrower confirmed.</div>'}
      ${['confirmed', 'uw_approved', 'uw_restructure', 'uw_declined'].includes(D.loan.status) ? '<div class="row-actions" style="margin-top:10px"><button class="btn secondary" data-ap="use-facts" style="min-height:40px;font-size:13px">Fill the underwriting result from this approval</button></div>' : ''}
      ${(A.flags || []).length ? `<div class="flags" style="margin-top:14px"><strong>Heads up</strong>${A.flags.map((x) => `<div>• ${esc(x)}</div>`).join('')}</div>` : ''}
      ${(A.removedSincePrevious || []).length ? `<div class="small" style="padding:8px 0 0">No longer on the approval: #${A.removedSincePrevious.map(esc).join(', #')}</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:18px;gap:12px;flex-wrap:wrap"><h3 style="margin:0">Conditions (${done} of ${conds.length} received or cleared)</h3><span class="small" style="padding:0">Every change saves automatically and updates the borrower’s page and the requests below.</span></div>
      ${groups.map(([p, xs]) => `<div class="cgroup"><div class="cgh">${PROVIDER_LABEL[p]} <span class="small" style="padding:0">${xs.filter((c) => !['received', 'cleared'].includes(c.status)).length} open</span></div>${xs.map(row).join('')}</div>`).join('')}
      <h3 style="margin:22px 0 8px">Requests ready to send</h3><p class="small" style="padding:0 0 8px">Built from the open conditions above. To change an item, edit the condition and every request (and the borrower’s page) updates. Add a note on top if you like. Borrower messages always include the link to their loan page. Emails to outside parties copy the processor and you.</p>
      <div id="ap-drafts">${draftsHtml(D.approvalDrafts, D)}</div>
      <div class="row-actions" style="margin-top:16px">${D.loan.status === 'locked' ? '<button class="btn secondary" data-ap="notify">Notify borrower: checklist updated</button>' : ''}<span id="ap-msg" class="small" style="padding:0">Changes save automatically.</span></div>
      <details style="margin-top:16px"><summary class="small" style="padding:0;cursor:pointer">Upload a newer approval (keeps progress on matching conditions)</summary><div style="margin-top:10px">${drop('Upload the updated approval')}</div></details>`;
  }
  return `<div class="tcard" id="approval-card"><h3>Underwriting approval &amp; conditions</h3>${body}</div>`;
}

const pendingTries = {};
export function wireApproval(D, ctx) {
  const card = document.getElementById('approval-card'); if (!card) return;
  const A = D.loan.approval, id = D.loan.id;
  enhancePolish(card);
  const msg = (t, ok = true) => { const el = document.getElementById('ap-msg'); if (el) { el.textContent = t; el.className = `small ${ok ? '' : 'bad'}`; } };

  const z = card.querySelector('#approval-drop');
  if (z) {
    const inp = z.querySelector('input');
    const go = async (file) => {
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) return ctx.flash(false, 'The PDF must be 4 MB or smaller.');
      try { const { text, base64 } = await ctx.pdfText(file); await ctx.api(`loans/${id}/approval`, { method: 'POST', body: { text, file: { name: file.name, base64 } } }); await ctx.reload('Approval uploaded. Reading it now.'); }
      catch (e) { ctx.flash(false, e.message); }
    };
    inp.addEventListener('change', () => go(inp.files[0]));
    z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('over'); });
    z.addEventListener('dragleave', () => z.classList.remove('over'));
    z.addEventListener('drop', (e) => { e.preventDefault(); z.classList.remove('over'); go(e.dataTransfer.files[0]); });
  }
  if (A?.status === 'processing') {
    clearTimeout(window.__apPoll);
    window.__apPoll = setTimeout(async () => { if (location.hash.includes(id)) { try { const d = await ctx.api(`loans/${id}`); if (d.loan.approval?.status !== 'processing') ctx.reload(); else wireApproval(D, ctx); } catch { /* ignore */ } } }, 4000);
  }
  card.querySelectorAll('[data-ap]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault();
    const a = b.dataset.ap;
    if (a === 'retry') { try { await ctx.api(`loans/${id}/approval-retry`, { method: 'POST', body: {} }); ctx.reload('Trying again.'); } catch (er) { ctx.flash(false, er.message); } }
    if (a === 'use-facts') {
      const f = A.facts || {}, form = document.getElementById('uw-form');
      if (!form) return ctx.flash(false, 'The underwriting result form is not available at this stage.');
      const sent = D.sentTerms || {};
      const changed = (f.loanAmount && sent.loanAmount && Math.abs(f.loanAmount - sent.loanAmount) > 0.005) || (f.ltv && sent.ltv && Math.abs(f.ltv - sent.ltv) > 0.005) || f.restructureRequired;
      const set = (n, v) => { const el = form.querySelector(`[name="${n}"]`); if (el && v !== null && v !== undefined) el.value = v; };
      set('approvedLtv', f.ltv); set('approvedRate', f.rate); set('approvedLoanAmount', f.loanAmount);
      const r = form.querySelector(`input[name=result][value=${changed ? 'restructure' : 'approved'}]`); if (r) r.checked = true;
      if (changed && f.restructureNotes) set('reason', f.restructureNotes);
      form.dispatchEvent(new Event('input', { bubbles: true }));
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ctx.flash(true, 'Underwriting result filled from the approval. Review it, then save or notify the borrower.');
    }
    if (a === 'notify') {
      if (!confirm('Email (and text, if allowed) the borrower that their checklist was updated?')) return;
      try { const r = await ctx.api(`loans/${id}/notify-checklist`, { method: 'POST', body: {} }); ctx.reload(r.emailed ? 'Borrower notified.' : `The borrower's page is updated, but the email was not sent (${r.emailError}).`); } catch (er) { ctx.flash(false, er.message); }
    }
  }));
  // ---- Autosave ----
  const draftsBox = card.querySelector('#ap-drafts');
  const applyResult = (r) => {
    for (const c of r.conditions || []) {
      const row = card.querySelector(`.cond[data-cid="${c.id}"]`); if (!row) continue;
      row.querySelector('.ctext').innerHTML = ctextHtml(c, D.loan);
      row.classList.toggle('cond-done', condDone(c));
      for (const k of ['plainHe', 'whyHe']) { const f = row.querySelector(`.cedit [name=${k}]`); if (f && document.activeElement !== f) f.value = c[k] || ''; }
    }
    if (r.drafts && draftsBox) {
      // Update each card's preview in place; add or remove cards as items open and close.
      // Never touch a field someone is typing in.
      const keys = Object.keys(r.drafts).filter((k) => DRAFT_META[k]);
      if (!keys.length) { draftsBox.innerHTML = draftsHtml({}, D); }
      else {
        draftsBox.querySelectorAll(':scope > p').forEach((x) => x.remove());
        draftsBox.querySelectorAll('.draft').forEach((el) => { if (!keys.includes(el.dataset.draft) && !el.contains(document.activeElement)) el.remove(); });
        let prev = null;
        for (const k of keys) {
          const d = r.drafts[k];
          let el = draftsBox.querySelector(`.draft[data-draft="${k}"]`);
          if (!el) {
            const h = document.createElement('div'); h.innerHTML = draftCard(k, d, D); el = h.firstElementChild;
            if (prev) prev.after(el); else draftsBox.prepend(el);
            enhancePolish(el);
          } else {
            const pv = el.querySelector('.dpreview'); pv.textContent = d.body; pv.dir = /[\u0590-\u05FF]/.test(d.body) ? 'rtl' : 'ltr';
          }
          prev = el;
        }
      }
    }
  };
  const inflight = new Set();
  const save = (body, okText) => { const pr = doSave(body, okText); inflight.add(pr); pr.finally(() => inflight.delete(pr)); return pr; };
  const doSave = async (body, okText) => {
    msg('Saving…');
    try {
      const r = await ctx.api(`loans/${id}/conditions`, { method: 'POST', body });
      applyResult(r);
      if (r.translateFailed?.length) msg('Saved, but the Hebrew wording could not be updated. Edit it by hand or try again.', false);
      else msg(okText || 'All changes saved.');
      return r;
    } catch (er) { msg(er.message, false); return null; }
  };
  const timers = new Map(), pendingFns = new Map();
  const later = (key, fn, ms) => { clearTimeout(timers.get(key)); pendingFns.set(key, fn); timers.set(key, setTimeout(() => { pendingFns.delete(key); fn(); }, ms)); };
  // Before copying or sending: run any edit that's still waiting to save, and wait for saves in progress.
  const flush = async () => {
    for (const [key, fn] of pendingFns) { clearTimeout(timers.get(key)); pendingFns.delete(key); fn(); }
    while (inflight.size) await Promise.allSettled([...inflight]);
  };
  const condUpdate = (row) => {
    const u = { id: row.dataset.cid };
    row.querySelectorAll('.cedit [name]').forEach((f) => { u[f.name] = f.type === 'checkbox' ? f.checked : f.value; });
    return u;
  };
  const draftSettings = (dr) => ({ to: dr.querySelector('[name=to]')?.value || '', subject: dr.querySelector('[name=subject]')?.value ?? '', note: dr.querySelector('[name=note]').value });
  const draftPayload = (dr) => ({ [dr.dataset.draft]: draftSettings(dr) });
  card.addEventListener('change', (e) => {
    const t = e.target;
    if (t.classList.contains('cstatus')) {
      const row = t.closest('.cond');
      save({ updates: [{ id: t.dataset.cid, status: t.value }] }, `#${row.querySelector('.cnum').textContent.slice(1)} marked ${STATUS_LABEL[t.value].toLowerCase()}.`);
      return;
    }
    const row = t.closest('.cedit')?.closest('.cond');
    if (row) { clearTimeout(timers.get(`c:${row.dataset.cid}`)); save({ updates: [condUpdate(row)] }); return; }
    const dr = t.closest('.draft');
    if (dr && t.matches('input, textarea')) { clearTimeout(timers.get(`d:${dr.dataset.draft}`)); pendingFns.delete(`d:${dr.dataset.draft}`); save({ drafts: draftPayload(dr) }); }
  });
  card.addEventListener('input', (e) => {
    const t = e.target;
    const row = t.closest('.cedit')?.closest('.cond');
    if (row && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'checkbox'))) { later(`c:${row.dataset.cid}`, () => save({ updates: [condUpdate(row)] }), 900); return; }
    const dr = t.closest('.draft');
    if (dr) later(`d:${dr.dataset.draft}`, () => save({ drafts: draftPayload(dr) }), 700);
  });

  // ---- Request cards (delegated, so they keep working after a refresh) ----
  card.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy],[data-sendmail],[data-sendsms]'); if (!b) return;
    e.preventDefault();
    const el = b.closest('.draft'), dm = el.querySelector('.dmsg'), k = el.dataset.draft;
    dm.textContent = 'Getting the latest…';
    await flush(); // the preview now reflects every edit made so far
    dm.textContent = '';
    const card2 = draftsBox.querySelector(`.draft[data-draft="${k}"]`) || el;
    if (b.dataset.copy) {
      const subj = card2.querySelector('[name=subject]')?.value || card2.querySelector('[name=subject]')?.placeholder;
      const text = (subj ? `Subject: ${subj}\n\n` : '') + card2.querySelector('.dpreview').textContent;
      try { await navigator.clipboard.writeText(text); dm.textContent = 'Copied.'; } catch { dm.textContent = 'Could not copy. Select the text in the preview and copy it.'; }
      return;
    }
    const st = draftSettings(card2);
    if (b.dataset.sendmail) {
      const to = st.to.trim();
      if (!to) { dm.textContent = 'Enter an email address first.'; return; }
      if (!confirm(`Send "${st.subject || card2.querySelector('[name=subject]').placeholder}" to ${to}?`)) return;
    } else if (!confirm('Text this message to the borrower?')) return;
    b.disabled = true;
    // The server rebuilds the message from the checklist at this moment, with this note, so it can't be stale.
    try { await ctx.api(`loans/${id}/message`, { method: 'POST', body: { channel: b.dataset.sendsms ? 'sms' : 'email', kind: k, ...st } }); dm.textContent = 'Sent.'; }
    catch (er) { dm.textContent = er.message; }
    b.disabled = false;
  });

  // ---- Uploaded documents: accept / send back / re-check / add a file ----
  card.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-uaccept],[data-ureturnopen],[data-ureturn],[data-urecheck]'); if (!b) return;
    e.preventDefault();
    const box = b.closest('.upl');
    if (b.dataset.ureturnopen) { const r = box.querySelector('.upl-return'); r.hidden = !r.hidden; if (!r.hidden) r.querySelector('textarea').focus(); return; }
    b.disabled = true;
    try {
      if (b.dataset.uaccept) { await ctx.api(`loans/${id}/uploads/${b.dataset.uaccept}/review`, { method: 'POST', body: { decision: 'accept' } }); ctx.reload('Accepted.'); }
      if (b.dataset.ureturn) {
        const reason = box.querySelector('.upl-return textarea').value.trim();
        if (!reason) { b.disabled = false; box.querySelector('.upl-return textarea').focus(); return; }
        const r = await ctx.api(`loans/${id}/uploads/${b.dataset.ureturn}/review`, { method: 'POST', body: { decision: 'return', reason } });
        ctx.reload(`Sent back. ${r.emailed ? 'The borrower was emailed' : r.emailed === false ? 'The email did not go out' : 'No email (email not set up)'}${r.texted ? ' and texted' : ''}.`);
      }
      if (b.dataset.urecheck) { await ctx.api(`loans/${id}/uploads/${b.dataset.urecheck}/recheck`, { method: 'POST', body: {} }); ctx.reload('Checking again…'); }
    } catch (er) { ctx.flash(false, er.message); b.disabled = false; }
  });
  card.addEventListener('change', async (e) => {
    const inp = e.target.closest('input[data-uadd]'); if (!inp || !inp.files[0]) return;
    e.stopPropagation();
    const f = inp.files[0];
    if (f.size > 5 * 1024 * 1024) { ctx.flash(false, 'That file is larger than 5 MB.'); return; }
    try {
      const r = await fetch(`/api/loans/${id}/upload?cid=${encodeURIComponent(inp.dataset.uadd)}&name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream' }, body: f });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Upload failed.');
      ctx.reload('File added. The AI check is running.');
    } catch (er) { ctx.flash(false, er.message); }
  }, true);
  // While an AI check is running, refresh the page every few seconds (skipped while someone is typing).
  const anyPending = (D.loan.approval?.conditions || []).some((c) => (c.uploads || []).some((u) => u.ai?.state === 'pending'));
  if (anyPending) {
    const tries = (pendingTries[id] = (pendingTries[id] || 0) + 1);
    if (tries < 40) setTimeout(() => { const a = document.activeElement; if (!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) && document.body.contains(card)) ctx.reload(); }, 5000);
  }
}
