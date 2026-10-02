import fs from 'node:fs';
import { pdfToLines } from '../public/js/lines.mjs';
const pdfjs = await import(process.env.PDFJS);
const pages = await pdfToLines(pdfjs, new Uint8Array(fs.readFileSync(process.argv[2])));
const text = pages.map((p, i) => `--- Page ${i + 1} ---\n` + p.join('\n')).join('\n');
fs.writeFileSync(process.argv[3], text); console.log(text.length, 'chars');
