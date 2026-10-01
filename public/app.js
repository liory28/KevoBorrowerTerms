(() => {
  'use strict';

  // ---------- Sample loan (numbers from a real worksheet, borrower/address made up) ----------
  const ADDRESS = '1450 Sample Ridge Dr, Lavon, TX';
  const BORROWER = 'Daniel & Sofia Ramirez';
  const CAL = 'https://calendly.com/meet-lior/15-min-with-lior';
  const N = { lender: 6653.69, third: 11372.75, reserves: 2405.39, waiverFee: 572.81, pppFee: 1145.63, down: 76375, poc: 1842, deposit: 10000, payKeep: 2277.25, payWaive: 1675.90 };

  const S = { screen: 'request', lang: 'en', mode: 'review', showBreakdown: false, imp: 'keep', ppp: '3', fn: false, moved: false, chat: [], busy: false, team: { result: 'asIs', sent: false } };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, d = 2) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const $ = (s) => document.querySelector(s);

  function calc() {
    const waive = !S.fn && S.imp === 'waive';
    const ppp2 = S.ppp === '2';
    const total = N.lender + N.third + (waive ? N.waiverFee : N.reserves) + (ppp2 ? N.pppFee : 0);
    const cash = N.down + total - N.poc - N.deposit;
    return { waive, ppp2, total, cash, pay: waive ? N.payWaive : N.payKeep };
  }

  // ---------- Copy ----------
  const COPY = {
    en: {
      dir: 'ltr', team: 'Your loan team',
      eyebrow: 'Step 1 of 3 · Before we submit',
      h1: "Here's the loan we're requesting for you",
      intro: 'We structure your loan within what the guidelines allow, and we push those limits on your behalf. Based on our experience, this is what we believe underwriting will accept.',
      purchase: 'Purchase',
      cashLabel: 'Estimated cash to close',
      cashSub: 'After your $10,000 deposit and $1,842 you already paid',
      showHow: 'See how we got this', hideHow: 'Hide breakdown',
      downPayment: 'Down payment', depositPaid: 'Deposit already paid', paidAlready: 'Already paid (appraisals, credit report)',
      termsHeading: "The terms we're requesting",
      price: 'Purchase price', loan: 'Loan amount', loanSub: '75% of the purchase price', down: 'Down payment', downSub: '25%',
      rate: 'Interest rate', rateSub: 'Not locked yet. Can change until we lock.',
      payment: 'Est. monthly payment', paymentKeep: '$1,622 principal & interest + taxes, insurance, HOA', paymentWaive: '$1,622 principal & interest + HOA. You pay taxes & insurance yourself.',
      points: 'Points', pointsVal: '0.75% · $1,718',
      ppp: 'Prepayment penalty', ppp3: '3 years', ppp2: '2 years',
      imp: 'Impounds', impKeep: 'Included', impWaive: 'Waived',
      costsTitle: 'Estimated closing costs',
      lenderLabel: 'Lender fees (Ameritrust)', lenderSub: 'Points $1,718.44, origination $2,291.25, underwriting, processing, document prep, tax service',
      thirdLabel: 'Third-party costs & prepaids', thirdSub: 'Appraisals, credit report, title & escrow, recording, HOA transfer, survey, first-year homeowners insurance, prepaid interest',
      reservesLabel: 'Reserves for impounds', reservesSub: 'Starting balance of your tax & insurance account: 6 months of taxes and 4 months of insurance, less a standard adjustment',
      reservesWaivedSub: 'Not collected, because you chose to waive impounds',
      waiverFeeLabel: 'Impound waiver fee', waiverFeeSub: 'One-time, 0.25% of the loan amount',
      pppFeeLabel: 'Prepayment penalty buy-down', pppFeeSub: 'One-time, 0.5% of the loan amount',
      totalCosts: 'Total estimated closing costs',
      costsNote: 'Includes $1,842 you already paid before closing (appraisals and credit report).',
      choicesTitle: 'Your choices',
      choicesSub: 'Your request starts with the options marked below. Change them if you prefer, and your numbers update right away.',
      impTitle: 'Impounds (taxes & insurance)',
      impExplain: "Impounds, also called an escrow account, means we collect your property taxes and homeowners insurance as part of your monthly payment, then pay those bills for you when they're due. At closing, the account starts with a reserve so there's enough when the first bills arrive.",
      impKeepLabel: 'Keep impounds', impKeepSub: 'About $2,277 a month all-in. Taxes and insurance are paid for you.',
      impWaiveLabel: 'Waive impounds', impWaiveSub: 'One-time fee of 0.25% ($572.81). Your monthly payment drops to about $1,676, the $2,405.39 reserve is not collected at closing, and you pay your property taxes and insurance yourself, on time, when they are due.',
      fnNote: 'For Foreign National loans, impounds are required and cannot be waived.',
      pppTitle: 'Prepayment penalty',
      pppExplain: 'Your loan has a 3-year prepayment penalty: if you sell or refinance within the first 3 years, a penalty applies [penalty amount by year]. You can buy down the penalty period to 2 years for a one-time fee of 0.5% of the loan amount.',
      ppp3Label: '3-year penalty', ppp3Sub: 'Included in your terms. No extra cost.',
      ppp2Label: '2-year penalty', ppp2Sub: 'One-time fee of 0.5% ($1,145.63).',
      chatTitle: 'Ask about your loan',
      chatSub: "AI assistant. It explains the terms on this page in plain English or Hebrew. It can't change your terms.",
      chips: ['What are impounds?', 'Should I shorten the prepayment penalty?', 'Why is my cash to close this amount?'],
      inputLabel: 'Your question', inputPlaceholder: 'Type a question, in any language', sendBtn: 'Ask', thinking: 'Thinking…',
      chatFoot: 'Answers are explanations only. Your loan officer confirms any change.',
      offline: "The live assistant isn't connected on this demo yet. Try one of the suggested questions above, or schedule a call with Lior.",
      nextTitle: 'What happens next',
      n1: 'We submit your loan and advocate for these terms.',
      n2: 'The underwriter reviews it. They can accept it, ask for a change (for example a larger down payment), or decline.',
      n3: "If it's approved as requested, we lock your rate right away. If anything changes, we call you first to explain what changed, why, and your options.",
      disclaimer: 'These are your current proposed terms and estimated costs. They can change if your information changes, including the appraised value, your credit, or market pricing. Your rate is not final until it is locked.',
      youChose: 'You chose',
      confirmBtn: 'Yes, submit my loan as shown', discussBtn: "I'd like to discuss first",
      confirmedTitle: 'Thank you. Your request is confirmed.',
      confirmedBody: 'A copy was sent to your email. We will let you know as soon as underwriting responds.',
      discussTitle: "Let's talk first", discussBody: "Pick a time for a 15-minute call with Lior. We won't submit until we've talked.",
      bookBtn: 'Schedule a 15-minute call', back: 'Back to the terms'
    },
    he: {
      dir: 'rtl', team: 'צוות ההלוואה שלך',
      eyebrow: 'שלב 1 מתוך 3 · לפני ההגשה',
      h1: 'זו ההלוואה שאנחנו מבקשים עבורך',
      intro: 'אנחנו בונים את ההלוואה שלך במסגרת מה שההנחיות מאפשרות, ודוחפים את הגבולות לטובתך. על סמך הניסיון שלנו, זה מה שאנחנו מאמינים שהחיתום יאשר.',
      purchase: 'רכישה',
      cashLabel: 'סכום משוער להבאה לסגירה',
      cashSub: 'אחרי הפיקדון של $10,000 ו-$1,842 שכבר שילמת',
      showHow: 'איך הגענו לסכום הזה', hideHow: 'הסתר פירוט',
      downPayment: 'מקדמה', depositPaid: 'פיקדון ששולם', paidAlready: 'כבר שולם (שמאות, דוח אשראי)',
      termsHeading: 'התנאים שאנחנו מבקשים',
      price: 'מחיר רכישה', loan: 'סכום ההלוואה', loanSub: '75% ממחיר הרכישה', down: 'מקדמה', downSub: '25%',
      rate: 'ריבית', rateSub: 'עדיין לא ננעלה. יכולה להשתנות עד הנעילה.',
      payment: 'תשלום חודשי משוער', paymentKeep: '$1,622 קרן וריבית + מסים, ביטוח ודמי ועד', paymentWaive: '$1,622 קרן וריבית + דמי ועד. מסים וביטוח משולמים על ידך.',
      points: 'נקודות', pointsVal: '0.75% · $1,718',
      ppp: 'קנס פירעון מוקדם', ppp3: '3 שנים', ppp2: 'שנתיים',
      imp: 'חשבון נאמנות', impKeep: 'כלול', impWaive: 'בוטל',
      costsTitle: 'עלויות סגירה משוערות',
      lenderLabel: 'עמלות המלווה (Ameritrust)', lenderSub: 'נקודות $1,718.44, עמלת פתיחה $2,291.25, חיתום, טיפול, הכנת מסמכים ושירות מס',
      thirdLabel: 'צד שלישי ותשלומים מראש', thirdSub: 'שמאות, דוח אשראי, טייטל ואסקרו, רישום, העברת ועד בית, מדידה, ביטוח לשנה הראשונה וריבית מראש',
      reservesLabel: 'רזרבות לחשבון הנאמנות', reservesSub: 'יתרת הפתיחה של חשבון המסים והביטוח: 6 חודשי מסים ו-4 חודשי ביטוח, בניכוי התאמה רגילה',
      reservesWaivedSub: 'לא נגבה, כי בחרת לוותר על חשבון הנאמנות',
      waiverFeeLabel: 'עמלת ויתור על חשבון נאמנות', waiverFeeSub: 'חד-פעמית, 0.25% מסכום ההלוואה',
      pppFeeLabel: 'קיצור קנס הפירעון המוקדם', pppFeeSub: 'חד-פעמית, 0.5% מסכום ההלוואה',
      totalCosts: 'סה"כ עלויות סגירה משוערות',
      costsNote: 'כולל $1,842 ששילמת כבר לפני הסגירה (שמאות ודוח אשראי).',
      choicesTitle: 'הבחירות שלך',
      choicesSub: 'הבקשה כוללת את האפשרויות המסומנות. אפשר לשנות, והמספרים מתעדכנים מיד.',
      impTitle: 'חשבון נאמנות (מסים וביטוח)',
      impExplain: 'חשבון נאמנות (Impounds) פירושו שאנחנו גובים את מס הנכס וביטוח הדירה כחלק מהתשלום החודשי, ומשלמים את החשבונות האלה עבורך כשהם מגיעים. בסגירה החשבון נפתח עם רזרבה, כדי שיהיה מספיק כשהחשבונות הראשונים יגיעו.',
      impKeepLabel: 'להשאיר את חשבון הנאמנות', impKeepSub: 'כ-$2,277 לחודש בסך הכל. המסים והביטוח משולמים עבורך.',
      impWaiveLabel: 'לוותר על חשבון הנאמנות', impWaiveSub: 'עמלה חד-פעמית של 0.25% ($572.81). התשלום החודשי יורד לכ-$1,676, הרזרבה של $2,405.39 לא נגבית בסגירה, ואתה משלם את מס הנכס והביטוח בעצמך, בזמן.',
      fnNote: 'בהלוואות לתושבי חוץ חשבון נאמנות הוא חובה ולא ניתן לוותר עליו.',
      pppTitle: 'קנס פירעון מוקדם',
      pppExplain: 'להלוואה שלך יש קנס פירעון מוקדם ל-3 שנים: אם תמכור או תמחזר בשלוש השנים הראשונות, יחול קנס [גובה הקנס לפי שנה]. אפשר לקצר את תקופת הקנס לשנתיים תמורת עמלה חד-פעמית של 0.5% מסכום ההלוואה.',
      ppp3Label: 'קנס ל-3 שנים', ppp3Sub: 'כלול בתנאים. ללא עלות נוספת.',
      ppp2Label: 'קנס לשנתיים', ppp2Sub: 'עמלה חד-פעמית של 0.5% ($1,145.63).',
      chatTitle: 'שאלו על ההלוואה',
      chatSub: 'עוזר AI. מסביר את התנאים בעמוד הזה בשפה פשוטה, בעברית או באנגלית. הוא לא יכול לשנות את התנאים.',
      chips: ['מה זה חשבון נאמנות?', 'כדאי לקצר את קנס הפירעון?', 'למה זה הסכום להבאה לסגירה?'],
      inputLabel: 'השאלה שלך', inputPlaceholder: 'כתבו שאלה, בכל שפה', sendBtn: 'שאל', thinking: 'חושב…',
      chatFoot: 'התשובות הן הסברים בלבד. כל שינוי מאושר על ידי נציג ההלוואה.',
      offline: 'העוזר החי עדיין לא מחובר בהדגמה הזו. נסו אחת מהשאלות המוצעות למעלה, או קבעו שיחה עם ליאור.',
      nextTitle: 'מה קורה עכשיו',
      n1: 'אנחנו מגישים את ההלוואה ונלחמים על התנאים האלה עבורך.',
      n2: 'החתם בודק את התיק. הוא יכול לאשר, לבקש שינוי (למשל מקדמה גדולה יותר), או לדחות.',
      n3: 'אם ההלוואה מאושרת כפי שביקשנו, ננעל את הריבית מיד. אם משהו משתנה, נתקשר אליך קודם כדי להסביר מה השתנה, למה, ומה האפשרויות.',
      disclaimer: 'אלה התנאים והעלויות המשוערים כרגע. הם יכולים להשתנות אם המידע משתנה, כולל שווי השמאות, דירוג האשראי או מחירי השוק. הריבית אינה סופית עד שהיא ננעלת.',
      youChose: 'הבחירה שלך',
      confirmBtn: 'כן, הגישו את ההלוואה כפי שמוצג', discussBtn: 'אני רוצה לדבר קודם',
      confirmedTitle: 'תודה. הבקשה שלך אושרה.',
      confirmedBody: 'עותק נשלח לאימייל שלך. נעדכן אותך ברגע שהחיתום יחזיר תשובה.',
      discussTitle: 'בוא נדבר קודם', discussBody: 'בחר זמן לשיחה של 15 דקות עם ליאור. לא נגיש לפני שנדבר.',
      bookBtn: 'קביעת שיחה של 15 דקות', back: 'חזרה לתנאים'
    }
  };
  const T = () => COPY[S.lang];

  function canned(i) {
    const c = calc();
    const he = S.lang === 'he';
    const a = he ? [
      'חשבון נאמנות הוא חשבון שמחזיק כסף עבור מס הנכס וביטוח הדירה. חלק מכל תשלום חודשי נכנס אליו, והמלווה משלם את החשבונות עבורך. בהלוואה שלך זה $473.02 לחודש למסים ו-$128.33 לחודש לביטוח, ו-$2,405.39 נגבים בסגירה כדי לפתוח את החשבון.',
      'זה תלוי בכמה זמן אתה מתכנן להחזיק את ההלוואה. קיצור הקנס מ-3 שנים לשנתיים עולה $1,145.63 חד-פעמי. זה משתלם אם יש סיכוי ממשי שתמכור או תמחזר בשנה השלישית. אם אתה מתכנן להחזיק יותר מ-3 שנים, ייתכן שאין בזה צורך. נציג ההלוואה שלך יעזור לך להחליט.',
      'המקדמה שלך היא $76,375.00. מוסיפים עלויות סגירה משוערות של ' + money(c.total) + ', מורידים $1,842.00 שכבר שילמת על שמאות ודוח אשראי, ומורידים את הפיקדון של $10,000.00. יוצא בערך ' + money(c.cash) + '.'
    ] : [
      'Impounds are an account that holds money for your property taxes and homeowners insurance. Part of each monthly payment goes into it, and the lender pays those bills for you. On your loan that is $473.02 a month for taxes and $128.33 a month for insurance, and $2,405.39 is collected at closing to start the account.',
      "It depends on how long you plan to keep the loan. Shortening the penalty from 3 years to 2 costs a one-time $1,145.63. That's worth it if there's a real chance you'll sell or refinance in year 3. If you expect to keep the loan longer than 3 years, you may not need it. Your loan officer can help you decide.",
      'Your down payment is $76,375.00. Add estimated closing costs of ' + money(c.total) + ', subtract $1,842.00 you already paid for appraisals and your credit report, and subtract your $10,000.00 deposit. That comes to about ' + money(c.cash) + '.'
    ];
    return a[i];
  }

  const ICON_CHECK = (s = 26, w = 2.5) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#0E5A47" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
  const ICON_CHAT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3"/><path d="M12 16.5h.01"/></svg>';

  function header(showLang) {
    const t = T();
    return `<div class="top"><div><div class="who">Lior Yehuda</div><div class="sub">${esc(showLang ? t.team : 'Your loan team')}</div></div>
      ${showLang ? `<div class="lang"><button data-act="lang" data-v="en" aria-pressed="${S.lang === 'en'}" aria-label="English">EN</button><button data-act="lang" data-v="he" aria-pressed="${S.lang === 'he'}" aria-label="עברית">עב</button></div>` : ''}</div>`;
  }

  // ---------- Screen 1: request ----------
  function screenRequest() {
    const t = T(), c = calc();
    const rows = [
      [t.price, '$305,500', ''], [t.loan, '$229,125', t.loanSub], [t.down, '$76,375', t.downSub], [t.rate, '7.625%', t.rateSub],
      [t.payment, money(Math.round(c.pay), 0), c.waive ? t.paymentWaive : t.paymentKeep], [t.points, t.pointsVal, ''],
      [t.ppp, c.ppp2 ? t.ppp2 : t.ppp3, ''], [t.imp, c.waive ? t.impWaive : t.impKeep, '']
    ];
    const costs = [
      [t.lenderLabel, money(N.lender), t.lenderSub], [t.thirdLabel, money(N.third), t.thirdSub],
      [t.reservesLabel, c.waive ? '$0.00' : money(N.reserves), c.waive ? t.reservesWaivedSub : t.reservesSub]
    ];
    if (c.waive) costs.push([t.waiverFeeLabel, money(N.waiverFee), t.waiverFeeSub]);
    if (c.ppp2) costs.push([t.pppFeeLabel, money(N.pppFee), t.pppFeeSub]);
    const impChoices = [['keep', t.impKeepLabel, t.impKeepSub]];
    if (!S.fn) impChoices.push(['waive', t.impWaiveLabel, t.impWaiveSub]);
    const impSel = c.waive ? 'waive' : 'keep';
    const choice = (act, id, sel, l, s) => `<button class="choice" data-act="${act}" data-v="${id}" aria-pressed="${sel === id}"><span class="dot"></span><span><div class="cl">${esc(l)}</div><div class="cs">${esc(s)}</div></span></button>`;
    const summary = `${t.youChose}: ${c.ppp2 ? t.ppp2Label : t.ppp3Label} · ${c.waive ? t.impWaiveLabel : t.impKeepLabel} · ${t.cashLabel} ${money(c.cash)}`;
    const msgs = S.chat.map((m) => `<div class="msg ${m.role}">${esc(m.text)}</div>`).join('') + (S.busy ? `<div class="msg assistant typing">${esc(t.thinking)}</div>` : '');

    let actions;
    if (S.mode === 'confirmed') {
      const when = new Date().toLocaleString(S.lang === 'he' ? 'he-IL' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
      actions = `<div class="done"><div class="t">${esc(t.confirmedTitle)}</div><div class="b">${esc(summary)}</div><div class="b">${esc(when)}. ${esc(t.confirmedBody)}</div></div>
        <button class="btn link" data-act="mode" data-v="review">${esc(t.back)}</button>`;
    } else if (S.mode === 'discuss') {
      actions = `<div class="panel"><div class="t">${esc(t.discussTitle)}</div><div class="b">${esc(t.discussBody)}</div><a class="btn primary" href="${CAL}" target="_blank" rel="noopener">${esc(t.bookBtn)}</a></div>
        <button class="btn link" data-act="mode" data-v="review">${esc(t.back)}</button>`;
    } else {
      actions = `<div class="sum">${esc(summary)}</div>
        <button class="btn primary" data-act="mode" data-v="confirmed">${esc(t.confirmBtn)}</button>
        <button class="btn secondary" data-act="mode" data-v="discuss">${esc(t.discussBtn)}</button>`;
    }

    return `<div dir="${t.dir}" lang="${S.lang}">
      ${header(true)}
      <div class="hero"><div class="eyebrow">${esc(t.eyebrow)}</div><h1>${esc(t.h1)}</h1><p class="lead">${esc(t.intro)}</p><div class="addr"><bdi>${ADDRESS}</bdi> · ${esc(t.purchase)}</div></div>

      <div class="m big"><div class="lbl">${esc(t.cashLabel)}</div><div class="num">${money(Math.round(c.cash), 0)}</div><div class="lbl">${esc(t.cashSub)}</div>
        <button class="ghost" data-act="breakdown" aria-expanded="${S.showBreakdown}">${esc(S.showBreakdown ? t.hideHow : t.showHow)}</button>
        ${S.showBreakdown ? `<div class="rows">
          <div class="row"><span>${esc(t.downPayment)}</span><span>$76,375.00</span></div>
          <div class="row"><span>${esc(t.totalCosts)}</span><span>${money(c.total)}</span></div>
          <div class="row"><span>${esc(t.paidAlready)}</span><span>−$1,842.00</span></div>
          <div class="row"><span>${esc(t.depositPaid)}</span><span>−$10,000.00</span></div>
          <div class="row total"><span>${esc(t.cashLabel)}</span><span>${money(c.cash)}</span></div></div>` : ''}
      </div>

      <div class="m card"><div class="head">${esc(t.termsHeading)}</div>
        ${rows.map(([l, v, s]) => `<div class="term"><div class="l">${esc(l)}</div><div class="r"><div class="v">${esc(v)}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div></div>`).join('')}
      </div>

      <div class="m card"><div class="title">${esc(t.costsTitle)}</div>
        ${costs.map(([l, v, s]) => `<div class="cost"><div class="top2"><span>${esc(l)}</span><span class="v">${esc(v)}</span></div><div class="s">${esc(s)}</div></div>`).join('')}
        <div class="costtotal"><span>${esc(t.totalCosts)}</span><span class="v">${money(c.total)}</span></div>
        <div class="small">${esc(t.costsNote)}</div>
      </div>

      <div class="section-h"><div class="t">${esc(t.choicesTitle)}</div><div class="s">${esc(t.choicesSub)}</div></div>
      <div class="m choice-card" style="margin-top:12px"><div class="t">${esc(t.impTitle)}</div><div class="x">${esc(t.impExplain)}</div>
        ${impChoices.map(([id, l, s]) => choice('imp', id, impSel, l, s)).join('')}
        ${S.fn ? `<div class="small">${esc(t.fnNote)}</div>` : ''}
      </div>
      <div class="m choice-card" style="margin-top:12px"><div class="t">${esc(t.pppTitle)}</div><div class="x">${esc(t.pppExplain)}</div>
        ${choice('ppp', '3', S.ppp, t.ppp3Label, t.ppp3Sub)}${choice('ppp', '2', S.ppp, t.ppp2Label, t.ppp2Sub)}
      </div>

      <div class="m chat" style="margin-top:24px">
        <div class="ch"><div class="ic">${ICON_CHAT}</div><div><div class="ct">${esc(t.chatTitle)}</div><div class="cs">${esc(t.chatSub)}</div></div></div>
        <div class="cb">
          <div class="chips">${t.chips.map((q, i) => `<button class="chip" data-act="chip" data-v="${i}">${esc(q)}</button>`).join('')}</div>
          ${msgs ? `<div class="msgs" id="msgs">${msgs}</div>` : ''}
          <form class="ask" id="ask-form"><label class="sr-only" for="q">${esc(t.inputLabel)}</label>
            <input id="q" type="text" autocomplete="off" maxlength="600" placeholder="${esc(t.inputPlaceholder)}">
            <button type="submit" ${S.busy ? 'disabled' : ''}>${esc(t.sendBtn)}</button></form>
          <div class="small" style="padding:0">${esc(t.chatFoot)}</div>
        </div>
      </div>

      <div class="steps"><div class="t">${esc(t.nextTitle)}</div>
        ${[t.n1, t.n2, t.n3].map((x, i) => `<div class="step"><span class="n">${i + 1}</span><span>${esc(x)}</span></div>`).join('')}
      </div>
      <div class="disc">${esc(t.disclaimer)}</div>
      <div class="actions">${actions}</div>
    </div>`;
  }

  // ---------- Screen 2a: approved ----------
  function screenApproved() {
    const m = S.moved;
    const checks = [['Loan amount', '$229,125'], ['Loan-to-value', '75%'], ['Down payment', '$76,375'], ['Program', '30-yr fixed DSCR']];
    return `${header(false)}
      <div class="hero"><div class="eyebrow">Step 2 of 3 · Underwriting decision</div><div class="icon-ok">${ICON_CHECK()}</div>
        <h1>Good news: approved as requested</h1><p class="lead">Underwriting accepted your loan the way we structured it. No changes were needed. We're locking your rate now.</p><div class="addr">${ADDRESS} · Purchase</div></div>
      <div class="m card"><div class="head">Approved exactly as you confirmed</div>
        ${checks.map(([l, v]) => `<div class="check"><span class="l" style="font-size:14px;color:var(--ink2)">${l}</span><span class="v">${v} ${ICON_CHECK(18)}</span></div>`).join('')}
      </div>
      <div class="m big"><div class="lbl">${m ? 'Your rate today' : 'Your rate'}</div><div class="num">${m ? '7.750%' : '7.625%'}</div>
        <div class="note">${m ? 'Was 7.625% when we submitted. Market pricing moved; your loan structure did not change.' : 'Same as when we submitted.'}</div>
        <div class="foot"><span>Est. monthly payment</span><strong>${m ? '$2,297' : '$2,277'}</strong></div></div>
      <div class="steps"><div class="t">What happens next</div>
        <div class="step" style="display:block">You'll get your lock confirmation, plus a short, plain-English list of the items underwriting needs before closing.</div>
        <div class="step" style="display:block">Nothing for you to do right now.</div></div>
      <div class="disc">Your loan structure was approved as requested. The rate reflects market pricing at the time we lock. Your terms can still change if your information changes before closing.</div>
      <div class="actions"><a class="btn secondary" href="${CAL}" target="_blank" rel="noopener">Questions? Schedule a call</a></div>`;
  }

  // ---------- Screen 2b: restructure ----------
  function screenRestructure() {
    const ch = [['Loan-to-value', '75%', '70%'], ['Loan amount', '$229,125', '$213,850'], ['Down payment', '$76,375', '$91,650']];
    return `${header(false)}
      <div class="hero"><div class="eyebrow alert">Step 2 of 3 · Underwriting decision</div>
        <h1>Underwriting asked for a change. Let's talk before we lock.</h1><p class="lead">We pushed for the terms you confirmed. Underwriting approved your loan, but only with the change below. Nothing is locked yet.</p><div class="addr">${ADDRESS} · Purchase</div></div>
      <div class="m card"><div class="cmp-h"><div>What changed</div><div>You confirmed</div><div>Approved</div></div>
        ${ch.map(([l, f, to]) => `<div class="cmp-r"><div style="font-size:14px;color:var(--ink2)">${l}</div><div class="from">${f}</div><div class="to">${to}</div></div>`).join('')}</div>
      <div class="m why" style="margin-top:12px"><div class="h">Why</div><div class="b">[Reason from the underwriting approval, written by your loan officer in plain English]</div></div>
      <div class="steps"><div class="t">On a 15-minute call we'll cover</div>
        <div class="step"><span class="n">1</span><span>What changed and how it affects your cash to close and payment</span></div>
        <div class="step"><span class="n">2</span><span>Why underwriting asked for it</span></div>
        <div class="step"><span class="n">3</span><span>Your options, and what we recommend</span></div></div>
      <div class="disc">We won't lock your rate until we've talked. Market pricing can move in the meantime, so the sooner we speak, the better.</div>
      <div class="actions"><a class="btn primary" href="${CAL}" target="_blank" rel="noopener">Schedule a 15-minute call</a>
        <a class="btn secondary" href="#call">Call Lior now</a></div>`;
  }

  // ---------- Screen 3: locked ----------
  function screenLocked() {
    const items = [['Last 2 months of bank statements', 'All pages, for the account funding your down payment'], ['Signed purchase contract and addenda', 'Including any changes to the price or closing date'], ['Homeowners insurance quote', 'For the property, showing the yearly premium'], ['Short note about a large deposit', 'Where the [amount] deposit on [date] came from']];
    const st = [['Requested', 'b-done'], ['Approved', 'b-done'], ['Locked', 'b-done'], ['Your items', 'b-now'], ['Closing', '']];
    return `${header(false)}
      <div class="hero"><div class="eyebrow">Step 3 of 3 · Rate locked</div><h1>Your rate is locked. Here's what we need to close.</h1><div class="addr">${ADDRESS} · Purchase</div></div>
      <div class="m big"><div class="lbl">Locked rate</div><div class="num">7.625%</div><div class="note">Locked until [lock expiration date]</div>
        <div class="foot"><span>Est. monthly payment</span><strong>$2,277</strong></div></div>
      <div class="m bars">${st.map(([l, c]) => `<div><div class="bar ${c}"></div>${l}</div>`).join('')}</div>
      <div class="m card" style="padding-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:baseline;padding:12px 0 4px"><div style="font-size:16px;font-weight:700">What we need from you</div><div class="small" style="padding:0">0 of 4 received</div></div>
        ${items.map(([a, b]) => `<div class="item"><span class="box"></span><span><div class="it">${a}</div><div class="id">${b}</div></span></div>`).join('')}
        <div class="small" style="padding:6px 0 0">Sample items. Your real list comes straight from your underwriting approval.</div></div>
      <div class="disc">Once these items are received and accepted by underwriting, we're cleared to close. Please send them before your lock expires.</div>
      <div class="actions"><button class="btn primary" type="button">Upload documents</button><a class="btn secondary" href="${CAL}" target="_blank" rel="noopener">Questions? Schedule a call</a></div>`;
  }

  // ---------- Team view ----------
  function screenTeam() {
    const asIs = S.team.result === 'asIs', sent = S.team.sent;
    const stages = [['Request sent', 'Oct 1 · 9:10 AM', 'b-done'], ['Borrower confirmed', 'Oct 1 · 2:14 PM', 'b-done'], ['Underwriting', asIs ? 'Approved as requested' : 'Restructure required', asIs ? 'b-done' : 'b-now'], ['Rate lock', asIs ? 'Next' : 'On hold until call', asIs ? 'b-now' : ''], ['Conditions', '', ''], ['Closing', '', '']];
    const terms = [['Purchase price', '$305,500.00', 'a. Purchase Price'], ['Loan amount', '$229,125.00', 'm. Loan amount'], ['Loan-to-value', '75%', 'calculated m ÷ a'], ['Interest rate', '7.625% · not locked', 'header · team entry'], ['Monthly payment', '$2,277.25', 'Total Monthly Payment'], ['Points', '0.75% · $1,718.44', 'Discount points'], ['Prepayment penalty', '3 years', 'Loan Program name'], ['Taxes & insurance', 'Included', 'Reserves: 6 mo / 4 mo'], ['Est. closing costs', '$20,431.83', 'Estimated Gross Closing Costs'], ['Cash to close', '$84,964.83', 'down + costs − POC − deposit']];
    const cmp = asIs ? [['Loan-to-value', '75%', '75%', 'Same', 'ok'], ['Interest rate', '7.625%', '7.625%', 'Same', 'ok'], ['Restructure', '', 'None', 'Meets guidelines', 'ok']] : [['Loan-to-value', '75%', '70%', 'Changed', 'bad'], ['Interest rate', '7.625%', '7.625%', 'Same', 'ok'], ['Restructure', '', 'Required', 'Call first', 'bad']];
    const log = [['Oct 1 · 9:02 AM', 'Worksheet read. 10 terms filled, 2 flags reviewed by team.'], ['Oct 1 · 9:10 AM', 'Request sent to borrower by text and email.'], ['Oct 1 · 2:11 PM', 'Borrower opened the link.'], ['Oct 1 · 2:14 PM', 'Borrower confirmed: "Yes, submit my loan as shown." Copy emailed.'], ['Oct 3 · 11:40 AM', asIs ? 'Underwriting approval read: no restructure.' : 'Underwriting approval read: restructure required (LTV 70%).']];
    if (sent) log.push(['Oct 3 · 11:42 AM', asIs ? 'Borrower notified: approved as requested, locking now.' : 'Borrower sent a call request. Lock on hold.']);
    const pill = asIs ? (sent ? 'Ready to lock · borrower notified' : 'Approved as requested') : (sent ? 'Lock on hold · call requested' : 'Restructure required');
    return `<div class="team">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px">
        <div style="display:flex;flex-direction:column;gap:6px"><div class="eyebrow" style="color:var(--muted)">Loan DEMO-0001 · Purchase · 30-yr fixed DSCR, 3-yr PPP</div><h1 style="font-size:28px">${BORROWER}</h1><div style="font-size:14px;color:var(--ink2)">${ADDRESS} · LO: Lior Yehuda</div></div>
        <div class="status">${pill}</div></div>
      <div class="tcard stages">${stages.map(([l, w, c]) => `<div><div class="bar ${c}"></div><div style="font-size:13px;font-weight:600">${l}</div><div style="font-size:12px;color:var(--muted)">${w}</div></div>`).join('')}</div>
      <div class="grid2">
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="tcard"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><h2>What the borrower confirmed</h2><div style="font-size:12px;color:var(--muted)">from Initial Fees Worksheet · Oct 1</div></div>
            <div class="tbl-h" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px"><div>Term</div><div>Value</div><div>Source on worksheet</div></div>
            ${terms.map(([a, b, c]) => `<div class="tbl-r" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div style="color:var(--ink2)">${a}</div><div style="font-weight:600">${b}</div><div class="src">${c}</div></div>`).join('')}
            <div class="banner-ok" style="margin-top:14px;font-size:13px;line-height:1.5;color:#24453B">Confirmed by borrower Oct 1, 2026 2:14 PM PT from a verified link · copy emailed to borrower · PDF saved to Drive</div></div>
          <div class="flags"><h2 style="font-size:15px">Checked before sending</h2>
            <div>Prepaid line (e) is $5,907.80, but the itemized prepaids + escrow total $4,673.34 ($1,234.46 difference). The borrower page uses the itemized figures, which tie to the $20,431.83 gross closing costs.</div>
            <div>Ignored 2 credit lines that zero out the worksheet's bottom line: "Final Funds from Borrower" $37,275.63 and "Other" $48,923.66.</div>
            <div>Entered by team (not on worksheet): borrower email and phone, lock status.</div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="tcard" style="display:flex;flex-direction:column;gap:14px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><h2>Underwriting result</h2><div style="font-size:12px;color:var(--muted)">approval PDF · read automatically</div></div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><span style="font-size:12px;color:var(--muted)">Demo:</span>
              <button class="pill" data-act="team-result" data-v="asIs" aria-pressed="${asIs}">Approved as requested</button>
              <button class="pill" data-act="team-result" data-v="restructure" aria-pressed="${!asIs}">Restructure required</button></div>
            <div><div class="tbl-h" style="grid-template-columns:repeat(4,minmax(0,1fr))"><div>On the approval</div><div>Confirmed</div><div>Approved</div><div>Result</div></div>
              ${cmp.map(([a, b, c, d, k]) => `<div class="tbl-r" style="grid-template-columns:repeat(4,minmax(0,1fr))"><div style="color:var(--ink2)">${a}</div><div>${b}</div><div style="font-weight:600">${c}</div><div class="${k}">${d}</div></div>`).join('')}</div>
            ${asIs ? `<div class="banner-ok"><div style="font-size:15px;font-weight:700;color:var(--brand-dark)">No restructure: terms meet guidelines as confirmed</div><div style="font-size:13px;color:#24453B;line-height:1.5;margin-top:4px">Next: lock the rate and send the "Approved as requested" message. If the market rate moved, the message shows old vs. new rate and payment.</div></div>
              ${sent ? '' : '<button class="btn primary" style="min-height:48px;font-size:15px" data-act="team-send">Notify borrower: approved, locking now</button>'}`
              : `<div class="banner-alert"><div style="font-size:15px;font-weight:700;color:#7A3F00">Restructure required: lock on hold</div><div style="font-size:13px;color:#6A3A05;line-height:1.5;margin-top:4px">The borrower gets a "let's talk before we lock" message with your Calendly link. Add the reason in plain English first.</div></div>
              <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;color:var(--ink2)">Why (shown to borrower)<textarea rows="3" placeholder="e.g. Underwriting capped loan-to-value at 70% for this property." style="font:inherit;font-size:14px;font-weight:400;padding:10px 12px;border:1px solid #C9D2CE;border-radius:10px"></textarea></label>
              ${sent ? '' : '<button class="btn alert" style="min-height:48px;font-size:15px" data-act="team-send">Send call request to borrower</button>'}`}
            ${sent ? `<div style="padding:12px 14px;border-radius:10px;background:var(--bg);font-size:13px;color:var(--ink2)">${asIs ? 'Sent by text and email. Next step: lock the rate.' : 'Sent with your Calendly link. You will be notified when the borrower books.'}</div>` : ''}
          </div>
          <div class="tcard"><h2 style="font-size:15px;margin-bottom:8px">Activity</h2>${log.map(([w, x]) => `<div class="log"><div class="w">${w}</div><div style="color:var(--ink2)">${x}</div></div>`).join('')}</div>
        </div>
      </div>
    </div>`;
  }

  // ---------- Render ----------
  const SCREENS = { request: screenRequest, approved: screenApproved, restructure: screenRestructure, locked: screenLocked, team: screenTeam };
  function render() {
    const app = $('#app');
    const qVal = $('#q') ? $('#q').value : '';
    app.className = S.screen === 'team' ? '' : 'phone';
    app.innerHTML = SCREENS[S.screen]();
    document.documentElement.lang = S.screen === 'request' ? S.lang : 'en';
    $('#tog-fn').hidden = S.screen !== 'request';
    $('#tog-moved').hidden = S.screen !== 'approved';
    if ($('#q')) $('#q').value = qVal;
    const msgs = $('#msgs'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  // ---------- AI ----------
  async function ask(question, chipIndex) {
    if (!question || S.busy) return;
    const history = S.chat.slice(-6);
    S.chat.push({ role: 'user', text: question });
    S.busy = true; render();
    let answer = null;
    try {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, history, lang: S.lang, imp: S.imp, ppp: S.ppp, foreignNational: S.fn }) });
      if (r.ok) { const d = await r.json(); answer = d.answer || null; }
    } catch (_) { /* fall back below */ }
    if (!answer) answer = chipIndex !== undefined ? canned(chipIndex) : T().offline;
    S.chat.push({ role: 'assistant', text: answer });
    S.busy = false; render();
  }

  // ---------- Events ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const v = el.dataset.v;
    switch (el.dataset.act) {
      case 'lang': S.lang = v; break;
      case 'breakdown': S.showBreakdown = !S.showBreakdown; break;
      case 'imp': S.imp = v; break;
      case 'ppp': S.ppp = v; break;
      case 'mode': S.mode = v; break;
      case 'chip': ask(T().chips[Number(v)], Number(v)); return;
      case 'team-result': S.team = { result: v, sent: false }; break;
      case 'team-send': S.team.sent = true; break;
      default: return;
    }
    render();
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'ask-form') return;
    e.preventDefault();
    const q = $('#q').value.trim(); $('#q').value = '';
    ask(q);
  });
  $('#screen').addEventListener('change', (e) => { S.screen = e.target.value; render(); window.scrollTo(0, 0); });
  $('#fn').addEventListener('change', (e) => { S.fn = e.target.checked; if (S.fn) S.imp = 'keep'; render(); });
  $('#moved').addEventListener('change', (e) => { S.moved = e.target.checked; render(); });

  // ---------- Feedback (Netlify Forms) ----------
  const fb = $('#fb');
  $('#open-fb').addEventListener('click', () => { $('#fb-screen').value = $('#screen').selectedOptions[0].textContent; $('#fb-msg').textContent = ''; fb.hidden = false; });
  $('#close-fb').addEventListener('click', () => { fb.hidden = true; });
  fb.addEventListener('click', (e) => { if (e.target === fb) fb.hidden = true; });
  $('#fb-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = new URLSearchParams(new FormData(form)).toString();
    try {
      const r = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      if (!r.ok) throw new Error();
      form.reset(); $('#fb-msg').textContent = 'Thank you! Your feedback was sent.';
      setTimeout(() => { fb.hidden = true; }, 1200);
    } catch (_) { $('#fb-msg').textContent = 'Could not send right now. Please try again.'; }
  });

  render();
})();
