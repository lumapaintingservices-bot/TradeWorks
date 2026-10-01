import { useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useEstimates, useExpenses, usePayouts, useSettings } from "../data/hooks";
import { useT } from "../i18n";
import { uid, todayISO } from "../lib/estimate";
import {
  allExpenseRows, bankGuess, buildBankItems, catTone, cleanVendor, expCatLabel, expCats, EXP_METHODS, expenseTotals, inBounds, isMarketingCat, learnRules,
  METHOD_ES, parseBankFile, rangeBounds, recurringId, runRecurring, vendorsList,
  type BankFile, type BankItem, type BankRule, type DateOrder, type ExpenseRow, type RangeKey, type RecurringRule,
} from "../lib/expenses";
import { fmtDate } from "../lib/format";
import { shrinkImage } from "../lib/image";
import { money, num, r2 } from "../lib/money";
import { deleteImage, putImage } from "../lib/storage";
import type { Estimate, Expense, Settings } from "../lib/types";
import { useUi } from "../store/ui";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { useUrlFlag } from "../ui/useUrlFlag";
import { ask } from "../ui/confirm";
import "./Expenses.css";

const FALLBACK_SOURCES = ["Thumbtack", "Google", "Referral", "Instagram", "Nextdoor", "Facebook", "Repeat client", "Walk-by / sign", "Other"];
const RANGES: { k: RangeKey; en: string; es: string }[] = [
  { k: "month", en: "This month", es: "Este mes" }, { k: "lastmonth", en: "Last month", es: "Mes pasado" }, { k: "ytd", en: "This year", es: "Este año" },
  { k: "lastyear", en: "Last year", es: "Año pasado" }, { k: "all", en: "All", es: "Todo" }, { k: "custom", en: "Custom", es: "Personalizado" },
];
const PAGE = 300;

const ClipIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m21 11.5-8.6 8.6a5 5 0 0 1-7-7l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l8-8" />
  </svg>
);

/** Settings fields this page stores that are wider than the shared Settings type (source/from/skip on recurring, source on bank rules). */
const asRules = (s: Settings) => (s.recurring || []) as unknown as RecurringRule[];
const asBankRules = (s: Settings) => (s.bankRules || []) as unknown as BankRule[];

function useJobOptions(ests: Estimate[]) {
  const t = useT();
  return useMemo(() => {
    const list = [...ests].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 120);
    return list.map((e) => ({ id: e.id, label: `${e.number} · ${e.clientName || t("No client", "Sin cliente")}` }));
  }, [ests]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function Expenses() {
  const t = useT();
  const lang = useUi((s) => s.lang), es = lang === "es";
  const nav = useNavigate();
  const { company } = useAuth();
  const { rows: expenses, loading: expLoading, save } = useExpenses();
  const { rows: ests } = useEstimates();
  const { rows: payouts } = usePayouts();
  const { settings, loading: setLoading, update } = useSettings();
  const cats = useMemo(() => expCats(settings.expCats), [settings.expCats]);
  const rules = asRules(settings);
  const today = todayISO();

  const [range, setRange] = useState<RangeKey>("month");
  const [custom, setCustom] = useState({ from: today.slice(0, 7) + "-01", to: today });
  const [q, setQ] = useState(""); const [cat, setCat] = useState("all"); const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  useUrlFlag("new", () => setEditing("new")); // Quick create
  const [showRec, setShowRec] = useState(false); const [sp, setSp] = useSearchParams();
  const [showImport, setShowImport] = useState(sp.get("import") === "1");
  const [zoom, setZoom] = useState("");

  /* recurring entries are made once a month with a fixed id, so opening the page on two devices never duplicates them */
  const made = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (expLoading || setLoading || !company) return;
    const due = runRecurring(rules, expenses, todayISO(), t("Monthly", "Mensual")).filter((x) => !made.current.has(x.id));
    if (!due.length) return;
    due.forEach((x) => made.current.add(x.id));
    Promise.all(due.map((x) => save(x as Expense & { id: string }))).catch(() => due.forEach((x) => made.current.delete(x.id)));
  }, [expLoading, setLoading, company?.id, expenses, settings.recurring]); // eslint-disable-line react-hooks/exhaustive-deps

  const bounds = useMemo(() => rangeBounds(range, today, custom), [range, today, custom]);
  const allRows = useMemo(() => allExpenseRows(expenses, ests), [expenses, ests]);
  const tot = useMemo(() => expenseTotals(allRows, payouts, bounds), [allRows, payouts, bounds]);
  const estNo = useMemo(() => new Map(ests.map((e) => [e.id, e.number])), [ests]);
  const estName = useMemo(() => new Map(ests.map((e) => [e.id, e.clientName || ""])), [ests]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return allRows.filter((r) => inBounds(r.date, bounds) && (cat === "all" || r.cat === cat) &&
      (!s || `${r.vendor} ${r.note} ${r.source} ${estNo.get(r.estId) || ""} ${estName.get(r.estId) || ""}`.toLowerCase().includes(s)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id));
  }, [allRows, bounds, cat, q, estNo, estName]);
  const shownTot = r2(shown.reduce((a, r) => a + r.amount, 0));
  const visible = shown.slice(0, limit);

  const methodLabel = (m: string) => (es ? METHOD_ES[m] || m : m);
  const vendorText = (r: ExpenseRow) => r.vendor || (r.legacy ? t("Job materials", "Materiales del trabajo") : "—");
  const open = (r: ExpenseRow) => { if (r.legacy) nav(`/estimates/${r.estId}`); else if (r.rec) setEditing(r.rec); };
  const chip = (r: ExpenseRow) => <span className={"ex-cat t-" + catTone(r.cat)}>{expCatLabel(r.cat, es, settings.expCats)}</span>;
  const clip = (r: ExpenseRow) => r.receiptUrl ? <button className="ex-clip" aria-label={t("View receipt", "Ver recibo")} onClick={(e) => { e.stopPropagation(); setZoom(r.receiptUrl); }}><ClipIcon /></button> : null;

  const hasAny = allRows.length > 0;
  return (
    <div className="page ex">
      <div className="page-h">
        <div><h1>{t("Expenses", "Gastos")}</h1><p>{t("Everything you spend, with receipts and the job it was for.", "Todo lo que gastas, con recibos y el trabajo al que pertenece.")}</p></div>
        <div className="ex-actions">
          <button className="btn" onClick={() => setShowRec(true)}>{t("Recurring", "Recurrentes")}</button>
          <button className="btn" onClick={() => setShowImport(true)}>{t("Import bank CSV", "Importar CSV del banco")}</button>
          <button className="btn pri" onClick={() => setEditing("new")}><Icon name="plus" />{t("Expense", "Gasto")}</button>
        </div>
      </div>

      <div className="tabs ex-range" role="tablist">
        {RANGES.map((r) => <button key={r.k} role="tab" aria-selected={range === r.k} className={range === r.k ? "on" : ""} onClick={() => setRange(r.k)}>{es ? r.es : r.en}</button>)}
      </div>
      {range === "custom" && (
        <div className="ex-custom">
          <label className="f">{t("From", "Desde")}<input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
          <label className="f">{t("To", "Hasta")}<input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
        </div>
      )}

      <div className="ex-tiles">
        <div className="card ex-tile"><span>{t("Spent", "Gastado")}</span><b>{money(tot.spent)}</b>{tot.team > 0 && <small>{t(`incl. ${money(tot.team)} paid to your team`, `incl. ${money(tot.team)} pagado a tu equipo`)}</small>}</div>
        <div className="card ex-tile"><span>{t("Materials", "Materiales")}</span><b>{money(tot.materials)}</b></div>
        <div className="card ex-tile"><span>{t("Ads & leads", "Publicidad y leads")}</span><b>{money(tot.marketing)}</b></div>
        <div className="card ex-tile"><span>{t("Everything else", "Todo lo demás")}</span><b>{money(tot.other)}</b></div>
      </div>

      {!hasAny && !expLoading ? (
        <div className="card"><EmptyState icon="chart" title={t("No expenses yet", "Aún no hay gastos")} text={t("Add an expense with its receipt photo, or import your bank statement to categorize a month of charges in two minutes.", "Agrega un gasto con la foto del recibo, o importa el estado de cuenta del banco para clasificar un mes de cargos en dos minutos.")}>
          <button className="btn pri" onClick={() => setEditing("new")}>{t("Add expense", "Agregar gasto")}</button>
          <button className="btn" onClick={() => setShowImport(true)}>{t("Import bank CSV", "Importar CSV del banco")}</button></EmptyState></div>
      ) : (
        <>
          <div className="toolbar">
            <input placeholder={t("Search vendor, note, job", "Buscar proveedor, nota, trabajo")} value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
            <select value={cat} onChange={(e) => { setCat(e.target.value); setLimit(PAGE); }}>
              <option value="all">{t("All categories", "Todas las categorías")}</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{es ? c.es : c.en}</option>)}
            </select>
          </div>
          {shown.length === 0 ? (
            <div className="card"><p className="muted" style={{ padding: 24 }}>{t("No expenses in this period. Add one, or import your bank statement.", "No hay gastos en este periodo. Agrega uno o importa el estado de cuenta del banco.")}</p></div>
          ) : (
            <>
              <div className="card only-desk tbl-wrap">
                <table className="tbl ex-tbl">
                  <thead><tr><th>{t("Date", "Fecha")}</th><th>{t("Vendor", "Proveedor")}</th><th>{t("Category", "Categoría")}</th><th>{t("Source", "Origen")}</th><th>{t("Job", "Trabajo")}</th><th>{t("Paid with", "Pagado con")}</th><th /><th className="r">{t("Amount", "Monto")}</th></tr></thead>
                  <tbody>{visible.map((r) => (
                    <tr key={r.id} className="click" onClick={() => open(r)}>
                      <td className="nw">{fmtDate(r.date, lang)}</td>
                      <td><b>{vendorText(r)}</b>{r.note && <div className="muted ex-sub">{r.note}</div>}</td>
                      <td>{chip(r)}</td>
                      <td className="muted">{r.source || ""}</td>
                      <td className="muted nw">{estNo.get(r.estId) || "—"}</td>
                      <td className="muted">{r.method ? methodLabel(r.method) : r.legacy ? t("from the job", "desde el trabajo") : ""}</td>
                      <td className="ex-cl">{clip(r)}</td>
                      <td className="r nw"><b>{money(r.amount)}</b></td>
                    </tr>))}</tbody>
                  <tfoot><tr><td colSpan={7} className="muted">{t(`${shown.length} expenses`, `${shown.length} gastos`)}</td><td className="r nw"><b>{money(shownTot)}</b></td></tr></tfoot>
                </table>
              </div>
              <div className="cards only-phone">
                {visible.map((r) => (
                  <div key={r.id} className="ec" onClick={() => open(r)}>
                    <div className="l1"><span>{vendorText(r)}</span><span>{money(r.amount)}</span></div>
                    <div className="l2"><span>{fmtDate(r.date, lang)}{r.method ? " · " + methodLabel(r.method) : ""}</span>{chip(r)}</div>
                    {(r.source || r.estId || r.note || r.receiptUrl) && (
                      <div className="l2"><span className="ex-cardnote">{[r.source, estNo.get(r.estId), r.note].filter(Boolean).join(" · ")}</span>{clip(r)}</div>)}
                  </div>))}
                <div className="ex-cardtot muted"><span>{t(`${shown.length} expenses`, `${shown.length} gastos`)}</span><b>{money(shownTot)}</b></div>
              </div>
              {shown.length > limit && <div className="ex-more"><button className="btn" onClick={() => setLimit(limit + PAGE)}>{t(`Show more (${shown.length - limit})`, `Mostrar más (${shown.length - limit})`)}</button></div>}
            </>
          )}
        </>
      )}

      {editing && <ExpenseModal key={editing === "new" ? "new" : editing.id} exp={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {showRec && <RecurringModal onClose={() => setShowRec(false)} />}
      {showImport && <BankImportModal onClose={() => { setShowImport(false); if (sp.get("import")) setSp({}, { replace: true }); }} />}
      {zoom && <div className="ex-zoom" onClick={() => setZoom("")} role="dialog" aria-modal><img src={zoom} alt={t("Receipt", "Recibo")} /><button className="btn sm" onClick={() => setZoom("")}>{t("Close", "Cerrar")}</button></div>}
    </div>
  );
}

/* ------------------------------------------------------------------ new / edit expense */
type Receipt = { url: string; changed: boolean };

function ExpenseModal({ exp, onClose }: { exp: Expense | null; onClose(): void }) {
  const t = useT();
  const es = useUi((s) => s.lang) === "es";
  const toast = useUi((s) => s.toast);
  const { company } = useAuth();
  const { rows: expenses, save, remove } = useExpenses();
  const { rows: ests } = useEstimates();
  const { settings, update } = useSettings();
  const jobs = useJobOptions(ests);
  const cats = expCats(settings.expCats);
  const sources = settings.leadSources?.length ? settings.leadSources : FALLBACK_SOURCES;
  const isNew = !exp;
  const [amount, setAmount] = useState(exp ? String(exp.amount) : "");
  const [date, setDate] = useState(exp?.date || todayISO());
  const [vendor, setVendor] = useState(exp?.vendor || "");
  const [category, setCategory] = useState(exp?.category || "materials");
  const [source, setSource] = useState(exp?.source || "");
  const [estId, setEstId] = useState(exp?.estId || "");
  const [method, setMethod] = useState(exp?.method || "Card");
  const [note, setNote] = useState(exp?.note || "");
  const [receipt, setReceipt] = useState<Receipt>({ url: exp?.receiptUrl || "", changed: false });
  const [repeat, setRepeat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isNew) amountRef.current?.focus(); }, [isNew]);
  const vendors = useMemo(() => vendorsList(expenses), [expenses]);

  /** a known vendor fills in its usual category (from the last expense, else the bank guesses) */
  const vendorDone = () => {
    const v = vendor.trim().toLowerCase();
    if (!v || !isNew) return;
    const last = expenses.filter((y) => String(y.vendor || "").toLowerCase() === v).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const g = last ? { cat: last.category, src: last.source || "" } : bankGuess(v, asBankRules(settings));
    if (g?.cat) { setCategory(g.cat); if (g.src) setSource(g.src); }
  };
  const pick = async (f?: File | null) => {
    if (!f) return;
    try { setReceipt({ url: await shrinkImage(f, 1400, 0.7), changed: true }); } catch { toast(t("That photo could not be read.", "No se pudo leer esa foto.")); }
  };

  const submit = async () => {
    const amt = num(amount);
    if (!(amt > 0)) { toast(t("Write the amount.", "Escribe el monto.")); amountRef.current?.focus(); return; }
    if (!company || busy) return;
    setBusy(true);
    try {
      const day = date || todayISO(), ym = day.slice(0, 7);
      const rid = isNew && repeat ? uid("rc") : "";
      const id = exp?.id || (rid ? recurringId(rid, ym) : uid("ex"));
      const rec: Expense = { ...(exp || {}), id, date: day, vendor: vendor.trim(), amount: r2(amt), category, source: isMarketingCat(category) ? source : "", method, note: note.trim(), estId };
      if (rid) rec.recurId = rid;
      if (receipt.changed) {
        if (receipt.url) { const put = await putImage(`companies/${company.id}/receipts/${id}.jpg`, receipt.url); rec.receiptUrl = put.url; rec.receiptPath = put.path; }
        else { await deleteImage(exp?.receiptPath); delete rec.receiptUrl; delete rec.receiptPath; }
      }
      await save(rec as Expense & { id: string });
      if (rid) {
        const rule: RecurringRule = { id: rid, vendor: rec.vendor, amount: rec.amount, category, source: rec.source, method, day: +day.slice(8, 10) || 1, from: ym, active: true };
        await update({ recurring: [...asRules(settings), rule] as unknown as Settings["recurring"] });
      }
      toast(t("Expense saved.", "Gasto guardado."));
      onClose();
    } catch { toast(t("Could not save. Try again.", "No se pudo guardar. Intenta de nuevo.")); setBusy(false); }
  };

  const del = async () => {
    if (!exp || busy || !await ask(t("Delete this expense?", "¿Borrar este gasto?"))) return;
    setBusy(true);
    try {
      /* a month made by a recurring entry stays deleted (otherwise it would be created again) */
      const rule = exp.recurId ? asRules(settings).find((r) => r.id === exp.recurId) : undefined;
      if (rule) {
        const ym = /^rec-.+-\d{4}-\d{2}$/.test(exp.id) ? exp.id.slice(-7) : exp.date.slice(0, 7);
        await update({ recurring: asRules(settings).map((r) => r.id === rule.id ? { ...r, skip: [...(r.skip || []), ym] } : r) as unknown as Settings["recurring"] });
      }
      await remove(exp.id);
      await deleteImage(exp.receiptPath);
      toast(t("Expense deleted.", "Gasto borrado."));
      onClose();
    } catch { toast(t("Could not delete. Try again.", "No se pudo borrar. Intenta de nuevo.")); setBusy(false); }
  };

  return (
    <Modal title={isNew ? t("New expense", "Gasto nuevo") : t("Expense", "Gasto")} onClose={onClose}>
      <div className="ex-form">
        <div className="grid2">
          <label className="f">{t("Amount ($)", "Monto ($)")}<input ref={amountRef} className="ex-amt" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="f">{t("Date", "Fecha")}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <label className="f">{t("Vendor", "Proveedor")}<input type="text" list="ex-vendors" value={vendor} onChange={(e) => setVendor(e.target.value)} onBlur={vendorDone} placeholder="Home Depot, Sherwin-Williams, Thumbtack…" />
          <datalist id="ex-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist></label>
        <div className="ex-fld"><span className="ex-lbl">{t("Category", "Categoría")}</span>
          <div className="pills">{cats.map((c) => <button key={c.id} type="button" className={"pill" + (category === c.id ? " on" : "")} onClick={() => setCategory(c.id)}>{es ? c.es : c.en}</button>)}</div></div>
        {isMarketingCat(category) && (
          <label className="f">{t("Which source is this for?", "¿De qué origen es?")}<select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="" />{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>)}
        <div className="grid2">
          <label className="f">{t("Job (optional)", "Trabajo (opcional)")}<select value={estId} onChange={(e) => setEstId(e.target.value)}>
            <option value="">{t("No job — business expense", "Sin trabajo — gasto del negocio")}</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
            {estId && !jobs.some((j) => j.id === estId) && <option value={estId}>{estId}</option>}</select></label>
          <label className="f">{t("Paid with", "Pagado con")}<select value={method} onChange={(e) => setMethod(e.target.value)}>
            {EXP_METHODS.map((m) => <option key={m} value={m}>{es ? METHOD_ES[m] : m}</option>)}
            {method && !(EXP_METHODS as readonly string[]).includes(method) && <option value={method}>{method}</option>}</select></label>
        </div>
        <label className="f">{t("Note (optional)", "Nota (opcional)")}<input type="text" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="ex-fld"><span className="ex-lbl">{t("Receipt", "Recibo")}</span>
          <div className="ex-rc">
            {receipt.url && <button type="button" className="ex-prev" onClick={() => setZoom(true)} aria-label={t("Zoom receipt", "Ampliar recibo")}><img src={receipt.url} alt="" /></button>}
            <label className="btn sm"><input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />{t("Take photo", "Tomar foto")}</label>
            <label className="btn sm"><input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />{t("Upload", "Subir")}</label>
            {receipt.url && <button type="button" className="btn sm" onClick={() => setReceipt({ url: "", changed: true })}>{t("Remove", "Quitar")}</button>}
          </div></div>
        {isNew && <label className="ex-check"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> {t("Repeats every month (insurance, software, ads…)", "Se repite cada mes (seguro, software, anuncios…)")}</label>}
        <div className="ex-btns">
          <button className="btn pri" disabled={busy} onClick={submit}>{t("Save", "Guardar")}</button>
          {!isNew && <button className="btn danger" disabled={busy} onClick={del}>{t("Delete", "Borrar")}</button>}
        </div>
      </div>
      {zoom && <div className="ex-zoom" onClick={() => setZoom(false)}><img src={receipt.url} alt={t("Receipt", "Recibo")} /><button className="btn sm" onClick={() => setZoom(false)}>{t("Close", "Cerrar")}</button></div>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ recurring manager */
function RecurringModal({ onClose }: { onClose(): void }) {
  const t = useT();
  const es = useUi((s) => s.lang) === "es";
  const { settings, update } = useSettings();
  const list = asRules(settings);
  const write = (next: RecurringRule[]) => update({ recurring: next as unknown as Settings["recurring"] });
  return (
    <Modal title={t("Recurring expenses", "Gastos recurrentes")} onClose={onClose}>
      <p className="muted ex-hint">{t("These are added by themselves on their day each month. Create one by checking “Repeats every month” on a new expense.", "Se agregan solos cada mes en su día. Crea uno marcando “Se repite cada mes” en un gasto nuevo.")}</p>
      {list.length === 0 ? <p className="muted ex-none">{t("No recurring expenses yet.", "Todavía no hay gastos recurrentes.")}</p> : (
        <div className="ex-rec">{list.map((r) => (
          <div key={r.id} className={"ex-rec-row" + (r.active === false ? " off" : "")}>
            <div className="ex-rec-main"><b>{r.vendor || "—"}</b>
              <span className="muted">{expCatLabel(r.category, es, settings.expCats)}{r.source ? " · " + r.source : ""} · {t("day", "día")} {r.day}</span></div>
            <b className="ex-rec-amt">{money(r.amount)}</b>
            <label className="ex-check"><input type="checkbox" checked={r.active !== false} onChange={(e) => write(list.map((x) => x.id === r.id ? { ...x, active: e.target.checked } : x))} /> {t("On", "Activo")}</label>
            <button className="btn sm danger" aria-label={t("Delete", "Borrar")} onClick={async () => { if (await ask(t("Stop and delete this recurring expense? Past months stay.", "¿Parar y borrar este gasto recurrente? Los meses pasados se quedan."))) write(list.filter((x) => x.id !== r.id)); }}>×</button>
          </div>))}</div>)}
    </Modal>
  );
}

/* ------------------------------------------------------------------ bank CSV import */
function BankImportModal({ onClose }: { onClose(): void }) {
  const t = useT();
  const es = useUi((s) => s.lang) === "es", lang = es ? "es" : "en";
  const toast = useUi((s) => s.toast);
  const { rows: expenses, save } = useExpenses();
  const { rows: ests } = useEstimates();
  const { settings, update } = useSettings();
  const jobs = useJobOptions(ests);
  const cats = expCats(settings.expCats);
  const sources = settings.leadSources?.length ? settings.leadSources : FALLBACK_SOURCES;
  const rules = asBankRules(settings);
  const [file, setFile] = useState<BankFile | null>(null);
  const [items, setItems] = useState<BankItem[]>([]);
  const [learn, setLearn] = useState(true);
  const [busy, setBusy] = useState(false);

  const rebuild = (f: BankFile) => { setFile(f); setItems(buildBankItems(f, rules, expenses)); };
  const load = async (f?: File | null) => {
    if (!f) return;
    const parsed = parseBankFile(await f.text());
    if (!parsed) { toast(t("That file has no rows.", "Ese archivo no tiene filas.")); return; }
    rebuild(parsed);
    if (!buildBankItems(parsed, rules, expenses).length) toast(t("No charges found. Check the columns below.", "No se encontraron cargos. Revisa las columnas abajo."));
  };
  const setItem = (i: number, p: Partial<BankItem>) => setItems((a) => a.map((x, k) => k === i ? { ...x, ...p } : x));
  const chosen = items.filter((x) => x.on);
  const chosenTot = r2(chosen.reduce((a, x) => a + x.amount, 0));

  const go = async () => {
    if (!chosen.length) { toast(t("Nothing selected.", "No hay nada seleccionado.")); return; }
    setBusy(true);
    try {
      const recs: Expense[] = chosen.map((x) => ({
        id: uid("ex"), date: x.date, vendor: x.vendor.trim() || cleanVendor(x.desc), amount: x.amount, category: x.cat, source: isMarketingCat(x.cat) ? x.src : "",
        method: "Card", note: "", estId: x.estId, bankFp: x.fp, bankDesc: x.desc.slice(0, 120),
      }));
      for (let i = 0; i < recs.length; i += 25) await Promise.all(recs.slice(i, i + 25).map((r) => save(r as Expense & { id: string })));
      if (learn) {
        const next = learnRules(chosen, rules);
        if (JSON.stringify(next) !== JSON.stringify(rules)) await update({ bankRules: next as unknown as Settings["bankRules"] });
      }
      toast(t(`${recs.length} expenses imported.`, `${recs.length} gastos importados.`));
      onClose();
    } catch { toast(t("Import failed. Nothing was lost — try again.", "La importación falló. No se perdió nada — intenta de nuevo.")); setBusy(false); }
  };

  const colSel = (key: "date" | "desc" | "amount" | "debit", label: string) => file && (
    <label className="f">{label}<select value={file.map[key]} onChange={(e) => rebuild({ ...file, map: { ...file.map, [key]: Number(e.target.value) } })}>
      <option value={-1}>—</option>{file.head.map((h, i) => <option key={i} value={i}>{h || "#" + (i + 1)}</option>)}</select></label>);

  return (
    <Modal title={t("Import bank / card statement", "Importar estado de cuenta")} onClose={onClose} wide>
      {!file ? (
        <div>
          <p className="muted ex-hint">{t("Download your bank or card statement as CSV (Export → CSV in your bank's website) and pick the file. Nothing is saved until you press Import.", "Descarga el estado de cuenta del banco o tarjeta como CSV (Exportar → CSV en la web del banco) y escoge el archivo. No se guarda nada hasta que toques Importar.")}</p>
          <label className="btn pri"><input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />{t("Choose CSV file", "Escoger archivo CSV")}</label>
        </div>
      ) : (
        <div>
          <details className="ex-cols">
            <summary className="muted">{t("Columns (fix if something looks wrong)", "Columnas (corrige si algo se ve mal)")}</summary>
            <div className="ex-cols-g">
              {colSel("date", t("Date", "Fecha"))}{colSel("desc", t("Description", "Descripción"))}
              {file.map.debit >= 0 ? colSel("debit", t("Charges column", "Columna de cargos")) : colSel("amount", t("Amount", "Monto"))}
            </div>
            {file.map.debit < 0 && (
              <div className="pills ex-pills">
                <button className={"pill" + (file.sign === "neg" ? " on" : "")} onClick={() => rebuild({ ...file, sign: "neg" })}>{t("Charges are negative (−)", "Los cargos son negativos (−)")}</button>
                <button className={"pill" + (file.sign === "pos" ? " on" : "")} onClick={() => rebuild({ ...file, sign: "pos" })}>{t("Charges are positive", "Los cargos son positivos")}</button>
              </div>)}
            <div className="pills ex-pills">
              {(["mdy", "dmy"] as DateOrder[]).map((o) => <button key={o} className={"pill" + (file.dateOrder === o ? " on" : "")} onClick={() => rebuild({ ...file, dateOrder: o })}>{o === "mdy" ? t("Dates: month/day/year", "Fechas: mes/día/año") : t("Dates: day/month/year", "Fechas: día/mes/año")}</button>)}
            </div>
            <button className="btn sm ex-again" onClick={() => { setFile(null); setItems([]); }}>{t("Choose another file", "Escoger otro archivo")}</button>
          </details>
          <div className="ex-bk-sum">
            <b>{t(`${items.length} charges · ${chosen.length} selected · ${money(chosenTot)}`, `${items.length} cargos · ${chosen.length} seleccionados · ${money(chosenTot)}`)}</b>
            <span className="muted">{t("Possible duplicates start unchecked.", "Los posibles duplicados empiezan sin marcar.")}</span>
          </div>
          <div className="ex-bk-sel">
            <button className="btn sm" onClick={() => setItems((a) => a.map((x) => ({ ...x, on: true })))}>{t("Select all", "Marcar todos")}</button>
            <button className="btn sm" onClick={() => setItems((a) => a.map((x) => ({ ...x, on: false })))}>{t("Select none", "Desmarcar todos")}</button>
          </div>
          {items.length === 0 ? <p className="muted ex-none">{t("No charges found. Check the columns above.", "No se encontraron cargos. Revisa las columnas de arriba.")}</p> : (
            <div className="bk-list">{items.map((x, i) => (
              <div key={i} className={"bk-row" + (x.dup ? " dup" : "") + (x.on ? "" : " off")}>
                <input className="bk-on" type="checkbox" checked={x.on} onChange={(e) => setItem(i, { on: e.target.checked })} aria-label={t("Import this charge", "Importar este cargo")} />
                <span className="bk-date">{fmtDate(x.date, lang)}</span>
                <div className="bk-vendor"><input type="text" value={x.vendor} onChange={(e) => setItem(i, { vendor: e.target.value })} />
                  <small className="muted">{x.desc}{x.dup ? " · " + t("already in your expenses?", "¿ya está en tus gastos?") : ""}</small></div>
                <div className="bk-cat">
                  <select value={x.cat} onChange={(e) => setItem(i, { cat: e.target.value, changed: true })}>{cats.map((c) => <option key={c.id} value={c.id}>{es ? c.es : c.en}</option>)}</select>
                  {isMarketingCat(x.cat) && <select value={x.src} onChange={(e) => setItem(i, { src: e.target.value, changed: true })}><option value="">{t("Source…", "Origen…")}</option>{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select>}
                </div>
                <select className="bk-job" value={x.estId} onChange={(e) => setItem(i, { estId: e.target.value })}>
                  <option value="">{t("No job", "Sin trabajo")}</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select>
                <b className="bk-amt">{money(x.amount)}</b>
              </div>))}</div>)}
          <label className="ex-check bk-learn"><input type="checkbox" checked={learn} onChange={(e) => setLearn(e.target.checked)} /> {t("Remember my categories for next time (by vendor)", "Recordar mis categorías para la próxima vez (por proveedor)")}</label>
          <div className="ex-btns"><button className="btn pri" disabled={busy || !chosen.length} onClick={go}>{t(`Import ${chosen.length} expenses`, `Importar ${chosen.length} gastos`)}</button></div>
        </div>
      )}
    </Modal>
  );
}
