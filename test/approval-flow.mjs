// Approval + conditions + texting + polish, end to end (run the server with MOCK_AI=1 MOCK_SMS=1).
import fs from 'node:fs';
const B = 'http://localhost:8890';
const call = async (method, p, body, c = '') => { const r = await fetch(B + p, { method, headers: { 'content-type': 'application/json', cookie: c }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, d: await r.json().catch(() => ({})), sc: r.headers.get('set-cookie') }; };
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const team = (await call('POST', '/api/login', { role: 'team', name: 'Dana', password: 'team' })).sc.split(';')[0];
const lo = (await call('POST', '/api/login', { role: 'approver', name: 'Lior', password: 'lo' })).sc.split(';')[0];

let r = await call('POST', '/api/loans', { worksheet: JSON.parse(fs.readFileSync('test/purch.json')), inputs: { borrowerName: 'Sample Borrower', borrowerEmail: 'b@example.com', borrowerPhone: '(818) 555-0101', smsConsent: true, processorName: 'Pat Processor', processorEmail: 'pat@example.com', titleEmail: 'title@example.com' } }, team);
const id = r.d.id;
r = await call('POST', `/api/loans/${id}/send`, null, lo);
ok(r.d.texted === true, 'sending the request also texts the borrower (consent given)');
const t = r.d.url.split('/r/')[1];

ok((await call('POST', `/api/loans/${id}/approval`, { text: fs.readFileSync('test/approval-sample.txt', 'utf8') }, team)).s === 409, 'approval upload blocked before the borrower confirms');
await call('POST', '/api/b/respond', { t, action: 'confirm', choices: {} });
ok((await call('POST', `/api/loans/${id}/approval`, { text: 'too short' }, team)).s === 400, 'unreadable / scanned approval rejected with a clear message');
r = await call('POST', `/api/loans/${id}/approval`, { text: fs.readFileSync('test/approval-sample.txt', 'utf8') }, team);
ok(r.s === 200, 'team uploads the approval');
r = await call('GET', `/api/loans/${id}`, null, team);
ok(r.d.loan.approval.status === 'processing', 'shows "reading" while the background job runs');
for (let i = 0; i < 20 && r.d.loan.approval.status === 'processing'; i++) { await sleep(300); r = await call('GET', `/api/loans/${id}`, null, team); }
const A = r.d.loan.approval;
ok(A.status === 'done' && A.conditions.length === 10, `approval read: ${A.conditions.length} conditions`);
ok(A.conditions.find((c) => c.num === '20').provider === 'insurance' && A.conditions.find((c) => c.num === '22').provider === 'title' && A.conditions.find((c) => c.num === '23').provider === 'lender', 'conditions routed to the right party');
ok(A.conditions.find((c) => c.num === '33').status === 'cleared', 'cleared conditions detected');
ok(A.facts.ltv === 75 && A.facts.loanAmount === 229125 && !A.facts.restructureRequired, 'key facts extracted (no restructure)');
ok(r.d.loan.events.some((e) => e.type === 'approval_read'), 'activity log records the read');

// status change + edit + drafts
const c18 = A.conditions.find((c) => c.num === '18');
r = await call('POST', `/api/loans/${id}/conditions`, { updates: [{ id: c18.id, status: 'received' }, { id: A.conditions.find((c) => c.num === '19').id, plain: 'Write a short note explaining the $12,500 deposit.' }], drafts: { titleEmail: { to: 'title@example.com', subject: 'Conditions', body: 'Please send.' } } }, team);
ok(r.s === 200, 'team updates statuses, wording and drafts');

// polish
r = await call('POST', '/api/ai/polish', { text: 'pls send docs asap', mode: 'polish', audience: 'party' }, team);
ok(r.s === 200 && r.d.text.includes('pls send docs asap'), 'AI polish endpoint returns rewritten text');
ok((await call('POST', '/api/ai/polish', { text: 'x' })).s === 401, 'polish requires login');

// messaging
r = await call('POST', `/api/loans/${id}/message`, { channel: 'sms', kind: 'borrowerText', body: 'Hi! Approved.' }, team);
ok(r.s === 200, 'team texts the borrower a condition update');
r = await call('POST', `/api/loans/${id}/message`, { channel: 'email', kind: 'titleEmail', to: 'title@example.com', subject: 'Conditions', body: 'Please send.' }, team);
ok(r.s === 502 && /not set up/.test(r.d.error), 'email send reports clearly when Resend is not set up');

// UW + lock: borrower sees the approval checklist with why + received
await call('POST', `/api/loans/${id}/uw`, { result: 'approved', approvedLtv: 75, approvedRate: 7.625, approvedLoanAmount: 229125, notify: true }, lo);
await call('POST', `/api/loans/${id}/lock`, { rate: 7.625, expires: '2026-10-19', conditions: 'Extra: copy of your driver license', notify: true }, lo);
r = await call('GET', `/api/b?t=${t}`);
const items = r.d.lock.items;
ok(items.length === 5, `borrower checklist has ${items.length} items (their approval items + 1 extra)`);
ok(items.some((x) => x.done && /bank statements/i.test(x.text)), 'received item shows as done for the borrower');
ok(items.some((x) => x.text.startsWith('Write a short note') && x.why), 'team edits + "why" reach the borrower');
ok(!items.some((x) => /UCDP|Title commitment/.test(x.text)), 'internal and title items stay off the borrower checklist');
ok(!JSON.stringify(r.d).includes('pat@example.com') && !JSON.stringify(r.d).includes('original'), 'borrower view has no internal data');
r = await call('POST', `/api/loans/${id}/notify-checklist`, null, team);
ok(r.s === 200, 'notify borrower: checklist updated');

// re-upload keeps progress on matching conditions
await call('POST', `/api/loans/${id}/approval`, { text: fs.readFileSync('test/approval-sample.txt', 'utf8').replace('19) LOE', '19) Cleared - LOE').replace('33) Credit report - cleared (PTF)', '34) Payoff statement (PTF)') }, team);
for (let i = 0; i < 20; i++) { await sleep(300); r = await call('GET', `/api/loans/${id}`, null, team); if (r.d.loan.approval.status !== 'processing') break; }
const A2 = r.d.loan.approval;
ok(A2.conditions.find((c) => c.num === '18').status === 'received', 'second upload keeps "received" status');
ok(A2.conditions.find((c) => c.num === '19').plain.startsWith('Write a short note'), 'second upload keeps team wording edits');
ok(A2.conditions.find((c) => c.num === '34').isNew && A2.removedSincePrevious.includes('33'), 'new and removed conditions are flagged');
const L = (await call('GET', `/api/loans/${id}`, null, team)).d.loan;
ok(L.notifications.filter((n) => n.channel === 'sms' && n.sent).length >= 4, `texts logged (${L.notifications.filter((n) => n.channel === 'sms').length})`);
