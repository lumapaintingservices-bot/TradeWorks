import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useT } from "../i18n";
import { leadClientId, leadToClient, type Lead } from "../lib/leads";
import type { Client } from "../lib/types";
import { useUi } from "../store/ui";
import { useClients } from "./hooks";
import { deleteTop, getTop, saveRec, subscribeOwned, updateTop } from "./repo";

/**
 * Web requests from the public form (top-level leads/{id}) that are not yet clients.
 * Imported lead photos are copied into the company's own `photos` collection ({id, data}) and
 * referenced from client.photos ({id, kind, caption}) so the client doc stays small (Firestore 1 MB limit).
 */
export function useLeadInbox() {
  const { company } = useAuth();
  const cid = company?.id;
  const t = useT();
  const toast = useUi((s) => s.toast);
  const { rows: clients, loading, save } = useClients();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (cid) return subscribeOwned<Lead>("leads", cid, setLeads); }, [cid]);

  const pending = useMemo(() => {
    if (loading) return [];
    const ids = new Set(clients.map((c) => c.id));
    return leads.filter((l) => !l.imported && !ids.has(leadClientId(l.id))).sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  }, [leads, clients, loading]);

  const importLead = useCallback(async (lead: Lead, quiet = false) => {
    if (!cid) return;
    const photos: NonNullable<Client["photos"]> = [];
    for (const pid of (lead.photos || []).slice(0, 5)) {
      try {
        const p = await getTop<{ data?: string }>(`leads/${lead.id}/photos`, pid);
        if (!p?.data) continue;
        const id = `wl-${lead.id.slice(0, 8)}-${pid.slice(0, 8)}`;
        await saveRec(cid, "photos", { id, data: p.data } as never);
        photos.push({ id, kind: "before", caption: "" });
      } catch { /* a missing photo never blocks the import */ }
    }
    const client = leadToClient(lead, clients, photos);
    if (client) await save(client as Client & { id: string });
    try { await updateTop("leads", lead.id, { imported: true }); } catch { /* ignore */ }
    if (!quiet) toast(t(`New request imported: ${lead.name || ""}`, `Solicitud importada: ${lead.name || ""}`));
  }, [cid, clients, save, t, toast]);

  const importAll = useCallback(async () => {
    setBusy(true);
    try { for (const l of pending) await importLead(l, true); toast(t(`${pending.length} requests imported`, `${pending.length} solicitudes importadas`)); }
    finally { setBusy(false); }
  }, [pending, importLead, t, toast]);

  const dismiss = useCallback(async (lead: Lead) => {
    for (const pid of lead.photos || []) { try { await deleteTop(`leads/${lead.id}/photos`, pid); } catch { /* ignore */ } }
    await deleteTop("leads", lead.id);
  }, []);

  return { pending, importLead, importAll, dismiss, busy };
}
