import { useMemo } from "react";
import { useUi } from "../store/ui";
import type { Ctx } from "../lib/metrics";
import { useClients, useEstimates, useExpenses, useHours, useInvoices, usePayouts, useSettings, useWorkers } from "./hooks";

/** One place that gathers every collection into the `Ctx` the pure metric functions in src/lib/metrics.ts expect. */
export function useMetricsCtx(): { ctx: Ctx; loading: boolean } {
  const lang = useUi((s) => s.lang);
  const { rows: estimates, loading: l1 } = useEstimates();
  const { rows: invoices } = useInvoices();
  const { rows: expenses } = useExpenses();
  const { rows: payouts } = usePayouts();
  const { rows: hours } = useHours();
  const { rows: workers } = useWorkers();
  const { rows: clients } = useClients();
  const { settings } = useSettings();
  const ctx = useMemo(() => ({ estimates, invoices, expenses, payouts, hours, workers, clients, settings, now: new Date(), lang }) as unknown as Ctx,
    [estimates, invoices, expenses, payouts, hours, workers, clients, settings, lang]);
  return { ctx, loading: l1 };
}
