// Text messages through Twilio. Turned on by TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN and either
// TWILIO_MESSAGING_SERVICE_SID (recommended, required for A2P 10DLC) or TWILIO_FROM (a Twilio number).
// Texts are only sent when the team has recorded that the borrower agreed to receive them.

export function smsEnabled() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM));
}

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
    if (process.env.MOCK_SMS) { entry.sent = true; entry.id = 'mock'; globalThis.__SMS_LOG__ = [...(globalThis.__SMS_LOG__ || []), { to, body }]; return entry; }
    if (!smsEnabled()) throw new Error('Texting is not set up (Twilio).');
    const phone = normalizePhone(to);
    if (!phone) throw new Error('No valid mobile number.');
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
    entry.sent = true; entry.id = d.sid || null;
  } catch (e) { entry.error = e.message; }
  return entry;
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
    stop: ' להסרה השב STOP.'
  }
};
export function borrowerText(kind, lang, { name, lo, url }) {
  const c = T[lang] || T.en;
  const first = String(name || '').split(/\s+/)[0] || '';
  return (c[kind] || c.request)(first, lo || 'your loan', url) + c.stop;
}
