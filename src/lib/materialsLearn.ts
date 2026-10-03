/**
 * Learn the materials estimate from real jobs: on every job where the owner buys the materials and the real cost is known
 * (materials expenses linked to the job, else the typed "real materials cost"), compare it with what the calculator estimates
 * today (without any earlier learned factor). The suggested factor is total real / total estimated over those jobs.
 */
import { calcMaterials } from "./estimate";
import { jobExpensesTotal, legacyJobExpenses } from "./expenses";
import { num, r2 } from "./money";
import type { Estimate, Expense, Settings } from "./types";

export type LearnRow = { id: string; number: string; client: string; est: number; real: number };
export type Learning = { rows: LearnRow[]; n: number; est: number; real: number; factor: number };

/** Fewest jobs before the app offers to adjust (one job can be a fluke; the owner can still apply it). */
export const LEARN_MIN_JOBS = 3;

export function materialsLearning(estimates: Estimate[], expenses: Expense[], s: Settings): Learning {
  const plain: Settings = { ...s, materials: { ...s.materials, realFactor: undefined } };
  const rows: LearnRow[] = [];
  for (const e of estimates) {
    if ((e as { deleted?: boolean }).deleted || (e.matBuyer || "me") !== "me") continue;
    const listed = jobExpensesTotal(expenses, e.id, legacyJobExpenses(e));
    const real = listed > 0 ? listed : num(e.actualMaterialCost);
    if (!(real > 0)) continue;
    const est = calcMaterials(e, plain).baseCost;
    if (!(est > 0)) continue;
    rows.push({ id: e.id, number: e.number, client: e.clientName || "", est: r2(est), real: r2(real) });
  }
  rows.sort((a, b) => String(b.number).localeCompare(String(a.number)));
  const est = r2(rows.reduce((a, r) => a + r.est, 0)), real = r2(rows.reduce((a, r) => a + r.real, 0));
  const f = est > 0 ? real / est : 1;
  return { rows, n: rows.length, est, real, factor: Math.min(3, Math.max(0.1, Math.round(f * 100) / 100)) };
}
