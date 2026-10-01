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
E2E tests on this Windows PC: `E2E_CHANNEL=msedge npx.cmd playwright test` (uses the installed Edge, no browser download). All 23 passed 2026-10-01.

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
Signature: chip "✍ Signed by X · date" under the estimate number (opens Link & chat) + a Signed card there with the image,
name, date/time, "See it on the document" and "Remove signature" (deletes portal client.sign first via patchTop remove, then
estimate.signature, portalSeen.sign=false, Accepted -> Sent). Activity card has "Clear". Signature date now stored as the local
day (was the UTC day: a 7 pm signature showed the next day).
Deposit at signing (owner decision 2026-09-30: switch, OFF by default; when on, pay through the invoice pay page; default payment
stages = after day 1 50% / job done 50%): settings.depositAtSign (+ depositAtSignSince, so old signed jobs are never billed by
surprise) and estimate.depositAtSign (Pricing checkbox, wins). src/lib/deposit.ts. Off: after signing the client link shows "Your
payments" (first row "After the first day of work") and no pay button; the old Zelle "I sent the Zelle" box is gone. On: the
owner's Shell (useDepositOnSign, src/data/deposit.ts) creates the job's invoices + a pay link for the first one as soon as the
signature arrives, and the portal snapshot (s.deposit {atSign, pay {amount, token, paid}}) shows "Pay the deposit" -> /pay/token,
then "Deposit received". publishPortal(e, s, company, invoices) now takes invoices. Printed estimate: "Deposit due at signing"
when on. Merged (PR #24), rules published 2026-09-30.
Badges + checkboxes (shadcn/ui ideas, plain CSS): src/ui/Badge.tsx used by every pill (statuses keep the dot), global checkbox
style in base.css (--chk / --chk-ink per container); dark-mode tints for --tile-*/--icon-*/--up-*/--down-* added (they were light).
Merged (PR #25).
Invoice preview (owner liked the studio-admin template, 2026-09-30; also wants later: a notes board like its Kanban, then a cleaner
calendar with multi-day bars + week view; extras offered: Quick create button, Ctrl+K search, trend badges): click an invoice ->
Drawer (src/ui/Drawer.tsx) with the document (InvoicePaper + PaperFit in src/pages/invoices/InvoicePaper.tsx, also used by
InvoiceDoc) and PaySend (PayParts.tsx; replaced PayLinkModal). No download button by owner choice, only Print / Save PDF.
Merged (PR #26). Code backup before the next steps: tag backup-2026-09-30-before-notes-calendar + branch backup/2026-09-30-before-notes-calendar.
Notes board (/notes, sidebar after Chats, More sheet): src/lib/notes.ts (+ test), src/pages/notes/Notes.tsx + NoteEditor.tsx; notes collection
(owners / admins only: no workerScope, generic rules already deny workers; rules test added), columns in settings.noteCols; in the backup file.
Merged (PR #27).
Calendar redesign (owner): toolbar with Show / Person filters + Month / Week, multi-day job bars (WeekRow.tsx, weekSegments / monthWeeks
in src/lib/calendar.ts), phone week = day list. Worker calendar (WorkerCalendar.tsx) unchanged, still uses the old .cal-grid styles.
Merged (PR #28).
Quick create menu + Ctrl/Cmd+K search (src/layout/QuickActions.tsx, src/lib/search.ts, src/ui/useUrlFlag.ts: ?new=1 on Clients / Calendar /
Expenses / Notes, ?open=<id> on Invoices / Notes). KPI cards: trend badge next to the value. All template ideas the owner picked are now done.
Merged (PR #29).
shadcn studio components (owner said "hazlo" 2026-10-01; backup tag backup-2026-10-01-before-shadcn-ui): app confirm window `ask()` replaces every
browser confirm() (src/ui/confirm.tsx); toasts with icon + Undo (src/ui/Toaster.tsx, toast(text, { undo })); on/off settings are switches
(input.sw); PhoneInput formats US numbers; Combobox for client / job pickers; sortable table headers (useTableSort); "⋯" RowMenu on invoice rows.
See docs/02-components.md. Not done (offered, lower value): date picker, skeletons, drag to reorder line items.
Same PR (#30), owner request 2026-10-01: theme switcher like Vercel Geist (src/ui/ThemeSwitcher.tsx: match device / light / dark) in
Settings > General and the user menu; sidebar bottom like shadcn dashboard-01 (Settings + NavUser: avatar, name, e-mail, menu with
Settings, Language & appearance, theme, Sign out; src/layout/NavUser.tsx; footer sticky). The EN/ES button is gone from the sidebar and
the phone top bar: app language only in Settings (login, onboarding and client pages keep their own). Phone More sheet ends with the
user, theme and Sign out. Workers: Settings shows only language & appearance (no section menu).
Merged (PR #30). Avatars (owner asked 2026-10-01, shadcn Avatar): src/ui/Avatar.tsx (+ AvatarGroup) and src/lib/avatar.ts (+ test) replace every
in-app initials circle (see docs/02-components.md); the signed-in user's Google photo is used (User.photo, CSP allows lh3.googleusercontent.com).
Same PR: the red confirm button stays red on hover. Merged (PR #31).
Profile photos (owner 2026-10-01, change or remove like shadcn): AvatarPicker (src/ui/AvatarPicker.tsx) in Settings > General > Your profile
and Team > Edit worker. Workers: workers/{id}.photo (rules: a worker may change only the photo of their own record; Storage
companies/{cid}/avatars/{wid}/); owners / admins: users/{uid}.avatar (Storage users/{uid}/avatar/). Crew copy carries crewPhotos for coworkers.
Font changed to Figtree (owner request). Backup tag backup-2026-10-01-before-profile-photos. Merged (PR #32), Firestore + Storage rules published 2026-10-01.
Owner said "later" (2026-10-01) to a Files page (file manager) and to email forwarding into the app.
Measurements per job type (owner 2026-10-01: "every service should have its metrics, like cabinets", new UI shadcn-style): src/lib/measures.ts
(+ test; DEFAULT_MEASURES per job type of every trade, settings.measures overrides). Estimate Pricing tab: MeasuresCard (how many × price per
unit; each one is an ordinary line with svc = service id, so totals / hours / materials / documents are unchanged; 0 removes the line).
Settings > Job types: per type, Cabinet prices (moved from Prices) + measurements list (price = the service's price, reorder, remove,
add from services or create a new service). The Prices card no longer writes the cabinet prices. Owner rule: build new UI the shadcn way. Merged (PR #33).
Access control + clock by task (owner 2026-10-01; backup tag backup-2026-10-01-before-access-control):
- Accounts are by invitation: only a TradeWorks platform admin (admins/{uid}, added by hand in the Firebase console; rules isPlatformAdmin())
  creates companies; the owner sets up each client company (onboarding) and invites its owner. Invitations: owners / admins invite
  WORKERS only; owner / admin invites and promotions to owner / admin only by the platform admin (canInviteRole, canChangeRole, rules).
  Anyone else who signs up sees "You need an invitation" (App.tsx NoAccess, roles.ts onboardingView). Demo mode: everyone may create.
- Login / sign-up: PasswordInput with show / hide (src/ui/PasswordInput.tsx); sign-up says it is for invited people.
- Time clock always runs for ONE task of today (clockTaskOptions, clockFor): worker picks it (radio cards), owner's Team "Clock in" opens a
  task window (or "New task" pre-assigned, then back). clock + hours carry taskId / taskTitle (rules taskOk). Hours shown as "7 h 30 min"
  (hoursText), running clock "02:05" (clockHHMM). Global radio style (shadcn Radio Group) in base.css.
Merged (PR #34), Firestore rules published and admins/RqJH4iTMLOdNcUy5ODyyak6WR3g1 (lumapaintingservices@gmail.com) added 2026-10-01.
The two companies other accounts created before the lock ("ginolacera94@gmail.com" etbFLIZx2gzjhAvj1efR, "Jeksk" wxBkkazjG40h5k1yiLGl) were deleted by
the owner 2026-10-01; only Luma Painting Services LLC (xSTQaO1jXsFNmuIhbSXL) remains. Their leftover public/{cid} cards (and 2 old test ones)
were deleted too; public/ holds only xSTQaO1jXsFNmuIhbSXL.

**Owner to-dos to confirm:** Google enabled in Firebase Auth > Sign-in method; API-key restriction saved
(referrers: tradeworks-app.pages.dev, tradeworks-99ba7.firebaseapp.com, tradeworks-99ba7.web.app);
test a real estimate with photos.

**Deferred (owner decided "later"):** Stripe billing (suggested $29/mo, test mode first; account created, rest not done — see docs/08);
custom domain (`app.lumapaintingservices.com`; then add to Firebase Authorized domains + key referrers);
calendar .ics worker; App Check and security to-dos (email-enumeration protection, 8+ char passwords, budget alert);
fresh security review of Google/delete-company/trades changes; recurring services; more trades (HVAC, appliance,
general contractor, window cleaning, pest control); automatic invite emails (e.g. Resend; today the Firebase
verification email may land in spam); landing page + terms/privacy before selling; update docs for the trade model.
