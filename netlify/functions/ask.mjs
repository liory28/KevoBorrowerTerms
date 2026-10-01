// Live AI assistant for the borrower terms demo.
// Uses Claude when ANTHROPIC_API_KEY is set, otherwise ChatGPT when OPENAI_API_KEY is set.
// Keys stay on the server; the browser never sees them.

export const config = { path: '/api/ask' };

// Sample loan (anonymized). Numbers come from a real Initial Fees Worksheet; names/address are made up.
const LOAN = {
  borrower: 'Daniel & Sofia Ramirez (sample)',
  property: '1450 Sample Ridge Dr, Lavon, TX (sample)',
  transaction: 'Purchase',
  program: '30-year fixed DSCR (investment property)',
  purchase_price: 305500,
  loan_amount: 229125,
  loan_to_value_pct: 75,
  down_payment: 76375,
  interest_rate_pct: 7.625,
  rate_locked: false,
  principal_and_interest_monthly: 1621.73,
  property_tax_monthly: 473.02,
  homeowners_insurance_monthly: 128.33,
  hoa_monthly: 54.17,
  points: { percent: 0.75, dollars: 1718.44 },
  closing_costs: {
    lender_fees_ameritrust: 6653.69,
    lender_fees_include: 'discount points $1,718.44, origination $2,291.25, underwriting $1,800, processing $595, document prep $150, tax service $99',
    third_party_and_prepaids: 11372.75,
    third_party_include: 'appraisals, credit report, title and escrow, recording, HOA fees and transfer, survey, first-year homeowners insurance $1,540, prepaid interest $727.95',
    impound_reserves: 2405.39,
    impound_reserves_detail: '6 months of property taxes and 4 months of insurance, less a standard aggregate adjustment of $946.05',
    already_paid_before_closing: 1842
  },
  earnest_money_deposit: 10000,
  prepayment_penalty: {
    years: 3,
    schedule: 'not provided — do not guess the penalty amounts',
    buydown_option: '2-year penalty for a one-time fee of 0.5% of the loan amount ($1,145.63)'
  },
  impounds: {
    meaning: 'Property taxes and homeowners insurance are collected with the monthly payment and paid by the lender when due. A reserve is collected at closing to start the account.',
    waiver_option: 'Borrower may waive impounds for a one-time fee of 0.25% of the loan amount ($572.81). Then no reserve is collected at closing and the borrower pays taxes and insurance directly. Not available on Foreign National loans.'
  }
};

function round2(n) { return Math.round(n * 100) / 100; }

function scenario({ imp, ppp, foreignNational }) {
  const waive = !foreignNational && imp === 'waive';
  const ppp2 = ppp === '2';
  const c = LOAN.closing_costs;
  const total = round2(c.lender_fees_ameritrust + c.third_party_and_prepaids + (waive ? 572.81 : c.impound_reserves) + (ppp2 ? 1145.63 : 0));
  const cash = round2(LOAN.down_payment + total - c.already_paid_before_closing - LOAN.earnest_money_deposit);
  const monthly = waive ? 1675.90 : 2277.25;
  return {
    borrower_current_choices: {
      impounds: waive ? 'waived' : 'kept',
      prepayment_penalty: ppp2 ? '2 years (buy-down selected)' : '3 years',
      foreign_national_loan: Boolean(foreignNational)
    },
    estimated_total_closing_costs: total,
    estimated_cash_to_close: cash,
    cash_to_close_math: 'down payment + total closing costs − amount already paid before closing − earnest money deposit',
    estimated_monthly_payment: monthly,
    monthly_payment_includes: waive ? 'principal & interest + HOA (borrower pays taxes and insurance directly)' : 'principal & interest + property taxes + insurance + HOA'
  };
}

function systemPrompt(body) {
  return `You are the loan-terms assistant on a borrower confirmation page for Lior Yehuda's loan team.
The borrower is reviewing the loan structure the team plans to submit to underwriting, before confirming it.

Rules:
- Explain only the terms in the data below and general mortgage concepts, in plain language.
- Never invent, change, or estimate numbers that are not in the data. If something isn't provided, say so and suggest scheduling a 15-minute call with Lior.
- Never promise approval. You are not the lender, underwriter, or loan officer.
- Explain tradeoffs; do not make the decision for the borrower.
- Terms are preliminary: they can change with appraisal, credit, or market pricing, and the rate isn't final until locked.
- Answer in the language the borrower writes in. ${body.lang === 'he' ? 'The page is currently shown in Hebrew, so prefer Hebrew.' : ''}
- Keep answers under 120 words. Use dollar amounts exactly as given.
- This is a demo with a sample borrower.

LOAN DATA:
${JSON.stringify({ ...LOAN, ...scenario(body) }, null, 2)}`;
}

async function askClaude(system, messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: 500,
      system,
      messages
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Claude API error ${r.status}`);
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

async function askOpenAI(system, messages) {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      instructions: system,
      input: messages.map(m => ({ role: m.role, content: m.content })),
      store: false
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `OpenAI API error ${r.status}`);
  if (typeof data.output_text === 'string') return data.output_text.trim();
  for (const item of data.output || []) for (const c of item.content || []) if (c.type === 'output_text') return c.text.trim();
  return '';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const question = String(body?.question || '').trim().slice(0, 600);
  if (!question) return json({ error: 'Question required' }, 400);

  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-6)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .map(m => ({ role: m.role, content: m.text.slice(0, 1500) }));
  // Both APIs expect the conversation to start with a user turn.
  while (history.length && history[0].role !== 'user') history.shift();
  const messages = [...history, { role: 'user', content: question }];

  const opts = {
    lang: body.lang === 'he' ? 'he' : 'en',
    imp: body.imp === 'waive' ? 'waive' : 'keep',
    ppp: body.ppp === '2' ? '2' : '3',
    foreignNational: Boolean(body.foreignNational)
  };
  const system = systemPrompt(opts);

  try {
    let answer, provider;
    if (process.env.ANTHROPIC_API_KEY) { answer = await askClaude(system, messages); provider = 'claude'; }
    else if (process.env.OPENAI_API_KEY) { answer = await askOpenAI(system, messages); provider = 'chatgpt'; }
    else return json({ error: 'not_configured' }, 503);
    if (!answer) throw new Error('Empty answer');
    return json({ answer, provider });
  } catch (e) {
    console.error('[ask]', e);
    return json({ error: 'ai_failed' }, 502);
  }
};
