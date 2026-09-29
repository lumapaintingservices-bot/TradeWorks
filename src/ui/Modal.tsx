import { useEffect, type ReactNode } from "react";
import { useT } from "../i18n";
import "./ui.css";

export function Modal({ title, onClose, children, wide }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  const t = useT();
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal-card" + (wide ? " wide" : "")} role="dialog" aria-modal aria-label={title}>
        <div className="modal-h"><h2>{title}</h2><button className="btn sm" onClick={onClose}>{t("Close", "Cerrar")}</button></div>
        <div className="modal-b">{children}</div>
      </div>
    </div>
  );
}
