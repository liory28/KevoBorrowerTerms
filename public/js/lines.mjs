// Turns pdf.js text content into layout lines (like `pdftotext -layout`).
// Columns are separated by 3+ spaces so the parser can split them reliably.
// Shared by the browser (team upload) and the Node test harness.

export async function pdfToLines(pdfjs, data) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push(itemsToLines(tc.items));
  }
  return pages; // array of pages, each an array of strings
}

export function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5];
    const size = Math.abs(it.transform[0]) || 8;
    let row = rows.find((r) => Math.abs(r.y - y) <= 2.2);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, end: x + (it.width || it.str.length * size * 0.5), str: it.str, size });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    let line = '', prevEnd = null;
    for (const p of r.parts) {
      if (prevEnd !== null) {
        const gap = p.x - prevEnd;
        if (gap > p.size * 1.2) line += '   ';
        else if (gap > p.size * 0.15 && !line.endsWith(' ') && !p.str.startsWith(' ')) line += ' ';
      }
      line += p.str;
      prevEnd = p.end;
    }
    return line.replace(/­/g, '-').replace(/\s+$/, '');
  });
}
