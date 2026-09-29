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
