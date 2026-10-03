// Borrower document uploads with the AI first check, team review, and deletion at closing.
// Server: EXTRA_ENV='{"MOCK_AI":"1","MOCK_SMS":"1","MOCK_EMAIL":"1"}'
import { chromium } from '/home/claude/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const B = 'http://localhost:8890', SHOTS = '/tmp/claude-0/-home-claude/2ca42659-9b7c-57c6-a217-6c57d80cf100/scratchpad';
const call = async (method, p, body, c = '') => { const r = await fetch(B + p, { method, headers: { 'content-type': 'application/json', cookie: c }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, d: await r.json().catch(() => ({})), sc: r.headers.get('set-cookie') }; };
const raw = (p, bytes, type, c = '') => fetch(B + p, { method: 'POST', headers: { 'content-type': type, cookie: c }, body: bytes }).then(async (r) => ({ s: r.status, d: await r.json().catch(() => ({})) }));
const outbox = async () => (await fetch(B + '/__outbox')).json();
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lo = (await call('POST', '/api/login', { role: 'approver', name: 'Lior', password: 'lo' })).sc.split(';')[0];
const { d: { id } } = await call('POST', '/api/loans', { worksheet: JSON.parse(fs.readFileSync('test/purch.json')), inputs: { borrowerName: 'Sample Borrower', borrowerEmail: 'b@example.com', borrowerPhone: '8185550101', smsConsent: true, processorName: 'Pat', processorEmail: 'pat@example.com' } }, lo);
const url = (await call('POST', `/api/loans/${id}/send`, null, lo)).d.url; const t = url.split('/r/')[1];
await call('POST', '/api/b/respond', { t, action: 'confirm', choices: {} });
await call('POST', `/api/loans/${id}/approval`, { text: fs.readFileSync('test/approval-sample.txt', 'utf8') }, lo);
for (let i = 0; i < 30 && (await call('GET', `/api/loans/${id}`, null, lo)).d.loan.approval.status !== 'done'; i++) await sleep(300);
const pdf = fs.readFileSync('test/approval-sample.pdf');
let L = (await call('GET', `/api/loans/${id}`, null, lo)).d.loan;
const cond = L.approval.conditions.find((c) => c.borrowerVisible);
const b0 = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p0 = await (await b0.newContext({ viewport: { width: 390, height: 860 } })).newPage();
await p0.goto(url); await p0.waitForSelector('h1');
ok(await p0.locator('.upbtn').count() >= 1, 'confirmed stage (approval read, before UW result): borrower link already shows the checklist with Upload');
await call('POST', `/api/loans/${id}/uw`, { result: 'approved', approvedLtv: 75, approvedRate: 7.625, notify: true }, lo);
await p0.reload(); await p0.waitForSelector('.upbtn');
ok((await p0.textContent('body')).includes('You can start sending the items below now'), 'approved stage: checklist with Upload, and "start sending the items" note');
await p0.screenshot({ path: `${SHOTS}/borrower-approved.png`, fullPage: true });
await b0.close();
await call('POST', `/api/loans/${id}/lock`, { rate: 7.75, expires: '2026-11-15', payment: 1695.65, notify: true }, lo);
ok((await raw(`/api/b/upload?t=${t}&cid=${cond.id}&name=notes.txt`, Buffer.from('hello there this is text'), 'text/plain')).s === 415, 'non-PDF/image file refused');
ok((await raw(`/api/b/upload?t=bogus_token_that_is_long_enough_123&cid=${cond.id}&name=x.pdf`, pdf, 'application/pdf')).s === 410, 'bad link cannot upload');

// ---- Borrower, on a phone ----
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
const bp = await (await b.newContext({ viewport: { width: 390, height: 860 } })).newPage(); bp.on('pageerror', (e) => errs.push(e.message));
await bp.goto(url); await bp.waitForSelector('.upbtn');
ok(await bp.locator('.upbtn').count() >= 1, 'borrower sees an Upload button on their items');
fs.writeFileSync(`${SHOTS}/statement.pdf`, pdf); fs.writeFileSync(`${SHOTS}/statement-partial.pdf`, pdf);
const item = bp.locator('.item', { has: bp.locator(`input[data-up="${cond.id}"]`) });
await item.locator('input[type=file]').setInputFiles(`${SHOTS}/statement.pdf`);
await bp.waitForSelector('.up-busy, .up-good', { timeout: 8000 });
await bp.waitForSelector('.up-good', { timeout: 15000 });
await bp.waitForFunction(() => !document.querySelector('.up-busy'), null, { timeout: 15000 });
const goodTxt = await item.textContent(); ok(goodTxt.includes('A team member will confirm'), 'good file: "looks good" + "a team member will confirm"' + (goodTxt.includes('A team member will confirm') ? '' : ' :: ' + goodTxt));
await item.locator('input[type=file]').setInputFiles(`${SHOTS}/statement-partial.pdf`);
await bp.waitForFunction(() => document.querySelectorAll('.up-warn').length > 0, null, { timeout: 15000 });
ok((await item.textContent()).includes('pages 3 and 4 are missing'), 'flawed file: borrower sees the specific problem');
ok((await item.textContent()).includes('A team member will also review'), '...and that a team member will also review it');
await item.screenshot({ path: `${SHOTS}/borrower-upload.png` });
// Hebrew view
await bp.click('[data-act=lang][data-v=he]');
ok((await item.textContent()).includes('נציג מהצוות'), 'Hebrew page shows the Hebrew AI message and note');
await bp.click('[data-act=lang][data-v=en]');

// ---- Team ----
L = (await call('GET', `/api/loans/${id}`, null, lo)).d.loan;
const ups = L.approval.conditions.find((c) => c.id === cond.id).uploads;
ok(ups.length === 2 && ups[0].ai.verdict === 'looks_good' && ups[1].ai.verdict === 'needs_attention', 'AI verdicts stored for the team');
ok(L.approval.conditions.find((c) => c.id === cond.id).status === 'received', 'item moved to Received');
const mail = (await outbox()).filter((m) => m.subject?.startsWith('Document to review'));
ok(mail.length === 2 && mail[0].to.includes('pat@example.com') && mail[1].subject.includes('Possible issue'), 'processor emailed for each upload, with the AI verdict');
ok(!mail.some((m) => m.html.includes('/r/')), 'review emails do not contain the borrower link or the file');
const dash = (await call('GET', '/api/loans', null, lo)).d.loans.find((x) => x.id === id);
ok(dash.toReview === 2, 'dashboard counts 2 files to review');
const f = await fetch(`${B}/api/loans/${id}/uploads/${ups[0].id}`, { headers: { cookie: lo } });
ok(f.status === 200 && f.headers.get('content-type') === 'application/pdf', 'team can open the file');
ok((await fetch(`${B}/api/loans/${id}/uploads/${ups[0].id}`)).status === 401, 'file is not reachable without the team login');

const tp = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage(); tp.on('pageerror', (e) => errs.push(e.message)); tp.on('dialog', (d) => d.accept());
await tp.goto(B); await tp.fill('input[name=name]', 'Lior'); await tp.check('input[value=approver]'); await tp.fill('input[name=password]', 'lo'); await tp.click('button[type=submit]');
await tp.waitForSelector('table.dash');
ok((await tp.textContent('table.dash')).includes('2 to review'), 'dashboard shows "2 to review"');
await tp.goto(`${B}/#/loan/${id}`); await tp.waitForSelector(`.upl[data-uid="${ups[1].id}"]`);
const u2 = tp.locator(`.upl[data-uid="${ups[1].id}"]`);
await tp.locator(`.cond[data-cid="${cond.id}"]`).screenshot({ path: `${SHOTS}/team-upload.png` });
await tp.click(`[data-uaccept="${ups[0].id}"]`); await tp.waitForSelector(`.upl[data-uid="${ups[0].id}"] >> text=Accepted by Lior`);
ok(true, 'team accepts the good file');
await tp.click(`[data-ureturnopen="${ups[1].id}"]`);
ok((await u2.locator('.upl-return textarea').inputValue()).includes('pages 3 and 4'), 'send-back box is pre-filled with the AI’s note to the borrower');
await u2.locator('.upl-return textarea').fill('Page 3 of the statement is missing. Please upload all pages.');
await tp.click(`[data-ureturn="${ups[1].id}"]`); await tp.waitForSelector(`.upl[data-uid="${ups[1].id}"] >> text=Sent back by Lior`);
const back = (await outbox()).filter((m) => m.subject === 'One quick fix on a document you sent').at(-1);
ok(back?.html.includes('Page 3 of the statement is missing') && back.html.includes(url), 'borrower emailed the reason with their link');
ok((await outbox()).some((m) => m.channel === 'sms' && m.body.includes('Page 3') && m.body.includes(url)), 'borrower texted too');
await bp.reload(); await bp.waitForSelector('.upbtn');
ok((await item.textContent()).includes('Our team needs a new file') && (await item.textContent()).includes('Accepted by our team'), 'borrower page shows accepted + sent back');
// Team uploads a file on the borrower's behalf
await tp.locator(`.cond[data-cid="${cond.id}"] input[data-uadd]`).setInputFiles(`${SHOTS}/statement.pdf`);
await tp.waitForSelector(`.cond[data-cid="${cond.id}"] .upl >> nth=2`);
ok(true, 'team can add a file to an item');
await sleep(1500);
// Close: files deleted
const cl = await call('POST', `/api/loans/${id}/close`, null, lo);
ok(cl.s === 200 && cl.d.deleted === 3, `marking closed deletes the uploaded files (${cl.d.deleted})`);
ok((await fetch(`${B}/api/loans/${id}/uploads/${ups[0].id}`, { headers: { cookie: lo } })).status === 410, 'deleted file can no longer be opened');
await bp.reload(); await bp.waitForSelector('h1');
ok((await bp.textContent('h1')).includes('closed'), 'borrower page shows the closing message');
ok((await raw(`/api/b/upload?t=${t}&cid=${cond.id}&name=x.pdf`, pdf, 'application/pdf')).s >= 400, 'no uploads after closing');
ok(!errs.length, 'no page errors ' + errs.join(';'));
await b.close();
