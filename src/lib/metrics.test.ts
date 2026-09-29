import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { blankEstimate } from "./estimate";
import { money } from "./money";
import { defaultSettings } from "./settings";
import { SERVICES } from "./services.data";
import { STATUSES } from "./types";
import type { Client, Estimate, Expense, HourEntry, Invoice, Payout, Worker } from "./types";
import {
  KPI_LIB, PRICE_BANDS, allJobsRows, bandLabel, cashThisMonth, closeStats, csvCell, csvFileName, csvText, exportCsv, goalProgress, incomeRows, insightMonthJobs, insights,
  invoiceSummary, jobCosts, kpiFormat, kpiRaw, kpiSeries, kpiValue, marketingFor, marketingRows, moneySeries, netProfit, periodPair, plBreakdown, plCompare, plFor, plSeries,
  profitByJob, reportYears, stillToCollect, wonRangeBounds, wonSummary, type Bounds, type CsvKind, type Ctx, type Period,
} from "./metrics";

/* ---------------------------------------------------------------- run the prototype's own functions on the same inputs */
const proto = readFileSync(new URL("../../prototype/index.html", import.meta.url), "utf8");
function fn(name: string): string {
  const i = proto.indexOf(`function ${name}(`);
  if (i < 0) throw new Error("prototype function not found: " + name);
  let j = proto.indexOf("{", i), d = 0;
  for (;; j++) { if (proto[j] === "{") d++; if (proto[j] === "}" && !--d) break; }
  return proto.slice(i, j + 1);
}
function decl(name: string): string {
  const i = proto.indexOf(`var ${name} =`);
  if (i < 0) throw new Error("prototype var not found: " + name);
  let d = 0, j = i;
  for (; j < proto.length; j++) {
    const ch = proto[j];
    if ("[{(".includes(ch)) d++; else if ("]})".includes(ch)) d--; else if (ch === ";" && d === 0) break;
  }
  return proto.slice(i, j + 1);
}
/** Source text between two markers of the prototype (used to run a block that lives inside a big HTML function). */
function between(from: string, to: string, start = 0): string {
  const i = proto.indexOf(from, start), j = proto.indexOf(to, i);
  if (i < 0 || j < 0) throw new Error("markers not found: " + from);
  return proto.slice(i, j);
}
const FUNCS = ["num", "r2", "money", "findDiscount", "payPlanOn", "calcEstimate", "frameUnits", "boxUnits", "itemSqft", "otherSqft", "jobSqft", "calcMaterials", "svcById", "prodP", "jobHours",
  "laborModeFor", "crewCost", "coSignedTotal", "jobExpenses", "actualMaterials", "addDaysISO", "daysBetween", "byId", "invOrder", "invoicesFor", "jobStatus", "nameOf", "jobRefDate",
  "rangeBounds", "wonSummary", "closeStats", "jobTypeOf", "jobTypeLabel", "expCats", "expCatLabel", "isMarketingCat", "liveExpenses", "allExpenseRows", "expInRange", "inBounds",
  "workerById", "liveHours", "livePays", "hourAmount", "jobCosts", "incomeRows", "plFor", "marketingFor", "csvCell", "downloadCSV", "exportCSV", "monthStart", "addMonths", "lastDay",
  "periodPair", "kpiValue", "kpiDef", "kpiFmt", "kpiCardHTML", "kpiSeries", "monthSeries", "bandLabel", "shortMoney", "insightsHTML", "goalHTML", "allJobsHTML"];
const VARS = ["WON_ST", "JOB_TYPES", "EXP_CATS", "KPI_LIB", "KPI_PERIODS", "PRICE_BANDS"];

type Any = Record<string, any>;
type Data = {
  estimates: Estimate[]; invoices: Invoice[]; expenses: Expense[]; payouts: Payout[]; hours: HourEntry[]; workers: Worker[]; clients: Client[];
};
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A fresh prototype VM for one dataset + one "today" + one UI language. */
function protoVm(data: Data, settings: ReturnType<typeof defaultSettings>, today: string, goal = 0, lang: "en" | "es" = "en") {
  const DB: Any = {
    ...clone(settings), services: SERVICES, estimates: clone(data.estimates), clients: clone(data.clients), expenses: clone(data.expenses).map((x: Any) => ({ ...x, receiptId: x.receiptUrl ? "r-" + x.id : "" })),
    payouts: clone(data.payouts), hours: clone(data.hours), workers: clone(data.workers), goal: { sales: goal },
    invoices: clone(data.invoices).map((v: Any) => ({ ...v, estimateId: v.estId })), expCats: settings.expCats || [],
  };
  const csv: { name?: string; text?: string } = {}, charts: Any[] = [];
  const ctx: Any = {
    DB, VIEW: {}, UI_LANG: lang, TT: (a: string, b: string) => (lang === "es" ? b : a), T: (a: string) => a, todayISO: () => today,
    v4Defaults: () => ({ production: settings.production }), esc: (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
    lineChartHTML: (o: Any) => { charts.push(o); return ""; }, monthDetailHTML: () => "", badge: () => "", kpiIcon: () => "", jobTypeLabelHTML: () => "", toast: () => {},
    fmtDate: (x: string) => x, ico: () => "", dashCards: () => [],
    Blob: class { constructor(p: string[]) { csv.text = p[0]; } }, URL: { createObjectURL: () => "", revokeObjectURL: () => {} }, setTimeout: () => 0,
    document: { createElement: () => ({ click() {}, remove() {}, set download(v: string) { csv.name = v; } }), body: { appendChild() {} } },
    Infinity,
  };
  runInNewContext(VARS.map(decl).join("\n") + "\n" + FUNCS.map(fn).join("\n") + ";" + FUNCS.map((n) => `this.${n}=${n};`).join(""), ctx);
  return { ctx, DB, csv, charts };
}
const asCtx = (data: Data, settings: ReturnType<typeof defaultSettings>, now: Date, lang: "en" | "es" = "en"): Ctx => ({ ...clone(data), settings, now, lang });

/* ---------------------------------------------------------------- deterministic data */
const NAMES = ["Ana Ruiz", "Ben Carter", "Carla Gómez", "Dan O'Neil", "Eva Long", "Frank Diaz", "Gina Park", "Hugo Lee"];
const SOURCES = ["", "Google", "Thumbtack", "Referral", "Website (Google)", "Facebook", "Nextdoor"];
const CATS = ["materials", "materials", "labor", "ads", "leads", "fuel", "tools", "insurance", "software", "office", "other", "custom1"];
function sample(seed: number): { data: Data; settings: ReturnType<typeof defaultSettings> } {
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const settings = defaultSettings();
  settings.expCats = [{ id: "custom1", name: "Dumpster" }];
  const day = (y0 = 2024, y1 = 2026) => { const y = y0 + Math.floor(r() * (y1 - y0 + 1)); return `${y}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`; };
  const workers: Worker[] = [{ id: "w1", name: "Ana", rate: 22.5 }, { id: "w2", name: "Beto", rate: 18.75 }, { id: "w3", name: "Chuy", rate: 31.33, active: false }];
  const clients: Client[] = NAMES.map((n, i) => ({
    id: "c" + i, name: n, phone: "", email: "", address: "", source: pick(SOURCES), lang: "en", note: "", createdAt: day(2025, 2026) + "T10:00:00.000Z",
    ...(i === 7 ? { deleted: true } : {}),
  } as Client));
  const estimates: Estimate[] = [];
  const n = 14 + Math.floor(r() * 16);
  for (let i = 0; i < n; i++) {
    const e = blankEstimate(settings, "EST-" + (i + 1));
    e.id = "e" + i; e.date = day(); e.status = pick([...STATUSES]);
    const cl = i % 9 === 8 ? null : pick(clients); e.clientId = cl ? cl.id : ""; e.clientName = cl ? "" : pick(NAMES);
    e.leadSource = pick(SOURCES); e.jobType = pick(["cabinets", "cabinets", "interior", "exterior", "other"] as const);
    e.doors = Math.floor(r() * 45); e.drawers = Math.floor(r() * 25); e.frames = Math.floor(r() * 10); e.boxes = Math.floor(r() * 10);
    e.frameMode = pick(["included", "separate", "none"] as const); e.boxMode = pick(["included", "separate", "none"] as const);
    e.items = r() > 0.6 ? [{ id: "i", desc: "Walls", descEs: "", qty: Math.round(r() * 3000) / 3, unit: "sqft", rate: 1.85, svc: "walls" }] : [];
    e.discountMode = pick(["", "code", "manual"] as const); e.discountCode = "CASH3"; e.manualType = "fixed"; e.manualValue = Math.round(r() * 150);
    e.taxEnabled = r() > 0.7; e.matBuyer = pick(["me", "me", "paint", "client"] as const); e.laborMode = pick(["solo", "crew", undefined]);
    if (r() > 0.4) { e.startDate = day(2025, 2026); e.days = 1 + Math.floor(r() * 6); }
    if (r() > 0.5) e.sentAt = e.date + "T09:00:00.000Z";
    if (r() > 0.5) e.signature = { name: "x", img: "", date: e.date.slice(0, 8) + String(Math.min(28, 1 + Number(e.date.slice(8)) + Math.floor(r() * 12))).padStart(2, "0"), via: "link", at: "" };
    if (r() > 0.5) e.portalViews = ["2026-01-01"]; else if (r() > 0.7) e.portalSeen = { views: 2, picks: "", sign: false };
    if (r() > 0.7) e.actualMaterialCost = Math.round(r() * 50000) / 100;
    if (r() > 0.75) e.changeOrders = [{ n: 1, amount: Math.round(r() * 90000) / 100, status: pick(["signed", "pending"]) }];
    if (r() > 0.75) (e as unknown as Any).expenses = [{ id: "x" + i, amount: Math.round(r() * 30000) / 100, desc: r() > 0.5 ? "Paint" : "", date: r() > 0.5 ? e.date : "" }, { id: "y" + i, amount: 0 }];
    estimates.push(e);
  }
  const invoices: Invoice[] = [];
  estimates.forEach((e, i) => {
    if (r() < 0.55) return;
    const k = r(), kinds: Invoice["kind"][] = k < 0.5 ? ["deposit", "balance"] : k < 0.8 ? ["deposit"] : ["deposit", "balance", "co"];
    kinds.forEach((kind, j) => {
      const paid = r() > 0.45, d = day(2025, 2026);
      invoices.push({ id: `v${i}-${j}`, number: `INV-${i}${j}`, estId: e.id, kind, amount: Math.round((100 + r() * 4000) * 100) / 100, date: d,
        status: r() > 0.93 ? ("Draft" as never) : paid ? "Paid" : "Unpaid", ...(paid ? { paidDate: r() > 0.2 ? day(2025, 2026) : undefined } : {}),
        estNumber: e.number, clientName: pick(NAMES) } as Invoice);
    });
  });
  const expenses: Expense[] = [];
  for (let i = 0; i < 40; i++) expenses.push({
    id: "x" + i, date: day(), vendor: pick(["Home Depot", "Sherwin", "Google Ads", "Shell"]), amount: Math.round(r() * 60000) / 100, category: pick(CATS), source: r() > 0.5 ? pick(["Google", "Thumbtack", "Facebook"]) : "",
    method: pick(["Card", "Cash", ""]), note: r() > 0.7 ? 'has, "quotes"' : "", ...(r() > 0.5 ? { estId: pick(estimates).id } : {}), ...(r() > 0.7 ? { receiptUrl: "u" } : {}), ...(i % 13 === 0 ? { deleted: true } : {}),
  } as Expense);
  const hours: HourEntry[] = [];
  for (let i = 0; i < 30; i++) {
    const h: Any = { id: "h" + i, workerId: pick(workers).id, date: day(), hours: Math.round(r() * 40) / 4 + 0.25, estId: r() > 0.4 ? pick(estimates).id : "" };
    const k = r(); if (k < 0.6) h.rate = Math.round(r() * 4000) / 100; else if (k < 0.8) h.rate = "";
    if (i % 11 === 0) h.deleted = true;
    hours.push(h as HourEntry);
  }
  const payouts: Payout[] = [];
  for (let i = 0; i < 10; i++) payouts.push({ id: "p" + i, workerId: pick([...workers.map((w) => w.id), "gone"]), date: day(), amount: Math.round(r() * 90000) / 100, method: pick(["Cash", "Zelle", ""]), note: r() > 0.5 ? "wk" : "", ...(i === 4 ? { deleted: true } : {}) } as Payout);
  return { data: { estimates, invoices, expenses, payouts, hours, workers, clients }, settings };
}

const NOWS: [string, Date][] = [
  ["2026-09-29", new Date(2026, 8, 29, 10, 30)], ["2026-01-15", new Date(2026, 0, 15, 8)], ["2026-03-31", new Date(2026, 2, 31, 23)], ["2026-12-31", new Date(2026, 11, 31, 12)],
  ["2026-02-28", new Date(2026, 1, 28, 9)], ["2027-01-01", new Date(2027, 0, 1, 9)],
];
const BOUNDS: Bounds[] = [
  { from: "", to: "" }, { from: "2026-01-01", to: "2026-12-31" }, { from: "2025-01-01", to: "2025-12-31" }, { from: "2026-09-01", to: "2026-09-31" }, { from: "2026-03-05", to: "2026-08-19" }, { from: "2024-01-01", to: "2024-06-30" },
];
const PERIODS: Period[] = ["month", "lastmonth", "ytd", "lastyear"];
const SEEDS = Array.from({ length: 12 }, (_, i) => (i + 1) * 7919);

/* ================================================================= parity */
describe("parity with the prototype: job costs, P&L, marketing, money tab", () => {
  for (const seed of SEEDS) it(`dataset ${seed}`, () => {
    const { data, settings } = sample(seed);
    for (const [today, now] of NOWS.slice(0, 3)) {
      const { ctx: p } = protoVm(data, settings, today), c = asCtx(data, settings, now);
      for (const e of c.estimates) {
        const a = jobCosts(c, e), b = p.jobCosts(clone(e));
        expect(a, e.id).toEqual(b);
      }
      for (const b of BOUNDS) {
        const a = plFor(c, b), x = p.plFor(b);
        expect(a).toEqual(x);
        expect(marketingFor(c, b)).toEqual(x && p.marketingFor(b));
        expect(incomeRows(c, b).map((r) => [r.date, r.amount, r.v.id])).toEqual(p.incomeRows(b).map((r: Any) => [r.date, r.amount, r.v.id]));
      }
      for (const kind of ["month", "year", "all"]) {
        const ws = wonSummary(c, kind), pw = p.wonSummary(kind);
        expect({ ...ws, list: ws.list.map((x) => [x.e.id, x.st, x.total, x.paid, x.due, x.mat]) })
          .toEqual({ ...pw, list: pw.list.map((x: Any) => [x.e.id, x.st, x.total, x.paid, x.due, x.mat]) });
        expect(closeStats(c, kind)).toEqual(p.closeStats(kind));
        expect(wonRangeBounds(kind, now)).toEqual(p.rangeBounds(kind));
        const pl = p.plFor(p.rangeBounds(kind)), mat = pl.cats.materials || 0, team = pl.cats.team || 0;
        expect(netProfit(c, kind)).toEqual({ income: pl.income, expenses: pl.expenses, profit: pl.profit, margin: pl.margin, materials: mat, team, other: p.r2(pl.expenses - mat - team) });
      }
    }
  });
});

describe("parity with the prototype: periods, KPIs, series", () => {
  for (const seed of SEEDS) it(`dataset ${seed}`, () => {
    const { data, settings } = sample(seed);
    for (const [today, now] of NOWS) {
      for (const lang of ["en", "es"] as const) {
        const { ctx: p } = protoVm(data, settings, today, 0, lang), c = asCtx(data, settings, now, lang);
        for (const per of PERIODS) {
          const pp = periodPair(per, now), xp = p.periodPair(per);
          expect(pp).toEqual(xp);
          if (lang !== "en") continue;
          for (const k of KPI_LIB) {
            const res = kpiValue(c, k.id, per);
            const a = p.kpiValue(k.id, xp[0]);
            expect(res.value, `${k.id} ${per}`).toEqual(a);
            expect(kpiRaw(c, k.id, xp[0])).toEqual(a);
            expect(res.prev).toEqual(k.asOfToday ? null : p.kpiValue(k.id, xp[1]));
            // the card the prototype draws: value text and delta pill
            const html: string = p.kpiCardHTML({ id: k.id, p: per }, 0);
            expect(html.match(/<div class="kv">(.*?)<\/div>/)![1]).toBe(kpiFormat(k, res.value, money));
            const dp = html.match(/<span class="dp (up|down)">(.*?)<\/span>/);
            if (res.delta === null) expect(dp, `${k.id} ${per} no delta`).toBeNull();
            else {
              const shown = `${res.delta >= 0 ? "↑ " : "↓ "}${Math.abs(res.delta).toFixed(res.deltaIsPoints ? 1 : 0)}${res.deltaIsPoints ? " pts" : "%"}`;
              expect(dp![2]).toBe(shown);
              expect(dp![1]).toBe(res.good ? "up" : "down");
            }
          }
        }
        for (const k of KPI_LIB) {
          const a = kpiSeries(c, k.id), x = p.kpiSeries(k.id);
          expect(a.map((s) => [s.label, s.v]), k.id).toEqual(x.map((s: Any) => [s.label, s.v]));
          expect(a).toHaveLength(6);
        }
      }
    }
  });
});

describe("parity with the prototype: home cards (still to collect, invoices, cash, P&L card, money chart)", () => {
  const glance = between("var cards = dashCards();", "function box(", proto.indexOf("function glanceHTML("));
  const chart = between("var ms = monthSeries(12, function(b){ return plFor(b); });", "return '<section", proto.indexOf("function glMoneyChartHTML("));
  for (const seed of SEEDS) it(`dataset ${seed}`, () => {
    const { data, settings } = sample(seed);
    for (const [today, now] of NOWS) {
      const { ctx: p } = protoVm(data, settings, today), c = asCtx(data, settings, now);
      for (const per of PERIODS) {
        p.VIEW.glPl = per;
        const g = runInNewContext(`(function(){ ${glance}; return { toCollect, ahead, tcTot, ahTot, od, nd, paid30, unp, invMax, cm, cMax, plA, plB, plD }; })()`, p);
        const sc = stillToCollect(c);
        expect(sc.list.map((x) => [x.e.id, x.v])).toEqual(g.toCollect.map((x: Any) => [x.e.id, x.v]));
        expect(sc.ahead.map((x) => [x.e.id, x.v])).toEqual(g.ahead.map((x: Any) => [x.e.id, x.v]));
        expect(sc.total).toBe(g.tcTot); expect(sc.aheadTotal).toBe(g.ahTot);
        const inv = invoiceSummary(c, now);
        expect(inv).toEqual({ overdue: g.od, notDue: g.nd, unpaid: g.unp, paid30: g.paid30, max: g.invMax });
        expect(cashThisMonth(c)).toEqual({ ...g.cm, max: g.cMax });
        const pc = plCompare(c, per);
        expect(pc.a).toEqual(g.plA); expect(pc.b).toEqual(g.plB); expect(pc.deltaPct).toEqual(g.plD);
      }
      const m = runInNewContext(`(function(){ ${chart}; return { ms, inT, prev, d }; })()`, p), ms = moneySeries(c);
      expect(ms.points.map((x) => [x.key, x.label, x.tip, x.income, x.expenses])).toEqual(m.ms.map((x: Any) => [x.key, x.label, x.tip, x.v.income, x.v.expenses]));
      expect(ms.points).toHaveLength(12);
      expect(ms.total).toBe(m.inT); expect(ms.prevTotal).toBe(m.prev); expect(ms.deltaPct).toEqual(m.d);
    }
  });
});

describe("parity with the prototype: monthly goal", () => {
  for (const goal of [0, 5000, 15000, 400]) for (const seed of SEEDS.slice(0, 6)) it(`goal ${goal} dataset ${seed}`, () => {
    const { data, settings } = sample(seed);
    for (const [today, now] of NOWS) for (const lang of ["en", "es"] as const) {
      const { ctx: p } = protoVm(data, settings, today, goal, lang), c = asCtx(data, settings, now, lang);
      const html: string = p.goalHTML(), g = goalProgress(c, now, goal);
      if (!goal) { expect(html).toContain("goalEdit"); expect(g).toMatchObject({ goal: 0, pct: 0, hit: false }); continue; }
      const es = lang === "es", mn = g.monthName.charAt(0).toUpperCase() + g.monthName.slice(1);
      expect(html).toContain(`<b>${mn} ${es ? "meta" : "goal"}</b><span>${money(g.won)} ${es ? "de" : "of"} ${money(goal)} · ${Math.round(g.pct)}%</span>`);
      expect(html).toContain(g.daysLeft === 1 ? (es ? "1 día restante" : "1 day left") : `${g.daysLeft} ${es ? "días restantes" : "days left"}`);
      expect(html).toContain(`width:${g.pct}%;background:${g.pct >= 100 ? "var(--ok)" : "var(--acc)"}`);
    }
  });
});

describe("parity with the prototype: charts tab (insights)", () => {
  const tileRe = /<div class="tile"><div class="k">(.*?)<\/div><div class="v">(.*?)<\/div>(?:<div class="m">(.*?)<\/div>)?<\/div>/g;
  const rowRe = /<div class="ins-row"><span class="l">(.*?)<\/span>.*?<span class="r"><b>(.*?)<\/b>(?: <em>(.*?)<\/em>)?<\/span><\/div>/g;
  const unesc = (x: string) => x.replace(/&amp;/g, "&");
  const rows = (html: string) => [...html.matchAll(rowRe)].map((m) => [unesc(m[1]), m[2], m[3] || ""]);
  for (const seed of SEEDS) it(`dataset ${seed}`, () => {
    const { data, settings } = sample(seed);
    for (const [today, now] of NOWS.slice(0, 4)) for (const lang of ["en", "es"] as const) {
      const c = asCtx(data, settings, now, lang);
      const years = insights(c, "all").years;
      expect(years).toContain(today.slice(0, 4));
      for (const range of [...years, "last12", "all"]) {
        const { ctx: p, charts } = protoVm(data, settings, today, 0, lang);
        p.VIEW.insRange = range === "last12" ? "12m" : range;
        const html: string = p.insightsHTML(), ins = insights(c, range), es = lang === "es";
        const tiles = [...html.matchAll(tileRe)].map((m) => [m[1], m[2], m[3] || ""]);
        const sm = p.shortMoney, tr = (a: string, b: string) => (es ? b : a);
        const sub = (s: string, ...v: (string | number)[]) => v.reduce<string>((t, x, i) => t.replace(`{${i}}`, String(x)), s);
        expect(tiles).toEqual([
          [tr("Close rate", "Tasa de cierre"), ins.closeRate === null ? "—" : ins.closeRate + "%", sub(tr("{0} won of {1} sent", "{0} ganados de {1} enviados"), ins.won, ins.sent)],
          [tr("Won", "Ganado"), money(ins.wonTotal), ins.deltaPct === null ? (ins.won ? sub(tr("average job {0}", "trabajo promedio {0}"), money(ins.wonTotal / ins.won)) : "")
            : (ins.deltaPct >= 0 ? "▲ " : "▼ ") + Math.abs(ins.deltaPct) + "% " + tr("vs same period last year", "vs mismo periodo del año pasado")],
          [tr("Days to sign", "Días hasta firmar"), ins.avgDays === null ? "—" : ins.avgDays.toFixed(1), tr("from sent to signed", "de enviado a firmado")],
          [tr("Declined", "Rechazados"), String(ins.lost), ins.decidedRate === null ? "" : ins.decidedRate + "% " + tr("won of decided", "ganados de los que decidieron")],
        ]);
        // month buckets (first chart the prototype draws)
        const ch = charts[0];
        expect(ins.months.map((m) => m.label)).toEqual(ch.labels);
        expect(ins.months.map((m) => m.key)).toEqual(ch.keys);
        expect(ins.months.map((m) => m.w)).toEqual(ch.series[0].v);
        expect(ins.months.map((m) => m.q)).toEqual(ch.series[1].v);
        expect(ins.byYear).toBe(range === "all");
        // cards: funnel, price, source, type
        const parts = html.split('<section class="card"').slice(2);
        expect(parts).toHaveLength(4);
        expect(rows(parts[0])).toEqual(ins.funnel.map((s) => [es ? s.es : s.en, String(s.n), s.conv === null ? "" : s.conv + "%"]));
        expect(rows(parts[1])).toEqual(ins.bands.map((x) => [bandLabel([x.lo, x.hi]), x.pct + "%", sub(tr("{0} of {1}", "{0} de {1}"), x.won, x.sent)]));
        if (ins.bestBand) expect(parts[1]).toContain(`<b>${ins.bestBand.label}</b>`); else expect(parts[1]).not.toContain("You close best");
        const money2 = (x: { w: number; n: number; v: number }) => `${x.w}/${x.n}` + (x.v ? " · " + sm(x.v) : "");
        expect(rows(parts[2])).toEqual(ins.bySource.map((x) => [x.name, x.pct + "%", money2(x)]));
        expect(rows(parts[3])).toEqual(ins.byType.map((x) => [x.name, x.pct + "%", money2(x)]));
        // the jobs behind one bar
        const mk = ins.months.find((m) => m.n)?.key;
        if (mk) {
          const list = insightMonthJobs(c, range, mk);
          expect(list.filter((e) => e.date.startsWith(mk.slice(0, ins.mLen))).length).toBe(ins.months.find((m) => m.key === mk)!.n);
        }
      }
    }
  });
});

describe("parity with the prototype: Reports (P&L series, profit by job, marketing)", () => {
  const yearsSrc = between("var years = {}; years[yNow] = 1;", "var k = VIEW.repRange", proto.indexOf("function viewReports("));
  const jobsSrc = between("var jobs = DB.estimates.filter(function(e){ return WON_ST[jobStatus(e)]", "var rows = jobs.map", proto.indexOf("function viewReports("));
  for (const seed of SEEDS) it(`dataset ${seed}`, () => {
    const { data, settings } = sample(seed);
    for (const [today, now] of NOWS.slice(0, 3)) for (const lang of ["en", "es"] as const) {
      const { ctx: p } = protoVm(data, settings, today, 0, lang), c = asCtx(data, settings, now, lang);
      p.es = lang === "es"; p.now = today; p.yNow = today.slice(0, 4);
      const ys = runInNewContext(`(function(){ var es = UI_LANG === "es", now = "${today}", yNow = "${today.slice(0, 4)}"; ${yearsSrc}; return Object.keys(years).sort().reverse(); })()`, p);
      expect(reportYears(c)).toEqual(ys);
      for (const k of [...ys, "all"]) {
        const src = between("var months = [];", "var mx = Math.max", proto.indexOf("function viewReports("));
        const ms = runInNewContext(`(function(){ var es = UI_LANG === "es", k = "${k}", years = {${ys.map((y: string) => `"${y}":1`).join(",")}}; ${src}; return months; })()`, p);
        expect(plSeries(c, k).map((m) => [m.key, m.label, m.b, m.inc, m.exp, m.pro])).toEqual(ms.map((m: Any) => [m.key, m.label, m.b, m.inc, m.exp, m.pro]));
        const b: Bounds = isYearKey(k) ? { from: k + "-01-01", to: k + "-12-31" } : { from: "", to: "" };
        const j = runInNewContext(`(function(b){ ${jobsSrc}; return { jobs: jobs, tp: tp, tr: tr }; })`, p)(b);
        const pj = profitByJob(c, b);
        expect(pj.rows.map((x) => [x.e.id, x.c])).toEqual(j.jobs.map((x: Any) => [x.e.id, x.c]));
        expect(pj.profit).toBe(j.tp); expect(pj.revenue).toBe(j.tr); expect(pj.jobs).toBe(j.jobs.length);
        expect(pj.margin).toEqual(j.tr ? (j.tp / j.tr) * 100 : null);
        // "All jobs: income vs costs" bars
        const aj: string = p.allJobsHTML(j.jobs);
        const parts = aj.split('<button class="aj-r"').slice(1);
        expect(parts).toHaveLength(allJobsRows(c, b).length);
        parts.forEach((h, i) => {
          const x = allJobsRows(c, b)[i], w = [...h.matchAll(/width:([\d.e+-]+)%/g)].map((m) => Number(m[1]));
          expect(w).toEqual([x.inPct, x.coPct]);
          expect(h).toContain(`${x.margin.toFixed(0)}%`);
          expect(h).toContain(x.over ? "var(--bad)" : "var(--acc)");
          expect(h).toContain(`${money(x.c.paid)}<br>${money(x.actCost)}`);
          expect(h).toContain(`${money(x.c.price)}<br>${money(x.expCost)}`);
        });
        // marketing tab
        const src2 = p.marketingFor(b), keys = Object.keys(src2).sort((a, z) => src2[z].spend - src2[a].spend || src2[z].rev - src2[a].rev);
        const mr = marketingRows(c, b);
        expect(mr.rows.map((x) => x.source)).toEqual(keys);
        mr.rows.forEach((x) => {
          const o = src2[x.source];
          expect(x).toMatchObject({ spend: o.spend, leads: o.leads, won: o.won, rev: o.rev, cpl: o.leads && o.spend ? o.spend / o.leads : 0, cpj: o.won && o.spend ? o.spend / o.won : 0, roi: o.spend ? o.rev / o.spend : 0 });
        });
        // where the money went
        const pl = p.plFor(b), cats = Object.keys(pl.cats).sort((a, z) => pl.cats[z] - pl.cats[a]);
        expect(plBreakdown(plFor(c, b)).map((x) => [x.cat, x.amount, x.pct])).toEqual(cats.map((x) => [x, pl.cats[x], pl.expenses ? Math.round((pl.cats[x] / pl.expenses) * 100) : 0]));
      }
    }
  });
});
const isYearKey = (k: string) => /^\d{4}$/.test(k);

describe("parity with the prototype: CSV exports", () => {
  const KINDS: CsvKind[] = ["expenses", "pl", "income", "jobs", "team"];
  for (const seed of SEEDS) it(`dataset ${seed}`, () => {
    const { data, settings } = sample(seed);
    for (const [today, now] of NOWS.slice(0, 2)) for (const lang of ["en", "es"] as const) {
      const c = asCtx(data, settings, now, lang), ys = reportYears(c);
      for (const range of [...ys, "all"]) for (const kind of KINDS) {
        const { ctx: p, csv } = protoVm(data, settings, today, 0, lang);
        p.VIEW.repRange = range;
        p.exportCSV(kind);
        const b: Bounds = isYearKey(range) ? { from: range + "-01-01", to: range + "-12-31" } : { from: "", to: "" };
        expect(exportCsv(kind, c, b), `${kind} ${range}`).toBe(csv.text);
        expect(csvFileName(kind, b, "LUMA")).toBe(csv.name);
      }
    }
  });
});

describe("the generated datasets exercise the maths (not all zeros)", () => {
  it("has won jobs, income, expenses, leads, deleted rows and every KPI is non-trivial somewhere", () => {
    let won = 0, income = 0, spend = 0, leads = 0, csvRows = 0, owed = 0;
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const { data, settings } = sample(seed), c = asCtx(data, settings, NOWS[0][1]), all = { from: "", to: "" };
      won += wonSummary(c, "all").n; income += plFor(c, all).income;
      const m = marketingRows(c, all).totals; spend += m.spend; leads += m.leads;
      csvRows += exportCsv("expenses", c, all).split("\r\n").length; owed += stillToCollect(c).list.length;
      for (const k of KPI_LIB) for (const per of PERIODS) { const v = kpiValue(c, k.id, per); if (v.value) seen.add(k.id); }
    }
    expect(won).toBeGreaterThan(20); expect(income).toBeGreaterThan(10000); expect(spend).toBeGreaterThan(100); expect(leads).toBeGreaterThan(20);
    expect(csvRows).toBeGreaterThan(200); expect(owed).toBeGreaterThan(5);
    expect([...seen].sort()).toEqual(KPI_LIB.map((k) => k.id).sort());
  });
});

/* ================================================================= known values (hand-checked, independent of the prototype) */
describe("known values", () => {
  const settings = defaultSettings();
  const est = (id: string, over: Partial<Estimate> = {}): Estimate => ({ ...blankEstimate(settings, "EST-" + id), id, date: "2026-09-02", status: "Accepted", doors: 10, doorRate: 100, clientId: "c1", ...over } as Estimate);
  const inv = (id: string, estId: string, amount: number, over: Partial<Invoice> = {}): Invoice => ({ id, number: id, estId, kind: "deposit", amount, date: "2026-09-01", status: "Unpaid", ...over });
  const base = (over: Partial<Ctx> = {}): Ctx => ({
    estimates: [], invoices: [], expenses: [], payouts: [], hours: [], workers: [{ id: "w1", name: "Ana", rate: 20 }], clients: [{ id: "c1", name: "Ana Ruiz", source: "Google" } as Client],
    settings, now: new Date(2026, 8, 29, 12), ...over,
  });
  const NOW = new Date(2026, 8, 29, 12);

  it("P&L: income by paid date, ledger + legacy receipts + team payouts as expenses", () => {
    const e = est("1", { ...({ expenses: [{ id: "l1", amount: 40, date: "2026-09-03" }] } as object) });
    const c = base({
      estimates: [e],
      invoices: [inv("a", "1", 600, { status: "Paid", paidDate: "2026-09-10" }), inv("b", "1", 400, { status: "Paid", paidDate: "2026-08-30" }), inv("c", "1", 999)],
      expenses: [{ id: "x1", date: "2026-09-05", vendor: "HD", amount: 100.5, category: "materials" }, { id: "x2", date: "2026-09-06", vendor: "G", amount: 50, category: "ads", source: "Google" },
        { id: "x3", date: "2026-09-07", vendor: "old", amount: 77, category: "fuel", ...({ deleted: true } as object) } as Expense],
      payouts: [{ id: "p1", workerId: "w1", date: "2026-09-08", amount: 200 }],
    });
    const pl = plFor(c, { from: "2026-09-01", to: "2026-09-31" });
    expect(pl.income).toBe(600);
    expect(pl.cats).toEqual({ materials: 140.5, ads: 50, team: 200 });
    expect(pl.expenses).toBe(390.5);
    expect(pl.profit).toBe(209.5);
    expect(pl.margin).toBeCloseTo((209.5 / 600) * 100, 10);
    expect(plFor(c, { from: "", to: "" }).income).toBe(1000);
    expect(plBreakdown(pl)).toEqual([{ cat: "team", amount: 200, pct: 51 }, { cat: "materials", amount: 140.5, pct: 36 }, { cat: "ads", amount: 50, pct: 13 }]);
  });

  it("job costs: price - materials - other expenses - labor (hours x rate stored on the entry)", () => {
    const e = est("1");
    const c = base({
      estimates: [e], invoices: [inv("a", "1", 300, { status: "Paid" }), inv("b", "1", 700)],
      expenses: [{ id: "x1", date: "d", vendor: "", amount: 120, category: "materials", estId: "1" }, { id: "x2", date: "d", vendor: "", amount: 30, category: "fuel", estId: "1" }, { id: "x3", date: "d", vendor: "", amount: 999, category: "fuel" }],
      hours: [{ id: "h1", workerId: "w1", date: "d", hours: 10, rate: 25, estId: "1" }, { id: "h2", workerId: "w1", date: "d", hours: 2, rate: "" as never, estId: "1" }],
    });
    const k = jobCosts(c, e);
    expect(k).toMatchObject({ price: 1000, paid: 300, mat: 120, other: 30, labor: 290, hrs: 12, cost: 440, profit: 560, hasReal: true });
    expect(k.margin).toBeCloseTo(56, 10);
    expect(jobCosts(base({ estimates: [e] }), e)).toMatchObject({ mat: 0, other: 0, labor: 0, profit: 1000, hasReal: false });
  });

  it("periods", () => {
    const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);
    expect(periodPair("month", NOW)).toEqual([{ from: "2026-09-01", to: "2026-09-29" }, { from: "2026-08-01", to: "2026-08-29" }]);
    expect(periodPair("month", at(2026, 3, 31))).toEqual([{ from: "2026-03-01", to: "2026-03-31" }, { from: "2026-02-01", to: "2026-02-28" }]);
    expect(periodPair("lastmonth", at(2026, 1, 10))).toEqual([{ from: "2025-12-01", to: "2025-12-31" }, { from: "2025-11-01", to: "2025-11-30" }]);
    expect(periodPair("ytd", NOW)).toEqual([{ from: "2026-01-01", to: "2026-09-29" }, { from: "2025-01-01", to: "2025-09-29" }]);
    expect(periodPair("lastyear", NOW)).toEqual([{ from: "2025-01-01", to: "2025-12-31" }, { from: "2024-01-01", to: "2024-12-31" }]);
    expect(wonRangeBounds("month", NOW)).toEqual({ from: "2026-09-01", to: "2026-09-31" });
    expect(wonRangeBounds("all", NOW)).toEqual({ from: "", to: "" });
  });

  it("KPI library has the 14 KPIs with icons, bilingual titles and formats", () => {
    expect(KPI_LIB.map((k) => k.id)).toEqual(["job_margin", "net_profit", "sales_won", "backlog", "money_in", "money_out", "close_rate", "avg_job", "leads", "cpl", "unpaid", "labor", "mat_pct", "jobs_done"]);
    expect(KPI_LIB.filter((k) => k.lowerIsBetter).map((k) => k.id)).toEqual(["money_out", "cpl", "unpaid", "labor", "mat_pct"]);
    expect(KPI_LIB.filter((k) => k.asOfToday).map((k) => k.id)).toEqual(["backlog", "unpaid"]);
    for (const k of KPI_LIB) { expect(k.en && k.es && k.subEn && k.subEs).toBeTruthy(); expect(["money", "pct", "count"]).toContain(k.format); }
    expect(kpiFormat({ format: "pct" }, 52.04, money)).toBe("52.0%");
    expect(kpiFormat({ format: "count" }, 2.6, money)).toBe("3");
    expect(kpiFormat({ format: "money" }, 1234.5, money)).toBe("$1,234.50");
    expect(kpiFormat({ format: "money" }, null, money)).toBe("—");
  });

  it("KPI delta: % change for money, points for percentages, lower-is-better flips the colour", () => {
    const e1 = est("1", { date: "2026-05-01" }), e0 = est("0", { date: "2025-05-01" });
    const c = base({
      estimates: [e1, e0], expenses: [{ id: "x", date: "2026-05-02", vendor: "", amount: 500, category: "fuel" }, { id: "y", date: "2025-05-02", vendor: "", amount: 250, category: "fuel" }],
    });
    const out = kpiValue(c, "money_out", "ytd");
    expect(out).toMatchObject({ value: 500, prev: 250, delta: 100, deltaIsPoints: false, good: false });
    const sales = kpiValue(c, "sales_won", "ytd");
    expect(sales).toMatchObject({ value: 1000, prev: 1000, delta: 0, good: true });
    expect(kpiValue(c, "backlog", "ytd")).toMatchObject({ value: 2000, prev: null, delta: null });
    expect(kpiValue(c, "close_rate", "ytd")).toMatchObject({ value: 100, prev: 100, delta: 0, deltaIsPoints: true });
    expect(kpiValue(c, "avg_job", "month")).toMatchObject({ value: null, delta: null });
    expect(kpiValue(c, "nope", "ytd").value).toBeNull();
  });

  it("kpiSeries: 6 months oldest first, empty months are 0", () => {
    const c = base({ invoices: [inv("a", "1", 250, { status: "Paid", paidDate: "2026-09-10" }), inv("b", "1", 100, { status: "Paid", paidDate: "2026-04-10" })] });
    const s = kpiSeries(c, "money_in");
    expect(s.map((x) => x.key)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(s.map((x) => x.v)).toEqual([100, 0, 0, 0, 0, 250]);
    expect(s.map((x) => x.label)).toEqual(["Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
    expect(kpiSeries({ ...c, lang: "es" }, "money_in", 12)).toHaveLength(12);
  });

  it("money chart: 12 months, total and change vs the 12 months before", () => {
    const c = base({ invoices: [inv("a", "1", 300, { status: "Paid", paidDate: "2026-09-10" }), inv("b", "1", 200, { status: "Paid", paidDate: "2025-10-01" }), inv("c", "1", 100, { status: "Paid", paidDate: "2025-09-30" }), inv("d", "1", 50, { status: "Paid", paidDate: "2024-10-01" })] });
    const m = moneySeries(c);
    expect(m.points[0].key).toBe("2025-10"); expect(m.points[11].key).toBe("2026-09");
    expect(m.total).toBe(500);
    expect(m.prevTotal).toBe(150);
    expect(m.deltaPct).toBeCloseTo(233.333333, 4);
    expect(moneySeries(base()).deltaPct).toBeNull();
  });

  it("still to collect: signed jobs with more than 50 cents left, biggest first; deposits on jobs not done", () => {
    const a = est("A", { doors: 10, doorRate: 100 }), b = est("B", { doors: 30, doorRate: 100, startDate: "2026-09-01", days: 2 }), cc = est("C", { status: "Sent" }), dd = est("D", { doors: 1, doorRate: 100 });
    const c = base({ estimates: [a, b, cc, dd], invoices: [inv("1", "A", 300, { status: "Paid" }), inv("1b", "A", 700), inv("2", "B", 3000, { status: "Paid" }), inv("3", "D", 100, { status: "Paid" })] });
    const s = stillToCollect(c);
    expect(s.list.map((x) => [x.e.id, x.v])).toEqual([["A", 700]]); // B and D are paid in full; C is only sent
    expect(s.total).toBe(700);
    expect(s.ahead.map((x) => x.e.id)).toEqual(["A"]); // B ended on Sep 2 and is fully paid
    expect(s.aheadTotal).toBe(300);
    // a job that already ended does not count as "ahead" even if not fully paid
    const c2 = base({ estimates: [b], invoices: [inv("2", "B", 1000, { status: "Paid" }), inv("4", "B", 500)] });
    expect(stillToCollect(c2).list.map((x) => x.v)).toEqual([2000]);
    expect(stillToCollect(c2).ahead).toEqual([]);
  });

  it("invoices card: overdue means dated more than 3 days ago; paid counts the last 30 days", () => {
    const c = base({
      invoices: [inv("a", "1", 100, { date: "2026-09-25" }), inv("b", "1", 200, { date: "2026-09-26" }), inv("c", "1", 300, { date: "2026-09-29" }), inv("d", "1", 999, { status: "Draft" as never }),
        inv("e", "1", 40, { status: "Paid", paidDate: "2026-08-30" }), inv("f", "1", 60, { status: "Paid", paidDate: "2026-08-29" }), inv("g", "1", 5, { status: "Paid", date: "2026-09-20" })],
    });
    expect(invoiceSummary(c, NOW)).toEqual({ overdue: 100, notDue: 500, unpaid: 600, paid30: 45, max: 600 });
    expect(invoiceSummary(base(), NOW).max).toBe(1);
  });

  it("cash this month and net profit tiles", () => {
    const c = base({ invoices: [inv("a", "1", 900, { status: "Paid", paidDate: "2026-09-02" }), inv("b", "1", 5000, { status: "Paid", paidDate: "2026-08-02" })],
      expenses: [{ id: "x", date: "2026-09-03", vendor: "", amount: 300, category: "materials" }, { id: "y", date: "2026-09-30", vendor: "", amount: 77, category: "fuel" }] });
    expect(cashThisMonth(c)).toMatchObject({ income: 900, expenses: 300, profit: 600, max: 900 });
    expect(netProfit(c, "month")).toEqual({ income: 900, expenses: 377, profit: 523, margin: (523 / 900) * 100, materials: 300, team: 0, other: 77 });
  });

  it("monthly goal", () => {
    const a = est("A", { doors: 10, doorRate: 100, startDate: "2026-09-10" });
    const c = base({ estimates: [a, est("B", { doors: 5, doorRate: 100, startDate: "2026-08-10" })] });
    expect(goalProgress(c, NOW, 4000)).toMatchObject({ goal: 4000, won: 1000, pct: 25, hit: false, daysLeft: 1, monthName: "September" });
    expect(goalProgress(c, NOW, 800)).toMatchObject({ pct: 100, hit: true });
    expect(goalProgress(c, NOW)).toMatchObject({ goal: 0, pct: 0, hit: false });
    expect(goalProgress({ ...c, lang: "es" }, new Date(2026, 8, 20), 4000)).toMatchObject({ daysLeft: 10, monthName: "septiembre" });
  });

  it("close stats and won summary (money tab)", () => {
    const c = base({
      estimates: [est("1"), est("2", { status: "Declined" }), est("3", { status: "Sent" }), est("4", { status: "Draft" }), est("5", { date: "2025-01-01", startDate: "2025-01-05", status: "Paid in Full", changeOrders: [{ n: 1, amount: 50, status: "signed" }] })],
      invoices: [inv("i", "5", 1050, { status: "Paid", paidDate: "2025-01-06" })], expenses: [{ id: "m", date: "2025-01-02", vendor: "", amount: 200, category: "materials", estId: "5" }],
    });
    expect(closeStats(c, "year")).toEqual({ sent: 3, won: 1, lost: 1, open: 1, rate: 33, decided: 50, avgBid: 1000 });
    expect(closeStats(c, "all")).toMatchObject({ sent: 4, won: 2 });
    const w = wonSummary(c, "all");
    expect(w).toMatchObject({ n: 2, total: 2050, collected: 1050, due: 1000, avg: 1025 });
    expect(w.list[0].e.id).toBe("1");
    expect(w.list[1]).toMatchObject({ total: 1050, paid: 1050, due: 0, mat: 200 });
    expect(wonSummary(c, "year")).toMatchObject({ n: 1, total: 1000 });
  });

  it("profit by job sorts by profit and totals revenue and profit", () => {
    const a = est("A", { doors: 10, doorRate: 100 }), b = est("B", { doors: 20, doorRate: 100 });
    const c = base({ estimates: [a, b], expenses: [{ id: "x", date: "d", vendor: "", amount: 1500, category: "materials", estId: "B" }] });
    const p = profitByJob(c, { from: "", to: "" });
    expect(p.rows.map((x) => [x.e.id, x.c.profit])).toEqual([["A", 1000], ["B", 500]]);
    expect(p).toMatchObject({ jobs: 2, revenue: 3000, profit: 1500 });
    expect(p.margin).toBeCloseTo(50, 10);
    expect(profitByJob(base(), { from: "", to: "" })).toMatchObject({ jobs: 0, margin: null });
    expect(p.rows[1]).toMatchObject({ actCost: 1500, over: true });
    expect(p.rows[0].c.hasReal).toBe(false);
  });

  it("marketing: spend by source, unique leads, won jobs and revenue, lead-only clients", () => {
    const a = est("A", { leadSource: "Google" }), b = est("B", { leadSource: "Google" }), cc = est("C", { leadSource: "Thumbtack", clientId: "c2", status: "Sent" });
    const c = base({
      estimates: [a, b, cc], clients: [{ id: "c1", name: "Ana Ruiz", source: "Google" }, { id: "c2", name: "Bo", source: "Thumbtack" }, { id: "c3", name: "Cy", source: "Website (Nextdoor)", createdAt: "2026-09-05T00:00:00Z" }, { id: "c4", name: "Di", source: "", createdAt: "2026-09-05" }, { id: "c5", name: "Ed", source: "Yelp", createdAt: "2025-09-05" }] as Client[],
      expenses: [{ id: "x", date: "2026-09-05", vendor: "", amount: 300, category: "ads", source: "Google" }, { id: "y", date: "2026-09-05", vendor: "", amount: 90, category: "leads" }, { id: "z", date: "2026-09-05", vendor: "", amount: 500, category: "fuel", source: "Google" }],
    });
    const m = marketingFor(c, { from: "2026-01-01", to: "2026-12-31" });
    expect(m).toEqual({ Google: { spend: 300, leads: 1, won: 2, rev: 2000 }, "Not set": { spend: 90, leads: 0, won: 0, rev: 0 }, Thumbtack: { spend: 0, leads: 1, won: 0, rev: 0 }, Nextdoor: { spend: 0, leads: 1, won: 0, rev: 0 } });
    expect(marketingFor({ ...c, lang: "es" }, { from: "2026-01-01", to: "2026-12-31" })["Sin anotar"].spend).toBe(90);
    const rows = marketingRows(c, { from: "2026-01-01", to: "2026-12-31" });
    expect(rows.rows[0]).toMatchObject({ source: "Google", cpl: 300, cpj: 150, roi: 2000 / 300 });
    expect(rows.totals).toMatchObject({ spend: 390, leads: 3, won: 2, rev: 2000 });
  });

  it("insights: funnel, price bands, best band needs 2+ estimates, days to sign", () => {
    const mk = (id: string, doors: number, status: Estimate["status"], over: Partial<Estimate> = {}) => est(id, { doors, doorRate: 100, status, date: "2026-03-10", ...over });
    const c = base({
      estimates: [mk("1", 10, "Accepted", { sentAt: "2026-03-01", signature: { name: "", img: "", date: "2026-03-05", via: "", at: "" }, portalViews: ["x"] }), mk("2", 12, "Declined", { portalViews: ["x"] }), mk("3", 30, "Sent"), mk("4", 5, "Draft"),
        mk("5", 45, "Paid in Full", { leadSource: "Google", signature: { name: "", img: "", date: "2026-03-13", via: "", at: "" } })],
    });
    const i = insights(c, 2026);
    expect(i).toMatchObject({ sent: 4, won: 2, lost: 1, wonTotal: 5500, closeRate: 50, decidedRate: 67, avgJob: 2750, avgDays: 3.5, prevWon: 0, deltaPct: null });
    expect(i.funnel.map((s) => [s.id, s.n, s.conv])).toEqual([["leads", 4, null], ["sent", 4, 100], ["opened", 2, 50], ["won", 2, 100], ["paid", 1, 50]]);
    expect(i.bands.map((b) => [b.label, b.sent, b.won, b.lost, b.pct, b.best])).toEqual([["$0–$2k", 2, 1, 1, 50, true], ["$2k–$4k", 1, 0, 0, 0, false], ["$4k–$6k", 1, 1, 0, 100, false]]);
    expect(i.bestBand?.label).toBe("$0–$2k");
    expect(i.bySource.map((x) => [x.name, x.n, x.w, x.v])).toEqual([["Google", 1, 1, 4500], ["Not set", 3, 1, 1000]]);
    expect(i.byType.map((x) => [x.name, x.n, x.w, x.v])).toEqual([["Kitchen cabinets", 4, 2, 5500]]);
    expect(i.months.find((m) => m.key === "2026-03")).toMatchObject({ q: 9700, w: 5500, n: 4, nw: 2 });
    expect(i.months).toHaveLength(12);
    expect(insightMonthJobs(c, 2026, "2026-03").map((e) => e.id)).toEqual(["5", "3", "2", "1"]);
    expect(insights(c, "all").months.map((m) => [m.key, m.n])).toEqual([["2026", 4]]);
    expect(insights(c, "last12").months).toHaveLength(12);
  });

  it("income CSV falls back to the estimate when the invoice carries no client snapshot", () => {
    const e = est("1");
    const c = base({ estimates: [e], invoices: [inv("a", "1", 10, { status: "Paid", paidDate: "2026-05-01" })] });
    expect(exportCsv("income", c, { from: "", to: "" })).toBe("\ufeffDate paid,Invoice,Estimate,Client,Amount\r\n2026-05-01,a,EST-1,Ana Ruiz,10.00");
  });

  it("PRICE_BANDS and bandLabel", () => {
    expect(PRICE_BANDS).toHaveLength(6);
    expect(PRICE_BANDS.map(bandLabel)).toEqual(["$0–$2k", "$2k–$4k", "$4k–$6k", "$6k–$8k", "$8k–$12k", "$12k+"]);
  });

  it("CSV: BOM, CRLF, quoting", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(null)).toBe(""); expect(csvCell(12.5)).toBe("12.5");
    expect(csvText([["a", "b,c"], ["1", "2"]])).toBe('﻿a,"b,c"\r\n1,2');
    const c = base({ payouts: [{ id: "p", workerId: "w1", date: "2026-05-01", amount: 12.3, method: "Zelle", note: "wk, 1" }] });
    const t = exportCsv("team", c, { from: "2026-01-01", to: "2026-12-31" });
    expect(t).toBe('﻿Date,Worker,Amount,Method,Note\r\n2026-05-01,Ana,12.30,Zelle,"wk, 1"');
    expect(csvFileName("pl", { from: "2026-01-01", to: "2026-12-31" })).toBe("TradeWorks-2026-profit-and-loss.csv");
    expect(csvFileName("expenses", { from: "", to: "" }, "LUMA")).toBe("LUMA-all-expenses.csv");
  });

  it("expenses CSV: ledger sorted by date, legacy job receipts, team payments last; P&L CSV has one row per month", () => {
    const e = est("1", { ...({ expenses: [{ id: "l", amount: 25, date: "2026-02-01" }] } as object) });
    const c = base({
      estimates: [e], expenses: [{ id: "x", date: "2026-03-01", vendor: "HD", amount: 10, category: "materials", estId: "1", receiptUrl: "u" }, { id: "y", date: "2026-01-05", vendor: "Shell", amount: 5, category: "fuel" }],
      payouts: [{ id: "p", workerId: "w1", date: "2026-01-02", amount: 50 }],
    });
    const rows = exportCsv("expenses", c, { from: "2026-01-01", to: "2026-12-31" }).split("\r\n");
    expect(rows).toEqual(["﻿Date,Vendor,Category,Source,Job,Client,Paid with,Amount,Note,Receipt", "2026-01-05,Shell,Fuel & vehicle,,,,,5.00,,", "2026-02-01,Job materials,Materials,,EST-1,Ana Ruiz,,25.00,,",
      "2026-03-01,HD,Materials,,EST-1,Ana Ruiz,,10.00,,yes", "2026-01-02,Ana,Team payments,,,,,50.00,,"]);
    const pl = exportCsv("pl", c, { from: "2026-01-01", to: "2026-12-31" }).split("\r\n");
    expect(pl).toHaveLength(13);
    expect(pl[0]).toBe("﻿Month,Income,Materials,Labor / subcontractors,Ads & marketing,Lead fees,Fuel & vehicle,Tools & equipment,Insurance,Software & phone,Office & supplies,Other,Team payments,Total expenses,Net profit");
    expect(pl[1]).toBe("2026-01,0.00,0.00,0.00,0.00,0.00,5.00,0.00,0.00,0.00,0.00,0.00,50.00,55.00,-55.00");
  });

  it("reportYears and plSeries", () => {
    const c = base({ estimates: [est("1", { date: "2024-05-05" })], expenses: [{ id: "x", date: "2025-03-01", vendor: "", amount: 10, category: "fuel" }] });
    expect(reportYears(c)).toEqual(["2026", "2025", "2024"]);
    expect(plSeries(c, "2025")).toHaveLength(12);
    expect(plSeries(c, "all").map((m) => [m.key, m.exp])).toEqual([["2024", 0], ["2025", 10], ["2026", 0]]);
  });
});
