import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../../i18n";
import { clone, stable } from "../../lib/settingsForm";
import { useUi } from "../../store/ui";
import { NumInput } from "../../ui/NumInput";

/** Local copy of a piece of settings. Follows the saved value until the person starts editing; `dirty` = differs from what is saved. */
export function useDraft<T>(source: T) {
  const key = stable(source);
  const [draft, setDraft] = useState<T>(() => clone(source));
  const base = useRef(key);
  useEffect(() => {
    if (key === base.current) return;
    const untouched = stable(draft) === base.current;
    base.current = key;
    if (untouched) setDraft(clone(source));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { draft, setDraft, dirty: stable(draft) !== key, reset: () => setDraft(clone(source)) };
}

/** Settings card with a Save footer. `save` returns an error text to show (and not save), or nothing when it worked. */
export function SaveCard({ title, hint, dirty, save, children, id, extraFoot }: {
  title: string; hint?: string; dirty: boolean; save: () => Promise<string | void> | string | void; children: ReactNode; id?: string; extraFoot?: ReactNode;
}) {
  const t = useT();
  const toast = useUi((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (dirty) setErr(""); }, [dirty]);
  async function go() {
    setErr(""); setBusy(true);
    try {
      const e = await save();
      if (e) setErr(e); else toast(t("Saved", "Guardado"));
    } catch { setErr(t("Could not save. Check your connection and try again.", "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.")); }
    finally { setBusy(false); }
  }
  return (
    <section className="card st-card" id={id}>
      <div className="card-h"><h2>{title}</h2>{hint && <span className="muted st-hint-h">{hint}</span>}</div>
      <div className="card-b">
        {children}
        <div className="st-foot">
          <button className="btn pri" disabled={busy || !dirty} onClick={go}>{busy ? t("Saving…", "Guardando…") : t("Save", "Guardar")}</button>
          {extraFoot}
          {dirty && !busy && <span className="st-dirty">{t("Unsaved changes", "Cambios sin guardar")}</span>}
          {err && <span className="st-err" role="alert">{err}</span>}
        </div>
      </div>
    </section>
  );
}

/** Plain-language helper line under a field or a block. */
export const Help = ({ children }: { children: ReactNode }) => <p className="muted st-help">{children}</p>;
export const Sub = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => <div className="st-sub"><span>{children}</span>{aside}</div>;
export const Grid = ({ children, wide }: { children: ReactNode; wide?: boolean }) => <div className={"st-grid" + (wide ? " wide" : "")}>{children}</div>;

export function Num({ label, help, value, onChange, step, style }: { label: string; help?: string; value: number; onChange(n: number): void; step?: string; style?: React.CSSProperties }) {
  return (
    <label className="f" style={style}>{label}
      <NumInput value={value} onChange={onChange} step={step} min={0} placeholder="0" />
      {help && <small className="st-fh">{help}</small>}
    </label>
  );
}
export function Txt({ label, help, value, onChange, placeholder, rows, upper }: { label: string; help?: string; value: string; onChange(v: string): void; placeholder?: string; rows?: number; upper?: boolean }) {
  return (
    <label className="f">{label}
      {rows ? <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <input value={value} placeholder={placeholder} style={upper ? { textTransform: "uppercase" } : undefined} onChange={(e) => onChange(e.target.value)} />}
      {help && <small className="st-fh">{help}</small>}
    </label>
  );
}
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return <label className="st-check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
export function Pills<V extends string>({ value, options, onChange }: { value: V; options: [V, string][]; onChange(v: V): void }) {
  return <div className="pills st-pills">{options.map(([v, l]) => <button key={v} type="button" className={"pill" + (value === v ? " on" : "")} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
/** Collapsible block inside a long card. */
export function Fold({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="st-fold" open={open}><summary>{title}</summary><div className="st-fold-b">{children}</div></details>;
}
