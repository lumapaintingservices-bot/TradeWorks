/**
 * Everything spent on one job, in detail (estimate > Expenses tab): budget vs actual by kind, every expense linked to the job,
 * the team's logged hours on it (with overtime) and the profit so far with what is recorded. Pure — no React, no Firebase.
 */
import { calcMaterials, crewCost, jobEconomics, jobHours, laborModeFor } from "./estimate";
import { jobExpensesTotal, legacyJobExpenses } from "./expenses";
import { num, r2 } from "./money";
import { entryPay, overtime } from "./team";
import type { Estimate, Expense, HourEntry, Settings, Worker } from "./types";

/** materials / team (logged hours) / labor (subcontractor expenses) / any other expense category id. */
export type LedgerCat = { id: string; est: number | null; real: number };
export type TeamRow = { id: string; date: string; workerId: string; worker: string; hours: number; pay: number; ot: number; note: string };
export type JobLedger = {
  price: number; spent: number; profit: number; margin: number; budget: number;
  cats: LedgerCat[]; expenses: Expense[]; legacy: { id: string; desc: string; date: string; amount: number }[];
  team: TeamRow[]; teamHours: number; plannedHours: number;
};

const alive = <T,>(x: T) => !(x as { deleted?: boolean }).deleted;

export function jobLedger(e: Estimate, s: Settings, expenses: Expense[], hours: HourEntry[], workers: Worker[]): JobLedger {
  const x = jobEconomics(e, s);
  const mine = expenses.filter((r) => alive(r) && !!e.id && r.estId === e.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const legacy = legacyJobExpenses(e).filter((l) => num(l.amount) > 0).map((l, i) => ({ id: l.id || "l" + i, desc: l.desc || "", date: l.date || "", amount: r2(num(l.amount)) }));

  // team hours on this job; overtime is worked out over each worker's whole week (all jobs), so the full list goes in
  const live = hours.filter(alive);
  const ot = overtime(live, workers).byEntry;
  const team: TeamRow[] = live.filter((h) => !!e.id && h.estId === e.id).map((h) => {
    const w = workers.find((k) => k.id === h.workerId);
    return { id: h.id, date: h.date, workerId: h.workerId, worker: w?.name || "—", hours: num(h.hours), pay: entryPay(h, w, ot), ot: r2(ot.get(h.id) || 0), note: h.note || h.taskTitle || "" };
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const crew = laborModeFor(e, s) === "crew";
  const h = jobHours(e, s);
  const cats: LedgerCat[] = [
    { id: "materials", est: calcMaterials(e, s).totalCost, real: jobExpensesTotal(e.id ? mine : [], e.id, legacy) },
    { id: "team", est: crew ? crewCost(e, h, s) : null, real: r2(team.reduce((a, r) => a + r.pay, 0)) },
  ];
  const byCat = new Map<string, number>();
  for (const r of mine) if (r.category !== "materials") byCat.set(r.category || "other", (byCat.get(r.category || "other") || 0) + num(r.amount));
  const order = (k: string) => (k === "labor" ? 0 : 1);
  [...byCat.entries()].sort((a, b) => order(a[0]) - order(b[0]) || b[1] - a[1]).forEach(([id, v]) => cats.push({ id, est: null, real: r2(v) }));

  const spent = r2(cats.reduce((a, c) => a + c.real, 0));
  const budget = r2(cats.reduce((a, c) => a + (c.est || 0), 0));
  const price = x.revenue, profit = r2(price - spent);
  return {
    price, spent, profit, margin: price > 0 ? (profit / price) * 100 : 0, budget, cats, expenses: mine, legacy, team,
    teamHours: Math.round(team.reduce((a, r) => a + r.hours, 0) * 100) / 100, plannedHours: h.total,
  };
}
