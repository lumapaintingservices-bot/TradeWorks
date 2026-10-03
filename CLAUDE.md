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
E2E tests on this Windows PC: `E2E_CHANNEL=msedge npx.cmd playwright test` (uses the installed Edge, no browser download). All 24 passed 2026-10-01.

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
Worker access + live tasks + date picker (owner 2026-10-01; backup tag backup-2026-10-01-before-datepicker):
- Deleting a worker or marking them inactive removes their login from the company (members doc) and cancels their worker invites
  (roles.ts workerAccess, data/workers.ts revokeWorkerAccess). The Auth account itself stays (no access; delete by hand if wanted).
- useFirestoreReconnect (src/data/reconnect.ts, in the Shell): back from 15 s+ in the background / online / bfcache -> Firestore network
  restart, so live lists catch up without a reload. useTaskInbox (src/data/taskInbox.ts): workers get a toast for a newly assigned task
  and a Calendar badge until they open Calendar / Team (seen ids per device in localStorage). Demo lists now also update across tabs.
- DatePicker (src/ui/DatePicker.tsx, shadcn style) replaces all 14 browser date inputs. Push notifications (app closed) not done yet.
Merged (PR #35). Invitation e-mails (owner 2026-10-01): functions/api/invite/send.js + functions/_lib/inviteMail.js (tests): caller must be owner / admin
of the invite's company (platform admin for owner / admin invites); 1 per minute, 5 per invite (invite.emailedAt / emailCount, server-written);
Resend from "<Company>" <invites@lumapaintingservices.com>, reply-to the inviter; EN / ES by the inviter's language; link /signup?email= (prefilled).
MembersCard e-mails on create + "E-mail again"; copy-the-message box stays. Needs Pages secret RESEND_API_KEY (owner adds it). Members card stacks when narrow.
Merged (PR #36).
Simpler team + tasks (owner 2026-10-01; backup tag backup-2026-10-01-before-team-assign):
- Team page is the one place: the worker window has name, phone, pay, role quick picks by trade (team.ts rolePicks) and the app access
  (an e-mail invites them as a worker linked to the record: data/workers.ts inviteWorker; badges App / Invited; E-mail again, Cancel).
  Each worker row: "Assign" (AssignModal: job, start date, days, which lines of its checklist this worker does, new lines), Clock in,
  Pay, "⋯" (Edit, Timesheet, Log hours, WhatsApp); "Today: <first task> +N"; the name opens the worker window. "Assigned tasks" section
  is now "Other tasks" (one-off tasks).
- Who does what: estimate.assign { line key: [workerId] }, copied to crewjobs.assign; a line nobody has = whole crew. Job day tab: a
  "Whole crew" / avatars picker on every line and "Assign day" per day (Popover), filter pills per worker, taking someone off the crew
  frees their lines. The Job day checklist now uses settings.crewLang (default Spanish), the same list the crew sees (it used the app
  language before, so an English-UI owner and the crew had different lines: the owner's "doesn't match" report).
- A worker's work = their tasks + their lines (src/lib/work.ts): the clock offers today's (plus left-overs of earlier days of the same job),
  Team "My tasks" lists Today / Coming up / Done, Calendar shows them by day, My jobs has "My tasks / Whole job". New-work notices also
  for lines given by name and new jobs (localStorage key tw.seenWork.*).
- Time clock counts exact minutes (no quarter hours, no 15 min minimum; under a minute nothing is saved); manual hours as hours + minutes.
  Old clock entries keep their rounded hours (start / end are stored, so they could be recomputed if the owner wants).
- Fixed: the invitation link's prefilled e-mail failed for addresses with an "s" (broken regex from PR #36); a date picker / combobox
  open while the window resized crashed. No rules change.
Merged (PR #37); worker Team page spacing (PR #38).
Owner asked 2026-10-01 for everything needed to make the app legal; checklist given in chat (lawyer, separate LLC, trademark, terms / privacy,
e-signature, worker location consent + retention, hours audit trail + overtime, CAN-SPAM footer / unsubscribe, license # field, 3-day cancellation
notice, showcase photo consent, account deletion, OSM attribution, subscription auto-renew rules). Owner picked first: lock the signature.
Signature lock (backup tag backup-2026-10-01-before-signature-lock): the client link signs through POST /api/portal/sign (functions/api/portal/sign.js,
functions/_lib/signCopy.js, tests): server time, total re-computed with the client's picks (must match what they saw), estimate or change order,
once only (updateTime precondition, retried once); writes client.sign / client.coSign.{id} + client.picks with the service account and a copy
portal/{token}/signed/{id} (snapshot, picks, name, drawing, IP, user agent, SHA-256) and e-mails the client their copy (Resend, their language,
company address in the footer). Rules: visitors can no longer write / change / remove signatures or change picks after signing; signed copies are
server-only (get by token, list / delete by the company). Portal page: e-sign consent text (ESIGN / UETA) under the sign buttons, "Signing…", signed
time, "See your signed copy". Public page /p/:token/signed/:id (SignedCopy.tsx): record + full document with the signature, printable. Owner: Signed
card shows the server proof and "Signed copy"; change orders too (co.sigCopy). Demo mode signs locally with a local copy (src/data/portalSign.ts).
Delete company also deletes signed copies. RULES MUST BE PUBLISHED after merge (signatures from the old app version fail until the page reloads).
Merged (PR #39); rules published (checked 2026-10-01: console rules = main).
Client privacy policy (owner 2026-10-01: "only I use the app for now", so the policy is for HIS clients; the owner's TradeWorks platform policy draft
(Downloads/elgal.pdf, placeholders) waits until TradeWorks is sold to other companies). src/lib/legal.ts (clientPrivacy EN / ES, CLIENT_PRIVACY_DATE,
+ test) built from that draft, made true to the app (signature records with IP / device, Stripe, providers TradeWorks / Firebase / Cloudflare /
Stripe / Resend / OpenStreetMap, no selling, 30-day answers, up to 7 years for contracts, e-sign section). Public page /privacy/:cid (PrivacyPage.tsx,
legal.css: company header, effective date, contents, printable, EN / ES, tables stack on phones); company details from public/{cid} (Shell now also
writes email + address). Linked from the request form (next to the contact consent), the client link (footer + e-sign text), the payment link, the
signed copy and its e-mail, and the reminder e-mails (footer: reply "stop" + policy link; the reminders worker needs a redeploy to send it).
Promises kept in the app: estimate.photoOk (Photos tab "The client allows us to show photos of the finished work"; "Our recent work" is disabled
without it) and client.noAutoEmail (client profile switch "Automatic e-mails"; planEmails skips them, also by matching e-mail). Settings > Client link
& payments > "Privacy policy for your clients" (link, missing address / e-mail warning, "have a lawyer read it once"). No rules change. Merged (PR #40).
Workers' records (owner 2026-10-01; backup tag backup-2026-10-01-before-worker-legal):
- Location only with the worker's yes: worker.locConsent { on, at, v = LOC_CONSENT_V } answered on their Team page (notice: when, who sees it,
  90 days, can change it, can clock in either way; "Clock in" asks first). No yes -> no position at clock in / out and no LocationPing
  (geo.ts locAllowed). Owner's worker window shows the answer. Positions on hours entries are removed after LOC_KEEP_DAYS = 90 by the owner's
  Shell (src/data/locRetention.ts, locExpired).
- Hours are records: workers can add but never change or delete (rules; their × button is gone, a note says to tell the boss). The owner's
  edits keep the old values (hour.edits, withEdit, HourHistory.tsx shown to owner and worker), deletes are soft (deleted / deletedAt /
  deletedBy, softDelete / restoreEntry, Team > Hours "Deleted (n)" with Restore); useHours().rows leaves deleted entries out of every total.
- Overtime (FLSA): 1.5x past 40 h in a Monday-Sunday week, extra = 0.5 x the week's regular rate (straight pay / hours) x overtime hours,
  spread over the week's entries (team.ts overtime / entryPay); in Team totals, owed, hours table ("+OT"), labor by job, timesheets, dashboard
  and reports. Per worker switch worker.overtime (default on; off for contractors / exempt).
  Merged together with the phone fixes below (PR #41, 2026-10-02); Firestore rules published by the owner 2026-10-02.

Phone fixes + shadcn-style responsive layout (owner 2026-10-02, from the iPhone; owner said NOT to build the legal items for now —
the license-number field and 3-day cancellation notice were proposed and dropped):
- Combobox / Popover no longer close on every scroll / resize (iPhone Chrome: the job picker in the Expense window flashed and vanished
  when the keyboard or browser bar moved); they follow the button and close only when it leaves the screen. Touch devices don't
  auto-focus the combobox search (no keyboard covering the list).
- Bottom bar height = 64px + safe area (it used to shrink when Chrome hid its toolbar); More sheet, modals (dvh) and page bottom padding
  account for the safe area. Active bottom-bar item has a soft pill behind the icon.
- Layout like shadcn dashboard-01: phone < 768px = top bar + bottom bar (was < 900); tablet 768-1199 = icon rail always, its button /
  Ctrl+B opens the full menu over the page (sb-peek, src/ui/useMedia.ts); >= 1200 = full sidebar (foldable as before). From 768px up the
  page sits in an inset rounded panel (.main) on the sidebar color.
- Rules can't be published from a cloud session (no Firebase login there): the owner pastes firestore.rules in the Firebase console.

Job expenses in Costs & profit (owner 2026-10-02: "an expense linked to an estimate doesn't show in Costs & profit, fake profit"; likely cause
too: the iPhone job picker bug saved expenses with no job). lib/expenses.ts jobSpend (materials / labor = subcontractors / other, per job);
jobEconomics(e, s, number | {mat, labor, other}) adds sub + other to the cost (a plain number = prototype behavior, parity tests unchanged);
matEst returned. CostsTab: Real profit lists Subcontractors / Other job expenses; new card "Expenses for this job" (list, click to edit,
"+ Add expense" opens ExpenseModal already on the job); Materials card shows Estimated / Real / Difference and hides the typed real cost when
receipts exist. ExpenseModal moved to src/pages/expenses/ExpenseModal.tsx (prop `job`). Tests: jobSpend.test.ts, e2e/job-expenses.spec.ts. Merged (PR #42, 2026-10-02).
Part 2, materials estimate closer to real — merged (PR #43, 2026-10-03) (owner 2026-10-02; Dillon: estimated $342.50, really spent $153):
- settings.materials.chargeUsed (switch, off = prototype): cost the exact gallons used, not whole quarts (leftovers go to the next job);
  buy* (shopping list) unchanged. Costs tab shows "0.74 gal used (buy 0.75)".
- settings.materials.realFactor (realFactorOf: 0.1-3, else 1 = prototype): calcMaterials returns baseCost + factor, totalCost = base x factor.
  lib/materialsLearn.ts materialsLearning: jobs where the owner buys materials and the real cost is known (materials expenses, else
  actualMaterialCost) -> total real / total estimated (baseCost, ignoring any older factor). Settings > Profit > Materials: switch +
  "Learn from your real jobs" box (jobs list, "Use X% on my estimates", "Stop adjusting" = 1, then Save). Costs tab: "Adjusted to your
  real jobs (X%)" line. Only internal cost / profit; client prices unchanged. Tests: materialsLearn.test.ts, e2e/job-expenses.spec.ts.
  Advice given: default supplies (~$95 per cabinet job + sandpaper per door) and paint prices should be set to the owner's real ones.

Scope lines (owner 2026-10-03: text with a line break mid-sentence printed as two bullets): lib/scope.ts joinBrokenLines, used by nl2list
(document, client link, work order, Job day checklist) and "Make standard": a line starting lowercase, without its own bullet mark, joins the
line above unless that one ends . ! ? : ; or is a heading; skipped when most lines start lowercase; " ." -> ".". ScopeTab: "Preview · N
bullets" under each scope / terms box (same nl2list) + clearer hint. Tests: scope.test.ts, e2e/scope-lines.spec.ts. Merged (PR #44, 2026-10-03).

Expenses tab per estimate (owner 2026-10-03: "a detailed expense section per estimate"): estimate tab "Expenses" (ExpensesTab.tsx) on
lib/jobLedger.ts (+ test): tiles job price / spent so far / profit so far / margin (only what is recorded); Budget vs actual per kind
(materials est = calcMaterials vs real receipts; team labor est = crewCost in crew mode, real = logged hours x pay incl. the job's share of
the week's overtime; subcontractors and every other category real only), bars, total diff only when every spent kind has an estimate;
receipts list (thumbnail, method, note, filter pills by category, tap to edit, + Add expense, Export CSV incl. team hours); team hours on the
job (worker, date, hours, pay, OT) vs planned hours. e2e in job-expenses.spec.ts. Merged (PR #45, 2026-10-03).

Period dropdown + Expenses "By job" (owner 2026-10-03: "This month / Last month … should be one button; add expenses per job; nothing
redundant; shadcn"): src/ui/RangeSelect.tsx (one "📅 This month ▾" button, Popover list) replaces every row of period pills: Expenses,
Reports, Dashboard Money / Charts / Sources (ChartsPills now renders RangeSelect), Team, Timesheet, worker Team page. Expenses page: header
= "⋯" menu (Recurring expenses, Import bank CSV) + "+ Expense"; toolbar = period + "All expenses / By job" tabs; By job = lib expensesByJob
(+ test): per job count, materials, other, total, bar, business expenses last; a job row opens /estimates/:id?tab=exp. RowMenu follows its
button on scroll / resize like Combobox. e2e updated (expenses, job-expenses). Not merged yet.

Follow-ups in one place + signatures without opening the estimate (owner 2026-10-03: "Who to write to today is on Pipeline and Dashboard;
it doesn't update when a client signs"): FollowUpList now only on Dashboard > Today (next to "What your clients did", like the prototype);
removed from Pipeline and Overview; Overview shows a one-line TodayNudge (count + first names, opens Today). src/data/portalInbox.ts
usePortalInbox (Shell, owners / admins): one subscribeTop per watched client link (estimates with portal.token, not Paid in Full / Declined;
rules don't allow listing portal docs), portalApply + save when the estimate is not open in the editor (openEditors set registered by
EstimateEditor), toast only for a new signature. So the stage, follow-ups and deposit at signing follow at once (before: only when the
estimate was opened). EstimateEditor: the pending 500 ms save now runs on unmount instead of being dropped. e2e: portal-inbox.spec.ts.
Not merged yet (same branch as the period dropdown work).

**Owner to-dos to confirm:** Google enabled in Firebase Auth > Sign-in method; API-key restriction saved
(referrers: tradeworks-app.pages.dev, tradeworks-99ba7.firebaseapp.com, tradeworks-99ba7.web.app);
test a real estimate with photos.

**Deferred (owner decided "later"):** Stripe billing (suggested $29/mo, test mode first; account created, rest not done — see docs/08);
custom domain (`app.lumapaintingservices.com`; then add to Firebase Authorized domains + key referrers);
calendar .ics worker; App Check and security to-dos (email-enumeration protection, 8+ char passwords, budget alert);
fresh security review of Google/delete-company/trades changes; recurring services; more trades (HVAC, appliance,
general contractor, window cleaning, pest control); automatic invite emails (e.g. Resend; today the Firebase
verification email may land in spam); landing page + terms/privacy before selling; update docs for the trade model.
