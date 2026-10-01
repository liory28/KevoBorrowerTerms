import fs from 'node:fs';
import { pdfToLines } from '../public/js/lines.mjs';
const pdfjs = await import(process.env.PDFJS);
for (const f of process.argv.slice(2)) {
  const pages = await pdfToLines(pdfjs, new Uint8Array(fs.readFileSync(f)));
  console.log('########', f); pages.forEach((p,i)=>{ console.log('--- page', i+1); p.forEach(l=>console.log(JSON.stringify(l))); });
}
