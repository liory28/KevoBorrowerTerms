// Condition edits reach every request and exactly what gets sent; borrower messages carry the portal link.
// Server: EXTRA_ENV='{"MOCK_AI":"1","MOCK_SMS":"1","MOCK_EMAIL":"1"}'
import { chromium } from '/home/claude/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const B = 'http://localhost:8890';
const call = async (method, p, body, c = '') => { const r = await fetch(B + p, { method, headers: { 'content-type': 'application/json', cookie: c }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, d: await r.json().catch(() => ({})), sc: r.headers.get('set-cookie') }; };
const outbox = async () => (await fetch(B + '/__outbox')).json();
const ok = (c, m) => console.log(c ? 'PASS' : 'FAIL', m);
const lo = (await call('POST', '/api/login', { role: 'approver', name: 'Lior', password: 'lo' })).sc.split(';')[0];
const { d: { id } } = await call('POST', '/api/loans', { worksheet: JSON.parse(fs.readFileSync('test/purch.json')), inputs: { borrowerName: 'Sample Borrower', borrowerEmail: 'b@example.com', borrowerPhone: '8185550101', smsConsent: true, processorName: 'Pat', processorEmail: 'pat@example.com', titleEmail: 'title@example.com', insuranceEmail: 'ins@example.com' } }, lo);
const url = (await call('POST', `/api/loans/${id}/send`, null, lo)).d.url; const t = url.split('/r/')[1];
await call('POST', '/api/b/respond', { t, action: 'confirm', choices: {} });
const copy = (await outbox()).find((m) => m.subject?.includes('copy for your records'));
ok(copy?.html.includes(url), '0. confirmation copy email links back to the loan page');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
await p.goto(B); await p.fill('input[name=name]', 'Lior'); await p.check('input[value=approver]'); await p.fill('input[name=password]', 'lo'); await p.click('button[type=submit]');
await p.waitForSelector('table.dash'); await p.goto(`${B}/#/loan/${id}`);
await p.waitForSelector('#approval-drop'); await p.setInputFiles('#approval-drop input', 'test/approval-sample.pdf');
await p.waitForSelector('.cond', { timeout: 20000 });
const prev = (k) => p.locator(`.draft[data-draft=${k}] .dpreview`).textContent().catch(() => '');
ok((await prev('borrowerEmail')).includes(url), '1. borrower email preview includes the loan page link');
ok((await prev('borrowerText')).includes(url), '2. borrower text preview includes the loan page link');
const cid = await p.locator('.cond').filter({ hasText: 'Borrower sees this' }).first().getAttribute('data-cid');
const R = p.locator(`.cond[data-cid="${cid}"]`);
await R.locator('summary').click();
await R.locator('textarea[name=plain]').fill('EDITED WORDING ONE'); await p.waitForTimeout(1500);
ok((await prev('borrowerEmail')).includes('EDITED WORDING ONE'), '3. wording edit shows in the borrower email');
await R.locator('input[name=why]').fill('WHY EDIT'); await p.waitForTimeout(1500);
ok((await prev('borrowerEmail')).includes('WHY EDIT'), '4. "why" edit shows in the borrower email');
// Note + polish on the note
await p.fill('.draft[data-draft=borrowerEmail] textarea[name=note]', 'congrats on the approval');
await p.click('.draft[data-draft=borrowerEmail] .pb.main'); await p.waitForSelector('.draft[data-draft=borrowerEmail] .undo:not([hidden])');
// race: edit a condition, then send right away
await R.locator('textarea[name=plain]').fill('RACE WORDING');
await p.click('.draft[data-draft=borrowerEmail] [data-sendmail]'); await p.waitForFunction(() => document.querySelector('.draft[data-draft=borrowerEmail] .dmsg')?.textContent === 'Sent.', null, { timeout: 10000 });
const sentMail = (await outbox()).filter((m) => m.channel === 'email' && m.to.includes('b@example.com')).at(-1);
ok(sentMail.html.includes('RACE WORDING'), '5. edit a condition then Send immediately → the email has the edit');
ok(sentMail.html.includes('[polish] congrats on the approval'), '6. the polished note is included');
ok(sentMail.html.includes(`href="${url}"`), '7. the sent email has a clickable loan page link');
// condition edit after polishing the note still flows
await R.locator('textarea[name=plain]').fill('AFTER POLISH EDIT'); await p.waitForTimeout(1500);
ok((await prev('borrowerEmail')).includes('AFTER POLISH EDIT') && (await prev('borrowerEmail')).includes('[polish] congrats'), '8. later edits still flow in, note kept');
// hide from borrower
await R.locator('input[name=borrowerVisible]').uncheck(); await p.waitForTimeout(1300);
ok(!(await prev('borrowerEmail')).includes('AFTER POLISH EDIT'), '9. hidden from borrower → not in the borrower email');
await R.locator('input[name=borrowerVisible]').check(); await p.waitForTimeout(1300);
// text
await p.click('.draft[data-draft=borrowerText] [data-sendsms]'); await p.waitForTimeout(1500);
const sms = (await outbox()).filter((m) => m.channel === 'sms').at(-1);
ok(sms?.body.includes(url), '10. sent text includes the loan page link');
// received removes it
await R.locator('.cstatus').selectOption('received'); await p.waitForTimeout(1300);
ok(!(await prev('borrowerEmail')).includes('AFTER POLISH EDIT'), '11. marked received → dropped from requests');
// title request uses underwriter wording and goes to title
await p.click('.draft[data-draft=titleEmail] [data-sendmail]'); await p.waitForTimeout(1500);
const tm = (await outbox()).filter((m) => m.channel === 'email' && m.to.includes('title@example.com')).at(-1);
ok(tm && !tm.html.includes(url), '12. title email sent, without the borrower’s private link');
// manual-typed borrower message gets the link appended
const r = await call('POST', `/api/loans/${id}/message`, { channel: 'email', kind: 'custom', to: 'b@example.com', subject: 'Hi', body: 'Quick update from us.' }, lo);
ok(r.s === 200 && (await outbox()).at(-1).html.includes(url), '13. any typed email to the borrower gets the loan page link added');
await p.locator('.draft').first().screenshot({ path: '/tmp/claude-0/-home-claude/2ca42659-9b7c-57c6-a217-6c57d80cf100/scratchpad/drafts.png' });
ok(!errs.length, 'no page errors ' + errs.join(';'));
await b.close();
