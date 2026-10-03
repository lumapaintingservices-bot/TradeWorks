import { useEffect, useRef, useState } from "react";
import { useUi } from "../store/ui";
import { Icon } from "./Icon";
import "./ui.css";

export type RowItem = { label: string; icon?: string; onClick(): void; danger?: boolean; hidden?: boolean; disabled?: boolean };

/** "⋯" button with the row's other actions (idea from shadcn's Dropdown Menu). Floats above the table; Esc / click away closes. */
export function RowMenu({ items, label }: { items: RowItem[]; label?: string }) {
  const es = useUi((s) => s.lang) === "es";
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const list = items.filter((i) => !i.hidden);
  const open = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const right = Math.min(Math.max(8, window.innerWidth - r.right), window.innerWidth - 200); // stay on screen
    setPos(window.innerHeight - r.bottom < 260 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
  };
  const close = () => setPos(null);
  useEffect(() => {
    if (!pos) return;
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const away = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); btn.current?.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const bs = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [])], i = bs.indexOf(document.activeElement as HTMLButtonElement);
        bs[(i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length]?.focus();
      }
    };
    // follow the button on scroll / resize (phones: the browser bar), close only when it leaves the screen
    const move = (e: Event) => { if (e.target instanceof Node && menu.current?.contains(e.target)) return; const r = btn.current?.getBoundingClientRect(); if (!r || r.bottom < 0 || r.top > window.innerHeight) close(); else open(); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", key, true);
    window.addEventListener("resize", move); window.addEventListener("scroll", move, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key, true); window.removeEventListener("resize", move); window.removeEventListener("scroll", move, true); };
  }, [!!pos]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list.length) return null;
  return (
    <span className="rm" onClick={(e) => e.stopPropagation()}>
      <button ref={btn} type="button" className="btn sm rm-btn" aria-haspopup="menu" aria-expanded={!!pos} aria-label={label || (es ? "Más acciones" : "More actions")}
        title={label || (es ? "Más acciones" : "More actions")} onClick={() => (pos ? close() : open())}>⋯</button>
      {pos && (
        <div ref={menu} className="rm-menu" role="menu" style={{ position: "fixed", ...pos }}>
          {list.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled} className={"rm-it" + (it.danger ? " danger" : "")}
              onClick={() => { close(); it.onClick(); }}>
              {it.icon && <Icon name={it.icon} size={16} />}<span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
