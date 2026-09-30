import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentGroup, AttachmentMedia, AttachmentTitle, AttachmentTrigger } from "../../components/Attachment";
import { Lightbox } from "../../components/Lightbox";
import { UploadList, useUploadQueue } from "../../components/UploadQueue";
import { useJobPhotos } from "../../data/hooks";
import { useT } from "../../i18n";
import { todayISO, uid } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { shrinkImage } from "../../lib/image";
import { PHOTO_KINDS, dataUrlSize, fmtSize, photoJobOptions, type PhotoKind } from "../../lib/jobPhotos";
import { putImage } from "../../lib/storage";
import type { ClockRec, JobPhoto, Task } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Icon } from "../../ui/Icon";
import "./worker.css";

type Meta = { estId: string; jobLabel: string; kind: PhotoKind };

/**
 * Worker page: take before / after photos of a job. Photos go to the worker's own folder (jobphotos) and the owner's app
 * puts them on the job (src/data/teamPhotos.ts). Jobs = the one I'm clocked in to + my tasks' jobs around today.
 */
export function WorkerPhotos({ workerId, tasks, clock }: { workerId: string; tasks: Task[]; clock?: ClockRec }) {
  const t = useT();
  const lang = useUi((s) => s.lang), toast = useUi((s) => s.toast);
  const { company } = useAuth();
  const { rows, save, remove } = useJobPhotos();
  const today = todayISO();
  const opts = useMemo(() => photoJobOptions(tasks, today, clock), [tasks, today, clock]);
  const [pick, setPick] = useState("");
  const job = opts.find((o) => o.estId === pick) || opts[0];
  const mine = useMemo(() => rows.filter((p) => p.workerId === workerId && job && p.estId === job.estId)
    .sort((a, b) => String(a.at).localeCompare(String(b.at))), [rows, workerId, job]);
  // type of the next photo: "before" until this job has a before photo, then "after" (the worker can change it)
  const [kind, setKind] = useState<PhotoKind>("before");
  const kindFor = useRef("");
  useEffect(() => {
    if (!job || kindFor.current === job.estId) return;
    kindFor.current = job.estId;
    setKind(mine.some((p) => p.kind === "before") ? "after" : "before");
  }, [job, mine]);
  const [zoom, setZoom] = useState(-1);
  const camIn = useRef<HTMLInputElement>(null), fileIn = useRef<HTMLInputElement>(null);

  const kindLabel = (k: string) => (k === "before" ? t("Before", "Antes") : k === "after" ? t("After", "Después") : k === "detail" ? t("Detail", "Detalle") : t("Photo", "Foto"));
  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang === "es" ? "es" : "en", { hour: "numeric", minute: "2-digit" });

  const q = useUploadQueue<Meta>(async (file, m, onProgress) => {
    if (!company) throw new Error("signed out");
    const data = await shrinkImage(file, 1600, 0.8);
    const id = uid("jp");
    const { url, path } = await putImage(`companies/${company.id}/jobphotos/${workerId}/${id}.jpg`, data, onProgress);
    const now = new Date().toISOString();
    await save({ id, workerId, estId: m.estId, jobLabel: m.jobLabel.slice(0, 120), kind: m.kind, caption: "", url, path, date: todayISO(), at: now, size: dataUrlSize(data) } as JobPhoto);
  });
  const add = (files: FileList | null) => {
    if (!job) return;
    q.add(files, { estId: job.estId, jobLabel: job.label, kind });
  };
  const del = async (p: JobPhoto) => {
    if (!confirm(t("Delete this photo?", "¿Borrar esta foto?"))) return;
    setZoom(-1);
    try { await remove(p.id); toast(t("Photo deleted.", "Foto borrada.")); } catch { toast(t("Couldn't delete. Try again.", "No se pudo borrar. Intenta otra vez.")); }
  };
  const groups = PHOTO_KINDS.map((k) => ({ k, list: mine.filter((p) => (p.kind || "detail") === k) })).filter((g) => g.list.length);
  const ordered = groups.flatMap((g) => g.list);

  return (
    <section className="card tm-sec wk-ph">
      <div className="card-h"><h2>{t("Job photos", "Fotos del trabajo")}</h2>{mine.length > 0 && <span className="muted wk-ph-n">{mine.length}</span>}</div>
      {!job ? (
        <p className="muted tm-empty">{t("When your boss gives you a task linked to a job, you can take before and after photos of it here.",
          "Cuando tu jefe te dé una tarea vinculada a un trabajo, aquí podrás tomar fotos de antes y después.")}</p>
      ) : (
        <div className="wk-ph-b">
          {opts.length > 1
            ? <label className="f wk-ph-job">{t("Job", "Trabajo")}
                <select value={job.estId} onChange={(e) => setPick(e.target.value)}>{opts.map((o) => <option key={o.estId} value={o.estId}>{o.label}</option>)}</select></label>
            : <p className="wk-ph-one"><span className="muted">{t("Job: ", "Trabajo: ")}</span>{job.label}</p>}

          <div className="seg wk-ph-kind" role="group" aria-label={t("Photo type", "Tipo de foto")}>
            {PHOTO_KINDS.map((k) => <button key={k} type="button" className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>{kindLabel(k)}</button>)}
          </div>
          <div className="wk-ph-btns">
            <button type="button" className="btn pri" onClick={() => camIn.current?.click()}><Icon name="camera" size={18} />{t("Take photo", "Tomar foto")}</button>
            <button type="button" className="btn" onClick={() => fileIn.current?.click()}><Icon name="image" size={18} />{t("From gallery", "De la galería")}</button>
          </div>
          <input ref={camIn} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          <input ref={fileIn} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

          <UploadList q={q} label={(m) => kindLabel(m.kind)} />

          {groups.length === 0 && !q.items.length && <p className="muted wk-ph-none">{t("No photos of this job yet. Take one before you start and one when you finish.", "Todavía no hay fotos de este trabajo. Toma una antes de empezar y otra al terminar.")}</p>}
          {groups.map((g) => (
            <div key={g.k} className="wk-ph-g">
              <div className="wk-ph-gh">{kindLabel(g.k)} <span className="muted">· {g.list.length}</span></div>
              <AttachmentGroup>{g.list.map((p) => {
                const name = kindLabel(p.kind) + " · " + (p.date === today ? time(p.at) : fmtDate(p.date, lang));
                return (
                  <Attachment key={p.id} orientation="vertical">
                    <AttachmentMedia variant="image"><img src={p.url} alt={name} loading="lazy" /></AttachmentMedia>
                    <AttachmentContent>
                      <AttachmentTitle>{name}</AttachmentTitle>
                      <AttachmentDescription>{["JPG", p.size ? fmtSize(p.size) : ""].filter(Boolean).join(" · ")}</AttachmentDescription>
                    </AttachmentContent>
                    <AttachmentActions>
                      <AttachmentAction aria-label={t("Delete ", "Borrar ") + name} title={t("Delete", "Borrar")} onClick={() => del(p)}><Icon name="x" size={14} /></AttachmentAction>
                    </AttachmentActions>
                    <AttachmentTrigger aria-label={t("Open ", "Abrir ") + name} onClick={() => setZoom(ordered.indexOf(p))} />
                  </Attachment>);
              })}</AttachmentGroup>
            </div>))}
          <p className="muted wk-ph-note">{t("Your boss sees these photos on the job.", "Tu jefe ve estas fotos en el trabajo.")}</p>
        </div>
      )}
      <Lightbox index={zoom} onIndex={setZoom} onClose={() => setZoom(-1)}
        items={ordered.map((p) => ({ url: p.url, cap: kindLabel(p.kind) + " — " + fmtDate(p.date, lang) + " " + time(p.at) }))} />
    </section>
  );
}
