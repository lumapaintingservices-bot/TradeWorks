import { useEffect, type ReactNode } from "react";
import { useT } from "../i18n";
import { Icon } from "./Icon";
import "./ui.css";

/** Panel that slides in from the right (full screen on phones). Escape or a click on the dark backdrop closes it. */
export function Drawer({ title, sub, onClose, children }: { title: ReactNode; sub?: ReactNode; onClose(): void; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = was; };
  }, [onClose]);
  return (
    <div className="drawer-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal aria-label={typeof title === "string" ? title : undefined}>
        <div className="drawer-h">
          <div className="drawer-t"><h2>{title}</h2>{sub && <div className="drawer-sub">{sub}</div>}</div>
          <button className="btn sm icon-only" onClick={onClose} aria-label={t("Close", "Cerrar")} title={t("Close", "Cerrar")}><Icon name="x" size={18} /></button>
        </div>
        <div className="drawer-b">{children}</div>
      </div>
    </div>
  );
}
