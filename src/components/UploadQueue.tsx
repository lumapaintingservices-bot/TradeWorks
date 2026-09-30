import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { Icon } from "../ui/Icon";
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentMedia, AttachmentTitle } from "./Attachment";

/** One photo on its way up: a local preview, how far it got, and what it is for (`meta`, kept for a retry). */
export type Upload<M> = { id: string; name: string; file: File; preview: string; meta: M; state: "uploading" | "processing" | "error"; pct: number };
/** Does the work for one file: shrink, upload (reporting 0..1), save the record. Throws on failure. */
export type UploadRun<M> = (file: File, meta: M, onProgress: (f: number) => void) => Promise<void>;

let seq = 0;
/**
 * Photo upload queue: each picked image shows as a card (Uploading · 64% → Saving… → gone once saved, or
 * "Upload failed. Try again." with a retry button). Several files upload at once.
 */
export function useUploadQueue<M>(run: UploadRun<M>) {
  const [items, setItems] = useState<Upload<M>[]>([]);
  const runRef = useRef(run);
  runRef.current = run;
  const live = useRef(true);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    live.current = true; // (again after React's dev double mount)
    return () => { live.current = false; itemsRef.current.forEach((u) => URL.revokeObjectURL(u.preview)); };
  }, []);

  const patch = (id: string, p: Partial<Upload<M>>) => { if (live.current) setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x))); };
  const drop = (id: string) => { if (!live.current) return; setItems((xs) => { const u = xs.find((x) => x.id === id); if (u) URL.revokeObjectURL(u.preview); return xs.filter((x) => x.id !== id); }); };
  const go = (u: Upload<M>) => {
    runRef.current(u.file, u.meta, (f) => patch(u.id, f >= 1 ? { pct: 1, state: "processing" } : { pct: f, state: "uploading" }))
      .then(() => drop(u.id), () => patch(u.id, { state: "error" }));
  };
  const add = (files: FileList | File[] | null, meta: M) => {
    const list = Array.from(files || []).filter((f) => /^image\//.test(f.type));
    const ups = list.map((file): Upload<M> => ({ id: "up" + ++seq, name: file.name || "photo.jpg", file, preview: URL.createObjectURL(file), meta, state: "uploading", pct: 0 }));
    if (!ups.length) return 0;
    setItems((xs) => [...xs, ...ups]);
    ups.forEach(go);
    return ups.length;
  };
  const retry = (id: string) => { const u = itemsRef.current.find((x) => x.id === id); if (u) { patch(id, { state: "uploading", pct: 0 }); go({ ...u, state: "uploading", pct: 0 }); } };
  return { items, add, retry, dismiss: drop, busy: items.some((x) => x.state !== "error") };
}

/** The cards for a queue (nothing when it is empty). */
export function UploadList<M>({ q, label }: { q: ReturnType<typeof useUploadQueue<M>>; label?: (meta: M) => string }) {
  const t = useT();
  if (!q.items.length) return null;
  return (
    <div className="att-list" role="status" aria-live="polite">
      {q.items.map((u) => {
        const what = label ? label(u.meta) : "";
        const desc = u.state === "error" ? t("Upload failed. Try again.", "No se pudo subir. Inténtalo de nuevo.")
          : u.state === "processing" ? t("Saving…", "Guardando…")
          : t("Uploading", "Subiendo") + " · " + Math.round(u.pct * 100) + "%";
        return (
          <Attachment key={u.id} state={u.state} progress={u.pct}>
            <AttachmentMedia variant="image">{u.state === "error" ? <Icon name="alert" size={18} /> : <img src={u.preview} alt="" />}</AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{what ? what + " · " : ""}{u.name}</AttachmentTitle>
              <AttachmentDescription>{desc}</AttachmentDescription>
            </AttachmentContent>
            {u.state === "error" && (
              <AttachmentActions>
                <AttachmentAction aria-label={t("Try again", "Intentar otra vez") + " " + u.name} title={t("Try again", "Intentar otra vez")} onClick={() => q.retry(u.id)}><Icon name="refresh" size={16} /></AttachmentAction>
                <AttachmentAction aria-label={t("Remove", "Quitar") + " " + u.name} title={t("Remove", "Quitar")} onClick={() => q.dismiss(u.id)}><Icon name="x" size={16} /></AttachmentAction>
              </AttachmentActions>)}
          </Attachment>
        );
      })}
    </div>
  );
}
