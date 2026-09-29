# 05 · Business logic — port these from /prototype/index.html

Search each function name in the prototype and port it to a pure TypeScript module (src/lib/…) with unit tests.
The outputs must match the prototype to the cent.

## Estimates — src/lib/estimate.ts
| Prototype | What it does |
|---|---|
| calcEstimate(e) | subtotal from cabinet doors/drawers/frames/boxes (frameMode/boxMode), items (qty×rate, hidden lines included), upgrades included; discount (code %/fixed, CASH3 3%, manual); tax optional; total; deposit (depositPct or payPlan[0]); balance |
| calcMaterials(e) | primer/paint gallons from cabinet sqft + wall sqft, buy quantities, supply lines by basis, costs; `matBuyer` = me / paint / client zeroes costs but keeps gallons |
| jobHours(e), crewCost(e,h), laborModeFor(e) | production hours from rates per piece + extra hours; crew cost when laborMode = crew |
| JOB_TYPES, typePreset, applyTypePreset, typePresetDefaults | job types cabinets / interior / exterior / other with spec, days, scope, terms, services line |
| servicesLine(e, lang), jobWhat(e), jobDetail(e) | text helpers for documents and lists |
| nl2list, nlSentences, isScopeHead, scopeGroups, SCOPE_DAY_RE | scope text → structured days/sections/bullets |
| estimateSheet, invoiceSheet | client document layout (EN/ES), compact mode |
| checklistFor(e) | Job day checklist: from the estimate's scope groups (Day N titles + bullets), plus e.jobTasks; e.check keyed by stable hash |
| shoppingText(e) | shopping list from calcMaterials + colors |

## Money — src/lib/money.ts
| Prototype | What it does |
|---|---|
| jobExpenses(e) | legacy e.expenses + ledger materials with estId |
| jobCosts(e) | price, paid (paid invoices), materials, other job expenses, labor (hours×rate), profit, margin, plannedMat |
| plFor(bounds) | P&L: income = invoices Paid by paidDate; expenses = all ledger rows + legacy + team payouts by category |
| marketingFor(bounds) | per source: spend (ads+leads categories), leads (unique clients from estimates + lead-only clients), won, revenue |
| wonSummary(kind), closeStats(kind) | Money tab numbers |
| KPI_LIB, kpiValue(id,b), periodPair(p), kpiSeries(id) | KPI definitions, periods (month, last month, YTD, last year) and previous-period comparison |
| insightsHTML logic | charts tab: years with data, month buckets by estimate date, funnel, price bands (PRICE_BANDS), by source, by job type, days to sign |
| exportCSV(kind) | CSVs: expenses, P&L by month, income, profit by job, team payments (UTF-8 BOM) |

## Follow-ups — src/lib/followups.ts
followUpsV4(): lead waiting (≥1 day), chat unread, not opened (sent ≥ followUpDays), viewed not signed,
no answer, deposit due (Accepted), **payclaim** (client says Zelle sent), **balance** (Deposit Paid and job
ended), change orders unsigned, **review** (Paid in Full), **warranty** (≥330 days after job, after review).
Sorted by urgency; show 5 + "Show all". Messages: fillTemplate(template, estimate, lang) with {client}
{number} {total} {deposit} {balance} {start} {business} {phone}; review adds reviewUrl; noview/viewed add the client link.
Snooze per key. openedText(n, when) wording ("opened once/twice/N times").

## Client link — src/lib/portal.ts
portalSnapshot(e) (strip private fields: PORTAL_STRIP), portalApply(doc) (views, picks → upgrades
included/byClient, chat, signature → Accepted + activity, change-order signatures, **paid claim**),
seen-state per estimate to avoid duplicate activity; portal page never writes owner data.

## Leads — src/lib/leads.ts
lead.html questionnaire payload; webLeadImport (deterministic client id "c-web-{leadId}", photos,
source = Referral if details.ref else details.src else "Website (heard)", referredBy), leadSummary(details, lang),
suggestTypeFor(client). Import marks lead imported; cleanup deletes photos then lead after 60s.

## Expenses — src/lib/expenses.ts
EXP_CATS, runRecurring() (id "rec-{recurId}-{YYYY-MM}" so devices never duplicate), bank import:
parseCSV, parseBankDate, parseMoney, column detection (date/desc/amount or debit/credit), sign detection,
bankGuess (learned rules first, then BANK_GUESS regex), cleanVendor, bankFp (duplicate fingerprint),
learning rules on import.

## Team — src/lib/team.ts
workerStats(w,b) (hours, earned, paid, owed all-time), hourAmount (rate stored on the entry),
clock in/out → hours rounded to 0.25 h on the job scheduled that day.

## Calendar — src/lib/calendar.ts + Cloudflare Worker
jobDates(e), jobsOn(day), icsCalendar(events), calendarEvents() (jobs all-day with VALARM 8 PM day before,
tasks timed −60 min), gcalLink(ev). Worker code: CAL_WORKER_CODE in prototype.

## Other
goalHTML (monthly sales goal), refLink(client) ("?src=referral&ref={clientId}"), needsOnboarding,
applyTheme (light/dark/auto), storage move (not needed in React — Firestore offline cache).
