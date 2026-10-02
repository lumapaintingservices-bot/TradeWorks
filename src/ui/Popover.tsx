import { useEffect, useRef, useState, type ReactNode } from "react";
import "./ui.css";

type Pos = { top?: number; bottom?: number; left?: number; right?: number };

/**
 * A button that opens a small floating panel next to it (idea from shadcn's Popover). The panel floats above everything (modals
 * don't cut it off), stays on screen, and closes with Esc, a click away or when the page scrolls. `children` gets `close`.
 */
export function Popover({ trigger, label, triggerClass = "", align = "start", disabled, children }: {
  trigger: ReactNode; label: string; triggerClass?: string; align?: "start" | "end"; disabled?: boolean; children: (close: () => void) => ReactNode;
}) {
  const [pos, setPos] = useState<Pos | null>(null);
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  const open = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth, vh = window.innerHeight, w = Math.min(280, vw - 16);
    const x: Pos = align === "end" ? { right: Math.min(Math.max(8, vw - r.right), vw - w - 8) } : { left: Math.min(Math.max(8, r.left), vw - w - 8) };
    setPos(vh - r.bottom < 300 && r.top > vh - r.bottom ? { ...x, bottom: vh - r.top + 4 } : { ...x, top: r.bottom + 4 });
  };
  const close = () => setPos(null);
  useEffect(() => {
    if (!pos) return;
    pop.current?.querySelector<HTMLElement>("button:not(:disabled), input, [tabindex='0']")?.focus({ preventScroll: true });
    const away = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); btn.current?.focus(); } };
    // page scrolled / resized (on phones also the keyboard or browser bar): follow the button, close only when it is off screen
    const move = (e: Event) => {
      if (e.target instanceof Node && pop.current?.contains(e.target)) return;
      const r = btn.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) close(); else open();
    };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", key, true);
    window.addEventListener("resize", move); window.addEventListener("scroll", move, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key, true); window.removeEventListener("resize", move); window.removeEventListener("scroll", move, true); };
  }, [!!pos]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className="pop-wrap" onClick={(e) => e.stopPropagation()}>
      <button ref={btn} type="button" className={"pop-btn " + triggerClass} disabled={disabled} aria-haspopup="dialog" aria-expanded={!!pos} aria-label={label} title={label}
        onClick={() => (pos ? close() : open())}>{trigger}</button>
      {pos && <div ref={pop} className="pop" role="dialog" aria-label={label} style={{ position: "fixed", ...pos }}>{children(close)}</div>}
    </span>
  );
}
