// Condition edits autosave and flow into the borrower page and every request draft (server with MOCK_AI=1 MOCK_SMS=1).
import { chromium } from '/home/claude/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const B = 'http://localhost:8890';
const call = async (method, p, body, c = '') => { const r = await fetch(B + p, { method, headers: { 'content-type': 'application/json', cookie: c }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, d: await r.json().catch(() => ({})), sc: r.headers.get('set-cookie') }; };
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lo = (await call('POST', '/api/login', { role: 'approver', name: 'Lior', password: 'lo' })).sc.split(';')[0];

async function loanWithApproval(language) {
  const { d: { id } } = await call('POST', '/api/loans', { worksheet: JSON.parse(fs.readFileSync('test/purch.json')), inputs: { borrowerName: 'Sample Borrower', borrowerEmail: 'b@example.com', titleEmail: 'title@example.com', processorName: 'Pat Doe', processorEmail: 'pat@example.com', language } }, lo);
  const t = (await call('POST', `/api/loans/${id}/send`, null, lo)).d.url.split('/r/')[1];
  await call('POST', '/api/b/respond', { t, action: 'confirm', choices: {} });
  await call('POST', `/api/loans/${id}/approval`, { text: fs.readFileSync('test/approval-sample.txt', 'utf8') }, lo);
  let r; for (let i = 0; i < 30; i++) { r = await call('GET', `/api/loans/${id}`, null, lo); if (r.d.loan.approval.status === 'done') break; await sleep(300); }
  return { id, t, D: r.d };
}

// ---- English loan, in the browser ----
const { id, t, D } = await loanWithApproval('en');
const conds = D.loan.approval.conditions;
const b19 = conds.find((c) => c.num === '19'), b18 = conds.find((c) => c.num === '18');
ok(D.approvalDrafts.borrowerEmail.body.includes(b19.plain), 'borrower email is built from the checklist');
ok(D.approvalDrafts.titleEmail && !D.approvalDrafts.titleEmail.body.includes(b18.original), 'title request does not list #18 yet');

const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await (await br.newContext({ viewport: { width: 1300, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
await p.goto(B); await p.fill('input[name=name]', 'Lior'); await p.check('input[value=approver]'); await p.fill('input[name=password]', 'lo'); await p.click('button[type=submit]');
await p.waitForSelector('table.dash'); await p.goto(`${B}/#/loan/${id}`); await p.waitForSelector('.cond');
const row = (c) => p.locator(`.cond[data-cid="${c.id}"]`);
const draftBody = (k) => p.locator(`.draft[data-draft="${k}"] textarea[name=body]`);
const saved = () => p.waitForFunction(() => /saved|marked|updated/i.test(document.getElementById('ap-msg')?.textContent || ''), null, { timeout: 8000 });

// 1) reword #19
await row(b19).locator('summary').click();
const NEW = 'Send a short signed letter explaining the $12,500 deposit on 08/14.';
await row(b19).locator('textarea[name=plain]').fill(NEW);
await p.waitForFunction((t) => document.querySelector('.draft[data-draft="borrowerEmail"] textarea')?.value.includes(t), NEW, { timeout: 8000 });
ok(true, 'rewording a condition updates the borrower email without clicking Save');
ok((await row(b19).locator('.ctext').textContent()).includes(NEW), 'the condition row shows the new wording');

// 2) hide #19 from the borrower
await row(b19).locator('input[name=borrowerVisible]').uncheck(); await saved();
await p.waitForFunction((t) => !document.querySelector('.draft[data-draft="borrowerEmail"] textarea')?.value.includes(t), NEW, { timeout: 8000 });
ok(true, 'hiding a condition removes it from the borrower email');
await row(b19).locator('input[name=borrowerVisible]').check(); await saved();

// 3) move #18 to title
await row(b18).locator('summary').click();
await row(b18).locator('select[name=provider]').selectOption('title'); await saved();
await p.waitForFunction((t) => document.querySelector('.draft[data-draft="titleEmail"] textarea')?.value.includes(t), b18.original, { timeout: 8000 });
ok(true, 'changing "Provided by" moves the item into the title request');

// 4) hand-edit the borrower email, then change the checklist
await draftBody('borrowerEmail').fill('Hi Sample, my own message.'); await p.locator('#approval-card h3').first().click();
await p.waitForSelector('.draft[data-draft="borrowerEmail"] >> text=Edited by hand', { timeout: 8000 });
ok(true, 'a hand-edited request is kept and labeled "Edited by hand"');
const NEW2 = 'Send the letter about the deposit, signed and dated.';
await row(b19).locator('textarea[name=plain]').fill(NEW2);
await p.waitForSelector('.draft[data-draft="borrowerEmail"] >> text=Checklist changed since you edited this', { timeout: 8000 });
ok(await draftBody('borrowerEmail').inputValue() === 'Hi Sample, my own message.', 'the hand edit is not overwritten…');
ok(true, '…but it is flagged when the checklist changes');
await p.click('.draft[data-draft="borrowerEmail"] [data-dreset]');
await p.waitForFunction((t) => document.querySelector('.draft[data-draft="borrowerEmail"] textarea')?.value.includes(t), NEW2, { timeout: 8000 });
ok(true, '"Use the updated version" brings in the latest checklist');

// 5) everything persisted + the borrower page reflects it
await p.reload(); await p.waitForSelector('.cond');
ok((await row(b19).locator('.ctext').textContent()).includes(NEW2), 'edits survive a reload');
ok((await row(b18).locator('.ctext').textContent()).includes('Title'), 'provider change survives a reload');
await call('POST', `/api/loans/${id}/uw`, { result: 'approved', approvedLtv: 75, approvedRate: 7.625, notify: true }, lo);
await call('POST', `/api/loans/${id}/lock`, { rate: 7.625, expires: '2026-11-15', notify: true }, lo);
const bv = await call('GET', `/api/b?t=${t}`);
const items = bv.d.lock?.items || bv.d.view?.lock?.items || JSON.stringify(bv.d);
ok(JSON.stringify(items).includes(NEW2), 'the borrower page shows the edited wording');
await p.locator('#approval-card').screenshot({ path: '/tmp/claude-0/-home-claude/2ca42659-9b7c-57c6-a217-6c57d80cf100/scratchpad/conditions-panel.png' });
ok(!errs.length, 'no page errors ' + errs.join(';'));
await br.close();

// ---- Hebrew loan: editing the English re-translates the Hebrew ----
const H = await loanWithApproval('he');
const h19 = H.D.loan.approval.conditions.find((c) => c.num === '19');
const r = await call('POST', `/api/loans/${H.id}/conditions`, { updates: [{ id: h19.id, plain: 'Explain the deposit in a short letter.' }] }, lo);
const c = r.d.conditions.find((x) => x.id === h19.id);
ok(/[֐-׿]/.test(c.plainHe) && c.plainHe.includes('Explain the deposit'), 'Hebrew wording re-translated after an English edit');
ok(!c.edited?.plainHe, 'auto-translation is not counted as a hand edit');
ok(r.d.drafts.borrowerEmail.body.includes(c.plainHe), 'the Hebrew borrower email uses the new Hebrew wording');
