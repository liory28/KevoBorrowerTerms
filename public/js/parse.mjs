// Reads an Ameritrust "Initial Fees Worksheet" (layout lines from lines.mjs) into structured data.
// Deterministic: every number comes from a specific line of the worksheet. Nothing is guessed.

const SECTIONS = [
  'Origination Charges',
  'Services You Cannot Shop For',
  'Services You Can Shop For',
  'Taxes And Other Government Fees',
  'Prepaids',
  'Initial Escrow Payment At Closing',
  'Other'
];
const END_MARKERS = ['Estimated Gross Closing Costs'];

export function num(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-') || t.startsWith('−');
  const n = Number(t.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || t.replace(/[^0-9]/g, '') === '') return null;
  return neg ? -n : n;
}
const MONEY = /\(?\$[\d,]+\.\d{2}\)?/;
const cols = (line) => line.split(/\s{3,}/).map((s) => s.trim()).filter(Boolean);

function parseItem(line) {
  const parts = cols(line);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  if (!/^\(?\$[\d,]+\.\d{2}\)?$/.test(last)) return null;
  const amount = num(last);
  const name = parts[0];
  const mid = parts.slice(1, -1);
  let poc = false, apr = false, payee = null, calc = null;
  for (const m of mid) {
    if (m === '(poc)') { poc = true; continue; }
    if (m === 'A') { apr = true; continue; }
    if (/^\d+\.\d+%|^\$[\d,.]+ per |per day|per month|^\d+ mo\.?$/.test(m)) { calc = m; continue; }
    if (payee === null) {
      // Payee can carry a trailing calc like "Homeowners of America Insurance… 12 mo." or "... $128.33 per month for 4 mo."
      const mm = m.match(/^(.*?)(\s*(?:\$[\d,.]+ per .*|\d+ mo\.?))$/);
      if (mm && mm[1]) { payee = mm[1].replace(/…$/, '').trim(); calc = mm[2].trim(); }
      else payee = m;
    } else calc = calc ? calc + ' ' + m : m;
  }
  const item = { name, payee, calc, amount, poc, apr };
  const pct = (calc || '').match(/^([\d.]+)%/);
  if (pct) item.percent = Number(pct[1]);
  const months = (calc || '').match(/for (\d+) mo/) || (calc || '').match(/^(\d+) mo/);
  if (months) item.months = Number(months[1]);
  const perMonth = (calc || '').match(/\$([\d,.]+) per month/);
  if (perMonth) item.monthly = num(perMonth[1]);
  return item;
}

export function parseWorksheet(pages) {
  const all = pages.flat();
  const text = all.join('\n');
  const warnings = [];
  if (!/Initial Fees Worksheet/i.test(text)) warnings.push('This does not look like an Initial Fees Worksheet. Check every figure.');

  // Search from the last page backward so clean page-2 copies win over overlapped page-1 text.
  const lastMatch = (re) => {
    let found = null;
    for (const l of all) { const m = l.match(re); if (m) found = m; }
    return found;
  };

  // Header fields. Some worksheets put two fields on one line ("Borrower(s): X   Loan Number: Y"),
  // others stack every field on its own line, so each field is read independently.
  const header = {};
  const field = (re) => { const x = lastMatch(re); return x ? x[1].trim() : null; };
  header.borrower = field(/Borrower\(s\):\s+(.*?)(?:\s{3,}Loan Number:.*)?$/);
  header.loanNumber = field(/Loan Number:\s+(\S+)/);
  header.property = field(/Property Address:\s*(.*?)(?:\s{3,}Loan Program:.*)?$/);
  header.program = field(/Loan Program:\s+(.*?)(?:\s{3,}.*)?$/);
  { const x = lastMatch(/Total Loan Amount:\s*(\$[\d,.]+)/); if (x) header.loanAmount = num(x[1]); }
  header.term = field(/Loan Term:\s+(.*?)(?:\s{3,}.*)?$/);
  { const x = lastMatch(/Interest Rate:\s+([\d.]+)%/); if (x) header.rate = Number(x[1]); }
  { const x = lastMatch(/APR:\s+([\d.]+)%/); if (x) header.apr = Number(x[1]); }
  header.datePrepared = field(/Date Prepared:\s+([\d/]+)/);
  header.preparedBy = field(/Prepared by:\s+(.*?)(?:\s{3,}.*)?$/);
  let m;

  // Fee sections (first page only, which holds the itemization).
  const sections = [];
  let cur = null, inFees = false;
  for (const line of pages[0] || []) {
    if (/^A APR/.test(line)) { inFees = true; continue; }
    if (!inFees) continue;
    if (END_MARKERS.some((e) => line.startsWith(e))) break;
    const p = cols(line);
    const sec = SECTIONS.find((s) => p[0] === s && p.length <= 2);
    if (sec) { cur = { name: sec, total: p[1] ? num(p[1]) : 0, items: [] }; sections.push(cur); continue; }
    if (!cur) continue;
    const it = parseItem(line);
    if (it) cur.items.push(it);
    else warnings.push(`Could not read the line "${line.slice(0, 80)}". Check it against the worksheet.`);
  }
  for (const s of sections) {
    const sum = Math.round(s.items.reduce((a, b) => a + b.amount, 0) * 100) / 100;
    if (Math.abs(sum - s.total) > 0.01) warnings.push(`"${s.name}" items add to $${sum.toFixed(2)} but the section total is $${s.total.toFixed(2)}.`);
  }

  const money = (re) => { const x = lastMatch(re); return x ? num(x[1]) : null; };
  const gross = money(/^Estimated Gross Closing Costs\s+(\$[\d,.]+)/);
  const lenderCredit = money(/^Lender Credit\s+(\(?\$[\d,.]+\)?)/);
  const net = money(/^Estimated Net Closing Costs\s+(\$[\d,.]+)/);

  const tx = {
    purchasePrice: money(/a\. Purchase Price.*?(\$[\d,]+\.\d{2})/),
    improvements: money(/b\. Alterations, improvements.*?(\$[\d,]+\.\d{2})/),
    land: money(/c\. Land\s+(\$[\d,]+\.\d{2})/),
    payoff: money(/d\. Refi \(incl debts to be paid off\)\s+(\$[\d,]+\.\d{2})/),
    prepaidItems: money(/e\. Estimated prepaid items\s+(\$[\d,]+\.\d{2})/),
    closingCosts: money(/f\. Estimated closing costs\s+(\$[\d,]+\.\d{2})/),
    mipFee: money(/g\. PMI, MIP, Funding Fee\s+(\$[\d,]+\.\d{2})/),
    discount: money(/h\. Discount\s+(\$[\d,]+\.\d{2})/),
    totalCost: money(/i\. Total Cost \(sum a through h\)\s+(\$[\d,]+\.\d{2})/),
    subordinate: money(/j\. Subordinate financing\s+(\$[\d,]+\.\d{2})/),
    sellerPaidCosts: money(/k\. Closing costs paid by seller\s+(\$[\d,]+\.\d{2})/),
    loanBase: money(/m\. Loan amount \(exclude PMI, MIP\)\s+(\$[\d,]+\.\d{2})/),
    loanTotal: money(/o\. Loan amount \(add m & n\)\s+(\$[\d,]+\.\d{2})/)
  };

  // "l. Other credits" entries are printed without a $ sign, e.g. "Cash Deposit on sales contract   10,000.00".
  const credits = new Map();
  for (const l of all) {
    if (!/^[e-i]\. /.test(l)) continue;
    for (const mm of l.matchAll(/\s{3,}([A-Za-z][A-Za-z .&'/-]*?)\s{3,}([\d,]+\.\d{2})(?=\s|$)/g)) credits.set(mm[1].trim(), num(mm[2]));
  }
  tx.deposit = credits.get('Cash Deposit on sales contract') ?? 0;
  tx.sellerCredit = credits.get('Seller Credit') ?? 0;
  tx.lenderCredit = credits.get('Lender Credit') ?? 0;
  const known = ['Cash Deposit on sales contract', 'Seller Credit', 'Lender Credit'];
  tx.otherCredits = [...credits.entries()].filter(([k]) => !known.includes(k)).map(([name, amount]) => ({ name, amount }));

  const monthly = {
    pi: money(/Principal & Interest\s+(\$[\d,.]+)$/),
    otherFinancing: money(/Other financing \(P & I\)\s+(\$[\d,.]+)$/),
    hazard: money(/l\. Other credits\s+Hazard Insurance\s+(\$[\d,.]+)$/) ?? money(/^c\. Land.*Hazard Insurance\s+(\$[\d,.]+)$/),
    taxes: money(/Real Estate Taxes\s+(\$[\d,.]+)$/),
    mi: money(/Mortgage Insurance\s+(?:Page \d \/ \d)?(\$[\d,.]+)$/),
    hoa: money(/Homeowner Assn\. Dues\s+(\$[\d,.]+)$/),
    other: money(/^g\. .*\s{3,}Other\s+(\$[\d,.]+)$/),
    total: money(/Total Monthly Payment\s+(\$[\d,.]+)/)
  };

  const bottom = lastMatch(/Total Est\. Funds (From|To) Borrower\s+(\$[\d,.]+)/);
  const worksheetFunds = bottom ? { direction: bottom[1] === 'To' ? 'to_borrower' : 'from_borrower', amount: num(bottom[2]) } : null;

  let lo = null;
  for (const l of all) {
    const x = l.match(/^([A-Z][A-Za-z.' -]+?) \((?:License #: [^)]*?, )?NMLS #: (\d+)\)$/);
    if (x && !/Corporation|Mortgage|LLC|Inc/.test(x[1])) lo = { name: x[1].trim(), nmls: x[2] };
  }

  const required = { 'borrower name': header.borrower, 'loan amount': tx.loanTotal ?? header.loanAmount, 'interest rate': header.rate, 'program': header.program, 'gross closing costs': gross, 'monthly payment': monthly.total };
  for (const [k, v] of Object.entries(required)) if (v === null || v === undefined) warnings.push(`Could not find the ${k} on the worksheet.`);
  if (!sections.length) warnings.push('Could not read the fee itemization.');

  return { kind: 'ameritrust_initial_fees_worksheet', header, sections, gross, lenderCredit: lenderCredit ?? 0, net, tx, monthly, worksheetFunds, lo, warnings };
}
