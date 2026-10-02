// Small background-job helper: "learn a new document format" and "read a worksheet with AI".
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { callAIJson } from './ai.mjs';
import { DEFAULT_NOTES, FORMAT_KINDS, getFormat } from './formats.mjs';
import { parseWorksheet } from '../../../public/js/parse.mjs';

export const jobsStore = () => (globalThis.__TEST_STORES__ ? globalThis.__TEST_STORES__('terms-jobs') : getStore({ name: 'terms-jobs', consistency: 'strong' }));
export const JOB_KINDS = ['learn-format', 'read-worksheet'];

export async function createJob({ kind, formatKind, text, by }) {
  const id = Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
  await jobsStore().set(`${id}.input`, String(text).slice(0, 200000));
  await jobsStore().setJSON(id, { id, kind, formatKind: formatKind || null, status: 'processing', createdAt: new Date().toISOString(), createdBy: by });
  return id;
}

export async function runJob(id) {
  const st = jobsStore();
  const job = await st.get(id, { type: 'json' });
  if (!job || job.status !== 'processing') return;
  try {
    const text = await st.get(`${id}.input`, { type: 'text' });
    const result = job.kind === 'learn-format' ? await learnFormat(job.formatKind, text) : await readWorksheetWithAI(text);
    await st.setJSON(id, { ...job, status: 'done', result, finishedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[job]', e);
    await st.setJSON(id, { ...job, status: 'failed', error: e.message || 'The AI could not finish this.', finishedAt: new Date().toISOString() });
  }
  await st.delete?.(`${id}.input`);
}

// ---- Learn a new layout from a sample ----
async function learnFormat(kind, text) {
  if (!FORMAT_KINDS[kind]) throw new Error('Unknown document type.');
  const current = await getFormat(kind);
  if (process.env.MOCK_AI) return { notes: `[learned from sample]\n${current.notes}`, changes: ['Mock: no real changes.'] };
  const system = `You write "layout notes" that tell another AI how to read a mortgage document of the type "${FORMAT_KINDS[kind]}" after its text has been extracted from a PDF.
You get the CURRENT notes and the extracted text of a NEW SAMPLE. Write updated notes that describe the sample's layout: where each field is and what it's called, section headings, how items/conditions are numbered and grouped, how "cleared"/"paid outside closing"/credits are marked, and text quirks (words split across lines, repeated headers at page breaks, overlapping columns).
Keep everything from the current notes that still applies. Use the same plain bullet style. Never include personal data from the sample (names, addresses, emails, phone numbers, loan numbers): describe fields generically.
Return JSON: {"notes": string, "changes": [string]} where "changes" lists, in plain words, what is different from the current notes (empty if nothing).`;
  const out = await callAIJson(system, `CURRENT NOTES:\n${current.notes}\n\nNEW SAMPLE (extracted text):\n<sample>\n${String(text).slice(0, 60000)}\n</sample>`, 4000);
  const notes = String(out.data?.notes || '').trim();
  if (notes.length < 80) throw new Error('The AI returned notes that were too short. Try another sample.');
  return { notes: notes.slice(0, 12000), changes: (Array.isArray(out.data?.changes) ? out.data.changes : []).slice(0, 15).map((x) => String(x).slice(0, 300)) };
}

// ---- Read a fees worksheet with AI when the built-in reader can't ----
const SECTION_NAMES = ['Origination Charges', 'Services You Cannot Shop For', 'Services You Can Shop For', 'Taxes And Other Government Fees', 'Prepaids', 'Initial Escrow Payment At Closing', 'Other'];
async function readWorksheetWithAI(text) {
  if (process.env.MOCK_AI) {
    const ws = parseWorksheet([String(text).split('\n')]);
    ws.readBy = 'ai'; ws.warnings = ['Read by AI because the layout didn’t match the built-in reader. Compare each figure with the PDF before sending.', ...ws.warnings];
    return { worksheet: ws };
  }
  const fmt = await getFormat('worksheet');
  const system = `You read a mortgage "Initial Fees Worksheet" whose text was extracted from a PDF, and return its numbers as JSON. Copy every number exactly; never estimate, round or invent. Use null for anything not shown.

LAYOUT NOTES:
${fmt.notes || DEFAULT_NOTES.worksheet}

Return exactly this JSON shape:
{
  "header": {"borrower": string|null, "loanNumber": string|null, "property": string|null, "program": string|null, "loanAmount": number|null, "term": string|null, "rate": number|null, "apr": number|null, "datePrepared": string|null, "preparedBy": string|null},
  "sections": [ {"name": one of ${JSON.stringify(SECTION_NAMES)}, "total": number, "items": [ {"name": string, "payee": string|null, "calc": string|null, "amount": number, "poc": boolean, "apr": boolean, "percent": number|null, "months": number|null, "monthly": number|null} ] } ],
  "gross": number|null, "lenderCredit": number, "net": number|null,
  "tx": {"purchasePrice": number|null, "improvements": number|null, "land": number|null, "payoff": number|null, "prepaidItems": number|null, "closingCosts": number|null, "mipFee": number|null, "discount": number|null, "totalCost": number|null, "subordinate": number|null, "sellerPaidCosts": number|null, "loanBase": number|null, "loanTotal": number|null, "deposit": number, "sellerCredit": number, "lenderCredit": number, "otherCredits": [ {"name": string, "amount": number} ]},
  "monthly": {"pi": number|null, "otherFinancing": number|null, "hazard": number|null, "taxes": number|null, "mi": number|null, "hoa": number|null, "other": number|null, "total": number|null},
  "worksheetFunds": {"direction": "from_borrower"|"to_borrower", "amount": number} | null,
  "lo": {"name": string, "nmls": string} | null
}
Rules: map each fee section to the closest of the listed section names. Negative amounts (shown in parentheses) are negative numbers. "percent" is the percentage in the calculation (0.75 for "0.750% of ..."). "poc" is true when the line is marked paid outside closing. Deposits, seller credits and lender credits listed under "Other credits" go in tx.deposit / tx.sellerCredit / tx.lenderCredit; any other entry listed there goes in tx.otherCredits.`;
  const out = await callAIJson(system, `<worksheet>\n${String(text).slice(0, 80000)}\n</worksheet>`, 12000);
  return { worksheet: normalizeWorksheet(out.data) };
}

const n = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
const s = (v, m = 200) => (v === null || v === undefined ? null : String(v).trim().slice(0, m) || null);
export function normalizeWorksheet(d) {
  const sections = (Array.isArray(d?.sections) ? d.sections : []).filter((x) => SECTION_NAMES.includes(x.name)).map((x) => ({
    name: x.name, total: n(x.total) ?? 0,
    items: (Array.isArray(x.items) ? x.items : []).slice(0, 80).map((i) => ({ name: s(i.name, 120) || 'Fee', payee: s(i.payee, 120), calc: s(i.calc, 120), amount: n(i.amount) ?? 0, poc: Boolean(i.poc), apr: Boolean(i.apr), ...(n(i.percent) !== null ? { percent: n(i.percent) } : {}), ...(n(i.months) !== null ? { months: n(i.months) } : {}), ...(n(i.monthly) !== null ? { monthly: n(i.monthly) } : {}) }))
  }));
  const tx = d?.tx || {};
  const warnings = ['Read by AI because the layout didn’t match the built-in reader. Compare each figure with the PDF before sending.'];
  for (const sec of sections) {
    const sum = Math.round(sec.items.reduce((a, b) => a + b.amount, 0) * 100) / 100;
    if (Math.abs(sum - sec.total) > 0.01) warnings.push(`"${sec.name}" items add to $${sum.toFixed(2)} but the section total is $${sec.total.toFixed(2)}.`);
  }
  const gross = n(d?.gross);
  const secSum = Math.round(sections.reduce((a, b) => a + b.total, 0) * 100) / 100;
  if (gross !== null && Math.abs(secSum - gross) > 0.01) warnings.push(`The fee sections add to $${secSum.toFixed(2)} but gross closing costs are $${gross.toFixed(2)}. A section may be missing.`);
  const h = d?.header || {};
  const m = d?.monthly || {};
  return {
    kind: 'ameritrust_initial_fees_worksheet', readBy: 'ai',
    header: { borrower: s(h.borrower), loanNumber: s(h.loanNumber, 60), property: s(h.property), program: s(h.program), loanAmount: n(h.loanAmount), term: s(h.term, 60), rate: n(h.rate), apr: n(h.apr), datePrepared: s(h.datePrepared, 20), preparedBy: s(h.preparedBy) },
    sections, gross, lenderCredit: n(d?.lenderCredit) ?? 0, net: n(d?.net),
    tx: {
      purchasePrice: n(tx.purchasePrice), improvements: n(tx.improvements), land: n(tx.land), payoff: n(tx.payoff), prepaidItems: n(tx.prepaidItems), closingCosts: n(tx.closingCosts), mipFee: n(tx.mipFee), discount: n(tx.discount), totalCost: n(tx.totalCost),
      subordinate: n(tx.subordinate), sellerPaidCosts: n(tx.sellerPaidCosts), loanBase: n(tx.loanBase), loanTotal: n(tx.loanTotal),
      deposit: n(tx.deposit) ?? 0, sellerCredit: n(tx.sellerCredit) ?? 0, lenderCredit: n(tx.lenderCredit) ?? 0,
      otherCredits: (Array.isArray(tx.otherCredits) ? tx.otherCredits : []).slice(0, 10).map((c) => ({ name: s(c.name, 80) || 'Credit', amount: n(c.amount) ?? 0 }))
    },
    monthly: { pi: n(m.pi), otherFinancing: n(m.otherFinancing), hazard: n(m.hazard), taxes: n(m.taxes), mi: n(m.mi), hoa: n(m.hoa), other: n(m.other), total: n(m.total) },
    worksheetFunds: d?.worksheetFunds && ['from_borrower', 'to_borrower'].includes(d.worksheetFunds.direction) ? { direction: d.worksheetFunds.direction, amount: n(d.worksheetFunds.amount) ?? 0 } : null,
    lo: d?.lo?.name ? { name: s(d.lo.name, 80), nmls: s(d.lo.nmls, 20) } : null,
    warnings
  };
}
