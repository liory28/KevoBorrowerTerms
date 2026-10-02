import { buildTerms, scenario, defaultInputs, fmt } from './calc.mjs';
import { parseWorksheet } from './parse.mjs';
import { pdfToLines } from './lines.mjs';
import { enhancePolish } from './polish.mjs';
import { renderApproval, wireApproval, showApprovalPanel } from './approval-ui.mjs';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $$ = (n, d = 2) => (n === null || n === undefined ? '—' : '$' + fmt(n, d));
const when = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const app = () => $('#app');

const STATUS = {
  draft: ['Draft', ''], ready: ['Ready for LO', 'wait'], sent: ['Waiting on borrower', 'wait'], discuss: ['Borrower wants to talk', 'alert'],
  confirmed: ['Borrower confirmed', 'good'], uw_approved: ['Approved as requested', 'good'], uw_restructure: ['Restructure: call borrower', 'alert'],
  uw_declined: ['Declined: call borrower', 'alert'], locked: ['Locked', 'good']
};
const pill = (s) => { const [l, c] = STATUS[s] || [s, '']; return `<span class="st ${c}">${esc(l)}</span>`; };

let ME = null;
async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch('/api/' + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== 'login') { ME = null; route(); throw new Error('Please log in.'); }
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

function shell(inner) {
  return `<div class="pbar"><a href="#/">Loan Terms Portal</a><div class="me">${ME ? `<a href="#/settings" style="font-weight:600;font-size:13px">Document formats</a><span>${esc(ME.name)} · ${ME.role === 'approver' ? 'Loan officer' : 'Team'}</span><button id="logout">Log out</button>` : ''}</div></div><div class="wrap">${inner}</div>`;
}

// ---------------- Login ----------------
function viewLogin(meInfo) {
  app().innerHTML = shell(`<div class="login tcard"><h1 style="font-size:24px;margin-bottom:16px">Log in</h1>
    <form class="form" id="login-form">
      <label class="field">Your name<input name="name" autocomplete="name" required></label>
      ${meInfo?.approverEnabled !== false ? `<div class="field">Login as<div class="radio-row"><label><input type="radio" name="role" value="team" checked> Team</label><label><input type="radio" name="role" value="approver"> Loan officer</label></div></div>` : '<input type="hidden" name="role" value="team">'}
      <label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>
      <div id="login-msg"></div>
      <button class="btn primary" type="submit">Log in</button></form></div>`);
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await api('login', { method: 'POST', body: Object.fromEntries(f) }); await loadMe(); location.hash = '#/'; route(); }
    catch (er) { $('#login-msg').innerHTML = `<div class="msgline err">${esc(er.message)}</div>`; }
  });
}

// ---------------- Dashboard ----------------
async function viewDashboard() {
  app().innerHTML = shell('<p class="lead">Loading…</p>');
  const { loans } = await api('loans');
  app().innerHTML = shell(`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h1>Loans</h1><a class="btn primary" href="#/new" style="min-height:46px">+ New loan from worksheet</a></div>
    ${loans.length ? `<table class="dash"><thead><tr><th>Borrower</th><th>Property</th><th>Loan #</th><th>Status</th><th>Version</th><th>Updated</th></tr></thead><tbody>
      ${loans.map((l) => `<tr><td><a href="#/loan/${l.id}">${esc(l.borrower || 'Borrower')}</a></td><td>${esc(l.property)}</td><td>${esc(l.loanNumber)}</td><td>${pill(l.status)}</td><td>${l.version ? 'v' + l.version : '—'}</td><td>${esc(when(l.updatedAt))}</td></tr>`).join('')}
    </tbody></table>` : '<div class="tcard"><p class="lead">No loans yet. Start by uploading an Initial Fees Worksheet.</p></div>'}`);
}

// ---------------- Inputs form (shared by New + Loan pages) ----------------
function inputsForm(inp, t, editable) {
  const dis = editable ? '' : 'disabled';
  const v = (x) => (x === null || x === undefined ? '' : esc(x));
  return `<form class="form" id="inputs-form">
    <div class="grid-f">
      <label class="field">Borrower name<input name="borrowerName" value="${v(inp.borrowerName)}" ${dis}></label>
      <label class="field">Borrower email *<input name="borrowerEmail" type="email" value="${v(inp.borrowerEmail)}" ${dis}></label>
      <label class="field">Borrower phone<input name="borrowerPhone" value="${v(inp.borrowerPhone)}" ${dis}></label>
      <label class="field">Borrower language<select name="language" ${dis}><option value="en" ${inp.language !== 'he' ? 'selected' : ''}>English</option><option value="he" ${inp.language === 'he' ? 'selected' : ''}>Hebrew</option></select><span class="hint">Emails and the page open in this language. The borrower can switch.</span></label>
      <label class="field">Transaction<select name="transaction" ${dis}><option value="purchase" ${inp.transaction === 'purchase' ? 'selected' : ''}>Purchase</option><option value="refi" ${inp.transaction === 'refi' ? 'selected' : ''}>Refinance</option></select></label>
      <label class="field">Estimated property value${inp.transaction === 'refi' ? ' *' : ''}<input name="estimatedValue" inputmode="decimal" value="${v(inp.estimatedValue)}" ${dis} ${inp.transaction === 'purchase' ? 'placeholder="Not needed for a purchase"' : ''}><span class="hint">Refinance only. Not on the worksheet.</span></label>
      <label class="field">Rate lock<select name="lockStatus" ${dis}><option value="not_locked" ${inp.lockStatus !== 'locked' ? 'selected' : ''}>Not locked</option><option value="locked" ${inp.lockStatus === 'locked' ? 'selected' : ''}>Locked</option></select></label>
      <label class="field">Impounds<select name="impounds" ${dis}><option value="auto" ${inp.impounds === 'auto' ? 'selected' : ''}>From worksheet (${t.impoundsIncluded && inp.impounds === 'auto' ? 'included' : 'reserves → included, none → not included'})</option><option value="included" ${inp.impounds === 'included' ? 'selected' : ''}>Included</option><option value="not_included" ${inp.impounds === 'not_included' ? 'selected' : ''}>Not included</option></select></label>
      <label class="field">Prepayment penalty (years) *<input name="pppYears" inputmode="numeric" value="${v(inp.pppYears)}" ${dis}><span class="hint">Read from the program name. 0 = none. 3 years offers the 2-year buy-down.</span></label>
      <label class="field">Penalty schedule<input name="pppSchedule" value="${v(inp.pppSchedule)}" placeholder="e.g. 3% / 2% / 1%" ${dis}></label>
      <label class="field check"><input type="checkbox" name="foreignNational" ${inp.foreignNational ? 'checked' : ''} ${dis}> Foreign National (impounds can't be waived)</label>
      <label class="field check"><input type="checkbox" name="interestOnly" ${inp.interestOnly ? 'checked' : ''} ${dis}> Interest-only</label>
      <label class="field">Interest-only period (years)<input name="ioYears" inputmode="numeric" value="${v(inp.ioYears)}" ${dis}></label>
      <label class="field">Loan officer name<input name="loName" value="${v(inp.loName)}" ${dis}></label>
      <label class="field" style="grid-column:1/-1">Scheduling link<input name="calendlyUrl" value="${v(inp.calendlyUrl)}" ${dis}></label>
      <label class="field" style="grid-column:1/-1">Note to the borrower (optional, shown at the top of their page)<textarea name="noteToBorrower" rows="2" data-polish="borrower" ${dis}>${v(inp.noteToBorrower)}</textarea></label>
      <label class="field check" style="grid-column:1/-1"><input type="checkbox" name="smsConsent" ${inp.smsConsent ? 'checked' : ''} ${dis}> Borrower agreed to receive text messages at the phone above</label>
      <div style="grid-column:1/-1;font-size:13px;font-weight:700;color:var(--ink);padding-top:6px">Team &amp; parties (used for condition requests)</div>
      <label class="field">Processor name<input name="processorName" value="${v(inp.processorName)}" ${dis}></label>
      <label class="field">Processor email<input name="processorEmail" type="email" value="${v(inp.processorEmail)}" ${dis}></label>
      <label class="field">Title / escrow email<input name="titleEmail" type="email" value="${v(inp.titleEmail)}" ${dis}></label>
      <label class="field">Insurance agent email<input name="insuranceEmail" type="email" value="${v(inp.insuranceEmail)}" ${dis}></label>
      <label class="field">Appraiser / AMC email<input name="appraiserEmail" type="email" value="${v(inp.appraiserEmail)}" ${dis}></label>
    </div></form>`;
}
function readInputs() {
  const f = $('#inputs-form'); const o = {};
  for (const el of f.elements) { if (!el.name) continue; o[el.name] = el.type === 'checkbox' ? el.checked : el.value; }
  return o;
}

function checksHtml(checks) {
  if (!checks.length) return '<div class="small">No issues found.</div>';
  const order = { block: 0, warn: 1, info: 2 };
  return [...checks].sort((a, b) => order[a.level] - order[b.level]).map((c) => `<div class="chk"><span class="lv ${c.level}">${c.level === 'block' ? 'Required' : c.level === 'warn' ? 'Check' : 'Note'}</span><span>${esc(c.text)}</span></div>`).join('');
}

function termsHtml(t) {
  const sc = scenario(t, {});
  const purchase = t.transaction === 'purchase';
  const rows = [
    purchase ? ['Purchase price', $$(t.purchasePrice), 'a. Purchase Price'] : ['Estimated value', $$(t.estimatedValue), 'team entry'],
    ['Loan amount', $$(t.loanAmount), 'o. Loan amount'],
    ['Loan-to-value', t.ltv ? `${t.ltv}%` : '—', purchase ? 'loan ÷ price' : 'loan ÷ value'],
    purchase ? ['Down payment', $$(t.downPayment), 'price − loan'] : ['Payoff', $$(t.payoff), 'd. Refi payoff'],
    ['Interest rate', `${t.rate}% · ${t.lockStatus === 'locked' ? 'locked' : 'not locked'}`, 'header · team entry'],
    ['Monthly payment shown', $$(t.monthly.payment), t.impoundsIncluded ? 'Total Monthly Payment' : 'Total − taxes − insurance'],
    ['Points', t.points.dollars ? `${t.points.percent}% · ${$$(t.points.dollars)}` : 'None', 'Discount points'],
    ['Prepayment penalty', t.ppp.years ? `${t.ppp.years} yr${t.options.pppBuydown ? ` (2-yr option ${$$(t.options.pppBuydown.fee)})` : ''}` : 'None', 'program name · team'],
    ['Impounds', t.impoundsIncluded ? `Included${t.options.impoundWaiver ? ` (waiver ${$$(t.options.impoundWaiver.fee)})` : ' (no waiver)'}` : 'Not included', 'Initial escrow section'],
    ['Lender fees', $$(t.lenderFees), 'Origination Charges'],
    ['Third-party & prepaids', $$(t.thirdParty), 'gross − lender − reserves'],
    ['Reserves', $$(t.reserves), 'Initial Escrow Payment'],
    ['Total closing costs', $$(t.grossClosingCosts), 'Estimated Gross Closing Costs'],
    ['Paid before closing', $$(t.paidBeforeClosing), '(poc) items'],
    ...(purchase ? [['Deposit', $$(t.deposit), 'Cash Deposit on sales contract'], ['Seller credit', $$(t.sellerCredit), 'Seller Credit / k.']] : []),
    [sc.funds.direction === 'to_borrower' ? 'Cash to borrower' : 'Cash to close', $$(sc.funds.amount), purchase ? 'down + costs − poc − credits' : 'loan − payoff − costs + poc']
  ];
  return `<div class="kv" style="border-top:none;font-size:12px;font-weight:600;color:var(--muted)"><div>Term</div><div>Borrower sees</div><div>Source</div></div>` + rows.map(([k, v, s]) => `<div class="kv"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join('');
}

// ---------------- New loan ----------------
let pdfjsLib = null;
async function readPdf(file) {
  if (!pdfjsLib) { pdfjsLib = await import('/vendor/pdf.min.mjs'); pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs'; }
  const buf = new Uint8Array(await file.arrayBuffer());
  const pages = await pdfToLines(pdfjsLib, buf.slice());
  return { worksheet: parseWorksheet(pages), base64: b64(buf) };
}
async function pdfText(file) {
  if (!pdfjsLib) { pdfjsLib = await import('/vendor/pdf.min.mjs'); pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs'; }
  const buf = new Uint8Array(await file.arrayBuffer());
  const pages = await pdfToLines(pdfjsLib, buf.slice());
  return { text: pages.map((p, i) => `--- Page ${i + 1} ---\n` + p.join('\n')).join('\n'), base64: b64(buf) };
}
function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }

function dropZone(id, label) {
  return `<label class="drop" id="${id}"><strong>${esc(label)}</strong><span class="small" style="padding:0">Drop the PDF here or click to choose it. It's read in your browser; every number is shown with its source before anything is sent.</span><input type="file" accept="application/pdf" hidden></label>`;
}
function wireDrop(id, onFile) {
  const z = $('#' + id), inp = $('input', z);
  inp.addEventListener('change', () => inp.files[0] && onFile(inp.files[0]));
  z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('over'); });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', (e) => { e.preventDefault(); z.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) onFile(f); });
}

function viewNew() {
  app().innerHTML = shell(`<a href="#/">← Loans</a><h1>New loan</h1>${dropZone('drop', 'Upload the Initial Fees Worksheet (PDF)')}<div id="new-body"></div>`);
  wireDrop('drop', async (file) => {
    $('#new-body').innerHTML = '<p class="lead">Reading the worksheet…</p>';
    let parsed;
    try { if (file.size > 4 * 1024 * 1024) throw new Error('The PDF must be 4 MB or smaller.'); parsed = await readPdf(file); }
    catch (e) { $('#new-body').innerHTML = `<div class="msgline err">Could not read this PDF: ${esc(e.message)}</div>`; return; }
    let ws = parsed.worksheet;
    let inputs = defaultInputs(ws);
    const readable = (w) => w.header?.borrower && w.header?.program && w.gross && (w.sections || []).length >= 5 && !(w.warnings || []).length;
    const draw = () => {
      const { terms, checks } = buildTerms(ws, inputs);
      const fallback = !readable(ws) && ws.readBy !== 'ai' ? `<div class="banner-alert" style="margin-bottom:16px"><strong>This worksheet didn't read cleanly.</strong> <span class="small" style="padding:0">The layout may have changed. Fix the fields by hand, or let AI read it instead (every number is still checked against the worksheet's totals).</span><div class="row-actions" style="margin-top:10px"><button class="btn secondary" id="ai-read" style="min-height:40px;font-size:13px">Read with AI instead</button><span id="ai-msg" class="small" style="padding:0"></span></div></div>` : '';
      $('#new-body').innerHTML = fallback + `<div class="grid2" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-items:start">
        <div class="tcard"><h3>Loan details</h3><p class="small" style="padding:0 0 10px">${esc(ws.header.borrower)} · ${esc(ws.header.property)} · ${esc(ws.header.program)} · Loan # ${esc(ws.header.loanNumber)}</p>${inputsForm(inputs, terms, true)}
          <div id="new-msg" style="margin-top:12px"></div><div class="row-actions" style="margin-top:12px"><button class="btn primary" id="create">Create loan</button></div></div>
        <div style="display:flex;flex-direction:column;gap:16px"><div class="tcard"><h3>Checks</h3>${checksHtml(checks)}</div><div class="tcard"><h3>What the borrower will see</h3>${termsHtml(terms)}</div></div></div>`;
      enhancePolish($('#new-body'));
      $('#ai-read')?.addEventListener('click', async (e) => {
        e.target.disabled = true; $('#ai-msg').textContent = 'The AI is reading the worksheet. This can take a minute…';
        try { const { text } = await pdfText(file); const r = await runJob({ kind: 'read-worksheet', text }); ws = r.worksheet; inputs = { ...defaultInputs(ws), ...inputs, borrowerName: inputs.borrowerName || ws.header?.borrower || '' }; draw(); }
        catch (er) { $('#ai-msg').textContent = er.message; e.target.disabled = false; }
      });
      $('#inputs-form').addEventListener('change', () => { inputs = { ...inputs, ...readInputs() }; setTimeout(draw, 0); });
      $('#create').addEventListener('click', async () => {
        inputs = { ...inputs, ...readInputs() };
        try { const { id } = await api('loans', { method: 'POST', body: { worksheet: ws, inputs, file: { name: file.name, base64: parsed.base64 } } }); location.hash = `#/loan/${id}`; }
        catch (e) { $('#new-msg').innerHTML = `<div class="msgline err">${esc(e.message)}</div>`; }
      });
    };
    draw();
  });
}

// ---------------- Background AI jobs ----------------
async function runJob(body, onTick) {
  const { id } = await api('jobs', { method: 'POST', body });
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const j = await api(`jobs/${id}`);
    if (j.status === 'done') return j.result;
    if (j.status === 'failed') throw new Error(j.error || 'The AI could not finish this.');
    onTick?.(i);
  }
  throw new Error('This is taking too long. Please try again.');
}

// ---------------- Settings: document formats ----------------
async function viewSettings() {
  app().innerHTML = shell('<p class="lead">Loading…</p>');
  const { formats, canEdit, aiEnabled } = await api('formats');
  app().innerHTML = shell(`<a href="#/">← Loans</a><h1>Document formats</h1>
    <p class="lead" style="max-width:820px">These notes tell the AI how each document is laid out. If the loan system changes a layout, upload a sample of the new version: the AI drafts updated notes, you review them, and from then on every upload uses them. ${canEdit ? '' : 'Only the loan officer login can change them.'}${aiEnabled ? '' : ' <strong>Add an AI key in Netlify to use this.</strong>'}</p>
    ${Object.entries(formats).map(([k, f]) => `<div class="tcard fmt" data-kind="${k}"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline"><h3 style="margin:0">${esc(f.label)}</h3>
        <span class="small" style="padding:0">${f.isDefault ? 'Built-in notes' : `Updated ${esc(when(f.updatedAt))} by ${esc(f.updatedBy)}`}</span></div>
      ${k === 'worksheet' ? '<p class="small" style="padding:6px 0 0">Worksheets are read by a built-in reader first (exact, no AI). These notes are used only when a worksheet doesn\'t read cleanly and you choose "Read with AI instead".</p>' : ''}
      <label class="field" style="margin-top:10px">Layout notes<textarea name="notes" rows="14" ${canEdit ? '' : 'disabled'} style="font-family:'IBM Plex Mono',monospace;font-size:12.5px">${esc(f.notes)}</textarea></label>
      <div class="fmt-changes"></div>
      ${canEdit ? `<div class="row-actions" style="margin-top:10px"><button class="btn primary" data-fmt="save">Save notes</button><button class="btn secondary" data-fmt="reset">Reset to built-in</button><span class="fmsg small" style="padding:0"></span></div>
      <div style="margin-top:14px">${dropZone('learn-' + k, 'Learn a new layout from a sample PDF')}</div>` : ''}</div>`).join('')}`);
  $('#logout')?.addEventListener('click', logout);
  document.querySelectorAll('.fmt').forEach((card) => {
    const kind = card.dataset.kind, msg = (t) => { card.querySelector('.fmsg').textContent = t; };
    card.querySelector('[data-fmt=save]')?.addEventListener('click', async () => { try { await api(`formats/${kind}`, { method: 'POST', body: { notes: card.querySelector('[name=notes]').value } }); msg('Saved. New uploads use these notes.'); } catch (e) { msg(e.message); } });
    card.querySelector('[data-fmt=reset]')?.addEventListener('click', async () => { if (!confirm('Replace these notes with the built-in version?')) return; try { await api(`formats/${kind}/reset`, { method: 'POST', body: {} }); viewSettings(); } catch (e) { msg(e.message); } });
    if (card.querySelector('#learn-' + kind)) wireDrop('learn-' + kind, async (file) => {
      try {
        msg('Reading the sample…');
        const { text } = await pdfText(file);
        msg('The AI is studying the layout. This can take a minute…');
        const r = await runJob({ kind: 'learn-format', formatKind: kind, text });
        card.querySelector('[name=notes]').value = r.notes;
        card.querySelector('.fmt-changes').innerHTML = `<div class="banner-ok" style="margin-top:10px;font-size:13px"><strong>Draft ready. Review it, then click Save notes.</strong>${(r.changes || []).length ? `<div style="margin-top:6px">What changed:</div>${r.changes.map((c) => `<div>• ${esc(c)}</div>`).join('')}` : '<div style="margin-top:6px">No layout differences found.</div>'}</div>`;
        msg('Not saved yet.');
      } catch (e) { msg(e.message); }
    });
  });
}

// ---------------- Loan page ----------------
const EDITABLE = ['draft', 'ready', 'discuss', 'uw_restructure', 'uw_declined'];

async function viewLoan(id) {
  app().innerHTML = shell('<p class="lead">Loading…</p>');
  let D = await api(`loans/${id}`);
  let inputs = { ...D.loan.inputs };
  const flash = (sel, ok, text) => { const el = $(sel); if (el) el.innerHTML = `<div class="msgline ${ok ? 'ok' : 'err'}">${esc(text)}</div>`; };
  const reload = async (msg) => { D = await api(`loans/${id}`); inputs = { ...D.loan.inputs }; draw(); if (msg) flash('#top-msg', true, msg); };
  const act = async (path, body, okMsg) => { try { const r = await api(`loans/${id}/${path}`, { method: 'POST', body: body || {} }); await reload(typeof okMsg === 'function' ? okMsg(r) : okMsg); return r; } catch (e) { flash('#top-msg', false, e.message); window.scrollTo({ top: 0, behavior: 'smooth' }); } };

  function draw() {
    const L = D.loan, st = L.status, editable = EDITABLE.includes(st), canApprove = D.me.canApprove;
    const live = buildTerms(L.worksheet, inputs);
    const t = live.terms, blocking = live.checks.filter((c) => c.level === 'block');
    const sentT = D.sentTerms;
    const resp = L.response && L.response.v === L.version ? L.response : null;
    const stages = [
      ['Prepared', true], ['Sent to borrower', L.version > 0], ['Borrower confirmed', ['confirmed', 'uw_approved', 'uw_restructure', 'uw_declined', 'locked'].includes(st)],
      ['Underwriting', ['uw_approved', 'uw_restructure', 'uw_declined', 'locked'].includes(st)], ['Locked', st === 'locked']
    ];

    // Primary action panel
    let primary = '';
    const sendBtn = (label) => canApprove ? `<button class="btn primary" data-do="send" ${blocking.length ? 'disabled' : ''}>${esc(label)}</button>` : '';
    const previewBtn = `<a class="btn secondary" href="/r.html?preview=${L.id}" target="_blank" rel="noopener">Preview borrower page</a>`;
    if (['draft', 'ready'].includes(st)) {
      primary = `<div class="row-actions">${sendBtn(L.version ? `Send updated request (v${L.version + 1})` : 'Send to borrower')}
        ${!canApprove && st === 'draft' ? `<button class="btn primary" data-do="ready" ${blocking.length ? 'disabled' : ''}>Mark ready for LO</button>` : ''}
        ${!canApprove && st === 'ready' ? '<span class="small" style="padding:0">Waiting for the loan officer to review and send.</span>' : ''}${previewBtn}</div>
        ${blocking.length ? `<div class="small" style="padding:8px 0 0">Fix the required items in Checks before sending.</div>` : ''}${L.version ? '<div class="small" style="padding:6px 0 0">Sending creates a new version and a new link. The old link stops working.</div>' : ''}`;
    } else if (['sent', 'discuss'].includes(st)) {
      primary = `${st === 'discuss' ? `<div class="banner-alert" style="margin-bottom:12px"><strong>The borrower wants to talk before you submit.</strong><div class="small" style="padding:4px 0 0">${esc(when(resp?.at))}. After the call, edit the details or upload a new worksheet, then send the updated request. If nothing changes, the borrower can still confirm from their page.</div></div>` : ''}
        ${D.borrowerUrl ? `<div class="field">Borrower link (v${L.version})<div class="linkbox"><input readonly value="${esc(D.borrowerUrl)}" id="blink"><button class="btn secondary" style="min-height:40px;font-size:13px" id="copy">Copy</button></div></div>` : ''}
        <div class="row-actions" style="margin-top:12px">${canApprove && st === 'sent' ? '<button class="btn secondary" data-do="resend">Email reminder (same link)</button>' : ''}${st === 'discuss' && canApprove ? sendBtn(`Send updated request (v${L.version + 1})`) : ''}<button class="btn link" data-do="revise">Revise terms…</button></div>`;
    } else if (resp && st === 'confirmed') {
      primary = `<div class="banner-ok"><strong>Confirmed by the borrower ${esc(when(resp.at))}</strong> (version ${L.version}). You can submit to underwriting.</div>`;
    } else if (st === 'locked') {
      primary = `<div class="banner-ok"><strong>Locked at ${L.lock.rate}% until ${esc(L.lock.expires)}.</strong> The borrower's page shows the locked terms and the items needed.</div>${D.borrowerUrl ? `<div class="field" style="margin-top:12px">Borrower link<div class="linkbox"><input readonly value="${esc(D.borrowerUrl)}" id="blink"><button class="btn secondary" style="min-height:40px;font-size:13px" id="copy">Copy</button></div></div>` : ''}`;
    } else if (st === 'uw_approved') primary = `<div class="banner-ok"><strong>Approved as requested.</strong> The borrower's page shows the approval. Lock the rate below.</div>${D.borrowerUrl ? `<div class="field" style="margin-top:12px">Borrower link<div class="linkbox"><input readonly value="${esc(D.borrowerUrl)}" id="blink"><button class="btn secondary" style="min-height:40px;font-size:13px" id="copy">Copy</button></div></div>` : ''}`;
    else if (['uw_restructure', 'uw_declined'].includes(st)) primary = `<div class="banner-alert"><strong>${st === 'uw_declined' ? 'Declined' : 'Restructure required'}: borrower asked to schedule a call.</strong><div class="small" style="padding:4px 0 0">After the call, update the details or upload the new worksheet, then send the updated request for the borrower to confirm.</div></div><div class="row-actions" style="margin-top:12px">${sendBtn(`Send updated request (v${L.version + 1})`)}${previewBtn}</div>`;

    // Response panel
    const respPanel = resp ? (() => {
      const n = resp.numbers;
      return `<div class="tcard"><h3>Borrower response (v${L.version})</h3>
        <div class="kv"><div class="k">Answer</div><div class="v">${resp.action === 'confirm' ? 'Confirmed: submit as shown' : 'Wants to discuss first'}</div><div class="s">${esc(when(resp.at))}</div></div>
        <div class="kv"><div class="k">Prepayment penalty</div><div class="v">${resp.choices.ppp === 'buydown' ? '2-year (buy-down)' : 'As offered'}</div><div class="s"></div></div>
        <div class="kv"><div class="k">Impounds</div><div class="v">${resp.choices.impounds === 'waive' ? 'Waive (fee applies)' : 'As offered'}</div><div class="s"></div></div>
        <div class="kv"><div class="k">${n.funds.direction === 'to_borrower' ? 'Cash to borrower' : 'Cash to close'}</div><div class="v">${$$(n.funds.amount)}</div><div class="s">closing costs ${$$(n.totalCosts)}</div></div>
        <div class="kv"><div class="k">Monthly payment</div><div class="v">${$$(n.payment)}</div><div class="s"></div></div>
        <div class="small" style="padding:8px 0 0">Recorded with time, IP address and browser. Language: ${resp.lang === 'he' ? 'Hebrew' : 'English'}.</div></div>`;
    })() : '';

    // Underwriting panel
    let uwPanel = '';
    if (['confirmed', 'uw_approved', 'uw_restructure', 'uw_declined'].includes(st) && sentT) {
      const u = L.uw || {};
      uwPanel = `<div class="tcard"><h3>Underwriting result</h3><form class="form" id="uw-form">
        <div class="radio-row">${[['approved', 'Approved as requested'], ['restructure', 'Restructure required'], ['declined', 'Declined']].map(([v, l]) => `<label><input type="radio" name="result" value="${v}" ${(u.result || 'approved') === v ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        <div class="grid-f"><label class="field">Approved LTV %<input name="approvedLtv" inputmode="decimal" value="${esc(u.approvedLtv ?? sentT.ltv ?? '')}"></label>
          <label class="field">Approved rate %<input name="approvedRate" inputmode="decimal" value="${esc(u.approvedRate ?? sentT.rate ?? '')}"></label>
          <label class="field">Approved loan amount<input name="approvedLoanAmount" inputmode="decimal" value="${esc(u.approvedLoanAmount ?? sentT.loanAmount ?? '')}"></label></div>
        <label class="field">What changed and why (shown to the borrower; required for restructure or decline)<textarea name="reason" rows="3" data-polish="borrower" placeholder="e.g. Underwriting capped loan-to-value at 70% for this property type.">${esc(u.reason || '')}</textarea></label>
        <div id="uw-warn"></div>
        <div class="row-actions"><button class="btn secondary" data-uw="save">Save</button>${canApprove ? '<button class="btn primary" data-uw="notify">Save &amp; notify borrower</button>' : ''}</div></form></div>`;
    }
    // Lock panel
    let lockPanel = '';
    if (['uw_approved', 'locked'].includes(st) && sentT) {
      const k = L.lock || {};
      const rate = k.rate ?? L.uw?.approvedRate ?? sentT.rate;
      lockPanel = `<div class="tcard"><h3>Rate lock & conditions</h3><form class="form" id="lock-form"><div class="grid-f">
        <label class="field">Locked rate %<input name="rate" inputmode="decimal" value="${esc(rate)}"></label>
        <label class="field">Lock expires<input name="expires" type="date" value="${esc(k.expires || '')}"></label>
        <label class="field">Monthly payment<input name="payment" inputmode="decimal" value="${esc(k.payment ?? '')}" placeholder="Leave blank if the rate didn't change"><span class="hint">Needed only if the locked rate differs from ${sentT.rate}%.</span></label></div>
        ${L.approval?.status === 'done' ? `<div class="banner-ok" style="font-size:13px">The borrower's checklist comes from the approval: <strong>${(L.approval.conditions || []).filter((c) => c.borrowerVisible).length} item(s)</strong>, with a short "why" on each. Add anything extra below.</div>` : ''}
        <label class="field">${L.approval?.status === 'done' ? 'Extra items for the borrower (optional, one per line)' : 'Items needed from the borrower (one per line, plain English)'}<textarea name="conditions" rows="4" data-polish="borrower" placeholder="Last 2 months of bank statements, all pages">${esc((k.conditions || []).join('\n'))}</textarea></label>
        <div class="row-actions"><button class="btn secondary" data-lock="save">Save</button>${canApprove ? `<button class="btn primary" data-lock="notify">${st === 'locked' ? 'Update &amp; notify borrower' : 'Save &amp; notify borrower'}</button>` : ''}</div></form></div>`;
    }

    const chat = (L.chat || []).slice().reverse();
    app().innerHTML = shell(`<a href="#/">← Loans</a>
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px">
        <div><div class="eyebrow" style="color:var(--muted)">Loan ${esc(L.worksheet.header.loanNumber)} · ${t.transaction === 'purchase' ? 'Purchase' : 'Refinance'} · ${esc(L.worksheet.header.program)}</div>
          <h1 style="font-size:28px">${esc(inputs.borrowerName || L.worksheet.header.borrower)}</h1><div style="font-size:14px;color:var(--ink2)">${esc(L.worksheet.header.property)} · LO ${esc(inputs.loName)}</div></div>
        <div>${pill(st)}${L.version ? ` <span class="st">v${L.version}</span>` : ''}</div></div>
      <div class="tcard stages" style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px">${stages.map(([l, d]) => `<div style="display:flex;flex-direction:column;gap:8px"><div class="bar ${d ? 'b-done' : ''}"></div><div style="font-size:13px;font-weight:600">${l}</div></div>`).join('')}</div>
      <div id="top-msg"></div>
      <div class="tcard">${primary}${!D.emailEnabled ? '<div class="small" style="padding:10px 0 0">Email is not set up yet (Resend). Links still work: copy the borrower link and send it yourself.</div>' : ''}</div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-items:start" class="grid2">
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="tcard"><h3>Checks</h3>${checksHtml(live.checks)}</div>
          <div class="tcard"><h3>Loan details</h3>${!editable ? '<p class="small" style="padding:0 0 8px">Locked while the borrower has this version. Use "Revise terms" to change anything.</p>' : ''}${inputsForm(inputs, t, editable)}
            ${editable ? '<div class="row-actions" style="margin-top:12px"><button class="btn primary" id="save-inputs">Save changes</button></div>' : ''}</div>
          <div class="tcard"><h3>What the borrower ${L.version && !editable ? 'saw (v' + L.version + ')' : 'will see'}</h3>${termsHtml(!editable && sentT ? sentT : t)}</div>
          <div class="tcard"><h3>Worksheet</h3>${L.sourceFile ? `<p><a href="/api/loans/${L.id}/file" target="_blank" rel="noopener">${esc(L.sourceFile.name)}</a> · prepared ${esc(L.worksheet.header.datePrepared || '')}</p>` : ''}
            ${editable ? dropZone('replace', 'Upload a new worksheet for this loan') : ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          ${respPanel}${showApprovalPanel(st) ? renderApproval(D) : ''}${uwPanel}${lockPanel}
          <div class="tcard"><h3>Borrower questions to the AI assistant</h3>${chat.length ? chat.slice(0, 15).map((c) => `<div class="qa"><div class="q" dir="auto">${esc(c.q)}</div><div class="a" dir="auto">${esc(c.a)}</div><div class="small" style="padding:2px 0 0">v${c.v} · ${esc(when(c.at))} · ${esc(c.provider)}</div></div>`).join('') : `<div class="small">None yet.${D.aiEnabled ? '' : ' The assistant uses prewritten answers until an AI key is added.'}</div>`}</div>
          <div class="tcard"><h3>Activity</h3>${(L.events || []).slice().reverse().map((e) => `<div class="log"><div class="w">${esc(when(e.at))}</div><div style="color:var(--ink2)"><strong>${esc(e.by)}</strong> ${esc(e.text)}</div></div>`).join('')}</div>
          <div class="tcard"><h3>Emails</h3>${(L.notifications || []).length ? (L.notifications || []).slice().reverse().map((n) => `<div class="log"><div class="w">${esc(when(n.at))}</div><div style="color:var(--ink2)">${n.sent ? '✓' : '<span class="bad">Not sent</span>'} ${esc(n.subject)} → ${esc((n.to || []).join(', '))}${n.error ? `<div class="small bad" style="padding:0">${esc(n.error)}</div>` : ''}</div></div>`).join('') : '<div class="small">None yet.</div>'}</div>
        </div></div>`);

    // wire events
    $('#logout')?.addEventListener('click', logout);
    enhancePolish(app());
    if (showApprovalPanel(st)) wireApproval(D, { api, reload, flash: (ok, text) => flash('#top-msg', ok, text), pdfText });
    $('#copy')?.addEventListener('click', async (e) => { e.preventDefault(); try { await navigator.clipboard.writeText($('#blink').value); e.target.textContent = 'Copied'; } catch { $('#blink').select(); } });
    if (editable) {
      $('#inputs-form').addEventListener('change', () => { inputs = { ...inputs, ...readInputs() }; const y = window.scrollY; setTimeout(() => { draw(); window.scrollTo(0, y); }, 0); });
      $('#save-inputs').addEventListener('click', () => { inputs = { ...inputs, ...readInputs() }; act('inputs', { inputs }, 'Saved.'); });
      wireDrop('replace', async (file) => {
        try { const p = await readPdf(file); if (!confirm(`Replace the worksheet with ${file.name}? The terms will be recalculated from it.`)) return; await act('worksheet', { worksheet: p.worksheet, file: { name: file.name, base64: p.base64 } }, 'New worksheet loaded. Review the checks.'); }
        catch (e) { flash('#top-msg', false, 'Could not read this PDF: ' + e.message); }
      });
    }
    document.querySelectorAll('[data-do]').forEach((b) => b.addEventListener('click', async () => {
      const a = b.dataset.do;
      if (a === 'send') {
        if (EDITABLE.includes(st) && JSON.stringify(inputs) !== JSON.stringify(D.loan.inputs)) await api(`loans/${id}/inputs`, { method: 'POST', body: { inputs } });
        if (!confirm(`Send ${L.version ? 'the updated request' : 'this request'} to ${inputs.borrowerEmail}?`)) return;
        await act('send', {}, (r) => (r.emailed ? 'Sent. The borrower was emailed the link.' : `Link created, but the email was not sent (${r.emailError}). Copy the link below and send it yourself.`) + (r.texted === true ? ' A text was sent too.' : r.texted === false ? ` Text not sent: ${r.textError}` : ''));
      }
      if (a === 'ready') { if (JSON.stringify(inputs) !== JSON.stringify(D.loan.inputs)) await api(`loans/${id}/inputs`, { method: 'POST', body: { inputs } }); await act('ready', {}, 'Marked ready. The loan officer was notified.'); }
      if (a === 'resend') await act('resend', {}, (r) => r.emailed ? 'Reminder emailed.' : `Reminder not sent: ${r.emailError}`);
      if (a === 'revise') { const reason = prompt('Why are the terms being revised? (kept in the activity log)'); if (reason) await act('revise', { reason }, 'Terms unlocked for editing. The borrower\'s page now says updated terms are coming.'); }
    }));
    const uwForm = $('#uw-form');
    if (uwForm) {
      const warn = () => {
        const f = Object.fromEntries(new FormData(uwForm));
        const diff = (a, b) => a !== '' && b !== null && b !== undefined && Math.abs(Number(a) - Number(b)) > 1e-6;
        const changed = diff(f.approvedLtv, sentT.ltv) || diff(f.approvedLoanAmount, sentT.loanAmount);
        $('#uw-warn').innerHTML = f.result === 'approved' && changed ? '<div class="msgline err">The approved LTV or loan amount differs from what the borrower confirmed. That is a restructure: the borrower should get a call first.</div>' : (f.result === 'approved' && diff(f.approvedRate, sentT.rate) ? '<div class="msgline ok">Rate differs from submission: the borrower will see the old and new rate (market moved, structure unchanged).</div>' : '');
      };
      uwForm.addEventListener('input', warn); warn();
      uwForm.querySelectorAll('[data-uw]').forEach((b) => b.addEventListener('click', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(uwForm)); const notify = b.dataset.uw === 'notify'; if (notify && !confirm('Email the borrower this underwriting result?')) return; await act('uw', { ...f, notify }, (r) => !notify ? 'Saved.' : r.emailed ? 'Saved. The borrower\'s page is updated and they were emailed.' : `Saved. The borrower's page is updated, but the email was not sent (${r.emailError}). Send them the link yourself.`); }));
    }
    const lockForm = $('#lock-form');
    if (lockForm) lockForm.querySelectorAll('[data-lock]').forEach((b) => b.addEventListener('click', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(lockForm)); const notify = b.dataset.lock === 'notify'; if (notify && !confirm('Email the borrower the locked terms and the items needed?')) return; await act('lock', { ...f, notify }, (r) => !notify ? 'Saved.' : r.emailed ? 'Locked. The borrower\'s page is updated and they were emailed.' : `Locked. The borrower's page is updated, but the email was not sent (${r.emailError}). Send them the link yourself.`); }));
  }
  draw();
}

// ---------------- Router ----------------
async function logout() { await fetch('/api/logout', { method: 'POST' }); ME = null; location.hash = '#/'; route(); }
async function loadMe() { ME = await (await fetch('/api/me')).json(); if (!ME.role) { const info = ME; ME = null; return info; } return ME; }

async function route() {
  const info = ME || await loadMe();
  if (!ME) return viewLogin(info);
  const h = location.hash.replace(/^#/, '') || '/';
  try {
    if (h === '/new') viewNew();
    else if (h === '/settings') await viewSettings();
    else if (h.startsWith('/loan/')) await viewLoan(h.split('/')[2]);
    else await viewDashboard();
  } catch (e) { if (ME) app().innerHTML = shell(`<div class="msgline err">${esc(e.message)}</div><p><a href="#/">Back to loans</a></p>`); }
  $('#logout')?.addEventListener('click', logout);
}
window.addEventListener('hashchange', route);
route();
