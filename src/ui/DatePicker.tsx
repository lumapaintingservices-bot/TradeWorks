import { useEffect, useRef, useState } from "react";
import { addDaysISO } from "../lib/calendar";
import { todayISO } from "../lib/estimate";
import { fmtMonth, fmtPicked, inRange, isISODate, monthGrid, monthOf, shiftMonth, weekdayShort } from "../lib/datepick";
import { useUi } from "../store/ui";
import "./ui.css";

const ICON_CAL = '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>';
const CHEV_L = '<path d="m15 6-6 6 6 6"/>', CHEV_R = '<path d="m9 6 6 6-6 6"/>';
const Svg = ({ d, size = 16 }: { d: string; size?: number }) =>
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: d }} />;

/**
 * Date field (idea from shadcn's Date Picker: a button + Popover + Calendar) instead of the browser's date input.
 * value / onChange use "YYYY-MM-DD" ("" = no date). The calendar floats above everything (position fixed), like the
 * Combobox, so modals don't cut it off. Keys: arrows move a day / week, PageUp / PageDown a month, Enter picks, Esc closes.
 */
export function DatePicker({ value, onChange, min, max, placeholder, clearable = false, ariaLabel, lang: forced }: {
  value: string; onChange(v: string): void; min?: string; max?: string; placeholder?: string; clearable?: boolean; ariaLabel?: string;
  /** client-facing pages pass their own language */ lang?: "en" | "es";
}) {
  const appLang = useUi((s) => s.lang), lang = forced || appLang, es = lang === "es";
  const has = isISODate(value);
  const today = todayISO();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthOf(has ? value : today));
  const [focus, setFocus] = useState(has ? value : today);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
  const btn = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const W = 300, H = 360, below = window.innerHeight - r.bottom;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    setPos(below < H && r.top > below ? { bottom: window.innerHeight - r.top + 4, left } : { top: r.bottom + 4, left });
  };
  const show = () => { const start = has ? value : inRange(today, min, max) ? today : min || max || today; place(); setMonth(monthOf(start)); setFocus(start); setOpen(true); };
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus(); };
  const pick = (iso: string) => { if (!inRange(iso, min, max)) return; onChange(iso); close(); };
  const moveFocus = (iso: string) => { setFocus(iso); setMonth(monthOf(iso)); };

  useEffect(() => {
    if (!open) return;
    pop.current?.querySelector<HTMLElement>(`[data-d="${focus}"]`)?.focus({ preventScroll: true }); // a scroll would close the popup
  }, [open, focus, month]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(false); };
    // a resize comes from the window (not a Node): always close; a scroll inside the panel keeps it open
    const move = (e: Event) => { if (!(e.target instanceof Node) || !pop.current?.contains(e.target)) close(false); };
    document.addEventListener("mousedown", away);
    window.addEventListener("resize", move); window.addEventListener("scroll", move, true);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("resize", move); window.removeEventListener("scroll", move, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (step[e.key] !== undefined) { e.preventDefault(); moveFocus(addDaysISO(focus, step[e.key])); }
    else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const m = shiftMonth(monthOf(focus), e.key === "PageUp" ? -1 : 1), day = Math.min(Number(focus.slice(8)), 28);
      moveFocus(`${m}-${String(day).padStart(2, "0")}`);
    }
    else if (e.key === "Home") { e.preventDefault(); moveFocus(today); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") close(false);
  };

  const days = monthGrid(month), wd = weekdayShort(lang);
  return (
    <span className="dtp">
      <button ref={btn} type="button" className={"dtp-btn" + (has ? "" : " empty")} aria-haspopup="dialog" aria-expanded={open}
        aria-label={ariaLabel ? `${ariaLabel}: ${has ? fmtPicked(value, lang) : es ? "sin fecha" : "no date"}` : undefined}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); show(); } }}>
        <Svg d={ICON_CAL} />
        <span className="dtp-v">{has ? fmtPicked(value, lang) : placeholder || (es ? "Elige una fecha" : "Pick a date")}</span>
      </button>
      {open && (
        <div ref={pop} className="dtp-pop" role="dialog" aria-label={es ? "Elegir fecha" : "Choose date"} style={{ position: "fixed", ...pos }}
          onKeyDown={onKey} onClick={(e) => e.preventDefault()}>
          <div className="dtp-head">
            <button type="button" className="dtp-nav" aria-label={es ? "Mes anterior" : "Previous month"} onClick={() => setMonth(shiftMonth(month, -1))}><Svg d={CHEV_L} /></button>
            <b aria-live="polite">{fmtMonth(month, lang)}</b>
            <button type="button" className="dtp-nav" aria-label={es ? "Mes siguiente" : "Next month"} onClick={() => setMonth(shiftMonth(month, 1))}><Svg d={CHEV_R} /></button>
          </div>
          <div className="dtp-grid" role="grid">
            {wd.map((d, i) => <span key={i} className="dtp-wd" aria-hidden>{d}</span>)}
            {days.map((iso) => {
              const out = monthOf(iso) !== month, ok = inRange(iso, min, max), sel = has && iso === value;
              return (
                <button key={iso} type="button" data-d={iso} tabIndex={iso === focus ? 0 : -1} disabled={!ok} aria-pressed={sel}
                  aria-label={fmtPicked(iso, lang)}
                  className={"dtp-day" + (out ? " out" : "") + (sel ? " sel" : "") + (iso === today ? " today" : "")}
                  onClick={() => pick(iso)} onFocus={() => iso !== focus && setFocus(iso)}>{Number(iso.slice(8))}</button>);
            })}
          </div>
          <div className="dtp-foot">
            <button type="button" className="btn sm" disabled={!inRange(today, min, max)} onClick={() => pick(today)}>{es ? "Hoy" : "Today"}</button>
            {clearable && has && <button type="button" className="btn sm dtp-clear" onClick={() => { onChange(""); close(); }}>{es ? "Quitar fecha" : "Clear"}</button>}
          </div>
        </div>
      )}
    </span>
  );
}
