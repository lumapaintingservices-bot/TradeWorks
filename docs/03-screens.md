# 03 · Screens (see /prototype/screenshots and the running prototype)

Open /prototype/index.html in Chrome, pick a language, choose "Explore with a sample job" to see real data.

## Dashboard (route /)
Segmented tabs: **Overview · Today · Money · Charts · Where clients come from**.
- **Overview** (default): Monthly goal bar → "Your business at a glance" + Customize → 4 KPI cards
  (default: Job profit margin, Net profit, Sales won, Backlog; each with its own period) → row:
  **Money in** line chart (12 months, money out dashed) 1.7fr | **Still to collect** list 1fr →
  row of 4: Profit & loss (period select, income/expense bars, delta) · Cash this month · Invoices
  (unpaid overdue/not due, paid last 30 days) · Shortcuts. Welcome card when no estimates.
  **Customize** opens the KPI library: 14 KPIs with 6-month sparklines, add/remove, reset.
- **Today**: upcoming jobs table, business flow tiles, job status, where clients come from,
  "Who to write to today" (5 most urgent + Show all), activity feed, to-do.
- **Money**: won / collected / still to collect by job date + Money in / Money out / Net profit / Margin
  by payment date + close rate & average bid.
- **Charts**: year pills (every year with data, last 12 months, all years), KPI tiles (close rate,
  won with ▲▼ vs same period last year, days to sign, declined), month-by-month line chart
  (won vs quoted; click a month → job list), funnel, close rate by price band, by lead source, by job type.

## Pipeline (/pipeline)
Columns: Leads (clients without estimates) → Draft → Sent → Viewed → Accepted → Deposit paid → Paid.
Lead card: name, days, phone/source, questionnaire summary, message, WhatsApp / Estimate / ✕.
"Removed leads (N)" → modal with Put back / Delete / Delete all. "+ New lead".

## Calendar (/calendar)
Month grid: jobs span startDate..+days (drafts dotted), tasks. Day panel: job status, Move to, Take off,
**+ Google / + Outlook/Apple**, Open. Tasks can be assigned to workers.

## Estimates (/estimates)
Search, status filter, job-type filter, count + total. Desktop table (number, client+address, date,
job type + detail, status, total). Phone: cards. Empty state.
**New estimate** → job-type picker (Kitchen cabinets, Interior, Exterior, Other) + saved templates;
lead's requested type is highlighted.

## Estimate editor (/estimates/:id)
Header: number, status, saved time, actions (All estimates, Work order, Save as template, Duplicate, Delete).
Top tiles: client price, your hours, materials, what you keep, earn per hour.
Left column: Client, Schedule & source, Totals. Right tabs:
- **Pricing**: job type pills, cabinet block (doors, drawers, frames/boxes modes, spec EN/ES) or
  "Project spec" + "+ Add cabinet work" for other types; other work lines (room calculator, service
  catalog, hide-from-client lines); upgrades/options; discount (codes, Cash/Zelle 3%) & tax; payment plan.
- **Scope & notes**: scope EN/ES (Day 1–5 headings), terms EN/ES, notes, "Make standard", reset.
- **Costs & profit**: production hours, materials & margin (who buys materials: me / client paint / client all),
  **Real profit** card (price − receipts − team hours − other), material expenses.
- **Change orders**, **Invoices** (deposit + balance), **Link & chat** (client link, views, activity, chat),
  **Photos** (before/after/detail, captions, show on link), **Job day** (checklist built from this
  estimate's scope by day + custom tasks per day, colors & products table, shopping list, send after
  photos to "Our recent work").
Client document: /doc print view EN/ES, compact mode, signature.

## Client link (public, /p/:token)
Sticky nav (Options, Summary, Photos, Sign, Questions) with active state; hero with totals; options
with live total; summary; what's included (structured by day); photos; our recent work; website/IG/reviews;
full document; accept & sign (name + finger signature); **after signing: Zelle deposit box** (amount,
Zelle address + copy, "I sent the Zelle"); chat; sticky "Total · Review & sign" bar on phones.
Contractor branding, EN/ES switch, "Powered by TradeWorks".

## Lead form (public, /request?src=thumbtack&ref=...)
7 steps: intro → project types (multi) → details per type (cabinet door/drawer counters or "count for me",
island, style, current finish, extras; interior rooms/surfaces/size; exterior stories/surfaces; other text)
→ finish tier (with the contractor's products) → timing (+ date) → photos (5) → contact (+ preferred
channel, source) with summary → thank-you (call, WhatsApp, website, Instagram, reviews).

## Invoices, Clients, Client profile
Invoices list + document. Clients table (inline edit) → **profile**: header with WhatsApp/Call/New estimate,
tiles (jobs, won, paid, owes), jobs list, notes, referral link (+ referred clients), colors used, photos.

## Expenses (/expenses)
Range pills, tiles (spent incl. team, materials, ads & leads, everything else), search + category,
table with receipt clip. New expense modal (amount, date, vendor autocomplete, category pills,
source for ads/leads, job, paid with, note, receipt photo, repeats monthly). Recurring manager.
**Bank CSV import**: column + sign detection, auto categories + learned rules, duplicates unchecked.

## Reports (/reports)
Tabs P&L · Profit by job · Marketing return · Export; year pills. P&L: tiles, line chart in vs out,
statement, where the money went. Profit by job: "All jobs" (actual vs estimate bars, margin) + details.
Marketing: spend, leads, cost per lead, cost per job, return per $1. Export CSVs.

## Team (/team)
Range pills; tiles (hours, labor cost, paid, owed); workers table (rate, hours, earned, paid, owed,
**clock in/out**, pay, WhatsApp, edit); hours log; labor by job (logged vs planned); payments; assigned tasks.

## Settings
Appearance (light/dark/auto), storage meter, calendar link, job types (services line, spec, days, scope,
terms per type), client link (web address, reviews, website, Instagram, **Zelle + name + note**,
showcase photos, request-form links incl. Thumbtack), business info & logo, pricing, discounts,
message templates, production rates, lead sources, backup/export, cloud account.
