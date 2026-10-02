// Email through Resend. Every attempt is logged on the loan, including failures.
const list = (raw) => [...new Set(String(raw || '').split(',').map((x) => x.trim()).filter(Boolean))];
export const teamRecipients = () => list(process.env.TEAM_NOTIFY_EMAILS || 'teamlior@ameritrust-mortgage.com');
export const approverRecipients = () => list(process.env.APPROVER_NOTIFY_EMAILS || 'lior@liorfinance.com');
export const allInternal = () => [...new Set([...approverRecipients(), ...teamRecipients()])];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Sends once and returns the log entry. Callers record it on the loan afterwards,
// outside any retry loop, so a write conflict can never cause a duplicate email.
export async function deliver({ type, to, subject, html, replyTo, cc }) {
  return sendEmail(null, { type, to, subject, html, replyTo, cc });
}

export async function sendEmail(loan, { type, to, subject, html, replyTo, cc }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  const entry = { channel: 'email', type, to: recipients, cc: cc || [], subject, at: new Date().toISOString(), sent: false, error: null };
  try {
    if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL) throw new Error('Email is not set up (RESEND_API_KEY / FROM_EMAIL).');
    if (!recipients.length) throw new Error('No recipient.');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.FROM_EMAIL, to: recipients, subject, html: wrap(html), ...(replyTo ? { reply_to: replyTo } : {}), ...(cc && cc.length ? { cc } : {}) })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.message || `Resend error ${r.status}`);
    entry.sent = true; entry.id = d.id || null;
  } catch (e) { entry.error = e.message; }
  if (loan) { loan.notifications = loan.notifications || []; loan.notifications.push(entry); }
  return entry;
}

function wrap(inner) {
  return `<!doctype html><html><body style="margin:0;background:#F4F6F5;font-family:Arial,Helvetica,sans-serif;color:#17212B">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border:1px solid #E1E6E4;border-radius:14px;padding:24px">${inner}</div>
<p style="font-size:12px;color:#55606B;margin:14px 4px">Ameritrust Mortgage Corporation · NMLS #217229</p></div></body></html>`;
}

export function button(url, label) {
  return `<p style="margin:22px 0"><a href="${esc(url)}" style="background:#0E5A47;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:bold;display:inline-block">${esc(label)}</a></p>`;
}

// Borrower-facing email copy (English / Hebrew).
const B = {
  en: {
    request: { s: 'Please review the loan we are requesting for you', h: (n, lo) => `<p>Hi ${n},</p><p>Before we submit your loan to underwriting, please review the loan we're requesting for you and confirm it's what you want. It takes about two minutes, and you can ask questions right on the page.</p>`, b: 'Review my loan request', f: (lo) => `<p style="font-size:13px;color:#55606B">Prefer to talk first? Reply to this email or schedule a call with ${esc(lo)} from the page.</p>` },
    requestV2: { s: 'Updated: please review your loan request', h: (n) => `<p>Hi ${n},</p><p>We've updated the loan we're requesting for you. Please review the new version and confirm it. Your earlier link no longer works.</p>`, b: 'Review my updated request' },
    reminder: { s: 'Reminder: please review your loan request', h: (n) => `<p>Hi ${n},</p><p>A quick reminder to review and confirm the loan we're requesting for you. Nothing has changed.</p>`, b: 'Review my loan request' },
    copy: { s: 'Your confirmed loan request (copy for your records)' },
    approved: { s: 'Good news: your loan was approved as requested', h: (n) => `<p>Hi ${n},</p><p>Underwriting approved your loan the way we structured it. We're locking your rate now. See the details here:</p>`, b: 'See my approval' },
    restructure: { s: "Underwriting asked for a change. Let's talk before we lock", h: (n) => `<p>Hi ${n},</p><p>Underwriting reviewed your loan and asked for a change. Before we lock anything, let's go over what changed, why, and your options.</p>`, b: 'See what changed and schedule a call' },
    declined: { s: "Update on your loan: let's talk", h: (n) => `<p>Hi ${n},</p><p>Underwriting came back on your loan and we need to talk about your options before going further.</p>`, b: 'See the update and schedule a call' },
    locked: { s: 'Your rate is locked. Here is what we need to close', h: (n) => `<p>Hi ${n},</p><p>Your rate is locked. The page below shows your locked terms and the short list of items we need from you to close.</p>`, b: 'See my locked terms' },
    conditions: { s: 'Your closing checklist was updated', h: (n) => `<p>Hi ${n},</p><p>We updated your checklist. The page below shows what we've received and what we still need from you, with a short note on why each item is needed.</p>`, b: 'See my checklist' }
  },
  he: {
    request: { s: 'נא לעבור על ההלוואה שאנחנו מבקשים עבורך', h: (n) => `<div dir="rtl"><p>שלום ${n},</p><p>לפני שנגיש את ההלוואה לחיתום, נא לעבור על ההלוואה שאנחנו מבקשים עבורך ולאשר שזה מה שאתה רוצה. זה לוקח כשתי דקות, ואפשר לשאול שאלות ישירות בעמוד.</p></div>`, b: 'צפייה בבקשת ההלוואה', f: (lo) => `<p dir="rtl" style="font-size:13px;color:#55606B">מעדיף לדבר קודם? השב למייל הזה או קבע שיחה עם ${esc(lo)} מהעמוד.</p>` },
    requestV2: { s: 'עדכון: נא לעבור על בקשת ההלוואה המעודכנת', h: (n) => `<div dir="rtl"><p>שלום ${n},</p><p>עדכנו את ההלוואה שאנחנו מבקשים עבורך. נא לעבור על הגרסה החדשה ולאשר אותה. הקישור הקודם כבר לא פעיל.</p></div>`, b: 'צפייה בבקשה המעודכנת' },
    reminder: { s: 'תזכורת: נא לעבור על בקשת ההלוואה', h: (n) => `<div dir="rtl"><p>שלום ${n},</p><p>תזכורת קצרה לעבור על ההלוואה שאנחנו מבקשים עבורך ולאשר אותה. שום דבר לא השתנה.</p></div>`, b: 'צפייה בבקשת ההלוואה' },
    copy: { s: 'בקשת ההלוואה שאישרת (עותק לתיעוד)' },
    approved: { s: 'חדשות טובות: ההלוואה אושרה כפי שביקשנו', h: (n) => `<div dir="rtl"><p>שלום ${n},</p><p>החיתום אישר את ההלוואה כפי שבנינו אותה. אנחנו נועלים את הריבית עכשיו. הפרטים כאן:</p></div>`, b: 'צפייה באישור' },
    restructure: { s: 'החיתום ביקש שינוי. בוא נדבר לפני הנעילה', h: (n) => `<div dir="rtl"><p>שלום ${n},</p><p>החיתום בדק את ההלוואה וביקש שינוי. לפני שננעל משהו, בוא נעבור יחד על מה השתנה, למה, ומה האפשרויות.</p></div>`, b: 'מה השתנה וקביעת שיחה' },
    declined: { s: 'עדכון על ההלוואה שלך: בוא נדבר', h: (n) => `<div dir="rtl"><p>שלום ${n},</p><p>החיתום החזיר תשובה על ההלוואה, ואנחנו צריכים לדבר על האפשרויות לפני שממשיכים.</p></div>`, b: 'צפייה בעדכון וקביעת שיחה' },
    locked: { s: 'הריבית ננעלה. הנה מה שאנחנו צריכים לסגירה', h: (n) => `<div dir="rtl"><p>שלום ${n},</p><p>הריבית שלך ננעלה. בעמוד מופיעים התנאים הנעולים ורשימה קצרה של מה שאנחנו צריכים ממך כדי לסגור.</p></div>`, b: 'צפייה בתנאים הנעולים' },
    conditions: { s: 'רשימת המסמכים לסגירה עודכנה', h: (n) => `<div dir="rtl"><p>שלום ${n},</p><p>עדכנו את הרשימה שלך. בעמוד רואים מה קיבלנו, מה עוד חסר, והסבר קצר למה כל פריט נדרש.</p></div>`, b: 'צפייה ברשימה' }
  }
};

export function borrowerEmail(kind, lang, { name, url, lo }) {
  const c = (B[lang] || B.en)[kind];
  const first = esc(String(name || '').split(/\s+/)[0] || '');
  return { subject: c.s, html: c.h(first, lo) + button(url, c.b) + (c.f ? c.f(lo) : '') };
}
export const copySubject = (lang) => (B[lang] || B.en).copy.s;

// Turns a plain-text message the team wrote into a simple, safe HTML email.
export function textToHtml(text) {
  const rtl = /[\u0590-\u05FF]/.test(text);
  return `<div${rtl ? ' dir="rtl"' : ''} style="font-size:15px;line-height:1.55">${esc(text).replace(/\n/g, '<br>')}</div>`;
}
