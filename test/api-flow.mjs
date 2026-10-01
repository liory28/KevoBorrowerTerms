// End-to-end API test: team creates, LO sends, borrower confirms, UW, lock; plus permission and state checks.
import fs from 'node:fs';
const B = 'http://localhost:8890';
let cookie = '';
const call = async (method, p, body, c = cookie) => { const r = await fetch(B + p, { method, headers: { 'content-type': 'application/json', cookie: c }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); const d = await r.json().catch(() => ({})); return { s: r.status, d, sc }; };
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; };

ok((await call('GET', '/api/loans')).s === 401, 'loans need login');
ok((await call('POST', '/api/login', { role: 'team', name: 'Dana', password: 'nope' })).s === 401, 'wrong password rejected');
let r = await call('POST', '/api/login', { role: 'team', name: 'Dana', password: 'team' });
const team = r.sc.split(';')[0]; cookie = team;
r = await call('POST', '/api/login', { role: 'approver', name: 'Lior', password: 'lo' });
const lo = r.sc.split(';')[0];

const ws = JSON.parse(fs.readFileSync('test/purch.json'));
const pdf = fs.readFileSync('test/purch.pdf').toString('base64');
r = await call('POST', '/api/loans', { worksheet: ws, inputs: { borrowerName: 'Daniel Ramirez' }, file: { name: 'purch.pdf', base64: pdf } });
ok(r.s === 200 && r.d.id, 'team creates loan');
const id = r.d.id;
r = await call('GET', `/api/loans/${id}`);
ok(r.d.blocking.some(b => /email/.test(b.text)), 'missing email blocks sending');
ok((await call('POST', `/api/loans/${id}/ready`)).s === 409, 'cannot mark ready with blocking items');
ok((await call('POST', `/api/loans/${id}/inputs`, { inputs: { borrowerEmail: 'dan@example.com', language: 'he' } })).s === 200, 'team saves inputs');
ok((await call('POST', `/api/loans/${id}/ready`)).s === 200, 'team marks ready');
ok((await call('POST', `/api/loans/${id}/send`)).s === 403, 'team cannot send to borrower');
r = await call('POST', `/api/loans/${id}/send`, null, lo);
ok(r.s === 200 && r.d.url && r.d.emailed === false, 'LO sends; link returned; email not configured is reported');
const t1 = r.d.url.split('/r/')[1];
ok((await call('POST', `/api/loans/${id}/inputs`, { inputs: { borrowerEmail: 'x@y.com' } })).s === 409, 'terms locked while with borrower');

r = await call('GET', `/api/b?t=${t1}`, null, '');
ok(r.s === 200 && r.d.stage === 'request' && r.d.terms.loanAmount === 229125 && r.d.lang === 'he', 'borrower sees request in Hebrew');
ok(!('worksheet' in r.d) && !('events' in r.d) && !JSON.stringify(r.d).includes('dan@example.com'), 'borrower view has no internal data');
ok((await call('GET', `/api/b?t=bogus-token-123456789012345`, null, '')).s === 404, 'bad token rejected');
ok((await call('POST', `/api/loans/${id}/uw`, { result: 'approved', notify: true }, lo)).s === 409, 'cannot record UW before borrower confirms');

r = await call('POST', '/api/b/respond', { t: t1, action: 'discuss', choices: {} }, '');
ok(r.s === 200 && r.d.status === 'discuss', 'borrower asks to discuss');
// After the call, team revises; LO re-sends v2; old link superseded
ok((await call('POST', `/api/loans/${id}/inputs`, { inputs: { pppSchedule: '3% / 2% / 1%' } })).s === 200, 'team edits after discuss');
r = await call('POST', `/api/loans/${id}/send`, null, lo);
const t2 = r.d.url.split('/r/')[1];
ok(t2 && t2 !== t1, 'v2 gets a new link');
r = await call('GET', `/api/b?t=${t1}`, null, '');
ok(r.d.superseded === true, 'old link shows superseded');
ok((await call('POST', '/api/b/respond', { t: t1, action: 'confirm' }, '')).s === 410, 'old link cannot confirm');

r = await call('POST', '/api/b/respond', { t: t2, action: 'confirm', choices: { impounds: 'waive', ppp: 'buydown' }, lang: 'he' }, '');
ok(r.s === 200 && r.d.status === 'confirmed' && r.d.response.choices.impounds === 'waive', 'borrower confirms v2 with choices');
ok((await call('POST', '/api/b/respond', { t: t2, action: 'confirm' }, '')).s === 409, 'cannot confirm twice');
r = await call('GET', `/api/loans/${id}`, null, lo);
ok(r.d.loan.response.numbers.funds.amount === 84277.88 && r.d.loan.response.numbers.payment === 1675.9, 'confirmed numbers stored (waive + buydown)');
ok(r.d.loan.events.some(e => e.type === 'confirmed') && r.d.loan.notifications.length >= 4, 'audit log + notification attempts recorded');

ok((await call('POST', `/api/loans/${id}/uw`, { result: 'restructure', notify: true }, lo)).s === 400, 'restructure needs a reason');
ok((await call('POST', `/api/loans/${id}/uw`, { result: 'approved', approvedLtv: 75, approvedRate: 7.625, notify: true })).s === 403, 'team cannot notify borrower');
ok((await call('POST', `/api/loans/${id}/uw`, { result: 'approved', approvedLtv: 75, approvedRate: 7.625, notify: true }, lo)).s === 200, 'LO records approved as requested');
r = await call('GET', `/api/b?t=${t2}`, null, '');
ok(r.d.stage === 'approved' && r.d.uw.approvedLtv === 75, 'borrower sees approved stage');
ok((await call('POST', `/api/loans/${id}/lock`, { rate: 7.75, expires: '2026-11-15', conditions: 'Bank statements\nInsurance quote', notify: true }, lo)).s === 409, 'new rate without new payment is rejected');
ok((await call('POST', `/api/loans/${id}/lock`, { rate: 7.75, expires: '2026-11-15', payment: 1695.65, conditions: 'Bank statements\nInsurance quote', notify: true }, lo)).s === 200, 'LO locks with new payment');
r = await call('GET', `/api/b?t=${t2}`, null, '');
ok(r.d.stage === 'locked' && r.d.lock.conditions.length === 2 && r.d.lock.payment === 1695.65, 'borrower sees locked stage + conditions');
r = await fetch(`${B}/api/loans/${id}/file`, { headers: { cookie: lo } });
ok(r.status === 200 && (await r.arrayBuffer()).byteLength === fs.readFileSync('test/purch.pdf').length, 'worksheet PDF downloadable');
r = await call('GET', '/api/loans', null, team);
ok(r.d.loans.length === 1 && r.d.loans[0].status === 'locked', 'dashboard list');
ok((await call('POST', '/api/b/ask', { t: t2, question: 'hi' }, '')).s === 503, 'AI reports not configured without a key');
fs.writeFileSync('test/last-ids.json', JSON.stringify({ id, t2 }));
