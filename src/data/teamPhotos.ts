import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useT } from "../i18n";
import { mergeTeamPhotos } from "../lib/jobPhotos";
import { deleteImage } from "../lib/storage";
import type { Estimate, PhotoRef } from "../lib/types";
import { useUi } from "../store/ui";
import { useEstimates, useJobPhotos, useWorkers } from "./hooks";
import { patchRec, removeRec } from "./repo";

/** Name of a worker for a photo ("Carlos"); "" until the workers are loaded. */
function useWorkerName() {
  const { rows, loading } = useWorkers();
  const nameOf = useCallback((id: string) => rows.find((w) => w.id === id)?.name || "", [rows]);
  return { nameOf, ready: !loading };
}

/**
 * Delete one photo of a job from outside the editor (client profile): off the job, off the worker's list if it is theirs,
 * and its file (unless "Our recent work" still shows it).
 */
export async function deleteJobPhoto(cid: string, e: Pick<Estimate, "id" | "photos">, ph: PhotoRef): Promise<void> {
  await patchRec(cid, "estimates", e.id, { photos: (e.photos || []).filter((x) => x.id !== ph.id) });
  if (ph.teamId) await removeRec(cid, "jobphotos", ph.teamId).catch(() => {});
  if (!ph.inWork) await deleteImage(ph.path);
}

/** A photo taken off a job: its file goes too, unless it is shown in "Our recent work" (the showcase still points at it). */
export const dropFiles = (dropped: PhotoRef[]) => { for (const ph of dropped) if (!ph.inWork) deleteImage(ph.path); };

/**
 * Owner / admin app (mounted in the Shell): copies the photos workers take onto their jobs (estimate.photos) and takes
 * deleted ones off, so every place that shows job photos (Photos tab, client link, work order, client profile) has them.
 */
export function useTeamPhotoSync() {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { role } = useAuth();
  const on = role === "owner" || role === "admin";
  const { rows: team, loading: l1 } = useJobPhotos();
  const { rows: ests, loading: l2, patch } = useEstimates();
  const { nameOf, ready } = useWorkerName();
  const inFlight = useRef(new Set<string>());
  useEffect(() => {
    if (!on || l1 || l2 || !ready) return;
    for (const e of ests) {
      if (inFlight.current.has(e.id)) continue;
      const r = mergeTeamPhotos(e.photos, team, e.id, nameOf);
      if (!r) continue;
      inFlight.current.add(e.id);
      patch(e.id, { photos: r.photos })
        .then(() => {
          dropFiles(r.dropped);
          if (r.added.length) {
            const who = r.added[0].by || t("Your team", "Tu equipo"), n = r.added.length;
            toast(t(`${who} added ${n} photo${n === 1 ? "" : "s"} to ${e.number}.`, `${who} agregó ${n} foto${n === 1 ? "" : "s"} a ${e.number}.`));
          }
        })
        .catch(() => { /* next change retries */ })
        .finally(() => inFlight.current.delete(e.id));
    }
  }, [on, team, ests, l1, l2, ready, nameOf, patch, t, toast]);
}

/**
 * The estimate editor keeps its own copy of the job while it is open: bring new team photos into that copy too
 * (otherwise its next save would drop them). `apply` receives the new photo list.
 */
export function useTeamPhotosInto(estId: string | undefined, getPhotos: () => PhotoRef[] | undefined, apply: (photos: PhotoRef[]) => void) {
  const { role } = useAuth();
  const on = role === "owner" || role === "admin";
  const { rows: team, loading } = useJobPhotos();
  const { nameOf, ready } = useWorkerName();
  const cb = useRef({ getPhotos, apply });
  cb.current = { getPhotos, apply };
  useEffect(() => {
    if (!on || !estId || loading || !ready) return;
    const photos = cb.current.getPhotos();
    if (photos === undefined && !team.some((p) => p.estId === estId)) return;
    const r = mergeTeamPhotos(photos, team, estId, nameOf);
    if (!r) return;
    cb.current.apply(r.photos);
    dropFiles(r.dropped);
  }, [on, estId, team, loading, ready, nameOf]);
}
