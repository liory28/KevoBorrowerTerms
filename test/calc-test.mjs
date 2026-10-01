import fs from 'node:fs';
import { pdfToLines } from '../public/js/lines.mjs';
import { parseWorksheet } from '../public/js/parse.mjs';
import { buildTerms, scenario } from '../public/js/calc.mjs';
const pdfjs = await import(process.env.PDFJS);
const cases = { 'test/purch.pdf': {borrowerEmail:'a@b.c'}, 'test/refi_nores.pdf': {borrowerEmail:'a@b.c', estimatedValue: 765000}, 'test/refi_co.pdf': {borrowerEmail:'a@b.c', estimatedValue: 1600000} };
for (const [f, inp] of Object.entries(cases)) {
  const ws = parseWorksheet(await pdfToLines(pdfjs, new Uint8Array(fs.readFileSync(f))));
  fs.writeFileSync(f.replace('.pdf','.json'), JSON.stringify(ws));
  const { terms: t, checks } = buildTerms(ws, inp);
  const s0 = scenario(t, {}), s1 = scenario(t, { impounds: 'waive', ppp: 'buydown' });
  console.log('#', f, t.transaction, 'ltv', t.ltv, 'lender', t.lenderFees, 'third', t.thirdParty, 'res', t.reserves, 'poc', t.paidBeforeClosing, 'pay', t.monthly.payment, 'imp', t.impoundsIncluded, 'opts', JSON.stringify(t.options), 'ppp', t.ppp.years, 'IO', t.interestOnly);
  console.log('  base', s0.totalCosts, JSON.stringify(s0.funds), s0.payment, '| waive+buydown', s1.totalCosts, JSON.stringify(s1.funds), s1.payment);
  checks.forEach(c => console.log('  [' + c.level + ']', c.text));
}
