import { chromium } from '/home/claude/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const B = 'http://localhost:8890';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
const ctxp = async (vp) => { const c = await b.newContext({ viewport: vp }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept()); return p; };
const call = async (method, p, body, c = '') => { const r = await fetch(B + p, { method, headers: { 'content-type': 'application/json', cookie: c }, body: body ? JSON.stringify(body) : undefined }); return { d: await r.json().catch(() => ({})), sc: r.headers.get('set-cookie') }; };
try {
  // set up a confirmed loan through the API
  const lo = (await call('POST', '/api/login', { role: 'approver', name: 'Lior', password: 'lo' })).sc.split(';')[0];
  const { d: { id } } = await call('POST', '/api/loans', { worksheet: JSON.parse(fs.readFileSync('test/purch.json')), inputs: { borrowerName: 'Sample Borrower', borrowerEmail: 'b@example.com', borrowerPhone: '8185550101', smsConsent: true, processorName: 'Pat', processorEmail: 'pat@example.com', titleEmail: 'title@example.com', language: 'he' } }, lo);
  const t = (await call('POST', `/api/loans/${id}/send`, null, lo)).d.url.split('/r/')[1];
  await call('POST', '/api/b/respond', { t, action: 'confirm', choices: {} });

  const p = await ctxp({ width: 1360, height: 900 });
  await p.goto(B); await p.fill('input[name=name]', 'Lior'); await p.check('input[value=approver]'); await p.fill('input[name=password]', 'lo'); await p.click('button[type=submit]');
  await p.waitForSelector('table.dash'); await p.goto(`${B}/#/loan/${id}`);
  await p.waitForSelector('#approval-drop');
  await p.setInputFiles('#approval-drop input', 'test/approval-sample.pdf');
  await p.waitForSelector('text=Reading the approval');
  await p.waitForSelector('.cond', { timeout: 20000 });
  await p.click('[data-ap=use-facts]');
  const ltv = await p.inputValue('#uw-form input[name=approvedLtv]');
  console.log('UW form filled from approval: LTV', ltv);
  // polish a draft
  await p.fill('.draft[data-draft=titleEmail] textarea[name=note]', 'Please send the items.');
  await p.click('.draft[data-draft=titleEmail] .pb.main'); await p.waitForSelector('.draft[data-draft=titleEmail] .undo:not([hidden])');
  console.log('polished:', (await p.inputValue('.draft[data-draft=titleEmail] textarea[name=note]')).slice(0, 40));
  await p.selectOption('.cond >> nth=0 >> .cstatus', 'received'); await p.waitForTimeout(500);
  await p.locator('#approval-card').screenshot({ path: 'test/ui-approval-panel.png' });
  // approve + lock with notify, then the borrower checklist
  await p.click('[data-uw=notify]'); await p.waitForSelector('#lock-form');
  await p.fill('input[name=expires]', '2026-10-19'); await p.click('[data-lock=notify]'); await p.waitForSelector('text=Locked at');
  const bw = await ctxp({ width: 400, height: 860 });
  await bw.goto(`${B}/r/${t}`); await bw.waitForSelector('.item');
  await bw.screenshot({ path: 'test/ui-borrower-checklist-he.png', fullPage: true });
  await bw.click('[data-act=lang][data-v=en]'); await bw.screenshot({ path: 'test/ui-borrower-checklist-en.png', fullPage: true });
} catch (e) { console.log('FAILED:', e.message.split('\n')[0]); }
console.log('errors:', errs);
await b.close();
