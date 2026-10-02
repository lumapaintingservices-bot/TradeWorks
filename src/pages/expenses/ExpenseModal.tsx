import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useEstimates, useExpenses, useSettings } from "../../data/hooks";
import { useT } from "../../i18n";
import { uid, todayISO } from "../../lib/estimate";
import { bankGuess, expCats, EXP_METHODS, isMarketingCat, METHOD_ES, recurringId, vendorsList, type BankRule, type RecurringRule } from "../../lib/expenses";
import { shrinkImage } from "../../lib/image";
import { num, r2 } from "../../lib/money";
import { deleteImage, putImage } from "../../lib/storage";
import type { Estimate, Expense, Settings } from "../../lib/types";
import { useUi } from "../../store/ui";
import { Modal } from "../../ui/Modal";
import { ask } from "../../ui/confirm";
import { Combobox } from "../../ui/Combobox";
import { DatePicker } from "../../ui/DatePicker";
import "../Expenses.css";

export const FALLBACK_SOURCES = ["Thumbtack", "Google", "Referral", "Instagram", "Nextdoor", "Facebook", "Repeat client", "Walk-by / sign", "Other"];
/** Settings fields the expenses pages store that are wider than the shared Settings type (source/from/skip on recurring, source on bank rules). */
export const asRules = (s: Settings) => (s.recurring || []) as unknown as RecurringRule[];
export const asBankRules = (s: Settings) => (s.bankRules || []) as unknown as BankRule[];

export function useJobOptions(ests: Estimate[]) {
  const t = useT();
  return useMemo(() => {
    const list = [...ests].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 120);
    return list.map((e) => ({ id: e.id, label: `${e.number} · ${e.clientName || t("No client", "Sin cliente")}` }));
  }, [ests]); // eslint-disable-line react-hooks/exhaustive-deps
}

type Receipt = { url: string; changed: boolean };

/** New / edit expense window. `job` starts a new expense on that job (from the estimate's Costs & profit tab). */
export function ExpenseModal({ exp, job, onClose }: { exp: Expense | null; job?: string; onClose(): void }) {
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
  const [estId, setEstId] = useState(exp?.estId || job || "");
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
          <label className="f">{t("Date", "Fecha")}<DatePicker value={date} onChange={(v) => setDate(v)} /></label>
        </div>
        <label className="f">{t("Vendor", "Proveedor")}<input type="text" list="ex-vendors" value={vendor} onChange={(e) => setVendor(e.target.value)} onBlur={vendorDone} placeholder="Home Depot, Sherwin-Williams, Thumbtack…" />
          <datalist id="ex-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist></label>
        <div className="ex-fld"><span className="ex-lbl">{t("Category", "Categoría")}</span>
          <div className="pills">{cats.map((c) => <button key={c.id} type="button" className={"pill" + (category === c.id ? " on" : "")} onClick={() => setCategory(c.id)}>{es ? c.es : c.en}</button>)}</div></div>
        {isMarketingCat(category) && (
          <label className="f">{t("Which source is this for?", "¿De qué origen es?")}<select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="" />{sources.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>)}
        <div className="grid2">
          <label className="f">{t("Job (optional)", "Trabajo (opcional)")}<Combobox value={estId} onChange={setEstId} none={t("No job — business expense", "Sin trabajo — gasto del negocio")} placeholder={t("Search jobs…", "Buscar trabajos…")}
            options={jobs.map((j) => ({ value: j.id, label: j.label }))} /></label>
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
