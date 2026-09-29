import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { jobTypeLabel, jobTypeOf, uid } from "../../lib/estimate";
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
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [zoom, setZoom] = useState(-1);
  const fileIn = useRef<HTMLInputElement>(null);
  const camIn = useRef<HTMLInputElement>(null);
  const es = lang === "es";
  const kindLabel = (k: string) => (k === "before" ? t("Before", "Antes") : k === "after" ? t("After", "Después") : k === "detail" ? t("Detail", "Detalle") : t("No label", "Sin etiqueta"));

  const write = (next: PhotoRef[]) => { latest.current = next; set({ photos: next }); };
  const patch = (id: string, p: Partial<PhotoRef>) => write(latest.current.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const addFiles = async (files: FileList | File[] | null) => {
    const list = Array.from(files || []).filter((f) => /^image\//.test(f.type));
    if (!list.length) return;
    if (!company) { toast(t("Sign in first.", "Primero inicia sesión.")); return; }
    setBusy((n) => n + list.length);
    let ok = 0;
    for (const f of list) {
      try {
        const data = await shrinkImage(f, 1100, 0.8);
        const id = uid("ph");
        const { url, path } = await putImage(`companies/${company.id}/photos/${e.id}/${id}.jpg`, data);
        write([...latest.current, { id, kind: "", caption: "", inWork: false, url, path }]);
        ok++;
      } catch {
        toast(t("Couldn't add a photo. Check your connection and try again.", "No se pudo agregar una foto. Revisa tu conexión e inténtalo de nuevo."));
      } finally { setBusy((n) => n - 1); }
    }
    if (ok) toast(ok === 1 ? t("Photo added.", "Foto agregada.") : t(`${ok} photos added.`, `${ok} fotos agregadas.`));
  };

  const remove = async (ph: PhotoRef) => {
    const extra = ph.inWork ? " " + t("It stays in “Our recent work”.", "Se queda en “Trabajos recientes”.") : "";
    if (!confirm(t("Remove this photo?", "¿Quitar esta foto?") + extra)) return;
    write(latest.current.filter((x) => x.id !== ph.id));
    setZoom(-1);
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

  // lightbox: Esc closes, arrows move
  useEffect(() => {
    if (zoom < 0) return;
    const h = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setZoom(-1);
      else if (ev.key === "ArrowRight") setZoom((z) => Math.min(latest.current.length - 1, z + 1));
      else if (ev.key === "ArrowLeft") setZoom((z) => Math.max(0, z - 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [zoom]);
  const zp = zoom >= 0 ? photos[zoom] : undefined;
  useEffect(() => { if (zoom >= photos.length) setZoom(photos.length - 1); }, [photos.length, zoom]);

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
          {busy > 0 && <p className="ph-busy" role="status">{t(`Adding ${busy} photo${busy === 1 ? "" : "s"}…`, `Agregando ${busy} foto${busy === 1 ? "" : "s"}…`)}</p>}
          {e.showPhotos && photos.length > 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>{t("The client sees these photos on their link, between the summary and the scope of work.", "El cliente ve estas fotos en su enlace, entre el resumen y el alcance del trabajo.")}</p>}

          {photos.length === 0 && busy === 0
            ? <p className="muted" style={{ fontSize: 13.5, marginTop: 14 }}>{t("No photos on this job yet.", "Todavía no hay fotos en este trabajo.")}</p>
            : <div className="ph-grid">{photos.map((ph, i) => (
              <div className="ph-card" key={ph.id}>
                <button type="button" className="ph-thumb" onClick={() => setZoom(i)} aria-label={t("Zoom", "Ampliar")}>
                  {ph.url ? <img src={ph.url} alt={ph.caption || t("Job photo", "Foto del trabajo")} loading="lazy" /> : null}
                  {ph.kind && <span className="ph-tag">{kindLabel(ph.kind)}</span>}
                  {ph.inWork && <span className="ph-star">★ {t("Our work", "Nuestro trabajo")}</span>}
                </button>
                <div className="ph-meta">
                  <input value={ph.caption} placeholder={t("Caption (optional)", "Descripción (opcional)")} aria-label={t("Caption", "Descripción")} onChange={(ev) => patch(ph.id, { caption: ev.target.value })} />
                  <div className="ph-row">
                    <select value={ph.kind || ""} aria-label={t("Type", "Tipo")} onChange={(ev) => patch(ph.id, { kind: ev.target.value })}>
                      {KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}</select>
                    <button type="button" className="btn sm danger" onClick={() => remove(ph)} title={t("Remove photo", "Quitar foto")} aria-label={t("Remove photo", "Quitar foto")}>×</button>
                  </div>
                  <label className="ph-work"><input type="checkbox" checked={!!ph.inWork} disabled={!ph.url} onChange={(ev) => setInWork(ph, ev.target.checked)} />{t("Our recent work", "Trabajos recientes")}</label>
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

      {zp?.url && (
        <div className="ph-light" role="dialog" aria-modal aria-label={t("Photo", "Foto")} onClick={() => setZoom(-1)}>
          <img src={zp.url} alt={zp.caption || ""} onClick={(ev) => ev.stopPropagation()} />
          <button type="button" className="x" aria-label={t("Close", "Cerrar")} onClick={() => setZoom(-1)}>×</button>
          {zoom > 0 && <button type="button" className="prev" aria-label={t("Previous", "Anterior")} onClick={(ev) => { ev.stopPropagation(); setZoom(zoom - 1); }}>‹</button>}
          {zoom < photos.length - 1 && <button type="button" className="next" aria-label={t("Next", "Siguiente")} onClick={(ev) => { ev.stopPropagation(); setZoom(zoom + 1); }}>›</button>}
          {(zp.kind || zp.caption) && <div className="cap">{[zp.kind ? kindLabel(zp.kind) : "", zp.caption].filter(Boolean).join(" — ")}</div>}
        </div>)}
    </div>
  );
}
