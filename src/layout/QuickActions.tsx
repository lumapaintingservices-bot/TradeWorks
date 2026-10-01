import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useClients, useCollection, useEstimates, useInvoices } from "../data/hooks";
import type { Rec } from "../data/repo";
import { useT } from "../i18n";
import { clientNameOf } from "../lib/calendar";
import { fmtDate } from "../lib/format";
import { money } from "../lib/money";
import { searchAll, type SearchGroup, type SearchItem } from "../lib/search";
import type { Note } from "../lib/types";
import { useUi } from "../store/ui";
import { Icon } from "../ui/Icon";
import { statusLabel } from "../ui/StatusBadge";
import { navFor } from "./nav";
import "./quick.css";

/** Quick create: what the "+" menu offers (each page opens its "new" form from ?new=1). */
export const QUICK = [
  { to: "/estimates?new=1", icon: "estimates", en: "New estimate", es: "Nuevo presupuesto" },
  { to: "/clients?new=1", icon: "clients", en: "New client", es: "Nuevo cliente" },
  { to: "/calendar?new=1", icon: "calendar", en: "New task", es: "Nueva tarea" },
  { to: "/expenses?new=1", icon: "expenses", en: "New expense", es: "Nuevo gasto" },
  { to: "/notes?new=1", icon: "note", en: "New note", es: "Nueva nota" },
];

export function QuickMenu({ onDone, className, style }: { onDone(): void; className?: string; style?: React.CSSProperties }) {
  const t = useT();
  const nav = useNavigate();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onDone]);
  return (
    <>
      <div className={"qc-back " + (className || "")} onClick={onDone} />
      <div className={"qc-menu " + (className || "")} style={style} role="menu">
        <div className="qc-h">{t("Create", "Crear")}</div>
        {QUICK.map((q, i) => (
          <button key={q.to} ref={i === 0 ? first : undefined} role="menuitem" className="qc-it" onClick={() => { onDone(); nav(q.to); }}>
            <Icon name={q.icon} size={18} /><span>{t(q.en, q.es)}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export const modKey = () => (typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl");

const GROUP_LABEL: Record<SearchGroup, [string, string]> = {
  pages: ["Pages & actions", "Páginas y acciones"], clients: ["Clients", "Clientes"], estimates: ["Estimates", "Presupuestos"],
  invoices: ["Invoices", "Facturas"], notes: ["Notes", "Notas"],
};
const GROUP_ICON: Record<SearchGroup, string> = { pages: "dashboard", clients: "clients", estimates: "estimates", invoices: "invoices", notes: "note" };

/** Search everything (Ctrl/Cmd+K): pages and quick actions, clients, estimates, invoices and notes. Owners / admins only. */
export function SearchPalette({ onClose }: { onClose(): void }) {
  const t = useT();
  const nav = useNavigate();
  const lang = useUi((s) => s.lang);
  const { role } = useAuth();
  const { rows: clients } = useClients();
  const { rows: estimates } = useEstimates();
  const { rows: invoices } = useInvoices();
  const { rows: notes } = useCollection<Note & Rec>("notes");
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const items = useMemo<SearchItem[]>(() => {
    const ni = navFor(role);
    const pages: SearchItem[] = [...ni.work, ...ni.business].map((p) => ({ id: "p" + p.to, group: "pages", title: t(p.en, p.es), to: p.to, words: [p.en, p.es] }));
    const acts: SearchItem[] = QUICK.map((a) => ({ id: "a" + a.to, group: "pages", title: t(a.en, a.es), to: a.to, words: [a.en, a.es, "add", "agregar", "crear", "create"] }));
    const cs: SearchItem[] = clients.map((c) => ({
      id: "c" + c.id, group: "clients", title: c.name || t("Unnamed client", "Cliente sin nombre"), sub: [c.phone, c.email, c.address].filter(Boolean).join(" · "),
      to: `/clients/${c.id}`, words: [c.phone, c.email, c.address].filter(Boolean) as string[],
    }));
    const es: SearchItem[] = estimates.map((e) => {
      const name = clientNameOf(e, clients, lang);
      return { id: "e" + e.id, group: "estimates", title: `${e.number} · ${name}`, sub: [e.address, e.status && statusLabel(e.status, lang === "es")].filter(Boolean).join(" · "), to: `/estimates/${e.id}`, words: [e.number, name, e.address, e.phone, e.email].filter(Boolean) as string[] };
    });
    const vs: SearchItem[] = invoices.map((v) => {
      const e = estimates.find((x) => x.id === v.estId), name = (e && clientNameOf(e, clients, lang)) || String((v as { clientName?: string }).clientName || "");
      return { id: "i" + v.id, group: "invoices", title: `${v.number} · ${name}`, sub: `${money(v.amount)} · ${v.status === "Paid" ? t("Paid", "Pagada") : t("Unpaid", "Sin pagar")} · ${fmtDate(v.date, lang)}`, to: `/invoices?open=${v.id}`, words: [v.number, name, e?.number || ""].filter(Boolean) };
    });
    const ns: SearchItem[] = notes.map((n) => ({ id: "n" + n.id, group: "notes", title: n.title || n.text.split("\n")[0].slice(0, 80), sub: n.title ? n.text.split("\n")[0].slice(0, 100) : "", to: `/notes?open=${n.id}`, words: [n.text, n.jobLabel || ""] }));
    return [...pages, ...acts, ...cs, ...es, ...vs, ...ns];
  }, [role, clients, estimates, invoices, notes, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => q.trim() ? searchAll(items, q) : [{ group: "pages" as SearchGroup, items: items.filter((x) => x.group === "pages" && x.id.startsWith("a")) }], [items, q]);
  const flat = groups.flatMap((g) => g.items);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" }); }, [at]);
  const go = (it?: SearchItem) => { if (!it) return; onClose(); nav(it.to); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(flat[at]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  let n = -1;
  return (
    <div className="sp-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sp" role="dialog" aria-modal aria-label={t("Search", "Buscar")}>
        <div className="sp-in">
          <Icon name="search" size={18} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} role="combobox" aria-expanded aria-controls="sp-list"
            aria-activedescendant={flat[at] ? "sp-" + flat[at].id : undefined}
            placeholder={t("Search clients, estimates, invoices, notes…", "Busca clientes, presupuestos, facturas, notas…")} />
          <kbd>Esc</kbd>
        </div>
        <div className="sp-list" id="sp-list" role="listbox" ref={list}>
          {q.trim() && !flat.length && <div className="sp-none">{t("Nothing found. Try another word.", "No se encontró nada. Prueba otra palabra.")}</div>}
          {groups.map((g) => (
            <div key={g.group} className="sp-g">
              <div className="sp-gh">{q.trim() ? t(...GROUP_LABEL[g.group]) : t("Create", "Crear")}</div>
              {g.items.map((it) => {
                n++; const i = n;
                const icon = it.group === "pages" ? QUICK.find((a) => "a" + a.to === it.id)?.icon || navFor(role).work.concat(navFor(role).business).find((p) => "p" + p.to === it.id)?.icon || "dashboard" : GROUP_ICON[it.group];
                return (
                  <button key={it.id} id={"sp-" + it.id} data-i={i} role="option" aria-selected={i === at} className={"sp-it" + (i === at ? " on" : "")}
                    onMouseMove={() => at !== i && setAt(i)} onClick={() => go(it)}>
                    <Icon name={icon} size={17} />
                    <span className="sp-t"><b>{it.title}</b>{it.sub && <small>{it.sub}</small>}</span>
                    {i === at && <span className="sp-enter" aria-hidden>↵</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="sp-foot"><span><kbd>↑</kbd><kbd>↓</kbd> {t("move", "moverse")}</span><span><kbd>↵</kbd> {t("open", "abrir")}</span><span><kbd>{modKey()}</kbd><kbd>K</kbd> {t("open search anywhere", "abrir la búsqueda desde cualquier lugar")}</span></div>
      </div>
    </div>
  );
}
