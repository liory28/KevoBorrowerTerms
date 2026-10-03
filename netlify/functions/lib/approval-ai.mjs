// Reads an underwriting approval (text extracted from the PDF) into a conditions checklist:
// plain-English wording, a short "why" for items a borrower would question, who provides it,
// who on the team receives it, when it's due, plus request drafts for each party.
import { callAIJson } from './ai.mjs';

export const PROVIDERS = ['borrower', 'insurance', 'title', 'appraiser', 'seller', 'hoa', 'third_party', 'lender'];
export const RECEIVERS = ['processor', 'lo'];
export const TIMINGS = ['prior_to_docs', 'prior_to_funding', 'at_closing', 'post_closing', 'other'];
export const STATUSES = ['open', 'requested', 'received', 'cleared'];

function systemPrompt({ lang, loName, processorName, confirmed, formatNotes }) {
  return `You read mortgage underwriting approvals for ${loName || 'the loan officer'}'s team (Ameritrust Mortgage). The text was extracted from the PDF, so read it with the layout notes below in mind.

LAYOUT NOTES (written by the team for this document format):
${formatNotes || '(none)'}

Return ONE JSON object, nothing else, with exactly these keys:

{
  "facts": {
    "borrowers": string|null, "loanNumber": string|null, "property": string|null, "program": string|null,
    "loanAmount": number|null, "ltv": number|null, "cltv": number|null, "rate": number|null, "dscr": number|null,
    "approvalDate": "YYYY-MM-DD"|null, "approvalExpires": "YYYY-MM-DD"|null, "lockExpires": "YYYY-MM-DD"|null, "creditExpires": "YYYY-MM-DD"|null,
    "reservesRequired": number|null, "maxCashToClose": number|null,
    "restructureRequired": boolean,
    "restructureNotes": string,
    "contacts": {
      "loanOfficer": {"name": string|null, "phone": string|null, "email": string|null},
      "processor": {"name": string|null, "phone": string|null, "email": string|null},
      "underwriter": {"name": string|null, "phone": string|null, "email": string|null}
    }
  },
  "conditions": [
    {
      "num": string,                 // the condition number exactly as printed
      "original": string,            // the approval's wording, trimmed to the essential sentence(s), max 400 characters
      "plain": string,               // what needs to happen, in plain English (see rules)
      "why": string,                 // short reason the underwriter needs it, ONLY if a borrower might ask "why would you need that?"; otherwise ""
      ${lang === 'he' ? '"plain_he": string, "why_he": string,   // the same two fields in natural Hebrew (keep numbers, amounts, dates as is)\n      ' : ''}"provider": one of ${JSON.stringify(PROVIDERS)},
      "receiver": one of ${JSON.stringify(RECEIVERS)},
      "timing": one of ${JSON.stringify(TIMINGS)},
      "status": "open" | "cleared",  // "cleared" only if the approval marks it satisfied / received / cleared / waived
      "borrowerVisible": boolean     // true when the borrower must do, send, sign or decide something
    }
  ],
  "flags": [string]                  // up to 6 short internal warnings for the loan officer
}

How to fill it in:
- Include EVERY condition on the approval, in order. Never merge two numbered conditions, never skip one.
- Use only facts printed on the approval. Copy amounts, dates, names and numbers exactly. Never invent, estimate or round. Use null when something isn't shown.
- "plain": one to three short sentences a first-time borrower understands (about a 6th-grade reading level). Start with the action ("Send…", "Sign…", "Confirm…"). Keep exact amounts and dates. Replace jargon: LOE = a short signed letter explaining…; VOE = we confirm your job with your employer; VOR/VOM = proof of your rent or mortgage payment history; HOI = homeowners insurance; CD = closing disclosure; PTD/PTF = before docs / before funding; 1004D = appraiser's re-inspection; 1007 = rent survey; EMD = earnest money deposit; seasoning = how long money has been in your account.
- "why": at most 20 words, friendly and factual, only for items that can look odd or intrusive (explanation letters for deposits, a second appraisal, rent-loss insurance, LLC documents, re-inspections, gift letters, extra bank pages including blank ones, credit inquiries, reserves, payoff or rating verifications). Example: "Lenders must document where large deposits came from, so the funds can be counted toward closing." Leave "" for obvious items like "sign the loan application".
- "provider" = who has to supply it. borrower = the borrower or their entity. insurance = their insurance agent. title = title / escrow / settlement agent / closing attorney. appraiser = appraiser or appraisal management company. seller = the seller (usually delivered through title). hoa = homeowners association / condo questionnaire. third_party = employers, CPAs, landlords, other lenders, verification companies. lender = internal items the lender or underwriter handles, with no outside action.
- "receiver": "processor" by default. Use "lo" for items that need a borrower decision, a structure or pricing change, an exception, or a delicate conversation.
- "timing" from the approval's grouping: prior to docs -> prior_to_docs; prior to funding / prior to closing -> prior_to_funding; signed at the closing table -> at_closing; after closing -> post_closing; anything else -> other.
- "restructureRequired": true only if the approval changes the terms that were requested (for example a lower maximum LTV or loan amount, a different program, a counter-offer, a required paydown). Put the details in "restructureNotes" in one or two plain sentences; otherwise "".${confirmed ? `\n- The borrower confirmed these requested terms: loan amount ${confirmed.loanAmount ?? 'unknown'}, LTV ${confirmed.ltv ?? 'unknown'}%, rate ${confirmed.rate ?? 'unknown'}%, program "${confirmed.program || ''}". Note any difference in restructureNotes.` : ''}
- "flags": things the loan officer should know: expirations that are close (especially the rate lock), typos in names or vesting, a DSCR close to the minimum, items that could change cash to close, conditions that conflict. Short sentences.`;
}

export async function readApproval(text, opts) {
  if (process.env.MOCK_AI) return { data: mockApproval(text), provider: 'mock' };
  const user = `Here is the full text of the approval:\n\n<approval>\n${String(text).slice(0, 120000)}\n</approval>`;
  return callAIJson(systemPrompt(opts), user, 16000);
}

const pick = (v, list, d) => (list.includes(v) ? v : d);
const str = (v, n) => (v === null || v === undefined ? '' : String(v).trim().slice(0, n));
const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

// Cleans the AI result and carries over the team's progress from an earlier upload
// (status, edits) for conditions with the same number.
export function normalizeApproval(data, previous) {
  const f = data?.facts || {};
  const facts = {
    borrowers: str(f.borrowers, 200) || null, loanNumber: str(f.loanNumber, 60) || null, property: str(f.property, 200) || null, program: str(f.program, 200) || null,
    loanAmount: numOrNull(f.loanAmount), ltv: numOrNull(f.ltv), cltv: numOrNull(f.cltv), rate: numOrNull(f.rate), dscr: numOrNull(f.dscr),
    approvalDate: dateOrNull(f.approvalDate), approvalExpires: dateOrNull(f.approvalExpires), lockExpires: dateOrNull(f.lockExpires), creditExpires: dateOrNull(f.creditExpires),
    reservesRequired: numOrNull(f.reservesRequired), maxCashToClose: numOrNull(f.maxCashToClose),
    restructureRequired: Boolean(f.restructureRequired), restructureNotes: str(f.restructureNotes, 800),
    contacts: Object.fromEntries(['loanOfficer', 'processor', 'underwriter'].map((k) => {
      const c = f.contacts?.[k] || {};
      const email = str(c.email, 160);
      return [k, { name: str(c.name, 80) || null, phone: str(c.phone, 40) || null, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null }];
    }))
  };
  const prevByNum = new Map((previous?.conditions || []).map((c) => [c.num, c]));
  const seen = new Set();
  const conditions = (Array.isArray(data?.conditions) ? data.conditions : []).slice(0, 150).map((c, i) => {
    let num = str(c.num, 20) || String(i + 1);
    while (seen.has(num)) num += '′';
    seen.add(num);
    const prev = prevByNum.get(num);
    const base = {
      id: `c${i + 1}`, num,
      original: str(c.original, 600), plain: str(c.plain, 800), why: str(c.why, 300),
      plainHe: str(c.plain_he, 800), whyHe: str(c.why_he, 300),
      provider: pick(c.provider, PROVIDERS, 'lender'), receiver: pick(c.receiver, RECEIVERS, 'processor'), timing: pick(c.timing, TIMINGS, 'other'),
      status: c.status === 'cleared' ? 'cleared' : 'open', borrowerVisible: Boolean(c.borrowerVisible), isNew: Boolean(previous) && !prev
    };
    if (prev) {
      // keep the team's edits and progress unless the new approval now marks it cleared
      for (const k of ['plain', 'why', 'plainHe', 'whyHe', 'provider', 'receiver', 'timing', 'borrowerVisible']) if (prev.edited?.[k]) { base[k] = prev[k]; base.edited = { ...(base.edited || {}), [k]: true }; }
      if (base.status !== 'cleared') base.status = prev.status;
      // documents already uploaded for this condition stay with it
      if (prev.uploads?.length) base.uploads = prev.uploads;
    }
    return base;
  });
  const removed = previous ? (previous.conditions || []).filter((c) => !seen.has(c.num)).map((c) => c.num) : [];
  const d = data?.drafts || {};
  const draft = (x, withSubject = true) => (x && (x.body || x.subject) ? { subject: withSubject ? str(x.subject, 200) : '', body: str(x.body, 8000) } : null);
  const drafts = {
    borrowerEmail: draft(d.borrowerEmail), borrowerText: draft(d.borrowerText, false), insuranceEmail: draft(d.insuranceEmail),
    titleEmail: draft(d.titleEmail), appraiserEmail: draft(d.appraiserEmail), internalEmail: draft(d.internalEmail)
  };
  for (const k of Object.keys(drafts)) if (!drafts[k]) delete drafts[k];
  return { facts, conditions, flags: (Array.isArray(data?.flags) ? data.flags : []).slice(0, 8).map((x) => str(x, 400)).filter(Boolean), drafts, removedSincePrevious: removed };
}

// ---- Local testing without an AI key: reads "NN. text (PTD|PTF)" lines from a sample approval ----
function mockApproval(text) {
  if (process.env.MOCK_APPROVAL_FIXTURE) return JSON.parse(globalThis.__readFixture(process.env.MOCK_APPROVAL_FIXTURE));
  const conditions = [];
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*(\d{1,3})[.)]\s+(.+?)\s*(?:\((PTD|PTF|AC)\))?\s*$/);
    if (!m) continue;
    const t = m[2];
    const provider = /insurance|HOI|hazard/i.test(t) ? 'insurance' : /title|settlement|escrow|deed/i.test(t) ? 'title' : /apprais|1004D|AMC/i.test(t) ? 'appraiser' : /UCDP|SSR|lender to/i.test(t) ? 'lender' : 'borrower';
    conditions.push({ num: m[1], original: t, plain: `Plain: ${t}`, why: /LOE|explain|second appraisal|rent loss/i.test(t) ? 'Underwriting needs this to document the file.' : '', provider, receiver: /LLC|resolution/i.test(t) ? 'lo' : 'processor', timing: m[3] === 'PTF' ? 'prior_to_funding' : m[3] === 'AC' ? 'at_closing' : 'prior_to_docs', status: /cleared/i.test(t) ? 'cleared' : 'open', borrowerVisible: provider === 'borrower' });
  }
  const ltv = (String(text).match(/LTV:\s*([\d.]+)/) || [])[1];
  const rate = (String(text).match(/Rate:\s*([\d.]+)/) || [])[1];
  const amt = (String(text).match(/Loan Amount:\s*\$?([\d,]+)/) || [])[1];
  return {
    facts: { loanAmount: amt ? Number(amt.replace(/,/g, '')) : null, ltv: ltv ? Number(ltv) : null, rate: rate ? Number(rate) : null, lockExpires: '2026-10-19', restructureRequired: /COUNTER/i.test(text), restructureNotes: /COUNTER/i.test(text) ? 'Max LTV reduced to 70%.' : '' },
    conditions,
    flags: ['Rate lock expires 2026-10-19.'],
    drafts: { borrowerEmail: { subject: 'You are approved', body: 'Hi, your loan is approved with conditions.' }, borrowerText: { body: 'Approved! Check your email.' }, titleEmail: { subject: 'Lender conditions', body: 'Please send the items.' }, internalEmail: { subject: 'Status', body: 'Open items...' } }
  };
}
