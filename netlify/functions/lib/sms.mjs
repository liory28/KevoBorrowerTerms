// Text messages. Two options, Quo is used when both are set:
//  - Quo (formerly OpenPhone): QUO_API_KEY + QUO_FROM (your Quo number, e.g. +18185551234). Optional QUO_USER_ID.
//    Texts go out from that number and show up (with replies) in your Quo inbox.
//  - Twilio: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_MESSAGING_SERVICE_SID (or TWILIO_FROM).
// Texts are only sent when the team has recorded that the borrower agreed to receive them.

const quoEnabled = () => Boolean(process.env.QUO_API_KEY && process.env.QUO_FROM);
const twilioEnabled = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM));
export function smsEnabled() { return quoEnabled() || twilioEnabled(); }
export const smsProvider = () => (quoEnabled() ? 'quo' : twilioEnabled() ? 'twilio' : null);

// US numbers only for now: "(818) 555-1234" -> "+18185551234"
export function normalizePhone(raw) {
  const d = String(raw || '').replace(/[^\d+]/g, '');
  if (/^\+1\d{10}$/.test(d)) return d;
  const digits = d.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

export async function deliverSms({ type, to, body }) {
  const entry = { channel: 'sms', type, to: [to].filter(Boolean), subject: body.slice(0, 80), at: new Date().toISOString(), sent: false, error: null };
  try {
    if (process.env.MOCK_SMS) { entry.sent = true; entry.id = 'mock'; globalThis.__OUTBOX__ = [...(globalThis.__OUTBOX__ || []), { channel: 'sms', to, body }]; return entry; }
    if (!smsEnabled()) throw new Error('Texting is not set up (add QUO_API_KEY + QUO_FROM, or Twilio).');
    const phone = normalizePhone(to);
    if (!phone) throw new Error('No valid mobile number.');
    if (quoEnabled()) { entry.via = 'quo'; entry.id = await sendQuo(phone, body); }
    else { entry.via = 'twilio'; entry.id = await sendTwilio(phone, body); }
    entry.sent = true;
  } catch (e) { entry.error = e.message; }
  return entry;
}

async function sendQuo(phone, body) {
  const from = String(process.env.QUO_FROM).trim();
  const r = await fetch(`${(process.env.QUO_API_URL || 'https://api.quo.com/v1').replace(/\/+$/, '')}/messages`, {
    method: 'POST',
    headers: { authorization: process.env.QUO_API_KEY.trim(), 'content-type': 'application/json' },
    body: JSON.stringify({ content: body.slice(0, 1600), from: /^PN/.test(from) ? from : (normalizePhone(from) || from), to: [phone], ...(process.env.QUO_USER_ID ? { userId: process.env.QUO_USER_ID.trim() } : {}) })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = String(d?.message || d?.errors?.[0]?.message || d?.title || '');
    if (r.status === 401 || r.status === 403) throw new Error(`Quo rejected the API key or this number isn't allowed to send (${msg || r.status}). Check QUO_API_KEY and QUO_FROM.`);
    if (/credit|balance|insufficient/i.test(msg)) throw new Error('Quo has no prepaid API credit. Add credit in Quo (Settings → Billing), then resend.');
    if (/regist|10dlc|a2p|campaign/i.test(msg)) throw new Error(`Quo: this number's US carrier (A2P 10DLC) registration isn't approved yet. ${msg}`);
    throw new Error(`Quo error ${r.status}${msg ? `: ${msg}` : ''}`);
  }
  return d?.data?.id || d?.id || null;
}

async function sendTwilio(phone, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const form = new URLSearchParams({ To: phone, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set('From', process.env.TWILIO_FROM);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.message || `Twilio error ${r.status}`);
  return d.sid || null;
}

// Short borrower texts. Every text includes the link and opt-out wording.
const T = {
  en: {
    request: (n, lo, url) => `Hi ${n}, it's ${lo}'s team. Please review and confirm the loan we're requesting for you before we submit it: ${url}`,
    requestV2: (n, lo, url) => `Hi ${n}, we updated your loan request. Please review the new version: ${url}`,
    reminder: (n, lo, url) => `Hi ${n}, a reminder to review your loan request (nothing changed): ${url}`,
    approved: (n, lo, url) => `Good news ${n}! Underwriting approved your loan as requested and we're locking your rate. Details: ${url}`,
    restructure: (n, lo, url) => `Hi ${n}, underwriting asked for a change on your loan. Let's talk before we lock: ${url}`,
    declined: (n, lo, url) => `Hi ${n}, we have an update on your loan and need to talk about options: ${url}`,
    locked: (n, lo, url) => `Hi ${n}, your rate is locked. Here's the short list of what we need to close: ${url}`,
    conditions: (n, lo, url) => `Hi ${n}, your checklist was updated. See what we still need: ${url}`,
    link: (n, lo, url) => `Hi ${n}, here's the link to your loan page again (always shows the latest status): ${url}`,
    stop: ' Reply STOP to opt out.'
  },
  he: {
    request: (n, lo, url) => `שלום ${n}, כאן הצוות של ${lo}. נא לעבור על ההלוואה שאנחנו מבקשים עבורך ולאשר לפני ההגשה: ${url}`,
    requestV2: (n, lo, url) => `שלום ${n}, עדכנו את בקשת ההלוואה. נא לעבור על הגרסה החדשה: ${url}`,
    reminder: (n, lo, url) => `שלום ${n}, תזכורת לעבור על בקשת ההלוואה (שום דבר לא השתנה): ${url}`,
    approved: (n, lo, url) => `חדשות טובות ${n}! החיתום אישר את ההלוואה כפי שביקשנו ואנחנו נועלים את הריבית. פרטים: ${url}`,
    restructure: (n, lo, url) => `שלום ${n}, החיתום ביקש שינוי בהלוואה. בוא נדבר לפני הנעילה: ${url}`,
    declined: (n, lo, url) => `שלום ${n}, יש עדכון על ההלוואה ואנחנו צריכים לדבר על האפשרויות: ${url}`,
    locked: (n, lo, url) => `שלום ${n}, הריבית ננעלה. הנה הרשימה הקצרה של מה שאנחנו צריכים לסגירה: ${url}`,
    conditions: (n, lo, url) => `שלום ${n}, רשימת המסמכים עודכנה. מה עוד חסר: ${url}`,
    link: (n, lo, url) => `שלום ${n}, הנה שוב הקישור לעמוד ההלוואה שלך (תמיד מציג את המצב העדכני): ${url}`,
    stop: ' להסרה השב STOP.'
  }
};
export function borrowerText(kind, lang, { name, lo, url }) {
  const c = T[lang] || T.en;
  const first = String(name || '').split(/\s+/)[0] || '';
  return (c[kind] || c.request)(first, lo || 'your loan', url) + c.stop;
}
