// "Format notes" tell the AI how a document type is laid out. They ship with defaults written
// from real samples, and the team can replace them from Settings → Document formats when a
// layout changes (upload a sample, let AI draft new notes, review, save).
import { getStore } from '@netlify/blobs';

const store = () => (globalThis.__TEST_STORES__ ? globalThis.__TEST_STORES__('terms-settings') : getStore({ name: 'terms-settings', consistency: 'strong' }));

export const FORMAT_KINDS = {
  approval: 'Underwriting approval (Approval Certificate)',
  worksheet: 'Initial Fees Worksheet'
};

export const DEFAULT_NOTES = {
  approval: `Layout of the "Approval Certificate" from the loan system (Union Home Mortgage / Ameritrust):
- Page 1 header: "Approval Certificate for:" borrower names, property address, borrower phone/email. A row with "Loan Number", "Approval Date", "AU Response", "Approval Expires", then "Rate Lock Expires".
- "Loan Information": program name (e.g. "30 YR FIXED AMERITRUST DSCR 3 YR PPP"), Loan Amount, Purchase Price, Appraised Value, Cashout Amount, Property Type, Property Purpose, Total Loan Amount, Loan Purpose, Note Rate, Term / Due, Principal & Interest, "LTV / CLTV / HCLTV" (e.g. "75.000% / 75.000%"), DSCR, Impound Account, Mortgage Insurance, Documentation, Qualifying Score, Credit Expires, Appraisal/Asset/Title report expiration dates.
- "Contact Information": Loan Officer, Processor and Underwriter, each with name, phone and email.
- "Terms and Conditions": conditions are grouped under the headings "PTD" (prior to docs) and "PTF" (prior to funding); each heading row also has the columns "Date Cleared" and "Cleared By". A condition is cleared ONLY if a date / name appears in those columns for it.
- Each condition starts with its number, usually followed by a category tag in brackets, e.g. "28 [ASSETS] ...", "30 [INSURANCE] ...", "25 [TITLE] ...". Some conditions have no tag (e.g. an entity signature-block condition).
- Text is wrapped at a fixed width and words are often split across lines ("a\\nt least" = "at least", "E\\n&O" = "E&O", "replac\\nement" = "replacement"). Rejoin them.
- Page breaks repeat the page header ("Report Generated ... Loan: ... APPROVAL CERTIFICATE", "Terms and Conditions", the borrower line, the "PTD Date Cleared Cleared By" row) and can repeat conditions that were already listed. List each condition number once, using its most complete text.
- Underwriter status notes appear inside a condition, e.g. "09.23.2026 STILL PENDING FOR APPRAISAL #2" or "*PENDING FOR". These mean the item is still open; mention them in "plain" when useful.
- Amounts inside conditions (cash to close limits, verified assets, reserves) are important: copy them exactly.`,
  worksheet: `Layout of the "Initial Fees Worksheet" (cifw2015):
- Header: "Borrower(s):", "Property Address:", "Prepared by:", "Date Prepared:", "Loan Number:", "Loan Program:" (program name includes PPP years, e.g. "3 YR PPP", and may include "FOREIGN NATIONAL", "IO", "DSCR"), "Total Loan Amount:", "Loan Term:", "Interest Rate:", "APR:". Fields may be side by side or stacked one per line.
- Fee sections, each with a total: "Origination Charges" (all paid to the lender), "Services You Cannot Shop For", "Services You Can Shop For", "Taxes And Other Government Fees", "Prepaids", "Initial Escrow Payment At Closing" (tax and insurance reserves, "$X per month for N mo.", plus a negative "Aggregate adjustment" in parentheses), "Other".
- Each fee line: name, payee (may be missing), calculation (e.g. "0.750% of $229,125.00" or "0.000% + $150.00"), "A" (APR flag), "(poc)" when paid outside closing, then the amount.
- Totals: "Estimated Gross Closing Costs", "Lender Credit", "Estimated Net Closing Costs".
- "Total Estimated Funds Needed To Close": lines a. Purchase Price, b. Alterations, c. Land, d. Refi (payoff), e. Estimated prepaid items, f. Estimated closing costs, g. PMI/MIP, h. Discount, i. Total Cost, j. Subordinate financing, k. Closing costs paid by seller, l. Other credits (e.g. "Cash Deposit on sales contract 10,000.00", "Seller Credit", "Lender Credit 2,328.00", sometimes balancing entries like "Final Funds from Borrower" that are not real credits), m. Loan amount, n. PMI financed, o. Loan amount.
- Monthly column: Principal & Interest, Other financing, Hazard Insurance, Real Estate Taxes, Mortgage Insurance, Homeowner Assn. Dues, Other, "Total Monthly Payment".
- Bottom line: "Total Est. Funds From Borrower" or "Total Est. Funds To Borrower".
- Footer: lender company line and the loan officer line "Name (License #: ..., NMLS #: ...)" or "Name (NMLS #: ...)".
- The details block is repeated on page 2 (cleaner copy); page 1's copy can be overlapped by footer text.`
};

export async function getFormat(kind) {
  const saved = await store().get(`format:${kind}`, { type: 'json' });
  return saved && saved.notes ? saved : { kind, notes: DEFAULT_NOTES[kind] || '', isDefault: true };
}
export async function getAllFormats() {
  const out = {};
  for (const k of Object.keys(FORMAT_KINDS)) out[k] = { label: FORMAT_KINDS[k], ...(await getFormat(k)) };
  return out;
}
export async function saveFormat(kind, notes, by) {
  const prev = await store().get(`format:${kind}`, { type: 'json' });
  const rec = { kind, notes: String(notes).slice(0, 12000), updatedAt: new Date().toISOString(), updatedBy: by, history: [...((prev?.history) || []).slice(-9), ...(prev?.notes ? [{ notes: prev.notes, updatedAt: prev.updatedAt, updatedBy: prev.updatedBy }] : [])] };
  await store().setJSON(`format:${kind}`, rec);
  return rec;
}
export async function resetFormat(kind, by) {
  return saveFormat(kind, DEFAULT_NOTES[kind] || '', by);
}
