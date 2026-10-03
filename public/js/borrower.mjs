import { scenario, fmt } from './calc.mjs';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $$ = (n, d = 2) => '$' + fmt(n, d);
const pct = (n) => (n === null || n === undefined ? '' : `${Number(n).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`);

const params = new URLSearchParams(location.search);
const previewId = params.get('preview');
const token = previewId ? null : location.pathname.split('/r/')[1]?.split(/[/?#]/)[0] || params.get('t');

const S = { view: null, lang: 'en', choices: { impounds: 'keep', ppp: 'keep' }, showBreakdown: false, chat: [], busy: false, sending: false, error: '', uploading: null, upErr: {} };

// ---------------- Copy ----------------
const C = {
  en: {
    dir: 'ltr', team: 'Your loan team', purchase: 'Purchase', refi: 'Refinance',
    reqEyebrow: (v) => v > 1 ? `Step 1 of 3 · Updated request (version ${v})` : 'Step 1 of 3 · Before we submit',
    reqH1: "Here's the loan we're requesting for you",
    reqIntro: 'We structure your loan within what the guidelines allow, and we push those limits on your behalf. Based on our experience, this is what we believe underwriting will accept.',
    noteFrom: (n) => `A note from ${n}`,
    cashToClose: 'Estimated cash to close', cashToYou: 'Estimated cash to you',
    subPurchase: (dep, poc) => [dep ? `After your ${dep} deposit` : '', poc ? `${dep ? 'and ' : 'After '}${poc} you already paid` : ''].filter(Boolean).join(' ') || 'Down payment plus closing costs',
    subRefi: 'After paying off your current loan and closing costs',
    showHow: 'See how we got this', hideHow: 'Hide breakdown',
    bDown: 'Down payment', bCosts: 'Total estimated closing costs', bLenderCredit: 'Lender credit', bPaid: 'Already paid (appraisal, credit report)', bDeposit: 'Deposit already paid', bSeller: 'Seller credit',
    bLoan: 'New loan amount', bPayoff: 'Paying off your current loan(s)',
    termsHeading: "The terms we're requesting",
    price: 'Purchase price', value: 'Estimated property value', loan: 'Loan amount', ltvOf: (l, base) => `${l}% of the ${base}`, basePrice: 'purchase price', baseValue: 'property value',
    down: 'Down payment', payoff: 'Paying off',
    rate: 'Interest rate', notLocked: 'Not locked yet. Can change until we lock.', locked: 'Locked',
    payment: 'Est. monthly payment',
    payIncl: (pi, extras, io) => `${pi} ${io ? 'interest-only payment' : 'principal & interest'} + ${extras}`,
    payExcl: (pi, extras, ti, io) => `${pi} ${io ? 'interest-only payment' : 'principal & interest'}${extras ? ' + ' + extras : ''}. You pay taxes & insurance yourself (about ${ti} a month).`,
    extrasIncl: (hoa, mi) => ['taxes', 'insurance', hoa ? 'HOA' : '', mi ? 'mortgage insurance' : ''].filter(Boolean).join(', '),
    extrasExcl: (hoa, mi) => [hoa ? 'HOA' : '', mi ? 'mortgage insurance' : ''].filter(Boolean).join(', '),
    io: 'Interest-only', ioVal: (y) => y ? `First ${y} years` : 'Yes', ioSub: 'Payments cover interest only during this period',
    points: 'Points', noPoints: 'No discount points',
    ppp: 'Prepayment penalty', years: (n) => `${n} year${n === 1 ? '' : 's'}`, none: 'None',
    imp: 'Impounds (taxes & insurance)', impIncl: 'Included', impWaived: 'Waived', impNot: 'Not included',
    costsTitle: 'Estimated closing costs',
    lenderLabel: 'Lender fees (Ameritrust)', thirdLabel: 'Third-party costs & prepaids',
    reservesLabel: 'Reserves for impounds',
    reservesSub: (tm, im) => `Starting balance of your tax & insurance account${tm || im ? `: ${[tm ? `${tm} months of taxes` : '', im ? `${im} months of insurance` : ''].filter(Boolean).join(' and ')}` : ''}, less a standard adjustment`,
    reservesWaived: 'Not collected, because you chose to waive impounds',
    waiverFee: 'Impound waiver fee', waiverSub: 'One-time, 0.25% of the loan amount',
    pppFee: 'Prepayment penalty buy-down', pppFeeSub: 'One-time, 0.5% of the loan amount',
    costsNotePaid: (p) => `Includes ${p} you already paid before closing (for example the appraisal and credit report).`,
    costsNoteCredit: (c) => `A lender credit of ${c} reduces what you pay.`,
    andMore: (n) => `and ${n} more`,
    choicesTitle: 'Your choices', choicesSub: 'Your request starts with the options marked below. Change them if you prefer, and your numbers update right away.',
    goodToKnow: 'Good to know',
    impTitle: 'Impounds (taxes & insurance)',
    impExplain: "Impounds, also called an escrow account, means we collect your property taxes and homeowners insurance as part of your monthly payment, then pay those bills for you when they're due. At closing, the account starts with a reserve so there's enough when the first bills arrive.",
    impKeep: 'Keep impounds', impKeepSub: (p) => `About ${p} a month all-in. Taxes and insurance are paid for you.`,
    impWaive: 'Waive impounds', impWaiveSub: (fee, p, res) => `One-time fee of 0.25% (${fee}). Your monthly payment drops to about ${p}, the ${res} reserve is not collected at closing, and you pay your property taxes and insurance yourself, on time, when they are due.`,
    impFN: 'For Foreign National loans, impounds are required and cannot be waived.',
    impNotExplain: (ti) => `Your loan does not include impounds. You will pay your property taxes and homeowners insurance yourself, directly, when they are due (about ${ti} a month).`,
    pppTitle: 'Prepayment penalty',
    pppExplain: (y, sch) => `Your loan has a ${y}-year prepayment penalty: if you sell or refinance within the first ${y} year${y === 1 ? '' : 's'}, a penalty applies${sch ? ` (${sch})` : ''}.`,
    pppBuy: ' You can buy down the penalty period to 2 years for a one-time fee of 0.5% of the loan amount.',
    ppp3: (y) => `${y}-year penalty`, ppp3Sub: 'Included in your terms. No extra cost.', ppp2: '2-year penalty', ppp2Sub: (f) => `One-time fee of 0.5% (${f}).`,
    chatTitle: 'Ask about your loan', chatSub: "AI assistant. It explains the terms on this page in plain English or Hebrew. It can't change your terms.",
    chipImp: 'What are impounds?', chipPppBuy: 'Should I shorten the prepayment penalty?', chipPpp: 'How does the prepayment penalty work?', chipFunds: (toYou) => toYou ? 'How did you get my cash-to-me amount?' : 'Why is my cash to close this amount?',
    inputLabel: 'Your question', inputPh: 'Type a question, in any language', ask: 'Ask', thinking: 'Thinking…',
    chatFoot: 'Answers are explanations only. Your loan officer confirms any change.',
    aiOff: "The assistant isn't available right now. Try a suggested question above, or schedule a call.",
    nextTitle: 'What happens next',
    n1: 'We submit your loan and advocate for these terms.',
    n2: 'The underwriter reviews it. They can accept it, ask for a change (for example a larger down payment), or decline.',
    n3: "If it's approved as requested, we lock your rate right away. If anything changes, we call you first to explain what changed, why, and your options.",
    disclaimer: 'These are your current proposed terms and estimated costs. They can change if your information changes, including the appraised value, your credit, or market pricing. Your rate is not final until it is locked.',
    youChose: 'You chose', confirmBtn: 'Yes, submit my loan as shown', discussBtn: "I'd like to discuss first",
    confirmedTitle: 'Thank you. Your request is confirmed.', confirmedBody: (when) => `Confirmed ${when}. A copy was sent to your email. We will let you know as soon as underwriting responds.`,
    discussTitle: "Let's talk first", discussBody: (lo) => `Pick a time for a 15-minute call with ${lo}. We won't submit until we've talked.`, discussAfter: 'Already talked and happy with the terms? You can confirm below.',
    book: 'Schedule a 15-minute call', back: 'Back',
    apEyebrow: 'Step 2 of 3 · Underwriting decision', apH1: 'Good news: approved as requested', apLead: "Underwriting accepted your loan the way we structured it. No changes were needed. We're locking your rate now.",
    apChecks: 'Approved as you confirmed', ltv: 'Loan-to-value', program: 'Program',
    yourRate: 'Your rate', rateToday: 'Your rate today', rateSame: 'Same as when we submitted.', rateMoved: (a) => `Was ${a} when we submitted. Market pricing moved; your loan structure did not change.`,
    payFollows: "We'll confirm your monthly payment with your lock.",
    apNext1: "You'll get your lock confirmation, plus a short, plain-English list of the items underwriting needs before closing.", apNext2: 'Nothing for you to do right now.', apNext2Items: 'You can start sending the items below now. It helps us close faster.',
    apDisc: 'Your loan structure was approved as requested. The rate reflects market pricing at the time we lock. Your terms can still change if your information changes before closing.',
    questions: 'Questions? Schedule a call',
    rsEyebrow: 'Step 2 of 3 · Underwriting decision', rsH1: "Underwriting asked for a change. Let's talk before we lock.", rsLead: 'We pushed for the terms you confirmed. Underwriting approved your loan, but only with the change below. Nothing is locked yet.',
    dcH1: "Underwriting came back on your loan. Let's talk about your options.", dcLead: 'We pushed for the terms you confirmed, and we have more work to do together. Nothing is locked.',
    whatChanged: 'What changed', youConfirmed: 'You confirmed', approved: 'Approved', why: 'Why',
    callCover: "On a 15-minute call we'll cover", c1: 'What changed and how it affects your cash to close and payment', c2: 'Why underwriting asked for it', c3: 'Your options, and what we recommend',
    rsDisc: "We won't lock your rate until we've talked. Market pricing can move in the meantime, so the sooner we speak, the better.",
    lkEyebrow: 'Step 3 of 3 · Rate locked', lkH1: "Your rate is locked. Here's what we need to close.", lockedRate: 'Locked rate', lockedUntil: (d) => `Locked until ${d}`,
    stages: ['Requested', 'Approved', 'Locked', 'Your items', 'Closing'],
    need: 'What we need from you', items: (n) => `${n} item${n === 1 ? '' : 's'}`, progress: (d, n) => `${d} of ${n} received`, whyLbl: 'Why', received: 'Received', timing: { prior_to_docs: 'Needed now', prior_to_funding: 'Before closing', at_closing: 'At closing', post_closing: 'After closing', other: '' }, noItems: "Nothing needed right now. We'll let you know if underwriting asks for anything.",
    lkDisc: "Once these items are received and accepted by underwriting, we're cleared to close. Please send them before your lock expires.",
    sendDocs: 'Upload each document on its item above (a clear phone photo or a PDF). If that’s not easy, reply to our email and attach it.',
    upBtn: 'Upload document', upMore: 'Add another file', upBusy: 'Uploading…', upTooBig: 'That file is larger than 5 MB. Try a photo of each page instead.', upFail: 'The upload didn’t go through. Please try again.',
    upHelp: 'AI does a quick first check of each file and can make mistakes. A team member reviews every document.',
    aiChecking: 'Checking the file…', aiGood: 'Looks good at first glance. A team member will confirm.', aiConfirm: 'A team member will confirm.', aiIssue: 'Possible issue:', aiIssueTail: 'You can upload a corrected file. A team member will also review it.', aiUnknown: 'Received. A team member will review it.',
    upAccepted: 'Accepted by our team', upReturned: 'Our team needs a new file:', upReturnedTail: 'Please upload a corrected file.', upCleared: 'Cleared by underwriting', upFromTeam: 'added by our team',
    clH1: 'Your loan has closed. Congratulations!', clLead: 'Thank you for trusting us with your loan. For your privacy, the documents you uploaded here have been deleted. Reach out anytime if you need anything.',
    upH1: "We're updating your terms", upLead: "Your loan team is preparing an updated version. You'll get a new link by email soon, and this page will stop working when it arrives.",
    supH1: 'This link has been replaced', supLead: 'Your loan team sent you an updated version. Please use the link in the newest email.',
    badH1: 'This link is not valid', badLead: 'Please use the link from your most recent email, or contact your loan team.',
    errSend: 'Something went wrong. Please try again.'
  },
  he: {
    dir: 'rtl', team: 'צוות ההלוואה שלך', purchase: 'רכישה', refi: 'מימון מחדש',
    reqEyebrow: (v) => v > 1 ? `שלב 1 מתוך 3 · בקשה מעודכנת (גרסה ${v})` : 'שלב 1 מתוך 3 · לפני ההגשה',
    reqH1: 'זו ההלוואה שאנחנו מבקשים עבורך',
    reqIntro: 'אנחנו בונים את ההלוואה שלך במסגרת מה שההנחיות מאפשרות, ודוחפים את הגבולות לטובתך. על סמך הניסיון שלנו, זה מה שאנחנו מאמינים שהחיתום יאשר.',
    noteFrom: (n) => `הערה מ${n}`,
    cashToClose: 'סכום משוער להבאה לסגירה', cashToYou: 'סכום משוער שתקבל',
    subPurchase: (dep, poc) => [dep ? `אחרי הפיקדון של ${dep}` : '', poc ? `${dep ? 'ו-' : 'אחרי '}${poc} שכבר שילמת` : ''].filter(Boolean).join(' ') || 'מקדמה ועלויות סגירה',
    subRefi: 'אחרי פירעון ההלוואה הנוכחית ועלויות הסגירה',
    showHow: 'איך הגענו לסכום הזה', hideHow: 'הסתר פירוט',
    bDown: 'מקדמה', bCosts: 'סה"כ עלויות סגירה משוערות', bLenderCredit: 'זיכוי מהמלווה', bPaid: 'כבר שולם (שמאות, דוח אשראי)', bDeposit: 'פיקדון ששולם', bSeller: 'זיכוי מהמוכר',
    bLoan: 'סכום ההלוואה החדשה', bPayoff: 'פירעון ההלוואה הנוכחית',
    termsHeading: 'התנאים שאנחנו מבקשים',
    price: 'מחיר רכישה', value: 'שווי נכס משוער', loan: 'סכום ההלוואה', ltvOf: (l, base) => `${l}% מ${base}`, basePrice: 'מחיר הרכישה', baseValue: 'שווי הנכס',
    down: 'מקדמה', payoff: 'פירעון',
    rate: 'ריבית', notLocked: 'עדיין לא ננעלה. יכולה להשתנות עד הנעילה.', locked: 'נעולה',
    payment: 'תשלום חודשי משוער',
    payIncl: (pi, extras, io) => `${pi} ${io ? 'ריבית בלבד' : 'קרן וריבית'} + ${extras}`,
    payExcl: (pi, extras, ti, io) => `${pi} ${io ? 'ריבית בלבד' : 'קרן וריבית'}${extras ? ' + ' + extras : ''}. מסים וביטוח משולמים על ידך (כ-${ti} לחודש).`,
    extrasIncl: (hoa, mi) => ['מסים', 'ביטוח', hoa ? 'דמי ועד' : '', mi ? 'ביטוח משכנתא' : ''].filter(Boolean).join(', '),
    extrasExcl: (hoa, mi) => [hoa ? 'דמי ועד' : '', mi ? 'ביטוח משכנתא' : ''].filter(Boolean).join(', '),
    io: 'ריבית בלבד', ioVal: (y) => y ? `${y} השנים הראשונות` : 'כן', ioSub: 'בתקופה הזו התשלום מכסה ריבית בלבד',
    points: 'נקודות', noPoints: 'ללא נקודות',
    ppp: 'קנס פירעון מוקדם', years: (n) => n === 1 ? 'שנה' : n === 2 ? 'שנתיים' : `${n} שנים`, none: 'אין',
    imp: 'חשבון נאמנות (מסים וביטוח)', impIncl: 'כלול', impWaived: 'בוטל', impNot: 'לא כלול',
    costsTitle: 'עלויות סגירה משוערות',
    lenderLabel: 'עמלות המלווה (Ameritrust)', thirdLabel: 'צד שלישי ותשלומים מראש',
    reservesLabel: 'רזרבות לחשבון הנאמנות',
    reservesSub: (tm, im) => `יתרת הפתיחה של חשבון המסים והביטוח${tm || im ? `: ${[tm ? `${tm} חודשי מסים` : '', im ? `${im} חודשי ביטוח` : ''].filter(Boolean).join(' ו-')}` : ''}, בניכוי התאמה רגילה`,
    reservesWaived: 'לא נגבה, כי בחרת לוותר על חשבון הנאמנות',
    waiverFee: 'עמלת ויתור על חשבון נאמנות', waiverSub: 'חד-פעמית, 0.25% מסכום ההלוואה',
    pppFee: 'קיצור קנס הפירעון המוקדם', pppFeeSub: 'חד-פעמית, 0.5% מסכום ההלוואה',
    costsNotePaid: (p) => `כולל ${p} ששילמת כבר לפני הסגירה (למשל שמאות ודוח אשראי).`,
    costsNoteCredit: (c) => `זיכוי מהמלווה של ${c} מקטין את הסכום לתשלום.`,
    andMore: (n) => `ועוד ${n}`,
    choicesTitle: 'הבחירות שלך', choicesSub: 'הבקשה כוללת את האפשרויות המסומנות. אפשר לשנות, והמספרים מתעדכנים מיד.',
    goodToKnow: 'כדאי לדעת',
    impTitle: 'חשבון נאמנות (מסים וביטוח)',
    impExplain: 'חשבון נאמנות (Impounds) פירושו שאנחנו גובים את מס הנכס וביטוח הדירה כחלק מהתשלום החודשי, ומשלמים את החשבונות האלה עבורך כשהם מגיעים. בסגירה החשבון נפתח עם רזרבה, כדי שיהיה מספיק כשהחשבונות הראשונים יגיעו.',
    impKeep: 'להשאיר את חשבון הנאמנות', impKeepSub: (p) => `כ-${p} לחודש בסך הכל. המסים והביטוח משולמים עבורך.`,
    impWaive: 'לוותר על חשבון הנאמנות', impWaiveSub: (fee, p, res) => `עמלה חד-פעמית של 0.25% (${fee}). התשלום החודשי יורד לכ-${p}, הרזרבה של ${res} לא נגבית בסגירה, ואתה משלם את מס הנכס והביטוח בעצמך, בזמן.`,
    impFN: 'בהלוואות לתושבי חוץ חשבון נאמנות הוא חובה ולא ניתן לוותר עליו.',
    impNotExplain: (ti) => `ההלוואה שלך לא כוללת חשבון נאמנות. אתה משלם את מס הנכס וביטוח הדירה בעצמך, ישירות, כשהם מגיעים (כ-${ti} לחודש).`,
    pppTitle: 'קנס פירעון מוקדם',
    pppExplain: (y, sch) => `להלוואה שלך יש קנס פירעון מוקדם ל-${y === 1 ? 'שנה' : y === 2 ? 'שנתיים' : `${y} שנים`}: אם תמכור או תמחזר בתקופה הזו, יחול קנס${sch ? ` (${sch})` : ''}.`,
    pppBuy: ' אפשר לקצר את תקופת הקנס לשנתיים תמורת עמלה חד-פעמית של 0.5% מסכום ההלוואה.',
    ppp3: (y) => `קנס ל-${y} שנים`, ppp3Sub: 'כלול בתנאים. ללא עלות נוספת.', ppp2: 'קנס לשנתיים', ppp2Sub: (f) => `עמלה חד-פעמית של 0.5% (${f}).`,
    chatTitle: 'שאלו על ההלוואה', chatSub: 'עוזר AI. מסביר את התנאים בעמוד הזה בשפה פשוטה, בעברית או באנגלית. הוא לא יכול לשנות את התנאים.',
    chipImp: 'מה זה חשבון נאמנות?', chipPppBuy: 'כדאי לקצר את קנס הפירעון?', chipPpp: 'איך עובד קנס הפירעון המוקדם?', chipFunds: (toYou) => toYou ? 'איך חישבתם את הסכום שאקבל?' : 'למה זה הסכום להבאה לסגירה?',
    inputLabel: 'השאלה שלך', inputPh: 'כתבו שאלה, בכל שפה', ask: 'שאל', thinking: 'חושב…',
    chatFoot: 'התשובות הן הסברים בלבד. כל שינוי מאושר על ידי נציג ההלוואה.',
    aiOff: 'העוזר לא זמין כרגע. נסו אחת מהשאלות המוצעות, או קבעו שיחה.',
    nextTitle: 'מה קורה עכשיו',
    n1: 'אנחנו מגישים את ההלוואה ונלחמים על התנאים האלה עבורך.',
    n2: 'החתם בודק את התיק. הוא יכול לאשר, לבקש שינוי (למשל מקדמה גדולה יותר), או לדחות.',
    n3: 'אם ההלוואה מאושרת כפי שביקשנו, ננעל את הריבית מיד. אם משהו משתנה, נתקשר אליך קודם כדי להסביר מה השתנה, למה, ומה האפשרויות.',
    disclaimer: 'אלה התנאים והעלויות המשוערים כרגע. הם יכולים להשתנות אם המידע משתנה, כולל שווי השמאות, דירוג האשראי או מחירי השוק. הריבית אינה סופית עד שהיא ננעלת.',
    youChose: 'הבחירה שלך', confirmBtn: 'כן, הגישו את ההלוואה כפי שמוצג', discussBtn: 'אני רוצה לדבר קודם',
    confirmedTitle: 'תודה. הבקשה שלך אושרה.', confirmedBody: (when) => `אושר ב-${when}. עותק נשלח לאימייל שלך. נעדכן אותך ברגע שהחיתום יחזיר תשובה.`,
    discussTitle: 'בוא נדבר קודם', discussBody: (lo) => `בחר זמן לשיחה של 15 דקות עם ${lo}. לא נגיש לפני שנדבר.`, discussAfter: 'כבר דיברנו ואתה מרוצה מהתנאים? אפשר לאשר למטה.',
    book: 'קביעת שיחה של 15 דקות', back: 'חזרה',
    apEyebrow: 'שלב 2 מתוך 3 · החלטת החיתום', apH1: 'חדשות טובות: אושר כפי שביקשנו', apLead: 'החיתום אישר את ההלוואה כפי שבנינו אותה, בלי שינויים. אנחנו נועלים את הריבית עכשיו.',
    apChecks: 'אושר כפי שאישרת', ltv: 'יחס מימון', program: 'תוכנית',
    yourRate: 'הריבית שלך', rateToday: 'הריבית שלך היום', rateSame: 'כמו בזמן ההגשה.', rateMoved: (a) => `בזמן ההגשה הייתה ${a}. מחירי השוק זזו; מבנה ההלוואה לא השתנה.`,
    payFollows: 'נאשר את התשלום החודשי יחד עם הנעילה.',
    apNext1: 'תקבל אישור נעילה ורשימה קצרה ופשוטה של מה שהחיתום צריך לפני הסגירה.', apNext2: 'אין צורך לעשות כלום כרגע.', apNext2Items: 'אפשר כבר להתחיל לשלוח את הפריטים שלמטה. זה עוזר לנו לסגור מהר יותר.',
    apDisc: 'מבנה ההלוואה אושר כפי שביקשנו. הריבית משקפת את מחירי השוק בזמן הנעילה. התנאים עדיין יכולים להשתנות אם המידע משתנה לפני הסגירה.',
    questions: 'שאלות? קבעו שיחה',
    rsEyebrow: 'שלב 2 מתוך 3 · החלטת החיתום', rsH1: 'החיתום ביקש שינוי. בוא נדבר לפני הנעילה.', rsLead: 'נלחמנו על התנאים שאישרת. החיתום אישר את ההלוואה, אבל רק עם השינוי שלמטה. שום דבר עוד לא ננעל.',
    dcH1: 'החיתום החזיר תשובה. בוא נדבר על האפשרויות.', dcLead: 'נלחמנו על התנאים שאישרת, ויש לנו עוד עבודה ביחד. שום דבר לא ננעל.',
    whatChanged: 'מה השתנה', youConfirmed: 'מה שאישרת', approved: 'מה שאושר', why: 'למה',
    callCover: 'בשיחה של 15 דקות נעבור על', c1: 'מה השתנה ואיך זה משפיע על הסכום לסגירה ועל התשלום', c2: 'למה החיתום ביקש את זה', c3: 'האפשרויות שלך, ומה אנחנו ממליצים',
    rsDisc: 'לא ננעל את הריבית לפני שנדבר. מחירי השוק יכולים לזוז בינתיים, אז כדאי לדבר כמה שיותר מהר.',
    lkEyebrow: 'שלב 3 מתוך 3 · הריבית ננעלה', lkH1: 'הריבית ננעלה. הנה מה שאנחנו צריכים לסגירה.', lockedRate: 'ריבית נעולה', lockedUntil: (d) => `נעולה עד ${d}`,
    stages: ['בקשה', 'אישור', 'נעילה', 'המסמכים שלך', 'סגירה'],
    need: 'מה אנחנו צריכים ממך', items: (n) => `${n} פריטים`, progress: (d, n) => `התקבלו ${d} מתוך ${n}`, whyLbl: 'למה', received: 'התקבל', timing: { prior_to_docs: 'נדרש עכשיו', prior_to_funding: 'לפני הסגירה', at_closing: 'בסגירה', post_closing: 'אחרי הסגירה', other: '' }, noItems: 'אין צורך בכלום כרגע. נעדכן אם החיתום יבקש משהו.',
    lkDisc: 'ברגע שהפריטים האלה יתקבלו ויאושרו בחיתום, אפשר לסגור. נא לשלוח אותם לפני שהנעילה פגה.',
    sendDocs: 'אפשר להעלות כל מסמך ישירות בפריט שלו למעלה (צילום ברור מהטלפון או PDF). אם זה לא נוח, אפשר להשיב למייל שלנו ולצרף אותו.',
    upBtn: 'העלאת מסמך', upMore: 'הוספת קובץ נוסף', upBusy: 'מעלה…', upTooBig: 'הקובץ גדול מ-5MB. נסה לצלם כל עמוד בנפרד.', upFail: 'ההעלאה לא הצליחה. נא לנסות שוב.',
    upHelp: 'בינה מלאכותית עושה בדיקה ראשונית מהירה לכל קובץ ועלולה לטעות. נציג מהצוות בודק כל מסמך.',
    aiChecking: 'בודקים את הקובץ…', aiGood: 'במבט ראשון זה נראה תקין. נציג מהצוות יאשר.', aiConfirm: 'נציג מהצוות יאשר.', aiIssue: 'ייתכן שיש בעיה:', aiIssueTail: 'אפשר להעלות קובץ מתוקן. נציג מהצוות יבדוק גם כן.', aiUnknown: 'התקבל. נציג מהצוות יבדוק אותו.',
    upAccepted: 'אושר על ידי הצוות', upReturned: 'הצוות צריך קובץ חדש:', upReturnedTail: 'נא להעלות קובץ מתוקן.', upCleared: 'אושר על ידי החיתום', upFromTeam: 'נוסף על ידי הצוות',
    clH1: 'ההלוואה נסגרה. מזל טוב!', clLead: 'תודה שבחרת בנו. לשמירה על פרטיותך, המסמכים שהעלית כאן נמחקו. אנחנו כאן לכל דבר שתצטרך.',
    upH1: 'אנחנו מעדכנים את התנאים שלך', upLead: 'צוות ההלוואה מכין גרסה מעודכנת. בקרוב תקבל קישור חדש במייל, והעמוד הזה יפסיק לעבוד כשהוא יגיע.',
    supH1: 'הקישור הזה הוחלף', supLead: 'צוות ההלוואה שלח לך גרסה מעודכנת. נא להשתמש בקישור מהמייל החדש ביותר.',
    badH1: 'הקישור לא תקין', badLead: 'נא להשתמש בקישור מהמייל האחרון, או לפנות לצוות ההלוואה.',
    errSend: 'משהו השתבש. נא לנסות שוב.'
  }
};
const T = () => C[S.lang];

const ICON_OK = (s = 26) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#0E5A47" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const ICON_CHAT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3"/><path d="M12 16.5h.01"/></svg>';

function fmtDate(iso, withTime) {
  if (!iso) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00') : new Date(iso);
  return d.toLocaleString(S.lang === 'he' ? 'he-IL' : 'en-US', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'long' });
}

function header() {
  const t = T(), lo = S.view?.terms?.lo?.name || '';
  return `<div class="top"><div><div class="who">${esc(lo)}</div><div class="sub">${esc(t.team)}</div></div>
    <div class="lang"><button data-act="lang" data-v="en" aria-pressed="${S.lang === 'en'}" aria-label="English">EN</button><button data-act="lang" data-v="he" aria-pressed="${S.lang === 'he'}" aria-label="עברית">עב</button></div></div>`;
}
const addr = (tm) => `<div class="addr"><bdi>${esc(tm.property)}</bdi> · ${esc(tm.transaction === 'purchase' ? T().purchase : T().refi)}</div>`;
const calLink = (label, cls = 'secondary') => { const u = S.view?.terms?.lo?.calendly; return u ? `<a class="btn ${cls}" href="${esc(u)}" target="_blank" rel="noopener">${esc(label)}</a>` : ''; };

// ---------------- Stage 1: request ----------------
function paymentSub(tm, sc) {
  const t = T(), m = tm.monthly, io = tm.interestOnly;
  const impNow = tm.impoundsIncluded && !sc.waive;
  return impNow ? t.payIncl($$(m.pi, 0), t.extrasIncl(m.hoa > 0, m.mi > 0), io) : t.payExcl($$(m.pi, 0), t.extrasExcl(m.hoa > 0, m.mi > 0), $$(m.ti, 0), io);
}

function listNames(items, max = 6) {
  const names = items.filter((x) => x.amount).map((x) => x.name);
  return names.slice(0, max).join(', ') + (names.length > max ? `, ${T().andMore(names.length - max)}` : '');
}

function screenRequest() {
  const v = S.view, tm = v.terms, t = T(), sc = scenario(tm, S.choices);
  const purchase = tm.transaction === 'purchase', toYou = sc.funds.direction === 'to_borrower';
  const resp = v.response, done = resp?.action === 'confirm' || v.status === 'confirmed', discussing = v.status === 'discuss';
  const locked = done || v.preview;

  const brk = purchase ? [
    [t.bDown, tm.downPayment], [t.bCosts, sc.totalCosts],
    tm.lenderCredit ? [t.bLenderCredit, -tm.lenderCredit] : null, tm.paidBeforeClosing ? [t.bPaid, -tm.paidBeforeClosing] : null,
    tm.deposit ? [t.bDeposit, -tm.deposit] : null, tm.sellerCredit ? [t.bSeller, -tm.sellerCredit] : null
  ] : [
    [t.bLoan, tm.loanAmount], [t.bPayoff, -tm.payoff], [t.bCosts, -sc.totalCosts],
    tm.lenderCredit ? [t.bLenderCredit, tm.lenderCredit] : null, tm.paidBeforeClosing ? [t.bPaid, tm.paidBeforeClosing] : null
  ];
  const sign = (n) => (n < 0 ? '−' + $$(-n) : $$(n));

  const base = purchase ? tm.purchasePrice : tm.estimatedValue;
  const rows = [
    [purchase ? t.price : t.value, $$(base, 0), ''],
    [t.loan, $$(tm.loanAmount, 0), tm.ltv ? t.ltvOf(tm.ltv, purchase ? t.basePrice : t.baseValue) : ''],
    purchase ? [t.down, $$(tm.downPayment, 0), tm.downPct ? `${tm.downPct}%` : ''] : [t.payoff, $$(tm.payoff, 0), ''],
    [t.rate, pct(tm.rate), tm.lockStatus === 'locked' ? t.locked : t.notLocked],
    [t.payment, $$(sc.payment, 0), paymentSub(tm, sc)],
    tm.interestOnly ? [t.io, t.ioVal(tm.ioYears), t.ioSub] : null,
    [t.points, tm.points.dollars ? `${pct(tm.points.percent)} · ${$$(tm.points.dollars, 0)}` : t.noPoints, ''],
    [t.ppp, tm.ppp.years ? (sc.buydown ? t.years(2) : t.years(tm.ppp.years)) : t.none, tm.ppp.schedule && !sc.buydown ? tm.ppp.schedule : ''],
    [t.imp, !tm.impoundsIncluded ? t.impNot : sc.waive ? t.impWaived : t.impIncl, '']
  ].filter(Boolean);

  const costs = [
    [t.lenderLabel, tm.lenderFees, tm.lenderFeeItems.map((x) => `${x.name} ${$$(x.amount)}`).join(', ')],
    [t.thirdLabel, tm.thirdParty, listNames(tm.thirdPartyItems)]
  ];
  if (tm.reserves > 0) costs.push([t.reservesLabel, sc.waive ? 0 : tm.reserves, sc.waive ? t.reservesWaived : t.reservesSub(tm.reserveDetail.taxMonths, tm.reserveDetail.insMonths)]);
  if (sc.waive) costs.push([t.waiverFee, tm.options.impoundWaiver.fee, t.waiverSub]);
  if (sc.buydown) costs.push([t.pppFee, tm.options.pppBuydown.fee, t.pppFeeSub]);

  const choice = (act, id, sel, l, s) => `<button class="choice" data-act="${act}" data-v="${id}" aria-pressed="${sel === id}" ${locked ? 'disabled' : ''}><span class="dot"></span><span><div class="cl">${esc(l)}</div><div class="cs">${esc(s)}</div></span></button>`;
  const hasChoices = Boolean(tm.options.impoundWaiver || tm.options.pppBuydown);
  let impCard = `<div class="t">${esc(t.impTitle)}</div>`;
  if (tm.impoundsIncluded) {
    impCard += `<div class="x">${esc(t.impExplain)}</div>`;
    if (tm.options.impoundWaiver) {
      const wp = scenario(tm, { ...S.choices, impounds: 'waive' }).payment, kp = scenario(tm, { ...S.choices, impounds: 'keep' }).payment;
      impCard += choice('imp', 'keep', S.choices.impounds, t.impKeep, t.impKeepSub($$(kp, 0))) + choice('imp', 'waive', S.choices.impounds, t.impWaive, t.impWaiveSub($$(tm.options.impoundWaiver.fee), $$(wp, 0), $$(tm.reserves)));
    } else if (tm.foreignNational) impCard += `<div class="small" style="padding:0">${esc(t.impFN)}</div>`;
  } else impCard += `<div class="x">${esc(t.impNotExplain($$(tm.monthly.ti, 0)))}</div>`;
  let pppCard = '';
  if (tm.ppp.years > 0) {
    pppCard = `<div class="t">${esc(t.pppTitle)}</div><div class="x">${esc(t.pppExplain(tm.ppp.years, tm.ppp.schedule) + (tm.options.pppBuydown ? t.pppBuy : ''))}</div>`;
    if (tm.options.pppBuydown) pppCard += choice('ppp', 'keep', S.choices.ppp, t.ppp3(tm.ppp.years), t.ppp3Sub) + choice('ppp', 'buydown', S.choices.ppp, t.ppp2, t.ppp2Sub($$(tm.options.pppBuydown.fee)));
  }

  const chips = [t.chipImp, tm.ppp.years > 0 ? (tm.options.pppBuydown ? t.chipPppBuy : t.chipPpp) : null, t.chipFunds(toYou)].filter(Boolean);
  const msgs = S.chat.map((m) => `<div class="msg ${m.role}">${esc(m.text)}</div>`).join('') + (S.busy ? `<div class="msg assistant typing">${esc(t.thinking)}</div>` : '');
  const summary = `${t.youChose}: ${tm.ppp.years > 0 ? (sc.buydown ? t.ppp2 : t.ppp3(tm.ppp.years)) + ' · ' : ''}${tm.impoundsIncluded ? (sc.waive ? t.impWaive : t.impKeep) + ' · ' : ''}${toYou ? t.cashToYou : t.cashToClose} ${$$(sc.funds.amount)}`;

  let actions;
  if (done) {
    actions = `<div class="done"><div class="t">${esc(t.confirmedTitle)}</div><div class="b">${esc(summary)}</div><div class="b">${esc(t.confirmedBody(fmtDate(resp?.at, true)))}</div></div>`;
  } else {
    actions = (discussing ? `<div class="panel"><div class="t">${esc(t.discussTitle)}</div><div class="b">${esc(t.discussBody(tm.lo.name))}</div>${calLink(t.book, 'primary')}<div class="b">${esc(t.discussAfter)}</div></div>` : '')
      + `<div class="sum">${esc(summary)}</div>`
      + (S.error ? `<div class="disc" style="margin:0">${esc(S.error)}</div>` : '')
      + `<button class="btn primary" data-act="respond" data-v="confirm" ${v.preview || S.sending ? 'disabled' : ''}>${esc(t.confirmBtn)}</button>`
      + (discussing ? '' : `<button class="btn secondary" data-act="respond" data-v="discuss" ${v.preview || S.sending ? 'disabled' : ''}>${esc(t.discussBtn)}</button>`);
  }

  return `${header()}
    <div class="hero"><div class="eyebrow">${esc(t.reqEyebrow(v.version))}</div><h1>${esc(t.reqH1)}</h1><p class="lead">${esc(t.reqIntro)}</p>${addr(tm)}</div>
    ${done && v.checklist?.length ? checklistCard(v.checklist).html : ''}
    ${tm.noteToBorrower ? `<div class="m why"><div class="h">${esc(t.noteFrom(tm.lo.name))}</div><div class="b" dir="auto">${esc(tm.noteToBorrower)}</div></div>` : ''}
    <div class="m big"><div class="lbl">${esc(toYou ? t.cashToYou : t.cashToClose)}</div><div class="num">${$$(Math.round(sc.funds.amount), 0)}</div>
      <div class="lbl">${esc(purchase ? t.subPurchase(tm.deposit ? $$(tm.deposit, 0) : '', tm.paidBeforeClosing ? $$(tm.paidBeforeClosing, 0) : '') : t.subRefi)}</div>
      <button class="ghost" data-act="breakdown" aria-expanded="${S.showBreakdown}">${esc(S.showBreakdown ? t.hideHow : t.showHow)}</button>
      ${S.showBreakdown ? `<div class="rows">${brk.filter(Boolean).map(([l, n]) => `<div class="row"><span>${esc(l)}</span><span>${sign(n)}</span></div>`).join('')}
        <div class="row total"><span>${esc(toYou ? t.cashToYou : t.cashToClose)}</span><span>${$$(sc.funds.amount)}</span></div></div>` : ''}
    </div>
    <div class="m card"><div class="head">${esc(t.termsHeading)}</div>
      ${rows.map(([l, val, s]) => `<div class="term"><div class="l">${esc(l)}</div><div class="r"><div class="v">${esc(val)}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div></div>`).join('')}</div>
    <div class="m card"><div class="title">${esc(t.costsTitle)}</div>
      ${costs.map(([l, n, s]) => `<div class="cost"><div class="top2"><span>${esc(l)}</span><span class="v">${$$(n)}</span></div><div class="s">${esc(s)}</div></div>`).join('')}
      <div class="costtotal"><span>${esc(t.bCosts)}</span><span class="v">${$$(sc.totalCosts)}</span></div>
      <div class="small">${[tm.paidBeforeClosing ? t.costsNotePaid($$(tm.paidBeforeClosing)) : '', tm.lenderCredit ? t.costsNoteCredit($$(tm.lenderCredit)) : ''].filter(Boolean).map(esc).join(' ')}</div></div>
    <div class="section-h"><div class="t">${esc(hasChoices ? t.choicesTitle : t.goodToKnow)}</div>${hasChoices ? `<div class="s">${esc(t.choicesSub)}</div>` : ''}</div>
    <div class="m choice-card" style="margin-top:12px">${impCard}</div>
    ${pppCard ? `<div class="m choice-card" style="margin-top:12px">${pppCard}</div>` : ''}
    <div class="m chat" style="margin-top:24px">
      <div class="ch"><div class="ic">${ICON_CHAT}</div><div><div class="ct">${esc(t.chatTitle)}</div><div class="cs">${esc(t.chatSub)}</div></div></div>
      <div class="cb"><div class="chips">${chips.map((q) => `<button class="chip" data-act="chip" data-v="${esc(q)}" ${v.preview ? 'disabled' : ''}>${esc(q)}</button>`).join('')}</div>
        ${msgs ? `<div class="msgs" id="msgs">${msgs}</div>` : ''}
        <form class="ask" id="ask-form"><label class="sr-only" for="q">${esc(t.inputLabel)}</label><input id="q" type="text" autocomplete="off" maxlength="600" placeholder="${esc(t.inputPh)}" ${v.preview ? 'disabled' : ''}><button type="submit" ${S.busy || v.preview ? 'disabled' : ''}>${esc(t.ask)}</button></form>
        <div class="small" style="padding:0">${esc(t.chatFoot)}</div></div></div>
    <div class="steps"><div class="t">${esc(t.nextTitle)}</div>${[t.n1, t.n2, t.n3].map((x, i) => `<div class="step"><span class="n">${i + 1}</span><span>${esc(x)}</span></div>`).join('')}</div>
    <div class="disc">${esc(t.disclaimer)}</div>
    <div class="actions">${actions}</div>`;
}

// ---------------- Stage 2a / 2b / 3 ----------------
function screenApproved() {
  const v = S.view, tm = v.terms, uw = v.uw || {}, t = T();
  const moved = uw.approvedRate && uw.rateAtSubmission && Math.abs(uw.approvedRate - uw.rateAtSubmission) > 1e-9;
  const pay = v.response?.numbers?.payment;
  const checks = [[t.loan, $$(uw.approvedLoanAmount || tm.loanAmount, 0)], [t.ltv, `${uw.approvedLtv ?? tm.ltv}%`], tm.transaction === 'purchase' ? [t.down, $$(tm.downPayment, 0)] : null, [t.program, tm.program]].filter(Boolean);
  return `${header()}
    <div class="hero"><div class="eyebrow">${esc(t.apEyebrow)}</div><div class="icon-ok">${ICON_OK()}</div><h1>${esc(t.apH1)}</h1><p class="lead">${esc(t.apLead)}</p>${addr(tm)}</div>
    <div class="m card"><div class="head">${esc(t.apChecks)}</div>${checks.map(([l, val]) => `<div class="check"><span style="font-size:14px;color:var(--ink2)">${esc(l)}</span><span class="v"><bdi>${esc(val)}</bdi> ${ICON_OK(18)}</span></div>`).join('')}</div>
    <div class="m big"><div class="lbl">${esc(moved ? t.rateToday : t.yourRate)}</div><div class="num">${pct(uw.approvedRate || tm.rate)}</div>
      <div class="note">${esc(moved ? t.rateMoved(pct(uw.rateAtSubmission)) : t.rateSame)}</div>
      <div class="foot"><span>${esc(t.payment)}</span><strong>${moved || !pay ? esc(t.payFollows) : $$(pay, 0)}</strong></div></div>
    <div class="steps"><div class="t">${esc(t.nextTitle)}</div><div class="step" style="display:block">${esc(t.apNext1)}</div><div class="step" style="display:block">${esc(v.checklist?.length ? t.apNext2Items : t.apNext2)}</div></div>
    ${v.checklist?.length ? checklistCard(v.checklist).html : ''}
    <div class="disc">${esc(t.apDisc)}</div>
    <div class="actions">${calLink(t.questions)}</div>`;
}

function screenRestructure() {
  const v = S.view, tm = v.terms, uw = v.uw || {}, t = T(), declined = uw.result === 'declined';
  const ch = [];
  if (uw.approvedLtv !== null && uw.approvedLtv !== undefined && uw.approvedLtv !== tm.ltv) ch.push([t.ltv, `${tm.ltv}%`, `${uw.approvedLtv}%`]);
  if (uw.approvedLoanAmount && uw.approvedLoanAmount !== tm.loanAmount) ch.push([t.loan, $$(tm.loanAmount, 0), $$(uw.approvedLoanAmount, 0)]);
  if (uw.approvedLoanAmount && tm.transaction === 'purchase' && uw.approvedLoanAmount !== tm.loanAmount) ch.push([t.down, $$(tm.downPayment, 0), $$(tm.purchasePrice - uw.approvedLoanAmount, 0)]);
  if (uw.approvedRate && uw.approvedRate !== tm.rate) ch.push([t.rate, pct(tm.rate), pct(uw.approvedRate)]);
  return `${header()}
    <div class="hero"><div class="eyebrow alert">${esc(t.rsEyebrow)}</div><h1>${esc(declined ? t.dcH1 : t.rsH1)}</h1><p class="lead">${esc(declined ? t.dcLead : t.rsLead)}</p>${addr(tm)}</div>
    ${ch.length ? `<div class="m card"><div class="cmp-h"><div>${esc(t.whatChanged)}</div><div>${esc(t.youConfirmed)}</div><div>${esc(t.approved)}</div></div>
      ${ch.map(([l, f, to]) => `<div class="cmp-r"><div style="font-size:14px;color:var(--ink2)">${esc(l)}</div><div class="from">${esc(f)}</div><div class="to">${esc(to)}</div></div>`).join('')}</div>` : ''}
    ${uw.reason ? `<div class="m why" style="margin-top:12px"><div class="h">${esc(t.why)}</div><div class="b" dir="auto">${esc(uw.reason)}</div></div>` : ''}
    <div class="steps"><div class="t">${esc(t.callCover)}</div>${[t.c1, t.c2, t.c3].map((x, i) => `<div class="step"><span class="n">${i + 1}</span><span>${esc(x)}</span></div>`).join('')}</div>
    <div class="disc">${esc(t.rsDisc)}</div>
    <div class="actions">${calLink(t.book, 'primary')}</div>`;
}

// The borrower's checklist with uploads. Shown from the time the approval is in (approved / locked).
function checklistCard(rawItems) {
  const t = T(), he = S.lang === 'he';
  const items = (rawItems || []).map((x) => {
    const latest = (x.uploads || []).filter((u) => !u.deleted).at(-1);
    const attention = !x.cleared && latest && (latest.review?.decision === 'returned' || (!latest.review && latest.ai?.state === 'done' && latest.ai.verdict === 'needs_attention'));
    return { ...x, text: he && x.textHe ? x.textHe : x.text, why: he && x.whyHe ? x.whyHe : x.why, attention, done: x.done && !attention };
  });
  const open = items.filter((x) => !x.done), done = items.filter((x) => x.done);
  const upLine = (u) => {
    let cls = 'neutral', msg = '';
    if (u.review?.decision === 'accepted') { cls = 'good'; msg = t.upAccepted; }
    else if (u.review?.decision === 'returned') { cls = 'warn'; msg = `${t.upReturned} ${he && u.review.reasonHe ? u.review.reasonHe : u.review.reason} ${t.upReturnedTail}`; }
    else if (u.ai?.state === 'pending') { cls = 'busy'; msg = t.aiChecking; }
    else if (u.ai?.state === 'done' && u.ai.verdict === 'looks_good') { cls = 'good'; msg = (he ? u.ai.messageHe : u.ai.message) ? `${he ? u.ai.messageHe : u.ai.message} ${t.aiConfirm}` : t.aiGood; }
    else if (u.ai?.state === 'done' && u.ai.verdict === 'needs_attention') { cls = 'warn'; msg = `${t.aiIssue} ${(he ? u.ai.messageHe : u.ai.message) || ''} ${t.aiIssueTail}`; }
    else msg = t.aiUnknown;
    return `<div class="up up-${cls}"><div class="up-name" dir="auto">📄 ${esc(u.name)}${u.fromTeam ? ` · ${esc(t.upFromTeam)}` : ''}</div><div class="up-msg" dir="auto">${esc(msg)}</div></div>`;
  };
  const upControls = (x) => {
    if (!x.id) return '';
    const ups = (x.uploads || []).filter((u) => !u.deleted);
    const busy = S.uploading === x.id;
    return `${ups.map(upLine).join('')}${x.cleared ? `<div class="up up-good"><div class="up-msg">${esc(t.upCleared)}</div></div>` : ''}
      ${x.canUpload && !S.view.preview ? `<label class="upbtn ${busy ? 'is-busy' : ''}"><input type="file" accept="application/pdf,image/*" multiple data-up="${esc(x.id)}" ${busy ? 'disabled' : ''} hidden>${busy ? esc(t.upBusy) : esc(ups.length ? t.upMore : t.upBtn)}</label>` : ''}
      ${S.upErr[x.id] ? `<div class="up up-warn"><div class="up-msg">${esc(S.upErr[x.id])}</div></div>` : ''}`;
  };
  const itemHtml = (x) => `<div class="item ${x.done ? 'item-done' : ''}"><span class="box">${x.done ? ICON_OK(14) : ''}</span><span style="flex:1;min-width:0"><div class="it" style="font-weight:500" dir="auto">${esc(x.text)}</div>${x.why ? `<div class="id" dir="auto"><strong>${esc(t.whyLbl)}:</strong> ${esc(x.why)}</div>` : ''}${!x.done && t.timing[x.timing] ? `<div class="id">${esc(t.timing[x.timing])}</div>` : ''}${x.done && !(x.uploads || []).length ? `<div class="id">${esc(t.received)}</div>` : ''}${upControls(x)}</span></div>`;
  const html = `<div class="m card" style="padding-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:baseline;padding:12px 0 4px;gap:12px"><div style="font-size:16px;font-weight:700">${esc(t.need)}</div><div class="small" style="padding:0">${items.length ? esc(t.progress(done.length, items.length)) : ''}</div></div>
      ${items.length ? open.map(itemHtml).join('') + done.map(itemHtml).join('') : `<div class="small">${esc(t.noItems)}</div>`}
      <div class="small" style="padding:8px 0 0">${esc(t.sendDocs)}</div>${items.some((x) => x.canUpload) ? `<div class="small" style="padding:6px 0 0">${esc(t.upHelp)}</div>` : ''}</div>`;
  return { html, open };
}

function screenLocked() {
  const v = S.view, tm = v.terms, lk = v.lock || {}, t = T();
  const card = checklistCard(lk.items && lk.items.length ? lk.items : (lk.conditions || []).map((c) => ({ text: c, why: '', done: false })));
  const st = t.stages.map((l, i) => [l, i < 3 ? 'b-done' : i === 3 && card.open.length ? 'b-now' : i === 3 ? 'b-done' : '']);
  return `${header()}
    <div class="hero"><div class="eyebrow">${esc(t.lkEyebrow)}</div><h1>${esc(t.lkH1)}</h1>${addr(tm)}</div>
    <div class="m big"><div class="lbl">${esc(t.lockedRate)}</div><div class="num">${pct(lk.rate)}</div><div class="note">${esc(t.lockedUntil(fmtDate(lk.expires)))}</div>
      <div class="foot"><span>${esc(t.payment)}</span><strong>${$$(lk.payment, 0)}</strong></div></div>
    <div class="m bars">${st.map(([l, c]) => `<div><div class="bar ${c}"></div>${esc(l)}</div>`).join('')}</div>
    ${card.html}
    <div class="disc">${esc(t.lkDisc)}</div>
    <div class="actions">${calLink(t.questions)}</div>`;
}

function screenMessage(h1, lead) {
  return `${S.view?.terms ? header() : `<div class="top"><div><div class="who">Ameritrust Mortgage</div></div><div class="lang"><button data-act="lang" data-v="en" aria-pressed="${S.lang === 'en'}">EN</button><button data-act="lang" data-v="he" aria-pressed="${S.lang === 'he'}">עב</button></div></div>`}
    <div class="hero" style="padding-top:40px"><h1>${esc(h1)}</h1><p class="lead">${esc(lead)}</p></div>`;
}

// ---------------- Render + events ----------------
function render() {
  const t = T();
  document.documentElement.lang = S.lang;
  document.documentElement.dir = t.dir;
  const qv = $('#q')?.value || '';
  let html;
  const v = S.view;
  if (!v) html = screenMessage(t.badH1, t.badLead);
  else if (v.superseded) html = screenMessage(t.supH1, t.supLead);
  else if (v.stage === 'updating') html = screenMessage(t.upH1, t.upLead);
  else if (v.stage === 'approved') html = screenApproved();
  else if (v.stage === 'restructure') html = screenRestructure();
  else if (v.stage === 'locked') html = screenLocked();
  else if (v.stage === 'closed') html = screenMessage(t.clH1, t.clLead);
  else html = screenRequest();
  $('#app').innerHTML = `<div dir="${t.dir}">${html}</div>`;
  if ($('#q')) $('#q').value = qv;
  const msgs = $('#msgs'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function canned(q) {
  const tm = S.view.terms, sc = scenario(tm, S.choices), he = S.lang === 'he', t = T();
  if (q === t.chipImp) return tm.impoundsIncluded
    ? (he ? `חשבון נאמנות מחזיק כסף עבור מס הנכס וביטוח הדירה. חלק מכל תשלום חודשי נכנס אליו, והמלווה משלם את החשבונות עבורך. בהלוואה שלך זה כ-${$$(tm.monthly.taxes)} לחודש למסים ו-${$$(tm.monthly.insurance)} לחודש לביטוח, ו-${$$(tm.reserves)} נגבים בסגירה כדי לפתוח את החשבון.` : `Impounds are an account that holds money for your property taxes and homeowners insurance. Part of each monthly payment goes into it, and the lender pays those bills for you. On your loan that's about ${$$(tm.monthly.taxes)} a month for taxes and ${$$(tm.monthly.insurance)} for insurance, and ${$$(tm.reserves)} is collected at closing to start the account.`)
    : (he ? `ההלוואה שלך לא כוללת חשבון נאמנות, כך שאתה משלם את מס הנכס והביטוח בעצמך (כ-${$$(tm.monthly.ti)} לחודש).` : `Your loan doesn't include impounds, so you pay property taxes and insurance yourself (about ${$$(tm.monthly.ti)} a month).`);
  if (q === t.chipPppBuy || q === t.chipPpp) return tm.options.pppBuydown
    ? (he ? `זה תלוי בכמה זמן אתה מתכנן להחזיק את ההלוואה. קיצור הקנס מ-3 שנים לשנתיים עולה ${$$(tm.options.pppBuydown.fee)} חד-פעמי. זה משתלם אם יש סיכוי ממשי שתמכור או תמחזר בשנה השלישית. נציג ההלוואה יעזור לך להחליט.` : `It depends on how long you plan to keep the loan. Shortening the penalty from 3 years to 2 costs a one-time ${$$(tm.options.pppBuydown.fee)}. That's worth it if there's a real chance you'll sell or refinance in year 3. Your loan officer can help you decide.`)
    : (he ? `אם תמכור או תמחזר בתוך ${t.years(tm.ppp.years)}, יחול קנס${tm.ppp.schedule ? ` (${tm.ppp.schedule})` : ''}. אחרי התקופה הזו אין קנס.` : `If you sell or refinance within ${t.years(tm.ppp.years)}, a penalty applies${tm.ppp.schedule ? ` (${tm.ppp.schedule})` : ''}. After that, there's no penalty.`);
  const brk = tm.transaction === 'purchase'
    ? (he ? `המקדמה ${$$(tm.downPayment)}, ועוד עלויות סגירה משוערות של ${$$(sc.totalCosts)}, פחות ${$$(tm.paidBeforeClosing)} ששולמו כבר${tm.deposit ? ` ופחות הפיקדון של ${$$(tm.deposit)}` : ''}. יוצא בערך ${$$(sc.funds.amount)}.` : `Your down payment of ${$$(tm.downPayment)}, plus estimated closing costs of ${$$(sc.totalCosts)}, minus ${$$(tm.paidBeforeClosing)} already paid${tm.deposit ? ` and your ${$$(tm.deposit)} deposit` : ''}. That comes to about ${$$(sc.funds.amount)}.`)
    : (he ? `ההלוואה החדשה ${$$(tm.loanAmount)}, פחות פירעון ההלוואה הנוכחית ${$$(tm.payoff)}, פחות עלויות סגירה ${$$(sc.totalCosts)} (ששולמו מהן כבר ${$$(tm.paidBeforeClosing)}). יוצא בערך ${$$(sc.funds.amount)} ${sc.funds.direction === 'to_borrower' ? 'אליך' : 'להבאה לסגירה'}.` : `Your new loan of ${$$(tm.loanAmount)}, minus the ${$$(tm.payoff)} payoff of your current loan, minus closing costs of ${$$(sc.totalCosts)} (${$$(tm.paidBeforeClosing)} of which you already paid). That comes to about ${$$(sc.funds.amount)} ${sc.funds.direction === 'to_borrower' ? 'to you' : 'to bring to closing'}.`);
  return brk;
}

async function ask(q, isChip) {
  if (!q || S.busy || S.view.preview) return;
  const history = S.chat.slice(-6);
  S.chat.push({ role: 'user', text: q }); S.busy = true; render();
  let answer = null;
  if (S.view.aiEnabled) {
    try {
      const r = await fetch('/api/b/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: token, question: q, history, lang: S.lang, choices: S.choices }) });
      if (r.ok) answer = (await r.json()).answer || null;
    } catch (_) { /* fall back */ }
  }
  if (!answer) answer = isChip ? canned(q) : T().aiOff;
  S.chat.push({ role: 'assistant', text: answer }); S.busy = false; render();
}

async function respond(action) {
  if (S.sending || S.view.preview) return;
  S.sending = true; S.error = ''; render();
  try {
    const r = await fetch('/api/b/respond', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: token, action, choices: S.choices, lang: S.lang }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || T().errSend);
    S.view = d; window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  } catch (e) { S.error = e.message || T().errSend; }
  S.sending = false; render();
}

// ---- Document uploads ----
const MAX = 5 * 1024 * 1024;
// Phone photos are large; re-encode big or unusual images to a sharp JPEG (keeps text readable).
async function shrink(file) {
  if (!/^image\//.test(file.type) || (file.size < 1.5 * 1024 * 1024 && /jpeg|png/.test(file.type))) return { blob: file, name: file.name };
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('encode');
  return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
}
async function uploadFiles(cid, list) {
  if (!list.length || S.uploading) return;
  S.uploading = cid; delete S.upErr[cid]; render();
  for (const file of list) {
    let f = { blob: file, name: file.name };
    try { f = await shrink(file); } catch (_) { /* send as is */ }
    if (f.blob.size > MAX) { S.upErr[cid] = T().upTooBig; continue; }
    try {
      const r = await fetch(`/api/b/upload?t=${encodeURIComponent(token)}&cid=${encodeURIComponent(cid)}&name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'content-type': f.blob.type || 'application/octet-stream' }, body: f.blob });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) S.upErr[cid] = d.error || T().upFail; else S.view = d;
    } catch (_) { S.upErr[cid] = T().upFail; }
  }
  S.uploading = null; render(); poll(0);
}
// While an AI check is running, refresh quietly every few seconds (up to ~3 minutes).
let pollTimer = null;
function pending() { return [...(S.view?.lock?.items || []), ...(S.view?.checklist || [])].some((x) => (x.uploads || []).some((u) => u.ai?.state === 'pending')); }
function poll(n) {
  clearTimeout(pollTimer);
  if (!pending() || n > 45 || !token) return;
  pollTimer = setTimeout(async () => {
    try { const r = await fetch(`/api/b?t=${encodeURIComponent(token)}&poll=1`); if (r.ok) { S.view = await r.json(); if (!S.uploading) render(); } } catch (_) { /* try again */ }
    poll(n + 1);
  }, 4000);
}
document.addEventListener('change', (e) => {
  const inp = e.target.closest('input[data-up]'); if (!inp) return;
  uploadFiles(inp.dataset.up, [...inp.files]); inp.value = '';
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const v = el.dataset.v;
  switch (el.dataset.act) {
    case 'lang': S.lang = v; break;
    case 'breakdown': S.showBreakdown = !S.showBreakdown; break;
    case 'imp': S.choices.impounds = v; break;
    case 'ppp': S.choices.ppp = v; break;
    case 'chip': ask(v, true); return;
    case 'respond': respond(v); return;
    default: return;
  }
  render();
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'ask-form') return;
  e.preventDefault(); const q = $('#q').value.trim(); $('#q').value = ''; ask(q, false);
});

(async function init() {
  try {
    const r = await fetch(previewId ? `/api/loans/${encodeURIComponent(previewId)}/preview` : `/api/b?t=${encodeURIComponent(token || '')}`);
    if (r.ok) {
      S.view = await r.json();
      S.lang = S.view.lang || 'en';
      if (S.view.response?.choices) S.choices = { ...S.choices, ...S.view.response.choices };
      if (previewId) $('#preview-bar').hidden = false;
    }
  } catch (_) { /* shows invalid link */ }
  render(); poll(0);
})();
