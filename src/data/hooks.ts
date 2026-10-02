import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { defaultSettings } from "../lib/settings";
import { normalizeTrade } from "../lib/trades";
import type { ClockRec, Client, CrewJob, Estimate, Expense, HourEntry, Invoice, JobChat, JobPhoto, Payout, Settings, Task, TeamMsg, Worker } from "../lib/types";
import { subscriptionPlan } from "../lib/workerView";
import { patchRec, removeRec, saveRec, subscribe, subscribeDoc, type Rec } from "./repo";

/**
 * Live rows of one company collection.
 *  - owner / admin: the whole collection.
 *  - worker: Firestore rules are not filters, so only what the rules allow is requested (src/lib/workerView.ts subscriptionPlan):
 *    tasks / hours / payouts / jobphotos where workerId == mine, clock / workers only the doc with my worker id; every other collection is not
 *    subscribed at all (rows [] and loading false). `patch` changes single fields (a worker ticking a task).
 */
export function useCollection<T extends Rec>(col: string) {
  const { company, role, workerId } = useAuth();
  const cid = company?.id;
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!cid) return;
    const plan = subscriptionPlan(role, workerId, col);
    if (plan.kind === "none") { setRows([]); setLoading(false); return; }
    setLoading(true);
    if (plan.kind === "doc") return subscribeDoc<T>(cid, col, plan.id, (r) => { setRows(r ? [r] : []); setLoading(false); });
    return subscribe<T>(cid, col, (r) => { setRows(r); setLoading(false); }, plan.kind === "filter" ? { field: plan.field, value: plan.value, op: plan.op } : undefined);
  }, [cid, col, role, workerId]);
  const save = useCallback((r: T) => saveRec(cid!, col, r), [cid, col]);
  const remove = useCallback((id: string) => removeRec(cid!, col, id), [cid, col]);
  const patch = useCallback((id: string, fields: Partial<T>) => patchRec(cid!, col, id, fields as Record<string, unknown>), [cid, col]);
  return { rows, loading, save, remove, patch };
}
export const useClients = () => useCollection<Client & Rec>("clients");
export const useInvoices = () => useCollection<Invoice & Rec>("invoices");
export const useTasks = () => useCollection<Task & Rec>("tasks");
export const useExpenses = () => useCollection<Expense & Rec>("expenses");
export const useWorkers = () => useCollection<Worker & Rec>("workers");
/**
 * Hours entries. `rows` leaves out the ones the owner deleted (they are kept as records: wage-hour law), so no total ever
 * counts them; `all` has them too (the owner's "Deleted hours" list, the location clean-up).
 */
export function useHours() {
  const c = useCollection<HourEntry & Rec>("hours");
  const rows = useMemo(() => c.rows.filter((h) => !h.deleted), [c.rows]);
  return { ...c, rows, all: c.rows };
}
export const usePayouts = () => useCollection<Payout & Rec>("payouts");
export const useClock = () => useCollection<ClockRec & Rec>("clock");
export const useEstimates = () => useCollection<Estimate & Rec>("estimates");
export const useJobPhotos = () => useCollection<JobPhoto & Rec>("jobphotos");
export const useJobChats = () => useCollection<JobChat & Rec>("jobchats");
export const useCrewJobs = () => useCollection<CrewJob & Rec>("crewjobs");
/** Messages of one job chat (jobchats/{chatId}/msgs). */
export const useTeamMsgs = (chatId: string) => useCollection<TeamMsg & Rec>(`jobchats/${chatId}/msgs`);

/** Company settings live in a single doc: settings/main. Missing fields fall back to defaults. */
export function useSettings() {
  const { company } = useAuth();
  const { rows, loading, save } = useCollection<Rec & { data?: Partial<Settings> }>("settings");
  const trade = normalizeTrade(company?.trade); // the company's trade is the single source of truth (company.trade)
  const settings = useMemo<Settings>(() => {
    const main = rows.find((r) => r.id === "main");
    const d = defaultSettings();
    if (!main) return { ...d, trade };
    const { id: _i, companyId: _c, createdAt: _a, updatedAt: _u, ...saved } = main as Record<string, unknown>;
    return { ...d, ...(saved as Partial<Settings>), trade };
  }, [rows, trade]);
  const update = useCallback((patch: Partial<Settings>) => save({ id: "main", ...settings, ...patch } as unknown as Rec), [save, settings]);
  return { settings, loading, update };
}

/** Next estimate number: settings counter, but never below the highest number already used. */
export function nextEstimateNumber(settings: Settings, estimates: Estimate[]): { number: string; n: number } {
  let n = settings.numbering.nextEst || 1001;
  for (const e of estimates) { const m = /(\d+)$/.exec(e.number || ""); if (m && Number(m[1]) >= n) n = Number(m[1]) + 1; }
  return { number: "EST-" + n, n };
}
