# 02 · Components (build these first, reuse everywhere)

Prototype CSS classes in brackets — search them in /prototype/index.html for exact rules.

## Buttons [.btn, .btn.pri, .btn.v4-cta, .btn.danger, .btn.sm, .btn.wa]
- Height 38 (sm 32), radius 10, font 14/500, padding 0 14.
- Primary: bg --primary-btn, white text, 600. Hover #262A33.
- Secondary: white bg, 1px --line, text --ink, shadow-xs. Hover --surface-2.
- Danger: white bg, red text, border #FEE4E2. WhatsApp: #12B76A solid.
- Icon + label gap 8. Disabled opacity .55.

## Inputs [input, select, textarea]
Height 40, radius 10, 1px --line, focus border #9DBBFF + --focus-ring. Label above: 13/600 --ink-2.

## Card [.card, .card-h, .card-b]
Radius 16, 1px --line, white. Header 16×24 with title left, actions right, bottom border --line-2.

## KPI card [.kcard, .kh, .kic, .kv, .kd .dp]
Icon tile 32×32 radius 10 (soft color) + title 13.5/500 · period select (borderless pill, 12.5) ·
value 30/600 · delta pill (up: #ECFDF3/#067647, down: #FEF3F2/#B42318) + "from previous period".
Component ready: /components/KpiCard.tsx.

## Segmented tabs [.v4-subtabs]
Track #EDEFF2 radius 12 padding 4; tab 7×14 radius 9, 500 --ink-2; active = white chip, 600, shadow 0 1px 3px.

## Badge [.badge] → /src/ui/Badge.tsx (idea from shadcn/ui Badge)
One pill for the whole app. variant: default (dark) | secondary | destructive | outline | ghost | link | overlay (on photos);
tone (soft colors, wins): gray | blue | purple | green | teal | red | amber | acc. dot (status dot, estimate statuses keep it),
icon / iconEnd (design/icons names), spinner (in progress), size sm. to / href / onClick make it clickable (focus ring).
StatusBadge, RoleBadge, InvBadge use it. Dark mode has its own tints (--tile-* / --icon-* / --up-* / --down-* in html.tw-dark).

## Checkbox [input type=checkbox] (idea from shadcn/ui Checkbox)
Every checkbox: 18px rounded square (radius 5), filled with a check when on (base.css, :where() so pages can resize it).
Containers color it with --chk (fill) and --chk-ink (check): checklists green (--ok), chat members accent. Indeterminate,
disabled and focus ring supported.

## Pills / chips [.pill, .badge, .dep-chip, .exp-cat]
Radius 999. Pill on = black bg white text. Status badges: soft bg + dot. Category chips colored by category.

## Sidebar [.v4-sb]
White, border-right 1px --line. Top: TradeWorks logo 34px + "TradeWorks" 18/700 + subtitle.
Workspace chip (company logo + name) → settings. "+ New estimate" black button full width.
Section labels WORK / BUSINESS. Items: icon 20 + label 14/500, radius 10, hover --surface-2.
**Active item: black gradient block (--active-nav), white text/icon, shadow.** Count badges blue pills.
Footer: cloud status chip, EN/ES switch, user avatar + name + email.
**Fold to icons** (desktop, idea from shadcn/ui sidebar-07): panel button next to the logo, or Ctrl/Cmd+B. The sidebar
becomes a 72px rail (--sidebar-mini): icons only, section labels turn into thin dividers, badges sit on the icon corner,
names show as a dark tooltip beside the icon on hover / focus, the company list opens beside the rail. Remembered per
device (localStorage tw.sbMini, useUi().sbMini). Phones keep the bottom bar.

## Mobile shell [.v4-mtop, .v4-bnav, .v4-more]
Top bar 56: logo + name, cloud chip, EN/ES, "+ New". Bottom nav 64: Home, Pipeline, Calendar, Estimates,
Invoices, More (sheet with Clients, Expenses, Reports, Team, Settings). Active = ink label, blue icon.

## Line chart [.lc] → /components/LineChart.tsx
Monotone cubic curve (no overshoot), main series blue with vertical gradient fill (22% → 0%),
comparison series gray dashed. Dashed horizontal grid (5 lines), y labels left (short money), x labels
below (month short). Hover/tap: vertical band (blue 14% → 0), white dot with 3px colored ring,
tooltip card (white, radius 10, shadow-pop) with month + value per series. Optional click → select month.

## Attachment [.att] → /components/Attachment.tsx (port of shadcn/ui Attachment)
Card with media (40px icon box or photo), title + description, small icon actions, optional full-card trigger.
Props: state idle|uploading|processing|error|done (uploading/processing shimmer the title, error = red border/tint),
size default|sm|xs, orientation horizontal|vertical (photo on top, 150px wide), progress 0..1 (2px bar).
AttachmentGroup = horizontal snapping row with an edge fade. Upload queue (progress, retry): /components/UploadQueue.tsx.
Photo viewer: /components/Lightbox.tsx.

## List row [.owe] (e.g. Still to collect, client jobs)
Border 1px --line radius 12, padding 9×10: avatar 32 (initials, soft color) · name 13.5/600 + meta 12 ·
amount 600 · chevron. Hover --surface-2.

## Estimate card (phone) [.ec]
Radius 14: name (15/600, ellipsis) + total right; meta line (number · date · job type) + status badge right.

## Empty state [.es]
Icon tile 56 (radius 16, --acc-soft / --acc) · title 17/600 · text 14 --ink-3 max 380 · buttons row.

## Modal [.modal-card]
Radius 18, header with title + Close, body padding 24. Wide variant 980px. On phones becomes a bottom sheet.

## Confirm window [.ask] → /src/ui/confirm.tsx (idea from shadcn Alert Dialog)
`if (!(await ask(t("Delete this note?", "¿Borrar esta nota?")))) return;` instead of the browser confirm(). The question is the title,
the rest the explanation (src/lib/confirmText.ts). Delete / remove / clear… get a red button, with focus on Cancel. The button says the
question's verb (Delete, Quitar…) unless `ok` is given. Esc or the backdrop = Cancel. Phones: bottom sheet. Mounted once in main.tsx (ConfirmHost).

## Toast [.tw-toast] → /src/ui/Toaster.tsx (idea from shadcn Sonner)
`toast(text, { undo?, kind? })`: icon (green check; red ! for errors, detected from the text), close X, optional "Undo" (6 s, else 3 s).
Undo is offered after deleting a note, task, worker hours or payment (the record is saved back). Desktop bottom-right, phones above the bar.

## Switch [input.sw] (idea from shadcn Switch)
`<input type="checkbox" role="switch" className="sw">` for on / off settings: deposit at signing, automatic reminders, referrals,
card payments, calendar link, discount active. Green when on (--chk overrides).

## Phone input → /src/ui/PhoneInput.tsx (idea from shadcn studio Phone Input)
US numbers become (555) 010-2030 while typing at the end, and when leaving the field (src/lib/phone.ts). +52…, extensions and long
numbers are left as typed. Used for every phone field: clients, estimate, onboarding, company, workers, new lead, lead form.

## Drawer [.drawer] → /src/ui/Drawer.tsx
Panel from the right, up to 1120px wide (full screen on phones), header with title + subtitle + X, body scrolls. Escape or a
click on the backdrop closes it; the page behind does not scroll. Used by the invoice preview.

## Quick create + Search → /src/layout/QuickActions.tsx
Sidebar: "New estimate" + a chevron button that opens the Create menu (New estimate / client / task / expense / note; each page opens its
form from ?new=1 via src/ui/useUrlFlag.ts). Below it a "Search… Ctrl K" field. Folded sidebar: only the + and a search icon.
Phone top bar: search icon + "New" (bottom sheet with the same menu). Search window (Ctrl/Cmd+K anywhere, owners / admins):
pages & actions, clients, estimates, invoices (opens the invoice preview via ?open=), notes (opens the note); ↑ ↓ Enter, Esc.
Matching in src/lib/search.ts (accents ignored, phone numbers by digits, every word must match).

## Onboarding [.onb]
Centered card 560px radius 20, 5 progress dashes, steps: Welcome (language) → Business (logo, name,
phone, email, website, area) → Trade → Prices (door, drawer, deposit %) → Done (first estimate / sample).
"I already have an account" on step 1, "Skip setup" top-right.

## Goal bar [.goal]
Card with "September goal · $7,510 of $15,000 · 50% · N days left · Edit" + progress bar.

## Toast
Bottom-center, black, white text, 2.4s.
