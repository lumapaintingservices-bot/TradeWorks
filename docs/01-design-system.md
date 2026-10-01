# 01 · Design system

All values live in /design/tokens.css and /design/tokens.ts. Reference screenshots: /prototype/screenshots.

## Principles
- Light, calm, minimal (references: Houzz Pro, Intuit Enterprise, Fundora/Salezy dashboards).
- Solid colors; one blue accent (#1E6BFF) for charts, links, focus and badges.
- Primary actions are **solid black** buttons; secondary are white with a 1px border.
- Cards are white, radius 16, 1px border #ECEEF2, **no heavy shadows**. Page background #F5F6F8.
- Numbers are big and semibold (tabular numerals). Changes vs previous period as green/red pills.
- Bilingual: never hard-code UI text — use the i18n dictionary (EN/ES).

## Color
| Token | Light | Dark | Use |
|---|---|---|---|
| --bg | #F5F6F8 | #0B0D12 | page background |
| --surface | #FFFFFF | #14171E | cards, sidebar, inputs |
| --surface-2 | #F7F8FA | #1A1E27 | table headers, hover, chips |
| --ink / --ink-2 / --ink-3 | #0B0D12 / #4B5263 / #9097A3 | #F2F4F7 / #C3C8D1 / #7F8795 | text levels |
| --line / --line-2 | #ECEEF2 / #F3F4F6 | #252B36 / #1C212A | borders, dividers |
| --acc | #1E6BFF | #4C8DFF | accent: charts, links, focus, badges |
| --ok / --bad / --warn | #12B76A / #F04438 / #F79009 | same | states |
| primary button | #0B0D12 bg, white text | #F2F4F7 bg, black text | |
KPI icon tiles: soft bg + saturated icon (blue, green, purple, orange, pink, red, teal, amber) — see tokens.
Client-facing brand color: company.brandColor (default #EF6A2C, LUMA orange).

## Typography (Figtree)
| Role | Size / weight |
|---|---|
| Page title (h1) | 24 / 600, letter-spacing -0.025em |
| Card title (h2/h3) | 15 / 600 |
| Body | 14 / 400–500 |
| Secondary / meta | 12.5 / 400, --ink-3 |
| Table header | 12.5 / 500, sentence case, --ink-3, bg --surface-2 |
| KPI value | 28–30 / 600 (24 on phones), tabular numbers |
| Section label (sidebar) | 11 / 600 uppercase, letter-spacing .07em, --ink-3 |

## Spacing — 4-pt scale
4 · 8 · 12 · 16 · 24 · 32. Page padding 32 desktop / 16 phone. Card header 16×24, card body 24 (16 on phone).
Grid gaps 16. Table cells 12×16.

## Radius
Buttons/inputs 10 · chips 999 · cards 16 · modals 18 · small tiles 10–12.

## Elevation
Flat. Only popovers/tooltips (--shadow-pop) and modals (--shadow-modal) cast shadows.

## Motion
120–220 ms ease for hover/tooltips/sheets; respect prefers-reduced-motion.

## Layout
- Desktop ≥900px: fixed white sidebar 260px + content max 1240px.
- Phone ≤640px: top bar (logo + language + "+ New"), content, bottom nav 5 items + "More" sheet.
- Tables → cards on phones. Charts keep full width; hide every other x-label on phones.

## Dark mode
html.tw-dark swaps tokens (see tokens.css). Documents and client pages stay light.
