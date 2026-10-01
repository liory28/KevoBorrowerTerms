# Loan Terms Confirmation — feedback demo

A clickable demo of the borrower terms-confirmation flow, for sharing with people for feedback.
It uses a **sample borrower** (Daniel & Sofia Ramirez, 1450 Sample Ridge Dr). The loan numbers come from a real Initial Fees Worksheet, but no real client's name or address is shown.

## What's in it
- **Borrower screens** (switch between them with the dark demo bar at the top):
  1. Before submission: confirm the loan request. Includes English/Hebrew, the closing-cost breakdown, impound and prepayment-penalty choices that update the totals live, and the AI assistant.
  2a. Approved as requested (tick "Market moved" to see the rate-change version).
  2b. Restructure needed: "let's talk before we lock."
  3. Rate locked, with what's needed to close.
- **Team view**: the loan file, the source line for each figure, the worksheet checks, and the underwriting result.
- **Give feedback** button: viewers' feedback is saved in Netlify (Forms).
- **Live AI assistant**: answers questions about the sample loan in any language. It uses Claude if `ANTHROPIC_API_KEY` is set, otherwise ChatGPT if `OPENAI_API_KEY` is set. Without a key, the suggested questions show prewritten answers and typed questions show a "not connected" note.

## Deploy (live AI included) — about 10 minutes
1. Create a new **private** GitHub repository (for example `loan-terms-demo`) and upload everything in this folder (keep the folder structure: `public/`, `netlify/`, `netlify.toml`).
2. In Netlify: **Add new site → Import an existing project → GitHub** → pick the repo. Leave the build settings as they are (`netlify.toml` sets them) → **Deploy**.
3. **Site configuration → Environment variables → Add a variable**:
   - `OPENAI_API_KEY` = your OpenAI key (you already have one for the current portal), **or**
   - `ANTHROPIC_API_KEY` = a Claude key.
   Mark it as a secret, then **Deploys → Trigger deploy → Deploy site** so it takes effect.
4. **Forms → Enable form detection**, then redeploy once more. Under **Forms → Form notifications**, add an email notification so feedback lands in your inbox.
5. Optional: give it a subdomain such as `demo.liorfinance.com` (**Domain management → Add a domain**, then a CNAME in GoDaddy pointing to the Netlify site name). Don't touch your MX records.

## Quick look without AI
Drag this folder onto https://app.netlify.com/drop. The screens work; the AI assistant falls back to prewritten answers, because Drop doesn't run functions.

## Notes
- Search engines are told not to index the site (`noindex` headers).
- The AI endpoint is open to anyone with the link, so set a monthly spending limit on the OpenAI or Anthropic account. Questions are capped at 600 characters and answers at about 500 tokens.
- Optional model overrides: `OPENAI_MODEL` (default `gpt-5-mini`) or `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).
