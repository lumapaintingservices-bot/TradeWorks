import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function EmptyState({ icon, title, text, children }: { icon: string; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="es">
      <div className="ic"><Icon name={icon} group="empty" size={26} /></div>
      <h3>{title}</h3><p>{text}</p>
      {children && <div className="row">{children}</div>}
    </div>
  );
}
