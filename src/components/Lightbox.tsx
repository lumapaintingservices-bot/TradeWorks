import { useEffect } from "react";
import { useT } from "../i18n";
import "./Lightbox.css";

export type LightboxItem = { url: string; cap?: string };

/** Full-screen photo viewer. Esc closes, the arrow keys (and ‹ ›) move. `index` < 0 = closed. */
export function Lightbox({ items, index, onIndex, onClose }: { items: LightboxItem[]; index: number; onIndex(i: number): void; onClose(): void }) {
  const t = useT();
  const n = items.length;
  useEffect(() => {
    if (index < 0) return;
    const h = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
      else if (ev.key === "ArrowRight" && index < n - 1) onIndex(index + 1);
      else if (ev.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [index, n, onIndex, onClose]);
  useEffect(() => { if (index >= n) (n ? onIndex(n - 1) : onClose()); }, [index, n, onIndex, onClose]);
  const it = index >= 0 ? items[index] : undefined;
  if (!it?.url) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal aria-label={t("Photo", "Foto")} onClick={onClose}>
      <img src={it.url} alt={it.cap || ""} onClick={(ev) => ev.stopPropagation()} />
      <button type="button" className="x" aria-label={t("Close", "Cerrar")} onClick={onClose}>×</button>
      {index > 0 && <button type="button" className="prev" aria-label={t("Previous", "Anterior")} onClick={(ev) => { ev.stopPropagation(); onIndex(index - 1); }}>‹</button>}
      {index < n - 1 && <button type="button" className="next" aria-label={t("Next", "Siguiente")} onClick={(ev) => { ev.stopPropagation(); onIndex(index + 1); }}>›</button>}
      {it.cap && <div className="cap">{it.cap}</div>}
    </div>
  );
}
