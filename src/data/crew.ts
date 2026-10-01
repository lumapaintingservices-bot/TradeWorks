import { useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";
import { cleanDone, crewSnapshot, mergeDoneIntoCheck, snapshotChanged, toggleDone } from "../lib/crew";
import type { CrewJob } from "../lib/types";
import { useClients, useCrewJobs, useEstimates, useJobChats, useWorkers } from "./hooks";
import { patchRec, removeRec, saveRec, type Rec } from "./repo";

/**
 * Owner / admin app (mounted in the Shell): keeps each crew's copy of its job (crewjobs/{estId}) in step with the estimate,
 * deletes it when the job has no crew any more, brings the crew's checklist ticks back into estimate.check, and adds new
 * crew members to the job's team chat if there is one.
 */
export function useCrewSync() {
  const { role, company } = useAuth();
  const on = role === "owner" || role === "admin";
  const cid = company?.id || "";
  const { rows: ests, loading: l1, patch: patchEst } = useEstimates();
  const { rows: docs, loading: l2 } = useCrewJobs();
  const { rows: clients, loading: l3 } = useClients();
  const { rows: workers, loading: l4 } = useWorkers();
  const { rows: chats, loading: l5 } = useJobChats();
  const busy = useRef(new Set<string>());
  useEffect(() => {
    if (!on || !cid || l1 || l2 || l3 || l4 || l5) return;
    const run = (key: string, fn: () => Promise<unknown>) => {
      if (busy.current.has(key)) return;
      busy.current.add(key);
      fn().catch(() => { /* retried on the next change */ }).finally(() => busy.current.delete(key));
    };
    for (const e of ests) {
      const doc = docs.find((d) => d.id === e.id);
      if (!e.crew?.length) { if (doc) run("del:" + e.id, () => removeRec(cid, "crewjobs", e.id)); continue; }
      const snap = crewSnapshot(e, clients, workers);
      if (!doc) {
        // first time: the crew starts from the ticks already on the estimate
        run("put:" + e.id, () => saveRec(cid, "crewjobs", { ...snap, done: cleanDone(e.check, snap.checklist), doneBy: {} } as CrewJob & Rec));
        continue;
      }
      if (snapshotChanged(doc, snap)) { const { id: _i, ...fields } = snap; run("put:" + e.id, () => patchRec(cid, "crewjobs", e.id, fields)); }
      const check = mergeDoneIntoCheck(e.check, doc);
      if (check) run("chk:" + e.id, () => patchEst(e.id, { check }));
      const chat = chats.find((c) => c.id === e.id);
      const missing = chat ? e.crew.filter((w) => !chat.members.includes(w)) : [];
      if (chat && missing.length) run("chat:" + e.id, () => patchRec(cid, "jobchats", e.id, { members: [...chat.members, ...missing] }));
    }
    // a deleted job: its crew copy goes too
    for (const d of docs) if (!ests.some((e) => e.id === d.id)) run("del:" + d.id, () => removeRec(cid, "crewjobs", d.id));
  }, [on, cid, ests, docs, clients, workers, chats, l1, l2, l3, l4, l5, patchEst]);
}

/** The open estimate editor keeps its own copy: bring the crew's ticks into it too (else its next save would undo them). */
export function useCrewTicksInto(estId: string | undefined, getCheck: () => Record<string, string> | undefined, apply: (check: Record<string, string>) => void) {
  const { role } = useAuth();
  const on = role === "owner" || role === "admin";
  const { rows: docs, loading } = useCrewJobs();
  const doc = docs.find((d) => d.id === estId);
  const cb = useRef({ getCheck, apply });
  cb.current = { getCheck, apply };
  const sig = doc ? JSON.stringify(doc.done || {}) : "";
  useEffect(() => {
    if (!on || loading || !doc) return;
    const next = mergeDoneIntoCheck(cb.current.getCheck(), doc);
    if (next) cb.current.apply(next);
  }, [on, loading, sig]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Tick / untick a line on a crew checklist (worker's phone, or the owner's Job day tab when the job has a crew). */
export async function tickCrew(cid: string, cj: Pick<CrewJob, "id" | "done" | "doneBy">, key: string, on: boolean, by: string): Promise<void> {
  await patchRec(cid, "crewjobs", cj.id, toggleDone(cj, key, on, by));
}
