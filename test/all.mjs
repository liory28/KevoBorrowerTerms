import fs from 'node:fs';
import { pdfToLines } from '../public/js/lines.mjs';
import { parseWorksheet } from '../public/js/parse.mjs';
import { buildTerms, scenario } from '../public/js/calc.mjs';
const pdfjs = await import(process.env.PDFJS);
const extra = { 'test/purch.pdf': {}, 'test/refi_nores.pdf': { estimatedValue: 765000 }, 'test/refi_co.pdf': { estimatedValue: 1600000 }, 'test/w21.pdf': {} };
for (const [f, inp] of Object.entries(extra)) {
  const ws = parseWorksheet(await pdfToLines(pdfjs, new Uint8Array(fs.readFileSync(f))));
  const { terms: t, checks } = buildTerms(ws, { borrowerEmail: 'a@b.c', ...inp });
  const s = scenario(t, {});
  const wsAmt = ws.worksheetFunds ? (ws.worksheetFunds.direction === 'to_borrower' ? -1 : 1) * ws.worksheetFunds.amount : null;
  const ours = (s.funds.direction === 'to_borrower' ? -1 : 1) * s.funds.amount;
  console.log(`# ${f}\n  borrower=${ws.header.borrower} | loan#=${ws.header.loanNumber} | program=${ws.header.program} | LO=${ws.lo?.name}\n  FN=${t.foreignNational} PPP=${t.ppp.years} buydown=${!!t.options.pppBuydown} waiver=${!!t.options.impoundWaiver} lenderCredit=${t.lenderCredit}\n  worksheet bottom=${wsAmt} ours=${ours} ${Math.abs(wsAmt - ours) < 0.01 ? 'MATCH' : 'DIFF'}`);
  checks.filter(c => c.level !== 'info').forEach(c => console.log('   [' + c.level + ']', c.text));
}
