import fs from 'node:fs';
import { pdfToLines } from '../public/js/lines.mjs';
import { parseWorksheet } from '../public/js/parse.mjs';
const pdfjs = await import(process.env.PDFJS);
for (const f of process.argv.slice(2)) {
  const ws = parseWorksheet(await pdfToLines(pdfjs, new Uint8Array(fs.readFileSync(f))));
  console.log('########', f);
  console.log(JSON.stringify({ header: ws.header, gross: ws.gross, lenderCredit: ws.lenderCredit, net: ws.net, tx: ws.tx, monthly: ws.monthly, worksheetFunds: ws.worksheetFunds, lo: ws.lo, warnings: ws.warnings, sections: ws.sections.map(s => ({ n: s.name, t: s.total, k: s.items.length })) }, null, 1));
  if (process.env.ITEMS) ws.sections.forEach(s => s.items.forEach(i => console.log(s.name.slice(0,12), '|', JSON.stringify(i))));
}
