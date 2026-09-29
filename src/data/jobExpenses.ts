import { useMemo } from "react";
import { jobExpensesTotal, legacyJobExpenses } from "../lib/expenses";
import type { Estimate } from "../lib/types";
import { useExpenses } from "./hooks";

/**
 * Material spend recorded for one job (prototype `jobExpenses`): ledger expenses of category 'materials' linked to the job,
 * plus the legacy quick receipts stored on the estimate itself (`estimate.expenses`) when `estimate` is passed.
 * Use `actualMaterialsFrom(total, estimate.actualMaterialCost)` for the prototype's `actualMaterials`.
 */
export function useJobExpenses(estId: string, estimate?: Estimate | null): number {
  const { rows } = useExpenses();
  return useMemo(() => jobExpensesTotal(rows, estId, estimate ? legacyJobExpenses(estimate) : []), [rows, estId, estimate]);
}

/** Every ledger expense linked to a job (any category), newest first — for a per-job list. */
export function useJobExpenseRows(estId: string) {
  const { rows } = useExpenses();
  return useMemo(() => rows.filter((x) => x.estId === estId).sort((a, b) => String(b.date).localeCompare(String(a.date))), [rows, estId]);
}
