# TradeWorks — permanent instructions for Claude Code

## Product
TradeWorks is a field-service SaaS for home-service contractors (cabinet refinishing, painting,
cleaning, handyman). A contractor creates a company, sends bilingual estimates with an online
client link (options, signature, Zelle deposit), tracks jobs, team, expenses and profit.
The working single-file prototype is **/prototype/index.html** (plus **/prototype/lead.html**, the
public lead questionnaire). It is the source of truth for DESIGN, SCREENS, FLOWS and LOGIC.
Rebuild it in React with the same look and behavior, as a multi-tenant product.

## Stack
- React 18 + Vite + TypeScript, React Router, Zustand (or Context) for UI state
- Firebase: Auth, Firestore (offline persistence ON), Storage (photos, receipts, logos)
- Stripe: TradeWorks subscriptions (later). Contractors collect deposits by Zelle (display only).
- Cloudflare Pages hosting; a Cloudflare Worker serves the calendar .ics feed
- Styling: plain CSS modules/CSS files using /design/tokens.css variables. No UI kit, no Tailwind required.
- Icons: /design/icons.ts (SVG bodies, 24px grid, stroke 1.8)
- Charts: /components/LineChart.tsx (custom SVG). No chart library.
- i18n: English + Spanish for the UI; client documents render in the CLIENT's language.

## Non-negotiable rules
1. Match the prototype visually. Before finishing any screen, compare with /prototype/screenshots.
2. Use tokens only (no hard-coded colors except in tokens). Support light + dark (html.tw-dark) + "match device".
3. Mobile first: ≤640px tables become cards, bottom nav (Home, Pipeline, Calendar, Estimates, Invoices, More).
4. Client-facing pages (client link, lead form, PDF/print documents) use the contractor's branding and stay light.
5. Money math must match the prototype exactly (see docs/05-business-logic.md). Write unit tests for it.
6. Every Firestore record: id, companyId, createdAt, updatedAt (server timestamps). Soft deletes where noted.
7. Never trust the client for security — enforce with Firestore rules (docs/06-security-rules.md).
8. Keep components small and reusable (docs/02-components.md).

## Documents
- docs/01-design-system.md — colors, type, spacing, radius, elevation, motion
- docs/02-components.md — every UI component with exact specs
- docs/03-screens.md — every screen, layout and behavior
- docs/04-data-model.md — Firestore schema (multi-tenant)
- docs/05-business-logic.md — formulas & rules, mapped to prototype function names
- docs/06-security-rules.md — Firestore/Storage rules draft

## Build phases (stop after each phase for review)
1. Setup: Vite+TS, router, tokens, fonts, icons. App shell (sidebar, mobile top bar, bottom nav + More sheet),
   theme switch, Auth (sign up/in, reset), company creation + 5-step onboarding, empty states.
2. Clients + Estimates: list (table/cards), job-type picker, estimate editor (tabs: Pricing, Scope & notes,
   Costs & profit, Change orders, Invoices, Link & chat, Photos, Job day), client document (print/PDF), templates,
   job-type presets.
3. Client link (portal) + options + signature + Zelle deposit box + chat; public lead form + lead import.
4. Pipeline (leads + stages, removed-leads list), Calendar (+ .ics feed + Add to Google), Invoices, Follow-ups,
   message templates (WhatsApp/SMS/email deep links).
5. Expenses (receipts, recurring, bank CSV import with rules), Team (workers, hours, clock in/out, payments),
   Job day (checklist from scope + custom tasks, colors & products, shopping list).
6. Dashboard (Overview with KPI library + monthly goal, Today, Money, Charts), Reports (P&L, profit by job,
   marketing ROI), CSV exports, client profile with referral link.
7. Multi-company switcher, roles (owner/admin/worker), Stripe subscription, security hardening, e2e tests.

## Current status (update this at the end of each work session)
**Owner:** non-technical, writes Spanish, Windows/PowerShell. Explain in plain Spanish, step by step. UI stays bilingual EN/ES.

**Live:** https://tradeworks-app.pages.dev (Cloudflare Pages). Firebase project `tradeworks-99ba7`
(the old prototype project `luma-painting-estimate` is separate). Always use the main URL, not
per-deploy preview links (the Firebase key is restricted to 3 referrers, so preview links fail sign-in).
All 7 build phases are done and deployed. Dev branch: `claude/new-session-tl0cfx`; if it was already
merged, restart it from main: `git fetch origin main && git checkout -B claude/new-session-tl0cfx origin/main`.
Merge PRs only when the owner asks ("unelo").

**Built after phase 7:** legacy import from the old `luma-backup-*.json` (`src/lib/legacyImport.ts`, photos/receipts/logo/address/hours);
client-facing pages styled like the prototype (`DocSheet`, portal, lead form); logo upload; earn-per-hour colors;
worker invites + role limits (`roles.ts`); address/hours/payment-method chips; Google sign-in;
delete-company button (creator only, typed name); trades (painting, cleaning, electrical, plumbing, handyman,
landscaping, custom) with editable service catalog (`trades.data.ts`, `CatalogCard.tsx`); dashboard KPI cards per trade (`kpis.ts`).
Docs: `docs/07-security-review.md`, `08-billing-setup.md`, `09-deploy-cloudflare.md`.

**Not merged yet:** commit 80c4c77 (clearer sign-in error messages) on the dev branch.

**Phase 8 (new features, owner chose 2026-09-30):**
8a invoice payment link - DONE (not deployed): public `/pay/:token` (`paylink/{token}`, `src/lib/paylink.ts`, `src/data/paylinks.ts`,
`PayPage.tsx`, `invoices/PayParts.tsx`); ways to pay = payment-method chips + `settings.payHandles` (Venmo, Cash App, PayPal, checks);
client says "I paid" -> owner confirms (marks paid + method) or "Not received"; `usePayLinkSync` in the Shell keeps links fresh.
Merged (PR #10) and rules published 2026-09-30. Rules tests added but NOT run on this Windows PC (no Java).
8b reminders - DONE in code: new follow-ups "job starts tomorrow", "invoice overdue" (settings.invoiceDueDays, default 7),
"confirm payment INV-x"; money reminders carry {invoice} {amount} {paylink} {howtopay} (prototype template text kept verbatim,
pay link appended). Automatic e-mails: `src/lib/autoEmail.ts` (what to send) + `workers/reminders` (Cloudflare cron + Resend,
log in companies/{cid}/autoemails, once per reminder, creates missing pay links). Settings > Leads & messages > AutoEmailCard.
Merged (PR #11). Worker DEPLOYED 2026-09-30 at https://tradeworks-reminders.lumapaintingservices.workers.dev with secrets
set; sends from reminders@lumapaintingservices.com (Resend domain lumapaintingservices.com, DNS in Hover: resend._domainkey,
send, rsend, _dmarc). Dry run OK. Owner still has to switch "Automatic reminders" on in Settings. On Windows use `npx.cmd`.
8c reviews & referrals - DONE in code: settings.referral (on, amount, reward text EN/ES, ReferralCard); `src/lib/referrals.ts`
(referralRows, reward earned when the referred friend has a job Paid in Full); follow-up "Referral reward to give" (tpl refthanks,
snooze on the referrer); client profile shows each friend's status + "Give reward" (friend.refReward, optional marketing expense
category ads / source Referral, id x-ref-{friendId}); review message and paid invoice page invite to share the referral link.
`jobStatus` moved to src/lib/jobStatus.ts (re-exported by followups).
8d card & bank payments - DONE in code (setup pending, see docs/10-card-payments.md): Stripe Connect Accounts v2 (POST /v2/core/accounts, dashboard full, fees+losses collector stripe; Stripe refuses v1 for new platforms),
direct charges. Owner connects in Settings > Client link & payments > CardPayCard (`/api/connect/start|status`, owner only);
company fields stripeAccountId/stripeReady/stripeDetails/stripeCheckedAt are server-only (billingUntouched in rules).
Pay page button "Pay by card or bank" -> `/api/pay/checkout` (public, token only; amount read from the invoice) -> Stripe Checkout
on the contractor's account. Connect webhook `/api/pay/webhook` (STRIPE_CONNECT_WEBHOOK_SECRET) -> `functions/_lib/connect.js`
marks the invoice Paid ("Card (Stripe)" / "Bank (Stripe)"), invoice.online + paylink.online, and the estimate stage
(imports src/lib/invoices.ts statusAfterPayment; Pages bundles TS fine). Bank = "processing" first. Amount mismatch -> payClaim.
`settings.cardPay.on` switch; `cardPayOn()` in src/lib/paylink.ts. Merged (PR #14). TEST MODE set up 2026-09-30: rules published,
Connect enabled in the Stripe sandbox (platform, merchants collect directly), Connect webhook `tradeworks-invoice-payments`
(we_1ULUPCDcSz8Bge3yZjluWUVr, 5 events), Pages secrets STRIPE_SECRET_KEY / STRIPE_CONNECT_WEBHOOK_SECRET / FIREBASE_SERVICE_ACCOUNT.
Switched to Accounts v2 (PR #16); "Connect Stripe" works (test account created, onboarding opened 2026-09-30).
PAUSED by the owner before finishing onboarding. Still to do: finish test onboarding, pay an invoice with 4242, then live mode (docs/10 step 8).
8e team map - DONE in code: owner turns on company.trackLocation (Team > "Where the team is", TeamMap.tsx). Workers' phones save
{lat,lng,acc,at} at clock-in (clock.loc), every 5 min while the app is open and clocked in (clock.last, LocationPing in the Shell),
and on the hours entry (inLoc/outLoc). Map = Leaflet + OpenStreetMap tiles (lazy chunk); job sites = jobs within 3 days,
geocoded once per address with Nominatim (1 req/s) into estimate.geo. On site = within 0.25 mi (+ GPS accuracy, capped).
Web apps can't track in the background: last known position. _headers: geolocation=(self), OSM tiles/nominatim in CSP.
After 8e (2026-09-30): work order uses the shared DocSheet sheet, checklist = estimate scope as written (PR #18); sign-in shows
"Signing you in…" and gives up after 20 s with a reload button (PR #19); time clock keeps start/end times (hours.start/end).
Timesheets: /timesheet (worker: "My pay" in the bottom bar) and /team/:workerId/timesheet (owner, "Timesheet" button in Team):
pay by week/month chart, by job, hours by day, payments, earned/paid/owed (src/lib/timesheet.ts). Workers may now READ their own
payouts (rules + workerScope). Worker picks the job at clock-in from today's tasks (clockJobOptions); tasks, hours and clock carry
jobLabel ("EST-1001 · Ana Ruiz") because workers can't read estimates. Owner decision: workers see earned, paid and owed.
Job photos (before/after): Attachment card component (port of shadcn/ui Attachment, plain CSS). Worker Team page > "Job photos":
pick job (clocked-in job + my tasks' jobs -14..+7 days), Before/After/Detail, take photo or gallery; upload cards with progress
and retry. Saved in jobphotos + Storage companies/{cid}/jobphotos/{workerId}/. Owner's app copies them onto the job
(estimate.photos with teamId/by) in the Shell (useTeamPhotoSync) and in the open editor (useTeamPhotosInto); worker deletes ->
taken off the job. Owner Photos tab uses the same upload cards and shows "Carlos · date" on team photos.
Merged (PR #21) and Firestore + Storage rules published 2026-09-30.
Sidebar fold-to-icons (owner picked only this idea from shadcn sidebar-07): button next to the logo or Ctrl/Cmd+B,
72px rail with tooltips, remembered per device (useUi().sbMini). Other ideas offered and not chosen: account menu at the
bottom, breadcrumb header, Settings submenu. Merged (PR #22).
Job team chats: /chats and /chats/:estId (worker bottom bar "Chats"; owner sidebar + More; "Team chat" button on each
estimate). One group chat per job: owner starts it (workers with tasks on the job pre-ticked), adds / removes workers,
closes / reopens. jobchats/{estId} (members, last) + msgs subcollection; unread badge + toast (useChatInbox in the Shell);
read state per device + person. Text only for now. Rules: see docs/06. Merged (PR #23), rules published 2026-09-30.
Job crews (like Jobber / Housecall Pro): estimate.crew + crewNote, set in Job day tab > Crew card (chips, dates/address
warnings, double-booking warning, notes). Owner's Shell (useCrewSync) writes crewjobs/{estId} (no prices) and mirrors the
crew's checklist ticks into estimate.check; crew members are added to the job chat if it exists. Workers: home is now /jobs
("Jobs" in the bottom bar): Today / Coming up / Not scheduled / Recent; /jobs/:id = directions (Google Maps), dates, crew,
notes, checklist to tick (who + when), colors, photos (WorkerPhotos fixedJob), time clock and chat links. Clock-in and photo
job choices include crew jobs. Calendar day panel shows "👷 crew" or "No crew yet — assign" (opens ?tab=jobday).
Same PR, owner feedback 2026-09-30: ErrorBoundary (src/ui/ErrorBoundary.tsx, around the app and each page) instead of a blank
page, shows the error text and reloads once on stale code chunks (a worker reported a blank page on refresh; not reproduced in
demo). Calendar month cells: task = worker initials + title + "worker · client"; job chips show crew initials. Worker photos are
private on the client link / documents until the owner ticks "Show to the client" (PhotoRef.toClient, clientCanSee). Client
profile photos have a delete (deleteJobPhoto). Chat: photos (camera button, upload cards, lightbox), a worker's job photo is
also posted to the job chat; only owners / admins delete a message or a whole chat (rules: workers can't delete).

**Owner to-dos to confirm:** Google enabled in Firebase Auth > Sign-in method; API-key restriction saved
(referrers: tradeworks-app.pages.dev, tradeworks-99ba7.firebaseapp.com, tradeworks-99ba7.web.app);
test a real estimate with photos.

**Deferred (owner decided "later"):** Stripe billing (suggested $29/mo, test mode first; account created, rest not done — see docs/08);
custom domain (`app.lumapaintingservices.com`; then add to Firebase Authorized domains + key referrers);
calendar .ics worker; App Check and security to-dos (email-enumeration protection, 8+ char passwords, budget alert);
fresh security review of Google/delete-company/trades changes; recurring services; more trades (HVAC, appliance,
general contractor, window cleaning, pest control); automatic invite emails (e.g. Resend; today the Firebase
verification email may land in spam); landing page + terms/privacy before selling; update docs for the trade model.
