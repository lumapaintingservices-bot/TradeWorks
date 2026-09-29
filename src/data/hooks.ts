import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { defaultSettings } from "../lib/settings";
import type { Client, Estimate, Invoice, Settings, Task } from "../lib/types";
import { removeRec, saveRec, subscribe, type Rec } from "./repo";

export function useCollection<T extends Rec>(col: string) {
  const { company } = useAuth();
  const cid = company?.id;
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!cid) return;
    setLoading(true);
    return subscribe<T>(cid, col, (r) => { setRows(r); setLoading(false); });
  }, [cid, col]);
  const save = useCallback((r: T) => saveRec(cid!, col, r), [cid, col]);
  const remove = useCallback((id: string) => removeRec(cid!, col, id), [cid, col]);
  return { rows, loading, save, remove };
}
export const useClients = () => useCollection<Client & Rec>("clients");
export const useInvoices = () => useCollection<Invoice & Rec>("invoices");
export const useTasks = () => useCollection<Task & Rec>("tasks");
export const useEstimates = () => useCollection<Estimate & Rec>("estimates");

/** Company settings live in a single doc: settings/main. Missing fields fall back to defaults. */
export function useSettings() {
  const { rows, loading, save } = useCollection<Rec & { data?: Partial<Settings> }>("settings");
  const settings = useMemo<Settings>(() => {
    const main = rows.find((r) => r.id === "main");
    const d = defaultSettings();
    if (!main) return d;
    const { id: _i, companyId: _c, createdAt: _a, updatedAt: _u, ...saved } = main as Record<string, unknown>;
    return { ...d, ...(saved as Partial<Settings>) };
  }, [rows]);
  const update = useCallback((patch: Partial<Settings>) => save({ id: "main", ...settings, ...patch } as unknown as Rec), [save, settings]);
  return { settings, loading, update };
}

/** Next estimate number: settings counter, but never below the highest number already used. */
export function nextEstimateNumber(settings: Settings, estimates: Estimate[]): { number: string; n: number } {
  let n = settings.numbering.nextEst || 1001;
  for (const e of estimates) { const m = /(\d+)$/.exec(e.number || ""); if (m && Number(m[1]) >= n) n = Number(m[1]) + 1; }
  return { number: "EST-" + n, n };
}
