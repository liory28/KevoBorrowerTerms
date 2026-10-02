import { chromium } from '/home/claude/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs';
const B = 'http://localhost:8890';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];
const page = async (vp) => { const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'test reason' : undefined)); return p; };
const shot = (p, n, full = true) => p.screenshot({ path: `test/ui-${n}.png`, fullPage: full });

try {
  // Team: login, upload, fill, create, mark ready
  const team = await page({ width: 1360, height: 900 });
  await team.goto(B); await team.fill('input[name=name]', 'Dana'); await team.fill('input[name=password]', 'team'); await team.click('button[type=submit]');
  await team.waitForSelector('text=New loan from worksheet'); await team.click('text=New loan from worksheet');
  await team.setInputFiles('#drop input', 'test/w21.pdf');
  await team.waitForSelector('#inputs-form'); await shot(team, '1-new');
  await team.fill('input[name=borrowerEmail]', 'hillel@example.com'); await team.locator('input[name=borrowerEmail]').dispatchEvent('change');
  
  await team.selectOption('select[name=language]', 'he');
  await team.click('#create'); await team.waitForSelector('text=Mark ready for LO');
  await team.click('[data-do=ready]'); await team.waitForSelector('text=Waiting for the loan officer');
  await shot(team, '2-team-ready');
  const loanUrl = team.url();

  // LO: login, open loan, send
  const lo = await page({ width: 1360, height: 900 });
  await lo.goto(B); await lo.fill('input[name=name]', 'Lior'); await lo.check('input[value=approver]'); await lo.fill('input[name=password]', 'lo'); await lo.click('button[type=submit]');
  await lo.waitForSelector('table.dash'); await shot(lo, '3-dashboard', false);
  await lo.goto(loanUrl); await lo.waitForSelector('[data-do=send]'); await lo.click('[data-do=send]');
  await lo.waitForSelector('#blink'); const link = await lo.inputValue('#blink'); await shot(lo, '4-lo-sent');
  console.log('link', link);

  // Borrower (phone)
  const bw = await page({ width: 400, height: 860 });
  await bw.goto(link); await bw.waitForSelector('.big .num'); await shot(bw, '5-borrower-he', false);
  await bw.click('[data-act=lang][data-v=en]');
  const before = await bw.textContent('.big .num');
  await bw.click('[data-act=ppp][data-v=buydown]'); const after = await bw.textContent('.big .num');
  console.log('cash to you before/after waive', before, after);
  await bw.click('.chip >> nth=0'); await bw.waitForSelector('.msg.assistant:not(.typing)');
  await bw.click('[data-act=breakdown]'); await shot(bw, '6-borrower-en');
  await bw.click('[data-act=respond][data-v=confirm]'); await bw.waitForSelector('.done'); await shot(bw, '7-borrower-confirmed', false);

  // LO: UW approved (market moved), then lock
  await lo.reload(); await lo.waitForSelector('#uw-form');
  await lo.fill('input[name=approvedRate]', '7.125'); await lo.click('[data-uw=notify]'); await lo.waitForSelector('#lock-form');
  await bw.reload(); await bw.waitForSelector('.icon-ok'); await shot(bw, '8-borrower-approved', false);
  await lo.fill('input[name=expires]', '2026-11-20'); await lo.fill('input[name=payment]', '8291.40');
  await lo.fill('textarea[name=conditions]', 'Last 2 months of bank statements, all pages\nSigned letter explaining the cash-out purpose\nCurrent homeowners insurance declarations page');
  await lo.click('[data-lock=notify]'); await lo.waitForSelector('text=Locked at');
  await shot(lo, '9-lo-locked');
  await bw.reload(); await bw.waitForSelector('.item'); await shot(bw, '10-borrower-locked');
} catch (e) { console.log('FAILED:', e.message.split('\n')[0]); }
console.log('errors:', errs);
await b.close();
