import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { portalApply, type PortalDoc } from "../lib/portal";
import type { Estimate } from "../lib/types";
import { useUi } from "../store/ui";
import { useEstimates } from "./hooks";
import { subscribeTop } from "./repo";

/** Estimates open in the editor right now: the editor applies its own client-link news, so the Shell leaves them alone. */
export const openEditors = new Set<string>();

/** Jobs whose client link is still worth watching (a job paid in full or declined has nothing left to sign). */
const watched = (e: Estimate) => !!e.portal?.token && e.status !== "Paid in Full" && e.status !== "Declined";

/**
 * Owner / admin app (mounted in the Shell). What clients do on their links — opened it, picked options, signed, wrote, says they paid —
 * reaches the estimate even when nobody has it open, so "Who to write to today", the pipeline stage and the deposit at signing follow
 * at once. Before, it was applied only when the owner opened that estimate. One listener per open link (visitors' links are read by
 * token; the rules don't allow listing them).
 */
export function usePortalInbox() {
  const { role, company } = useAuth();
  const on = role === "owner" || role === "admin";
  const lang = useUi((s) => s.lang);
  const toast = useUi((s) => s.toast);
  const { rows: ests, loading, save } = useEstimates();
  const tokens = useMemo(() => (on ? ests.filter(watched).map((e) => e.portal!.token).sort() : []), [on, ests]);
  const key = tokens.join(",");
  const [docs, setDocs] = useState<Record<string, PortalDoc | null>>({});
  useEffect(() => {
    if (!on || !company || !key) return;
    const offs = key.split(",").map((tk) => subscribeTop<PortalDoc>("portal", tk, (d) => setDocs((m) => (m[tk] === d ? m : { ...m, [tk]: d }))));
    return () => offs.forEach((off) => off());
  }, [on, company?.id, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = useRef(new Set<string>());
  useEffect(() => {
    if (!on || loading) return;
    for (const e of ests) {
      const d = e.portal?.token ? docs[e.portal.token] : undefined;
      if (!d || openEditors.has(e.id) || busy.current.has(e.id)) continue;
      const r = portalApply(e, d.client, lang);
      if (!r.changed) continue;
      busy.current.add(e.id);
      const signed = !e.signature && !!r.e.signature;
      save(r.e as Estimate & { id: string })
        .then(() => { if (signed && r.news) toast(r.news); })
        .catch(() => { /* tried again on the next change */ })
        .finally(() => busy.current.delete(e.id));
    }
  }, [on, loading, ests, docs, lang]); // eslint-disable-line react-hooks/exhaustive-deps
}
