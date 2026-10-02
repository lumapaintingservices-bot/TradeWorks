import { useEffect, useMemo, useRef, useState } from "react";
import { fold } from "../lib/search";
import { useUi } from "../store/ui";
import "./ui.css";

/** Mouse / trackpad: focus the search box at once. Touch: don't, or the keyboard pops up and covers the list. */
const FINE = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;

export type ComboOpt = { value: string; label: string; sub?: string };

/**
 * A select you can type into (idea from shadcn's Combobox): click, type "ana", pick with the mouse or ↑ ↓ Enter.
 * `none` = the label of the empty choice ("No job"). The list floats above everything, so modals don't cut it off.
 */
export function Combobox({ value, options, onChange, none, placeholder, ariaLabel }: {
  value: string; options: ComboOpt[]; onChange(v: string): void; none?: string; placeholder?: string; ariaLabel?: string;
}) {
  const es = useUi((s) => s.lang) === "es";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 0 });
  const btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null), pop = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.value === value);

  const shown = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    const hit = options.filter((o) => { const f = fold(o.label + " " + (o.sub || "")); return words.every((w) => f.includes(w)); });
    return none !== undefined && !words.length ? [{ value: "", label: none }, ...hit] : hit;
  }, [options, q, none]);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const vh = window.innerHeight, below = vh - r.bottom;
    setPos(below < 300 && r.top > below ? { bottom: vh - r.top + 4, left: r.left, width: r.width } : { top: r.bottom + 4, left: r.left, width: r.width });
  };
  const show = () => { place(); setQ(""); setAt(Math.max(0, shown.findIndex((o) => o.value === value))); setOpen(true); };
  const pick = (v: string) => { onChange(v); setOpen(false); btn.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    // the page scrolled or resized (on phones also when the keyboard or the browser bar shows / hides): follow the button,
    // close only when it went off screen. Closing on every scroll / resize made the list flash and vanish on iPhone.
    const move = (e: Event) => {
      if (e.target instanceof Node && pop.current?.contains(e.target)) return;
      const r = btn.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) setOpen(false); else place();
    };
    document.addEventListener("mousedown", away);
    window.addEventListener("resize", move); window.addEventListener("scroll", move, true);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("resize", move); window.removeEventListener("scroll", move, true); };
  }, [open]);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" }); }, [at, open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[at]) pick(shown[at].value); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <span className="cbx">
      <button ref={btn} type="button" className={"cbx-btn" + (cur ? "" : " empty")} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); show(); } }}>
        <span className="cbx-v">{cur ? cur.label : value ? value : none || placeholder || ""}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m7 10 5 5 5-5" /></svg>
      </button>
      {open && (
        <div ref={pop} className="cbx-pop" style={{ position: "fixed", ...pos }} onKeyDown={onKey} onClick={(e) => e.preventDefault()}>
          <input autoFocus={FINE} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || (es ? "Buscar…" : "Search…")} aria-label={es ? "Buscar" : "Search"} />
          <div className="cbx-list" role="listbox" ref={list}>
            {shown.length === 0 && <div className="cbx-none">{es ? "Nada coincide" : "Nothing matches"}</div>}
            {shown.map((o, i) => (
              <button key={o.value || "_none"} type="button" role="option" aria-selected={o.value === value} data-i={i}
                className={"cbx-it" + (i === at ? " on" : "") + (o.value === value ? " cur" : "") + (!o.value ? " nil" : "")}
                onMouseMove={() => at !== i && setAt(i)} onClick={() => pick(o.value)}>
                <span className="cbx-l"><b>{o.label}</b>{o.sub && <small>{o.sub}</small>}</span>
                {o.value === value && <span className="cbx-ck" aria-hidden>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
