import { useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Lightbox } from "../../components/Lightbox";
import { UploadList, useUploadQueue } from "../../components/UploadQueue";
import { useJobPhotos, useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { jobTypeLabel, jobTypeOf, uid } from "../../lib/estimate";
import { fmtDate } from "../../lib/format";
import { shrinkImage } from "../../lib/image";
import { addShowcase, removeShowcase, SHOWCASE_MAX, showcaseCaption } from "../../lib/jobday";
import { deleteImage, putImage } from "../../lib/storage";
import type { PhotoRef } from "../../lib/types";
import { useUi } from "../../store/ui";
import type { TabProps } from "./types";
import "./jobday.css";

const KINDS = ["", "before", "after", "detail"] as const;

/** Photos tab: before / after / detail pictures, captions, "show on client link", "Our recent work". */
export default function PhotosTab({ e, set, lang }: TabProps) {
  const t = useT();
  const toast = useUi((x) => x.toast);
  const { company } = useAuth();
  const { settings, update } = useSettings();
  const photos = e.photos || [];
  const latest = useRef<PhotoRef[]>(photos);
  latest.current = photos;
  const [over, setOver] = useState(false);
  const { remove: removeTeamPhoto } = useJobPhotos();
  const [zoom, setZoom] = useState(-1);
  const fileIn = useRef<HTMLInputElement>(null);
  const camIn = useRef<HTMLInputElement>(null);
  const es = lang === "es";
  const kindLabel = (k: string) => (k === "before" ? t("Before", "Antes") : k === "after" ? t("After", "Después") : k === "detail" ? t("Detail", "Detalle") : t("No label", "Sin etiqueta"));

  const write = (next: PhotoRef[]) => { latest.current = next; set({ photos: next }); };
  const patch = (id: string, p: Partial<PhotoRef>) => write(latest.current.map((x) => (x.id === id ? { ...x, ...p } : x)));

  // each photo shows as an upload card (progress, retry) until it is saved on the job
  const q = useUploadQueue<null>(async (f, _m, onProgress) => {
    if (!company) throw new Error("signed out");
    const data = await shrinkImage(f, 1100, 0.8);
    const id = uid("ph");
    const { url, path } = await putImage(`companies/${company.id}/photos/${e.id}/${id}.jpg`, data, onProgress);
    write([...latest.current, { id, kind: "", caption: "", inWork: false, url, path }]);
  });
  const addFiles = (files: FileList | File[] | null) => {
    if (!company) { toast(t("Sign in first.", "Primero inicia sesión.")); return; }
    q.add(files, null);
  };

  const remove = async (ph: PhotoRef) => {
    const extra = ph.inWork ? " " + t("It stays in “Our recent work”.", "Se queda en “Trabajos recientes”.") : "";
    if (!confirm(t("Remove this photo?", "¿Quitar esta foto?") + extra)) return;
    write(latest.current.filter((x) => x.id !== ph.id));
    setZoom(-1);
    if (ph.teamId) removeTeamPhoto(ph.teamId).catch(() => {}); // a worker's photo: gone from their phone list too
    if (!ph.inWork) await deleteImage(ph.path); // a photo shared with "Our recent work" keeps its file, the showcase still points at it
  };

  const showcase = settings.showcase || [];
  const caption = (ph: PhotoRef) => showcaseCaption(e, ph, jobTypeLabel(jobTypeOf(e), es));
  const setInWork = async (ph: PhotoRef, on: boolean) => {
    if (on && !ph.url) return;
    try {
      await update({ showcase: on ? addShowcase(showcase, [{ id: ph.id, url: ph.url!, caption: caption(ph) }]) : removeShowcase(showcase, ph.id) });
      patch(ph.id, { inWork: on });
      toast(on ? t("Added to “Our recent work”.", "Agregado a “Trabajos recientes”.") : t("Removed from “Our recent work”.", "Quitado de “Trabajos recientes”."));
    } catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Inténtalo de nuevo.")); }
  };
  const afterOnes = photos.filter((p) => p.kind === "after" && !p.inWork && p.url);
  const sendAfters = async () => {
    if (!afterOnes.length) { toast(t("These after photos are already in your recent work.", "Estas fotos ya están en tus trabajos recientes.")); return; }
    try {
      await update({ showcase: addShowcase(showcase, afterOnes.map((p) => ({ id: p.id, url: p.url!, caption: caption(p) }))) });
      const ids = new Set(afterOnes.map((p) => p.id));
      write(latest.current.map((x) => (ids.has(x.id) ? { ...x, inWork: true } : x)));
      toast(t("Added to “Our recent work”.", "Agregado a “Trabajos recientes”."));
    } catch { toast(t("Couldn't save. Try again.", "No se pudo guardar. Inténtalo de nuevo.")); }
  };

  const closeZoom = () => setZoom(-1);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-h"><h2>{t("Job photos", "Fotos del trabajo")}</h2>
          <label className="chk"><input type="checkbox" checked={!!e.showPhotos} onChange={(ev) => set({ showPhotos: ev.target.checked })} />{t("Show on client link", "Mostrar en el enlace del cliente")}</label></div>
        <div className="card-b">
          <div className={"ph-drop" + (over ? " over" : "")}
            onDragOver={(ev) => { ev.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(ev) => { ev.preventDefault(); setOver(false); addFiles(ev.dataTransfer.files); }}>
            <b>{t("Add photos", "Agregar fotos")}</b> — {t("take a photo, choose from your library, or drag files here.", "toma una foto, elige de tu galería o arrastra archivos aquí.")}
            <div style={{ marginTop: 4, fontSize: 12.5 }}>{t("Resized automatically. Use them to count doors and drawers later.", "Se reducen automáticamente. Úsalas para contar puertas y cajones después.")}</div>
            <div className="ph-btns">
              <button type="button" className="btn pri" onClick={() => camIn.current?.click()}>{t("Take photo", "Tomar foto")}</button>
              <button type="button" className="btn" onClick={() => fileIn.current?.click()}>{t("Choose photos", "Elegir fotos")}</button>
            </div>
            <input ref={fileIn} type="file" accept="image/*" multiple hidden onChange={(ev) => { addFiles(ev.target.files); ev.target.value = ""; }} />
            <input ref={camIn} type="file" accept="image/*" capture="environment" hidden onChange={(ev) => { addFiles(ev.target.files); ev.target.value = ""; }} />
          </div>
          {q.items.length > 0 && <div className="ph-ups"><UploadList q={q} /></div>}
          {e.showPhotos && photos.length > 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>{t("The client sees these photos on their link, between the summary and the scope of work. Photos from your team only when you tick “Show to the client”.", "El cliente ve estas fotos en su enlace, entre el resumen y el alcance del trabajo. Las fotos de tu equipo solo si marcas “Mostrar al cliente”.")}</p>}

          {photos.length === 0 && !q.items.length
            ? <p className="muted" style={{ fontSize: 13.5, marginTop: 14 }}>{t("No photos on this job yet.", "Todavía no hay fotos en este trabajo.")}</p>
            : <div className="ph-grid">{photos.map((ph, i) => (
              <div className="ph-card" key={ph.id}>
                <button type="button" className="ph-thumb" onClick={() => setZoom(i)} aria-label={t("Zoom", "Ampliar")}>
                  {ph.url ? <img src={ph.url} alt={ph.caption || t("Job photo", "Foto del trabajo")} loading="lazy" /> : null}
                  {ph.kind && <span className="ph-tag">{kindLabel(ph.kind)}</span>}
                  {ph.inWork && <span className="ph-star">★ {t("Our work", "Nuestro trabajo")}</span>}
                  {ph.teamId && <span className="ph-by">{ph.by || t("Team", "Equipo")}{ph.at ? " · " + fmtDate(ph.at.slice(0, 10), lang) : ""}</span>}
                </button>
                <div className="ph-meta">
                  <input value={ph.caption} placeholder={t("Caption (optional)", "Descripción (opcional)")} aria-label={t("Caption", "Descripción")} onChange={(ev) => patch(ph.id, { caption: ev.target.value })} />
                  <div className="ph-row">
                    <select value={ph.kind || ""} aria-label={t("Type", "Tipo")} onChange={(ev) => patch(ph.id, { kind: ev.target.value })}>
                      {KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}</select>
                    <button type="button" className="btn sm danger" onClick={() => remove(ph)} title={t("Remove photo", "Quitar foto")} aria-label={t("Remove photo", "Quitar foto")}>×</button>
                  </div>
                  <label className="ph-work"><input type="checkbox" checked={!!ph.inWork} disabled={!ph.url} onChange={(ev) => setInWork(ph, ev.target.checked)} />{t("Our recent work", "Trabajos recientes")}</label>
                  {ph.teamId && <label className="ph-work" title={t("Photos from your team stay private until you share them", "Las fotos de tu equipo son privadas hasta que las compartas")}>
                    <input type="checkbox" checked={!!ph.toClient} onChange={(ev) => patch(ph.id, { toClient: ev.target.checked })} />{t("Show to the client", "Mostrar al cliente")}</label>}
                </div>
              </div>))}</div>}

          {photos.some((p) => p.kind === "after") && (
            <div className="jd-tools">
              <button type="button" className="btn sm" onClick={sendAfters} disabled={!afterOnes.length}>
                {t(`Send after photos to “Our recent work” (${afterOnes.length})`, `Mandar fotos del después a “Trabajos recientes” (${afterOnes.length})`)}</button>
              <span className="muted" style={{ fontSize: 12.5, alignSelf: "center" }}>{t(`Shown on every client link · ${showcase.length}/${SHOWCASE_MAX}`, `Se muestra en todos los enlaces · ${showcase.length}/${SHOWCASE_MAX}`)}</span>
            </div>)}
        </div>
      </div>

      <Lightbox index={zoom} onIndex={setZoom} onClose={closeZoom}
        items={photos.map((p) => ({ url: p.url || "", cap: [p.kind ? kindLabel(p.kind) : "", p.caption, p.teamId && p.by ? "📷 " + p.by : ""].filter(Boolean).join(" — ") }))} />
    </div>
  );
}
