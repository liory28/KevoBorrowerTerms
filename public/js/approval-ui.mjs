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

export function showApprovalPanel(status) {
  return ['confirmed', 'uw_approved', 'uw_restructure', 'uw_declined', 'locked'].includes(status);
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
    const row = (c) => `<div class="cond ${['received', 'cleared'].includes(c.status) ? 'cond-done' : ''}" data-cid="${c.id}">
        <div class="cond-top">
          <span class="cnum">#${esc(c.num)}</span>
          <div class="ctext"><div>${esc(c.plain)}${c.isNew ? ' <span class="st alert">New</span>' : ''}</div>${c.why ? `<div class="cwhy">Why: ${esc(c.why)}</div>` : ''}
            <div class="cmeta"><span class="st">${TIMING_LABEL[c.timing]}</span><span class="st">${RECEIVER_LABEL[c.receiver]} receives</span>${c.borrowerVisible ? '<span class="st good">Borrower sees this</span>' : ''}</div></div>
          <label class="sr-only" for="st-${c.id}">Status for #${esc(c.num)}</label>
          <select id="st-${c.id}" class="cstatus" data-cid="${c.id}">${Object.entries(STATUS_LABEL).map(([k, l]) => `<option value="${k}" ${k === c.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        <details class="cedit"><summary>Edit · original wording</summary>
          <div class="small" style="padding:6px 0">Approval says: “${esc(c.original)}”</div>
          <label class="field">What's needed (plain English)<textarea name="plain" rows="2" data-polish="borrower">${esc(c.plain)}</textarea></label>
          <label class="field">Why (optional, short)<input name="why" value="${esc(c.why)}"></label>
          ${L.inputs?.language === 'he' ? `<label class="field">Hebrew wording<textarea name="plainHe" rows="2" dir="rtl">${esc(c.plainHe)}</textarea></label><label class="field">Hebrew why<input name="whyHe" dir="rtl" value="${esc(c.whyHe)}"></label>` : ''}
          <div class="grid-f" style="grid-template-columns:repeat(3,minmax(0,1fr))"><label class="field">Provided by${sel('provider', PROVIDER_LABEL, c.provider)}</label><label class="field">Received by${sel('receiver', RECEIVER_LABEL, c.receiver)}</label><label class="field">When${sel('timing', TIMING_LABEL, c.timing)}</label></div>
          <label class="field check"><input type="checkbox" name="borrowerVisible" ${c.borrowerVisible ? 'checked' : ''}> Show on the borrower's checklist</label>
        </details></div>`;
    const inputs = L.inputs || {};
    const draftCard = (k, d) => {
      const m = DRAFT_META[k]; if (!m) return '';
      const to = d.to || (m.toKey ? inputs[m.toKey] || '' : '');
      return `<div class="draft" data-draft="${k}"><div class="dhead"><strong>${esc(m.label)}</strong></div>
        ${m.sms ? `<div class="small" style="padding:0 0 6px">To: ${esc(inputs.borrowerPhone || 'no phone on file')}${inputs.smsConsent ? '' : ' · borrower has not agreed to texts'}</div>` : `<label class="field">To<input name="to" value="${esc(to)}" placeholder="email address"></label><label class="field">Subject<input name="subject" value="${esc(d.subject)}"></label>`}
        <label class="field">Message<textarea name="body" rows="${m.sms ? 3 : 9}" data-polish="${m.audience}">${esc(d.body)}</textarea></label>
        <div class="row-actions"><button class="btn secondary" data-copy="${k}" style="min-height:40px;font-size:13px">Copy</button>${m.sms ? `<button class="btn primary" data-sendsms="${k}" style="min-height:40px;font-size:13px" ${D.smsEnabled && inputs.smsConsent ? '' : 'disabled'}>Send text</button>` : `<button class="btn primary" data-sendmail="${k}" style="min-height:40px;font-size:13px" ${D.emailEnabled ? '' : 'disabled'}>Send email</button>`}<span class="dmsg small" style="padding:0"></span></div></div>`;
    };
    body = `<div class="small" style="padding:0 0 10px">${A.file ? `<a href="/api/loans/${L.id}/approval-file" target="_blank" rel="noopener">${esc(A.file.name)}</a> · ` : ''}uploaded ${esc(when(A.uploadedAt))} by ${esc(A.uploadedBy)} · read by ${esc(A.provider || 'AI')}${A.n > 1 ? ` · upload #${A.n}` : ''}</div>
      <div class="facts">${facts.map(([k, v]) => `<div><div class="fk">${k}</div><div class="fv">${esc(v)}</div></div>`).join('')}</div>
      <div style="margin-top:14px"><div class="kv" style="border-top:none;font-size:12px;font-weight:600;color:var(--muted)"><div>Compared with what the borrower confirmed</div><div>Confirmed</div><div>Approval</div></div>
        ${cmp.map(([k, a, b, fm]) => `<div class="kv"><div class="k">${k}</div><div class="v">${a === null || a === undefined ? '—' : esc(fm(a))}</div><div class="v ${diff(a, b) ? (k === 'Rate' ? '' : 'bad') : 'ok'}">${b === null || b === undefined ? '—' : esc(fm(b))}${diff(a, b) ? (k === 'Rate' ? ' (market)' : ' (changed)') : ' ✓'}</div></div>`).join('')}</div>
      ${structureChanged ? `<div class="banner-alert" style="margin-top:12px"><strong>Looks like a restructure.</strong> <span class="small" style="padding:0">${esc(f.restructureNotes || 'The approved loan amount or LTV differs from what the borrower confirmed.')}</span></div>` : '<div class="banner-ok" style="margin-top:12px"><strong>Approved as requested:</strong> loan amount and LTV match what the borrower confirmed.</div>'}
      ${['confirmed', 'uw_approved', 'uw_restructure', 'uw_declined'].includes(D.loan.status) ? '<div class="row-actions" style="margin-top:10px"><button class="btn secondary" data-ap="use-facts" style="min-height:40px;font-size:13px">Fill the underwriting result from this approval</button></div>' : ''}
      ${(A.flags || []).length ? `<div class="flags" style="margin-top:14px"><strong>Heads up</strong>${A.flags.map((x) => `<div>• ${esc(x)}</div>`).join('')}</div>` : ''}
      ${(A.removedSincePrevious || []).length ? `<div class="small" style="padding:8px 0 0">No longer on the approval: #${A.removedSincePrevious.map(esc).join(', #')}</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:18px;gap:12px;flex-wrap:wrap"><h3 style="margin:0">Conditions (${done} of ${conds.length} received or cleared)</h3><span class="small" style="padding:0">Status changes save right away.</span></div>
      ${groups.map(([p, xs]) => `<div class="cgroup"><div class="cgh">${PROVIDER_LABEL[p]} <span class="small" style="padding:0">${xs.filter((c) => !['received', 'cleared'].includes(c.status)).length} open</span></div>${xs.map(row).join('')}</div>`).join('')}
      <h3 style="margin:22px 0 8px">Requests ready to send</h3><p class="small" style="padding:0 0 8px">Review, polish if you like, then copy or send. Emails to outside parties copy the processor and you.</p>
      ${Object.entries(A.drafts || {}).map(([k, d]) => draftCard(k, d)).join('')}
      <div class="row-actions" style="margin-top:16px"><button class="btn primary" data-ap="save">Save checklist &amp; drafts</button>${D.loan.status === 'locked' ? '<button class="btn secondary" data-ap="notify">Notify borrower: checklist updated</button>' : ''}<span id="ap-msg" class="small" style="padding:0"></span></div>
      <details style="margin-top:16px"><summary class="small" style="padding:0;cursor:pointer">Upload a newer approval (keeps progress on matching conditions)</summary><div style="margin-top:10px">${drop('Upload the updated approval')}</div></details>`;
  }
  return `<div class="tcard" id="approval-card"><h3>Underwriting approval &amp; conditions</h3>${body}</div>`;
}

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
    if (a === 'save') {
      const updates = [...card.querySelectorAll('.cond')].map((el) => {
        const u = { id: el.dataset.cid, status: el.querySelector('.cstatus').value };
        el.querySelectorAll('.cedit [name]').forEach((f) => { u[f.name] = f.type === 'checkbox' ? f.checked : f.value; });
        return u;
      });
      const drafts = {};
      card.querySelectorAll('.draft').forEach((el) => { drafts[el.dataset.draft] = { to: el.querySelector('[name=to]')?.value || '', subject: el.querySelector('[name=subject]')?.value || '', body: el.querySelector('[name=body]').value }; });
      try { await ctx.api(`loans/${id}/conditions`, { method: 'POST', body: { updates, drafts } }); ctx.reload('Checklist saved.'); } catch (er) { msg(er.message, false); }
    }
    if (a === 'notify') {
      if (!confirm('Email (and text, if allowed) the borrower that their checklist was updated?')) return;
      try { const r = await ctx.api(`loans/${id}/notify-checklist`, { method: 'POST', body: {} }); ctx.reload(r.emailed ? 'Borrower notified.' : `The borrower's page is updated, but the email was not sent (${r.emailError}).`); } catch (er) { ctx.flash(false, er.message); }
    }
  }));
  card.querySelectorAll('.cstatus').forEach((s) => s.addEventListener('change', async () => {
    const row = s.closest('.cond');
    try { await ctx.api(`loans/${id}/conditions`, { method: 'POST', body: { updates: [{ id: s.dataset.cid, status: s.value }] } }); row.classList.toggle('cond-done', ['received', 'cleared'].includes(s.value)); msg(`#${row.querySelector('.cnum').textContent.slice(1)} marked ${STATUS_LABEL[s.value].toLowerCase()}.`); }
    catch (er) { msg(er.message, false); }
  }));
  card.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault();
    const el = b.closest('.draft'), subj = el.querySelector('[name=subject]')?.value;
    const text = (subj ? `Subject: ${subj}\n\n` : '') + el.querySelector('[name=body]').value;
    try { await navigator.clipboard.writeText(text); el.querySelector('.dmsg').textContent = 'Copied.'; } catch { el.querySelector('[name=body]').select(); el.querySelector('.dmsg').textContent = 'Press Ctrl/Cmd+C to copy.'; }
  }));
  card.querySelectorAll('[data-sendmail]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault();
    const el = b.closest('.draft'), k = b.dataset.sendmail;
    const to = el.querySelector('[name=to]').value.trim();
    if (!to) { el.querySelector('.dmsg').textContent = 'Enter an email address first.'; return; }
    if (!confirm(`Send "${el.querySelector('[name=subject]').value}" to ${to}?`)) return;
    b.disabled = true;
    try { await ctx.api(`loans/${id}/message`, { method: 'POST', body: { channel: 'email', kind: k, to, subject: el.querySelector('[name=subject]').value, body: el.querySelector('[name=body]').value } }); el.querySelector('.dmsg').textContent = 'Sent.'; }
    catch (er) { el.querySelector('.dmsg').textContent = er.message; }
    b.disabled = false;
  }));
  card.querySelectorAll('[data-sendsms]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault();
    const el = b.closest('.draft');
    if (!confirm('Text this message to the borrower?')) return;
    b.disabled = true;
    try { await ctx.api(`loans/${id}/message`, { method: 'POST', body: { channel: 'sms', kind: b.dataset.sendsms, body: el.querySelector('[name=body]').value } }); el.querySelector('.dmsg').textContent = 'Sent.'; }
    catch (er) { el.querySelector('.dmsg').textContent = er.message; }
    b.disabled = false;
  }));
}
