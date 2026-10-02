# Loan Terms Portal

Borrowers confirm the loan you're requesting for them **before** it goes to underwriting, so nobody can later say they weren't told. Then they're kept informed at underwriting and at lock.

## How it works

**Team**
1. Log in and upload the Ameritrust **Initial Fees Worksheet** (PDF). It's read in the browser; every figure is shown next to the worksheet line it came from.
2. Fill in what isn't on the worksheet: borrower email (and phone), language (English/Hebrew), estimated value for refinances, prepayment-penalty schedule, interest-only period. **Checks** flag anything that blocks sending or doesn't add up (for example a bottom line that doesn't match the itemized fees, or "credits" that aren't real credits).
3. **Mark ready for LO** (team login) → the loan officer gets an email.

**Loan officer**
4. Review, **Preview borrower page**, then **Send to borrower**. A private link is created and emailed (or copy it and text it yourself).

**Borrower** (phone-friendly, English/Hebrew)
5. Sees the loan being requested: cash to close / cash to them, the key terms, estimated closing costs (lender, third-party, impound reserves), and plain-English explanations. Choices update the numbers live:
   - **Waive impounds**: 0.25% one-time fee (not offered on Foreign National loans or when there are no impounds).
   - **Shorten a 3-year prepayment penalty to 2 years**: 0.5% one-time fee.
   They can ask the AI assistant questions in any language, then tap **"Yes, submit my loan as shown"** or **"I'd like to discuss first"** (which offers your Calendly link and alerts the team).
6. Confirming records the exact terms, choices, time, IP and browser, and emails the borrower a copy.

**After underwriting**
7. Record the result:
   - **Approved as requested** → borrower sees "approved, locking now". If the rate moved, they see old vs. new rate (structure unchanged).
   - **Restructure required / Declined** → borrower sees what changed and why, and is asked to schedule a call. Nothing is locked.
   After the call, edit the details or upload the new worksheet and **Send updated request**: a new version with a new link. The old link stops working.
8. **Lock**: enter rate, expiration, payment (if the rate changed) and the items needed, one per line. The borrower sees the locked terms and the checklist.

**Underwriting approval & conditions** (after the borrower confirms)
9. Upload the **underwriting approval PDF** on the loan page. AI reads it in the background (30–90 seconds) and builds:
   - **Key facts** (loan amount, LTV, rate, DSCR, lock/approval expirations) compared with what the borrower confirmed, with a **restructure warning** if the loan amount or LTV changed. One click fills the underwriting result form.
   - **Every condition** rewritten in plain English, with a short **"why"** on anything a borrower might question, grouped by **who provides it** (borrower, insurance agent, title/escrow, appraiser, seller, HOA, other third parties, lender) and **who receives it** (processor or LO), and when it's due.
   - **Heads-up flags** (lock expiring soon, typos in vesting, thin DSCR…).
   - **Request drafts** ready to copy or send: borrower email + text, insurance agent, title/escrow, appraiser, and an internal processor note. Emails to outside parties copy the processor and the LO.
10. Mark conditions **Requested / Received / Cleared** as they come in (saves instantly). Edit any wording; edits are kept.
11. When the rate is locked, the borrower's page shows **their** items only, each with its "why", and checks them off as you mark them received. **Notify borrower: checklist updated** emails/texts them.
12. When underwriting sends an **updated approval**, upload it: progress and your edits carry over for matching condition numbers, new conditions are marked **New**, and removed ones are listed.

**Document formats (self-service)**: *Document formats* in the top bar holds the layout notes the AI uses for each document type (underwriting approval, fees worksheet). They ship with notes written from your real documents (wrapped words, repeated sections at page breaks, PTD/PTF groups, the "Date Cleared" column, contacts). If the loan system changes a layout: open Document formats, drop in a sample of the new version, the AI drafts updated notes and lists what changed, you review, and click **Save notes**. **Reset to built-in** undoes it. Only the loan officer login can change formats.

**Worksheets that don't read cleanly**: the built-in worksheet reader is exact and uses no AI. If a worksheet's layout changes and it can't be read cleanly, the New loan page offers **Read with AI instead**. Every figure is still checked against the worksheet's own section totals and bottom line, and the loan is marked as read by AI so the team double-checks it.

**AI polish**: every message box that goes to a borrower or another party has **Polish with AI / Shorter / Simpler / To Hebrew** buttons. It rewrites the wording without changing any number, date, name or requirement, and **Undo** puts your original back.

**Texts**: tick "Borrower agreed to receive text messages" on the loan, and every borrower notice (request, reminder, approval, restructure, lock, checklist update) also goes out by text with the link. Texts include "Reply STOP to opt out".

Every step is in the loan's **Activity** log, every email attempt (and failure) is in **Emails**, and the borrower's AI questions are listed so you know what confused them.

## Deploy on Netlify (about 15 minutes)

1. Create a new **private** GitHub repo (for example `loan-terms-portal`) and upload this folder as is (`public/`, `netlify/`, `netlify.toml`, `package.json`).
2. Netlify → **Add new site → Import an existing project → GitHub** → pick the repo → **Deploy**. Build settings come from `netlify.toml`.
3. **Site configuration → Environment variables**. Add these and mark the keys and passwords as secret:

| Variable | What to put |
|---|---|
| `APP_SECRET` | A long random string (40+ characters). Signs logins. |
| `TEAM_PASSWORD` | Password for the team login |
| `APPROVER_PASSWORD` | Password for the loan officer login. Leave it out if one login should do everything. |
| `SITE_URL` | The site address, e.g. `https://terms.liorfinance.com` (used in email links) |
| `RESEND_API_KEY` | From resend.com (email sending) |
| `FROM_EMAIL` | A verified sender, e.g. `Lior Yehuda <terms@liorfinance.com>` |
| `TEAM_NOTIFY_EMAILS` | Optional. Defaults to `teamlior@ameritrust-mortgage.com` |
| `APPROVER_NOTIFY_EMAILS` | Optional. Defaults to `lior@liorfinance.com` |
| `OPENAI_API_KEY` **or** `ANTHROPIC_API_KEY` | Turns on the AI: the borrower assistant, **reading approvals** (required for that feature), and **Polish with AI**. If both are set, Claude is used. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Texting (from twilio.com). Optional until you're ready. |
| `TWILIO_MESSAGING_SERVICE_SID` (recommended) or `TWILIO_FROM` | The Twilio Messaging Service (needed for A2P 10DLC registration) or a Twilio phone number like `+18185550000`. |

4. **Deploys → Trigger deploy** so the variables take effect.
5. **Email (Resend)**: add your domain in Resend, add the DNS records it gives you in GoDaddy (they're for a sending subdomain; don't touch your Google Workspace MX records), then set `FROM_EMAIL` to an address on it. Until this is done everything still works: the portal shows the borrower link to copy, and logs "email not sent".
6. **Domain**: when you're ready to replace the old portal, point `terms.liorfinance.com` at this site (Domain management → add the domain; CNAME in GoDaddy). Data from the old portal isn't touched; this uses its own storage.
7. Set a monthly spending limit on the OpenAI/Anthropic account. Approvals contain borrower information: use an AI account set to keep no data (OpenAI API data isn't used for training by default; this app also sends `store: false`), and add the provider to your vendor list.
8. **Texting (Twilio)**: create a Twilio account, buy a local number, then complete **A2P 10DLC registration** (Brand + Campaign, "Customer care / account notifications"). US carriers block unregistered business texts; approval usually takes 1–3 weeks. Then add the Twilio variables above and redeploy. Only text borrowers who agreed to it.

## Notes and limits (v1)
- The worksheet reader is built for the Ameritrust Initial Fees Worksheet layout. If a PDF can't be read, the team sees exactly which lines failed; other document formats aren't supported yet.
- Logins are shared passwords per role. Each person enters their name, and it's recorded on every action. Individual accounts can come later.
- Borrowers don't upload documents here yet. The lock page lists what's needed and tells them to reply by email.
- The confirmation record lives in the portal and the borrower's emailed copy. Saving a PDF to Google Drive is a planned addition.
- Not built yet: automatic reminders, borrowers uploading documents directly, saving the confirmation PDF to Google Drive.
- Approval reading needs a text-based PDF (exported from the loan system). Scanned images can't be read.
- The approval reader auto-fills the processor's name and email from the approval's Contact Information when the loan doesn't have them yet.

## Testing locally
`npm install`, then `EXTRA_ENV='{"MOCK_AI":"1","MOCK_SMS":"1"}' node test/server.mjs` (runs the site at http://localhost:8890 with in-memory storage; team password `team`, LO password `lo`). With the server running, `node test/api-flow.mjs` and `node test/approval-flow.mjs` run the end-to-end checks (`test/approval-sample.txt` is a made-up approval). Put sample worksheet JSON in `test/` first. Real client worksheets are deliberately not included.
