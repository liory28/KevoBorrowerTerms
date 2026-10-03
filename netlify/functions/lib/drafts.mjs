// Request messages built live from the current conditions checklist, so any edit to a condition
// (wording, why, who provides it, hidden from the borrower, received) is in what goes out.
// The team adds a personal note (and can change the subject / recipient); the item list itself is
// always generated at send time, so it can never go out of date. Borrower messages always end
// with the link to their loan page.
import crypto from 'node:crypto';

const OUTSTANDING = new Set(['open', 'requested']);
const TIMING_EN = { prior_to_docs: 'before docs', prior_to_funding: 'before funding', at_closing: 'at closing', post_closing: 'after closing', other: '' };
const TIMING_HE = { prior_to_docs: 'לפני המסמכים', prior_to_funding: 'לפני המימון', at_closing: 'בסגירה', post_closing: 'אחרי הסגירה', other: '' };
const PARTY = {
  insuranceEmail: { providers: ['insurance'], who: 'insurance' },
  titleEmail: { providers: ['title', 'seller', 'hoa'], who: 'title / escrow' },
  appraiserEmail: { providers: ['appraiser'], who: 'appraisal' }
};
const PROVIDER_EN = { borrower: 'Borrower', insurance: 'Insurance', title: 'Title / escrow', appraiser: 'Appraiser / AMC', seller: 'Seller', hoa: 'HOA', third_party: 'Other third parties', lender: 'Lender / internal' };

export const signature = (d) => (d ? crypto.createHash('sha1').update(`${d.subject || ''}\n${d.body || ''}`).digest('hex').slice(0, 12) : 'none');
export const DRAFT_KINDS = ['borrowerEmail', 'borrowerText', 'titleEmail', 'insuranceEmail', 'appraiserEmail', 'internalEmail'];
const withNote = (note) => (note ? `${note}\n\n` : '');
const inline = (note) => (note ? `${note.replace(/\s+/g, ' ')} ` : '');

function context(loan, url) {
  const A = loan.approval || {}, f = A.facts || {}, i = loan.inputs || {}, h = loan.worksheet?.header || {};
  return {
    first: String(i.borrowerName || '').split(/\s+/)[0] || '',
    borrower: i.borrowerName || f.borrowers || 'the borrower',
    property: f.property || h.property || '',
    loanNumber: f.loanNumber || h.loanNumber || '',
    lo: i.loName || 'Lior Yehuda',
    processor: i.processorName || f.contacts?.processor?.name || '',
    processorEmail: i.processorEmail || f.contacts?.processor?.email || '',
    he: i.language === 'he',
    url
  };
}

const numbered = (items, line) => items.map((c, n) => `${n + 1}. ${line(c)}`).join('\n');

export function buildDrafts(loan, url, notes = {}) {
  const N = (k) => String(notes[k] || '').trim();
  const conds = loan.approval?.status === 'done' ? loan.approval.conditions || [] : [];
  const open = conds.filter((c) => OUTSTANDING.has(c.status));
  const x = context(loan, url);
  const out = {};
  const ref = [x.property, x.loanNumber ? `loan #${x.loanNumber}` : ''].filter(Boolean).join(', ');

  // Borrower: only items the borrower sees, in their language
  const mine = open.filter((c) => c.borrowerVisible);
  if (mine.length) {
    if (x.he) {
      const t = (c) => c.plainHe || c.plain, w = (c) => c.whyHe || c.why;
      out.borrowerEmail = {
        subject: 'מה אנחנו צריכים ממך כדי לסגור',
        body: `שלום ${x.first},\n\n${withNote(N('borrowerEmail'))}כדי לסגור את ההלוואה${x.property ? ` על ${x.property}` : ''} אנחנו צריכים ממך את הפריטים הבאים:\n\n${numbered(mine, (c) => `${t(c)}${TIMING_HE[c.timing] ? ` (${TIMING_HE[c.timing]})` : ''}${w(c) ? `\n   למה: ${w(c)}` : ''}`)}\n\n${x.url ? `אפשר לראות בכל רגע את הרשימה המעודכנת, התנאים והאישור בעמוד ההלוואה שלך:\n${x.url}\n\n` : ''}שאלות? פשוט השב למייל הזה.\n\n${x.lo}`
      };
      out.borrowerText = { subject: '', body: `שלום ${x.first}, ${inline(N('borrowerText'))}כדי לסגור את ההלוואה חסרים לנו עוד ${mine.length} פריטים ממך.${x.url ? ` הרשימה, התנאים והאישור בעמוד ההלוואה שלך: ${x.url}` : ' שלחנו פרטים במייל.'} להסרה השב STOP.` };
    } else {
      out.borrowerEmail = {
        subject: 'What we need from you to close',
        body: `Hi ${x.first},\n\n${withNote(N('borrowerEmail'))}Here's what we still need from you to close your loan${x.property ? ` on ${x.property}` : ''}:\n\n${numbered(mine, (c) => `${c.plain}${TIMING_EN[c.timing] ? ` (${TIMING_EN[c.timing]})` : ''}${c.why ? `\n   Why: ${c.why}` : ''}`)}\n\n${x.url ? `Your loan page always shows the latest checklist, terms and approval:\n${x.url}\n\n` : ''}Questions? Just reply to this email.\n\n${x.lo}`
      };
      out.borrowerText = { subject: '', body: `Hi ${x.first}, ${inline(N('borrowerText'))}to close your loan we still need ${mine.length} item${mine.length === 1 ? '' : 's'} from you.${x.url ? ` Checklist, terms and approval on your loan page: ${x.url}` : ' Details are in your email.'} Reply STOP to opt out.` };
    }
  }

  // Outside parties: the underwriter's own wording (they know the terms), plus the plain version
  for (const [key, p] of Object.entries(PARTY)) {
    const items = open.filter((c) => p.providers.includes(c.provider));
    if (!items.length) continue;
    out[key] = {
      subject: `Lender conditions${ref ? ` for ${ref}` : ''}`,
      body: `Hello,\n\n${withNote(N(key))}For ${x.borrower}'s loan${x.property ? ` on ${x.property}` : ''}, the lender needs the following ${p.who} item${items.length === 1 ? '' : 's'}:\n\n${numbered(items, (c) => `${c.original || c.plain}${TIMING_EN[c.timing] ? ` (needed ${TIMING_EN[c.timing]})` : ''}`)}\n\nPlease send ${items.length === 1 ? 'it' : 'them'} to ${x.processor ? `${x.processor}${x.processorEmail ? ` at ${x.processorEmail}` : ''}` : 'us by replying to this email'}. Thank you!\n\n${x.processor || x.lo}`
    };
  }

  // Internal: everything still open, grouped by who provides it
  if (open.length) {
    const groups = Object.keys(PROVIDER_EN).map((k) => [k, open.filter((c) => c.provider === k)]).filter(([, xs]) => xs.length);
    out.internalEmail = {
      subject: `Open conditions: ${x.borrower}${ref ? ` (${ref})` : ''}`,
      body: `${x.processor ? `Hi ${x.processor.split(/\s+/)[0]},` : 'Hi,'}\n\n${withNote(N('internalEmail'))}${open.length} condition${open.length === 1 ? ' is' : 's are'} still open:\n\n${groups.map(([k, xs]) => `${PROVIDER_EN[k]}\n${xs.map((c) => `  #${c.num} ${c.plain} [${c.status}${TIMING_EN[c.timing] ? `, ${TIMING_EN[c.timing]}` : ''}${c.receiver === 'lo' ? ', LO receives' : ''}]`).join('\n')}`).join('\n\n')}\n\n${x.lo}`
    };
  }
  return out;
}

// What the team sees for each request: the live message (with their note), plus the note / subject / recipient they set.
export function draftsView(loan, url) {
  const edits = loan.approval?.draftEdits || {};
  const notes = Object.fromEntries(Object.entries(edits).map(([k, e]) => [k, e?.note || '']));
  const live = buildDrafts(loan, url, notes);
  const out = {};
  for (const k of DRAFT_KINDS) {
    const f = live[k]; if (!f) continue;
    const e = edits[k] || {};
    out[k] = { subject: e.subject || f.subject || '', defaultSubject: f.subject || '', body: f.body, note: e.note || '', to: e.to || '' };
  }
  return out;
}
