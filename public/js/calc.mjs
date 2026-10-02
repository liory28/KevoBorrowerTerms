// Shared loan math. Used by the team page, the borrower page and the server, so every
// screen shows the same numbers. Inputs: the parsed worksheet + fields the team enters.

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (xs) => r2(xs.reduce((a, b) => a + (Number(b) || 0), 0));

export const IMPOUND_WAIVER_RATE = 0.0025; // 0.25% of loan amount
export const PPP_BUYDOWN_RATE = 0.005;     // 0.5% of loan amount

const sec = (ws, name) => (ws.sections || []).find((s) => s.name === name) || { total: 0, items: [] };

export function defaultInputs(ws) {
  const program = ws?.header?.program || '';
  return {
    borrowerName: ws?.header?.borrower || '',
    borrowerEmail: '',
    borrowerPhone: '',
    language: 'en',
    transaction: (ws?.tx?.purchasePrice || 0) > 0 ? 'purchase' : 'refi',
    estimatedValue: null,
    lockStatus: 'not_locked',
    foreignNational: /FOREIGN|\bFN\b/i.test(program),
    pppYears: (() => { const m = program.match(/(\d+)\s*YR\s*PPP/i); return m ? Number(m[1]) : (/NO\s*PPP/i.test(program) ? 0 : null); })(),
    pppSchedule: '',
    interestOnly: /\bIO\b/.test(program),
    ioYears: null,
    impounds: 'auto', // auto | included | not_included
    loName: ws?.lo?.name || 'Lior Yehuda',
    calendlyUrl: 'https://calendly.com/meet-lior/15-min-with-lior',
    noteToBorrower: ''
  };
}

// Builds the borrower-facing terms (no choices applied yet) and the team checks.
export function buildTerms(ws, inputs) {
  const i = { ...defaultInputs(ws), ...(inputs || {}) };
  const tx = ws.tx || {};
  const loan = r2(tx.loanTotal ?? ws.header?.loanAmount);
  const purchase = i.transaction === 'purchase';
  const price = purchase ? r2(tx.purchasePrice) : null;
  const value = purchase ? price : (i.estimatedValue ? r2(i.estimatedValue) : null);
  const ltv = value ? r2((loan / value) * 100) : null;

  const orig = sec(ws, 'Origination Charges');
  const escrow = sec(ws, 'Initial Escrow Payment At Closing');
  const items = (ws.sections || []).flatMap((s) => s.items.map((it) => ({ ...it, section: s.name })));
  const discountItem = orig.items.find((x) => /discount/i.test(x.name));
  const originationItem = orig.items.find((x) => /origination/i.test(x.name));

  const gross = r2(ws.gross);
  // A lender credit can appear in the closing-cost totals or under "l. Other credits". Use whichever is shown.
  const lcCosts = r2(ws.lenderCredit), lcCredits = r2(ws.tx?.lenderCredit);
  const lenderCredit = lcCosts > 0 ? lcCosts : lcCredits;
  const lenderFees = r2(orig.total);
  const reserves = r2(escrow.total);
  const thirdParty = r2(gross - lenderFees - reserves);
  const poc = sum(items.filter((x) => x.poc).map((x) => x.amount));

  const taxRes = escrow.items.find((x) => /tax/i.test(x.name));
  const insRes = escrow.items.find((x) => /insurance|hazard/i.test(x.name));
  const aggAdj = escrow.items.find((x) => /aggregate/i.test(x.name));

  const impoundsIncluded = i.impounds === 'included' ? true : i.impounds === 'not_included' ? false : reserves > 0;
  const mo = ws.monthly || {};
  const tiMonthly = r2((mo.hazard || 0) + (mo.taxes || 0));
  const fullMonthly = r2(mo.total);
  const baseMonthly = impoundsIncluded ? fullMonthly : r2(fullMonthly - tiMonthly);

  const deposit = r2(tx.deposit), sellerCredit = r2(tx.sellerCredit), sellerPaid = r2(tx.sellerPaidCosts);
  const down = purchase ? r2(price - loan) : null;
  const payoff = purchase ? null : r2(tx.payoff);

  const t = {
    transaction: purchase ? 'purchase' : 'refi',
    borrowerName: i.borrowerName, property: ws.header?.property || '', program: ws.header?.program || '', loanNumber: ws.header?.loanNumber || '',
    loanAmount: loan, rate: ws.header?.rate ?? null, term: ws.header?.term || '', lockStatus: i.lockStatus,
    purchasePrice: price, estimatedValue: purchase ? null : value, ltv, downPayment: down, downPct: purchase && price ? r2((down / price) * 100) : null, payoff,
    interestOnly: Boolean(i.interestOnly), ioYears: i.ioYears ?? null,
    points: { dollars: r2(discountItem?.amount || 0), percent: discountItem?.percent ?? null },
    origination: { dollars: r2(originationItem?.amount || 0), percent: originationItem?.percent ?? null },
    lenderFees, lenderFeeItems: orig.items.map((x) => ({ name: x.name, amount: x.amount })),
    thirdParty, thirdPartyItems: items.filter((x) => x.section !== 'Origination Charges' && x.section !== 'Initial Escrow Payment At Closing').map((x) => ({ name: x.name, amount: x.amount, poc: x.poc })),
    reserves, reserveDetail: { taxMonths: taxRes?.months ?? null, insMonths: insRes?.months ?? null, adjustment: aggAdj ? r2(aggAdj.amount) : 0 },
    grossClosingCosts: gross, lenderCredit, paidBeforeClosing: poc,
    deposit, sellerCredit: r2(sellerCredit + sellerPaid),
    monthly: { pi: r2(mo.pi), taxes: r2(mo.taxes), insurance: r2(mo.hazard), hoa: r2(mo.hoa), mi: r2(mo.mi), ti: tiMonthly, full: fullMonthly, payment: baseMonthly },
    impoundsIncluded, foreignNational: Boolean(i.foreignNational),
    ppp: { years: i.pppYears, schedule: i.pppSchedule || '' },
    options: {
      impoundWaiver: impoundsIncluded && !i.foreignNational ? { fee: r2(loan * IMPOUND_WAIVER_RATE), rate: IMPOUND_WAIVER_RATE } : null,
      pppBuydown: Number(i.pppYears) === 3 ? { fee: r2(loan * PPP_BUYDOWN_RATE), rate: PPP_BUYDOWN_RATE, toYears: 2 } : null
    },
    lo: { name: i.loName || 'Lior Yehuda', calendly: i.calendlyUrl || '' },
    noteToBorrower: i.noteToBorrower || ''
  };

  const checks = buildChecks(ws, i, t);
  return { terms: t, checks };
}

// Applies the borrower's choices and returns the numbers to show.
export function scenario(t, choices = {}) {
  const waive = Boolean(t.options?.impoundWaiver) && choices.impounds === 'waive';
  const buydown = Boolean(t.options?.pppBuydown) && choices.ppp === 'buydown';
  const lines = [
    { key: 'lender', amount: t.lenderFees },
    { key: 'third', amount: t.thirdParty },
    { key: 'reserves', amount: waive ? 0 : t.reserves }
  ];
  if (waive) lines.push({ key: 'waiverFee', amount: t.options.impoundWaiver.fee });
  if (buydown) lines.push({ key: 'pppFee', amount: t.options.pppBuydown.fee });
  const totalCosts = sum(lines.map((l) => l.amount));
  const netCosts = r2(totalCosts - t.lenderCredit);
  const dueAtClosing = r2(netCosts - t.paidBeforeClosing);
  let funds;
  if (t.transaction === 'purchase') {
    const amount = r2(t.downPayment + dueAtClosing - t.deposit - t.sellerCredit);
    funds = amount >= 0 ? { direction: 'to_close', amount } : { direction: 'to_borrower', amount: -amount };
  } else {
    const net = r2(t.loanAmount - t.payoff - dueAtClosing);
    funds = net >= 0 ? { direction: 'to_borrower', amount: net } : { direction: 'to_close', amount: -net };
  }
  const payment = waive ? r2(t.monthly.full - t.monthly.ti) : t.monthly.payment;
  return { waive, buydown, lines, totalCosts, netCosts, dueAtClosing, funds, payment };
}

function buildChecks(ws, i, t) {
  const out = [];
  const add = (level, text) => out.push({ level, text }); // level: block | warn | info
  for (const w of ws.warnings || []) add('warn', w);
  const tx = ws.tx || {};

  if (!i.borrowerEmail) add('block', 'Enter the borrower email.');
  if (t.transaction === 'refi' && !t.estimatedValue) add('block', 'Enter the estimated property value (not on the worksheet).');
  if (t.ppp.years === null || t.ppp.years === undefined) add('block', 'Enter the prepayment penalty years (not found in the program name).');
  if (t.interestOnly && !t.ioYears) add('warn', 'Interest-only loan: enter the interest-only period so the borrower sees it.');
  if (t.ppp.years > 0 && !t.ppp.schedule) add('info', 'Optional: add the prepayment penalty schedule (for example 3% / 2% / 1%).');

  // Worksheet internal consistency
  if (t.transaction === 'purchase' && !(tx.purchasePrice > 0)) add('block', 'Marked as a purchase, but the worksheet has no purchase price.');
  if (t.transaction === 'refi' && tx.purchasePrice > 0) add('warn', 'Marked as a refinance, but the worksheet shows a purchase price.');
  const efh = r2((tx.prepaidItems || 0) + (tx.closingCosts || 0) + (tx.discount || 0) + (tx.mipFee || 0));
  const itemizedDue = r2(t.grossClosingCosts - t.paidBeforeClosing);
  if (Math.abs(efh - itemizedDue) > 1) add('warn', `Worksheet lines e + f + g + h total $${fmt(efh)}, but the itemized fees (less $${fmt(t.paidBeforeClosing)} paid before closing) total $${fmt(itemizedDue)}. The borrower page uses the itemized fees.`);
  if (r2(ws.lenderCredit) > 0 && r2(tx.lenderCredit) > 0 && Math.abs(r2(ws.lenderCredit) - r2(tx.lenderCredit)) > 0.01) add('warn', `Two different lender credits on the worksheet: $${fmt(ws.lenderCredit)} in the closing costs and $${fmt(tx.lenderCredit)} under other credits. The page uses $${fmt(ws.lenderCredit)}. Confirm which is right.`);
  for (const c of tx.otherCredits || []) add('warn', `Not counted as a credit: "${c.name}" $${fmt(c.amount)}. Only the deposit, seller credit and lender credit reduce cash to close. If this is a real credit, update the worksheet.`);
  const base = scenario(t, {});
  if (ws.worksheetFunds) {
    const wsSigned = ws.worksheetFunds.direction === 'to_borrower' ? -ws.worksheetFunds.amount : ws.worksheetFunds.amount;
    const ourSigned = base.funds.direction === 'to_borrower' ? -base.funds.amount : base.funds.amount;
    if (Math.abs(wsSigned - ourSigned) > 1) add('warn', `The worksheet's bottom line is $${fmt(ws.worksheetFunds.amount)} ${ws.worksheetFunds.direction === 'to_borrower' ? 'to' : 'from'} borrower, but the itemized math gives $${fmt(base.funds.amount)} ${base.funds.direction === 'to_borrower' ? 'to' : 'from'} borrower. Confirm which is right before sending.`);
    else add('info', `Cash ${base.funds.direction === 'to_borrower' ? 'to borrower' : 'to close'} ($${fmt(base.funds.amount)}) matches the worksheet bottom line.`);
  }
  if (t.points.percent !== null && t.loanAmount) {
    const exp = r2(t.loanAmount * t.points.percent / 100);
    if (Math.abs(exp - t.points.dollars) > 0.02) add('warn', `Discount points: ${t.points.percent}% of the loan is $${fmt(exp)}, but the worksheet shows $${fmt(t.points.dollars)}.`);
  }
  if (!t.impoundsIncluded && i.impounds === 'auto') add('info', 'No escrow reserves on the worksheet, so impounds are shown as not included. Change this if impounds are required.');
  return out;
}

export function fmt(n, d = 2) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
